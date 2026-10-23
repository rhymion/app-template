-- CreateTable
CREATE TABLE "app_setting" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "business_date" TEXT NOT NULL,
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(0) NOT NULL,
    "creator_id" TEXT NOT NULL,
    "updater_id" TEXT NOT NULL,

    CONSTRAINT "app_setting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "app_setting_organization_id_idx" ON "app_setting"("organization_id");

-- CreateIndex
CREATE INDEX "app_setting_creator_id_idx" ON "app_setting"("creator_id");

-- CreateIndex
CREATE INDEX "app_setting_updater_id_idx" ON "app_setting"("updater_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_setting_organization_id_key" ON "app_setting"("organization_id");

-- AddForeignKey
ALTER TABLE "app_setting" ADD CONSTRAINT "app_setting_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_setting" ADD CONSTRAINT "app_setting_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_setting" ADD CONSTRAINT "app_setting_updater_id_fkey" FOREIGN KEY ("updater_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Enforce "at most one tenant-wide default row" (organization_id IS NULL).
-- @@unique([organization_id]) above cannot express this: Postgres treats
-- every NULL as distinct from every other NULL under ordinary unique-index
-- semantics, so it would allow unlimited organization_id-IS-NULL rows.
-- See docs/knowledge/appendix/business-date-container.md for the full
-- derivation and empirical verification against Postgres 18.
CREATE UNIQUE INDEX "app_setting_default_row_unique"
  ON "app_setting" ((true))
  WHERE "organization_id" IS NULL;
