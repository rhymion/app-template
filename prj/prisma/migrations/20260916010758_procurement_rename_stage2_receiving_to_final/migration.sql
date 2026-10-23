-- Stage 2 of the procurement rename (cmd_1072, Issue #111): receiving_purchase_order
-- / receiving_purchase_order_line / receiving_asn / receiving_asn_line /
-- receiving_receipt / receiving_receipt_line all move to their final names
-- (purchase_order / purchase_order_line / asn / asn_line / goods_receipt /
-- goods_receipt_line). purchase_order/purchase_order_line are free because
-- stage 1 moved the old purchase_order out of the way to purchase_order_tmp.
-- Data-preserving RENAME throughout, not the default DROP+CREATE `prisma
-- migrate dev --create-only` proposed (CLAUDE.md "migration適用...当てるな").

-- Enum types
ALTER TYPE "ReceivingPurchaseOrderStatus" RENAME TO "PurchaseOrderStatus";
ALTER TYPE "ReceivingPurchaseOrderLineStatus" RENAME TO "PurchaseOrderLineStatus";
ALTER TYPE "ReceivingAsnStatus" RENAME TO "AsnStatus";
ALTER TYPE "ReceivingAsnLineStatus" RENAME TO "AsnLineStatus";
ALTER TYPE "ReceivingReceiptStatus" RENAME TO "GoodsReceiptStatus";
ALTER TYPE "ReceivingReceiptLineStatus" RENAME TO "GoodsReceiptLineStatus";

-- Tables
ALTER TABLE "receiving_purchase_order" RENAME TO "purchase_order";
ALTER TABLE "receiving_purchase_order_line" RENAME TO "purchase_order_line";
ALTER TABLE "receiving_asn" RENAME TO "asn";
ALTER TABLE "receiving_asn_line" RENAME TO "asn_line";
ALTER TABLE "receiving_receipt" RENAME TO "goods_receipt";
ALTER TABLE "receiving_receipt_line" RENAME TO "goods_receipt_line";

-- Columns (FK columns only -- properties/$ref keys that were already short
-- like purchase_order_id/asn_id on asn/goods_receipt need no column rename,
-- only their constraint retargets automatically via the table renames above)
ALTER TABLE "purchase_order_line" RENAME COLUMN "receiving_purchase_order_id" TO "purchase_order_id";
ALTER TABLE "asn_line" RENAME COLUMN "receiving_asn_id" TO "asn_id";
ALTER TABLE "goods_receipt_line" RENAME COLUMN "receiving_receipt_id" TO "goods_receipt_id";

-- purchase_order (was receiving_purchase_order)
ALTER TABLE "purchase_order" RENAME CONSTRAINT "receiving_purchase_order_pkey" TO "purchase_order_pkey";
ALTER TABLE "purchase_order" RENAME CONSTRAINT "receiving_purchase_order_creator_id_fkey" TO "purchase_order_creator_id_fkey";
ALTER TABLE "purchase_order" RENAME CONSTRAINT "receiving_purchase_order_updater_id_fkey" TO "purchase_order_updater_id_fkey";
ALTER INDEX "receiving_purchase_order_creator_id_idx" RENAME TO "purchase_order_creator_id_idx";
ALTER INDEX "receiving_purchase_order_updater_id_idx" RENAME TO "purchase_order_updater_id_idx";

-- purchase_order_line (was receiving_purchase_order_line)
ALTER TABLE "purchase_order_line" RENAME CONSTRAINT "receiving_purchase_order_line_pkey" TO "purchase_order_line_pkey";
ALTER TABLE "purchase_order_line" RENAME CONSTRAINT "receiving_purchase_order_line_product_id_fkey" TO "purchase_order_line_product_id_fkey";
ALTER TABLE "purchase_order_line" RENAME CONSTRAINT "receiving_purchase_order_line_receiving_purchase_order_id_fkey" TO "purchase_order_line_purchase_order_id_fkey";
ALTER INDEX "receiving_purchase_order_line_product_id_idx" RENAME TO "purchase_order_line_product_id_idx";
ALTER INDEX "receiving_purchase_order_line_receiving_purchase_order_id_idx" RENAME TO "purchase_order_line_purchase_order_id_idx";

-- asn (was receiving_asn)
ALTER TABLE "asn" RENAME CONSTRAINT "receiving_asn_pkey" TO "asn_pkey";
ALTER TABLE "asn" RENAME CONSTRAINT "receiving_asn_creator_id_fkey" TO "asn_creator_id_fkey";
ALTER TABLE "asn" RENAME CONSTRAINT "receiving_asn_purchase_order_id_fkey" TO "asn_purchase_order_id_fkey";
ALTER TABLE "asn" RENAME CONSTRAINT "receiving_asn_updater_id_fkey" TO "asn_updater_id_fkey";
ALTER INDEX "receiving_asn_creator_id_idx" RENAME TO "asn_creator_id_idx";
ALTER INDEX "receiving_asn_purchase_order_id_idx" RENAME TO "asn_purchase_order_id_idx";
ALTER INDEX "receiving_asn_updater_id_idx" RENAME TO "asn_updater_id_idx";

-- asn_line (was receiving_asn_line)
ALTER TABLE "asn_line" RENAME CONSTRAINT "receiving_asn_line_pkey" TO "asn_line_pkey";
ALTER TABLE "asn_line" RENAME CONSTRAINT "receiving_asn_line_product_id_fkey" TO "asn_line_product_id_fkey";
ALTER TABLE "asn_line" RENAME CONSTRAINT "receiving_asn_line_receiving_asn_id_fkey" TO "asn_line_asn_id_fkey";
ALTER INDEX "receiving_asn_line_product_id_idx" RENAME TO "asn_line_product_id_idx";
ALTER INDEX "receiving_asn_line_receiving_asn_id_idx" RENAME TO "asn_line_asn_id_idx";

-- goods_receipt (was receiving_receipt)
ALTER TABLE "goods_receipt" RENAME CONSTRAINT "receiving_receipt_pkey" TO "goods_receipt_pkey";
ALTER TABLE "goods_receipt" RENAME CONSTRAINT "receiving_receipt_asn_id_fkey" TO "goods_receipt_asn_id_fkey";
ALTER TABLE "goods_receipt" RENAME CONSTRAINT "receiving_receipt_creator_id_fkey" TO "goods_receipt_creator_id_fkey";
ALTER TABLE "goods_receipt" RENAME CONSTRAINT "receiving_receipt_purchase_order_id_fkey" TO "goods_receipt_purchase_order_id_fkey";
ALTER TABLE "goods_receipt" RENAME CONSTRAINT "receiving_receipt_updater_id_fkey" TO "goods_receipt_updater_id_fkey";
ALTER INDEX "receiving_receipt_asn_id_idx" RENAME TO "goods_receipt_asn_id_idx";
ALTER INDEX "receiving_receipt_creator_id_idx" RENAME TO "goods_receipt_creator_id_idx";
ALTER INDEX "receiving_receipt_purchase_order_id_idx" RENAME TO "goods_receipt_purchase_order_id_idx";
ALTER INDEX "receiving_receipt_updater_id_idx" RENAME TO "goods_receipt_updater_id_idx";

-- goods_receipt_line (was receiving_receipt_line)
ALTER TABLE "goods_receipt_line" RENAME CONSTRAINT "receiving_receipt_line_pkey" TO "goods_receipt_line_pkey";
-- approvable_id's unique constraint was created as a plain unique index
-- (not a table constraint) in its original migration, unlike
-- inventory_transactionable_id_key below -- ALTER INDEX is required here,
-- ALTER TABLE ... RENAME CONSTRAINT errors with "constraint ... does not exist".
ALTER INDEX "receiving_receipt_line_approvable_id_key" RENAME TO "goods_receipt_line_approvable_id_key";
ALTER TABLE "goods_receipt_line" RENAME CONSTRAINT "receiving_receipt_line_approvable_id_fkey" TO "goods_receipt_line_approvable_id_fkey";
ALTER TABLE "goods_receipt_line" RENAME CONSTRAINT "receiving_receipt_line_assignee_id_fkey" TO "goods_receipt_line_assignee_id_fkey";
ALTER TABLE "goods_receipt_line" RENAME CONSTRAINT "receiving_receipt_line_creator_id_fkey" TO "goods_receipt_line_creator_id_fkey";
ALTER TABLE "goods_receipt_line" RENAME CONSTRAINT "receiving_receipt_line_inventory_id_fkey" TO "goods_receipt_line_inventory_id_fkey";
ALTER TABLE "goods_receipt_line" RENAME CONSTRAINT "receiving_receipt_line_inventory_transactionable_id_fkey" TO "goods_receipt_line_inventory_transactionable_id_fkey";
ALTER TABLE "goods_receipt_line" RENAME CONSTRAINT "receiving_receipt_line_inventory_transactionable_id_key" TO "goods_receipt_line_inventory_transactionable_id_key";
ALTER TABLE "goods_receipt_line" RENAME CONSTRAINT "receiving_receipt_line_parent_id_fkey" TO "goods_receipt_line_parent_id_fkey";
ALTER TABLE "goods_receipt_line" RENAME CONSTRAINT "receiving_receipt_line_product_id_fkey" TO "goods_receipt_line_product_id_fkey";
ALTER TABLE "goods_receipt_line" RENAME CONSTRAINT "receiving_receipt_line_receiving_receipt_id_fkey" TO "goods_receipt_line_goods_receipt_id_fkey";
ALTER TABLE "goods_receipt_line" RENAME CONSTRAINT "receiving_receipt_line_updater_id_fkey" TO "goods_receipt_line_updater_id_fkey";
ALTER INDEX "receiving_receipt_line_assignee_id_idx" RENAME TO "goods_receipt_line_assignee_id_idx";
ALTER INDEX "receiving_receipt_line_creator_id_idx" RENAME TO "goods_receipt_line_creator_id_idx";
ALTER INDEX "receiving_receipt_line_inventory_id_idx" RENAME TO "goods_receipt_line_inventory_id_idx";
ALTER INDEX "receiving_receipt_line_parent_id_idx" RENAME TO "goods_receipt_line_parent_id_idx";
ALTER INDEX "receiving_receipt_line_product_id_idx" RENAME TO "goods_receipt_line_product_id_idx";
ALTER INDEX "receiving_receipt_line_receiving_receipt_id_idx" RENAME TO "goods_receipt_line_goods_receipt_id_idx";
ALTER INDEX "receiving_receipt_line_updater_id_idx" RENAME TO "goods_receipt_line_updater_id_idx";

-- GIN trigram indexes (scripts/create-gin-indexes.sql, applied out-of-band
-- via `psql -f` at deploy time -- see stage 1's migration for why these are
-- IF EXISTS no-ops against an ephemeral `prisma db push` test DB).
ALTER INDEX IF EXISTS "idx_receiving_purchase_order_order_no_gin_trgm" RENAME TO "idx_purchase_order_order_no_gin_trgm";
ALTER INDEX IF EXISTS "idx_receiving_asn_asn_no_gin_trgm" RENAME TO "idx_asn_asn_no_gin_trgm";
ALTER INDEX IF EXISTS "idx_receiving_receipt_receipt_no_gin_trgm" RENAME TO "idx_goods_receipt_receipt_no_gin_trgm";
