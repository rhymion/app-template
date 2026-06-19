-- note bridge: adds the `noteable` through-table and a required `noteable_id`
-- on the existing parent tables (product, resource, room). Because those tables
-- may already hold rows in production, the column is added nullable, backfilled
-- with one fresh `noteable` per row, then promoted to NOT NULL. New tables
-- (note, reaction) are created empty so their NOT NULL columns are fine as-is.
--
-- E2E uses `db:push` against an empty DB, so this backfill path is only exercised
-- by `migrate deploy` against a populated (production) database.

-- ─────────────────────────────────────────────────────────────────────────────
-- CUID2-compatible helper (random 24-char id, lowercase start). pg_temp so it is
-- dropped automatically at end of session.
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

-- CreateTable (noteable first — product/resource/room/note FK to it)
CREATE TABLE "noteable" (
    "id" TEXT NOT NULL,

    CONSTRAINT "noteable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reaction" (
    "id" TEXT NOT NULL,
    "type" INTEGER NOT NULL,
    "user_id" TEXT NOT NULL,
    "comment_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(0) NOT NULL,

    CONSTRAINT "reaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "note" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "organization_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(0) NOT NULL,
    "creator_id" TEXT NOT NULL,
    "updater_id" TEXT NOT NULL,
    "noteable_id" TEXT NOT NULL,

    CONSTRAINT "note_pkey" PRIMARY KEY ("id")
);

-- AlterTable: add noteable_id NULLABLE first, backfill, then promote to NOT NULL.
ALTER TABLE "product" ADD COLUMN "noteable_id" TEXT;
ALTER TABLE "resource" ADD COLUMN "noteable_id" TEXT;
ALTER TABLE "room" ADD COLUMN "noteable_id" TEXT;

-- Backfill: one noteable per existing product
DO $$
DECLARE
  rec RECORD;
  new_id TEXT;
BEGIN
  FOR rec IN SELECT id FROM "product" WHERE "noteable_id" IS NULL LOOP
    new_id := pg_temp.gen_cuid();
    INSERT INTO "noteable" ("id") VALUES (new_id);
    UPDATE "product" SET "noteable_id" = new_id WHERE id = rec.id;
  END LOOP;
END $$;

-- Backfill: one noteable per existing resource
DO $$
DECLARE
  rec RECORD;
  new_id TEXT;
BEGIN
  FOR rec IN SELECT id FROM "resource" WHERE "noteable_id" IS NULL LOOP
    new_id := pg_temp.gen_cuid();
    INSERT INTO "noteable" ("id") VALUES (new_id);
    UPDATE "resource" SET "noteable_id" = new_id WHERE id = rec.id;
  END LOOP;
END $$;

-- Backfill: one noteable per existing room
DO $$
DECLARE
  rec RECORD;
  new_id TEXT;
BEGIN
  FOR rec IN SELECT id FROM "room" WHERE "noteable_id" IS NULL LOOP
    new_id := pg_temp.gen_cuid();
    INSERT INTO "noteable" ("id") VALUES (new_id);
    UPDATE "room" SET "noteable_id" = new_id WHERE id = rec.id;
  END LOOP;
END $$;

-- Promote to NOT NULL now that every row is backfilled
ALTER TABLE "product" ALTER COLUMN "noteable_id" SET NOT NULL;
ALTER TABLE "resource" ALTER COLUMN "noteable_id" SET NOT NULL;
ALTER TABLE "room" ALTER COLUMN "noteable_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "reaction_user_id_idx" ON "reaction"("user_id");

-- CreateIndex
CREATE INDEX "reaction_comment_id_idx" ON "reaction"("comment_id");

-- CreateIndex
CREATE UNIQUE INDEX "reaction_comment_id_user_id_type_key" ON "reaction"("comment_id", "user_id", "type");

-- CreateIndex
CREATE INDEX "note_creator_id_idx" ON "note"("creator_id");

-- CreateIndex
CREATE INDEX "note_organization_id_idx" ON "note"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_noteable_id_key" ON "product"("noteable_id");

-- CreateIndex
CREATE UNIQUE INDEX "resource_noteable_id_key" ON "resource"("noteable_id");

-- CreateIndex
CREATE UNIQUE INDEX "room_noteable_id_key" ON "room"("noteable_id");

-- AddForeignKey
ALTER TABLE "reaction" ADD CONSTRAINT "reaction_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reaction" ADD CONSTRAINT "reaction_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note" ADD CONSTRAINT "note_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note" ADD CONSTRAINT "note_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note" ADD CONSTRAINT "note_updater_id_fkey" FOREIGN KEY ("updater_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note" ADD CONSTRAINT "note_noteable_id_fkey" FOREIGN KEY ("noteable_id") REFERENCES "noteable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource" ADD CONSTRAINT "resource_noteable_id_fkey" FOREIGN KEY ("noteable_id") REFERENCES "noteable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_noteable_id_fkey" FOREIGN KEY ("noteable_id") REFERENCES "noteable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room" ADD CONSTRAINT "room_noteable_id_fkey" FOREIGN KEY ("noteable_id") REFERENCES "noteable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
