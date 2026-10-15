-- The business date is read from app_setting: a pinned row supplies its stored date, an unpinned row uses today's
-- date in its timezone. The column becomes optional and every unpinned row's placeholder date is cleared.
ALTER TABLE "app_setting" ALTER COLUMN "business_date" DROP NOT NULL;

UPDATE "app_setting" SET "business_date" = NULL WHERE "is_pinned" = false;
