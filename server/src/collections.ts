import { Prisma } from "@prisma/client"
import type { Request, Response } from "express"
import { prisma } from "./db.js"
import {
  ensureDefaultLists,
  hydrateTitles,
  type ListKind,
} from "./archive.js"
import { requireUser } from "./auth.js"
import { requireTitleCard } from "./title-cache.js"
import type { MediaType } from "./tmdb.js"
import {
  transitionToWatching,
  transitionToWatchlist,
} from "./watch-state.js"

function parseRef(
  body: { tmdbId?: unknown; mediaType?: unknown } | undefined,
  allowStringId = false,
) {
  if (
    typeof body?.tmdbId !== "number" &&
    !(allowStringId && typeof body?.tmdbId === "string")
  ) {
    return null
  }
  const tmdbId = Number(body.tmdbId)
  const mediaType = body?.mediaType
  if (!Number.isSafeInteger(tmdbId) || tmdbId <= 0) return null
  if (mediaType !== "movie" && mediaType !== "tv") return null
  return { tmdbId, mediaType: mediaType as MediaType }
}

function listName(value: unknown) {
  if (typeof value !== "string") return null
  const name = value.trim()
  return name.length >= 1 && name.length <= 40 ? name : null
}

function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  )
}

async function ownedCustomList(userId: string, id: string) {
  return prisma.list.findFirst({ where: { id, userId, type: "custom" } })
}

export async function listCollections(req: Request, res: Response) {
  const userId = await requireUser(req, res)
  if (!userId) return
  await ensureDefaultLists(userId)
  const lists = await prisma.list.findMany({
    where: { userId },
    orderBy: [{ type: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { items: true } } },
  })
  res.json(
    lists.map((list) => ({
      id: list.id,
      name: list.name,
      type: list.type,
      count: list._count.items,
    })),
  )
}

export async function createCollection(req: Request, res: Response) {
  const userId = await requireUser(req, res)
  if (!userId) return
  const name = listName(req.body?.name)
  if (!name) {
    res.status(400).json({ error: "List names need 1–40 characters." })
    return
  }
  const count = await prisma.list.count({ where: { userId, type: "custom" } })
  if (count >= 20) {
    res.status(400).json({ error: "You can keep up to 20 custom lists." })
    return
  }
  const duplicate = await prisma.list.findFirst({
    where: { userId, type: "custom", name: { equals: name, mode: "insensitive" } },
  })
  if (duplicate) {
    res.status(409).json({ error: "You already have a list with that name." })
    return
  }
  let list
  try {
    list = await prisma.list.create({ data: { userId, name, type: "custom" } })
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      res.status(409).json({ error: "You already have a list with that name." })
      return
    }
    throw error
  }
  res.status(201).json({ id: list.id, name: list.name, type: list.type, count: 0 })
}

export async function renameCollection(req: Request, res: Response) {
  const userId = await requireUser(req, res)
  if (!userId) return
  const list = await ownedCustomList(userId, String(req.params.id))
  const name = listName(req.body?.name)
  if (!list || !name) {
    res.status(404).json({ error: "List not found." })
    return
  }
  const duplicate = await prisma.list.findFirst({
    where: {
      userId,
      type: "custom",
      name: { equals: name, mode: "insensitive" },
      id: { not: list.id },
    },
  })
  if (duplicate) {
    res.status(409).json({ error: "You already have a list with that name." })
    return
  }
  let updated
  try {
    updated = await prisma.list.update({ where: { id: list.id }, data: { name } })
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      res.status(409).json({ error: "You already have a list with that name." })
      return
    }
    throw error
  }
  res.json({ id: updated.id, name: updated.name, type: updated.type })
}

export async function deleteCollection(req: Request, res: Response) {
  const userId = await requireUser(req, res)
  if (!userId) return
  const list = await ownedCustomList(userId, String(req.params.id))
  if (!list) {
    res.status(404).json({ error: "List not found." })
    return
  }
  await prisma.list.delete({ where: { id: list.id } })
  res.status(204).end()
}

export async function getCollection(req: Request, res: Response) {
  const userId = await requireUser(req, res)
  if (!userId) return
  const list = await ownedCustomList(userId, String(req.params.id))
  if (!list) {
    res.status(404).json({ error: "List not found." })
    return
  }
  const [items, defaults] = await Promise.all([
    prisma.listItem.findMany({ where: { listId: list.id }, orderBy: { addedAt: "desc" } }),
    ensureDefaultLists(userId),
  ])
  const defaultItems = await prisma.listItem.findMany({
    where: { listId: { in: [defaults.watchlist.id, defaults.watching.id, defaults.watched.id] } },
  })
  const statuses = new Map<string, ListKind>()
  const rank: Record<ListKind, number> = { watchlist: 1, watching: 2, watched: 3 }
  for (const item of defaultItems) {
    const status: ListKind =
      item.listId === defaults.watched.id
        ? "watched"
        : item.listId === defaults.watching.id
          ? "watching"
          : "watchlist"
    const key = `${item.mediaType}-${item.tmdbId}`
    const current = statuses.get(key)
    if (!current || rank[status] > rank[current]) statuses.set(key, status)
  }
  const titles = await hydrateTitles(
    userId,
    items.map((item) => ({
      tmdbId: item.tmdbId,
      mediaType: item.mediaType,
      status: statuses.get(`${item.mediaType}-${item.tmdbId}`) ?? "watchlist",
      addedAt: item.addedAt,
    })),
  )
  res.json({ id: list.id, name: list.name, type: list.type, titles })
}

