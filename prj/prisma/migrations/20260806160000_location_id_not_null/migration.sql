-- Verify and apply NOT NULL constraint for location_id.
-- These columns were added as nullable TEXT in earlier migrations but schema.prisma
-- now treats them as required (String, non-nullable).
--
-- FAIL-CLOSED: halts if any NULL location_id rows remain.
-- Do NOT silently pick a default location — ambiguous rows require human judgment.
-- Resolve via the backfill query in 20260805170000_location_id_fk §2.
DO $$
DECLARE null_inv_txn INTEGER;
DECLARE null_inv INTEGER;
BEGIN
  SELECT COUNT(*) INTO null_inv_txn FROM inventory_transaction WHERE location_id IS NULL;
  SELECT COUNT(*) INTO null_inv FROM inventory WHERE location_id IS NULL;
  IF null_inv_txn > 0 THEN
    RAISE EXCEPTION
      'Cannot add NOT NULL: inventory_transaction has % row(s) with NULL location_id. Backfill first.',
      null_inv_txn;
  END IF;
  IF null_inv > 0 THEN
    RAISE EXCEPTION
      'Cannot add NOT NULL: inventory has % row(s) with NULL location_id. Backfill first.',
      null_inv;
  END IF;
END $$;
ALTER TABLE "inventory_transaction" ALTER COLUMN "location_id" SET NOT NULL;
ALTER TABLE "inventory" ALTER COLUMN "location_id" SET NOT NULL;
