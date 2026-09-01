import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import request from "supertest"
import { prisma } from "./db.js"
import { deleteUsers, sessionCookie, testApp, uniqueEmail } from "./test-support.js"
import { clearTitleCacheMemory, setTitleCardFetcherForTests } from "./title-cache.js"
import type { MediaType } from "./tmdb.js"

/// Paging hydrates artwork, so the tests stub TMDb rather than reach for it.
before(() => {
  clearTitleCacheMemory()
  setTitleCardFetcherForTests(async (mediaType: MediaType, tmdbId: number) => ({
    tmdbId,
    mediaType,
    title: `Title ${tmdbId}`,
    year: 2026,
    runtime: "100 MIN",
    genre: "DRAMA",
    genres: ["DRAMA"],
    posterUrl: null,
    backdropUrl: null,
    voteAverage: 7,
    seasonOptions: [],
  }))
})

after(async () => {
  setTitleCardFetcherForTests(null)
  await prisma.titleCache.deleteMany({ where: { tmdbId: { gte: 999_200, lt: 999_300 } } })
  await prisma.$disconnect()
})

async function makeUser(prefix: string) {
  const app = await testApp()
  const email = uniqueEmail(prefix)
  const response = await request(app)
    .post("/api/auth/signup")
    .send({ email, password: "correct horse battery", displayName: prefix })
  assert.equal(response.status, 201)
  const cookie = sessionCookie(response.headers)
  assert.ok(cookie)
  return { email, cookie: cookie! }
}

const ids = [999_201, 999_202, 999_203, 999_204, 999_205]

/**
 * A collection has to hand out every title exactly once as the reader walks
 * through it. Overlapping or dropped pages are the failure that matters here,
 * so the pages are reassembled and compared to the whole set.
 */
test("a custom list is handed out one page at a time with no gaps or repeats", async () => {
  const user = await makeUser("pager")
  const app = await testApp()

  try {
    const created = await request(app)
      .post("/api/lists")
      .set("Cookie", user.cookie)
      .send({ name: "Weekend queue" })
    assert.equal(created.status, 201)
    const listId = created.body.id as string

    for (const tmdbId of ids) {
      const added = await request(app)
        .post(`/api/lists/${listId}/titles`)
        .set("Cookie", user.cookie)
        .send({ tmdbId, mediaType: "movie" })
      assert.equal(added.status, 201)
    }

    const seen: number[] = []
    for (const page of [1, 2, 3]) {
      const response = await request(app)
        .get(`/api/titles?list=${listId}&page=${page}&pageSize=2`)
        .set("Cookie", user.cookie)
      assert.equal(response.status, 200)
      assert.equal(response.body.total, ids.length)
      assert.equal(response.body.hasMore, page < 3)
      assert.equal(response.body.titles.length, page < 3 ? 2 : 1)
      for (const title of response.body.titles) seen.push(title.tmdbId)
    }

    assert.deepEqual([...seen].sort(), [...ids].sort())

    const past = await request(app)
      .get(`/api/titles?list=${listId}&page=9&pageSize=2`)
      .set("Cookie", user.cookie)
    assert.equal(past.status, 200)
    assert.deepEqual(past.body.titles, [])
    assert.equal(past.body.hasMore, false)
  } finally {
    await deleteUsers(user.email)
  }
})

test("the watchlist view pages over the same titles", async () => {
  const user = await makeUser("pager-view")
  const app = await testApp()

  try {
    for (const tmdbId of ids) {
      await request(app)
        .post("/api/watchlist")
        .set("Cookie", user.cookie)
        .send({ tmdbId, mediaType: "movie" })
    }

    const first = await request(app)
      .get("/api/titles?view=watchlist&page=1&pageSize=3")
      .set("Cookie", user.cookie)
    assert.equal(first.status, 200)
    assert.equal(first.body.total, ids.length)
    assert.equal(first.body.titles.length, 3)
    assert.equal(first.body.hasMore, true)

    const second = await request(app)
      .get("/api/titles?view=watchlist&page=2&pageSize=3")
      .set("Cookie", user.cookie)
    assert.equal(second.body.titles.length, 2)
    assert.equal(second.body.hasMore, false)
  } finally {
    await deleteUsers(user.email)
  }
})

test("paging another user's list is refused rather than returned empty", async () => {
  const owner = await makeUser("pager-owner")
  const intruder = await makeUser("pager-intruder")
  const app = await testApp()

  try {
    const created = await request(app)
      .post("/api/lists")
      .set("Cookie", owner.cookie)
      .send({ name: "Private shelf" })
    assert.equal(created.status, 201)

    const stolen = await request(app)
      .get(`/api/titles?list=${created.body.id}`)
      .set("Cookie", intruder.cookie)
    assert.equal(stolen.status, 404)
  } finally {
    await deleteUsers(owner.email, intruder.email)
  }
})
