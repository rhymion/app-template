// audit_log operations kit: applies the real migration SQL to the test
// database, then checks the application role boundary and one cycle of the
// scheduled jobs on that role. Requires `db:push` + `db:apply-audit-log-sql`
// (as in `npm run test:e2e:build`). Truncates audit_log like
// audit_log_append_only.test.ts does, so run the flows serially
// (`vitest run --config vitest.flows.config.ts --no-file-parallelism`).
import os from 'node:os';
import path from 'node:path';
import { readFile, mkdtemp } from 'node:fs/promises';
import { loadEnvConfig } from '@next/env';

loadEnvConfig(path.resolve(process.cwd()), process.env.NODE_ENV !== 'production');

import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@/app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const { LocalDirectoryStorage } = await import('@/lib/audit-log-integrity/storage');
const { closeDigestPeriods, verifyDigests, ensurePartitions, previousMonth, exportPreviousMonth } = await import('@/lib/audit-log-ops/jobs');
const { S3ObjectLockStorage } = await import('@/lib/audit-log-ops/storage-s3');
const { createAuditLogStorageFromEnv } = await import('@/lib/audit-log-ops/storage-factory');

const MIGRATION = path.resolve(process.cwd(), '../prj/prisma/migrations/20261011235500_audit_log_append_only/migration.sql');
const ROLE_PASSWORD = 'app_runtime_test_password';

function ownerUrl(): string {
  return process.env.DATABASE_URL as string;
}

function roleUrl(): string {
  const url = new URL(ownerUrl());
  url.username = 'app_runtime';
  url.password = ROLE_PASSWORD;
  return url.toString();
}

async function asOwner<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: ownerUrl() });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

async function asRole<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: roleUrl() });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

