-- AlterTable
ALTER TABLE "attachment" ADD COLUMN     "uploader_id" TEXT,
ADD COLUMN     "uploader_organization_id" TEXT;

-- CreateIndex
CREATE INDEX "attachment_uploader_id_idx" ON "attachment"("uploader_id");

-- AddForeignKey
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
