/*
  Hand-edited after `prisma migrate dev --create-only`:

  - `reaction.updated_at` is NOT NULL with no default in the schema (Prisma's
    @updatedAt is client-side). The generated ADD COLUMN would fail on a
    non-empty table, so existing rows are backfilled with the current time via
    a temporary default that is dropped again right after.
*/
-- CreateEnum
CREATE TYPE "PayableStatus" AS ENUM ('pending', 'paid');

-- AlterEnum
ALTER TYPE "ApprovalRequestStatus" ADD VALUE 'split_invalidated';

-- AlterTable
ALTER TABLE "app_setting" ADD COLUMN     "scheduled_task_recheck_minutes" INTEGER,
ADD COLUMN     "scheduled_task_stuck_after_minutes" INTEGER;

-- AlterTable
ALTER TABLE "asset" ADD COLUMN     "under_warranty" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "reaction" ADD COLUMN     "updated_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "reaction" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "room" ADD COLUMN     "stripe_price_id" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "api_key_expires_at" TIMESTAMP(3),
ADD COLUMN     "email_notifications_enabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "idempotency_key" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "target_entity" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_status" INTEGER NOT NULL,
    "response_body" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_key_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payable" (
    "id" TEXT NOT NULL,
    "entity_name" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "status" "PayableStatus" NOT NULL DEFAULT 'pending',
    "stripe_checkout_session_id" TEXT NOT NULL,
    "amount" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMPTZ(0),

    CONSTRAINT "payable_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idempotency_key_actor_user_id_idx" ON "idempotency_key"("actor_user_id");

-- CreateIndex
CREATE INDEX "idempotency_key_created_at_idx" ON "idempotency_key"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_key_key_actor_user_id_target_entity_key" ON "idempotency_key"("key", "actor_user_id", "target_entity");

-- CreateIndex
CREATE UNIQUE INDEX "payable_stripe_checkout_session_id_key" ON "payable"("stripe_checkout_session_id");

-- CreateIndex
CREATE INDEX "payable_status_idx" ON "payable"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payable_entity_name_record_id_key" ON "payable"("entity_name", "record_id");

-- CreateIndex
CREATE INDEX "approval_edit_terminal_test_title_idx" ON "approval_edit_terminal_test"("title");

-- CreateIndex
CREATE INDEX "approval_flow_entity_name_idx" ON "approval_flow"("entity_name");

-- CreateIndex
CREATE INDEX "asn_asn_no_idx" ON "asn"("asn_no");

-- CreateIndex
CREATE INDEX "asset_asset_tag_idx" ON "asset"("asset_tag");

-- CreateIndex
CREATE INDEX "asset_unit_cost_idx" ON "asset"("unit_cost");

-- CreateIndex
CREATE INDEX "booking_end_time_idx" ON "booking"("end_time");

-- CreateIndex
CREATE INDEX "booking_name_idx" ON "booking"("name");

-- CreateIndex
CREATE INDEX "booking_start_time_idx" ON "booking"("start_time");

-- CreateIndex
CREATE INDEX "dashboard_name_idx" ON "dashboard"("name");

-- CreateIndex
CREATE INDEX "goods_receipt_receipt_no_idx" ON "goods_receipt"("receipt_no");

-- CreateIndex
CREATE INDEX "goods_receipt_line_receipt_quantity_idx" ON "goods_receipt_line"("receipt_quantity");

-- CreateIndex
CREATE INDEX "inventory_quantity_idx" ON "inventory"("quantity");

-- CreateIndex
CREATE INDEX "inventory_adjustment_quantity_delta_idx" ON "inventory_adjustment"("quantity_delta");

-- CreateIndex
CREATE INDEX "inventory_movement_quantity_idx" ON "inventory_movement"("quantity");

-- CreateIndex
CREATE INDEX "inventory_transaction_product_id_idx" ON "inventory_transaction"("product_id");

-- CreateIndex
CREATE INDEX "inventory_transaction_quantity_delta_idx" ON "inventory_transaction"("quantity_delta");

-- CreateIndex
CREATE INDEX "leave_request_end_date_idx" ON "leave_request"("end_date");

-- CreateIndex
CREATE INDEX "leave_request_start_date_idx" ON "leave_request"("start_date");

-- CreateIndex
CREATE INDEX "location_name_idx" ON "location"("name");

-- CreateIndex
CREATE INDEX "permission_name_idx" ON "permission"("name");

-- CreateIndex
CREATE INDEX "product_name_idx" ON "product"("name");

-- CreateIndex
CREATE INDEX "product_price_idx" ON "product"("price");

-- CreateIndex
CREATE INDEX "purchase_order_order_no_idx" ON "purchase_order"("order_no");

-- CreateIndex
CREATE INDEX "resource_name_idx" ON "resource"("name");

-- CreateIndex
CREATE INDEX "room_room_no_idx" ON "room"("room_no");

-- CreateIndex
CREATE INDEX "room_reservation_check_in_idx" ON "room_reservation"("check_in");

-- CreateIndex
CREATE INDEX "room_reservation_check_out_idx" ON "room_reservation"("check_out");

-- CreateIndex
CREATE INDEX "room_reservation_guest_name_idx" ON "room_reservation"("guest_name");

-- CreateIndex
CREATE INDEX "sales_order_order_no_idx" ON "sales_order"("order_no");

-- CreateIndex
CREATE INDEX "sales_order_line_quantity_idx" ON "sales_order_line"("quantity");

-- CreateIndex
CREATE INDEX "shift_end_time_idx" ON "shift"("end_time");

-- CreateIndex
CREATE INDEX "shift_start_time_idx" ON "shift"("start_time");

-- CreateIndex
CREATE INDEX "shift_template_end_time_idx" ON "shift_template"("end_time");

-- CreateIndex
CREATE INDEX "shift_template_start_time_idx" ON "shift_template"("start_time");

-- CreateIndex
CREATE INDEX "spare_part_description_idx" ON "spare_part"("description");

-- CreateIndex
CREATE INDEX "spare_part_name_idx" ON "spare_part"("name");

-- CreateIndex
CREATE INDEX "user_name_idx" ON "user"("name");

-- CreateIndex
CREATE INDEX "xxxxx_xxxxx_team_idx" ON "xxxxx_xxxxx"("team");

-- AddForeignKey
ALTER TABLE "idempotency_key" ADD CONSTRAINT "idempotency_key_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
