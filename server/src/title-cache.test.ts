import assert from "node:assert/strict"
import { after, test } from "node:test"
import { prisma } from "./db.js"
import { clearTitleCacheMemory, getTitleCards } from "./title-cache.js"
import type { TitleCard } from "./tmdb.js"

if (process.env.NODE_ENV === "production") {
  throw new Error("Refusing to run database tests in production")
}

after(async () => {
  await prisma.$disconnect()
})

function card(tmdbId: number, title: string): TitleCard {
  return {
    tmdbId,
    mediaType: "movie",
    title,
    year: 1999,
    runtime: "139 MIN",
    genre: "DRAMA",
    genres: ["DRAMA"],
    posterUrl: "https://image.tmdb.org/t/p/w342/poster.jpg",
    backdropUrl: null,
    voteAverage: 8.4,
    seasonOptions: [],
  }
}

async function seed(...cards: TitleCard[]) {
  await prisma.titleCache.createMany({
    data: cards.map((entry) => ({
      tmdbId: entry.tmdbId,
      mediaType: entry.mediaType,
      payload: entry as unknown as object,
    })),
    skipDuplicates: true,
  })
}

/**
 * Runs a block with TMDb made unreachable, so the assertions are about the
 * cache alone and never depend on the network or on which ids happen to exist
 * upstream.
 */
async function withoutTmdb<T>(run: () => Promise<T>) {
  const key = process.env.TMDB_API_KEY
  delete process.env.TMDB_API_KEY
  try {
    return await run()
  } finally {
    if (key === undefined) delete process.env.TMDB_API_KEY
    else process.env.TMDB_API_KEY = key
  }
}

/**
 * The point of the cache is that hydrating an archive costs one query rather
 * than one upstream request per title, so a warm archive must render with TMDb
 * entirely unavailable.
 */
test("fresh cached cards are served without touching TMDb", async () => {
  const ids = [999_101, 999_102, 999_103]
  clearTitleCacheMemory()
  try {
    await seed(...ids.map((id, index) => card(id, `Cached Title ${index}`)))

    const cards = await withoutTmdb(() =>
      getTitleCards(ids.map((id) => ({ tmdbId: id, mediaType: "movie" as const }))),
    )
    assert.equal(cards.size, 3)
    assert.equal(cards.get("movie-999101")?.title, "Cached Title 0")
    assert.equal(cards.get("movie-999103")?.title, "Cached Title 2")
  } finally {
    await prisma.titleCache.deleteMany({ where: { tmdbId: { in: ids } } })
  }
})

test("a repeated title is resolved once", async () => {
  const id = 999_104
  clearTitleCacheMemory()
  try {
    await seed(card(id, "Rewatched Title"))

    // A rewatched title appears on several diary rows; the batch must collapse
    // them rather than reading the same row repeatedly.
    const cards = await withoutTmdb(() =>
      getTitleCards(
        Array.from({ length: 5 }, () => ({ tmdbId: id, mediaType: "movie" as const })),
      ),
    )
    assert.equal(cards.size, 1)
    assert.equal(cards.get("movie-999104")?.title, "Rewatched Title")
  } finally {
    await prisma.titleCache.deleteMany({ where: { tmdbId: id } })
  }
})

test("an uncached title degrades to a placeholder instead of failing", async () => {
  clearTitleCacheMemory()
  const ref = { tmdbId: 999_105, mediaType: "movie" as const }
  // A previous run may have cached this id for real, and the assertion is
  // about an empty cache.
  await prisma.titleCache.deleteMany({ where: { tmdbId: ref.tmdbId } })
  const cards = await withoutTmdb(() => getTitleCards([ref]))
  const resolved = cards.get("movie-999105")
  // A missing card must never drop the row: the archive still lists the title.
  assert.ok(resolved, "every requested ref must resolve to something renderable")
  assert.equal(resolved!.tmdbId, ref.tmdbId)
  assert.equal(resolved!.title, "Untitled")
  assert.equal(resolved!.posterUrl, null)
})

test("a stale row is preferred over a placeholder when TMDb refuses", async () => {
  const id = 999_106
  clearTitleCacheMemory()
  try {
    await seed(card(id, "Stale But Real"))
    // Age the row past the freshness window so a refresh is attempted, then
    // make that refresh fail. The stale copy has to stand in.
    await prisma.titleCache.update({
      where: { tmdbId_mediaType: { tmdbId: id, mediaType: "movie" } },
      data: { fetchedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    })

    const cards = await withoutTmdb(() =>
      getTitleCards([{ tmdbId: id, mediaType: "movie" as const }]),
    )
    assert.equal(cards.get("movie-999106")?.title, "Stale But Real")
  } finally {
    await prisma.titleCache.deleteMany({ where: { tmdbId: id } })
  }
})
