-- AlterTable
ALTER TABLE "user" ADD COLUMN     "mfa_token_version" INTEGER NOT NULL DEFAULT 0;
