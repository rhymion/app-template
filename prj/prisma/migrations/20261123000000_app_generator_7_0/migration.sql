-- Catch proj_c's database up with app-generator 7.0.0 / 7.0.1 (submodule
-- bump bca2731 -> cc78ac1). The generator ships no migrations; this file is
-- hand-written per app-generator docs/knowledge/migration-guide.md and the
-- 7.0.0 CHANGELOG "Schema changes and migration" section.
--
--   1. user.api_key (plaintext) -> user.api_key_hash + api_key_issued_at
--      (Issue #1157). NOT the DROP COLUMN that `prisma migrate diff`
--      proposes: that would lose every key. Taken from app-generator
--      prisma/sql/api_key_hash_migration.sql, which hashes each stored key in
--      place (lowercase-hex SHA-256 of its UTF-8 bytes, exactly what
--      hashApiKey() in lib/api-key.ts computes for a presented key), so
--      existing keys keep authenticating. See docs/knowledge/api-key-hashing.md.
--   2. user.mfa_last_totp_step (Issue #1283, TOTP replay protection).
--   3. audit_log.request_id (Issue #1306). audit_log is range-partitioned
--      (20261011235500_audit_log_append_only); ALTER TABLE on the partitioned
--      parent reaches every partition. Run as the table owner. Adding a
--      nullable column is not an UPDATE/DELETE, so the append-only triggers
--      do not fire, and closed-period digests keep verifying.
--   4. web_session table (Issue #1127, server-side session revocation).
--      Sessions issued before this upgrade have no row, so every user signs
--      in again once after deploy.
--   5. app_setting(business_date), app_setting(is_pinned) and
--      approval_request(status) indexes, matching the generator's models.
--
-- Not idempotent on purpose: a second run fails at the first statement
-- because api_key no longer exists. Test it on a copy of the database first:
-- keys that authenticated before must authenticate after.

BEGIN;

-- 1) API key: add the hash columns, hash every stored key in place, then drop
--    the plaintext column and its index.
ALTER TABLE "user"
  ADD COLUMN "api_key_hash" TEXT,
  ADD COLUMN "api_key_issued_at" TIMESTAMP(3);

-- An empty string is "no key", as it is to the old lookup. The issue time of a
-- key issued before this change is unknown and stays NULL.
UPDATE "user"
SET "api_key_hash" = encode(sha256(convert_to("api_key", 'UTF8')), 'hex')
WHERE "api_key" IS NOT NULL AND "api_key" <> '';

DROP INDEX IF EXISTS "user_api_key_idx";
ALTER TABLE "user" DROP COLUMN "api_key";
CREATE INDEX "user_api_key_hash_idx" ON "user"("api_key_hash");

-- 2) TOTP replay protection.
ALTER TABLE "user" ADD COLUMN "mfa_last_totp_step" INTEGER;

-- 3) Request id on audit rows.
ALTER TABLE "audit_log" ADD COLUMN "request_id" TEXT;

-- 4) Server-side web sessions.
CREATE TABLE "web_session" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(0) NOT NULL,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_session_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "web_session_user_id_idx" ON "web_session"("user_id");
CREATE INDEX "web_session_expires_at_idx" ON "web_session"("expires_at");

ALTER TABLE "web_session" ADD CONSTRAINT "web_session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5) Indexes the generator's built-in models declare but proj_c's copy of
--    prisma/schema.prisma lacked (pre-existing drift, closed now that
--    app_setting gets generated list screens that filter/sort on these).
CREATE INDEX "app_setting_business_date_idx" ON "app_setting"("business_date");
CREATE INDEX "app_setting_is_pinned_idx" ON "app_setting"("is_pinned");
CREATE INDEX "approval_request_status_idx" ON "approval_request"("status");

COMMIT;
