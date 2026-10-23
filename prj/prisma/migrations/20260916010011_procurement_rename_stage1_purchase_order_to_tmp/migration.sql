-- Stage 1 of the procurement rename (cmd_1072, Issue #111): stash the
-- name "purchase_order" onto a temporary table so it can be reclaimed by
-- the incoming receiving_purchase_order in Stage 2 (name-swap avoidance).
-- Data-preserving RENAME, not the default DROP+CREATE `prisma migrate dev
-- --create-only` proposed (CLAUDE.md "migration適用...当てるな" — the
-- default proposal was reviewed and replaced by hand, not applied as-is).
-- purchase_per_item.purchase_order_id (FK column + its constraint name)
-- is intentionally left untouched in this stage — only the entity's own
-- identity moves; field-level churn is deferred to Stage 3.

ALTER TABLE "purchase_order" RENAME TO "purchase_order_tmp";

ALTER TABLE "purchase_order_tmp" RENAME CONSTRAINT "purchase_order_pkey" TO "purchase_order_tmp_pkey";
ALTER TABLE "purchase_order_tmp" RENAME CONSTRAINT "purchase_order_creator_id_fkey" TO "purchase_order_tmp_creator_id_fkey";
ALTER TABLE "purchase_order_tmp" RENAME CONSTRAINT "purchase_order_customer_id_fkey" TO "purchase_order_tmp_customer_id_fkey";
ALTER TABLE "purchase_order_tmp" RENAME CONSTRAINT "purchase_order_updater_id_fkey" TO "purchase_order_tmp_updater_id_fkey";

ALTER INDEX "purchase_order_creator_id_idx" RENAME TO "purchase_order_tmp_creator_id_idx";
ALTER INDEX "purchase_order_customer_id_idx" RENAME TO "purchase_order_tmp_customer_id_idx";
ALTER INDEX "purchase_order_updater_id_idx" RENAME TO "purchase_order_tmp_updater_id_idx";

-- purchase_per_item_purchase_order_id_fkey is named after the referencing
-- side (purchase_per_item), which is unaffected by this rename, so it
-- needs no rename here -- Postgres keeps the constraint intact and it
-- transparently now points at purchase_order_tmp.

-- GIN trigram index (scripts/create-gin-indexes.sql, applied out-of-band
-- via `psql -f` at deploy time -- not part of this migration chain and
-- not present in an ephemeral `prisma db push` test DB, but a deployed DB
-- will have it and must be renamed to avoid an orphaned duplicate once the
-- regenerated create-gin-indexes.sql creates the new name).
ALTER INDEX IF EXISTS "idx_purchase_order_order_no_gin_trgm" RENAME TO "idx_purchase_order_tmp_order_no_gin_trgm";
