/*
  Warnings:

  - The `db_table_comment` table is removed. Its rows are migrated into the new
    `comment` table before the drop, so no data is lost.
  - `db_table` gains a required, unique `commentable_id` column. Existing rows
    are backfilled with a freshly generated id and a matching `commentable`
    row is inserted for each before the NOT NULL / UNIQUE constraints are
    applied.

*/

-- One-shot helper to mint cuid2-format ids for the backfill below.
-- Format-compatible with @paralleldrive/cuid2 (24 base36 chars, leading
-- lowercase letter) but uses random() instead of the reference algorithm's
-- sha3 mixer. Sufficient for unique backfill; dropped at the end of this
-- migration. App code keeps generating real cuid2s via Prisma.
CREATE OR REPLACE FUNCTION pg_temp.gen_cuid() RETURNS TEXT AS $$
DECLARE
  result TEXT := chr(97 + (random() * 26)::int);  -- first char: a-z
  v INT;
BEGIN
  FOR i IN 1..23 LOOP
    v := (random() * 36)::int;
    result := result || CASE
      WHEN v < 10 THEN chr(48 + v)   -- '0'-'9'
      ELSE              chr(87 + v)  -- 'a'-'z'  (87 + 10 = 97)
    END;
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- CreateTable (new tables first so we can migrate data into them)
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

-- AlterTable: add commentable_id as nullable so we can backfill existing rows.
ALTER TABLE "db_table" ADD COLUMN "commentable_id" TEXT;

-- Data migration: assign a fresh cuid to each db_table row and insert the
-- corresponding commentable rows.
UPDATE "db_table" SET "commentable_id" = pg_temp.gen_cuid();
INSERT INTO "commentable" ("id") SELECT "commentable_id" FROM "db_table";

-- Data migration: copy db_table_comment rows into comment, rewriting
-- db_table_id → db_table.commentable_id.
INSERT INTO "comment" ("id", "message", "commentable_id", "created_at", "updated_at", "creator_id")
SELECT c."id", c."message", d."commentable_id", c."created_at", c."updated_at", c."creator_id"
FROM "db_table_comment" c
JOIN "db_table" d ON d."id" = c."db_table_id";

-- DropForeignKey
ALTER TABLE "db_table_comment" DROP CONSTRAINT "db_table_comment_creator_id_fkey";

-- DropForeignKey
ALTER TABLE "db_table_comment" DROP CONSTRAINT "db_table_comment_db_table_id_fkey";

-- DropTable
DROP TABLE "db_table_comment";

-- Now enforce NOT NULL on db_table.commentable_id (safe: backfilled above).
ALTER TABLE "db_table" ALTER COLUMN "commentable_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "approvable" ADD COLUMN     "creator_id" TEXT;

-- CreateIndex
CREATE INDEX "comment_creator_id_idx" ON "comment"("creator_id");

-- CreateIndex
CREATE INDEX "approvable_creator_id_idx" ON "approvable"("creator_id");

-- CreateIndex
CREATE INDEX "approval_flow_creator_id_idx" ON "approval_flow"("creator_id");

-- CreateIndex
CREATE INDEX "approval_history_creator_id_idx" ON "approval_history"("creator_id");

-- CreateIndex
CREATE INDEX "booking_creator_id_idx" ON "booking"("creator_id");

-- CreateIndex
CREATE UNIQUE INDEX "db_table_commentable_id_key" ON "db_table"("commentable_id");

-- CreateIndex
CREATE INDEX "db_table_creator_id_idx" ON "db_table"("creator_id");

-- CreateIndex
CREATE INDEX "inventory_creator_id_idx" ON "inventory"("creator_id");

-- CreateIndex
CREATE INDEX "leave_request_creator_id_idx" ON "leave_request"("creator_id");

-- CreateIndex
CREATE INDEX "organization_creator_id_idx" ON "organization"("creator_id");

-- CreateIndex
CREATE INDEX "parent1_creator_id_idx" ON "parent1"("creator_id");

-- CreateIndex
CREATE INDEX "parent1_organization_id_idx" ON "parent1"("organization_id");

-- CreateIndex
CREATE INDEX "parent_only_creator_id_idx" ON "parent_only"("creator_id");

-- CreateIndex
CREATE INDEX "permission_creator_id_idx" ON "permission"("creator_id");

-- CreateIndex
CREATE INDEX "procedure_creator_id_idx" ON "procedure"("creator_id");

-- CreateIndex
CREATE INDEX "procedure_assignee_id_idx" ON "procedure"("assignee_id");

-- CreateIndex
CREATE INDEX "product_creator_id_idx" ON "product"("creator_id");

-- CreateIndex
CREATE INDEX "purchase_order_creator_id_idx" ON "purchase_order"("creator_id");

-- CreateIndex
CREATE INDEX "resource_creator_id_idx" ON "resource"("creator_id");

-- CreateIndex
CREATE INDEX "resource_organization_id_idx" ON "resource"("organization_id");

-- CreateIndex
CREATE INDEX "role_creator_id_idx" ON "role"("creator_id");

-- CreateIndex
CREATE INDEX "shift_creator_id_idx" ON "shift"("creator_id");

-- CreateIndex
CREATE INDEX "shift_template_creator_id_idx" ON "shift_template"("creator_id");

-- CreateIndex
CREATE INDEX "user_account_creator_id_idx" ON "user_account"("creator_id");

-- CreateIndex
CREATE INDEX "xxxxx_xxxxx_creator_id_idx" ON "xxxxx_xxxxx"("creator_id");

-- AddForeignKey
ALTER TABLE "db_table" ADD CONSTRAINT "db_table_commentable_id_fkey" FOREIGN KEY ("commentable_id") REFERENCES "commentable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment" ADD CONSTRAINT "comment_commentable_id_fkey" FOREIGN KEY ("commentable_id") REFERENCES "commentable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment" ADD CONSTRAINT "comment_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvable" ADD CONSTRAINT "approvable_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Drop the one-shot cuid helper (pg_temp self-cleans on session end, but be tidy).
DROP FUNCTION IF EXISTS pg_temp.gen_cuid();
