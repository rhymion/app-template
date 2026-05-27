/*
  Warnings:

  - You are about to drop the column `user_account_id` on the `shift` table. All the data in the column will be lost.
  - You are about to drop the column `user_account_id` on the `shift_template` table. All the data in the column will be lost.
  - You are about to drop the `product_image` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `resource_attachment` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `resource_image` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `user_account` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[attachable_id]` on the table `product` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[attachable_id]` on the table `resource` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[slug]` on the table `tenant` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `attachable_id` to the `product` table without a default value. This is not possible if the table is not empty.
  - Added the required column `attachable_id` to the `resource` table without a default value. This is not possible if the table is not empty.
  - Added the required column `user_id` to the `shift` table without a default value. This is not possible if the table is not empty.
  - Added the required column `user_id` to the `shift_template` table without a default value. This is not possible if the table is not empty.
  - Added the required column `slug` to the `tenant` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `tenant` table without a default value. This is not possible if the table is not empty.
  - Made the column `name` on table `tenant` required. This step will fail if there are existing NULL values in that column.

*/

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 1: CUID2-compatible helper function (random 24-char ID, lowercase start)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pg_temp.gen_cuid() RETURNS TEXT AS $$
DECLARE
  result TEXT := chr(97 + ((random() * 26)::int % 26));
  v INT;
