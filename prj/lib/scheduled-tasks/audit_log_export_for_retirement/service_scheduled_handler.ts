// GENERATED ONCE — safe to edit (will not be overwritten on regeneration)
// x-scheduled-tasks (bulk) handler for task_id: audit_log_export_for_retirement
//
// Thin wrapper: stage the previous month export and its SHA-256 in storage (no detach or drop). The work lives in lib/audit-log-ops/jobs.ts, shared
// with scripts/audit-log-digest.ts.
import { exportPreviousMonth } from '@/lib/audit-log-ops/jobs';

export async function exportAuditLogMonthForRetirement(systemActorId: string): Promise<void> {
  void systemActorId;
  await exportPreviousMonth();
}
