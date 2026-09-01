import { PrismaClient } from "@prisma/client"
import { config } from "dotenv"
import { resolve } from "node:path"

config({ path: resolve(import.meta.dirname, "../.env") })

const prisma = new PrismaClient()

type PrimaryState = "watchlist" | "watching" | "watched"

function refKey(mediaType: string, tmdbId: number) {
  return `${mediaType}-${tmdbId}`
}

async function repairUser(userId: string) {
  return prisma.$transaction(
    async (transaction) => {
      let lists = await transaction.list.findMany({ where: { userId } })
      for (const type of ["watchlist", "watching", "watched"] as const) {
        if (!lists.some((list) => list.type === type)) {
          await transaction.list.create({
            data: {
              userId,
              type,
              name:
                type === "watchlist"
                  ? "Watchlist"
                  : type === "watching"
                    ? "Watching"
                    : "Watched",
            },
          })
        }
      }
      lists = await transaction.list.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
      })

      const defaultLists = lists.filter((list) => list.type !== "custom")
      const listTypeById = new Map(defaultLists.map((list) => [list.id, list.type]))
      const primaryLists = {
        watchlist: defaultLists.find((list) => list.type === "watchlist")!,
        watching: defaultLists.find((list) => list.type === "watching")!,
        watched: defaultLists.find((list) => list.type === "watched")!,
      }
      const [items, events, progress] = await Promise.all([
        transaction.listItem.findMany({
          where: { listId: { in: defaultLists.map((list) => list.id) } },
          orderBy: { addedAt: "asc" },
        }),
        transaction.watchEvent.findMany({
          where: { userId },
          orderBy: { watchedAt: "asc" },
        }),
        transaction.viewingProgress.findMany({ where: { userId } }),
      ])

      const itemsByTitle = new Map<string, typeof items>()
      for (const item of items) {
        const key = refKey(item.mediaType, item.tmdbId)
        itemsByTitle.set(key, [...(itemsByTitle.get(key) ?? []), item])
      }
      const eventsByTitle = new Map<string, typeof events>()
      for (const event of events) {
        const key = refKey(event.mediaType, event.tmdbId)
        eventsByTitle.set(key, [...(eventsByTitle.get(key) ?? []), event])
      }
      const progressKeys = new Set(
        progress.map((item) => refKey(item.mediaType, item.tmdbId)),
      )
      const keys = new Set([...itemsByTitle.keys(), ...eventsByTitle.keys()])
      let repairedTitles = 0
      let createdEvents = 0

      for (const key of keys) {
        const titleItems = itemsByTitle.get(key) ?? []
        const titleEvents = eventsByTitle.get(key) ?? []
        const sample = titleItems[0] ?? titleEvents[0]
        if (!sample) continue

        const listedStates = new Set(
          titleItems.map((item) => listTypeById.get(item.listId)).filter(Boolean),
        )
        let desired: PrimaryState
        if (titleEvents.length > 0 || listedStates.has("watched")) {
          desired = "watched"
        } else if (listedStates.has("watching") || progressKeys.has(key)) {
          desired = "watching"
        } else {
          desired = "watchlist"
        }

        if (desired === "watched" && titleEvents.length === 0) {
          const watchedItem = titleItems.find(
            (item) => listTypeById.get(item.listId) === "watched",
          )
          await transaction.watchEvent.create({
            data: {
              userId,
              tmdbId: sample.tmdbId,
              mediaType: sample.mediaType,
              watchedAt: watchedItem?.addedAt ?? new Date(),
            },
          })
          createdEvents += 1
        }

        const desiredList = primaryLists[desired]
        const keeper = titleItems.find((item) => item.listId === desiredList.id)
        const removeIds = titleItems
          .filter((item) => item.id !== keeper?.id)
          .map((item) => item.id)
        if (removeIds.length > 0) {
          await transaction.listItem.deleteMany({ where: { id: { in: removeIds } } })
        }
        if (!keeper) {
          await transaction.listItem.create({
            data: {
              listId: desiredList.id,
              tmdbId: sample.tmdbId,
              mediaType: sample.mediaType,
              addedAt: titleItems[0]?.addedAt ?? titleEvents[0]?.watchedAt,
            },
          })
        }
        if (desired === "watched") {
          await transaction.viewingProgress.deleteMany({
            where: {
              userId,
              tmdbId: sample.tmdbId,
              mediaType: sample.mediaType,
            },
          })
        }
        if (
          removeIds.length > 0 ||
          !keeper ||
          (desired === "watched" && titleEvents.length === 0)
        ) {
          repairedTitles += 1
        }
      }

      return { repairedTitles, createdEvents }
    },
    { isolationLevel: "Serializable" },
  )
}

async function main() {
  const users = await prisma.user.findMany({ select: { id: true } })
  let repairedTitles = 0
  let createdEvents = 0
  for (const user of users) {
    const result = await repairUser(user.id)
    repairedTitles += result.repairedTitles
    createdEvents += result.createdEvents
  }
  console.log(
    JSON.stringify({
      users: users.length,
      repairedTitles,
      createdEvents,
    }),
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
