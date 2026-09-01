import assert from "node:assert/strict"
import { after, test } from "node:test"
import request from "supertest"
import { prisma } from "./db.js"
import { deleteUsers, sessionCookie, testApp, uniqueEmail } from "./test-support.js"

after(async () => {
  await prisma.$disconnect()
})

const password = "correct horse battery"

async function makeUser(prefix: string) {
  const app = await testApp()
  const email = uniqueEmail(prefix)
  const response = await request(app)
    .post("/api/auth/signup")
    .send({ email, password, displayName: prefix })
  assert.equal(response.status, 201)
  const cookie = sessionCookie(response.headers)
  assert.ok(cookie)
  return { email, cookie: cookie!, id: response.body.id as string }
}

/**
 * Every owner-scoped resource must be invisible and untouchable to anyone else.
 * A leak here is the worst failure this app can have, so each verb is checked
 * rather than trusting one representative route.
 */
test("one user cannot read or change another user's custom list", async () => {
  const owner = await makeUser("owner")
  const intruder = await makeUser("intruder")
  const app = await testApp()

  try {
    const created = await request(app)
      .post("/api/lists")
      .set("Cookie", owner.cookie)
      .send({ name: "Owner's shelf" })
    assert.equal(created.status, 201)
    const listId = created.body.id as string

    const attempts = [
      request(app).get(`/api/lists/${listId}`).set("Cookie", intruder.cookie),
      request(app)
        .patch(`/api/lists/${listId}`)
        .set("Cookie", intruder.cookie)
        .send({ name: "Stolen" }),
      request(app)
        .post(`/api/lists/${listId}/titles`)
        .set("Cookie", intruder.cookie)
        .send({ tmdbId: 550, mediaType: "movie" }),
      request(app)
        .delete(`/api/lists/${listId}/titles/movie/550`)
        .set("Cookie", intruder.cookie),
      request(app).delete(`/api/lists/${listId}`).set("Cookie", intruder.cookie),
    ]
    for (const attempt of attempts) {
      const response = await attempt
      assert.equal(
        response.status,
        404,
        `${response.request.method} ${response.request.url} leaked another user's list`,
      )
    }

    // The list is untouched and still belongs to its owner.
    const stillThere = await prisma.list.findUnique({ where: { id: listId } })
    assert.equal(stillThere?.name, "Owner's shelf")
    assert.equal(stillThere?.userId, owner.id)

    const intruderLists = await request(app).get("/api/lists").set("Cookie", intruder.cookie)
    assert.equal(intruderLists.status, 200)
    assert.ok(
      !intruderLists.body.some((list: { id: string }) => list.id === listId),
      "another user's list must not appear in the collection index",
    )
  } finally {
    await deleteUsers(owner.email, intruder.email)
  }
})

test("one user cannot delete another user's diary stamp", async () => {
  const owner = await makeUser("diary-owner")
  const intruder = await makeUser("diary-intruder")
  const app = await testApp()

  try {
    const ref = { tmdbId: 999_996, mediaType: "movie" as const }
    const event = await prisma.watchEvent.create({
      data: { userId: owner.id, ...ref, score: 8 },
    })

    const stolenDelete = await request(app)
      .delete(`/api/diary/${event.id}`)
      .set("Cookie", intruder.cookie)
    assert.equal(stolenDelete.status, 404)

    const stolenEdit = await request(app)
      .patch(`/api/diary/${event.id}`)
      .set("Cookie", intruder.cookie)
      .send({ score: 1 })
    assert.equal(stolenEdit.status, 404)

    const untouched = await prisma.watchEvent.findUnique({ where: { id: event.id } })
    assert.equal(untouched?.score, 8)

    const intruderDiary = await request(app).get("/api/diary").set("Cookie", intruder.cookie)
    assert.equal(intruderDiary.status, 200)
    assert.equal(intruderDiary.body.events.length, 0)
  } finally {
    await deleteUsers(owner.email, intruder.email)
  }
})

test("the archive index only ever contains the caller's own titles", async () => {
  const owner = await makeUser("archive-owner")
  const intruder = await makeUser("archive-intruder")
  const app = await testApp()

  try {
    const lists = await prisma.list.findFirst({
      where: { userId: owner.id, type: "watchlist" },
    })
    assert.ok(lists)
    await prisma.listItem.create({
      data: { listId: lists!.id, tmdbId: 999_997, mediaType: "movie" },
    })

    const ownerIndex = await request(app)
      .get("/api/titles/index")
      .set("Cookie", owner.cookie)
    assert.equal(ownerIndex.status, 200)
    assert.equal(ownerIndex.body.length, 1)
    assert.equal(ownerIndex.body[0].tmdbId, 999_997)

    const intruderIndex = await request(app)
      .get("/api/titles/index")
      .set("Cookie", intruder.cookie)
    assert.equal(intruderIndex.status, 200)
    assert.deepEqual(intruderIndex.body, [])
  } finally {
    await deleteUsers(owner.email, intruder.email)
  }
})

test("every owner-scoped route refuses an anonymous caller", async () => {
  const app = await testApp()
  const routes: [string, string][] = [
    ["get", "/api/titles/index"],
    ["get", "/api/titles"],
    ["get", "/api/lists"],
    ["get", "/api/diary"],
    ["get", "/api/profile/stats"],
    ["post", "/api/watchlist"],
    ["post", "/api/watched"],
    ["put", "/api/ratings"],
    ["put", "/api/favorites"],
    ["put", "/api/progress"],
  ]

  for (const [method, path] of routes) {
    const response = await (request(app) as never as Record<
      string,
      (path: string) => request.Test
    >)[method](path).send({})
    assert.equal(response.status, 401, `${method.toUpperCase()} ${path} was not guarded`)
  }
})
