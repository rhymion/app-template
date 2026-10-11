# audit_log operations runbook

How this deployment keeps `audit_log` append-only and verifiable. The mechanism
itself (row trigger, partitioning, digest chain) is described in app-generator's
`docs/knowledge/audit-log-append-only.md`; this page covers what this repository
adds on top and what has to be done in each deployed environment.

Steps marked **(Lord / ops)** change a deployed environment. They are performed
by a person with access to it, never by an automated agent, and the migration
file in this repository does not run itself against any deployed database.

## What this repository contains

| Piece | Where |
|---|---|
| Migration: partitioning, row trigger, `app_runtime` role, grants | `prj/prisma/migrations/20261011235500_audit_log_append_only/migration.sql` |
| Four scheduled tasks | `x-scheduled-tasks` in `prj/code_generator/json_schema.yaml`; handlers in `prj/lib/scheduled-tasks/audit_log_*/` |
| Job library shared with `npm run audit-log:digest` | `prj/lib/audit-log-ops/jobs.ts` |
| Storage adapters (local directory, S3 Object Lock) | `prj/lib/audit-log-ops/storage-*.ts` |
| Tests | `prj/test/flows/audit_log_ops.test.ts` |

Test databases need nothing extra: `npm run test:e2e:build` and the other test
scripts already run `db:push` followed by `db:apply-audit-log-sql`.

## Roles and connections

Two roles are involved.

- **Schema owner** (the role that already owns the tables). Runs
  `prisma migrate deploy` and the manual retirement procedure below. Nobody
  connects as it day to day.
- **`app_runtime`**, created by the migration with SQL `CREATE ROLE` (a role
  created from a hosting console or API can be a member of a superuser-like
  group that bypasses the trigger). It has SELECT, INSERT, UPDATE and DELETE on
  every table, except:
  - `audit_log` and `audit_log_digest` (and every `audit_log` partition):
    SELECT and INSERT only (partitions: SELECT only, writes go through the
    parent).
  - `_prisma_migrations`: no access.
  - TRUNCATE is not granted on any table.

The migration creates the role without a password.

1. **(Lord / ops)** Run `prisma migrate deploy` against the deployed database as
   the schema owner.
2. **(Lord / ops)** Set the role's password: `ALTER ROLE app_runtime PASSWORD '...'`.
3. **(Lord / ops)** Set the deployed environment variables:
   - `DATABASE_URL` = connection string for `app_runtime` (used by the running app).
   - `DIRECT_URL` = direct (unpooled) connection string for the schema owner
     (read only by the Prisma CLI, i.e. `migrate deploy`; see `prisma.config.ts`).
4. **(Lord / ops)** Limit who holds the owner credential and hosting-console
   access to the database.

## Scheduled tasks

All four run on the application connection (`app_runtime`) through the
generator's scheduled-task mechanism. Failed or stuck runs appear on the
scheduled-task admin page (`/scheduled_task_run`) for members of the
`ScheduledTaskRunner` role, where they can be rerun or resolved.

| Task | Schedule (UTC) | What it does |
|---|---|---|
| `audit_log_digest_close` | 01:00 daily | Closes every ended day and stores its digest |
| `audit_log_digest_verify` | 01:15 daily, after close | Recomputes the chain; **fails the run on any mismatch** (possible tampering) |
| `audit_log_ensure_partitions` | 02:00 daily | Creates the current and next month partitions (no-op when they exist) |
| `audit_log_export_for_retirement` | 03:00 on the 1st | Writes the previous month's rows and their SHA-256 to storage. Does not detach or drop anything |

`audit_log_ensure_partitions` calls `audit_log_create_month_partition()`, which
the migration makes `SECURITY DEFINER` so `app_runtime` can use it without
holding CREATE privilege. A monthly partition must exist before its month
starts, otherwise rows land in `audit_log_default` and creating that month's
partition later fails.

## Storage

Digests and exports go to `AuditLogStorage`.

- `AUDIT_LOG_STORAGE_DIR`: a local directory. Tests and local runs only.
- `AUDIT_LOG_S3_BUCKET`, `AUDIT_LOG_S3_REGION`, `AUDIT_LOG_S3_RETENTION_DAYS`:
  an S3 bucket with Object Lock; every object is written in compliance mode with
  a retention date. The adapter needs `@aws-sdk/client-s3` installed in the
  deployment and credentials in the usual AWS environment variables.

**(Lord / ops)** Choosing the storage provider, creating the bucket with Object
Lock enabled, choosing the retention period and issuing credentials. Nothing in
this repository creates cloud resources. Until storage is configured the digest
and export tasks fail with "Audit log storage is not configured".

## Retiring an old month (manual)

Only after `audit_log_export_for_retirement` has stored the month. Performed by
whoever holds the schema-owner credential. No scheduled task does this.

1. Read the exported file `archive/audit_log_YYYY_MM.jsonl` and its
   `archive/audit_log_YYYY_MM.jsonl.sha256` back from storage, compute the
   SHA-256 of the file's bytes yourself, and confirm it equals the recorded
   value. Do not rely on the export job's exit status.
2. As the schema owner:
   ```sql
   ALTER TABLE audit_log DETACH PARTITION audit_log_YYYY_MM;
   DROP TABLE audit_log_YYYY_MM;
   ```
3. Run the verify task (or `npm run audit-log:digest -- verify`). Digest
   verification reads retired months from the stored export and checks them
   against the recorded SHA-256.
4. Record who did it, when, which partition and the verified hash in the
   operations log (not in this repository).

## Checks after a deployment

- `SELECT rolname FROM pg_roles WHERE rolname = 'app_runtime'` returns a row.
- As `app_runtime`, `UPDATE audit_log ...`, `DELETE FROM audit_log` and
  `TRUNCATE audit_log` each fail with "permission denied".
- The four tasks show `succeeded` on the scheduled-task admin page after their
  first scheduled time.

## Who holds access

Owner-role credential and database console access: _to be filled in by the Lord / ops._
