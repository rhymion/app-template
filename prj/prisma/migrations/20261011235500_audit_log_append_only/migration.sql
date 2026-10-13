/*
  Hand-edited migration (SQL that Prisma's schema language cannot express).
  See docs/knowledge/audit-log-operations.md and, in app-generator,
  docs/knowledge/audit-log-append-only.md.

  0. Part 0 creates audit_log_digest (no earlier migration does; it
     matches the Prisma model, so a later `migrate diff` stays empty).
  1. Part 1 is app-generator's prisma/sql/audit_log_append_only.sql, verbatim:
     range-partitions audit_log on created_at, installs the row trigger that
     rejects UPDATE/DELETE on audit_log and audit_log_digest, and defines
     audit_log_create_month_partition().
  2. Part 2 makes audit_log_create_month_partition() SECURITY DEFINER so the
     application role can create next month's partition without holding
     CREATE privilege (local patch; the shipped template runs with the
     caller's privileges).
  3. Part 3 creates the application role app_runtime with SQL (not from a
     hosting console) and gives it ordinary rights on every table. Part 4
     then narrows audit_log and audit_log_digest to SELECT + INSERT. Part 4
     must stay last: a blanket grant after it would reopen UPDATE/DELETE.

  The role is created without a password. Whoever deploys this sets one
  (ALTER ROLE app_runtime PASSWORD ...) and points DATABASE_URL at it.
  Run by the schema owner through `prisma migrate deploy`; never by the
  application connection.
*/

-- Part 0: digest table (the Prisma model audit_log_digest)
CREATE TABLE IF NOT EXISTS "audit_log_digest" (
    "id" TEXT NOT NULL,
    "period_start" TIMESTAMPTZ(0) NOT NULL,
    "period_end" TIMESTAMPTZ(0) NOT NULL,
    "row_count" INTEGER NOT NULL,
    "digest" TEXT NOT NULL,
    "previous_digest" TEXT,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_digest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "audit_log_digest_period_start_key" ON "audit_log_digest"("period_start");

-- Part 1: append-only template (verbatim)
-- audit_log append-only template (idempotent; safe to run repeatedly).
--
-- Applied automatically after `prisma db push` for test databases
-- (npm run db:apply-audit-log-sql). A consumer adds the same statements to
-- one of its own Prisma migrations (a hand-edited migration.sql) at
-- deployment time; the generator ships no migrations.
-- See docs/knowledge/audit-log-append-only.md.
--
-- Run it as the table owner. It does three things:
--   1. Converts audit_log to a table range-partitioned on created_at (the
--      primary key is (id, created_at), declared in prisma/schema.prisma).
--   2. Installs a row trigger on audit_log and audit_log_digest that rejects
--      every UPDATE and DELETE.
--   3. Defines audit_log_create_month_partition(), the maintenance function
--      the retention procedure and the digest job use to add monthly
--      partitions.
-- TRUNCATE is not blocked by a row trigger; it is closed off for the
-- application role by privilege (see audit_log_app_role.sql) and covered for
-- the owner by the digest chain.

-- 1. Partition audit_log (no-op when it is already partitioned).
DO $$
BEGIN
  IF (SELECT c.relkind FROM pg_class c WHERE c.oid = to_regclass('audit_log')) <> 'p' THEN
    ALTER TABLE audit_log RENAME TO audit_log_unpartitioned;
    ALTER TABLE audit_log_unpartitioned RENAME CONSTRAINT audit_log_pkey TO audit_log_unpartitioned_pkey;
    ALTER TABLE audit_log_unpartitioned DROP CONSTRAINT IF EXISTS audit_log_actor_user_id_fkey;
    ALTER INDEX IF EXISTS audit_log_actor_user_id_idx RENAME TO audit_log_unpartitioned_actor_user_id_idx;
    ALTER INDEX IF EXISTS audit_log_target_table_target_id_idx RENAME TO audit_log_unpartitioned_target_idx;
    ALTER INDEX IF EXISTS audit_log_created_at_idx RENAME TO audit_log_unpartitioned_created_at_idx;

    CREATE TABLE audit_log (LIKE audit_log_unpartitioned INCLUDING DEFAULTS) PARTITION BY RANGE (created_at);
    ALTER TABLE audit_log ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id, created_at);
    ALTER TABLE audit_log ADD CONSTRAINT audit_log_actor_user_id_fkey
      FOREIGN KEY (actor_user_id) REFERENCES "user"(id) ON UPDATE CASCADE ON DELETE RESTRICT;
    CREATE INDEX audit_log_actor_user_id_idx ON audit_log (actor_user_id);
    CREATE INDEX audit_log_target_table_target_id_idx ON audit_log (target_table, target_id);
    CREATE INDEX audit_log_created_at_idx ON audit_log (created_at);

    -- Catch-all so an insert never fails for want of a monthly partition.
    CREATE TABLE audit_log_default PARTITION OF audit_log DEFAULT;

    INSERT INTO audit_log SELECT * FROM audit_log_unpartitioned;
    DROP TABLE audit_log_unpartitioned;
  END IF;
