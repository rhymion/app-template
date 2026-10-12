-- CreateEnum
CREATE TYPE "Timezone" AS ENUM ('pacific_pago_pago', 'pacific_honolulu', 'pacific_marquesas', 'america_anchorage', 'america_los_angeles', 'america_denver', 'america_chicago', 'america_mexico_city', 'america_new_york', 'america_toronto', 'america_bogota', 'america_caracas', 'america_st_johns', 'america_sao_paulo', 'america_nuuk', 'atlantic_azores', 'utc', 'europe_london', 'europe_madrid', 'europe_paris', 'europe_berlin', 'europe_rome', 'africa_lagos', 'africa_cairo', 'africa_johannesburg', 'asia_jerusalem', 'europe_istanbul', 'europe_moscow', 'asia_tehran', 'asia_dubai', 'asia_kabul', 'asia_karachi', 'asia_kolkata', 'asia_kathmandu', 'asia_dhaka', 'asia_yangon', 'asia_bangkok', 'asia_jakarta', 'asia_shanghai', 'asia_hong_kong', 'asia_singapore', 'asia_manila', 'australia_perth', 'australia_eucla', 'asia_seoul', 'asia_tokyo', 'australia_adelaide', 'australia_sydney', 'australia_lord_howe', 'pacific_noumea', 'pacific_auckland', 'pacific_chatham', 'pacific_apia', 'pacific_kiritimati');

-- Convert app_setting.timezone from TEXT to the Timezone enum in place, keeping
-- existing rows. A stored value maps to the enum label obtained by lower-casing it
-- and replacing '/' and '-' with '_' ('UTC' -> utc, 'Asia/Tokyo' -> asia_tokyo,
-- 'America/Los_Angeles' -> america_los_angeles). Any value with no matching enum
-- label (unknown zone, empty string, free text) falls back to 'utc', the column default.
ALTER TABLE "app_setting" ALTER COLUMN "timezone" DROP DEFAULT;

ALTER TABLE "app_setting"
  ALTER COLUMN "timezone" TYPE "Timezone"
  USING (
    CASE
      WHEN lower(regexp_replace(btrim("timezone"), '[/-]', '_', 'g')) = ANY (enum_range(NULL::"Timezone")::text[])
        THEN lower(regexp_replace(btrim("timezone"), '[/-]', '_', 'g'))::"Timezone"
      ELSE 'utc'::"Timezone"
    END
  );

ALTER TABLE "app_setting" ALTER COLUMN "timezone" SET DEFAULT 'utc';

-- CreateIndex
CREATE INDEX "app_setting_timezone_idx" ON "app_setting"("timezone");

-- AlterTable
ALTER TABLE "dashboard_widget" ADD COLUMN "timezone" "Timezone" NOT NULL DEFAULT 'utc';
