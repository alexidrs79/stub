import bcrypt from "bcrypt"
import { createHash, randomBytes } from "node:crypto"
import type { Request, Response } from "express"
import {
  clearAuthCookie,
  readUserId,
  setAuthCookie,
} from "./auth.js"
import { prisma } from "./db.js"

const recoveryAttempts = new Map<string, number>()
const RESET_WINDOW = 60_000
const RESET_TTL = 60 * 60 * 1000

function password(value: unknown) {
  return typeof value === "string" ? value : ""
}

function passwordError(value: string) {
  if (value.length < 8) return "Password needs at least 8 characters."
  if (value.length > 128) return "Password is too long."
  return null
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

function publicUser(user: { id: string; email: string; displayName: string }) {
  return { id: user.id, email: user.email, displayName: user.displayName }
}

async function authenticatedUserId(req: Request, res: Response) {
  const userId = await readUserId(req)
  if (!userId) {
    res.status(401).json({ error: "Not logged in." })
    return null
  }
  return userId
}

async function sendResetEmail(email: string, token: string) {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM
  const appUrl = process.env.APP_URL
  if (!apiKey || !from || !appUrl) throw new Error("Password recovery is not configured")
  const url = new URL("/reset-password", appUrl)
  url.hash = new URLSearchParams({ token }).toString()
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Reset your Stub password",
      html: `
        <div style="background:#0f1220;color:#edeae2;padding:32px;font-family:Arial,sans-serif">
          <p style="color:#e8a33d;font-size:12px;letter-spacing:.12em">STUB · PASSWORD RESET</p>
          <h1 style="font-size:30px;font-weight:500">Back to the programme</h1>
          <p style="color:#9a96a8;line-height:1.6">Use this link within one hour to choose a new password.</p>
          <p><a href="${url.toString()}" style="display:inline-block;background:#e8a33d;color:#0f1220;padding:12px 18px;text-decoration:none">Reset password</a></p>
          <p style="color:#9a96a8;font-size:12px">If you did not request this, you can ignore this email.</p>
        </div>
      `,
    }),
  })
  if (!response.ok) throw new Error("Recovery email could not be sent")
}

export async function updateProfile(req: Request, res: Response) {
  const userId = await authenticatedUserId(req, res)
  if (!userId) return
  const displayName =
    typeof req.body?.displayName === "string" ? req.body.displayName.trim() : ""
  if (displayName.length < 1 || displayName.length > 40) {
    res.status(400).json({ error: "Display name needs 1–40 characters." })
    return
  }
  const user = await prisma.user.update({ where: { id: userId }, data: { displayName } })
  res.json(publicUser(user))
}

export async function changePassword(req: Request, res: Response) {
  const userId = await authenticatedUserId(req, res)
  if (!userId) return
  const currentPassword = password(req.body?.currentPassword)
  const nextPassword = password(req.body?.newPassword)
  const validation = passwordError(nextPassword)
  if (validation) {
    res.status(400).json({ error: validation })
    return
  }
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    res.status(400).json({ error: "Current password is wrong." })
    return
  }
  if (await bcrypt.compare(nextPassword, user.passwordHash)) {
    res.status(400).json({ error: "Choose a different password." })
    return
  }
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: await bcrypt.hash(nextPassword, 10),
      sessionVersion: { increment: 1 },
    },
  })
  setAuthCookie(res, updated)
  res.status(204).end()
}

export async function deleteAccount(req: Request, res: Response) {
  const userId = await authenticatedUserId(req, res)
  if (!userId) return
  const currentPassword = password(req.body?.currentPassword)
  if (!currentPassword || currentPassword.length > 128) {
    res.status(400).json({ error: "Enter your current password." })
    return
  }
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    res.status(400).json({ error: "Current password is wrong." })
    return
  }
  await prisma.user.delete({ where: { id: userId } })
  clearAuthCookie(res)
  res.status(204).end()
}

export async function forgotPassword(req: Request, res: Response) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM || !process.env.APP_URL) {
    res.status(503).json({ error: "Password recovery is not configured." })
    return
  }
  await prisma.passwordResetToken.deleteMany({
    where: { expiresAt: { lte: new Date() } },
  })
  const email =
    typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : ""
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    res.status(400).json({ error: "Enter a valid email." })
    return
  }
  if (recoveryAttempts.size > 1000) {
    const cutoff = Date.now() - RESET_WINDOW
    for (const [key, attemptedAt] of recoveryAttempts) {
      if (attemptedAt < cutoff) recoveryAttempts.delete(key)
    }
  }
  const throttleKey = `${req.ip}:${email}`
  const previous = recoveryAttempts.get(throttleKey) ?? 0
  if (Date.now() - previous < RESET_WINDOW) {
    res.status(202).json({ ok: true })
    return
  }
  recoveryAttempts.set(throttleKey, Date.now())
  const user = await prisma.user.findUnique({ where: { email } })
  if (user) {
    const token = randomBytes(32).toString("base64url")
    const record = await prisma.$transaction(async (transaction) => {
      await transaction.passwordResetToken.deleteMany({ where: { userId: user.id } })
      return transaction.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: tokenHash(token),
          expiresAt: new Date(Date.now() + RESET_TTL),
        },
      })
    })
    try {
      await sendResetEmail(user.email, token)
    } catch (error) {
      await prisma.passwordResetToken.delete({ where: { id: record.id } })
      console.error(
        "Password reset email delivery failed:",
        error instanceof Error ? error.message : "Unknown error",
      )
    }
  }
  res.status(202).json({ ok: true })
}

export async function resetPassword(req: Request, res: Response) {
  const token = typeof req.body?.token === "string" ? req.body.token : ""
  const nextPassword = password(req.body?.password)
  const validation = passwordError(nextPassword)
  if (!token || token.length > 256 || validation) {
    res.status(400).json({ error: validation ?? "Reset link is invalid." })
    return
  }
  const reset = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: tokenHash(token) },
  })
  if (!reset || reset.expiresAt <= new Date()) {
    if (reset) await prisma.passwordResetToken.delete({ where: { id: reset.id } })
    res.status(400).json({ error: "Reset link is invalid or expired." })
    return
  }
  const passwordHash = await bcrypt.hash(nextPassword, 10)
  const changed = await prisma.$transaction(async (transaction) => {
    const claimed = await transaction.passwordResetToken.deleteMany({
      where: { id: reset.id, expiresAt: { gt: new Date() } },
    })
    if (claimed.count !== 1) return false
    await transaction.user.update({
      where: { id: reset.userId },
      data: {
        passwordHash,
        sessionVersion: { increment: 1 },
      },
    })
    await transaction.passwordResetToken.deleteMany({
      where: { userId: reset.userId },
    })
    return true
  })
  if (!changed) {
    res.status(400).json({ error: "Reset link is invalid or expired." })
    return
  }
  res.status(204).end()
}
