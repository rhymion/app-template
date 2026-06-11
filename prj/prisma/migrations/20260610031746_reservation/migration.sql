-- AlterTable
ALTER TABLE "dashboard_widget" ADD COLUMN     "group_by_bucket" INTEGER,
ADD COLUMN     "series_field" TEXT,
ADD COLUMN     "stack_mode" INTEGER,
ALTER COLUMN "chart_type" DROP DEFAULT;

-- AlterTable
ALTER TABLE "inventory" ALTER COLUMN "reserved_quantity" SET DEFAULT 0;

-- CreateTable
CREATE TABLE "inventory_allocation" (
    "id" TEXT NOT NULL,
    "purchase_order_id" TEXT NOT NULL,
    "purchase_per_item_id" TEXT NOT NULL,
    "inventory_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "creator_id" TEXT NOT NULL,
    "updater_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_allocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supply_pool" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "quantity" INTEGER NOT NULL,
    "reserved_quantity" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(0) NOT NULL,
    "creator_id" TEXT NOT NULL,
    "updater_id" TEXT NOT NULL,

    CONSTRAINT "supply_pool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supply_request" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "quantity" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(0) NOT NULL,
    "creator_id" TEXT NOT NULL,
    "updater_id" TEXT NOT NULL,

    CONSTRAINT "supply_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supply_allocation" (
    "id" TEXT NOT NULL,
    "supply_request_id" TEXT NOT NULL,
    "supply_pool_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supply_allocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_type" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(0) NOT NULL,
    "creator_id" TEXT NOT NULL,
    "updater_id" TEXT NOT NULL,

    CONSTRAINT "room_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room" (
    "id" TEXT NOT NULL,
    "room_no" TEXT NOT NULL,
    "room_type_id" TEXT NOT NULL,
    "floor" INTEGER,
    "status" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(0) NOT NULL,
    "creator_id" TEXT NOT NULL,
    "updater_id" TEXT NOT NULL,

    CONSTRAINT "room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_reservation" (
    "id" TEXT NOT NULL,
    "guest_name" TEXT NOT NULL,
    "room_type_id" TEXT NOT NULL,
    "room_id" TEXT,
    "check_in" TIMESTAMPTZ(0) NOT NULL,
    "check_out" TIMESTAMPTZ(0) NOT NULL,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(0) NOT NULL,
    "creator_id" TEXT NOT NULL,
    "updater_id" TEXT NOT NULL,

    CONSTRAINT "room_reservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_allocation_purchase_order_id_idx" ON "inventory_allocation"("purchase_order_id");

-- CreateIndex
CREATE INDEX "inventory_allocation_inventory_id_idx" ON "inventory_allocation"("inventory_id");

-- CreateIndex
CREATE INDEX "inventory_allocation_creator_id_idx" ON "inventory_allocation"("creator_id");

-- CreateIndex
CREATE INDEX "supply_pool_creator_id_idx" ON "supply_pool"("creator_id");

-- CreateIndex
CREATE INDEX "supply_request_creator_id_idx" ON "supply_request"("creator_id");

-- CreateIndex
CREATE INDEX "supply_allocation_supply_request_id_idx" ON "supply_allocation"("supply_request_id");

-- CreateIndex
CREATE INDEX "supply_allocation_supply_pool_id_idx" ON "supply_allocation"("supply_pool_id");

-- CreateIndex
CREATE INDEX "room_type_creator_id_idx" ON "room_type"("creator_id");

-- CreateIndex
CREATE INDEX "room_creator_id_idx" ON "room"("creator_id");

-- CreateIndex
CREATE INDEX "room_reservation_creator_id_idx" ON "room_reservation"("creator_id");

-- AddForeignKey
ALTER TABLE "inventory_allocation" ADD CONSTRAINT "inventory_allocation_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_allocation" ADD CONSTRAINT "inventory_allocation_purchase_per_item_id_fkey" FOREIGN KEY ("purchase_per_item_id") REFERENCES "purchase_per_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_allocation" ADD CONSTRAINT "inventory_allocation_inventory_id_fkey" FOREIGN KEY ("inventory_id") REFERENCES "inventory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_pool" ADD CONSTRAINT "supply_pool_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_pool" ADD CONSTRAINT "supply_pool_updater_id_fkey" FOREIGN KEY ("updater_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_request" ADD CONSTRAINT "supply_request_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_request" ADD CONSTRAINT "supply_request_updater_id_fkey" FOREIGN KEY ("updater_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_allocation" ADD CONSTRAINT "supply_allocation_supply_request_id_fkey" FOREIGN KEY ("supply_request_id") REFERENCES "supply_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_allocation" ADD CONSTRAINT "supply_allocation_supply_pool_id_fkey" FOREIGN KEY ("supply_pool_id") REFERENCES "supply_pool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_type" ADD CONSTRAINT "room_type_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_type" ADD CONSTRAINT "room_type_updater_id_fkey" FOREIGN KEY ("updater_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room" ADD CONSTRAINT "room_room_type_id_fkey" FOREIGN KEY ("room_type_id") REFERENCES "room_type"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room" ADD CONSTRAINT "room_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room" ADD CONSTRAINT "room_updater_id_fkey" FOREIGN KEY ("updater_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_reservation" ADD CONSTRAINT "room_reservation_room_type_id_fkey" FOREIGN KEY ("room_type_id") REFERENCES "room_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_reservation" ADD CONSTRAINT "room_reservation_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_reservation" ADD CONSTRAINT "room_reservation_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_reservation" ADD CONSTRAINT "room_reservation_updater_id_fkey" FOREIGN KEY ("updater_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
