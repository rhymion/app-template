// Re-key stored attachments from public URLs / paths to opaque keys in private storage.
//
// Background: docs/knowledge/attachment-storage.md ("Adopting this version in an application that already
// holds attachments"). An earlier version stored `attachment.path` as a public Blob URL, an `/api/gcs/<path>`
// path or an `/uploads/<path>` path. The current code reads `attachment.path` as an opaque storage key and
// serves every file through `GET /api/attachments/<id>`.
//
// The script is generic: it reads nothing application-specific except the `attachment` model, and it
// discovers the owner tables (for the uploader backfill) from the database catalog. Copy it unchanged into
// another application and set the inputs below.
//
// Two phases, invoked separately:
//
//   rekey       (default) For each attachment whose `path` is not yet an opaque key: read the bytes from
//               the old location, store them under a fresh `crypto.randomUUID()` key in the new storage,
//               fill `encrypted_original_name` when it is NULL, backfill the uploader columns from the
//               linked owner, then point `path` at the new key. Nothing old is deleted.
//   delete-old  Delete the old objects of every row recorded in the backup file, after checking that the
//               row now points at an existing new object. Irreversible: run it only after every file has
//               been verified through GET /api/attachments/<id> (guide step 5).
//
// Properties:
//   - Idempotent and resumable: a row whose `path` is already an opaque key is skipped (only missing
//     provenance is filled), so a re-run after a crash or a partial failure continues where it stopped.
//   - `--dry-run` reads every old object and reports what would change; it writes nothing (no storage
//     write, no database write, no backup file).
//   - The update is guarded by the old `path` (compare-and-set); if a row changed meanwhile, the new
//     object is removed again and the row is reported as skipped.
//
// Inputs (environment; load them with `.env.local` or export them):
//   DATABASE_URL                          the application database (required)
//   AUTH_SECRET                           derives the file-name encryption key (required; the same value the
//                                         application runs with)
//   Old locations (read-only until delete-old):
//     OLD_STORE_BLOB_READ_WRITE_TOKEN     token of the OLD public Blob store (needed by delete-old only;
//                                         old objects are read over their public URL)
//     OLD_LOCAL_DIR                       directory of the old local files (default `public/uploads`)
//     GCS_BUCKET_NAME                     bucket of old `/api/gcs/<path>` objects (the same bucket holds
//                                         the new keys; Application Default Credentials)
//   New location (one of the three must be set, or both phases refuse to run):
//     GCS_BUCKET_NAME                     -> Google Cloud Storage
//     NEW_STORE_BLOB_READ_WRITE_TOKEN     -> Vercel Blob, private store. The token is always passed to the
//                                         SDK explicitly; the SDK's default credential resolution
//                                         (BLOB_READ_WRITE_TOKEN, OIDC) is never relied on. It must be set
//                                         in the shell (or a `.env*` file of the directory the script runs
//                                         from): a variable set on Vercel is not visible here.
//     NEW_STORE_BLOB_STORE_ID             optional: the new store's id (`store_...`). When set, the store id
//                                         inside NEW_STORE_BLOB_READ_WRITE_TOKEN must match it.
//     ATTACHMENT_LOCAL_DIR                -> local disk under this directory. Used only when neither of the
//                                         two above is set; it is never chosen by default, because a
//                                         missing token would otherwise move every file to the operator's
//                                         own disk while the database is updated to the new keys.
//   The first line of output names the target (`New storage backend: vercel store=store_<id>`).
//
// Options:
//   --phase rekey|delete-old   phase to run (default rekey)
//   --dry-run                  report only
//   --backup-file <path>       CSV of `attachment_id,old_path,new_key` (required for a real run). It is the
//                              rollback record: keep it OUTSIDE the repository and do not commit it.
//   --limit <n>                process at most n rows (rekey only)
//   --yes                      required for a real delete-old run
//
// Rollback (before delete-old): restore `path` from the backup file, e.g.
//   UPDATE attachment SET path = b.old_path FROM (VALUES ...) AS b(id, old_path, new_key) WHERE attachment.id = b.id;
// then redeploy the previous release. The new objects are unreferenced and can be removed or left in place.
// After delete-old the previous release cannot read the files again.
//
// Usage (from the app-generator directory, after `npm run generate-code`):
//   npx tsx scripts/migrations/03_rekey_attachments_to_private_storage.ts --dry-run
//   npx tsx scripts/migrations/03_rekey_attachments_to_private_storage.ts --backup-file /secure/path/rekey.csv
//   npx tsx scripts/migrations/03_rekey_attachments_to_private_storage.ts --phase delete-old --backup-file /secure/path/rekey.csv --yes
import path from 'node:path';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { loadEnvConfig } from '@next/env';
loadEnvConfig(path.resolve(process.cwd()), process.env.NODE_ENV !== 'production');
import type { Prisma as PrismaNamespace, PrismaClient } from '@/app/generated/prisma/client';
import { encryptFileName } from '@/lib/compliance/attachment_name_crypto';
import { UPLOAD_CONTENT_TYPE_BY_EXTENSION } from '@/lib/_upload_validation';
import { isStorageKey, localStorageRoot, newStorageKey } from '@/lib/attachment/storage';

