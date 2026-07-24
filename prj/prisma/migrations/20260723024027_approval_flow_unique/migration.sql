/*
  Warnings:

  - You are about to drop the column `location` on the `inventory` table. All the data in the column will be lost.
  - You are about to drop the column `cancelled_quantity` on the `receiving_receipt_line` table. All the data in the column will be lost.
  - You are about to drop the column `done_quantity` on the `receiving_receipt_line` table. All the data in the column will be lost.
  - You are about to drop the column `outstanding_quantity` on the `receiving_receipt_line` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[entity_name,approver_role_id]` on the table `approval_flow` will be added. If there are existing duplicate values, this will fail.
  - Made the column `approvable_id` on table `purchase_per_item` required. This step will fail if there are existing NULL values in that column.
  - Made the column `approvable_id` on table `receiving_receipt_line` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "purchase_per_item" DROP CONSTRAINT "purchase_per_item_approvable_id_fkey";

-- DropForeignKey
ALTER TABLE "receiving_receipt_line" DROP CONSTRAINT "receiving_receipt_line_approvable_id_fkey";

-- AlterTable
ALTER TABLE "attachment" ADD COLUMN     "encrypted_original_name" TEXT,
ADD COLUMN     "name_iv" TEXT;

-- AlterTable
ALTER TABLE "inventory" DROP COLUMN "location",
ADD COLUMN     "location_id" TEXT;

-- AlterTable
ALTER TABLE "leave_request" ADD COLUMN     "assignee_id" TEXT;

-- AlterTable
ALTER TABLE "permission" ADD COLUMN     "import" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "purchase_per_item" ADD COLUMN     "creator_id" TEXT,
ADD COLUMN     "parent_id" TEXT,
ADD COLUMN     "status" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "updater_id" TEXT,
ALTER COLUMN "approvable_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "receiving_receipt_line" DROP COLUMN "cancelled_quantity",
DROP COLUMN "done_quantity",
DROP COLUMN "outstanding_quantity",
ADD COLUMN     "assignee_id" TEXT,
ADD COLUMN     "creator_id" TEXT,
ADD COLUMN     "updater_id" TEXT,
ALTER COLUMN "approvable_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "anonymized_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "inventory_movement" (
    "id" TEXT NOT NULL,
    "from_inventory_id" TEXT NOT NULL,
    "to_inventory_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "approvable_id" TEXT NOT NULL,
    "inventory_transactionable_id" TEXT,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(0) NOT NULL,
    "creator_id" TEXT,
    "updater_id" TEXT,

    CONSTRAINT "inventory_movement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_adjustment" (
    "id" TEXT NOT NULL,
    "inventory_id" TEXT NOT NULL,
    "quantity_delta" INTEGER NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "approvable_id" TEXT NOT NULL,
    "inventory_transactionable_id" TEXT,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(0) NOT NULL,
    "creator_id" TEXT,
    "updater_id" TEXT,

    CONSTRAINT "inventory_adjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(0) NOT NULL,
    "creator_id" TEXT NOT NULL,
    "updater_id" TEXT NOT NULL,

    CONSTRAINT "location_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_movement_approvable_id_key" ON "inventory_movement"("approvable_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_movement_inventory_transactionable_id_key" ON "inventory_movement"("inventory_transactionable_id");

-- CreateIndex
CREATE INDEX "inventory_movement_from_inventory_id_idx" ON "inventory_movement"("from_inventory_id");

-- CreateIndex
CREATE INDEX "inventory_movement_to_inventory_id_idx" ON "inventory_movement"("to_inventory_id");

-- CreateIndex
CREATE INDEX "inventory_movement_creator_id_idx" ON "inventory_movement"("creator_id");

-- CreateIndex
CREATE INDEX "inventory_movement_updater_id_idx" ON "inventory_movement"("updater_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_adjustment_approvable_id_key" ON "inventory_adjustment"("approvable_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_adjustment_inventory_transactionable_id_key" ON "inventory_adjustment"("inventory_transactionable_id");

-- CreateIndex
CREATE INDEX "inventory_adjustment_inventory_id_idx" ON "inventory_adjustment"("inventory_id");

-- CreateIndex
CREATE INDEX "inventory_adjustment_creator_id_idx" ON "inventory_adjustment"("creator_id");

-- CreateIndex
CREATE INDEX "inventory_adjustment_updater_id_idx" ON "inventory_adjustment"("updater_id");

-- CreateIndex
CREATE INDEX "location_creator_id_idx" ON "location"("creator_id");

-- CreateIndex
CREATE INDEX "location_updater_id_idx" ON "location"("updater_id");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "approval_flow_approver_role_id_idx" ON "approval_flow"("approver_role_id");

-- CreateIndex
CREATE INDEX "approval_flow_requestor_role_id_idx" ON "approval_flow"("requestor_role_id");

-- CreateIndex
CREATE INDEX "approval_flow_updater_id_idx" ON "approval_flow"("updater_id");

-- CreateIndex
CREATE UNIQUE INDEX "approval_flow_entity_name_approver_role_id_key" ON "approval_flow"("entity_name", "approver_role_id");

-- CreateIndex
CREATE INDEX "approval_history_approval_request_id_idx" ON "approval_history"("approval_request_id");

-- CreateIndex
CREATE INDEX "approval_request_approvable_id_idx" ON "approval_request"("approvable_id");

-- CreateIndex
CREATE INDEX "approval_request_approval_flow_id_idx" ON "approval_request"("approval_flow_id");

-- CreateIndex
CREATE INDEX "attachment_attachable_id_idx" ON "attachment"("attachable_id");

-- CreateIndex
CREATE INDEX "booking_resource_id_idx" ON "booking"("resource_id");

-- CreateIndex
CREATE INDEX "booking_updater_id_idx" ON "booking"("updater_id");

-- CreateIndex
CREATE INDEX "comment_commentable_id_idx" ON "comment"("commentable_id");

-- CreateIndex
CREATE INDEX "dashboard_updater_id_idx" ON "dashboard"("updater_id");

-- CreateIndex
CREATE INDEX "dashboard_widget_dashboard_id_idx" ON "dashboard_widget"("dashboard_id");

-- CreateIndex
CREATE INDEX "db_table_updater_id_idx" ON "db_table"("updater_id");

-- CreateIndex
CREATE INDEX "field_db_table_id_idx" ON "field"("db_table_id");

-- CreateIndex
CREATE INDEX "field_reference_id_idx" ON "field"("reference_id");

-- CreateIndex
CREATE INDEX "inventory_location_id_idx" ON "inventory"("location_id");

-- CreateIndex
CREATE INDEX "inventory_product_id_idx" ON "inventory"("product_id");

-- CreateIndex
CREATE INDEX "inventory_updater_id_idx" ON "inventory"("updater_id");

-- CreateIndex
CREATE INDEX "inventory_transaction_updater_id_idx" ON "inventory_transaction"("updater_id");

-- CreateIndex
CREATE INDEX "leave_request_assignee_id_idx" ON "leave_request"("assignee_id");

-- CreateIndex
CREATE INDEX "leave_request_updater_id_idx" ON "leave_request"("updater_id");

-- CreateIndex
CREATE INDEX "leave_request_user_id_idx" ON "leave_request"("user_id");

-- CreateIndex
CREATE INDEX "note_updater_id_idx" ON "note"("updater_id");

-- CreateIndex
CREATE INDEX "organization_updater_id_idx" ON "organization"("updater_id");

-- CreateIndex
CREATE INDEX "parent1_updater_id_idx" ON "parent1"("updater_id");

-- CreateIndex
CREATE INDEX "parent1_child1_parent1_id_idx" ON "parent1_child1"("parent1_id");

-- CreateIndex
CREATE INDEX "parent1_child2_parent1_id_idx" ON "parent1_child2"("parent1_id");

-- CreateIndex
CREATE INDEX "parent1_list_parent1_id_idx" ON "parent1_list"("parent1_id");

-- CreateIndex
CREATE INDEX "parent_only_updater_id_idx" ON "parent_only"("updater_id");

-- CreateIndex
CREATE INDEX "permission_role_id_idx" ON "permission"("role_id");

-- CreateIndex
CREATE INDEX "permission_updater_id_idx" ON "permission"("updater_id");

-- CreateIndex
CREATE INDEX "procedure_parent_id_idx" ON "procedure"("parent_id");

-- CreateIndex
CREATE INDEX "procedure_updater_id_idx" ON "procedure"("updater_id");

-- CreateIndex
CREATE INDEX "product_updater_id_idx" ON "product"("updater_id");

-- CreateIndex
CREATE INDEX "purchase_order_customer_id_idx" ON "purchase_order"("customer_id");

-- CreateIndex
CREATE INDEX "purchase_order_updater_id_idx" ON "purchase_order"("updater_id");

-- CreateIndex
CREATE INDEX "purchase_per_item_creator_id_idx" ON "purchase_per_item"("creator_id");

-- CreateIndex
CREATE INDEX "purchase_per_item_inventory_id_idx" ON "purchase_per_item"("inventory_id");

-- CreateIndex
CREATE INDEX "purchase_per_item_parent_id_idx" ON "purchase_per_item"("parent_id");

-- CreateIndex
CREATE INDEX "purchase_per_item_product_id_idx" ON "purchase_per_item"("product_id");

-- CreateIndex
CREATE INDEX "purchase_per_item_purchase_order_id_idx" ON "purchase_per_item"("purchase_order_id");

-- CreateIndex
CREATE INDEX "purchase_per_item_updater_id_idx" ON "purchase_per_item"("updater_id");

-- CreateIndex
CREATE INDEX "receiving_asn_updater_id_idx" ON "receiving_asn"("updater_id");

-- CreateIndex
CREATE INDEX "receiving_asn_line_product_id_idx" ON "receiving_asn_line"("product_id");

-- CreateIndex
CREATE INDEX "receiving_purchase_order_updater_id_idx" ON "receiving_purchase_order"("updater_id");

-- CreateIndex
CREATE INDEX "receiving_purchase_order_line_product_id_idx" ON "receiving_purchase_order_line"("product_id");

-- CreateIndex
CREATE INDEX "receiving_receipt_updater_id_idx" ON "receiving_receipt"("updater_id");

-- CreateIndex
CREATE INDEX "receiving_receipt_line_creator_id_idx" ON "receiving_receipt_line"("creator_id");

-- CreateIndex
CREATE INDEX "receiving_receipt_line_assignee_id_idx" ON "receiving_receipt_line"("assignee_id");

-- CreateIndex
CREATE INDEX "receiving_receipt_line_product_id_idx" ON "receiving_receipt_line"("product_id");

-- CreateIndex
CREATE INDEX "receiving_receipt_line_updater_id_idx" ON "receiving_receipt_line"("updater_id");

-- CreateIndex
CREATE INDEX "resource_updater_id_idx" ON "resource"("updater_id");

-- CreateIndex
CREATE INDEX "role_updater_id_idx" ON "role"("updater_id");

-- CreateIndex
CREATE INDEX "room_room_type_id_idx" ON "room"("room_type_id");

-- CreateIndex
CREATE INDEX "room_updater_id_idx" ON "room"("updater_id");

-- CreateIndex
CREATE INDEX "room_reservation_room_id_idx" ON "room_reservation"("room_id");

-- CreateIndex
CREATE INDEX "room_reservation_room_type_id_idx" ON "room_reservation"("room_type_id");

-- CreateIndex
CREATE INDEX "room_reservation_updater_id_idx" ON "room_reservation"("updater_id");

-- CreateIndex
CREATE INDEX "room_type_updater_id_idx" ON "room_type"("updater_id");

-- CreateIndex
CREATE INDEX "shift_updater_id_idx" ON "shift"("updater_id");

-- CreateIndex
CREATE INDEX "shift_user_id_idx" ON "shift"("user_id");

-- CreateIndex
CREATE INDEX "shift_template_updater_id_idx" ON "shift_template"("updater_id");

-- CreateIndex
CREATE INDEX "shift_template_user_id_idx" ON "shift_template"("user_id");

-- CreateIndex
CREATE INDEX "supply_pool_updater_id_idx" ON "supply_pool"("updater_id");

-- CreateIndex
CREATE INDEX "supply_request_updater_id_idx" ON "supply_request"("updater_id");

-- CreateIndex
CREATE INDEX "tenant_updater_id_idx" ON "tenant"("updater_id");

-- CreateIndex
CREATE INDEX "user_updater_id_idx" ON "user"("updater_id");

-- CreateIndex
CREATE INDEX "xxxxx_xxxxx_updater_id_idx" ON "xxxxx_xxxxx"("updater_id");

-- CreateIndex
CREATE INDEX "yyyyy_yyyyy_xxxxx_xxxxx_id_idx" ON "yyyyy_yyyyy"("xxxxx_xxxxx_id");

-- AddForeignKey
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_from_inventory_id_fkey" FOREIGN KEY ("from_inventory_id") REFERENCES "inventory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_to_inventory_id_fkey" FOREIGN KEY ("to_inventory_id") REFERENCES "inventory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_approvable_id_fkey" FOREIGN KEY ("approvable_id") REFERENCES "approvable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_inventory_transactionable_id_fkey" FOREIGN KEY ("inventory_transactionable_id") REFERENCES "inventory_transactionable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_updater_id_fkey" FOREIGN KEY ("updater_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustment" ADD CONSTRAINT "inventory_adjustment_inventory_id_fkey" FOREIGN KEY ("inventory_id") REFERENCES "inventory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustment" ADD CONSTRAINT "inventory_adjustment_approvable_id_fkey" FOREIGN KEY ("approvable_id") REFERENCES "approvable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustment" ADD CONSTRAINT "inventory_adjustment_inventory_transactionable_id_fkey" FOREIGN KEY ("inventory_transactionable_id") REFERENCES "inventory_transactionable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustment" ADD CONSTRAINT "inventory_adjustment_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustment" ADD CONSTRAINT "inventory_adjustment_updater_id_fkey" FOREIGN KEY ("updater_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location" ADD CONSTRAINT "location_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location" ADD CONSTRAINT "location_updater_id_fkey" FOREIGN KEY ("updater_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_per_item" ADD CONSTRAINT "purchase_per_item_approvable_id_fkey" FOREIGN KEY ("approvable_id") REFERENCES "approvable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_per_item" ADD CONSTRAINT "purchase_per_item_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "purchase_per_item"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "purchase_per_item" ADD CONSTRAINT "purchase_per_item_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_per_item" ADD CONSTRAINT "purchase_per_item_updater_id_fkey" FOREIGN KEY ("updater_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receiving_receipt_line" ADD CONSTRAINT "receiving_receipt_line_approvable_id_fkey" FOREIGN KEY ("approvable_id") REFERENCES "approvable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receiving_receipt_line" ADD CONSTRAINT "receiving_receipt_line_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receiving_receipt_line" ADD CONSTRAINT "receiving_receipt_line_updater_id_fkey" FOREIGN KEY ("updater_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receiving_receipt_line" ADD CONSTRAINT "receiving_receipt_line_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
