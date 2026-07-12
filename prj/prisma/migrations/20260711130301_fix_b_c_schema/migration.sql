-- cmd_305 FIX-B + FIX-C: schema additions for split-child lot selection and
-- rejection reason classification.
-- FIX-B (B-1): purchase_per_item.inventory_id — optional per-part lot selection
--   for split children (unspecified falls back to auto-allocate; see
--   docs/reservation-split-approval-reject-design.md).
-- FIX-C (C-1): approval_history.reason_kind — integer enum (0=Customer,
--   1=Internal, null=unspecified), per-event audit trail.
-- Both columns nullable; no data migration needed for existing rows.

-- AlterTable
ALTER TABLE "purchase_per_item" ADD COLUMN "inventory_id" TEXT;
ALTER TABLE "purchase_per_item" ADD CONSTRAINT "purchase_per_item_inventory_id_fkey" FOREIGN KEY ("inventory_id") REFERENCES "inventory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "approval_history" ADD COLUMN "reason_kind" INT4;
