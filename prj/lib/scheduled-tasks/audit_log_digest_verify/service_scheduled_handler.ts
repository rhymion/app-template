// GENERATED ONCE — safe to edit (will not be overwritten on regeneration)
// x-scheduled-tasks (bulk) handler for task_id: audit_log_digest_verify
//
// Thin wrapper: recompute the digest chain; throws on any mismatch so the run is recorded as failed. The work lives in lib/audit-log-ops/jobs.ts, shared
// with scripts/audit-log-digest.ts.
import { verifyDigests } from '@/lib/audit-log-ops/jobs';

export async function verifyAuditLogDigest(systemActorId: string): Promise<void> {
  void systemActorId;
  await verifyDigests();
}
