import type { Request, Response } from "express"
import {
  ensureDefaultLists,
  hydrateTitles,
  parseWatchedAt,
  type ListKind,
} from "./archive.js"
import { requireUser } from "./auth.js"
import { prisma } from "./db.js"
import { parseNote, parsePage, parseScore } from "./http.js"
import { editWatchEvent, removeWatchEvent } from "./watch-state.js"

const DIARY_PAGE_SIZE = 25

export async function listDiary(req: Request, res: Response) {
  const userId = await requireUser(req, res)
  if (!userId) return
  const month = String(req.query.month ?? "")
  const match = /^(\d{4})-(\d{2})$/.exec(month)
  let watchedAt: { gte: Date; lt: Date } | undefined
  if (month && !match) {
    res.status(400).json({ error: "Use a YYYY-MM month." })
    return
  }
  if (match) {
    const year = Number(match[1])
    const monthIndex = Number(match[2]) - 1
    if (monthIndex < 0 || monthIndex > 11) {
      res.status(400).json({ error: "Use a valid month." })
      return
    }
    watchedAt = {
      gte: new Date(Date.UTC(year, monthIndex, 1)),
      lt: new Date(Date.UTC(year, monthIndex + 1, 1)),
    }
  }

  const page = parsePage(req.query.page)
  if (page == null) {
    res.status(400).json({ error: "Bad page." })
    return
  }

  const where = { userId, watchedAt }
  const [total, events] = await Promise.all([
    prisma.watchEvent.count({ where }),
    prisma.watchEvent.findMany({
      where,
      orderBy: [{ watchedAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * DIARY_PAGE_SIZE,
      take: DIARY_PAGE_SIZE,
    }),
  ])

  const titles = await hydrateTitles(
    userId,
    events.map((event) => ({
      tmdbId: event.tmdbId,
      mediaType: event.mediaType,
      status: "watched" as ListKind,
      addedAt: event.watchedAt,
    })),
  )

  res.json({
    events: events.map((event, index) => ({
      id: event.id,
      watchedAt: event.watchedAt.toISOString(),
      score: event.score,
      note: event.note,
      title: titles[index],
    })),
    page,
    pageSize: DIARY_PAGE_SIZE,
    total,
    hasMore: (page - 1) * DIARY_PAGE_SIZE + events.length < total,
  })
}

/// Revises one diary entry. Score, note, and date are each optional so the
/// client can send only what changed.
export async function updateDiaryEvent(req: Request, res: Response) {
  const userId = await requireUser(req, res)
  if (!userId) return
  const eventId = String(req.params.eventId)

  const changes: { score?: number; note?: string | null; watchedAt?: Date } = {}
  if (req.body?.score !== undefined) {
    const score = parseScore(req.body.score)
    if (score == null) {
      res.status(400).json({ error: "Choose a whole-number score from 1 to 10." })
      return
    }
    changes.score = score
  }
  if (req.body?.note !== undefined) {
    const parsed = parseNote(req.body.note)
    if (!parsed.valid) {
      res.status(400).json({ error: "Notes can contain up to 140 characters." })
      return
    }
    changes.note = parsed.note
  }
  if (req.body?.watchedAt !== undefined) {
    const parsed = parseWatchedAt(req.body.watchedAt)
    if (!parsed.valid || !parsed.watchedAt) {
      res.status(400).json({ error: "Enter a watch date that is not in the future." })
      return
    }
    changes.watchedAt = parsed.watchedAt
  }
  if (Object.keys(changes).length === 0) {
    res.status(400).json({ error: "Nothing to change." })
    return
  }

  const result = await editWatchEvent(userId, eventId, changes)
  if (!result) {
    res.status(404).json({ error: "Diary stamp not found." })
    return
  }
  const [title] = await hydrateTitles(userId, [
    { tmdbId: result.tmdbId, mediaType: result.mediaType, status: "watched" },
  ])
  const event = await prisma.watchEvent.findFirst({
    where: { id: result.eventId, userId },
  })
  if (!event) {
    res.status(404).json({ error: "Diary stamp not found." })
    return
  }
  res.json({
    id: event.id,
    watchedAt: event.watchedAt.toISOString(),
    score: event.score,
    note: event.note,
    title,
  })
}

export async function deleteDiaryEvent(req: Request, res: Response) {
  const userId = await requireUser(req, res)
  if (!userId) return
  const eventId = String(req.params.eventId)
  const { watchlist, watching, watched } = await ensureDefaultLists(userId)
  const result = await removeWatchEvent(userId, eventId, {
    watchlist: watchlist.id,
    watching: watching.id,
    watched: watched.id,
  })
  if (!result) {
    res.status(404).json({ error: "Diary stamp not found." })
    return
  }
  res.json(result)
}
