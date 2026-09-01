import { Router } from "express"
import {
  addCollectionTitle,
  createCollection,
  deleteCollection,
  getCollection,
  listCollections,
  removeCollectionTitle,
  removeFavorite,
  renameCollection,
  setFavorite,
  updateProgress,
} from "../collections.js"
import { deleteDiaryEvent, listDiary, updateDiaryEvent } from "../diary.js"
import { route } from "../http.js"
import { getProfileStats } from "../profile.js"
import {
  addToWatchlist,
  listArchiveIndex,
  listTitles,
  markWatched,
  rateTitle,
  removeTitle,
} from "../lists.js"

export const archiveRoutes = Router()

// The index is every page's "already saved" lookup; /titles is one paged view.
archiveRoutes.get("/titles/index", route(listArchiveIndex))
archiveRoutes.get("/titles", route(listTitles))
archiveRoutes.post("/watchlist", route(addToWatchlist))
archiveRoutes.post("/watched", route(markWatched))
archiveRoutes.put("/ratings", route(rateTitle))
archiveRoutes.delete("/titles/:mediaType/:id", route(removeTitle))

archiveRoutes.get("/lists", route(listCollections))
archiveRoutes.post("/lists", route(createCollection))
archiveRoutes.get("/lists/:id", route(getCollection))
archiveRoutes.patch("/lists/:id", route(renameCollection))
archiveRoutes.delete("/lists/:id", route(deleteCollection))
archiveRoutes.post("/lists/:id/titles", route(addCollectionTitle))
archiveRoutes.delete("/lists/:id/titles/:mediaType/:tmdbId", route(removeCollectionTitle))

archiveRoutes.put("/favorites", route(setFavorite))
archiveRoutes.delete("/favorites/:mediaType/:tmdbId", route(removeFavorite))
archiveRoutes.put("/progress", route(updateProgress))

archiveRoutes.get("/profile/stats", route(getProfileStats))

archiveRoutes.get("/diary", route(listDiary))
archiveRoutes.patch("/diary/:eventId", route(updateDiaryEvent))
archiveRoutes.delete("/diary/:eventId", route(deleteDiaryEvent))
