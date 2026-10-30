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

1. **The application uses Vercel Blob only when `BLOB_READ_WRITE_TOKEN` is set in the deployment.** The generator
   version this repository pins (`app-generator/lib/attachment/storage.ts`) ignores `BLOB_STORE_ID` and every
   prefixed variable. Without `BLOB_READ_WRITE_TOKEN` it falls back to the local disk, which does not exist on
   Vercel: uploads fail with `ENOENT: no such file or directory, mkdir '/var/task/app-generator/.uploads'` and no
   attachment is displayed.
2. **The application passes no token to the Blob SDK**, so the SDK picks the store itself: an OIDC connection
   (`BLOB_STORE_ID` together with the `VERCEL_OIDC_TOKEN` that Vercel provides) outranks `BLOB_READ_WRITE_TOKEN`.
   An unprefixed `BLOB_STORE_ID` therefore redirects every Blob call, whatever `BLOB_READ_WRITE_TOKEN` says.
3. **A Vercel environment variable applies only to the environments ticked for it, and only to deployments
   created after the change.** Staging deployments run in the **Preview** environment. A variable set for
   Production only is absent from staging, and an existing deployment keeps the values it was built with until it
   is redeployed.
4. **The script reads only the shell it runs in** (and the `.env*` files of the directory it runs from). It never
   sees a variable set on Vercel. It passes its tokens to the SDK explicitly, so the rules above do not apply to
   it; the store a token belongs to is part of the token itself (`vercel_blob_rw_<store id>_<secret>`).

### Inputs

| Variable / option | Where | Meaning |
|-------------------|-------|---------|
| `BLOB_READ_WRITE_TOKEN` | Vercel project, Production **and** Preview | Not read by the script. Before step 5: the old public store's token (set by its connection). From step 5: the new private store's token, added by hand. |
| `NEW_STORE_BLOB_READ_WRITE_TOKEN`, `NEW_STORE_BLOB_STORE_ID`, `NEW_STORE_BLOB_WEBHOOK_PUBLIC_KEY` | Vercel project, added by the new store's connection in step 1; removed in step 7 | The new store. Nothing in the application reads them. |
| `NEW_STORE_BLOB_READ_WRITE_TOKEN`, `NEW_STORE_BLOB_STORE_ID` | The shell that runs the script (both phases) | The same values, exported by hand. The token selects Vercel Blob as the target; the script refuses a token whose store differs from `NEW_STORE_BLOB_STORE_ID`. |
| `OLD_STORE_BLOB_READ_WRITE_TOKEN` | The shell that runs `delete-old` | Token of the **old** public Blob store, saved in step 1 (old objects are read over their public URL, so `rekey` does not need it). |
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
   connect it with the default prefix: that replaces `BLOB_READ_WRITE_TOKEN` and adds `BLOB_STORE_ID`, so the next
   deployment would use the new, still empty store. The team-level *Storage, Create Database* page does not offer
   the prefix.
   Then copy the old store's read-write token from the old store's page and keep it as
   `OLD_STORE_BLOB_READ_WRITE_TOKEN` in a safe place. It is needed in step 8, after the old store is disconnected;
   if it is rejected then, copy it again from the old store's page.
2. **Prepare the database.** Deploy the migration that adds `attachment.uploader_id` and
   `attachment.uploader_organization_id` (the migration is written at deploy time, together with the other
   schema changes). The old application code ignores the new columns, so this is safe to do first.
3. **Run the dry run** from a trusted machine, with the variables exported in that shell:

   ```bash
   cd app-generator && npm run prj:sync
   export DATABASE_URL=… AUTH_SECRET=…
   export NEW_STORE_BLOB_READ_WRITE_TOKEN=… NEW_STORE_BLOB_STORE_ID=store_…
   npx tsx scripts/migrations/03_rekey_attachments_to_private_storage.ts --dry-run
   ```

   The first line must read `New storage backend: vercel store=store_<id>` with the id of the new store. Check the
   counts. `unrecognised` and `unreadable` must be understood before continuing.
