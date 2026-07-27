-- Class A Batch A1: Int -> Prisma nativeEnum for 6 fields.
-- Prisma's default USING cast cannot cast integer directly to an enum type,
-- so each column is migrated via ADD new column -> CASE WHEN backfill ->
-- DROP old -> RENAME, per subtask_446i design (standard_pattern_non_nullable_*).

-- CreateEnum
CREATE TYPE "ApprovalRequestStatus" AS ENUM ('Pending', 'Approved', 'Rejected', 'TerminalRejected');

-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('Scheduled', 'Approved', 'Cancelled');

-- CreateEnum
CREATE TYPE "PurchasePerItemStatus" AS ENUM ('pending', 'split', 'rejected');

-- CreateEnum
CREATE TYPE "LeaveRequestStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "ReceivingReceiptStatus" AS ENUM ('draft', 'confirmed', 'cancelled');

-- CreateEnum
CREATE TYPE "ReceivingReceiptLineStatus" AS ENUM ('pending', 'split', 'rejected');

-- AlterTable: approval_request.status (non-nullable + @default(Pending))
ALTER TABLE "approval_request" ADD COLUMN "status_new" "ApprovalRequestStatus";
UPDATE "approval_request" SET "status_new" = CASE "status"
  WHEN 0 THEN 'Pending'::"ApprovalRequestStatus"
  WHEN 1 THEN 'Approved'::"ApprovalRequestStatus"
  WHEN 2 THEN 'Rejected'::"ApprovalRequestStatus"
  WHEN 3 THEN 'TerminalRejected'::"ApprovalRequestStatus"
END;
ALTER TABLE "approval_request" ALTER COLUMN "status_new" SET DEFAULT 'Pending'::"ApprovalRequestStatus";
ALTER TABLE "approval_request" ALTER COLUMN "status_new" SET NOT NULL;
ALTER TABLE "approval_request" DROP COLUMN "status";
ALTER TABLE "approval_request" RENAME COLUMN "status_new" TO "status";

-- AlterTable: leave_request.status (non-nullable + @default(pending))
ALTER TABLE "leave_request" ADD COLUMN "status_new" "LeaveRequestStatus";
UPDATE "leave_request" SET "status_new" = CASE "status"
  WHEN 0 THEN 'pending'::"LeaveRequestStatus"
  WHEN 1 THEN 'approved'::"LeaveRequestStatus"
  WHEN 2 THEN 'rejected'::"LeaveRequestStatus"
END;
ALTER TABLE "leave_request" ALTER COLUMN "status_new" SET DEFAULT 'pending'::"LeaveRequestStatus";
ALTER TABLE "leave_request" ALTER COLUMN "status_new" SET NOT NULL;
ALTER TABLE "leave_request" DROP COLUMN "status";
ALTER TABLE "leave_request" RENAME COLUMN "status_new" TO "status";

-- AlterTable: purchase_per_item.status (non-nullable + @default(pending))
ALTER TABLE "purchase_per_item" ADD COLUMN "status_new" "PurchasePerItemStatus";
UPDATE "purchase_per_item" SET "status_new" = CASE "status"
  WHEN 0 THEN 'pending'::"PurchasePerItemStatus"
  WHEN 1 THEN 'split'::"PurchasePerItemStatus"
  WHEN 2 THEN 'rejected'::"PurchasePerItemStatus"
END;
ALTER TABLE "purchase_per_item" ALTER COLUMN "status_new" SET DEFAULT 'pending'::"PurchasePerItemStatus";
ALTER TABLE "purchase_per_item" ALTER COLUMN "status_new" SET NOT NULL;
ALTER TABLE "purchase_per_item" DROP COLUMN "status";
ALTER TABLE "purchase_per_item" RENAME COLUMN "status_new" TO "status";

-- AlterTable: receiving_receipt.status (non-nullable + @default(draft))
ALTER TABLE "receiving_receipt" ADD COLUMN "status_new" "ReceivingReceiptStatus";
UPDATE "receiving_receipt" SET "status_new" = CASE "status"
  WHEN 0 THEN 'draft'::"ReceivingReceiptStatus"
  WHEN 1 THEN 'confirmed'::"ReceivingReceiptStatus"
  WHEN 2 THEN 'cancelled'::"ReceivingReceiptStatus"
END;
ALTER TABLE "receiving_receipt" ALTER COLUMN "status_new" SET DEFAULT 'draft'::"ReceivingReceiptStatus";
ALTER TABLE "receiving_receipt" ALTER COLUMN "status_new" SET NOT NULL;
ALTER TABLE "receiving_receipt" DROP COLUMN "status";
ALTER TABLE "receiving_receipt" RENAME COLUMN "status_new" TO "status";

-- AlterTable: receiving_receipt_line.status (non-nullable + @default(pending))
ALTER TABLE "receiving_receipt_line" ADD COLUMN "status_new" "ReceivingReceiptLineStatus";
UPDATE "receiving_receipt_line" SET "status_new" = CASE "status"
  WHEN 0 THEN 'pending'::"ReceivingReceiptLineStatus"
  WHEN 1 THEN 'split'::"ReceivingReceiptLineStatus"
  WHEN 2 THEN 'rejected'::"ReceivingReceiptLineStatus"
END;
ALTER TABLE "receiving_receipt_line" ALTER COLUMN "status_new" SET DEFAULT 'pending'::"ReceivingReceiptLineStatus";
ALTER TABLE "receiving_receipt_line" ALTER COLUMN "status_new" SET NOT NULL;
ALTER TABLE "receiving_receipt_line" DROP COLUMN "status";
ALTER TABLE "receiving_receipt_line" RENAME COLUMN "status_new" TO "status";

-- AlterTable: shift.status (non-nullable, no @default)
ALTER TABLE "shift" ADD COLUMN "status_new" "ShiftStatus";
UPDATE "shift" SET "status_new" = CASE "status"
  WHEN 0 THEN 'Scheduled'::"ShiftStatus"
  WHEN 1 THEN 'Approved'::"ShiftStatus"
  WHEN 2 THEN 'Cancelled'::"ShiftStatus"
END;
ALTER TABLE "shift" ALTER COLUMN "status_new" SET NOT NULL;
ALTER TABLE "shift" DROP COLUMN "status";
ALTER TABLE "shift" RENAME COLUMN "status_new" TO "status";
