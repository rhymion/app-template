// @vitest-environment node
// The target guard of the one-time attachment migration script: the new storage must be configured
// explicitly (a token set only on Vercel is invisible to the script, which used to fall back to local
// disk silently), and a Vercel Blob token must belong to the expected store. Pure functions only:
// importing the script connects to no database and runs no phase.
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { blobTokenStoreId, newBackend, newTarget } from './03_rekey_attachments_to_private_storage';

const TOKEN = 'vercel_blob_rw_AbC123_secret';

describe('newBackend', () => {
  it('refuses to run when no new storage is configured', () => {
    expect(() => newBackend({})).toThrow(/No new storage is configured/);
  });

  it('ignores the application variable BLOB_READ_WRITE_TOKEN', () => {
    expect(() => newBackend({ BLOB_READ_WRITE_TOKEN: TOKEN })).toThrow(/No new storage is configured/);
  });

  it('uses local disk only when ATTACHMENT_LOCAL_DIR is set explicitly', () => {
    expect(newBackend({ ATTACHMENT_LOCAL_DIR: '/tmp/new-store' })).toBe('local');
  });

  it('prefers GCS, then the new Blob store token, over local disk', () => {
    expect(newBackend({ NEW_STORE_BLOB_READ_WRITE_TOKEN: TOKEN, ATTACHMENT_LOCAL_DIR: '/tmp/x' })).toBe('vercel');
    expect(newBackend({ GCS_BUCKET_NAME: 'b', NEW_STORE_BLOB_READ_WRITE_TOKEN: TOKEN })).toBe('gcs');
  });
});

describe('newTarget', () => {
  it('reads the store id from a Blob token', () => {
    expect(blobTokenStoreId(TOKEN)).toBe('AbC123');
  });

  it('names the Blob store the token belongs to', () => {
    expect(newTarget({ NEW_STORE_BLOB_READ_WRITE_TOKEN: TOKEN })).toBe('vercel store=store_AbC123');
    expect(newTarget({ NEW_STORE_BLOB_READ_WRITE_TOKEN: TOKEN, NEW_STORE_BLOB_STORE_ID: 'store_abc123' })).toBe(
      'vercel store=store_AbC123',
    );
  });

  it('refuses a token of another store than NEW_STORE_BLOB_STORE_ID', () => {
    expect(() => newTarget({ NEW_STORE_BLOB_READ_WRITE_TOKEN: TOKEN, NEW_STORE_BLOB_STORE_ID: 'store_Other9' })).toThrow(
      /belongs to store AbC123/,
    );
  });

  it('names the GCS bucket and the local directory', () => {
    expect(newTarget({ GCS_BUCKET_NAME: 'bucket-1' })).toBe('gcs bucket=bucket-1');
    expect(newTarget({ ATTACHMENT_LOCAL_DIR: '/tmp/new-store' })).toBe(`local dir=${path.resolve('/tmp/new-store')}`);
  });

  it('refuses to run when no new storage is configured', () => {
    expect(() => newTarget({})).toThrow(/No new storage is configured/);
  });
});
