-- Rewatching is not part of the product model. Collapse any title that picked
-- up more than one stamp back to a single one, then restore the constraint.
--
-- The newest stamp is the keeper: while several were allowed, the verdict shown
-- everywhere in the app was derived from the most recent one, so keeping it
-- leaves every title displaying exactly what it displayed before this ran.
WITH ranked AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (
            PARTITION BY "user_id", "tmdb_id", "media_type"
            ORDER BY "watched_at" DESC, "id" DESC
        ) AS position
    FROM "watch_events"
)
DELETE FROM "watch_events"
WHERE "id" IN (
    SELECT "id"
    FROM ranked
    WHERE position > 1
);

DROP INDEX IF EXISTS "watch_events_user_id_tmdb_id_media_type_watched_at_idx";

CREATE UNIQUE INDEX "watch_events_user_id_tmdb_id_media_type_key"
ON "watch_events"("user_id", "tmdb_id", "media_type");
