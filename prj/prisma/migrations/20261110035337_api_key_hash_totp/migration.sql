/*
  Warnings:

  - You are about to drop the column `api_key` on the `user` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "user_api_key_idx";

-- AlterTable
ALTER TABLE "user" DROP COLUMN "api_key",
ADD COLUMN     "api_key_hash" TEXT,
ADD COLUMN     "api_key_issued_at" TIMESTAMP(3),
ADD COLUMN     "mfa_last_totp_step" INTEGER;

-- CreateIndex
CREATE INDEX "user_api_key_hash_idx" ON "user"("api_key_hash");