BEGIN
  FOR i IN 1..23 LOOP
    v := (random() * 36)::int % 36;
    result := result || CASE
      WHEN v < 10 THEN chr(48 + v)
      ELSE chr(87 + v)
    END;
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 2: Create new tables
-- user must come first — many FK constraints reference it
-- attachable before attachment (FK dependency)
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "api_key" TEXT,
    "image" TEXT,
    "emailVerified" TIMESTAMP(3),
    "tenant_id" TEXT NOT NULL DEFAULT 'default',
    "mfa_secret" TEXT,
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(0) NOT NULL,
    "creator_id" TEXT NOT NULL,
    "updater_id" TEXT NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachable" (
    "id" TEXT NOT NULL,

    CONSTRAINT "attachable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachment" (
    "id" TEXT NOT NULL,
    "type" INTEGER NOT NULL DEFAULT 0,
    "order" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "attachable_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(0) NOT NULL,

    CONSTRAINT "attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(0) NOT NULL,
    "creator_id" TEXT NOT NULL,
    "updater_id" TEXT NOT NULL,

    CONSTRAINT "dashboard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_widget" (
    "id" TEXT NOT NULL,
    "dashboard_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entity_name" TEXT NOT NULL,
    "chart_type" INTEGER NOT NULL DEFAULT 0,
    "group_by_field" TEXT NOT NULL,
    "filter_field" TEXT,
    "filter_value" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(0) NOT NULL,

    CONSTRAINT "dashboard_widget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "action" TEXT NOT NULL,
    "target_table" TEXT,
    "target_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfa_recovery_code" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "used_at" TIMESTAMPTZ(0),
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_recovery_code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 3: Add new columns as NULLABLE to existing tables
-- (NOT NULL will be enforced after backfill in Step 9)
-- ─────────────────────────────────────────────────────────────────────────────

-- product.attachable_id: nullable first, backfilled in Step 7, NOT NULL in Step 9
ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "attachable_id" TEXT;

-- resource.attachable_id: nullable first, backfilled in Step 8, NOT NULL in Step 9
ALTER TABLE "resource" ADD COLUMN IF NOT EXISTS "attachable_id" TEXT;

-- shift.user_id: nullable first, backfilled in Step 5, NOT NULL in Step 9
ALTER TABLE "shift" ADD COLUMN IF NOT EXISTS "user_id" TEXT;

-- shift_template.user_id: nullable first, backfilled in Step 5, NOT NULL in Step 9
ALTER TABLE "shift_template" ADD COLUMN IF NOT EXISTS "user_id" TEXT;

-- tenant: new columns (slug and updated_at nullable first; slug backfilled in Step 6)
ALTER TABLE "tenant"
  ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "creator_id" TEXT,
  ADD COLUMN IF NOT EXISTS "slug" TEXT,
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ(0),
  ADD COLUMN IF NOT EXISTS "updater_id" TEXT;
-- Backfill null/empty tenant names before setting NOT NULL
UPDATE "tenant" SET "name" = COALESCE(NULLIF("name", ''), "id", 'default')
WHERE "name" IS NULL OR "name" = '';
ALTER TABLE "tenant" ALTER COLUMN "name" SET NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 4: Migrate user_account → user
-- Column mapping:
--   user_account.id          → user.id
--   user_account.name        → user.name
--   user_account.email       → user.email
--   user_account.password    → user.password (was NOT NULL, now nullable)
--   user_account.api_key     → user.api_key
--   user_account.avatar      → user.image   (renamed)
--   user_account.created_at  → user.created_at
--   user_account.updated_at  → user.updated_at
--   user_account.creator_id  → user.creator_id
--   user_account.updater_id  → user.updater_id
--   (new) emailVerified      → NULL
--   (new) tenant_id          → 'default'
--   (new) mfa_secret         → NULL
--   (new) mfa_enabled        → false
--
-- Note: FK constraints on user.creator_id / user.updater_id are added in Step 11
-- so self-referential inserts are safe here.
-- ─────────────────────────────────────────────────────────────────────────────
-- Ensure 'default' tenant exists before user migration (FK requires it)
-- tenant new columns (slug, status, updated_at) were added in Step 3
INSERT INTO "tenant" ("id", "name", "slug", "status", "created_at", "updated_at")
VALUES ('default', 'Default', 'default', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE SET
  "slug" = COALESCE("tenant"."slug", 'default'),
  "status" = COALESCE("tenant"."status", 'active'),
  "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "user" (
  id, name, email, password, api_key, image,
  "emailVerified", tenant_id, mfa_secret, mfa_enabled,
  created_at, updated_at, creator_id, updater_id
)
SELECT
  id,
  name,
  email,
  password,
  api_key,
  avatar,       -- renamed: user_account.avatar → user.image
  NULL,         -- emailVerified (no equivalent in user_account)
  'default',    -- tenant_id: all existing users belong to the default tenant
  NULL,         -- mfa_secret
  false,        -- mfa_enabled
  created_at,
  updated_at,
  creator_id,
  updater_id
FROM "user_account"
WHERE NOT EXISTS (
  SELECT 1 FROM "user" WHERE "user"."id" = "user_account"."id"
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 5: Backfill shift.user_id and shift_template.user_id
-- user_account_id values are the same IDs now in the user table
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE "shift"
SET "user_id" = "user_account_id"
WHERE "user_id" IS NULL AND "user_account_id" IS NOT NULL;

UPDATE "shift_template"
SET "user_id" = "user_account_id"
WHERE "user_id" IS NULL AND "user_account_id" IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 6: Backfill tenant.slug and tenant.updated_at
-- slug: lowercase name, non-alphanumeric chars replaced with hyphens
-- updated_at: CURRENT_TIMESTAMP for all existing rows
-- ─────────────────────────────────────────────────────────────────────────────
-- Step 6: Backfill tenant.slug / updated_at (robust version)
-- COALESCE: name-derived slug first, fallback to id if result is empty
UPDATE "tenant"
SET
  "slug" = COALESCE(
    NULLIF(lower(regexp_replace("name", '[^a-zA-Z0-9]+', '-', 'g')), ''),
    "id"
  ),
  "updated_at" = CURRENT_TIMESTAMP
WHERE "slug" IS NULL OR "slug" = '';

-- Deduplicate slugs: append first 6 chars of id as suffix
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT id, slug FROM "tenant"
    WHERE slug IN (
      SELECT slug FROM "tenant" GROUP BY slug HAVING count(*) > 1
    )
    ORDER BY id
  LOOP
    UPDATE "tenant"
    SET slug = rec.slug || '-' || substring(rec.id, 1, 6)
    WHERE id = rec.id;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 7: Create attachable records and backfill product.attachable_id
-- One attachable per product (1:1 unique relationship)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  rec RECORD;
  new_id TEXT;
BEGIN
  FOR rec IN SELECT id FROM "product" WHERE "attachable_id" IS NULL LOOP
    new_id := pg_temp.gen_cuid();
    INSERT INTO "attachable" ("id") VALUES (new_id);
    UPDATE "product" SET "attachable_id" = new_id WHERE id = rec.id;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 8: Create attachable records and backfill resource.attachable_id
-- One attachable per resource (1:1 unique relationship)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  rec RECORD;
  new_id TEXT;
BEGIN
  FOR rec IN SELECT id FROM "resource" WHERE "attachable_id" IS NULL LOOP
    new_id := pg_temp.gen_cuid();
    INSERT INTO "attachable" ("id") VALUES (new_id);
    UPDATE "resource" SET "attachable_id" = new_id WHERE id = rec.id;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 9: Migrate product_image → attachment
-- Column mapping:
--   product_image.id         → attachment.id (kept for traceability)
--   product_image.name       → attachment.name
--   product_image.path       → attachment.path
--   product_image.product_id → (via product.attachable_id) → attachment.attachable_id
--   product_image.created_at → attachment.created_at
--   product_image.updated_at → attachment.updated_at
--   (new) type = 0           (image type)
--   (new) order = 0          (product_image had no order column)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO "attachment" (id, type, "order", name, path, attachable_id, created_at, updated_at)
SELECT
  pi.id,
  0,                  -- type: image
  0,                  -- order: product_image had no order column
  pi.name,
  pi.path,
  p.attachable_id,
  pi.created_at,
  pi.updated_at
FROM "product_image" pi
JOIN "product" p ON p.id = pi.product_id;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 10: Migrate resource_attachment → attachment
-- Column mapping:
--   resource_attachment.id          → attachment.id (kept)
--   resource_attachment.name        → attachment.name
--   resource_attachment.path        → attachment.path
--   resource_attachment.order       → attachment.order
--   resource_attachment.resource_id → (via resource.attachable_id) → attachment.attachable_id
--   resource_attachment.created_at  → attachment.created_at
--   resource_attachment.updated_at  → attachment.updated_at
--   (new) type = 0 (treat as generic file/image)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO "attachment" (id, type, "order", name, path, attachable_id, created_at, updated_at)
SELECT
  ra.id,
  0,                      -- type: image/file
  COALESCE(ra."order", 0),
  ra.name,
  ra.path,
  r.attachable_id,
  ra.created_at,
  ra.updated_at
FROM "resource_attachment" ra
JOIN "resource" r ON r.id = ra.resource_id;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 11: Migrate resource_image → attachment
-- Column mapping:
--   resource_image.id          → attachment.id (kept)
--   resource_image.name        → attachment.name
--   resource_image.path        → attachment.path
--   resource_image.resource_id → (via resource.attachable_id) → attachment.attachable_id
--   resource_image.created_at  → attachment.created_at
--   resource_image.updated_at  → attachment.updated_at
--   (new) type = 0, order = 0
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO "attachment" (id, type, "order", name, path, attachable_id, created_at, updated_at)
SELECT
  ri.id,
  0,   -- type: image
  0,   -- order: resource_image had no order column
  ri.name,
  ri.path,
  r.attachable_id,
  ri.created_at,
  ri.updated_at
FROM "resource_image" ri
JOIN "resource" r ON r.id = ri.resource_id;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 12: Drop old tables (data has been migrated above)
-- ─────────────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS "product_image";
DROP TABLE IF EXISTS "resource_attachment";
DROP TABLE IF EXISTS "resource_image";
DROP TABLE IF EXISTS "user_account";

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 13: Enforce NOT NULL constraints (all backfills complete)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "product" ALTER COLUMN "attachable_id" SET NOT NULL;
ALTER TABLE "resource" ALTER COLUMN "attachable_id" SET NOT NULL;
ALTER TABLE "shift" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "shift_template" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "tenant" ALTER COLUMN "slug" SET NOT NULL;
ALTER TABLE "tenant" ALTER COLUMN "updated_at" SET NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 14: Drop old columns (after data has been migrated to new columns)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "shift" DROP COLUMN IF EXISTS "user_account_id";
ALTER TABLE "shift_template" DROP COLUMN IF EXISTS "user_account_id";

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 15: CreateIndex
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "user_api_key_idx" ON "user"("api_key");

-- CreateIndex
CREATE INDEX "user_creator_id_idx" ON "user"("creator_id");

-- CreateIndex
CREATE INDEX "user_tenant_id_idx" ON "user"("tenant_id");

-- CreateIndex
CREATE INDEX "dashboard_creator_id_idx" ON "dashboard"("creator_id");

-- CreateIndex
CREATE INDEX "audit_log_actor_user_id_idx" ON "audit_log"("actor_user_id");

-- CreateIndex
CREATE INDEX "audit_log_target_table_target_id_idx" ON "audit_log"("target_table", "target_id");

-- CreateIndex
CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");

-- CreateIndex
CREATE INDEX "mfa_recovery_code_user_id_idx" ON "mfa_recovery_code"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "product_attachable_id_key" ON "product"("attachable_id");

-- CreateIndex
CREATE UNIQUE INDEX "resource_attachable_id_key" ON "resource"("attachable_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_slug_key" ON "tenant"("slug");

-- CreateIndex
CREATE INDEX "tenant_creator_id_idx" ON "tenant"("creator_id");

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 16: AddForeignKey
-- All FK constraints added last — data migration is complete by this point
-- ─────────────────────────────────────────────────────────────────────────────

-- AddForeignKey
ALTER TABLE "tenant" ADD CONSTRAINT "tenant_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant" ADD CONSTRAINT "tenant_updater_id_fkey" FOREIGN KEY ("updater_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "db_table" ADD CONSTRAINT "db_table_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "db_table" ADD CONSTRAINT "db_table_updater_id_fkey" FOREIGN KEY ("updater_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment" ADD CONSTRAINT "comment_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xxxxx_xxxxx" ADD CONSTRAINT "xxxxx_xxxxx_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xxxxx_xxxxx" ADD CONSTRAINT "xxxxx_xxxxx_updater_id_fkey" FOREIGN KEY ("updater_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent1" ADD CONSTRAINT "parent1_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent1" ADD CONSTRAINT "parent1_updater_id_fkey" FOREIGN KEY ("updater_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_only" ADD CONSTRAINT "parent_only_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_only" ADD CONSTRAINT "parent_only_updater_id_fkey" FOREIGN KEY ("updater_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_updater_id_fkey" FOREIGN KEY ("updater_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role" ADD CONSTRAINT "role_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role" ADD CONSTRAINT "role_updater_id_fkey" FOREIGN KEY ("updater_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization" ADD CONSTRAINT "organization_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization" ADD CONSTRAINT "organization_updater_id_fkey" FOREIGN KEY ("updater_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission" ADD CONSTRAINT "permission_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission" ADD CONSTRAINT "permission_updater_id_fkey" FOREIGN KEY ("updater_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedure" ADD CONSTRAINT "procedure_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedure" ADD CONSTRAINT "procedure_updater_id_fkey" FOREIGN KEY ("updater_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedure" ADD CONSTRAINT "procedure_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource" ADD CONSTRAINT "resource_attachable_id_fkey" FOREIGN KEY ("attachable_id") REFERENCES "attachable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource" ADD CONSTRAINT "resource_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource" ADD CONSTRAINT "resource_updater_id_fkey" FOREIGN KEY ("updater_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking" ADD CONSTRAINT "booking_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking" ADD CONSTRAINT "booking_updater_id_fkey" FOREIGN KEY ("updater_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_template" ADD CONSTRAINT "shift_template_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_template" ADD CONSTRAINT "shift_template_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_template" ADD CONSTRAINT "shift_template_updater_id_fkey" FOREIGN KEY ("updater_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift" ADD CONSTRAINT "shift_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift" ADD CONSTRAINT "shift_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift" ADD CONSTRAINT "shift_updater_id_fkey" FOREIGN KEY ("updater_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_attachable_id_fkey" FOREIGN KEY ("attachable_id") REFERENCES "attachable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_updater_id_fkey" FOREIGN KEY ("updater_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_updater_id_fkey" FOREIGN KEY ("updater_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_updater_id_fkey" FOREIGN KEY ("updater_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_updater_id_fkey" FOREIGN KEY ("updater_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvable" ADD CONSTRAINT "approvable_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_flow" ADD CONSTRAINT "approval_flow_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_flow" ADD CONSTRAINT "approval_flow_updater_id_fkey" FOREIGN KEY ("updater_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_history" ADD CONSTRAINT "approval_history_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_attachable_id_fkey" FOREIGN KEY ("attachable_id") REFERENCES "attachable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard" ADD CONSTRAINT "dashboard_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard" ADD CONSTRAINT "dashboard_updater_id_fkey" FOREIGN KEY ("updater_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_widget" ADD CONSTRAINT "dashboard_widget_dashboard_id_fkey" FOREIGN KEY ("dashboard_id") REFERENCES "dashboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfa_recovery_code" ADD CONSTRAINT "mfa_recovery_code_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserRoles" ADD CONSTRAINT "_UserRoles_B_fkey" FOREIGN KEY ("B") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserOrganizations" ADD CONSTRAINT "_UserOrganizations_B_fkey" FOREIGN KEY ("B") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
