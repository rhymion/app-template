-- cmd_562/cmd_569: inventory_transaction.location (denormalized string) -> location_id (id-FK).
-- See docs/knowledge/appendix/cmd562-location-id-fk-consumer-migration.md (app-generator submodule)
-- for the full design rationale and the ambiguity-classification review query.
--
-- Deviation from that doc's suggested two-phase rollout (add location_id,
-- keep the old `location` string column for one deploy cycle as a rollback
-- net, drop it in a later follow-up migration): this consumer's
-- inventory_transaction table holds zero real rows as of this migration
-- (re-verified 2026-08-05 — see subtask_569a report), so there is no
-- backfill data the rollback net would ever protect. json_schema.yaml and
-- schema.prisma (SoT) have already dropped the `location` field entirely
-- (see cmd_569 schema edits), so keeping the column here would only create
-- drift between migration history and schema.prisma with no offsetting
-- safety benefit. Add + backfill + drop are consolidated into this single
-- migration instead.
--
-- 1. Add the new nullable FK column.
ALTER TABLE "inventory_transaction" ADD COLUMN "location_id" TEXT;
ALTER TABLE "inventory_transaction"
  ADD CONSTRAINT "inventory_transaction_location_id_fkey"
  FOREIGN KEY ("location_id") REFERENCES "location"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "inventory_transaction_location_id_idx" ON "inventory_transaction"("location_id");

-- 2. Backfill ONLY unambiguous rows: a row whose string `location` value
--    matches exactly one `location.name` gets that location's id. Rows with
--    a NULL/empty string location correctly stay NULL (nothing to fill).
--    Rows with zero or multiple name matches are deliberately left NULL —
--    do not silently guess; resolve those by hand (see the review query in
--    cmd562-location-id-fk-consumer-migration.md §2 step 2), then re-run an
--    UPDATE ... WHERE location_id IS NULL for just those rows. Idempotent:
--    safe to re-run, already-filled rows are excluded by the WHERE guard.
WITH classified AS (
  SELECT it.id,
         CASE
           WHEN it.location IS NULL OR it.location = '' THEN 'safe_null'
           WHEN match_count = 1 THEN 'safe_unique_match'
           WHEN match_count = 0 THEN 'unmatched'
           ELSE 'ambiguous'
         END AS bucket,
         matched_ids
  FROM (
    SELECT it.id, it.location, count(l.id) AS match_count,
           array_agg(l.id) FILTER (WHERE l.id IS NOT NULL) AS matched_ids
    FROM inventory_transaction it
    LEFT JOIN location l
      ON l.name = it.location AND it.location IS NOT NULL AND it.location <> ''
    GROUP BY it.id, it.location
  ) it
)
UPDATE inventory_transaction it
SET location_id = c.matched_ids[1]
FROM classified c
WHERE it.id = c.id AND c.bucket = 'safe_unique_match' AND it.location_id IS NULL;

-- 3. Drop the now-redundant string column (see deviation note above — safe
--    only because zero rows exist to lose data from; re-verify row count
--    before ever reusing this migration.sql as a template against a
--    populated table).
ALTER TABLE "inventory_transaction" DROP COLUMN "location";
