import type { Request, Response } from "express"
import { readUserId } from "./auth.js"
import { prisma } from "./db.js"
import { getTitleCard, type MediaType, type TitleCard } from "./tmdb.js"
import {
  removeFromArchive,
  transitionToWatched,
  transitionToWatchlist,
  updateWatchedVerdict,
} from "./watch-state.js"

export type ListKind = "watchlist" | "watching" | "watched"

export type SavedTitle = TitleCard & {
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

function serialOf(tmdbId: number) {
  return String(tmdbId).padStart(5, "0").slice(-5)
}

export async function requireUser(req: Request, res: Response) {
  const userId = await readUserId(req)
  if (!userId) {
    res.status(401).json({ error: "Not logged in." })
    return null
  }
  return userId
}

function parseRef(body: { tmdbId?: unknown; mediaType?: unknown } | undefined) {
  if (typeof body?.tmdbId !== "number") return null
  const tmdbId = body.tmdbId
  const mediaType = body?.mediaType
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) return null
  if (mediaType !== "movie" && mediaType !== "tv") return null
  return { tmdbId, mediaType: mediaType as MediaType }
}

function parsePathRef(mediaType: string, id: string) {
  const tmdbId = Number(id)
  if (
    (mediaType !== "movie" && mediaType !== "tv") ||
    !Number.isSafeInteger(tmdbId) ||
    tmdbId <= 0
  ) {
    return null
  }
  return { tmdbId, mediaType: mediaType as MediaType }
}

function parseNote(value: unknown) {
  if (value == null || value === "") return { valid: true, note: null }
  if (typeof value !== "string") return { valid: false, note: null }
  const note = value.trim()
  if (note.length > 140) return { valid: false, note: null }
  return { valid: true, note: note || null }
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

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
) {
  const results: R[] = []
  let nextIndex = 0
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await mapper(items[index], index)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  )
  return results
}

export async function hydrateTitles(
  userId: string,
  items: {
    tmdbId: number
    mediaType: string
    status: ListKind
    addedAt?: Date
  }[],
): Promise<SavedTitle[]> {
  const [ratings, favorites, progress, watchEvents, customItems] = await Promise.all([
    prisma.rating.findMany({ where: { userId } }),
    prisma.favorite.findMany({ where: { userId } }),
    prisma.viewingProgress.findMany({ where: { userId } }),
    prisma.watchEvent.findMany({
      where: { userId },
      orderBy: { watchedAt: "desc" },
    }),
    prisma.listItem.findMany({
      where: { list: { userId, type: "custom" } },
      select: { listId: true, tmdbId: true, mediaType: true },
    }),
  ])
  const ratingKey = (tmdbId: number, mediaType: string) => `${mediaType}-${tmdbId}`
  const ratingMap = new Map(
    ratings.map((rating) => [ratingKey(rating.tmdbId, rating.mediaType), rating]),
  )
  const favoriteKeys = new Set(
    favorites.map((favorite) => ratingKey(favorite.tmdbId, favorite.mediaType)),
  )
  const progressMap = new Map(
    progress.map((item) => [ratingKey(item.tmdbId, item.mediaType), item]),
  )
  const eventsByTitle = new Map<string, typeof watchEvents>()
  for (const event of watchEvents) {
    const key = ratingKey(event.tmdbId, event.mediaType)
    eventsByTitle.set(key, [...(eventsByTitle.get(key) ?? []), event])
  }
  const customListsByTitle = new Map<string, string[]>()
  for (const item of customItems) {
    const key = ratingKey(item.tmdbId, item.mediaType)
    customListsByTitle.set(key, [...(customListsByTitle.get(key) ?? []), item.listId])
  }

  const cards = await mapWithConcurrency(
    items,
    8,
    async (item) => {
      const mediaType = item.mediaType as MediaType
      try {
        return await getTitleCard(mediaType, item.tmdbId)
      } catch {
        return {
          tmdbId: item.tmdbId,
          mediaType,
          title: "Untitled",
          year: null,
          runtime: "—",
          genre: mediaType.toUpperCase(),
          genres: [mediaType.toUpperCase()],
          posterUrl: null,
          backdropUrl: null,
          voteAverage: null,
          seasonOptions: [],
        } satisfies TitleCard
      }
    },
  )

  return cards.map((card, index) => {
    const status = items[index].status
    const key = ratingKey(card.tmdbId, card.mediaType)
    const rating = ratingMap.get(key)
    const titleEvents = eventsByTitle.get(key) ?? []
    const titleProgress = progressMap.get(key)
    const progressSeason = card.seasonOptions.find(
      (option) => option.season === titleProgress?.season,
    )
    const validProgress =
      titleProgress &&
      progressSeason &&
      titleProgress.episode >= 1 &&
      titleProgress.episode <= progressSeason.episodeCount
        ? { season: titleProgress.season, episode: titleProgress.episode }
        : null
    return {
      ...card,
      status,
      score: status === "watched" ? (rating?.score ?? null) : null,
      note: status === "watched" ? (rating?.note ?? null) : null,
      serial: serialOf(card.tmdbId),
      favorite: favoriteKeys.has(key),
      progress: validProgress,
      lastWatchedAt: titleEvents[0]?.watchedAt.toISOString() ?? null,
      savedAt: (items[index].addedAt ?? new Date()).toISOString(),
      customListIds: customListsByTitle.get(key) ?? [],
    }
  })
}

