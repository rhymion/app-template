-- AlterEnum
ALTER TYPE "PurchasePerItemStatus" ADD VALUE 'draft';

-- AlterTable
ALTER TABLE "purchase_per_item" ALTER COLUMN "status" SET DEFAULT 'draft';
