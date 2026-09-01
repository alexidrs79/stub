import type { Prisma } from "@prisma/client"
import { prisma } from "./db.js"
import { fetchTitleCard, type MediaType, type TitleCard } from "./tmdb.js"

export type TitleRef = { tmdbId: number; mediaType: MediaType }

type TitleCardFetcher = typeof fetchTitleCard
let fetchCard: TitleCardFetcher = fetchTitleCard

/// How long a stored card is served without asking TMDb again. Card data is
/// title, year, runtime, artwork and season counts — none of it moves often.
const FRESH_FOR = 7 * 24 * 60 * 60 * 1000

/// A short in-process layer in front of Postgres. It absorbs the repeated reads
/// a single request makes for the same title; Postgres is the real cache.
const MEMORY_TTL = 60 * 1000
const memory = new Map<string, { at: number; card: TitleCard }>()
const MEMORY_LIMIT = 2_000

/// How many misses are fetched from TMDb at once.
const FETCH_CONCURRENCY = 8

function keyOf(ref: TitleRef) {
  return `${ref.mediaType}-${ref.tmdbId}`
}

function rememberInMemory(card: TitleCard) {
  if (memory.size >= MEMORY_LIMIT) {
    // Cheap eviction: Map iterates in insertion order, so this drops the
    // oldest entries rather than tracking per-key access.
    for (const staleKey of [...memory.keys()].slice(0, MEMORY_LIMIT / 2)) {
      memory.delete(staleKey)
    }
  }
  memory.set(keyOf(card), { at: Date.now(), card })
}

export function placeholderCard(ref: TitleRef): TitleCard {
  return {
    tmdbId: ref.tmdbId,
    mediaType: ref.mediaType,
    title: "Untitled",
    year: null,
    runtime: "—",
    genre: ref.mediaType.toUpperCase(),
    genres: [ref.mediaType.toUpperCase()],
    posterUrl: null,
    backdropUrl: null,
    voteAverage: null,
    seasonOptions: [],
  }
}

async function store(card: TitleCard) {
  const payload = card as unknown as Prisma.InputJsonValue
  try {
    await prisma.titleCache.upsert({
      where: {
        tmdbId_mediaType: { tmdbId: card.tmdbId, mediaType: card.mediaType },
      },
      create: { tmdbId: card.tmdbId, mediaType: card.mediaType, payload },
      update: { payload, fetchedAt: new Date() },
    })
  } catch (error) {
    // A cache write is never worth failing the request over.
    console.error(
      "Title cache write failed:",
      error instanceof Error ? error.message : "Unknown error",
    )
  }
}

async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<void>,
) {
  let nextIndex = 0
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      await mapper(items[index])
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  )
}

/**
 * Resolves cards for many titles with one database round trip. Fresh rows are
 * served as-is, missing and expired ones are refreshed from TMDb, and an
 * expired row still serves if TMDb refuses — a stale poster beats a blank one.
 */
export async function getTitleCards(
  refs: TitleRef[],
): Promise<Map<string, TitleCard>> {
  const resolved = new Map<string, TitleCard>()
  const wanted = new Map<string, TitleRef>()
  const now = Date.now()

  for (const ref of refs) {
    const key = keyOf(ref)
    if (resolved.has(key) || wanted.has(key)) continue
    const hot = memory.get(key)
    if (hot && now - hot.at < MEMORY_TTL) {
      resolved.set(key, hot.card)
      continue
    }
    wanted.set(key, ref)
  }
  if (wanted.size === 0) return resolved

  let rows: { tmdbId: number; mediaType: string; payload: unknown; fetchedAt: Date }[] =
    []
  try {
    rows = await prisma.titleCache.findMany({
      where: { OR: [...wanted.values()] },
    })
  } catch (error) {
    console.error(
      "Title cache read failed:",
      error instanceof Error ? error.message : "Unknown error",
    )
  }

  const stale = new Map<string, TitleCard>()
  for (const row of rows) {
    const key = `${row.mediaType}-${row.tmdbId}`
    const card = row.payload as TitleCard
    if (now - row.fetchedAt.getTime() < FRESH_FOR) {
      resolved.set(key, card)
      rememberInMemory(card)
      wanted.delete(key)
    } else {
      stale.set(key, card)
    }
  }

  await mapWithConcurrency([...wanted.entries()], FETCH_CONCURRENCY, async ([key, ref]) => {
    try {
      const card = await fetchCard(ref.mediaType, ref.tmdbId)
      resolved.set(key, card)
      rememberInMemory(card)
      await store(card)
    } catch {
      resolved.set(key, stale.get(key) ?? placeholderCard(ref))
    }
  })

  return resolved
}

