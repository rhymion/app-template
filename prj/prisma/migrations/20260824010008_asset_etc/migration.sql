-- CreateEnum
CREATE TYPE "MaintenanceTicketStatus" AS ENUM ('open', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "MaintenanceTicketCategory" AS ENUM ('general', 'urgent');

-- CreateTable
CREATE TABLE "asset" (
    "id" TEXT NOT NULL,
    "asset_tag" TEXT NOT NULL,
    "parent_asset_id" TEXT,
    "manual_url" TEXT NOT NULL,
    "unit_cost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "commissioned_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(0) NOT NULL,
    "creator_id" TEXT NOT NULL,
    "updater_id" TEXT NOT NULL,

    CONSTRAINT "asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_component" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "component_product_id" TEXT NOT NULL,
    "component_room_id" TEXT,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(0) NOT NULL,

    CONSTRAINT "asset_component_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spare_part" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "related_product_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(0) NOT NULL,
    "creator_id" TEXT NOT NULL,
    "updater_id" TEXT NOT NULL,

    CONSTRAINT "spare_part_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_ticket" (
    "id" TEXT NOT NULL,
    "category" "MaintenanceTicketCategory" NOT NULL DEFAULT 'general',
    "status" "MaintenanceTicketStatus" NOT NULL DEFAULT 'open',
    "organization_id" TEXT NOT NULL,
    "approvable_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(0) NOT NULL,
    "creator_id" TEXT NOT NULL,
    "updater_id" TEXT NOT NULL,

    CONSTRAINT "maintenance_ticket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "asset_creator_id_idx" ON "asset"("creator_id");

-- CreateIndex
CREATE INDEX "asset_updater_id_idx" ON "asset"("updater_id");

-- CreateIndex
CREATE INDEX "asset_parent_asset_id_idx" ON "asset"("parent_asset_id");

-- CreateIndex
CREATE INDEX "asset_component_asset_id_idx" ON "asset_component"("asset_id");

-- CreateIndex
CREATE INDEX "asset_component_component_product_id_idx" ON "asset_component"("component_product_id");

-- CreateIndex
CREATE INDEX "asset_component_component_room_id_idx" ON "asset_component"("component_room_id");

-- CreateIndex
CREATE INDEX "spare_part_creator_id_idx" ON "spare_part"("creator_id");

-- CreateIndex
CREATE INDEX "spare_part_updater_id_idx" ON "spare_part"("updater_id");

-- CreateIndex
CREATE INDEX "spare_part_related_product_id_idx" ON "spare_part"("related_product_id");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_ticket_approvable_id_key" ON "maintenance_ticket"("approvable_id");

-- CreateIndex
CREATE INDEX "maintenance_ticket_creator_id_idx" ON "maintenance_ticket"("creator_id");

-- CreateIndex
CREATE INDEX "maintenance_ticket_updater_id_idx" ON "maintenance_ticket"("updater_id");

-- CreateIndex
CREATE INDEX "maintenance_ticket_organization_id_idx" ON "maintenance_ticket"("organization_id");

-- AddForeignKey
ALTER TABLE "asset" ADD CONSTRAINT "asset_parent_asset_id_fkey" FOREIGN KEY ("parent_asset_id") REFERENCES "asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset" ADD CONSTRAINT "asset_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset" ADD CONSTRAINT "asset_updater_id_fkey" FOREIGN KEY ("updater_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_component" ADD CONSTRAINT "asset_component_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_component" ADD CONSTRAINT "asset_component_component_product_id_fkey" FOREIGN KEY ("component_product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_component" ADD CONSTRAINT "asset_component_component_room_id_fkey" FOREIGN KEY ("component_room_id") REFERENCES "room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spare_part" ADD CONSTRAINT "spare_part_related_product_id_fkey" FOREIGN KEY ("related_product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spare_part" ADD CONSTRAINT "spare_part_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spare_part" ADD CONSTRAINT "spare_part_updater_id_fkey" FOREIGN KEY ("updater_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_ticket" ADD CONSTRAINT "maintenance_ticket_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_ticket" ADD CONSTRAINT "maintenance_ticket_approvable_id_fkey" FOREIGN KEY ("approvable_id") REFERENCES "approvable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_ticket" ADD CONSTRAINT "maintenance_ticket_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_ticket" ADD CONSTRAINT "maintenance_ticket_updater_id_fkey" FOREIGN KEY ("updater_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
