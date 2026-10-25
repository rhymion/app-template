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

### Inputs

| Variable / option | Meaning |
|-------------------|---------|
| `DATABASE_URL` | The application database. |
| `AUTH_SECRET` | The application's own value; it derives the file-name encryption key. |
| `OLD_STORE_BLOB_READ_WRITE_TOKEN` | Token of the **old** public Blob store. Needed by `delete-old` only (old objects are read over their public URL). |
| `NEW_STORE_BLOB_READ_WRITE_TOKEN` | Token of the **new** private Blob store. Selects Vercel Blob as the target. |
| `GCS_BUCKET_NAME` | Selects Google Cloud Storage as the target; also the bucket of old `/api/gcs/...` objects. |
| `OLD_LOCAL_DIR` | Old local files (default `public/uploads`). |
| `ATTACHMENT_LOCAL_DIR` | Target directory for the local backend (default `.uploads`). |
| `--backup-file <path>` | CSV of `attachment_id,old_path,new_key`; the rollback record. Required for a real run. Keep it outside the repository and do not commit it. |
| `--limit <n>` | Process at most `n` rows (a trial slice). |

Both Blob tokens are passed to the SDK explicitly on every call; the script never relies on the SDK's default
credential resolution (`BLOB_READ_WRITE_TOKEN`, OIDC).

## What the owner does, and when

TODO(variable names): the generator is gaining an explicit token variable for the new store's credentials at
deploy time (`ATTACHMENT_BLOB_READ_WRITE_TOKEN` is the working name). Replace the marked names below with the
final ones once the generator change is released.

1. **Create the new private store** (Vercel dashboard: Storage, Create Database, Blob, access **Private**).
   Under *Advanced Options* set a custom name for its token variable, for example
   `NEW_STORE_BLOB_READ_WRITE_TOKEN`, so it does not overwrite the existing `BLOB_READ_WRITE_TOKEN`. A store's
   access mode cannot be changed later. Select the environments that need it: Production and Preview are
   preselected, Development is not.
   **Do not click "Connect to Project" yet.** That button switches every Blob call of the project, old code
   included, to the new store as soon as it is pressed.
2. **Prepare the database.** Deploy the migration that adds `attachment.uploader_id` and
   `attachment.uploader_organization_id` (the migration is written at deploy time, together with the other
   schema changes).
3. **Run the dry run** against the production database from a trusted machine:
   `npx tsx scripts/migrations/03_rekey_attachments_to_private_storage.ts --dry-run`
   Check the counts. `unrecognised` and `unreadable` must be understood before continuing.
4. **Run the re-key** (the production run):
   `... --backup-file <secure path>/rekey.csv`
   Keep the backup file until step 9 is finished. Review the rows reported without an uploader by hand.
5. **Deploy the new code.** Pass the new store's token to the application under the variable named in the
   TODO above (`ATTACHMENT_BLOB_READ_WRITE_TOKEN`, to be confirmed). Until then the previous release keeps
   working, because nothing old has been deleted.
6. **Verify every row** (not a sample): each attachment must open through `GET /api/attachments/<id>` with the
   right file name. The owner signs off here.
7. **Optional, only after step 6:** adopt Vercel's recommended OIDC authentication by pressing "Connect to
   Project" on the new store, or rename the new token variable to the canonical `BLOB_READ_WRITE_TOKEN`. Then
   remove the old store's connection from the project.
8. **Run `delete-old`:** `... --phase delete-old --backup-file <secure path>/rekey.csv --yes`.
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

## Rollback

Before step 8: restore `path` from the backup file (`attachment_id` to `old_path`), redeploy the previous
release, and optionally remove the unreferenced new objects. After step 8 there is no way back.

## Local rehearsal

The script was exercised against a local test database and local files only. To repeat that: start the test
database (`npm run docker:up:test` inside `app-generator/`), seed a few `attachment` rows whose `path` is
`/uploads/<file>` with matching files under `public/uploads/`, then run the dry run, the re-key and `delete-old`
as above with no storage variables set (the target is `.uploads/`).