export async function getTitleCard(
  mediaType: MediaType,
  id: number,
): Promise<TitleCard> {
  const ref = { tmdbId: id, mediaType }
  const cards = await getTitleCards([ref])
  return cards.get(keyOf(ref)) ?? placeholderCard(ref)
}

/**
 * Like `getTitleCard`, but reports upstream failure instead of degrading to a
 * placeholder. Callers that validate against live data — season and episode
 * bounds, say — must not treat an empty placeholder as truth.
 */
async function requireTitleCard(
  mediaType: MediaType,
  id: number,
): Promise<TitleCard> {
  const key = keyOf({ tmdbId: id, mediaType })
  const hot = memory.get(key)
  if (hot && Date.now() - hot.at < MEMORY_TTL) return hot.card

  const row = await prisma.titleCache.findUnique({
    where: { tmdbId_mediaType: { tmdbId: id, mediaType } },
  })
  if (row && Date.now() - row.fetchedAt.getTime() < FRESH_FOR) {
    const card = row.payload as TitleCard
    rememberInMemory(card)
    return card
  }

  const card = await fetchCard(mediaType, id)
  rememberInMemory(card)
  await store(card)
  return card
}

/**
 * Always asks TMDb and replaces the stored card. Progress validation uses this
 * when a season or episode is missing from a still-fresh cache — weekly shows
 * add episodes faster than the seven-day window.
 */
async function refreshTitleCard(
  mediaType: MediaType,
  id: number,
): Promise<TitleCard> {
  const card = await fetchCard(mediaType, id)
  rememberInMemory(card)
  await store(card)
  return card
}

export function episodeFitsSeasonOptions(
  seasonOptions: TitleCard["seasonOptions"],
  season: number,
  episode: number,
) {
  const selected = seasonOptions.find((option) => option.season === season)
  if (!selected) {
    return {
      ok: false as const,
      error: "That season is not available for this show.",
    }
  }
  if (episode > selected.episodeCount) {
    return {
      ok: false as const,
      error: `Season ${season} has ${selected.episodeCount} episodes.`,
    }
  }
  return { ok: true as const }
}

/**
 * Season counts on a card can lag a currently airing show. Try the cache
 * first; if that episode is not listed, refetch once before rejecting.
 */
export async function requireSeasonOptionsForProgress(
  tmdbId: number,
  season: number,
  episode: number,
) {
  let card: TitleCard
  try {
    card = await requireTitleCard("tv", tmdbId)
  } catch {
    return {
      ok: false as const,
      status: 503 as const,
      error: "Episode data is unavailable. Try again before saving progress.",
    }
  }

  if (episodeFitsSeasonOptions(card.seasonOptions, season, episode).ok) {
    return { ok: true as const, seasonOptions: card.seasonOptions }
  }

  try {
    card = await refreshTitleCard("tv", tmdbId)
  } catch {
    return {
      ok: false as const,
      status: 503 as const,
      error: "Episode data is unavailable. Try again before saving progress.",
    }
  }

  const refreshed = episodeFitsSeasonOptions(card.seasonOptions, season, episode)
  if (refreshed.ok) {
    return { ok: true as const, seasonOptions: card.seasonOptions }
  }
  return { ok: false as const, status: 400 as const, error: refreshed.error }
}

/** Test seam. */
export function clearTitleCacheMemory() {
  memory.clear()
}

export function setTitleCardFetcherForTests(fn: TitleCardFetcher | null) {
  fetchCard = fn ?? fetchTitleCard
}