async function savedOne(
  userId: string,
  tmdbId: number,
  mediaType: MediaType,
  status: ListKind,
): Promise<SavedTitle> {
  const [title] = await hydrateTitles(userId, [{ tmdbId, mediaType, status }])
  return title
}

export async function listTitles(req: Request, res: Response) {
  const userId = await requireUser(req, res)
  if (!userId) return
  const { watchlist, watching, watched } = await ensureDefaultLists(userId)
  const items = await prisma.listItem.findMany({
    where: { listId: { in: [watchlist.id, watching.id, watched.id] } },
    orderBy: { addedAt: "desc" },
  })
  const rank: Record<ListKind, number> = { watchlist: 1, watching: 2, watched: 3 }
  const unique = new Map<string, (typeof items)[number] & { status: ListKind }>()
  for (const item of items) {
    const status: ListKind =
      item.listId === watched.id
        ? "watched"
        : item.listId === watching.id
          ? "watching"
          : "watchlist"
    const key = `${item.mediaType}-${item.tmdbId}`
    const current = unique.get(key)
    if (!current || rank[status] > rank[current.status]) unique.set(key, { ...item, status })
  }
  res.json(
    await hydrateTitles(
      userId,
      [...unique.values()].map((item) => ({
        tmdbId: item.tmdbId,
        mediaType: item.mediaType,
        status: item.status,
        addedAt: item.addedAt,
      })),
    ),
  )
}

export async function addToWatchlist(req: Request, res: Response) {
  const userId = await requireUser(req, res)
  if (!userId) return
  const ref = parseRef(req.body)
  if (!ref) {
    res.status(400).json({ error: "Bad title" })
    return
  }
  const { watchlist, watching, watched } = await ensureDefaultLists(userId)
  const status = await transitionToWatchlist(userId, ref, {
    watchlist: watchlist.id,
    watching: watching.id,
    watched: watched.id,
  })
  res
    .status(status === "watchlist" ? 201 : 200)
    .json(await savedOne(userId, ref.tmdbId, ref.mediaType, status))
}

export async function markWatched(req: Request, res: Response) {
  const userId = await requireUser(req, res)
  if (!userId) return
  const ref = parseRef(req.body)
  const score = typeof req.body?.score === "number" ? req.body.score : Number.NaN
  const parsedNote = parseNote(req.body?.note)
  if (
    !ref ||
    !Number.isInteger(score) ||
    score < 1 ||
    score > 10 ||
    !parsedNote.valid
  ) {
    res.status(400).json({
      error: parsedNote.valid
        ? "Choose a whole-number score from 1 to 10."
        : "Notes can contain up to 140 characters.",
    })
    return
  }
  const note = parsedNote.note
  const { watchlist, watching, watched } = await ensureDefaultLists(userId)
  await transitionToWatched(userId, ref, score, note, {
    watchlist: watchlist.id,
    watching: watching.id,
    watched: watched.id,
  })
  res.json(await savedOne(userId, ref.tmdbId, ref.mediaType, "watched"))
}

export async function removeTitle(req: Request, res: Response) {
  const userId = await requireUser(req, res)
  if (!userId) return
  const ref = parsePathRef(String(req.params.mediaType), String(req.params.id))
  if (!ref) {
    res.status(400).json({ error: "Bad title" })
    return
  }
  await removeFromArchive(userId, ref)
  res.status(204).end()
}

export async function rateTitle(req: Request, res: Response) {
  const userId = await requireUser(req, res)
  if (!userId) return
  const ref = parseRef(req.body)
  const score = typeof req.body?.score === "number" ? req.body.score : Number.NaN
  const parsedNote = parseNote(req.body?.note)
  if (
    !ref ||
    !Number.isInteger(score) ||
    score < 1 ||
    score > 10 ||
    !parsedNote.valid
  ) {
    res.status(400).json({
      error: parsedNote.valid
        ? "Score must be a whole number from 1 to 10."
        : "Notes can contain up to 140 characters.",
    })
    return
  }
  const note = parsedNote.note
  const { watched } = await ensureDefaultLists(userId)
  const item = await prisma.listItem.findUnique({
    where: {
      listId_tmdbId_mediaType: {
        listId: watched.id,
        tmdbId: ref.tmdbId,
        mediaType: ref.mediaType,
      },
    },
  })
  if (!item) {
    res.status(400).json({ error: "Mark watched before rating." })
    return
  }
  await updateWatchedVerdict(userId, ref, score, note)
  res.json(await savedOne(userId, ref.tmdbId, ref.mediaType, "watched"))
}
