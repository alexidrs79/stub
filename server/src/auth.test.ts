import assert from "node:assert/strict"
import { after, test } from "node:test"
import request from "supertest"
import { prisma } from "./db.js"
import { deleteUsers, sessionCookie, testApp, uniqueEmail } from "./test-support.js"

after(async () => {
  await prisma.$disconnect()
})

const password = "correct horse battery"

async function signup(email: string) {
  const app = await testApp()
  const response = await request(app)
    .post("/api/auth/signup")
    .send({ email, password, displayName: "Test Viewer" })
  return { response, cookie: sessionCookie(response.headers) }
}

test("signup issues a session and creates the default collections", async () => {
  const email = uniqueEmail("signup")
  try {
    const { response, cookie } = await signup(email)
    assert.equal(response.status, 201)
    assert.equal(response.body.email, email)
    assert.ok(!("passwordHash" in response.body), "password hash must not be returned")
    assert.ok(cookie, "signup must set a session cookie")

    const setCookie = String(response.headers["set-cookie"])
    assert.match(setCookie, /HttpOnly/i)
    assert.match(setCookie, /SameSite=Lax/i)

    const me = await request(await testApp()).get("/api/auth/me").set("Cookie", cookie!)
    assert.equal(me.status, 200)
    assert.equal(me.body.email, email)

    const lists = await prisma.list.findMany({
      where: { user: { email } },
      select: { type: true },
    })
    assert.deepEqual(
      lists.map((list) => list.type).sort(),
      ["watched", "watching", "watchlist"],
    )
  } finally {
    await deleteUsers(email)
  }
})

test("signup rejects a duplicate email and weak input", async () => {
  const email = uniqueEmail("duplicate")
  const app = await testApp()
  try {
    await signup(email)
    const again = await request(app)
      .post("/api/auth/signup")
      .send({ email, password, displayName: "Impostor" })
    assert.equal(again.status, 409)

    const short = await request(app)
      .post("/api/auth/signup")
      .send({ email: uniqueEmail("short"), password: "tiny", displayName: "Tiny" })
    assert.equal(short.status, 400)

    const malformed = await request(app)
      .post("/api/auth/signup")
      .send({ email: "not-an-email", password, displayName: "Nobody" })
    assert.equal(malformed.status, 400)
  } finally {
    await deleteUsers(email)
  }
})

test("login refuses a wrong password without revealing which field failed", async () => {
  const email = uniqueEmail("login")
  const app = await testApp()
  try {
    await signup(email)

    const wrongPassword = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "not the password" })
    const unknownEmail = await request(app)
      .post("/api/auth/login")
      .send({ email: uniqueEmail("ghost"), password })

    assert.equal(wrongPassword.status, 401)
    assert.equal(unknownEmail.status, 401)
    assert.equal(wrongPassword.body.error, unknownEmail.body.error)
    assert.equal(sessionCookie(wrongPassword.headers), null)

    const good = await request(app).post("/api/auth/login").send({ email, password })
    assert.equal(good.status, 200)
    assert.ok(sessionCookie(good.headers))
  } finally {
    await deleteUsers(email)
  }
})

test("changing the password invalidates sessions issued before it", async () => {
  const email = uniqueEmail("rotate")
  const app = await testApp()
  try {
    const { cookie } = await signup(email)
    assert.ok(cookie)

    const before = await request(app).get("/api/auth/me").set("Cookie", cookie!)
    assert.equal(before.status, 200)

    const changed = await request(app)
      .put("/api/account/password")
      .set("Cookie", cookie!)
      .send({ currentPassword: password, newPassword: "a whole new passphrase" })
    assert.equal(changed.status, 204)

    // The old token still verifies cryptographically; the session version is
    // what retires it.
    const after = await request(app).get("/api/auth/me").set("Cookie", cookie!)
    assert.equal(after.status, 401)

    const refreshed = sessionCookie(changed.headers)
    assert.ok(refreshed, "the caller that changed the password stays signed in")
    const stillIn = await request(app).get("/api/auth/me").set("Cookie", refreshed!)
    assert.equal(stillIn.status, 200)
  } finally {
    await deleteUsers(email)
  }
})

test("a forged or absent session is rejected", async () => {
  const app = await testApp()

  const anonymous = await request(app).get("/api/titles/index")
  assert.equal(anonymous.status, 401)

  const garbage = await request(app)
    .get("/api/titles/index")
    .set("Cookie", "stub=not.a.real.token")
  assert.equal(garbage.status, 401)
})

test("account deletion needs the current password and clears the archive", async () => {
  const email = uniqueEmail("delete")
  const app = await testApp()
  try {
    const { cookie } = await signup(email)
    assert.ok(cookie)
    const user = await prisma.user.findUnique({ where: { email } })
    assert.ok(user)

    const wrong = await request(app)
      .delete("/api/account")
      .set("Cookie", cookie!)
      .send({ currentPassword: "guessing" })
    assert.equal(wrong.status, 400)
    assert.ok(await prisma.user.findUnique({ where: { email } }))

    const gone = await request(app)
      .delete("/api/account")
      .set("Cookie", cookie!)
      .send({ currentPassword: password })
    assert.equal(gone.status, 204)
    assert.equal(await prisma.user.findUnique({ where: { email } }), null)
    // Cascades, so nothing of the archive outlives the account.
    assert.equal(await prisma.list.count({ where: { userId: user!.id } }), 0)
  } finally {
    await deleteUsers(email)
  }
})

test("state-changing requests from a cross-site context are blocked", async () => {
  const email = uniqueEmail("csrf")
  const app = await testApp()
  try {
    const { cookie } = await signup(email)
    assert.ok(cookie)

    const crossSite = await request(app)
      .post("/api/lists")
      .set("Cookie", cookie!)
      .set("Sec-Fetch-Site", "cross-site")
      .send({ name: "Smuggled" })
    assert.equal(crossSite.status, 403)

    const foreignOrigin = await request(app)
      .post("/api/lists")
      .set("Cookie", cookie!)
      .set("Origin", "https://attacker.example")
      .send({ name: "Smuggled" })
    assert.equal(foreignOrigin.status, 403)

    assert.equal(await prisma.list.count({ where: { user: { email }, type: "custom" } }), 0)
  } finally {
    await deleteUsers(email)
  }
})