describe('audit_log operations kit', () => {
  let rolePrisma: PrismaClient;
  let storageDir: string;

  beforeAll(async () => {
    await asOwner(async (c) => {
      await c.query(await readFile(MIGRATION, 'utf8'));
      await c.query(`ALTER ROLE app_runtime PASSWORD '${ROLE_PASSWORD}'`);
    });
    rolePrisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: roleUrl() }) });
  });

  beforeEach(async () => {
    await asOwner((c) => c.query('TRUNCATE TABLE audit_log, audit_log_digest'));
    storageDir = await mkdtemp(path.join(os.tmpdir(), 'audit-log-ops-'));
  });

  afterAll(async () => {
    await asOwner((c) => c.query('TRUNCATE TABLE audit_log, audit_log_digest'));
    await rolePrisma?.$disconnect();
  });

  it('migration SQL can be applied twice (idempotent)', async () => {
    await asOwner(async (c) => {
      await c.query(await readFile(MIGRATION, 'utf8'));
    });
  });

  describe('app_runtime role', () => {
    it('can SELECT and INSERT on audit_log', async () => {
      await asRole(async (c) => {
        await c.query(`INSERT INTO audit_log (id, action) VALUES ('role-1', 'test:role')`);
        const res = await c.query(`SELECT count(*)::int AS n FROM audit_log WHERE id = 'role-1'`);
        expect(res.rows[0].n).toBe(1);
      });
    });

    it('cannot UPDATE audit_log', async () => {
      await asOwner((c) => c.query(`INSERT INTO audit_log (id, action) VALUES ('role-2', 'test:role')`));
      await asRole(async (c) => {
        await expect(c.query(`UPDATE audit_log SET action = 'x'`)).rejects.toThrow(/permission denied/);
      });
    });

    it('cannot DELETE from audit_log', async () => {
      await asRole(async (c) => {
        await expect(c.query(`DELETE FROM audit_log`)).rejects.toThrow(/permission denied/);
      });
    });

    it('cannot TRUNCATE audit_log', async () => {
      await asRole(async (c) => {
        await expect(c.query('TRUNCATE TABLE audit_log')).rejects.toThrow(/permission denied/);
      });
    });

    it('cannot UPDATE, DELETE or TRUNCATE audit_log_digest', async () => {
      await asRole(async (c) => {
        await expect(c.query(`UPDATE audit_log_digest SET digest = 'x'`)).rejects.toThrow(/permission denied/);
        await expect(c.query('DELETE FROM audit_log_digest')).rejects.toThrow(/permission denied/);
        await expect(c.query('TRUNCATE TABLE audit_log_digest')).rejects.toThrow(/permission denied/);
      });
    });

    it('cannot change a partition of audit_log directly', async () => {
      await asRole(async (c) => {
        await expect(c.query('TRUNCATE TABLE audit_log_default')).rejects.toThrow(/permission denied/);
        await expect(c.query('DELETE FROM audit_log_default')).rejects.toThrow(/permission denied/);
      });
    });

    it('can UPDATE and DELETE on an ordinary table (TRUNCATE is not granted anywhere)', async () => {
      await asRole(async (c) => {
        await c.query('UPDATE app_setting SET id = id');
        await c.query('DELETE FROM app_setting WHERE false');
        await expect(c.query('TRUNCATE TABLE reaction')).rejects.toThrow(/permission denied/);
      });
    });

    it('cannot write the migration history table', async () => {
      await asOwner((c) => c.query('CREATE TABLE IF NOT EXISTS "_prisma_migrations" (id text)'));
      try {
        await asOwner((c) => c.query('REVOKE ALL ON TABLE "_prisma_migrations" FROM app_runtime'));
        await asRole(async (c) => {
          await expect(c.query('DELETE FROM "_prisma_migrations"')).rejects.toThrow(/permission denied/);
        });
      } finally {
        await asOwner((c) => c.query('DROP TABLE "_prisma_migrations"'));
      }
    });
  });

  describe('partition maintenance as app_runtime', () => {
    it('creates a month partition through the SECURITY DEFINER function, with no write rights on it', async () => {
      const far = new Date();
      far.setUTCMonth(far.getUTCMonth() + 3);
      const name = await asRole(async (c) => {
        const res = await c.query('SELECT audit_log_create_month_partition($1::timestamptz) AS name', [far.toISOString()]);
        return res.rows[0].name as string;
      });
      try {
        expect(name).toMatch(/^audit_log_\d{4}_\d{2}$/);
        await asRole(async (c) => {
          await expect(c.query(`TRUNCATE TABLE ${name}`)).rejects.toThrow(/permission denied/);
          await expect(c.query(`DELETE FROM ${name}`)).rejects.toThrow(/permission denied/);
          const second = await c.query('SELECT audit_log_create_month_partition($1::timestamptz) AS name', [far.toISOString()]);
          expect(second.rows[0].name).toBe(name);
        });
      } finally {
        await asOwner(async (c) => {
          await c.query(`ALTER TABLE audit_log DETACH PARTITION ${name}`);
          await c.query(`DROP TABLE ${name}`);
        });
      }
    });

    it('ensurePartitions job runs on the app_runtime connection', async () => {
      const names = await ensurePartitions(rolePrisma);
      expect(names).toHaveLength(2);
    });

    it('the function cannot be called by a role without EXECUTE', async () => {
      await asOwner(async (c) => {
        await c.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'audit_log_ops_noexec') THEN CREATE ROLE audit_log_ops_noexec LOGIN PASSWORD 'x'; END IF; END $$`);
        await c.query('GRANT CONNECT ON DATABASE ' + c.escapeIdentifier(new URL(ownerUrl()).pathname.slice(1)) + ' TO audit_log_ops_noexec');
      });
      const url = new URL(ownerUrl());
      url.username = 'audit_log_ops_noexec';
      url.password = 'x';
      const c = new Client({ connectionString: url.toString() });
      await c.connect();
      try {
        await expect(c.query('SELECT audit_log_create_month_partition(now())')).rejects.toThrow(/permission denied/);
      } finally {
        await c.end();
      }
    });
  });

  describe('job cycle on app_runtime', () => {
    const now = new Date('2026-03-12T05:00:00Z');

    async function seed() {
      await asOwner(async (c) => {
        await c.query(`INSERT INTO audit_log (id, action, created_at) VALUES
          ('j1', 'test:one', '2026-03-10T00:01:00Z'),
          ('j2', 'test:two', '2026-03-10T00:02:00Z'),
          ('j3', 'test:three', '2026-03-11T00:01:00Z')`);
      });
    }

    it('closes the ended periods then verifies the chain', async () => {
      await seed();
      const storage = new LocalDirectoryStorage(storageDir);
      expect(await closeDigestPeriods(rolePrisma, storage, now)).toBe(2);
      expect(await closeDigestPeriods(rolePrisma, storage, now)).toBe(0);
      expect(await verifyDigests(rolePrisma, storage)).toBe(2);
      expect(await rolePrisma.audit_log_digest.count()).toBe(2);
    });

    it('verify throws when a row was changed behind the trigger', async () => {
      await seed();
      const storage = new LocalDirectoryStorage(storageDir);
      await closeDigestPeriods(rolePrisma, storage, now);
      await asOwner(async (c) => {
        await c.query('ALTER TABLE audit_log DISABLE TRIGGER audit_log_append_only');
        try {
          await c.query(`UPDATE audit_log SET action = 'tampered' WHERE id = 'j2'`);
        } finally {
          await c.query('ALTER TABLE audit_log ENABLE TRIGGER audit_log_append_only');
        }
      });
      await expect(verifyDigests(rolePrisma, storage)).rejects.toThrow(/verification failed/);
    });

    it('exports the previous month and stages its hash without removing any rows', async () => {
      await seed();
      const storage = new LocalDirectoryStorage(storageDir);
      expect(previousMonth(new Date('2026-04-01T03:00:00Z'))).toBe('2026-03');
      expect(previousMonth(new Date('2026-01-01T03:00:00Z'))).toBe('2025-12');
      const exported = await exportPreviousMonth(rolePrisma, storage, new Date('2026-04-01T03:00:00Z'));
      expect(exported.rowCount).toBe(3);
      expect(await storage.get(exported.sha256Key)).toBe(`${exported.sha256}\n`);
      expect(await asOwner((c) => c.query('SELECT count(*)::int AS n FROM audit_log').then((r) => r.rows[0].n))).toBe(3);
    });
  });

  describe('storage', () => {
    it('S3 adapter writes with Object Lock retention and is write-once', async () => {
      const store = new Map<string, string>();
      const puts: Array<{ ObjectLockMode: string; ObjectLockRetainUntilDate: Date; IfNoneMatch: string }> = [];
      const client = {
        async putObject(p: { Key: string; Body: string; ObjectLockMode: 'COMPLIANCE'; ObjectLockRetainUntilDate: Date; IfNoneMatch: '*'; Bucket: string; ContentType: string }) {
          puts.push(p);
          store.set(`${p.Bucket}/${p.Key}`, p.Body);
        },
        async getObject(p: { Bucket: string; Key: string }) {
          return store.get(`${p.Bucket}/${p.Key}`) ?? null;
        },
      };
      const s = new S3ObjectLockStorage(client, 'bucket', 30, () => new Date('2026-03-01T00:00:00Z'));
      await s.put('a', 'one');
      await s.put('a', 'one');
      await expect(s.put('a', 'two')).rejects.toThrow(/Refusing to overwrite/);
      expect(await s.get('a')).toBe('one');
      expect(await s.get('missing')).toBeNull();
      expect(puts).toHaveLength(1);
      expect(puts[0].ObjectLockMode).toBe('COMPLIANCE');
      expect(puts[0].ObjectLockRetainUntilDate.toISOString()).toBe('2026-03-31T00:00:00.000Z');
      expect(() => new S3ObjectLockStorage(client, 'bucket', 0)).toThrow(/whole number of days/);
    });

    it('factory chooses storage from the environment and fails closed when unset', async () => {
      const local = await createAuditLogStorageFromEnv({ AUDIT_LOG_STORAGE_DIR: storageDir });
      await local.put('k', 'v');
      expect(await local.get('k')).toBe('v');
      await expect(createAuditLogStorageFromEnv({})).rejects.toThrow(/not configured/);
      await expect(createAuditLogStorageFromEnv({ AUDIT_LOG_S3_BUCKET: 'b' })).rejects.toThrow(/required/);
    });
  });
});
