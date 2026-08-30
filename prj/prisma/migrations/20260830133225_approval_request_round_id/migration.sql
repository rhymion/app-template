-- cmd_874k: add approval_request.round_id with a safe 3-step backfill,
-- matching app-generator's own approval_request model (cmd_844,
-- scripts/migrations/03_approval_request_round_id_backfill.sql).
--
-- Backfill rule: round_id = id for every pre-existing row. Before this
-- column existed, every approval_request row was implicitly its own
-- independent "round" (no multistage flow ever created more than one row
-- per submission with a shared identity).

-- 1) Add the column nullable so the rewrite touches every existing row
--    without violating NOT NULL.
ALTER TABLE "approval_request"
  ADD COLUMN "round_id" TEXT;

-- 2) Backfill every existing row to its own id (each pre-existing row is
--    its own round).
UPDATE "approval_request"
   SET "round_id" = "id"
 WHERE "round_id" IS NULL;

-- 3) Lock in the invariant. After this point every approval_request row
--    belongs to an explicit round.
ALTER TABLE "approval_request"
  ALTER COLUMN "round_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "approval_request_round_id_idx" ON "approval_request"("round_id");
