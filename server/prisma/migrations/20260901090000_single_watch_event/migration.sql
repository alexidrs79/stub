-- Rewatching is not part of the product model. Keep the first stamp for any
-- legacy duplicate, then enforce one diary event per user and title.
WITH ranked AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (
            PARTITION BY "user_id", "tmdb_id", "media_type"
            ORDER BY "watched_at" ASC, "id" ASC
        ) AS position
    FROM "watch_events"
)
DELETE FROM "watch_events"
WHERE "id" IN (
    SELECT "id"
    FROM ranked
    WHERE position > 1
);

CREATE UNIQUE INDEX "watch_events_user_id_tmdb_id_media_type_key"
ON "watch_events"("user_id", "tmdb_id", "media_type");
