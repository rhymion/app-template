-- CreateEnum
CREATE TYPE "ScheduledTaskRunStatus" AS ENUM ('running', 'succeeded', 'failed', 'not_due');

-- CreateTable
CREATE TABLE "scheduled_task_run" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "business_date" DATE NOT NULL,
    "status" "ScheduledTaskRunStatus" NOT NULL,
    "started_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(0),
    "error_message" TEXT,

    CONSTRAINT "scheduled_task_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scheduled_task_run_status_business_date_idx" ON "scheduled_task_run"("status", "business_date");

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_task_run_task_id_business_date_key" ON "scheduled_task_run"("task_id", "business_date");
