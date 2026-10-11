// GENERATED ONCE — safe to edit (will not be overwritten on regeneration)
// x-scheduled-tasks (bulk) handler for task_id: audit_log_digest_close
//
// Thin wrapper: close the ended digest periods. The work lives in lib/audit-log-ops/jobs.ts, shared
// with scripts/audit-log-digest.ts.
import { closeDigestPeriods } from '@/lib/audit-log-ops/jobs';

export async function closeAuditLogDigestPeriod(systemActorId: string): Promise<void> {
  void systemActorId;
  await closeDigestPeriods();
}
