import type { Prisma } from "@prisma/client"
import { prisma } from "./db.js"
import type { MediaType } from "./tmdb.js"

type TitleRef = {
  tmdbId: number
  mediaType: MediaType
}

type DefaultListIds = {
  watchlist: string
  watching: string
  watched: string
}

async function lockTitle(
  transaction: Prisma.TransactionClient,
  userId: string,
  ref: TitleRef,
) {
  const titleKey = `${ref.mediaType}:${ref.tmdbId}`
  await transaction.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtext(${userId}), hashtext(${titleKey}))
  `
}

export async function transitionToWatchlist(
  userId: string,
  ref: TitleRef,
  lists: DefaultListIds,
) {
  return prisma.$transaction(async (transaction) => {
    await lockTitle(transaction, userId, ref)
    const existing = await transaction.listItem.findFirst({
      where: {
        listId: { in: [lists.watching, lists.watched] },
        ...ref,
      },
    })
    if (existing?.listId === lists.watched) return "watched" as const
    if (existing?.listId === lists.watching) return "watching" as const
    await transaction.listItem.upsert({
      where: {
        listId_tmdbId_mediaType: {
          listId: lists.watchlist,
          ...ref,
        },
      },
      create: { listId: lists.watchlist, ...ref },
      update: {},
    })
    return "watchlist" as const
  })
}

export async function transitionToWatching(
  userId: string,
  ref: TitleRef,
  season: number,
  episode: number,
  lists: DefaultListIds,
) {
  return prisma.$transaction(async (transaction) => {
    await lockTitle(transaction, userId, ref)
    const alreadyWatched = await transaction.listItem.findUnique({
      where: {
        listId_tmdbId_mediaType: {
          listId: lists.watched,
          ...ref,
        },
      },
    })
    if (alreadyWatched) return false
    await transaction.listItem.deleteMany({
      where: { listId: lists.watchlist, ...ref },
    })
    await transaction.listItem.upsert({
      where: {
        listId_tmdbId_mediaType: {
          listId: lists.watching,
          ...ref,
        },
      },
      create: { listId: lists.watching, ...ref },
      update: {},
    })
    await transaction.viewingProgress.upsert({
      where: { userId_tmdbId_mediaType: { userId, ...ref } },
      create: { userId, ...ref, season, episode },
      update: { season, episode },
    })
    return true
  })
}

export async function transitionToWatched(
  userId: string,
  ref: TitleRef,
  score: number,
  note: string | null,
  lists: DefaultListIds,
) {
  await prisma.$transaction(async (transaction) => {
    await lockTitle(transaction, userId, ref)
    await transaction.listItem.deleteMany({
      where: {
        listId: { in: [lists.watchlist, lists.watching] },
        ...ref,
      },
    })
    await transaction.listItem.upsert({
      where: {
        listId_tmdbId_mediaType: {
          listId: lists.watched,
          ...ref,
        },
      },
      create: { listId: lists.watched, ...ref },
      update: {},
    })
    await transaction.rating.upsert({
      where: { userId_tmdbId_mediaType: { userId, ...ref } },
      create: { userId, ...ref, score, note },
      update: { score, note },
    })
    await transaction.viewingProgress.deleteMany({ where: { userId, ...ref } })
    await transaction.watchEvent.upsert({
      where: { userId_tmdbId_mediaType: { userId, ...ref } },
      create: { userId, ...ref, score, note },
      update: { score, note },
    })
  })
}

export async function updateWatchedVerdict(
  userId: string,
  ref: TitleRef,
  score: number,
  note: string | null,
) {
  await prisma.$transaction(async (transaction) => {
    await lockTitle(transaction, userId, ref)
    await transaction.rating.upsert({
      where: { userId_tmdbId_mediaType: { userId, ...ref } },
      create: { userId, ...ref, score, note },
      update: { score, note },
    })
    await transaction.watchEvent.upsert({
      where: { userId_tmdbId_mediaType: { userId, ...ref } },
      create: { userId, ...ref, score, note },
      update: { score, note },
    })
  })
}

export async function removeFromArchive(userId: string, ref: TitleRef) {
  await prisma.$transaction(async (transaction) => {
    await lockTitle(transaction, userId, ref)
    const lists = await transaction.list.findMany({
      where: { userId },
      select: { id: true },
    })
    await transaction.listItem.deleteMany({
      where: { listId: { in: lists.map((list) => list.id) }, ...ref },
    })
    await transaction.rating.deleteMany({ where: { userId, ...ref } })
    await transaction.favorite.deleteMany({ where: { userId, ...ref } })
    await transaction.viewingProgress.deleteMany({ where: { userId, ...ref } })
    await transaction.watchEvent.deleteMany({ where: { userId, ...ref } })
  })
}

export async function removeWatchEvent(
  userId: string,
  eventId: string,
  lists: DefaultListIds,
) {
  return prisma.$transaction(
    async (transaction) => {
      const event = await transaction.watchEvent.findFirst({
        where: { id: eventId, userId },
      })
      if (!event) return null

      const ref = {
        tmdbId: event.tmdbId,
        mediaType: event.mediaType as MediaType,
      }
      await lockTitle(transaction, userId, ref)
      const currentEvent = await transaction.watchEvent.findFirst({
        where: { id: eventId, userId },
      })
      if (!currentEvent) return null
      await transaction.watchEvent.delete({ where: { id: currentEvent.id } })
      await transaction.listItem.deleteMany({
        where: {
          listId: { in: [lists.watching, lists.watched] },
          ...ref,
        },
      })
      await transaction.listItem.upsert({
        where: {
          listId_tmdbId_mediaType: {
            listId: lists.watchlist,
            ...ref,
          },
        },
        create: { listId: lists.watchlist, ...ref },
        update: {},
      })
      await transaction.rating.deleteMany({ where: { userId, ...ref } })
      return {
        eventId: event.id,
        remainingWatchCount: 0,
        status: "watchlist" as const,
      }
    },
    { isolationLevel: "Serializable" },
  )
}