END
$$;

-- 2. Reject UPDATE and DELETE on audit_log and audit_log_digest. A row
-- trigger created on the partitioned parent is created on every partition.
CREATE OR REPLACE FUNCTION audit_log_reject_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END
$$;

DROP TRIGGER IF EXISTS audit_log_append_only ON audit_log;
CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_reject_change();

DROP TRIGGER IF EXISTS audit_log_digest_append_only ON audit_log_digest;
CREATE TRIGGER audit_log_digest_append_only
  BEFORE UPDATE OR DELETE ON audit_log_digest
  FOR EACH ROW EXECUTE FUNCTION audit_log_reject_change();

-- 3. Monthly partition maintenance. Creates the partition covering the month
-- that contains `month_start` (UTC) if it does not exist yet. It fails when
-- audit_log_default already holds rows in that month; create partitions
-- ahead of time (the digest job calls this for the current and next month).
CREATE OR REPLACE FUNCTION audit_log_create_month_partition(month_start timestamptz)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  first_day timestamptz := date_trunc('month', month_start AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  next_day timestamptz := first_day + interval '1 month';
  part_name text := 'audit_log_' || to_char(first_day AT TIME ZONE 'UTC', 'YYYY_MM');
BEGIN
  IF to_regclass(part_name) IS NULL THEN
    EXECUTE format('CREATE TABLE %I PARTITION OF audit_log FOR VALUES FROM (%L) TO (%L)',
                   part_name, first_day, next_day);
  END IF;
  RETURN part_name;
END
$$;

SELECT audit_log_create_month_partition(now());
SELECT audit_log_create_month_partition(now() + interval '1 month');

-- Part 2: let the application role run partition maintenance
-- A partition is a table, so the default privileges in Part 3 would give
-- app_runtime direct UPDATE/DELETE/TRUNCATE on it; the function revokes them
-- on every partition it creates (Part 4 does the same for existing ones).
CREATE OR REPLACE FUNCTION audit_log_create_month_partition(month_start timestamptz)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  first_day timestamptz := date_trunc('month', month_start AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  next_day timestamptz := first_day + interval '1 month';
  part_name text := 'audit_log_' || to_char(first_day AT TIME ZONE 'UTC', 'YYYY_MM');
BEGIN
  IF to_regclass(part_name) IS NULL THEN
    EXECUTE format('CREATE TABLE %I PARTITION OF audit_log FOR VALUES FROM (%L) TO (%L)',
                   part_name, first_day, next_day);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
      EXECUTE format('REVOKE ALL ON %I FROM app_runtime', part_name);
      EXECUTE format('GRANT SELECT ON %I TO app_runtime', part_name);
    END IF;
  END IF;
  RETURN part_name;
END
$$;
REVOKE EXECUTE ON FUNCTION audit_log_create_month_partition(timestamptz) FROM PUBLIC;

-- Part 3: application role and ordinary rights
-- Creating a role needs CREATEROLE, which a managed-database owner (preview
-- or hosted Postgres) may not hold. Create it when allowed; otherwise skip
-- Parts 3 and 4 with a notice and let the operator create the role and run
-- docs/knowledge/audit-log-operations.md "Create the application role".
-- Re-running the same statements later is safe (they are idempotent).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    BEGIN
      CREATE ROLE app_runtime LOGIN;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'app_runtime not created (no CREATEROLE); create it manually and grant per docs/knowledge/audit-log-operations.md';
      RETURN;
    END;
  END IF;

  EXECUTE format('GRANT CONNECT ON DATABASE %I TO app_runtime', current_database());
  GRANT USAGE ON SCHEMA public TO app_runtime;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_runtime;
  GRANT EXECUTE ON FUNCTION audit_log_create_month_partition(timestamptz) TO app_runtime;

  -- The migration history table is the owner's alone.
  IF to_regclass('_prisma_migrations') IS NOT NULL THEN
    REVOKE ALL ON TABLE "_prisma_migrations" FROM app_runtime;
  END IF;

  -- Part 4: narrow the audit tables last (SELECT + INSERT only; no UPDATE,
  -- DELETE or TRUNCATE). Nothing may grant broadly after this point.
  REVOKE ALL ON audit_log, audit_log_digest FROM app_runtime;
  GRANT SELECT, INSERT ON audit_log, audit_log_digest TO app_runtime;
  DECLARE
    part regclass;
  BEGIN
    FOR part IN SELECT inhrelid::regclass FROM pg_inherits WHERE inhparent = 'audit_log'::regclass LOOP
      EXECUTE format('REVOKE ALL ON %s FROM app_runtime', part);
      EXECUTE format('GRANT SELECT ON %s TO app_runtime', part);
    END LOOP;
  END;
END
$$;
