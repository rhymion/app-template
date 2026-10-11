// GENERATED ONCE — safe to edit (will not be overwritten on regeneration)
//
// AuditLogStorage on an S3 bucket with Object Lock. Every object is written
// with a retention date, so the bucket itself refuses overwrite and delete
// until it passes. The bucket, its Object Lock configuration and the
// credentials are created by ops; nothing here creates them.
//
// The AWS SDK is not a dependency of this repository. The factory loads
// @aws-sdk/client-s3 at run time, so a deployment that uses this adapter must
// install it; tests inject a client instead.
import type { AuditLogStorage } from '@/lib/audit-log-integrity/storage';

export type S3ObjectLockClient = {
  putObject(params: {
    Bucket: string;
    Key: string;
    Body: string;
    ContentType: string;
    ObjectLockMode: 'COMPLIANCE';
    ObjectLockRetainUntilDate: Date;
    IfNoneMatch: '*';
  }): Promise<void>;
  /** Returns the object body, or null when the key does not exist. */
  getObject(params: { Bucket: string; Key: string }): Promise<string | null>;
};

export class S3ObjectLockStorage implements AuditLogStorage {
  constructor(
    private readonly client: S3ObjectLockClient,
    private readonly bucket: string,
    private readonly retentionDays: number,
    private readonly now: () => Date = () => new Date(),
  ) {
    if (!Number.isInteger(retentionDays) || retentionDays < 1) {
      throw new Error(`Retention must be a whole number of days, got: ${retentionDays}`);
    }
  }

  async put(key: string, body: string): Promise<void> {
    const existing = await this.get(key);
    if (existing !== null) {
      if (existing === body) return;
      throw new Error(`Refusing to overwrite ${key}: stored content differs (write-once storage)`);
    }
    const retainUntil = new Date(this.now().getTime() + this.retentionDays * 24 * 60 * 60 * 1000);
    await this.client.putObject({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: 'application/json',
      ObjectLockMode: 'COMPLIANCE',
      ObjectLockRetainUntilDate: retainUntil,
      IfNoneMatch: '*',
    });
  }

  get(key: string): Promise<string | null> {
    return this.client.getObject({ Bucket: this.bucket, Key: key });
  }
}

export async function createS3ObjectLockStorageFromEnv(env: Record<string, string | undefined> = process.env): Promise<AuditLogStorage> {
  const bucket = env.AUDIT_LOG_S3_BUCKET;
  const region = env.AUDIT_LOG_S3_REGION;
  const retentionDays = Number(env.AUDIT_LOG_S3_RETENTION_DAYS);
  if (!bucket || !region || !env.AUDIT_LOG_S3_RETENTION_DAYS) {
    throw new Error('AUDIT_LOG_S3_BUCKET, AUDIT_LOG_S3_REGION and AUDIT_LOG_S3_RETENTION_DAYS are all required.');
  }
  const moduleName = '@aws-sdk/client-s3';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sdk: any = await import(/* webpackIgnore: true */ moduleName);
  const s3 = new sdk.S3Client({ region });
  const client: S3ObjectLockClient = {
    async putObject(params) {
      await s3.send(new sdk.PutObjectCommand(params));
    },
    async getObject(params) {
      try {
        const res = await s3.send(new sdk.GetObjectCommand(params));
        return await res.Body.transformToString('utf-8');
      } catch (err) {
        if ((err as { name?: string }).name === 'NoSuchKey') return null;
        throw err;
      }
    },
  };
  return new S3ObjectLockStorage(client, bucket, retentionDays);
}
