import type { Prisma } from "@prisma/client"
import { prisma } from "./db.js"
import { fetchTitleCard, type MediaType, type TitleCard } from "./tmdb.js"

export type TitleRef = { tmdbId: number; mediaType: MediaType }

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
      const card = await fetchTitleCard(ref.mediaType, ref.tmdbId)
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
export async function requireTitleCard(
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

  const card = await fetchTitleCard(mediaType, id)
  rememberInMemory(card)
  await store(card)
  return card
}

/** Test seam. */
export function clearTitleCacheMemory() {
  memory.clear()
}
