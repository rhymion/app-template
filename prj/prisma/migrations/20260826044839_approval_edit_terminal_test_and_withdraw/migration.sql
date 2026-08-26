-- CreateEnum
CREATE TYPE "ApprovalEditTerminalTestStatus" AS ENUM ('pending', 'approved', 'rejected', 'draft');

-- AlterEnum
ALTER TYPE "ApprovalRequestStatus" ADD VALUE 'withdrawn';

-- CreateTable
CREATE TABLE "approval_edit_terminal_test" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "ApprovalEditTerminalTestStatus" NOT NULL DEFAULT 'pending',
    "approvable_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(0) NOT NULL,
    "creator_id" TEXT NOT NULL,
    "updater_id" TEXT NOT NULL,

    CONSTRAINT "approval_edit_terminal_test_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "approval_edit_terminal_test_approvable_id_key" ON "approval_edit_terminal_test"("approvable_id");

-- CreateIndex
CREATE INDEX "approval_edit_terminal_test_creator_id_idx" ON "approval_edit_terminal_test"("creator_id");

-- CreateIndex
CREATE INDEX "approval_edit_terminal_test_updater_id_idx" ON "approval_edit_terminal_test"("updater_id");

-- AddForeignKey
ALTER TABLE "approval_edit_terminal_test" ADD CONSTRAINT "approval_edit_terminal_test_approvable_id_fkey" FOREIGN KEY ("approvable_id") REFERENCES "approvable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_edit_terminal_test" ADD CONSTRAINT "approval_edit_terminal_test_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_edit_terminal_test" ADD CONSTRAINT "approval_edit_terminal_test_updater_id_fkey" FOREIGN KEY ("updater_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
