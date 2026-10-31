# Migrating stored attachments to private storage

This runbook moves every attachment this application already holds from public URLs to opaque keys in private
storage. It is the application-side companion of the generator guide
`app-generator/docs/knowledge/attachment-storage.md` ("Adopting this version in an application that already
holds attachments"); read that guide first. The script is
`prj/scripts/migrations/03_rekey_attachments_to_private_storage.ts` (copied to `app-generator/scripts/migrations/`
by `npm run prj:sync`). It is generic and can be copied unchanged into another application built on the same
generator.

## What the script does

| Phase | Command | Effect |
|-------|---------|--------|
| Preview | `--dry-run` | Reads every old object and reports what would change. Writes nothing. |
| Re-key | (default) | For each row whose `path` is not yet an opaque key: copies the bytes to a new random key in the new storage, fills `encrypted_original_name` when it is empty, backfills `uploader_id` / `uploader_organization_id` from the linked owner record, then points `path` at the new key. Deletes nothing. |
| Delete old | `--phase delete-old --yes` | Deletes the old objects of the rows recorded in the backup file, only for rows that now point at an existing new object. Irreversible. |

It can be re-run safely: rows that already hold an opaque key are skipped, so a run that stopped half way is
continued by running it again. Rows it cannot handle (an unrecognised path, an object that cannot be read) are
reported and left unchanged; the exit code is then non-zero.

### How the store is chosen

Four facts decide which store a file goes to. Every problem in the troubleshooting table below comes from one of
them.

1. **The application addresses one Blob store explicitly on every call.** The generator version this repository
   pins (`app-generator/lib/attachment/storage.ts`, `blobTarget()`) resolves the store in this order:
   `ATTACHMENT_BLOB_READ_WRITE_TOKEN`, then `BLOB_STORE_ID` (the SDK authenticates with the short-lived Vercel OIDC
   token), then `BLOB_READ_WRITE_TOKEN`. The result is passed to every `put`, `get` and `del` call, so the order
   in which the Vercel Blob SDK itself would resolve credentials (an OIDC connection outranks
   `BLOB_READ_WRITE_TOKEN`) never applies. Setting `ATTACHMENT_BLOB_READ_WRITE_TOKEN` to the new store's token
   therefore selects the new store while the old store stays connected, whatever other Blob variables the project
   holds. Prefixed variables (`NEW_STORE_...`) are never read by the application.
2. **The deployed generator must contain that resolution.** A deployment built from a generator older than the
   explicit-token change does not read `ATTACHMENT_BLOB_READ_WRITE_TOKEN`: it keeps using the old store's
   credentials for private writes, and the upload fails with `Vercel Blob: Access denied, please provide a valid
   token for this resource.` Step 3 checks this before anything is switched.
3. **A Vercel environment variable applies only to the environments ticked for it, and only to deployments
   created after the change.** Staging deployments run in the **Preview** environment. A variable set for
   Production only is absent from staging, and an existing deployment keeps the values it was built with until it
   is redeployed. When none of `GCS_BUCKET_NAME`, a Blob credential or `ATTACHMENT_LOCAL_DIR` is present in a
   Vercel deployment, the storage module throws `No attachment storage backend is configured` instead of writing
   to the local disk.
4. **The script reads only the shell it runs in** (and the `.env*` files of the directory it runs from). It never
   sees a variable set on Vercel. It passes its tokens to the SDK explicitly, so the rules above do not apply to
   it; the store a token belongs to is part of the token itself (`vercel_blob_rw_<store id>_<secret>`).

### Inputs

| Variable / option | Where | Meaning |
|-------------------|-------|---------|
| `ATTACHMENT_BLOB_READ_WRITE_TOKEN` | Vercel project, Production **and** Preview | Not read by the script. The application's Blob store: the new private store's token, added by hand in step 6. |
| `BLOB_READ_WRITE_TOKEN` | Vercel project | Not read by the script. The old public store's token, set by its connection; untouched until step 9. |
| `NEW_STORE_BLOB_READ_WRITE_TOKEN`, `NEW_STORE_BLOB_STORE_ID`, `NEW_STORE_BLOB_WEBHOOK_PUBLIC_KEY` | Vercel project, added by the new store's connection in step 1; removed in step 9 | The new store. Nothing in the application reads them. |
| `NEW_STORE_BLOB_READ_WRITE_TOKEN`, `NEW_STORE_BLOB_STORE_ID` | The shell that runs the script (both phases) | The same values, exported by hand. The token selects Vercel Blob as the target; the script refuses a token whose store differs from `NEW_STORE_BLOB_STORE_ID`. |
| `OLD_STORE_BLOB_READ_WRITE_TOKEN` | The shell that runs `delete-old` | Token of the **old** public Blob store, copied from the old store's page (old objects are read over their public URL, so `rekey` does not need it). |
| `GCS_BUCKET_NAME` | The shell | Selects Google Cloud Storage as the target; also the bucket of old `/api/gcs/...` objects. |
| `ATTACHMENT_LOCAL_DIR` | The shell | Selects the local disk under this directory as the target. Used only when neither variable above is set; set it only on purpose (a local rehearsal). |
| `OLD_LOCAL_DIR` | The shell | Old local files (default `public/uploads`). |
| `DATABASE_URL` | The shell | The database being migrated (staging or production). |
| `AUTH_SECRET` | The shell | The application's own value; it derives the file-name encryption key. |
| `--backup-file <path>` | | CSV of `attachment_id,old_path,new_key`; the rollback record. Required for a real run. Keep it outside the repository and do not commit it. |
| `--limit <n>` | | Process at most `n` rows (a trial slice). |

Without `NEW_STORE_BLOB_READ_WRITE_TOKEN`, `GCS_BUCKET_NAME` or `ATTACHMENT_LOCAL_DIR`, both phases stop with
`No new storage is configured in this shell`. The local disk is never chosen by default: a token that is set only
on Vercel would otherwise send every file to the operator's own disk while the database is updated to the new
keys. Both Blob tokens are passed to the SDK explicitly on every call; the script never relies on the SDK's default
credential resolution (`BLOB_READ_WRITE_TOKEN`, OIDC).

## What the owner does, and when

Agents never create, connect, disconnect or delete a Vercel resource. Run the whole procedure on staging first,
then on production. Staging and production use different databases, so the script runs once per database, each
with its own backup file.

1. **Create the new private store from the project.** Open the project's **Storage** tab, create a Blob store
   with access **Private** (a store's access mode cannot be changed later), and in the dialog that connects it to
   the project set the environment variable prefix to `NEW_STORE` and tick Production and Preview. The project then
   has `NEW_STORE_BLOB_READ_WRITE_TOKEN`, `NEW_STORE_BLOB_STORE_ID` and `NEW_STORE_BLOB_WEBHOOK_PUBLIC_KEY`. Do not
   connect it with the default prefix: that replaces the old store's `BLOB_READ_WRITE_TOKEN`. The old store's
   connection stays as it is until step 9.
2. **Prepare the database.** Deploy the migration that adds `attachment.uploader_id` and
   `attachment.uploader_organization_id` (the migration is written at deploy time, together with the other
   schema changes). The old application code ignores the new columns, so this is safe to do first.
3. **Check that the deployed code contains the explicit-token change**, for staging and for production. Take the
   commit of the current deployment from its page in the Vercel dashboard, then in a checkout of this repository:

   ```bash
   git ls-tree <deployed commit> app-generator          # prints the generator commit the deployment was built with
   cd app-generator && git fetch origin
   git merge-base --is-ancestor 2f0d268d <generator commit> && echo contains || echo MISSING
   ```

   `contains` means the deployment reads `ATTACHMENT_BLOB_READ_WRITE_TOKEN`. On `MISSING`, deploy a commit whose
   generator pointer contains `2f0d268d` first; do not continue until both environments print `contains`.
4. **Run the dry run** from a trusted machine, with the variables exported in that shell:

   ```bash
   cd app-generator && npm run prj:sync
   export DATABASE_URL=… AUTH_SECRET=…
   export NEW_STORE_BLOB_READ_WRITE_TOKEN=… NEW_STORE_BLOB_STORE_ID=store_…
   node -p "new URL(process.env.DATABASE_URL).hostname"
   npx tsx scripts/migrations/03_rekey_attachments_to_private_storage.ts --dry-run
   ```

   The `node -p` line prints the database host only. It must be the host of the database you mean to migrate
   (staging or production), not the other one. The script's first line must read
   `New storage backend: vercel store=store_<id>` with the id of the new store. Check the counts.
   `unrecognised` and `unreadable` must be understood before continuing.
5. **Run the re-key**, first a small slice, then everything:

   ```bash
   npx tsx scripts/migrations/03_rekey_attachments_to_private_storage.ts --backup-file <secure path>/rekey.csv --limit 5
   npx tsx scripts/migrations/03_rekey_attachments_to_private_storage.ts --backup-file <secure path>/rekey.csv
   ```

   After the `--limit 5` run, open the new store's file browser and check that five objects appeared before
   running the rest. Keep the backup file until step 9 is finished. Review the rows reported without an uploader
   by hand.
   From this point the previous release cannot display the re-keyed files, so **step 6 follows immediately**
   (schedule the short window).
6. **Switch the application to the new store.**
   1. Add `ATTACHMENT_BLOB_READ_WRITE_TOKEN` to the project with the new store's token (the value of
      `NEW_STORE_BLOB_READ_WRITE_TOKEN`), ticking **both Production and Preview** (and Development if it is used
      locally; then run `vercel env pull`). Leave the old store's connection and `BLOB_READ_WRITE_TOKEN` as they
      are.
   2. Redeploy **both production and staging**: the variable reaches only deployments created after it.
   3. On staging, upload a file and check that it appears in the new store's file browser.
7. **Verify every row** (not a sample): each attachment must open through `GET /api/attachments/<id>` with the
   right file name, including a user's picture. The owner signs off here.
8. **Run `delete-old`.** It needs both tokens: it confirms each new object in the new store before deleting the
   old one. Copy the old store's read-write token from the old store's page.

   ```bash
   export OLD_STORE_BLOB_READ_WRITE_TOKEN=… NEW_STORE_BLOB_READ_WRITE_TOKEN=… NEW_STORE_BLOB_STORE_ID=store_…
   npx tsx scripts/migrations/03_rekey_attachments_to_private_storage.ts --phase delete-old --backup-file <secure path>/rekey.csv --dry-run
   npx tsx scripts/migrations/03_rekey_attachments_to_private_storage.ts --phase delete-old --backup-file <secure path>/rekey.csv --yes
   ```

   After this the previous release can no longer read the files.
9. **Clean up, then delete the old public store.**
   1. Disconnect the old store from the project. This removes the variables its connection added
      (`BLOB_READ_WRITE_TOKEN`, and `BLOB_STORE_ID` / `BLOB_WEBHOOK_PUBLIC_KEY` when present).
   2. Disconnect the new store's own prefixed connection. This removes the three `NEW_STORE_...` variables; the
      hand-added `ATTACHMENT_BLOB_READ_WRITE_TOKEN` is a separate variable and stays.
   3. Redeploy staging and production, and upload a file on each.
   4. Delete the old public store in the dashboard. Deletion cannot be undone, so it is last. URLs of files that
      were shared outside the application (an email, a chat message, a log) keep working until the old objects
      are deleted in step 8; deleting them is what revokes those URLs.

## URL columns of the sample entities

`product.spec_sheet_url` (`x-uri-kind: file`) and `asset.manual_url` are paste-a-URL columns: the form takes the
URL the user types and stores it unchanged. They are left as pasted URLs. Nothing in this application uploaded
to them (the upload route only ever created `attachment` rows; the seed and the Cypress specs write
`https://example.com/...` values), so the script has nothing to handle for them. A file field on those entities
would be a direct attachment (`product.warranty_card_id` is the existing example). In another application where
these columns do hold values created by this application's own uploads (public Blob URLs), move each value into
an `attachment` row first; the script then re-keys it like any other row.

## Rollback and redoing a migration

Before step 8: restore `path` from the backup file (`attachment_id` to `old_path`), for example

```sql
UPDATE attachment SET path = b.old_path FROM (VALUES ...) AS b(id, old_path, new_key)
WHERE attachment.id = b.id AND attachment.path = b.new_key;
```

redeploy the previous release if needed, and optionally remove the unreferenced new objects. After step 8 there is
no way back.

A rerun of the re-key skips every row whose `path` is already an opaque key (it counts them as `alreadyKey`). To
redo a migration whose files went to the wrong place, restore `path` from the backup file as above, then run the
re-key again with a new backup file: the rows get fresh keys in the store of the current token. Keep both backup
files and pass the new one to `delete-old`. Objects written to the wrong place are not removed by the script;
delete them by hand.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| The script stops with `No new storage is configured in this shell` | The token is set on Vercel but not exported in the shell (fact 4) | Export `NEW_STORE_BLOB_READ_WRITE_TOKEN` and `NEW_STORE_BLOB_STORE_ID` |
| The script stops with `... belongs to store X, but NEW_STORE_BLOB_STORE_ID is ...` | The exported token is another store's | Copy the new store's token again |
| A rerun of the re-key only counts `alreadyKey` | The rows already hold new keys | Restore from the backup file, then re-key (see above) |
| Upload fails with `Vercel Blob: Access denied, please provide a valid token for this resource.` | The deployment was built from a generator older than the explicit-token change, so it ignores `ATTACHMENT_BLOB_READ_WRITE_TOKEN` and writes with the old store's credentials (fact 2) | Run the check in step 3; deploy a commit that contains `2f0d268d` |
| Upload fails with `No attachment storage backend is configured` | No Blob credential is present in that deployment: not ticked for its environment (staging is Preview) or not redeployed since it was set (fact 3) | Tick the environment, redeploy |
| Attachments go to or are read from the wrong store | `ATTACHMENT_BLOB_READ_WRITE_TOKEN` holds another store's token, or is missing from that environment so the next variable in the order applies (fact 1) | Compare the store id inside the token; tick Production and Preview; redeploy |
| `delete-old` keeps every old object (`new object not confirmed`) | The new-store token is not exported, or the row was re-keyed again (a stale backup file) | Export the new store's token; use the latest backup file |

## Local rehearsal

The script was exercised against a local test database and local files only. To repeat that: start the test
database (`npm run docker:up:test` inside `app-generator/`), seed a few `attachment` rows whose `path` is
`/uploads/<file>` with matching files under `public/uploads/`, then run the dry run, the re-key and `delete-old`
as above with `ATTACHMENT_LOCAL_DIR=.uploads` set and no other storage variable (the target is `.uploads/`).
