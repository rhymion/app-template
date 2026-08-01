-- cmd_304 FIX-5: enforce 1 line = 1 bridge for inventory_transactionable owners.
-- Adds @unique to purchase_per_item.inventory_transactionable_id and
-- receiving_receipt_line.inventory_transactionable_id so Prisma generates
-- singular (not plural array) reverse relations, matching design intent
-- (docs/generic-primitives-redesign.md §O-2: each line gets its own fresh bridge).

-- AlterTable
ALTER TABLE "purchase_per_item" ADD CONSTRAINT "purchase_per_item_inventory_transactionable_id_key" UNIQUE ("inventory_transactionable_id");

-- AlterTable
ALTER TABLE "receiving_receipt_line" ADD CONSTRAINT "receiving_receipt_line_inventory_transactionable_id_key" UNIQUE ("inventory_transactionable_id");
