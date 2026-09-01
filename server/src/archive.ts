import { prisma } from "./db.js"
import { getTitleCards, placeholderCard } from "./title-cache.js"
import type { MediaType, TitleCard } from "./tmdb.js"

export type ListKind = "watchlist" | "watching" | "watched"

/// Everything the app knows about a saved title without asking TMDb. Small
/// enough that the whole archive ships in one response, which is what every
/// page needs for its "already saved" markers.
export type ArchiveEntry = {
  tmdbId: number
  mediaType: MediaType
  status: ListKind
  score: number | null
  note: string | null
  serial: string
  favorite: boolean
  progress: { season: number; episode: number } | null
  lastWatchedAt: string | null
  savedAt: string
  customListIds: string[]
}

/// An archive entry joined to its TMDb card. Only paginated views build these.
export type SavedTitle = TitleCard & ArchiveEntry

function serialOf(tmdbId: number) {
  return String(tmdbId).padStart(5, "0").slice(-5)
}

/// Diary dates are user-supplied. Accept anything Date understands, but refuse
/// the future and anything before film existed.
const EARLIEST_WATCH_DATE = Date.UTC(1888, 0, 1)

export function parseWatchedAt(value: unknown) {
  if (value == null || value === "") return { valid: true, watchedAt: undefined }
  if (typeof value !== "string") return { valid: false, watchedAt: undefined }
  const watchedAt = new Date(value)
  const time = watchedAt.getTime()
  if (Number.isNaN(time)) return { valid: false, watchedAt: undefined }
  // A day of slack keeps a viewer in a timezone ahead of the server from being
  // told their evening is in the future.
  if (time > Date.now() + 24 * 60 * 60 * 1000) {
    return { valid: false, watchedAt: undefined }
  }
  if (time < EARLIEST_WATCH_DATE) return { valid: false, watchedAt: undefined }
  return { valid: true, watchedAt }
}

export async function ensureDefaultLists(userId: string) {
  const existing = await prisma.list.findMany({ where: { userId } })
  const create: { name: string; type: ListKind }[] = []
  if (!existing.some((list) => list.type === "watchlist")) {
    create.push({ name: "Watchlist", type: "watchlist" })
  }
  if (!existing.some((list) => list.type === "watched")) {
    create.push({ name: "Watched", type: "watched" })
  }
  if (!existing.some((list) => list.type === "watching")) {
    create.push({ name: "Watching", type: "watching" })
  }
  if (create.length > 0) {
    await prisma.list.createMany({
      data: create.map((list) => ({ ...list, userId })),
      skipDuplicates: true,
    })
  }
  const lists = await prisma.list.findMany({ where: { userId } })
  const watchlist = lists.find((list) => list.type === "watchlist")
  const watching = lists.find((list) => list.type === "watching")
  const watched = lists.find((list) => list.type === "watched")
  if (!watchlist || !watching || !watched) throw new Error("Default lists missing")
  return { watchlist, watching, watched }
}

type ArchiveItem = {
  tmdbId: number
  mediaType: string
  status: ListKind
  addedAt?: Date
}

function refKey(tmdbId: number, mediaType: string) {
  return `${mediaType}-${tmdbId}`
}

/**
 * Joins a user's saved titles to their ratings, favorites, progress, custom
 * lists, and viewing history. Five queries regardless of archive size, and no
 * upstream traffic — callers that need artwork add it with `hydrateTitles`.
 */
