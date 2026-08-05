-- cmd_574: json_schema.yaml `default:` declares a UI default for these two
-- fields, but the Prisma column had no matching `@default()` -- the new
-- validate_defaults_cross_schema() check (app-generator submodule) now
-- fails generate-code on this gap. Column-default-only change (ALTER
-- COLUMN ... SET DEFAULT): no data rewrite, no NOT NULL/type change,
-- existing rows are unaffected. Only future inserts that omit the column
-- start picking up the default at the DB level.

ALTER TABLE "inventory" ALTER COLUMN "quantity" SET DEFAULT 0;
ALTER TABLE "dashboard_widget" ALTER COLUMN "chart_type" SET DEFAULT 'column';
