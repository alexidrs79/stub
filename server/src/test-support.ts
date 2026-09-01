import type { Express } from "express"
import { createApp } from "./app.js"
import { appConfig } from "./config.js"
import { prisma } from "./db.js"

if (process.env.NODE_ENV === "production") {
  throw new Error("Refusing to run database tests in production")
}

let cached: Express | null = null

/// One app instance across a test file. Building it is cheap but it registers
/// rate limiters, and sharing them is what the tests want to exercise anyway.
export async function testApp() {
  cached ??= await createApp(appConfig)
  return cached
}

export function uniqueEmail(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}@example.test`
}

/// Pulls the session cookie out of a Set-Cookie header for reuse on later
/// requests, since supertest does not keep a cookie jar between calls.
export function sessionCookie(headers: Record<string, unknown>) {
  const raw = headers["set-cookie"]
  const values = Array.isArray(raw) ? raw : raw ? [String(raw)] : []
  const stub = values.find((value) => value.startsWith("stub="))
  return stub ? stub.split(";")[0] : null
}

export async function deleteUsers(...emails: string[]) {
  await prisma.user.deleteMany({ where: { email: { in: emails } } })
}