export async function buildArchiveEntries(
  userId: string,
  items: ArchiveItem[],
): Promise<ArchiveEntry[]> {
  const [ratings, favorites, progress, watchEvents, customItems] = await Promise.all([
    prisma.rating.findMany({ where: { userId } }),
    prisma.favorite.findMany({ where: { userId } }),
    prisma.viewingProgress.findMany({ where: { userId } }),
    prisma.watchEvent.findMany({
      where: { userId },
      select: { tmdbId: true, mediaType: true, watchedAt: true },
    }),
    prisma.listItem.findMany({
      where: { list: { userId, type: "custom" } },
      select: { listId: true, tmdbId: true, mediaType: true },
    }),
  ])

  const ratingMap = new Map(
    ratings.map((rating) => [refKey(rating.tmdbId, rating.mediaType), rating]),
  )
  const favoriteKeys = new Set(
    favorites.map((favorite) => refKey(favorite.tmdbId, favorite.mediaType)),
  )
  const progressMap = new Map(
    progress.map((item) => [refKey(item.tmdbId, item.mediaType), item]),
  )
  const watchedAtByTitle = new Map(
    watchEvents.map((event) => [refKey(event.tmdbId, event.mediaType), event.watchedAt]),
  )
  const customListsByTitle = new Map<string, string[]>()
  for (const item of customItems) {
    const key = refKey(item.tmdbId, item.mediaType)
    const existing = customListsByTitle.get(key)
    if (existing) existing.push(item.listId)
    else customListsByTitle.set(key, [item.listId])
  }

  return items.map((item) => {
    const mediaType = item.mediaType as MediaType
    const key = refKey(item.tmdbId, item.mediaType)
    const rating = ratingMap.get(key)
    const titleProgress = progressMap.get(key)
    return {
      tmdbId: item.tmdbId,
      mediaType,
      status: item.status,
      score: item.status === "watched" ? (rating?.score ?? null) : null,
      note: item.status === "watched" ? (rating?.note ?? null) : null,
      serial: serialOf(item.tmdbId),
      favorite: favoriteKeys.has(key),
      // Validated against the show's real season list in `hydrateTitles`; on
      // its own this reports what the user last saved.
      progress: titleProgress
        ? { season: titleProgress.season, episode: titleProgress.episode }
        : null,
      lastWatchedAt: watchedAtByTitle.get(key)?.toISOString() ?? null,
      savedAt: (item.addedAt ?? new Date()).toISOString(),
      customListIds: customListsByTitle.get(key) ?? [],
    }
  })
}

/**
 * Archive entries joined to their TMDb cards. Cards come from the persistent
 * cache in one batch, so this costs one extra query for a warm archive.
 */
export async function hydrateTitles(
  userId: string,
  items: ArchiveItem[],
): Promise<SavedTitle[]> {
  return hydrateEntries(await buildArchiveEntries(userId, items))
}

/// The artwork half of `hydrateTitles`, for callers that already hold entries.
export async function hydrateEntries(
  entries: ArchiveEntry[],
): Promise<SavedTitle[]> {
  const cards = await getTitleCards(
    entries.map((entry) => ({ tmdbId: entry.tmdbId, mediaType: entry.mediaType })),
  )

  return entries.map((entry) => {
    const card =
      cards.get(refKey(entry.tmdbId, entry.mediaType)) ?? placeholderCard(entry)
    const seasonOptions = card.seasonOptions
    const progressSeason = seasonOptions.find(
      (option) => option.season === entry.progress?.season,
    )
    const validProgress =
      entry.progress &&
      progressSeason &&
      entry.progress.episode >= 1 &&
      entry.progress.episode <= progressSeason.episodeCount
        ? entry.progress
        : null
    return {
      ...card,
      ...entry,
      progress: validProgress,
    }
  })
}

export async function listArchiveItems(userId: string) {
  const { watchlist, watching, watched } = await ensureDefaultLists(userId)
  const items = await prisma.listItem.findMany({
    where: { listId: { in: [watchlist.id, watching.id, watched.id] } },
    orderBy: { addedAt: "desc" },
  })
  const rank: Record<ListKind, number> = { watchlist: 1, watching: 2, watched: 3 }
  const unique = new Map<string, { tmdbId: number; mediaType: string; status: ListKind; addedAt: Date }>()
  for (const item of items) {
    const status: ListKind =
      item.listId === watched.id
        ? "watched"
        : item.listId === watching.id
          ? "watching"
          : "watchlist"
    const key = `${item.mediaType}-${item.tmdbId}`
    const current = unique.get(key)
    if (current && rank[current.status] >= rank[status]) continue
    unique.set(key, {
      tmdbId: item.tmdbId,
      mediaType: item.mediaType,
      status,
      addedAt: item.addedAt,
    })
  }
  return [...unique.values()]
}

export async function savedOne(
  userId: string,
  tmdbId: number,
  mediaType: MediaType,
  status: ListKind,
): Promise<SavedTitle> {
  const [title] = await hydrateTitles(userId, [{ tmdbId, mediaType, status }])
  return title
}