4. **Run the re-key**, first a small slice, then everything:

   ```bash
   npx tsx scripts/migrations/03_rekey_attachments_to_private_storage.ts --backup-file <secure path>/rekey.csv --limit 5
   npx tsx scripts/migrations/03_rekey_attachments_to_private_storage.ts --backup-file <secure path>/rekey.csv
   ```

   After the `--limit 5` run, open the new store's file browser and check that five objects appeared before
   running the rest. Keep the backup file until step 9 is finished. Review the rows reported without an uploader
   by hand.
   From this point the previous release cannot display the re-keyed files, so **step 5 follows immediately**
   (schedule the short window).
5. **Switch the application to the new store and deploy the new code.**
   1. Disconnect the old store from the project. This removes the variables its connection added
      (`BLOB_READ_WRITE_TOKEN`, `BLOB_STORE_ID`, `BLOB_WEBHOOK_PUBLIC_KEY`); the store and its files stay.
   2. Add `BLOB_READ_WRITE_TOKEN` by hand with the new store's token (the value of
      `NEW_STORE_BLOB_READ_WRITE_TOKEN`), ticking **both Production and Preview** (and Development if it is used
      locally; then run `vercel env pull`).
   3. Check that no unprefixed `BLOB_STORE_ID` is left.
   4. Deploy the new code to **both production and staging**: the variable change reaches only deployments
      created after it.
   5. On staging, upload a file and check that it appears in the new store's file browser.
6. **Verify every row** (not a sample): each attachment must open through `GET /api/attachments/<id>` with the
   right file name, including a user's picture. The owner signs off here.
7. **Remove the prefixed variables:** disconnect the new store's own connection from the project. This removes
   `NEW_STORE_BLOB_READ_WRITE_TOKEN`, `NEW_STORE_BLOB_STORE_ID` and `NEW_STORE_BLOB_WEBHOOK_PUBLIC_KEY`. The
   application reads only the hand-added `BLOB_READ_WRITE_TOKEN`, which is a separate variable. Keep a copy of the
   new store's token outside Vercel for step 8. Then redeploy staging and upload a file there; if the upload fails,
   copy the token again from the new store's page into `BLOB_READ_WRITE_TOKEN` (Production and Preview) and
   redeploy both.
8. **Run `delete-old`.** It needs both tokens: it confirms each new object in the new store before deleting the
   old one.

   ```bash
   export OLD_STORE_BLOB_READ_WRITE_TOKEN=… NEW_STORE_BLOB_READ_WRITE_TOKEN=… NEW_STORE_BLOB_STORE_ID=store_…
   npx tsx scripts/migrations/03_rekey_attachments_to_private_storage.ts --phase delete-old --backup-file <secure path>/rekey.csv --dry-run
   npx tsx scripts/migrations/03_rekey_attachments_to_private_storage.ts --phase delete-old --backup-file <secure path>/rekey.csv --yes
   ```

   After this the previous release can no longer read the files.
9. **Delete the old public store** in the dashboard. Deletion cannot be undone, so it is last. URLs of files
   that were shared outside the application (an email, a chat message, a log) keep working until the old
   objects are deleted in step 8; deleting them is what revokes those URLs.

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
| Upload fails and the log shows `mkdir '/var/task/app-generator/.uploads'`; attachments are not displayed | `BLOB_READ_WRITE_TOKEN` is missing from that deployment: not ticked for its environment (staging is Preview) or not redeployed since it was set (facts 1 and 3) | Tick the environment, redeploy |
| Attachments go to or are read from the wrong store | An unprefixed `BLOB_STORE_ID` is set (fact 2), or `BLOB_READ_WRITE_TOKEN` holds another store's token | Remove the store connection that added it; compare the store id inside the token |
| `delete-old` keeps every old object (`new object not confirmed`) | The new-store token is not exported, or the row was re-keyed again (a stale backup file) | Export the new store's token; use the latest backup file |

## Local rehearsal

The script was exercised against a local test database and local files only. To repeat that: start the test
database (`npm run docker:up:test` inside `app-generator/`), seed a few `attachment` rows whose `path` is
`/uploads/<file>` with matching files under `public/uploads/`, then run the dry run, the re-key and `delete-old`
as above with `ATTACHMENT_LOCAL_DIR=.uploads` set and no other storage variable (the target is `.uploads/`).
