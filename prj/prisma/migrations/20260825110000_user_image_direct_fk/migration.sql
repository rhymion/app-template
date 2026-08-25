-- Consumer follow-up for the generator's user.image direct-attachment FK
-- migration: `user.image` moves from a plain string URL to a direct FK
-- (`user.image_id` -> `attachment.id`), matching the generator's default
-- schema.
--
-- Existing `image` values are DROPPED, not migrated, by explicit decision:
-- this repo is pre-customer (no real customer data at stake), and the
-- generator side already discontinued writing this column from the OAuth
-- provider's profile image going forward -- the only historical source
-- for a non-null value here. The stored values are external provider URLs
-- (e.g. https://lh3.googleusercontent.com/...), not locally uploaded
-- files; the `attachment` table's `path` column is served through this
-- app's own `/api/uploads/[...path]` route and is populated exclusively by
-- this app's own upload flow (see lib/upload.ts / app/api/upload/route.ts).
-- Synthesizing an `attachment` row per external URL to "preserve" it would
-- misrepresent that row's provenance (never actually uploaded through this
-- app) and could produce an attachment whose `path` this app's own
-- upload/serving code never wrote and cannot serve consistently. Dropping
-- is therefore the technically correct choice here, not merely the
-- expedient one.

-- DropColumn
ALTER TABLE "user" DROP COLUMN "image";

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "image_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "user_image_id_key" ON "user"("image_id");

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_image_id_fkey" FOREIGN KEY ("image_id") REFERENCES "attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
