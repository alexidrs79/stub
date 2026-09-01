import bcrypt from "bcrypt"
import { Prisma } from "@prisma/client"
import type { CookieOptions, Request, Response } from "express"
import jwt from "jsonwebtoken"
import { prisma } from "./db.js"

const COOKIE = "stub"
const WEEK = 7 * 24 * 60 * 60 * 1000
const TOKEN_ISSUER = "stub"
const TOKEN_AUDIENCE = "stub-web"

type TokenPayload = { sub: string; ver: number }

function secret() {
  const value = process.env.JWT_SECRET
  if (!value) throw new Error("JWT_SECRET is missing")
  return value
}

function publicUser(user: { id: string; email: string; displayName: string }) {
  return { id: user.id, email: user.email, displayName: user.displayName }
}

function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: WEEK,
    path: "/",
  }
}

export function setAuthCookie(
  res: Response,
  user: { id: string; sessionVersion: number },
) {
  const token = jwt.sign(
    { sub: user.id, ver: user.sessionVersion } satisfies TokenPayload,
    secret(),
    {
      algorithm: "HS256",
      audience: TOKEN_AUDIENCE,
      expiresIn: "7d",
      issuer: TOKEN_ISSUER,
    },
  )
  res.cookie(COOKIE, token, cookieOptions())
}

export function clearAuthCookie(res: Response) {
  const { maxAge: _maxAge, ...options } = cookieOptions()
  res.clearCookie(COOKIE, options)
}

/**
 * Resolves the signed-in user, or null when the caller presents no usable
 * session. Only token problems count as "not signed in" — a database failure
 * propagates, because answering 401 to a transient outage would silently sign
 * every user out instead of reporting the fault.
 */
export async function readUserId(req: Request) {
  const token = req.cookies?.[COOKIE]
  if (typeof token !== "string" || !token) return null

  let payload: TokenPayload
  try {
    payload = jwt.verify(token, secret(), {
      algorithms: ["HS256"],
      audience: TOKEN_AUDIENCE,
      issuer: TOKEN_ISSUER,
    }) as TokenPayload
  } catch {
    return null
  }
  if (
    typeof payload.sub !== "string" ||
    !Number.isSafeInteger(payload.ver) ||
    payload.ver < 0
  ) {
    return null
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { sessionVersion: true },
  })
  // A password change bumps the version, retiring tokens issued before it.
  return user?.sessionVersion === payload.ver ? payload.sub : null
}

/**
 * Resolves the caller or answers 401. Returns null when it has already replied,
 * so a handler can bail with `if (!userId) return`.
 */
export async function requireUser(req: Request, res: Response) {
  const userId = await readUserId(req)
  if (!userId) {
    res.status(401).json({ error: "Not logged in." })
    return null
  }
  return userId
}

export async function signup(req: Request, res: Response) {
  const email =
    typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : ""
  const password = typeof req.body?.password === "string" ? req.body.password : ""
  const displayName =
    typeof req.body?.displayName === "string" ? req.body.displayName.trim() : ""

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    res.status(400).json({ error: "Enter a valid email." })
    return
  }
  if (password.length < 8 || password.length > 128) {
    res.status(400).json({ error: "Password needs 8–128 characters." })
    return
  }
  if (displayName.length < 1 || displayName.length > 40) {
    res.status(400).json({ error: "Enter a display name." })
    return
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    res.status(409).json({ error: "That email is already in use." })
    return
  }

  let user
  try {
    user = await prisma.user.create({
      data: {
        email,
        displayName,
        passwordHash: await bcrypt.hash(password, 10),
        lists: {
          create: [
            { name: "Watchlist", type: "watchlist" },
            { name: "Watching", type: "watching" },
            { name: "Watched", type: "watched" },
          ],
        },
      },
    })
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      res.status(409).json({ error: "That email is already in use." })
      return
    }
    throw error
  }
  setAuthCookie(res, user)
  res.status(201).json(publicUser(user))
}

export async function login(req: Request, res: Response) {
  const email =
    typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : ""
  const password = typeof req.body?.password === "string" ? req.body.password : ""
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254 ||
    password.length < 1 ||
    password.length > 128
  ) {
    res.status(401).json({ error: "Email or password is wrong." })
    return
  }
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    res.status(401).json({ error: "Email or password is wrong." })
    return
  }
  setAuthCookie(res, user)
  res.json(publicUser(user))
}

export function logout(_req: Request, res: Response) {
  clearAuthCookie(res)
  res.status(204).end()
}

export async function me(req: Request, res: Response) {
  const userId = await readUserId(req)
  if (!userId) {
    res.status(401).json({ error: "Not logged in." })
    return
  }
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) {
    res.status(401).json({ error: "Not logged in." })
    return
  }
  res.json(publicUser(user))
}
