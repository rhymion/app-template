/*
  Warnings:

  - You are about to drop the column `updated_at` on the `reaction` table. All the data in the column will be lost.
  - Added the required column `updated_at` to the `inventory_allocation` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "inventory_allocation" DROP CONSTRAINT "inventory_allocation_inventory_id_fkey";

-- DropForeignKey
ALTER TABLE "reaction" DROP CONSTRAINT "reaction_user_id_fkey";

-- DropIndex
DROP INDEX "inventory_allocation_inventory_id_idx";

-- DropIndex
DROP INDEX "inventory_allocation_purchase_order_id_idx";

-- AlterTable
ALTER TABLE "approvable" ADD COLUMN     "approved_at" TIMESTAMPTZ(0);

-- AlterTable
ALTER TABLE "inventory_allocation" ADD COLUMN     "updated_at" TIMESTAMPTZ(0) NOT NULL;

-- AlterTable
ALTER TABLE "leave_request" ADD COLUMN     "status" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "reaction" DROP COLUMN "updated_at";

-- AddForeignKey
ALTER TABLE "reaction" ADD CONSTRAINT "reaction_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_allocation" ADD CONSTRAINT "inventory_allocation_inventory_id_fkey" FOREIGN KEY ("inventory_id") REFERENCES "inventory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_allocation" ADD CONSTRAINT "inventory_allocation_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_allocation" ADD CONSTRAINT "inventory_allocation_updater_id_fkey" FOREIGN KEY ("updater_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
