-- Stage 3 (final) of the procurement rename (cmd_1072, Issue #111):
-- purchase_order_tmp -> sales_order, purchase_per_item -> sales_order_line.
-- Renamed together (parent + child) so the FK column rename
-- (purchase_order_id -> sales_order_id) and x-reservation.result.parentField
-- retarget land in one migration. Data-preserving RENAME throughout, not the
-- default DROP+CREATE `prisma migrate dev` proposed.

-- Enum
ALTER TYPE "PurchasePerItemStatus" RENAME TO "SalesOrderLineStatus";

-- Tables
ALTER TABLE "purchase_order_tmp" RENAME TO "sales_order";
ALTER TABLE "purchase_per_item" RENAME TO "sales_order_line";

-- Column
ALTER TABLE "sales_order_line" RENAME COLUMN "purchase_order_id" TO "sales_order_id";

-- sales_order (was purchase_order_tmp)
ALTER TABLE "sales_order" RENAME CONSTRAINT "purchase_order_tmp_pkey" TO "sales_order_pkey";
ALTER TABLE "sales_order" RENAME CONSTRAINT "purchase_order_tmp_creator_id_fkey" TO "sales_order_creator_id_fkey";
ALTER TABLE "sales_order" RENAME CONSTRAINT "purchase_order_tmp_customer_id_fkey" TO "sales_order_customer_id_fkey";
ALTER TABLE "sales_order" RENAME CONSTRAINT "purchase_order_tmp_updater_id_fkey" TO "sales_order_updater_id_fkey";
ALTER INDEX "purchase_order_tmp_creator_id_idx" RENAME TO "sales_order_creator_id_idx";
ALTER INDEX "purchase_order_tmp_customer_id_idx" RENAME TO "sales_order_customer_id_idx";
ALTER INDEX "purchase_order_tmp_updater_id_idx" RENAME TO "sales_order_updater_id_idx";

-- sales_order_line (was purchase_per_item)
ALTER TABLE "sales_order_line" RENAME CONSTRAINT "purchase_per_item_pkey" TO "sales_order_line_pkey";
-- approvable_id's unique constraint is a plain unique index here too (same
-- shape as stage 2's goods_receipt_line.approvable_id_key) -- ALTER INDEX,
-- not ALTER TABLE ... RENAME CONSTRAINT.
ALTER INDEX "purchase_per_item_approvable_id_key" RENAME TO "sales_order_line_approvable_id_key";
ALTER TABLE "sales_order_line" RENAME CONSTRAINT "purchase_per_item_approvable_id_fkey" TO "sales_order_line_approvable_id_fkey";
ALTER TABLE "sales_order_line" RENAME CONSTRAINT "purchase_per_item_creator_id_fkey" TO "sales_order_line_creator_id_fkey";
ALTER TABLE "sales_order_line" RENAME CONSTRAINT "purchase_per_item_inventory_id_fkey" TO "sales_order_line_inventory_id_fkey";
ALTER TABLE "sales_order_line" RENAME CONSTRAINT "purchase_per_item_inventory_transactionable_id_fkey" TO "sales_order_line_inventory_transactionable_id_fkey";
ALTER TABLE "sales_order_line" RENAME CONSTRAINT "purchase_per_item_inventory_transactionable_id_key" TO "sales_order_line_inventory_transactionable_id_key";
ALTER TABLE "sales_order_line" RENAME CONSTRAINT "purchase_per_item_parent_id_fkey" TO "sales_order_line_parent_id_fkey";
ALTER TABLE "sales_order_line" RENAME CONSTRAINT "purchase_per_item_product_id_fkey" TO "sales_order_line_product_id_fkey";
ALTER TABLE "sales_order_line" RENAME CONSTRAINT "purchase_per_item_purchase_order_id_fkey" TO "sales_order_line_sales_order_id_fkey";
ALTER TABLE "sales_order_line" RENAME CONSTRAINT "purchase_per_item_updater_id_fkey" TO "sales_order_line_updater_id_fkey";
ALTER INDEX "purchase_per_item_creator_id_idx" RENAME TO "sales_order_line_creator_id_idx";
ALTER INDEX "purchase_per_item_inventory_id_idx" RENAME TO "sales_order_line_inventory_id_idx";
ALTER INDEX "purchase_per_item_parent_id_idx" RENAME TO "sales_order_line_parent_id_idx";
ALTER INDEX "purchase_per_item_product_id_idx" RENAME TO "sales_order_line_product_id_idx";
ALTER INDEX "purchase_per_item_purchase_order_id_idx" RENAME TO "sales_order_line_sales_order_id_idx";
ALTER INDEX "purchase_per_item_updater_id_idx" RENAME TO "sales_order_line_updater_id_idx";

-- GIN trigram index (see stage 1/2 migrations for why IF EXISTS is a no-op
-- against an ephemeral `prisma db push` test DB but matters at deploy time).
ALTER INDEX IF EXISTS "idx_purchase_order_tmp_order_no_gin_trgm" RENAME TO "idx_sales_order_order_no_gin_trgm";
