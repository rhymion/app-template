-- CreateEnum
CREATE TYPE "InventoryTransactionEventType" AS ENUM ('reserve', 'ship', 'receive', 'release', 'cancel', 'move', 'adjust');

-- CreateEnum
CREATE TYPE "InventoryAdjustmentStatus" AS ENUM ('pending', 'rejected');

-- CreateEnum
CREATE TYPE "FieldType" AS ENUM ('string', 'number', 'boolean', 'date');

-- AlterTable: field.type
ALTER TABLE "field"
  ALTER COLUMN "type" TYPE "FieldType"
  USING "type"::"FieldType";

-- AlterTable: inventory_adjustment.status
ALTER TABLE "inventory_adjustment" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "inventory_adjustment"
  ALTER COLUMN "status" TYPE "InventoryAdjustmentStatus"
  USING "status"::"InventoryAdjustmentStatus";
ALTER TABLE "inventory_adjustment"
  ALTER COLUMN "status" SET DEFAULT 'pending'::"InventoryAdjustmentStatus";

-- AlterTable: inventory_transaction.event_type
ALTER TABLE "inventory_transaction"
  ALTER COLUMN "event_type" TYPE "InventoryTransactionEventType"
  USING "event_type"::"InventoryTransactionEventType";

-- AlterTable: parent1_child1.type
ALTER TABLE "parent1_child1"
  ALTER COLUMN "type" TYPE "FieldType"
  USING "type"::"FieldType";

-- AlterTable: yyyyy_yyyyy.type
ALTER TABLE "yyyyy_yyyyy"
  ALTER COLUMN "type" TYPE "FieldType"
  USING "type"::"FieldType";
