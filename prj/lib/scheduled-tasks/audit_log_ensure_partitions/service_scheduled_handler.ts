// GENERATED ONCE — safe to edit (will not be overwritten on regeneration)
// x-scheduled-tasks (bulk) handler for task_id: audit_log_ensure_partitions
//
// Thin wrapper: create the current and next month partitions. The work lives in lib/audit-log-ops/jobs.ts, shared
// with scripts/audit-log-digest.ts.
import { ensurePartitions } from '@/lib/audit-log-ops/jobs';

export async function ensureAuditLogPartitions(systemActorId: string): Promise<void> {
  void systemActorId;
  await ensurePartitions();
}
