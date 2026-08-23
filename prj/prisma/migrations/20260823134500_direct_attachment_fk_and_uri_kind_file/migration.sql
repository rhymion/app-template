-- DropForeignKey
ALTER TABLE "attachment" DROP CONSTRAINT "attachment_attachable_id_fkey";

-- AlterTable
ALTER TABLE "attachment" ALTER COLUMN "attachable_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "leave_request" ADD COLUMN     "medical_certificate_id" TEXT;

-- AlterTable
ALTER TABLE "product" ADD COLUMN     "spec_sheet_url" TEXT,
ADD COLUMN     "warranty_card_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "leave_request_medical_certificate_id_key" ON "leave_request"("medical_certificate_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_warranty_card_id_key" ON "product"("warranty_card_id");

-- AddForeignKey
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_attachable_id_fkey" FOREIGN KEY ("attachable_id") REFERENCES "attachable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_warranty_card_id_fkey" FOREIGN KEY ("warranty_card_id") REFERENCES "attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_medical_certificate_id_fkey" FOREIGN KEY ("medical_certificate_id") REFERENCES "attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

