-- cmd_564/cmd_569: generic invalidate mechanism.
-- `location`: newly opted in (x-generate.invalidate.enabled: true) — no
-- backfill needed, brand-new concept for this entity.
-- `user`: anonymize_user.ts now unconditionally co-sets invalidated_at
-- alongside anonymized_at for the pre-existing anonymizeUser handler — this
-- column is required regardless of the `location` opt-in decision above.
ALTER TABLE "location" ADD COLUMN "invalidated_at" TIMESTAMP;
ALTER TABLE "user" ADD COLUMN "invalidated_at" TIMESTAMP;
