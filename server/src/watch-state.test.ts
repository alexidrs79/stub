import assert from "node:assert/strict"
import { after, test } from "node:test"
import { prisma } from "./db.js"
import { ensureDefaultLists } from "./lists.js"
import {
  removeFromArchive,
  removeWatchEvent,
  transitionToWatching,
  transitionToWatched,
  transitionToWatchlist,
  updateWatchedVerdict,
} from "./watch-state.js"

if (process.env.NODE_ENV === "production") {
  throw new Error("Refusing to run database tests in production")
}

after(async () => {
  await prisma.$disconnect()
})

test("default collection creation is idempotent under concurrency", async () => {
  const user = await prisma.user.create({
    data: {
      email: `default-lists-${crypto.randomUUID()}@example.test`,
      displayName: "Default Lists Test",
      passwordHash: "not-used",
    },
  })

  try {
    await Promise.all(Array.from({ length: 8 }, () => ensureDefaultLists(user.id)))
    const lists = await prisma.list.groupBy({
      by: ["type"],
      where: { userId: user.id, type: { not: "custom" } },
      _count: true,
    })
    assert.deepEqual(
      lists
        .map((list) => [list.type, list._count] as const)
        .sort(([a], [b]) => a.localeCompare(b)),
      [
        ["watched", 1],
        ["watching", 1],
        ["watchlist", 1],
      ],
    )
  } finally {
    await prisma.user.delete({ where: { id: user.id } })
  }
})

test("watch history and primary collection state stay consistent", async () => {
  const user = await prisma.user.create({
    data: {
      email: `watch-state-${crypto.randomUUID()}@example.test`,
      displayName: "Watch State Test",
      passwordHash: "not-used",
    },
  })

  try {
    const [watchlist, watching, watched, custom] = await Promise.all([
      prisma.list.create({
        data: { userId: user.id, name: "Watchlist", type: "watchlist" },
      }),
      prisma.list.create({
        data: { userId: user.id, name: "Watching", type: "watching" },
      }),
      prisma.list.create({
        data: { userId: user.id, name: "Watched", type: "watched" },
      }),
      prisma.list.create({
        data: { userId: user.id, name: "Keepers", type: "custom" },
      }),
    ])
    const lists = {
      watchlist: watchlist.id,
      watching: watching.id,
      watched: watched.id,
    }
    const ref = { tmdbId: 999_991, mediaType: "movie" as const }

    await prisma.listItem.create({ data: { listId: watchlist.id, ...ref } })
    await prisma.listItem.create({ data: { listId: custom.id, ...ref } })
    await prisma.favorite.create({ data: { userId: user.id, ...ref } })

    await transitionToWatched(user.id, ref, 8, "Worth keeping.", lists)
    assert.equal(
      await prisma.listItem.count({
        where: { listId: { in: [watchlist.id, watching.id] }, ...ref },
      }),
      0,
    )
    assert.equal(
      await prisma.listItem.count({ where: { listId: watched.id, ...ref } }),
      1,
    )
    assert.equal(await prisma.watchEvent.count({ where: { userId: user.id, ...ref } }), 1)

    await transitionToWatched(user.id, ref, 9, "Updated verdict.", lists)
    const events = await prisma.watchEvent.findMany({
      where: { userId: user.id, ...ref },
    })
    assert.equal(events.length, 1)
    assert.equal(events[0].score, 9)
    assert.equal(events[0].note, "Updated verdict.")
    assert.equal(
      await prisma.rating.findFirst({ where: { userId: user.id, ...ref } }).then((row) => row?.score),
      9,
    )
    await updateWatchedVerdict(user.id, ref, 10, "Final verdict.")
    const [rating, diaryEvent] = await Promise.all([
      prisma.rating.findUnique({
        where: { userId_tmdbId_mediaType: { userId: user.id, ...ref } },
      }),
      prisma.watchEvent.findUnique({
        where: { userId_tmdbId_mediaType: { userId: user.id, ...ref } },
      }),
    ])
    assert.equal(rating?.score, 10)
    assert.equal(rating?.note, "Final verdict.")
    assert.equal(diaryEvent?.score, 10)
    assert.equal(diaryEvent?.note, "Final verdict.")

    const stranger = await prisma.user.create({
      data: {
        email: `watch-state-stranger-${crypto.randomUUID()}@example.test`,
        displayName: "Stranger",
        passwordHash: "not-used",
      },
    })
    assert.equal(await removeWatchEvent(stranger.id, events[0].id, lists), null)
    assert.equal(await prisma.watchEvent.count({ where: { id: events[0].id } }), 1)
    await prisma.user.delete({ where: { id: stranger.id } })

    const finalRemoval = await removeWatchEvent(user.id, events[0].id, lists)
    assert.deepEqual(finalRemoval, {
      eventId: events[0].id,
      remainingWatchCount: 0,
      status: "watchlist",
    })
    assert.equal(
      await prisma.listItem.count({ where: { listId: watchlist.id, ...ref } }),
      1,
    )
    assert.equal(await prisma.rating.count({ where: { userId: user.id, ...ref } }), 0)
    assert.equal(await prisma.favorite.count({ where: { userId: user.id, ...ref } }), 1)
    assert.equal(await prisma.listItem.count({ where: { listId: custom.id, ...ref } }), 1)

    const concurrentWatchlistRef = { tmdbId: 999_992, mediaType: "movie" as const }
    await Promise.all([
      transitionToWatchlist(user.id, concurrentWatchlistRef, lists),
      transitionToWatched(user.id, concurrentWatchlistRef, 7, null, lists),
    ])
    assert.equal(
      await prisma.listItem.count({
        where: {
          listId: { in: [watchlist.id, watching.id] },
          ...concurrentWatchlistRef,
        },
      }),
      0,
    )
    assert.equal(
      await prisma.listItem.count({
        where: { listId: watched.id, ...concurrentWatchlistRef },
      }),
      1,
    )

    const concurrentProgressRef = { tmdbId: 999_993, mediaType: "tv" as const }
    await Promise.all([
      transitionToWatching(user.id, concurrentProgressRef, 1, 1, lists),
      transitionToWatched(user.id, concurrentProgressRef, 9, null, lists),
    ])
    assert.equal(
      await prisma.listItem.count({
        where: {
          listId: { in: [watchlist.id, watching.id] },
          ...concurrentProgressRef,
        },
      }),
      0,
    )
    assert.equal(
      await prisma.viewingProgress.count({
        where: { userId: user.id, ...concurrentProgressRef },
      }),
      0,
    )

    await removeFromArchive(user.id, ref)
    assert.equal(await prisma.watchEvent.count({ where: { userId: user.id, ...ref } }), 0)
    assert.equal(await prisma.favorite.count({ where: { userId: user.id, ...ref } }), 0)
    assert.equal(
      await prisma.listItem.count({
        where: {
          list: { userId: user.id },
          ...ref,
        },
      }),
      0,
    )
  } finally {
    await prisma.user.delete({ where: { id: user.id } })
  }
})
