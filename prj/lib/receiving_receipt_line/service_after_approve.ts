// GENERATED ONCE — safe to edit (will not be overwritten on regeneration)
// B-5: inventory ledger write stub for receiving_receipt_line
// x-ledger-source event_type: receive
// Pattern: bridge create → business entity update → inventory_transaction INSERT → inventory cache update

import type { PrismaClient } from '@/app/generated/prisma/client';

type Tx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

/**
 * Called after receiving_receipt_line approval is confirmed.
 * Implements ledger write: INSERT into inventory_transaction + update inventory cache.
 *
 * Idempotency: check for existing inventory_transaction before writing.
 * Approved_via: pass approval_request.id as approvedVia for audit trail (R2 compliance).
 */
export async function afterApprove(
  tx: Tx,
  entityId: string,
  approvableId: string,
  approvedByUserId: string,
): Promise<void> {
  const entity = await tx.receiving_receipt_line.findFirst({
    where: { approvable_id: approvableId },
  });
  if (!entity) return;

  // FS-2 defensive guard: split invalidates approvable_id on the parent entity
  // (sets it to null). Redundant with the findFirst lookup above but kept as
  // a second layer per design — if the lookup strategy ever changes, this stays safe.
  if (!entity.approvable_id) return;

  // FS-3 defensive guard: ledger writes require a resolved inventory target.
  if (!entity.inventory_id) throw new Error('inventory_id required for ledger write (receiving_receipt_line)');

  // Idempotency guard: entity-level (preferred over approvable.approved_at check)
  // NOTE: approved_at is set by approve route BEFORE this function runs in the
  // same transaction, so approvable-level guard would always fire. Use entity-level
  // check instead: verify that no inventory_transaction exists for this source.
  if (entity.inventory_transactionable_id) {
    const existing = await tx.inventory_transaction.findFirst({
      where: { inventory_transactionable_id: entity.inventory_transactionable_id },
    });
    if (existing) return; // already written (idempotent)
  }

  // Step 1: Create bridge if not already exists
  const bridge = entity.inventory_transactionable_id
    ? { id: entity.inventory_transactionable_id }
    : await tx.inventory_transactionable.create({ data: {} });

  // Step 2: Link bridge to entity (if newly created)
  if (!entity.inventory_transactionable_id) {
    await tx.receiving_receipt_line.update({
      where: { id: entityId },
      data: { inventory_transactionable_id: bridge.id },
    });
  }

  // Step 3: Get inventory identity (O-6 non-normalized fields)
  const inventory = await tx.inventory.findUniqueOrThrow({
    where: { id: entity.inventory_id },
  });

  // Cross-product guard: inventory lot must belong to the same product as the line.
  // Divergence would write the receive ledger against the wrong product's cache — fail
  // hard inside this transaction so the status flip and all other writes roll back.
  if (inventory.product_id !== entity.product_id) {
    throw new Error(
      `Inventory ${entity.inventory_id} belongs to a different product than this line (different product)`
    );
  }

  // Step 4: INSERT inventory_transaction
  await tx.inventory_transaction.create({
    data: {
      inventory_transactionable_id: bridge.id,
      event_type: 'receive',
      quantity_delta: entity.receipt_quantity, // O-4
      reserved_delta: 0, // O-4
      product_id: inventory.product_id,    // O-6
      location_id: inventory.location_id,  // O-6, cmd_562: id-FK, not a name string
      lot_number: inventory.lot_number,     // O-6
      expiration_date: inventory.expiration_date, // O-6
      approved_via: approvableId,           // audit trail (R2)
      created_by_id: approvedByUserId,
      creator_id: approvedByUserId,
      updater_id: approvedByUserId,
    },
  });

  // Step 5: Update inventory cache (materialized SUM)
  await tx.inventory.update({
    where: { id: entity.inventory_id },
    data: {
      quantity: { increment: entity.receipt_quantity },
      reserved_quantity: { increment: 0 },
    },
  });
}
