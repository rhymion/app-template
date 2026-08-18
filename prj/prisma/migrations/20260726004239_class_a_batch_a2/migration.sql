-- Class A Batch A2: Int -> Prisma nativeEnum for 6 fields.
-- Prisma's default USING cast cannot cast integer directly to an enum type,
-- so each column is migrated via ADD new column -> CASE WHEN backfill ->
-- DROP old -> RENAME, per the design record (standard_pattern_non_nullable_*).

-- CreateEnum
CREATE TYPE "ReceivingPurchaseOrderStatus" AS ENUM ('draft', 'issued', 'partially_received', 'received', 'cancelled');

-- CreateEnum
CREATE TYPE "ReceivingPurchaseOrderLineStatus" AS ENUM ('outstanding', 'partially_received', 'fully_received', 'cancelled');

-- CreateEnum
CREATE TYPE "ReceivingAsnStatus" AS ENUM ('draft', 'sent', 'partially_matched', 'matched', 'cancelled');

-- CreateEnum
CREATE TYPE "ReceivingAsnLineStatus" AS ENUM ('outstanding', 'partially_matched', 'fully_matched', 'cancelled');

-- CreateEnum
CREATE TYPE "AttachmentType" AS ENUM ('image', 'file', 'video', 'audio');

-- CreateEnum
CREATE TYPE "DayOfWeek" AS ENUM ('Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday');

-- AlterTable: receiving_purchase_order.status (non-nullable + @default(draft))
ALTER TABLE "receiving_purchase_order" ADD COLUMN "status_new" "ReceivingPurchaseOrderStatus";
UPDATE "receiving_purchase_order" SET "status_new" = CASE "status"
  WHEN 0 THEN 'draft'::"ReceivingPurchaseOrderStatus"
  WHEN 1 THEN 'issued'::"ReceivingPurchaseOrderStatus"
  WHEN 2 THEN 'partially_received'::"ReceivingPurchaseOrderStatus"
  WHEN 3 THEN 'received'::"ReceivingPurchaseOrderStatus"
  WHEN 4 THEN 'cancelled'::"ReceivingPurchaseOrderStatus"
END;
ALTER TABLE "receiving_purchase_order" ALTER COLUMN "status_new" SET DEFAULT 'draft'::"ReceivingPurchaseOrderStatus";
ALTER TABLE "receiving_purchase_order" ALTER COLUMN "status_new" SET NOT NULL;
ALTER TABLE "receiving_purchase_order" DROP COLUMN "status";
ALTER TABLE "receiving_purchase_order" RENAME COLUMN "status_new" TO "status";

-- AlterTable: receiving_purchase_order_line.status (non-nullable + @default(outstanding))
ALTER TABLE "receiving_purchase_order_line" ADD COLUMN "status_new" "ReceivingPurchaseOrderLineStatus";
UPDATE "receiving_purchase_order_line" SET "status_new" = CASE "status"
  WHEN 0 THEN 'outstanding'::"ReceivingPurchaseOrderLineStatus"
  WHEN 1 THEN 'partially_received'::"ReceivingPurchaseOrderLineStatus"
  WHEN 2 THEN 'fully_received'::"ReceivingPurchaseOrderLineStatus"
  WHEN 3 THEN 'cancelled'::"ReceivingPurchaseOrderLineStatus"
END;
ALTER TABLE "receiving_purchase_order_line" ALTER COLUMN "status_new" SET DEFAULT 'outstanding'::"ReceivingPurchaseOrderLineStatus";
ALTER TABLE "receiving_purchase_order_line" ALTER COLUMN "status_new" SET NOT NULL;
ALTER TABLE "receiving_purchase_order_line" DROP COLUMN "status";
ALTER TABLE "receiving_purchase_order_line" RENAME COLUMN "status_new" TO "status";

