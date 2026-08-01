-- Class A Batch A3 (final): Int -> Prisma nativeEnum for 4 fields.
-- Prisma's default USING cast cannot cast integer directly to an enum type,
-- so each column is migrated via ADD new column -> CASE WHEN backfill ->
-- DROP old -> RENAME, per subtask_446i design (standard_pattern_non_nullable_*
-- / standard_pattern_nullable / special_case_reaction_type).

-- CreateEnum
CREATE TYPE "ReactionType" AS ENUM ('Like', 'Love', 'Laugh', 'Surprised', 'Sad');

-- CreateEnum
CREATE TYPE "DashboardWidgetChartType" AS ENUM ('pie', 'column', 'bar', 'line');

-- CreateEnum
CREATE TYPE "DashboardWidgetStackMode" AS ENUM ('grouped', 'stacked', 'standardized');

-- CreateEnum
CREATE TYPE "DashboardWidgetGroupByBucket" AS ENUM ('day', 'week', 'month', 'quarter', 'year');

-- AlterTable: dashboard_widget.chart_type/stack_mode/group_by_bucket
-- (same table, single migration: ADD COLUMN x3 -> UPDATE x3 -> DROP x3 -> RENAME x3)
ALTER TABLE "dashboard_widget" ADD COLUMN "chart_type_new" "DashboardWidgetChartType";
ALTER TABLE "dashboard_widget" ADD COLUMN "stack_mode_new" "DashboardWidgetStackMode";
ALTER TABLE "dashboard_widget" ADD COLUMN "group_by_bucket_new" "DashboardWidgetGroupByBucket";

-- chart_type: non-nullable, no @default
UPDATE "dashboard_widget" SET "chart_type_new" = CASE "chart_type"
  WHEN 0 THEN 'pie'::"DashboardWidgetChartType"
  WHEN 1 THEN 'column'::"DashboardWidgetChartType"
  WHEN 2 THEN 'bar'::"DashboardWidgetChartType"
  WHEN 3 THEN 'line'::"DashboardWidgetChartType"
END;

-- stack_mode: nullable, NULL input yields NULL via CASE automatically
UPDATE "dashboard_widget" SET "stack_mode_new" = CASE "stack_mode"
  WHEN 0 THEN 'grouped'::"DashboardWidgetStackMode"
  WHEN 1 THEN 'stacked'::"DashboardWidgetStackMode"
  WHEN 2 THEN 'standardized'::"DashboardWidgetStackMode"
  ELSE NULL
END;

-- group_by_bucket: nullable, NULL input yields NULL via CASE automatically
UPDATE "dashboard_widget" SET "group_by_bucket_new" = CASE "group_by_bucket"
  WHEN 0 THEN 'day'::"DashboardWidgetGroupByBucket"
  WHEN 1 THEN 'week'::"DashboardWidgetGroupByBucket"
  WHEN 2 THEN 'month'::"DashboardWidgetGroupByBucket"
  WHEN 3 THEN 'quarter'::"DashboardWidgetGroupByBucket"
  WHEN 4 THEN 'year'::"DashboardWidgetGroupByBucket"
  ELSE NULL
END;

ALTER TABLE "dashboard_widget" ALTER COLUMN "chart_type_new" SET NOT NULL;
-- stack_mode / group_by_bucket stay nullable: no SET NOT NULL

ALTER TABLE "dashboard_widget" DROP COLUMN "chart_type";
ALTER TABLE "dashboard_widget" DROP COLUMN "stack_mode";
ALTER TABLE "dashboard_widget" DROP COLUMN "group_by_bucket";

ALTER TABLE "dashboard_widget" RENAME COLUMN "chart_type_new" TO "chart_type";
ALTER TABLE "dashboard_widget" RENAME COLUMN "stack_mode_new" TO "stack_mode";
ALTER TABLE "dashboard_widget" RENAME COLUMN "group_by_bucket_new" TO "group_by_bucket";

-- AlterTable: reaction.type (non-nullable, no @default, @@unique([comment_id, user_id, type]))
-- Dropping/renaming the column also drops/recreates the dependent unique index.
ALTER TABLE "reaction" ADD COLUMN "type_new" "ReactionType";
UPDATE "reaction" SET "type_new" = CASE "type"
  WHEN 0 THEN 'Like'::"ReactionType"
  WHEN 1 THEN 'Love'::"ReactionType"
  WHEN 2 THEN 'Laugh'::"ReactionType"
  WHEN 3 THEN 'Surprised'::"ReactionType"
  WHEN 4 THEN 'Sad'::"ReactionType"
END;
ALTER TABLE "reaction" ALTER COLUMN "type_new" SET NOT NULL;
ALTER TABLE "reaction" DROP COLUMN "type";
ALTER TABLE "reaction" RENAME COLUMN "type_new" TO "type";

-- CreateIndex: @@unique([comment_id, user_id, type]) must be recreated after rename
-- (the original index was dropped by DROP COLUMN "type" above)
CREATE UNIQUE INDEX "reaction_comment_id_user_id_type_key" ON "reaction"("comment_id", "user_id", "type");
