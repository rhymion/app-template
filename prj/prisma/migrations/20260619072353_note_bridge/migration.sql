/*
  Warnings:

  - A unique constraint covering the columns `[noteable_id]` on the table `product` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[noteable_id]` on the table `resource` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[noteable_id]` on the table `room` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `noteable_id` to the `product` table without a default value. This is not possible if the table is not empty.
  - Added the required column `noteable_id` to the `resource` table without a default value. This is not possible if the table is not empty.
  - Added the required column `noteable_id` to the `room` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "product" ADD COLUMN     "noteable_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "resource" ADD COLUMN     "noteable_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "room" ADD COLUMN     "noteable_id" TEXT NOT NULL;

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

-- CreateTable
CREATE TABLE "noteable" (
    "id" TEXT NOT NULL,

    CONSTRAINT "noteable_pkey" PRIMARY KEY ("id")
);

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