// Connected in main(), so the pure helpers below can be imported by tests without a database.
let prisma: PrismaClient;
let Prisma: typeof PrismaNamespace;

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}
const DRY_RUN = process.argv.includes('--dry-run');
const PHASE = option('--phase') ?? 'rekey';
const BACKUP_FILE = option('--backup-file');
const LIMIT = option('--limit') ? Number(option('--limit')) : undefined;
const CONFIRMED = process.argv.includes('--yes');

const OLD_LOCAL_DIR = path.resolve(process.cwd(), process.env.OLD_LOCAL_DIR || 'public/uploads');
const NEW_BLOB_TOKEN = process.env.NEW_STORE_BLOB_READ_WRITE_TOKEN;
const OLD_BLOB_TOKEN = process.env.OLD_STORE_BLOB_READ_WRITE_TOKEN;

type Backend = 'gcs' | 'vercel' | 'local';

/** The backend of the NEW storage. BLOB_READ_WRITE_TOKEN is deliberately not consulted; local disk is never a default. */
export function newBackend(env: Record<string, string | undefined> = process.env): Backend {
  if (env.GCS_BUCKET_NAME) return 'gcs';
  if (env.NEW_STORE_BLOB_READ_WRITE_TOKEN) return 'vercel';
  if (env.ATTACHMENT_LOCAL_DIR) return 'local';
  throw new Error(
    'No new storage is configured in this shell. Export NEW_STORE_BLOB_READ_WRITE_TOKEN (Vercel Blob) or ' +
      'GCS_BUCKET_NAME; variables set on Vercel are not visible to this script. Set ATTACHMENT_LOCAL_DIR only ' +
      'to migrate to local disk on purpose.',
  );
}

/** The store id inside a Vercel Blob read-write token (`vercel_blob_rw_<storeId>_<secret>`). */
export function blobTokenStoreId(token: string): string {
  return token.split('_')[3] ?? '';
}

/**
 * Where the new objects go, for the first line of output. For Vercel Blob it names the store the token
 * belongs to, and refuses a token whose store differs from NEW_STORE_BLOB_STORE_ID when that is set.
 */
export function newTarget(env: Record<string, string | undefined> = process.env): string {
  const backend = newBackend(env);
  if (backend === 'gcs') return `gcs bucket=${env.GCS_BUCKET_NAME}`;
  if (backend === 'local') return `local dir=${localStorageRoot(env)}`;
  const storeId = blobTokenStoreId(env.NEW_STORE_BLOB_READ_WRITE_TOKEN!);
  const expected = env.NEW_STORE_BLOB_STORE_ID?.trim().replace(/^store_/, '');
  if (expected && expected.toLowerCase() !== storeId.toLowerCase()) {
    throw new Error(
      `NEW_STORE_BLOB_READ_WRITE_TOKEN belongs to store ${storeId}, but NEW_STORE_BLOB_STORE_ID is store_${expected}. ` +
        'Copy the token of the new store again.',
    );
  }
  return `vercel store=store_${storeId}`;
}

// Set in main() from newTarget(), before either phase runs.
let NEW_BACKEND: Backend;

type OldLocation =
  | { kind: 'url'; url: string }
  | { kind: 'gcs'; object: string }
  | { kind: 'local'; file: string };

