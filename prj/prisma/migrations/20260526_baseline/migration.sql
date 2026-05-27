-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT,

    CONSTRAINT "tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "db_table" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(0) NOT NULL,
    "creator_id" TEXT NOT NULL,
    "updater_id" TEXT NOT NULL,
    "commentable_id" TEXT NOT NULL,

    CONSTRAINT "db_table_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "max_length" INTEGER NOT NULL,
    "max" INTEGER,
    "regex" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(0) NOT NULL,
    "db_table_id" TEXT NOT NULL,
    "reference_id" TEXT,

    CONSTRAINT "field_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commentable" (
    "id" TEXT NOT NULL,

    CONSTRAINT "commentable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comment" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "commentable_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(0) NOT NULL,
    "creator_id" TEXT NOT NULL,

    CONSTRAINT "comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xxxxx_xxxxx" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "team" TEXT,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(0) NOT NULL,
    "creator_id" TEXT NOT NULL,
    "updater_id" TEXT NOT NULL,

    CONSTRAINT "xxxxx_xxxxx_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "yyyyy_yyyyy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "xxxxx_xxxxx_id" TEXT NOT NULL,
    "max_length" INTEGER,
    "max" INTEGER,
    "regex" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "written_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(0) NOT NULL,

    CONSTRAINT "yyyyy_yyyyy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parent1" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" INTEGER NOT NULL,
    "due_date" TIMESTAMPTZ(0) NOT NULL,
    "image_url" TEXT,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(0) NOT NULL,
    "organization_id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "updater_id" TEXT NOT NULL,

    CONSTRAINT "parent1_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parent1_child1" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "parent1_id" TEXT NOT NULL,
    "max_length" INTEGER,
    "max" INTEGER,
    "regex" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "written_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(0) NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "parent1_child1_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parent1_child2" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parent1_id" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "start_date" TIMESTAMPTZ(0),
    "end_date" TIMESTAMPTZ(0) NOT NULL,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(0) NOT NULL,

    CONSTRAINT "parent1_child2_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parent1_list" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parent1_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(0) NOT NULL,

    CONSTRAINT "parent1_list_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parent_only" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "login_time" TIMESTAMPTZ(0),
    "logout_time" TIMESTAMPTZ(0),
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(0) NOT NULL,
    "creator_id" TEXT NOT NULL,
    "updater_id" TEXT NOT NULL,

    CONSTRAINT "parent_only_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creator_id" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(0) NOT NULL,
    "updater_id" TEXT NOT NULL,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creator_id" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(0) NOT NULL,
    "updater_id" TEXT NOT NULL,

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission" (
    "id" TEXT NOT NULL,
    "role_id" TEXT,
    "create" BOOLEAN NOT NULL,
    "read" BOOLEAN NOT NULL,
    "update" BOOLEAN NOT NULL,
    "delete" BOOLEAN NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creator_id" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(0) NOT NULL,
    "updater_id" TEXT NOT NULL,

    CONSTRAINT "permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procedure" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "parent_id" TEXT,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creator_id" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(0) NOT NULL,
    "updater_id" TEXT NOT NULL,
    "assignee_id" TEXT,

    CONSTRAINT "procedure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(0) NOT NULL,
    "creator_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "updater_id" TEXT NOT NULL,

    CONSTRAINT "resource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "start_time" TIMESTAMPTZ(0) NOT NULL,
    "end_time" TIMESTAMPTZ(0) NOT NULL,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(0) NOT NULL,
    "creator_id" TEXT NOT NULL,
    "updater_id" TEXT NOT NULL,

    CONSTRAINT "booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_template" (
    "id" TEXT NOT NULL,
    "start_time" TIMETZ(0) NOT NULL,
    "end_time" TIMETZ(0) NOT NULL,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(0) NOT NULL,
    "creator_id" TEXT NOT NULL,
    "updater_id" TEXT NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "user_account_id" TEXT NOT NULL,

    CONSTRAINT "shift_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift" (
    "id" TEXT NOT NULL,
    "start_time" TIMESTAMPTZ(0) NOT NULL,
    "end_time" TIMESTAMPTZ(0) NOT NULL,
    "status" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(0) NOT NULL,
    "creator_id" TEXT NOT NULL,
    "updater_id" TEXT NOT NULL,
    "user_account_id" TEXT NOT NULL,

    CONSTRAINT "shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "barcode" TEXT,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(0) NOT NULL,
    "creator_id" TEXT NOT NULL,
    "updater_id" TEXT NOT NULL,

    CONSTRAINT "product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reserved_quantity" INTEGER NOT NULL,
    "location" TEXT,
    "lot_number" TEXT,
    "expiration_date" TIMESTAMP(3),
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(0) NOT NULL,
    "creator_id" TEXT NOT NULL,
    "updater_id" TEXT NOT NULL,

    CONSTRAINT "inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order" (
    "id" TEXT NOT NULL,
    "order_no" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(0) NOT NULL,
    "creator_id" TEXT NOT NULL,
    "updater_id" TEXT NOT NULL,

    CONSTRAINT "purchase_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_per_item" (
    "id" TEXT NOT NULL,
    "purchase_order_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" INTEGER,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(0) NOT NULL,

    CONSTRAINT "purchase_per_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_request" (
    "id" TEXT NOT NULL,
    "start_date" TIMESTAMPTZ(0) NOT NULL,
    "end_date" TIMESTAMPTZ(0) NOT NULL,
    "reason" TEXT NOT NULL,
    "approvable_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(0) NOT NULL,
    "creator_id" TEXT NOT NULL,
    "updater_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "leave_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approvable" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT,

    CONSTRAINT "approvable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_flow" (
    "id" TEXT NOT NULL,
    "entity_name" TEXT NOT NULL,
    "requestor_role_id" TEXT,
    "approver_role_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(0) NOT NULL,
    "creator_id" TEXT NOT NULL,
    "updater_id" TEXT NOT NULL,

    CONSTRAINT "approval_flow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_request" (
    "id" TEXT NOT NULL,
    "approvable_id" TEXT NOT NULL,
    "approval_flow_id" TEXT NOT NULL,
    "status" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(0) NOT NULL,

    CONSTRAINT "approval_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_history" (
    "id" TEXT NOT NULL,
    "approval_request_id" TEXT NOT NULL,
    "pre_status" INTEGER NOT NULL,
    "post_status" INTEGER NOT NULL,
    "message" TEXT,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(0) NOT NULL,
    "creator_id" TEXT NOT NULL,

    CONSTRAINT "approval_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_UserOrganizations" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_UserOrganizations_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_UserRoles" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_UserRoles_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "product_image" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(0) NOT NULL,

    CONSTRAINT "product_image_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_attachment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(0) NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "resource_attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_image" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(0) NOT NULL,

    CONSTRAINT "resource_image_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_account" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "api_key" TEXT,
    "avatar" TEXT,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creator_id" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(0) NOT NULL,
    "updater_id" TEXT NOT NULL,

    CONSTRAINT "user_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_BeforeAfter" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_BeforeAfter_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_ApprovalFlowOrder" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ApprovalFlowOrder_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "db_table_name_key" ON "db_table"("name");

-- CreateIndex
CREATE UNIQUE INDEX "db_table_commentable_id_key" ON "db_table"("commentable_id");

-- CreateIndex
CREATE INDEX "db_table_creator_id_idx" ON "db_table"("creator_id");

-- CreateIndex
CREATE INDEX "comment_creator_id_idx" ON "comment"("creator_id");

-- CreateIndex
CREATE UNIQUE INDEX "xxxxx_xxxxx_name_key" ON "xxxxx_xxxxx"("name");

-- CreateIndex
CREATE INDEX "xxxxx_xxxxx_creator_id_idx" ON "xxxxx_xxxxx"("creator_id");

-- CreateIndex
CREATE UNIQUE INDEX "parent1_name_key" ON "parent1"("name");

-- CreateIndex
CREATE INDEX "parent1_creator_id_idx" ON "parent1"("creator_id");

-- CreateIndex
CREATE INDEX "parent1_organization_id_idx" ON "parent1"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "parent_only_name_key" ON "parent_only"("name");

-- CreateIndex
CREATE INDEX "parent_only_creator_id_idx" ON "parent_only"("creator_id");

-- CreateIndex
CREATE INDEX "role_creator_id_idx" ON "role"("creator_id");

-- CreateIndex
CREATE INDEX "organization_creator_id_idx" ON "organization"("creator_id");

-- CreateIndex
CREATE INDEX "permission_creator_id_idx" ON "permission"("creator_id");

-- CreateIndex
CREATE UNIQUE INDEX "permission_name_role_id_key" ON "permission"("name", "role_id");

-- CreateIndex
CREATE INDEX "procedure_creator_id_idx" ON "procedure"("creator_id");

-- CreateIndex
CREATE INDEX "procedure_assignee_id_idx" ON "procedure"("assignee_id");

-- CreateIndex
CREATE INDEX "resource_creator_id_idx" ON "resource"("creator_id");

-- CreateIndex
CREATE INDEX "resource_organization_id_idx" ON "resource"("organization_id");

-- CreateIndex
CREATE INDEX "booking_creator_id_idx" ON "booking"("creator_id");

-- CreateIndex
CREATE INDEX "shift_template_creator_id_idx" ON "shift_template"("creator_id");

-- CreateIndex
CREATE INDEX "shift_creator_id_idx" ON "shift"("creator_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_code_key" ON "product"("code");

-- CreateIndex
CREATE INDEX "product_creator_id_idx" ON "product"("creator_id");

-- CreateIndex
CREATE INDEX "inventory_creator_id_idx" ON "inventory"("creator_id");

-- CreateIndex
CREATE INDEX "purchase_order_creator_id_idx" ON "purchase_order"("creator_id");

-- CreateIndex
CREATE UNIQUE INDEX "leave_request_approvable_id_key" ON "leave_request"("approvable_id");

-- CreateIndex
CREATE INDEX "leave_request_creator_id_idx" ON "leave_request"("creator_id");

-- CreateIndex
CREATE INDEX "approvable_creator_id_idx" ON "approvable"("creator_id");

-- CreateIndex
CREATE INDEX "approval_flow_creator_id_idx" ON "approval_flow"("creator_id");

-- CreateIndex
CREATE INDEX "approval_history_creator_id_idx" ON "approval_history"("creator_id");

-- CreateIndex
CREATE INDEX "_UserOrganizations_B_index" ON "_UserOrganizations"("B");

-- CreateIndex
CREATE INDEX "_UserRoles_B_index" ON "_UserRoles"("B");

-- CreateIndex
CREATE UNIQUE INDEX "user_account_email_key" ON "user_account"("email");

-- CreateIndex
CREATE INDEX "user_account_api_key_idx" ON "user_account"("api_key");

-- CreateIndex
CREATE INDEX "user_account_creator_id_idx" ON "user_account"("creator_id");

-- CreateIndex
CREATE INDEX "_BeforeAfter_B_index" ON "_BeforeAfter"("B");

-- CreateIndex
CREATE INDEX "_ApprovalFlowOrder_B_index" ON "_ApprovalFlowOrder"("B");

-- AddForeignKey
ALTER TABLE "db_table" ADD CONSTRAINT "db_table_commentable_id_fkey" FOREIGN KEY ("commentable_id") REFERENCES "commentable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field" ADD CONSTRAINT "field_db_table_id_fkey" FOREIGN KEY ("db_table_id") REFERENCES "db_table"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field" ADD CONSTRAINT "field_reference_id_fkey" FOREIGN KEY ("reference_id") REFERENCES "db_table"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment" ADD CONSTRAINT "comment_commentable_id_fkey" FOREIGN KEY ("commentable_id") REFERENCES "commentable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "yyyyy_yyyyy" ADD CONSTRAINT "yyyyy_yyyyy_xxxxx_xxxxx_id_fkey" FOREIGN KEY ("xxxxx_xxxxx_id") REFERENCES "xxxxx_xxxxx"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent1" ADD CONSTRAINT "parent1_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent1_child1" ADD CONSTRAINT "parent1_child1_parent1_id_fkey" FOREIGN KEY ("parent1_id") REFERENCES "parent1"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent1_child2" ADD CONSTRAINT "parent1_child2_parent1_id_fkey" FOREIGN KEY ("parent1_id") REFERENCES "parent1"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent1_list" ADD CONSTRAINT "parent1_list_parent1_id_fkey" FOREIGN KEY ("parent1_id") REFERENCES "parent1"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission" ADD CONSTRAINT "permission_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedure" ADD CONSTRAINT "procedure_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "procedure"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource" ADD CONSTRAINT "resource_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking" ADD CONSTRAINT "booking_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_per_item" ADD CONSTRAINT "purchase_per_item_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_per_item" ADD CONSTRAINT "purchase_per_item_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_approvable_id_fkey" FOREIGN KEY ("approvable_id") REFERENCES "approvable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_flow" ADD CONSTRAINT "approval_flow_approver_role_id_fkey" FOREIGN KEY ("approver_role_id") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_flow" ADD CONSTRAINT "approval_flow_requestor_role_id_fkey" FOREIGN KEY ("requestor_role_id") REFERENCES "role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_request" ADD CONSTRAINT "approval_request_approvable_id_fkey" FOREIGN KEY ("approvable_id") REFERENCES "approvable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_request" ADD CONSTRAINT "approval_request_approval_flow_id_fkey" FOREIGN KEY ("approval_flow_id") REFERENCES "approval_flow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_history" ADD CONSTRAINT "approval_history_approval_request_id_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "approval_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserOrganizations" ADD CONSTRAINT "_UserOrganizations_A_fkey" FOREIGN KEY ("A") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserRoles" ADD CONSTRAINT "_UserRoles_A_fkey" FOREIGN KEY ("A") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BeforeAfter" ADD CONSTRAINT "_BeforeAfter_A_fkey" FOREIGN KEY ("A") REFERENCES "procedure"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BeforeAfter" ADD CONSTRAINT "_BeforeAfter_B_fkey" FOREIGN KEY ("B") REFERENCES "procedure"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ApprovalFlowOrder" ADD CONSTRAINT "_ApprovalFlowOrder_A_fkey" FOREIGN KEY ("A") REFERENCES "approval_flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ApprovalFlowOrder" ADD CONSTRAINT "_ApprovalFlowOrder_B_fkey" FOREIGN KEY ("B") REFERENCES "approval_flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