export async function addCollectionTitle(req: Request, res: Response) {
  const userId = await requireUser(req, res)
  if (!userId) return
  const list = await ownedCustomList(userId, String(req.params.id))
  const ref = parseRef(req.body)
  if (!list || !ref) {
    res.status(404).json({ error: "List not found." })
    return
  }
  const defaults = await ensureDefaultLists(userId)
  await Promise.all([
    transitionToWatchlist(userId, ref, {
      watchlist: defaults.watchlist.id,
      watching: defaults.watching.id,
      watched: defaults.watched.id,
    }),
    prisma.listItem.upsert({
      where: {
        listId_tmdbId_mediaType: {
          listId: list.id,
          ...ref,
        },
      },
      create: { listId: list.id, ...ref },
      update: {},
    }),
  ])
  res.status(201).json({ ok: true })
}

export async function removeCollectionTitle(req: Request, res: Response) {
  const userId = await requireUser(req, res)
  if (!userId) return
  const list = await ownedCustomList(userId, String(req.params.id))
  const ref = parseRef(
    { tmdbId: req.params.tmdbId, mediaType: req.params.mediaType },
    true,
  )
  if (!list || !ref) {
    res.status(404).json({ error: "List not found." })
    return
  }
  await prisma.listItem.deleteMany({ where: { listId: list.id, ...ref } })
  res.status(204).end()
}

export async function setFavorite(req: Request, res: Response) {
  const userId = await requireUser(req, res)
  if (!userId) return
  const ref = parseRef(req.body)
  if (!ref) {
    res.status(400).json({ error: "Bad title." })
    return
  }
  const lists = await prisma.list.findMany({ where: { userId }, select: { id: true } })
  const saved = await prisma.listItem.findFirst({
    where: { listId: { in: lists.map((list) => list.id) }, ...ref },
  })
  if (!saved) {
    res.status(400).json({ error: "Save the title before pinning it." })
    return
  }
  await prisma.favorite.upsert({
    where: { userId_tmdbId_mediaType: { userId, ...ref } },
    create: { userId, ...ref },
    update: {},
  })
  res.status(201).json({ favorite: true })
}

export async function removeFavorite(req: Request, res: Response) {
  const userId = await requireUser(req, res)
  if (!userId) return
  const ref = parseRef(
    { tmdbId: req.params.tmdbId, mediaType: req.params.mediaType },
    true,
  )
  if (!ref) {
    res.status(400).json({ error: "Bad title." })
    return
  }
  await prisma.favorite.deleteMany({ where: { userId, ...ref } })
  res.status(204).end()
}

export async function updateProgress(req: Request, res: Response) {
  const userId = await requireUser(req, res)
  if (!userId) return
  const ref = parseRef(req.body)
  const season = typeof req.body?.season === "number" ? req.body.season : Number.NaN
  const episode = typeof req.body?.episode === "number" ? req.body.episode : Number.NaN
  if (
    !ref ||
    ref.mediaType !== "tv" ||
    !Number.isInteger(season) ||
    !Number.isInteger(episode) ||
    season < 1 ||
    episode < 1
  ) {
    res.status(400).json({ error: "Enter a valid season and episode." })
    return
  }
  let seasonOptions
  try {
    seasonOptions = (await requireTitleCard("tv", ref.tmdbId)).seasonOptions
  } catch {
    res.status(503).json({
      error: "Episode data is unavailable. Try again before saving progress.",
    })
    return
  }
  const selectedSeason = seasonOptions.find((option) => option.season === season)
  if (!selectedSeason) {
    res.status(400).json({ error: "That season is not available for this show." })
    return
  }
  if (episode > selectedSeason.episodeCount) {
    res.status(400).json({
      error: `Season ${season} has ${selectedSeason.episodeCount} episodes.`,
    })
    return
  }
  const { watchlist, watching, watched } = await ensureDefaultLists(userId)
  const updated = await transitionToWatching(userId, ref, season, episode, {
    watchlist: watchlist.id,
    watching: watching.id,
    watched: watched.id,
  })
  if (!updated) {
    res.status(400).json({
      error: "This show is already watched. Update your verdict instead.",
    })
    return
  }
  res.json(
    (
      await hydrateTitles(userId, [
        { ...ref, status: "watching" },
      ])
    )[0],
  )
}