/** Where an old `path` value points, or null when it is not a recognised old shape. */
function classify(oldPath: string): OldLocation | null {
  if (/^https?:\/\//i.test(oldPath)) return { kind: 'url', url: oldPath };
  for (const prefix of ['/api/gcs/']) {
    if (oldPath.startsWith(prefix)) return { kind: 'gcs', object: decodeURIComponent(oldPath.slice(prefix.length)) };
  }
  for (const prefix of ['/api/uploads/', '/uploads/']) {
    if (oldPath.startsWith(prefix)) {
      const relative = decodeURIComponent(oldPath.slice(prefix.length));
      const file = path.resolve(OLD_LOCAL_DIR, relative);
      // A stored value must never reach outside the old upload directory.
      if (file !== OLD_LOCAL_DIR && !file.startsWith(OLD_LOCAL_DIR + path.sep)) return null;
      return { kind: 'local', file };
    }
  }
  return null;
}

async function gcsBucket() {
  const { Storage } = await import('@google-cloud/storage');
  return new Storage().bucket(process.env.GCS_BUCKET_NAME!);
}

async function readOld(location: OldLocation): Promise<Buffer> {
  switch (location.kind) {
    case 'url': {
      const response = await fetch(location.url);
      if (!response.ok) throw new Error(`GET ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    }
    case 'gcs': {
      const [bytes] = await (await gcsBucket()).file(location.object).download();
      return bytes;
    }
    case 'local':
      return readFile(location.file);
  }
}

async function deleteOld(location: OldLocation): Promise<void> {
  switch (location.kind) {
    case 'url': {
      const { del } = await import('@vercel/blob');
      await del(location.url, { token: OLD_BLOB_TOKEN });
      return;
    }
    case 'gcs':
      await (await gcsBucket()).file(location.object).delete({ ignoreNotFound: true });
      return;
    case 'local':
      await rm(location.file, { force: true });
  }
}

async function putNew(key: string, body: Buffer, contentType: string): Promise<void> {
  if (NEW_BACKEND === 'vercel') {
    const { put } = await import('@vercel/blob');
    await put(key, body, { access: 'private', addRandomSuffix: false, contentType, token: NEW_BLOB_TOKEN });
    return;
  }
  // GCS and local disk are written directly, not through lib/attachment/storage.ts's putStoredObject():
  // that function picks its own backend and would follow a BLOB_READ_WRITE_TOKEN loaded from `.env.local`.
  if (NEW_BACKEND === 'gcs') {
    await (await gcsBucket()).file(key).save(body, { metadata: { contentType } });
    return;
  }
  const root = localStorageRoot();
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, key), body);
}

async function deleteNew(key: string): Promise<void> {
  if (NEW_BACKEND === 'vercel') {
    const { del } = await import('@vercel/blob');
    await del(key, { token: NEW_BLOB_TOKEN });
  } else if (NEW_BACKEND === 'gcs') {
    await (await gcsBucket()).file(key).delete({ ignoreNotFound: true });
  } else {
    await rm(path.join(localStorageRoot(), key), { force: true });
  }
}

async function newExists(key: string): Promise<boolean> {
  if (NEW_BACKEND === 'vercel') {
    const { head } = await import('@vercel/blob');
    return head(key, { token: NEW_BLOB_TOKEN }).then(() => true, () => false);
  }
  if (NEW_BACKEND === 'gcs') return (await (await gcsBucket()).file(key).exists())[0];
  return stat(path.join(localStorageRoot(), key)).then((s) => s.isFile(), () => false);
}

function displayName(oldPath: string): string {
  const base = oldPath.split(/[?#]/)[0].split('/').pop() ?? '';
  let decoded = base;
  try {
    decoded = decodeURIComponent(base);
  } catch {
    // keep the raw segment
  }
  return decoded.replace(/[\u0000-\u001f\u007f]/g, '').trim() || 'file';
}

function contentTypeFor(name: string): string {
  const extension = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  return UPLOAD_CONTENT_TYPE_BY_EXTENSION[extension] ?? 'application/octet-stream';
}

// ---- owner discovery for the uploader backfill -------------------------------------------------
// Owners are found from the catalog, not hard-coded: a table with a foreign key to `attachable`
// (bridge) or straight to `attachment` (direct field). Identifiers come from pg_catalog and are
// validated before they are placed in a statement (identifiers cannot be bound as parameters).

type Owner = { table: string; fkColumn: string; via: 'attachable' | 'attachment'; hasCreator: boolean; hasOrganization: boolean };
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

async function discoverOwners(): Promise<Owner[]> {
  const foreignKeys = await prisma.$queryRaw<{ table_name: string; column_name: string; target: string }[]>`
    SELECT cl.relname AS table_name, att.attname AS column_name, ref.relname AS target
    FROM pg_constraint con
    JOIN pg_class cl ON cl.oid = con.conrelid
    JOIN pg_class ref ON ref.oid = con.confrelid
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
    WHERE con.contype = 'f' AND array_length(con.conkey, 1) = 1
      AND ref.relname IN ('attachable', 'attachment')
      AND cl.relnamespace = 'public'::regnamespace
      AND cl.relname <> 'attachment'`;
  const columns = await prisma.$queryRaw<{ table_name: string; column_name: string }[]>`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name IN ('creator_id', 'organization_id')`;
  return foreignKeys
    .filter((fk) => IDENTIFIER.test(fk.table_name) && IDENTIFIER.test(fk.column_name))
    .map((fk) => ({
      table: fk.table_name,
      fkColumn: fk.column_name,
      via: fk.target as 'attachable' | 'attachment',
      hasCreator: columns.some((c) => c.table_name === fk.table_name && c.column_name === 'creator_id'),
      hasOrganization: columns.some((c) => c.table_name === fk.table_name && c.column_name === 'organization_id'),
    }));
}

type Provenance = { uploaderId: string | null; organizationId: string | null };

async function provenanceFor(
  owners: Owner[],
  attachment: { id: string; attachable_id: string | null },
): Promise<Provenance> {
  for (const owner of owners) {
    const key = owner.via === 'attachable' ? attachment.attachable_id : attachment.id;
    if (!key) continue;
    const table = Prisma.raw(`"${owner.table}"`);
    const fk = Prisma.raw(`"${owner.fkColumn}"`);
    const creator = Prisma.raw(owner.hasCreator ? '"creator_id"' : 'NULL');
    const organization = Prisma.raw(owner.hasOrganization ? '"organization_id"' : 'NULL');
    const rows = await prisma.$queryRaw<{ uploader: string | null; organization: string | null }[]>`
      SELECT ${creator} AS uploader, ${organization} AS organization FROM ${table} WHERE ${fk} = ${key} LIMIT 1`;
    if (rows.length > 0) return { uploaderId: rows[0].uploader, organizationId: rows[0].organization };
  }
  return { uploaderId: null, organizationId: null };
}

// ---- phases ------------------------------------------------------------------------------------

async function rekey(): Promise<number> {
  if (!DRY_RUN && !BACKUP_FILE) throw new Error('--backup-file is required for a real run (it is the rollback record).');
  if (BACKUP_FILE && !DRY_RUN && !existsSync(BACKUP_FILE)) writeFileSync(BACKUP_FILE, 'attachment_id,old_path,new_key\n', { mode: 0o600 });

  const owners = await discoverOwners();
  const rows = await prisma.attachment.findMany({
    orderBy: { id: 'asc' },
    select: {
      id: true,
      path: true,
      attachable_id: true,
      encrypted_original_name: true,
      uploader_id: true,
      uploader_organization_id: true,
    },
  });

  const counts = { rekeyed: 0, alreadyKey: 0, provenanceFilled: 0, unrecognised: 0, unreadable: 0, raced: 0 };
  let processed = 0;
  for (const row of rows) {
    const needsProvenance = row.uploader_id === null && row.uploader_organization_id === null;
    if (isStorageKey(row.path)) {
      counts.alreadyKey += 1;
      if (needsProvenance) {
        const found = await provenanceFor(owners, row);
        if ((found.uploaderId || found.organizationId) && !DRY_RUN) {
          await prisma.attachment.update({
            where: { id: row.id },
            data: { uploader_id: found.uploaderId, uploader_organization_id: found.organizationId },
          });
        }
        if (found.uploaderId || found.organizationId) counts.provenanceFilled += 1;
      }
      continue;
    }
    if (LIMIT !== undefined && processed >= LIMIT) break;
    processed += 1;

    const location = classify(row.path);
    if (!location) {
      counts.unrecognised += 1;
      console.warn(`attachment ${row.id}: unrecognised path shape, left unchanged`);
      continue;
    }
    let bytes: Buffer;
    try {
      bytes = await readOld(location);
    } catch (error) {
      counts.unreadable += 1;
      console.warn(`attachment ${row.id}: cannot read the old object (${(error as Error).message}), left unchanged`);
      continue;
    }

    const name = displayName(row.path);
    const found = needsProvenance ? await provenanceFor(owners, row) : { uploaderId: null, organizationId: null };
    if (DRY_RUN) {
      counts.rekeyed += 1;
      console.log(`attachment ${row.id}: would re-key ${bytes.length} bytes (${location.kind})`);
      continue;
    }

    const key = newStorageKey();
    // The backup line goes first: if the process stops after the object is stored but before the row is
    // updated, the old path is still on record and the stray new object is merely unreferenced.
    appendFileSync(BACKUP_FILE!, `${row.id},${JSON.stringify(row.path)},${key}\n`);
    await putNew(key, bytes, contentTypeFor(name));
    const encrypted = row.encrypted_original_name === null ? encryptFileName(name) : null;
    const result = await prisma.attachment.updateMany({
      where: { id: row.id, path: row.path },
      data: {
        path: key,
        ...(encrypted ? { encrypted_original_name: encrypted.encryptedName, name_iv: encrypted.iv } : {}),
        ...(needsProvenance ? { uploader_id: found.uploaderId, uploader_organization_id: found.organizationId } : {}),
      },
    });
    if (result.count === 0) {
      await deleteNew(key);
      counts.raced += 1;
      console.warn(`attachment ${row.id}: changed while running, left for the next run`);
      continue;
    }
    counts.rekeyed += 1;
    if (needsProvenance && (found.uploaderId || found.organizationId)) counts.provenanceFilled += 1;
  }

  console.log(JSON.stringify(counts));
  const unlinkedLegacy = await prisma.attachment.count({ where: { uploader_id: null } });
  console.log(`${unlinkedLegacy} attachment(s) have no uploader (unlinked legacy rows: review them by hand, guide step 3.4).`);
  return counts.unrecognised + counts.unreadable + counts.raced > 0 ? 1 : 0;
}

async function deleteOldPhase(): Promise<number> {
  if (!BACKUP_FILE || !existsSync(BACKUP_FILE)) throw new Error('--backup-file must name the CSV written by the rekey phase.');
  if (!DRY_RUN && !CONFIRMED) throw new Error('delete-old is irreversible: pass --yes (or --dry-run to preview).');
  const lines = readFileSync(BACKUP_FILE, 'utf8').split('\n').slice(1).filter(Boolean);
  const done = new Set<string>();
  let deleted = 0;
  let held = 0;
  for (const line of lines) {
    const match = /^([^,]+),(".*"),([^,]+)$/.exec(line);
    if (!match) throw new Error(`Malformed backup line: ${line}`);
    const [, id, quotedOld, key] = match;
    const oldPath = JSON.parse(quotedOld) as string;
    const row = await prisma.attachment.findUnique({ where: { id }, select: { path: true } });
    // Only an old object whose row demonstrably points at an existing new object may go.
    if (!row || row.path !== key || !(await newExists(key))) {
      held += 1;
      console.warn(`attachment ${id}: new object not confirmed, old object kept`);
      continue;
    }
    if (done.has(oldPath)) continue; // several rows may share one old object
    done.add(oldPath);
    const location = classify(oldPath);
    if (!location) continue;
    if (location.kind === 'url' && !new URL(location.url).hostname.endsWith('.blob.vercel-storage.com')) {
      held += 1;
      console.warn(`attachment ${id}: the old URL is not a Vercel Blob URL, delete it by hand`);
      continue;
    }
    if (DRY_RUN) {
      console.log(`attachment ${id}: would delete the old ${location.kind} object`);
    } else {
      try {
        await deleteOld(location);
      } catch (error) {
        held += 1;
        console.warn(`attachment ${id}: the old object could not be deleted (${(error as Error).message}), rerun later`);
        continue;
      }
    }
    deleted += 1;
  }
  console.log(JSON.stringify({ deleted, held }));
  return held > 0 ? 1 : 0;
}

async function main() {
  if (PHASE !== 'rekey' && PHASE !== 'delete-old') throw new Error(`Unknown --phase ${PHASE}`);
  // Both phases use the new storage (delete-old checks each new object before deleting the old one), so
  // the target is resolved and printed before anything else.
  const target = newTarget();
  NEW_BACKEND = newBackend();
  console.log(`New storage backend: ${target}${DRY_RUN ? ' (dry run: nothing is written)' : ''}`);
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required.');
  if (!process.env.AUTH_SECRET) throw new Error('AUTH_SECRET is required (file-name encryption).');
  const client = await import('@/app/generated/prisma/client');
  const { PrismaPg } = await import('@prisma/adapter-pg');
  Prisma = client.Prisma;
  prisma = new client.PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  process.exitCode = PHASE === 'rekey' ? await rekey() : await deleteOldPhase();
}

// Run only when executed as a script, not when a test imports the helpers above.
if (process.argv[1] && path.basename(process.argv[1]).startsWith('03_rekey_attachments_to_private_storage')) {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => prisma?.$disconnect());
}
