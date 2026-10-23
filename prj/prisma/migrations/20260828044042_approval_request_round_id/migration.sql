-- cmd_856 Task III: catch up proj_c's approval_request schema with
-- app-generator's cmd_844 (#436) round_id column, missed by prior pointer
-- bumps. Adapted from app-generator's
-- scripts/migrations/03_approval_request_round_id_backfill.sql (production-
-- style 3-step backfill: add nullable, backfill round_id = id for every
-- pre-existing row so each one stays its own independent round, then lock
-- in NOT NULL).

BEGIN;

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

-- Supporting index: canSubmitForApproval/canWithdrawApproval and the
-- ApprovalSection UI both fetch "all rows of the current round" by
-- round_id.
CREATE INDEX IF NOT EXISTS "approval_request_round_id_idx"
  ON "approval_request"("round_id");

COMMIT;
