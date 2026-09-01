import type { Request, Response } from "express"
import {
  buildArchiveEntries,
  hydrateEntries,
  listArchiveItems,
  type ArchiveEntry,
} from "./archive.js"
import { requireUser } from "./auth.js"
import { getTitleCards } from "./title-cache.js"

const RECENT_LIMIT = 8
const HIGHLIGHT_LIMIT = 10
const GENRE_LIMIT = 6

function byRecency(a: ArchiveEntry, b: ArchiveEntry) {
  return (
    new Date(b.lastWatchedAt ?? b.savedAt).getTime() -
    new Date(a.lastWatchedAt ?? a.savedAt).getTime()
  )
}

/**
 * Taste aggregates over the whole archive. Counts and the score histogram come
 * from archive rows; the genre histogram reads the title cache in one batch.
 * Only the two short display lists are hydrated with artwork.
 */
export async function getProfileStats(req: Request, res: Response) {
  const userId = await requireUser(req, res)
  if (!userId) return

  const entries = await buildArchiveEntries(userId, await listArchiveItems(userId))
  const watched = entries.filter((entry) => entry.status === "watched")
  const favorites = entries.filter((entry) => entry.favorite)
  const rated = watched.filter((entry) => entry.score != null)

  const byScore: Record<number, number> = {}
  for (let score = 1; score <= 10; score += 1) byScore[score] = 0
  for (const entry of rated) {
    if (entry.score != null) byScore[entry.score] += 1
  }

  const cards = await getTitleCards(watched)
  const genreCounts = new Map<string, number>()
  for (const entry of watched) {
    const card = cards.get(`${entry.mediaType}-${entry.tmdbId}`)
    const names = card?.genres?.length ? card.genres : card?.genre ? [card.genre] : []
    for (const name of names) {
      genreCounts.set(name, (genreCounts.get(name) ?? 0) + 1)
    }
  }
  const genres = [...genreCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, GENRE_LIMIT)
    .map(([name, count]) => ({ name, count }))

  const recentEntries = [...watched].sort(byRecency).slice(0, RECENT_LIMIT)
  // Favorites are the more personal shelf; fall back to best-scored when the
  // user has not pinned anything yet.
  const highlightEntries = (
    favorites.length > 0
      ? [...favorites].sort(byRecency)
      : [...watched].sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
  ).slice(0, HIGHLIGHT_LIMIT)

  const [recent, highlights] = await Promise.all([
    hydrateEntries(recentEntries),
    hydrateEntries(highlightEntries),
  ])

  res.json({
    counts: {
      total: entries.length,
      watched: watched.length,
      watchlist: entries.filter((entry) => entry.status === "watchlist").length,
      watching: entries.filter((entry) => entry.status === "watching").length,
      favorites: favorites.length,
      rated: rated.length,
    },
    average:
      rated.length === 0
        ? null
        : rated.reduce((sum, entry) => sum + (entry.score ?? 0), 0) / rated.length,
    byScore,
    genres,
    recent,
    highlights,
  })
}