-- AlterTable: receiving_asn.status (non-nullable + @default(draft))
ALTER TABLE "receiving_asn" ADD COLUMN "status_new" "ReceivingAsnStatus";
UPDATE "receiving_asn" SET "status_new" = CASE "status"
  WHEN 0 THEN 'draft'::"ReceivingAsnStatus"
  WHEN 1 THEN 'sent'::"ReceivingAsnStatus"
  WHEN 2 THEN 'partially_matched'::"ReceivingAsnStatus"
  WHEN 3 THEN 'matched'::"ReceivingAsnStatus"
  WHEN 4 THEN 'cancelled'::"ReceivingAsnStatus"
END;
ALTER TABLE "receiving_asn" ALTER COLUMN "status_new" SET DEFAULT 'draft'::"ReceivingAsnStatus";
ALTER TABLE "receiving_asn" ALTER COLUMN "status_new" SET NOT NULL;
ALTER TABLE "receiving_asn" DROP COLUMN "status";
ALTER TABLE "receiving_asn" RENAME COLUMN "status_new" TO "status";

-- AlterTable: receiving_asn_line.status (non-nullable + @default(outstanding))
ALTER TABLE "receiving_asn_line" ADD COLUMN "status_new" "ReceivingAsnLineStatus";
UPDATE "receiving_asn_line" SET "status_new" = CASE "status"
  WHEN 0 THEN 'outstanding'::"ReceivingAsnLineStatus"
  WHEN 1 THEN 'partially_matched'::"ReceivingAsnLineStatus"
  WHEN 2 THEN 'fully_matched'::"ReceivingAsnLineStatus"
  WHEN 3 THEN 'cancelled'::"ReceivingAsnLineStatus"
END;
ALTER TABLE "receiving_asn_line" ALTER COLUMN "status_new" SET DEFAULT 'outstanding'::"ReceivingAsnLineStatus";
ALTER TABLE "receiving_asn_line" ALTER COLUMN "status_new" SET NOT NULL;
ALTER TABLE "receiving_asn_line" DROP COLUMN "status";
ALTER TABLE "receiving_asn_line" RENAME COLUMN "status_new" TO "status";

-- AlterTable: attachment.type (non-nullable + @default(image))
ALTER TABLE "attachment" ADD COLUMN "type_new" "AttachmentType";
UPDATE "attachment" SET "type_new" = CASE "type"
  WHEN 0 THEN 'image'::"AttachmentType"
  WHEN 1 THEN 'file'::"AttachmentType"
  WHEN 2 THEN 'video'::"AttachmentType"
  WHEN 3 THEN 'audio'::"AttachmentType"
END;
ALTER TABLE "attachment" ALTER COLUMN "type_new" SET DEFAULT 'image'::"AttachmentType";
ALTER TABLE "attachment" ALTER COLUMN "type_new" SET NOT NULL;
ALTER TABLE "attachment" DROP COLUMN "type";
ALTER TABLE "attachment" RENAME COLUMN "type_new" TO "type";

-- AlterTable: shift_template.day_of_week (non-nullable, no @default)
ALTER TABLE "shift_template" ADD COLUMN "day_of_week_new" "DayOfWeek";
UPDATE "shift_template" SET "day_of_week_new" = CASE "day_of_week"
  WHEN 0 THEN 'Sunday'::"DayOfWeek"
  WHEN 1 THEN 'Monday'::"DayOfWeek"
  WHEN 2 THEN 'Tuesday'::"DayOfWeek"
  WHEN 3 THEN 'Wednesday'::"DayOfWeek"
  WHEN 4 THEN 'Thursday'::"DayOfWeek"
  WHEN 5 THEN 'Friday'::"DayOfWeek"
  WHEN 6 THEN 'Saturday'::"DayOfWeek"
END;
ALTER TABLE "shift_template" ALTER COLUMN "day_of_week_new" SET NOT NULL;
ALTER TABLE "shift_template" DROP COLUMN "day_of_week";
ALTER TABLE "shift_template" RENAME COLUMN "day_of_week_new" TO "day_of_week";
