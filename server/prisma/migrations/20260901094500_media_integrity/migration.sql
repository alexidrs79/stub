CREATE TYPE "MediaType" AS ENUM ('movie', 'tv');

ALTER TABLE "list_items"
ALTER COLUMN "media_type" TYPE "MediaType"
USING "media_type"::"MediaType";

ALTER TABLE "ratings"
ALTER COLUMN "media_type" TYPE "MediaType"
USING "media_type"::"MediaType";

ALTER TABLE "favorites"
ALTER COLUMN "media_type" TYPE "MediaType"
USING "media_type"::"MediaType";

ALTER TABLE "viewing_progress"
ALTER COLUMN "media_type" TYPE "MediaType"
USING "media_type"::"MediaType";

ALTER TABLE "watch_events"
ALTER COLUMN "media_type" TYPE "MediaType"
USING "media_type"::"MediaType";

ALTER TABLE "ratings"
ADD CONSTRAINT "ratings_score_range" CHECK ("score" BETWEEN 1 AND 10),
ADD CONSTRAINT "ratings_note_length" CHECK ("note" IS NULL OR char_length("note") <= 140);

ALTER TABLE "watch_events"
ADD CONSTRAINT "watch_events_score_range"
CHECK ("score" IS NULL OR "score" BETWEEN 1 AND 10),
ADD CONSTRAINT "watch_events_note_length"
CHECK ("note" IS NULL OR char_length("note") <= 140);

ALTER TABLE "viewing_progress"
ADD CONSTRAINT "viewing_progress_positive"
CHECK ("season" > 0 AND "episode" > 0);
