# audit_log operations runbook

How this deployment keeps `audit_log` append-only and verifiable. The mechanism
itself (row trigger, partitioning, digest chain) is described in app-generator's
`docs/knowledge/audit-log-append-only.md`; this page covers what this repository
adds on top and what has to be done in each deployed environment.

Steps marked **(Lord / ops)** change a deployed environment. They are performed
by a person with access to it, never by an automated agent, and the migration
file in this repository does not run itself against any deployed database.

> **Warning: the privilege separation is NOT active until `app_runtime` exists.**
> When the schema owner lacks CREATEROLE (typical for managed and preview
> databases), the migration still succeeds but skips creating `app_runtime` and
> all its grants. In that state the application, if it connects as the schema
> owner, can still `TRUNCATE` `audit_log` or drop its trigger; only the row
> trigger (blocking `UPDATE` / `DELETE`) and the digest chain remain. This is
> not a safe end state for production.
>
> To activate it later, as a privileged user run `CREATE ROLE app_runtime LOGIN;`
> and set its password, then as the schema owner re-run Parts 3 and 4 of
> `prj/prisma/migrations/20261011235500_audit_log_append_only/migration.sql`
> (idempotent; Part 4 must stay last), then point the app's `DATABASE_URL` at
> `app_runtime`. Verify with the checks in "Checks after a deployment" below.

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

The migration creates the role without a password, but only when the schema
owner holds CREATEROLE. Managed databases (including preview databases) often
do not; there the migration skips the role and every `app_runtime` grant with a
notice and still succeeds. Create the role with SQL as a privileged user
(`CREATE ROLE app_runtime LOGIN;`), then re-run the "Part 3" and "Part 4"
statements of the migration (they are idempotent) as the schema owner, in that
order.

1. **(Lord / ops)** Run `prisma migrate deploy` against the deployed database as
   the schema owner.
2. **(Lord / ops)** Set the role's password. `CREATE ROLE ... LOGIN` sets none, so
   until this step a connection as `app_runtime` fails with `password
   authentication failed`. Use a plaintext `ALTER ROLE`, fed through standard
   input so the password appears neither in the process arguments nor in the psql
   history:
   ```bash
   # PG* variables point at the owner of the target database; type the SQL, then Ctrl-D
   psql
   ALTER ROLE app_runtime PASSWORD '<long random password>';
   ```
   Do not use psql's `\password`: it sends a hashed password, which Neon does not
   accept. A role created with SQL needs a high-entropy password, so generate a
   long random one.
3. **(Lord / ops)** Set the deployed environment variables, assembled by hand
   (the Neon console's Connect dialog lists only the roles Neon manages, so it
   does not offer `app_runtime`):
   - `DATABASE_URL` = connection string for `app_runtime` with the **pooled**
     host (used by the running app).
   - `DIRECT_URL` = connection string for the schema owner with the
     **unpooled** host (read only by the Prisma CLI, i.e. `migrate deploy`; see
     `prisma.config.ts`).
4. **(Lord / ops)** Roles belong to a Neon branch. Repeat steps 1 to 3 for each
   branch that serves an environment (staging and production each need their own
   `app_runtime` and password).
5. **(Lord / ops)** `scripts/vercel-setup.sh` and `scripts/vercel-env.sh inject`
   set `DATABASE_URL` to the schema owner's pooled URL. After running either,
   set `DATABASE_URL` for each Vercel environment back to the `app_runtime`
   connection string.
6. **(Lord / ops)** Limit who holds the owner credential and hosting-console
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
- Connected as `app_runtime`, `SELECT current_user` returns `app_runtime`, and
  `UPDATE audit_log ...`, `DELETE FROM audit_log` and `TRUNCATE audit_log` each
  fail with "permission denied". When switching `PGUSER` in a shell, switch
  `PGPASSWORD` too: a leftover owner password hides a wrong-password failure
  behind a successful login as the owner.
- The four tasks show `succeeded` on the scheduled-task admin page after their
  first scheduled time. A run that fails with `The table public.scheduled_task_run
  does not exist in the current database` means the migrations that created that
  table were not applied to this database.

## Who holds access

Owner-role credential and database console access: _to be filled in by the Lord / ops._
