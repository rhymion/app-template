-- cmd_569: drop the `note` table. It has been fully orphaned since
-- 20260708035552_sync_receiving_and_noteable_drift dropped the `noteable`
-- bridge that used to connect it to product/resource/room (the note table
-- itself was left behind with only direct organization_id/creator_id/
-- updater_id columns). It has never been declared in
-- code_generator/json_schema.yaml, so no generated code reads or writes it.
-- Row count re-verified 2026-08-05 (subtask_569a report): 0 rows.
DROP TABLE "note";
