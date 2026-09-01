-- Default collections are singleton state buckets. Consolidate any legacy
-- duplicates without dropping unique titles, then prevent them recurring.
CREATE TEMP TABLE "default_list_merge" (
    "duplicate_id" TEXT PRIMARY KEY,
    "keeper_id" TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO "default_list_merge" ("duplicate_id", "keeper_id")
SELECT "id", "keeper_id"
FROM (
    SELECT
        "id",
        FIRST_VALUE("id") OVER (
            PARTITION BY "user_id", "type"
            ORDER BY "created_at" ASC, "id" ASC
        ) AS "keeper_id",
        ROW_NUMBER() OVER (
            PARTITION BY "user_id", "type"
            ORDER BY "created_at" ASC, "id" ASC
        ) AS position
    FROM "lists"
    WHERE "type" <> 'custom'
) ranked
WHERE position > 1;

DELETE FROM "list_items" duplicate_item
USING "default_list_merge" merge
WHERE duplicate_item."list_id" = merge."duplicate_id"
  AND EXISTS (
      SELECT 1
      FROM "list_items" keeper_item
      WHERE keeper_item."list_id" = merge."keeper_id"
        AND keeper_item."tmdb_id" = duplicate_item."tmdb_id"
        AND keeper_item."media_type" = duplicate_item."media_type"
  );

UPDATE "list_items" item
SET "list_id" = merge."keeper_id"
FROM "default_list_merge" merge
WHERE item."list_id" = merge."duplicate_id";

DELETE FROM "lists" list
USING "default_list_merge" merge
WHERE list."id" = merge."duplicate_id";

CREATE UNIQUE INDEX IF NOT EXISTS "lists_user_id_default_type_key"
ON "lists"("user_id", "type")
WHERE "type" <> 'custom';

-- The API treats custom names case-insensitively. Match that rule in the
-- database so simultaneous create or rename requests cannot bypass it.
CREATE TEMP TABLE "custom_list_merge" (
    "duplicate_id" TEXT PRIMARY KEY,
    "keeper_id" TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO "custom_list_merge" ("duplicate_id", "keeper_id")
SELECT "id", "keeper_id"
FROM (
    SELECT
        "id",
        FIRST_VALUE("id") OVER (
            PARTITION BY "user_id", LOWER("name")
            ORDER BY "created_at" ASC, "id" ASC
        ) AS "keeper_id",
        ROW_NUMBER() OVER (
            PARTITION BY "user_id", LOWER("name")
            ORDER BY "created_at" ASC, "id" ASC
        ) AS position
    FROM "lists"
    WHERE "type" = 'custom'
) ranked
WHERE position > 1;

DELETE FROM "list_items" duplicate_item
USING "custom_list_merge" merge
WHERE duplicate_item."list_id" = merge."duplicate_id"
  AND EXISTS (
      SELECT 1
      FROM "list_items" keeper_item
      WHERE keeper_item."list_id" = merge."keeper_id"
        AND keeper_item."tmdb_id" = duplicate_item."tmdb_id"
        AND keeper_item."media_type" = duplicate_item."media_type"
  );

UPDATE "list_items" item
SET "list_id" = merge."keeper_id"
FROM "custom_list_merge" merge
WHERE item."list_id" = merge."duplicate_id";

DELETE FROM "lists" list
USING "custom_list_merge" merge
WHERE list."id" = merge."duplicate_id";

CREATE UNIQUE INDEX IF NOT EXISTS "lists_user_id_custom_name_key"
ON "lists"("user_id", LOWER("name"))
WHERE "type" = 'custom';
