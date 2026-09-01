ALTER TYPE "ListType" ADD VALUE IF NOT EXISTS 'watching' AFTER 'watchlist';

ALTER TABLE "ratings" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ratings" ALTER COLUMN "updated_at" DROP DEFAULT;

CREATE TABLE "favorites" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tmdb_id" INTEGER NOT NULL,
    "media_type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "viewing_progress" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tmdb_id" INTEGER NOT NULL,
    "media_type" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "episode" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "viewing_progress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "watch_events" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tmdb_id" INTEGER NOT NULL,
    "media_type" TEXT NOT NULL,
    "score" INTEGER,
    "note" TEXT,
    "watched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watch_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "favorites_user_id_tmdb_id_media_type_key"
ON "favorites"("user_id", "tmdb_id", "media_type");

CREATE UNIQUE INDEX "viewing_progress_user_id_tmdb_id_media_type_key"
ON "viewing_progress"("user_id", "tmdb_id", "media_type");

CREATE INDEX "watch_events_user_id_watched_at_idx"
ON "watch_events"("user_id", "watched_at");

CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key"
ON "password_reset_tokens"("token_hash");

CREATE INDEX "password_reset_tokens_user_id_idx"
ON "password_reset_tokens"("user_id");

ALTER TABLE "favorites"
ADD CONSTRAINT "favorites_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "viewing_progress"
ADD CONSTRAINT "viewing_progress_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "watch_events"
ADD CONSTRAINT "watch_events_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "password_reset_tokens"
ADD CONSTRAINT "password_reset_tokens_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "watch_events" ("id", "user_id", "tmdb_id", "media_type", "score", "note", "watched_at")
SELECT
    md5(li."id" || ':initial-watch'),
    l."user_id",
    li."tmdb_id",
    li."media_type",
    r."score",
    r."note",
    li."added_at"
FROM "list_items" li
JOIN "lists" l ON l."id" = li."list_id" AND l."type" = 'watched'
LEFT JOIN "ratings" r
    ON r."user_id" = l."user_id"
    AND r."tmdb_id" = li."tmdb_id"
    AND r."media_type" = li."media_type";
