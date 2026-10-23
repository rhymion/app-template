/*
  Warnings:

  - You are about to drop the column `location` on the `inventory_transaction` table. All the data in the column will be lost.
  - Made the column `location_id` on table `inventory` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `location_id` to the `inventory_transaction` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "inventory" DROP CONSTRAINT "inventory_location_id_fkey";

-- DropForeignKey
ALTER TABLE "parent1" DROP CONSTRAINT "parent1_organization_id_fkey";

-- AlterTable
ALTER TABLE "dashboard_widget" ALTER COLUMN "chart_type" SET DEFAULT 'column';

-- AlterTable
ALTER TABLE "inventory" ALTER COLUMN "quantity" SET DEFAULT 0,
ALTER COLUMN "location_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "inventory_transaction" DROP COLUMN "location",
ADD COLUMN     "location_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "location" ADD COLUMN     "invalidated_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "invalidated_at" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "parent1" ADD CONSTRAINT "parent1_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
