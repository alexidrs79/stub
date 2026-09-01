-- Rewatching is part of the product model now. A title may hold many dated
-- viewings, so the one-event-per-title constraint from 20260901090000 goes.
DROP INDEX IF EXISTS "watch_events_user_id_tmdb_id_media_type_key";

-- Reading a title's viewing history is the diary's hot path.
CREATE INDEX IF NOT EXISTS "watch_events_user_id_tmdb_id_media_type_watched_at_idx"
ON "watch_events"("user_id", "tmdb_id", "media_type", "watched_at");

-- TMDb card data, persisted so hydrating an archive costs one query rather
-- than one upstream request per title.
CREATE TABLE IF NOT EXISTS "title_cache" (
    "tmdb_id" INTEGER NOT NULL,
    "media_type" "MediaType" NOT NULL,
    "payload" JSONB NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "title_cache_pkey" PRIMARY KEY ("tmdb_id", "media_type")
);

CREATE INDEX IF NOT EXISTS "title_cache_fetched_at_idx" ON "title_cache"("fetched_at");
