import { prisma } from './db-helpers';

/**
 * Inventory ledger read helpers shared by B-5 Phase2c D7 tests
 * (purchase_per_item reservation cancel + receiving_receipt_line terminal
 * reject no-op). Split out from approval_test_helpers.ts (cmd_433) since
 * these are inventory_transaction-specific, not approval/ledger-generic.
 */

export async function getInventoryTransactionsByBridge(inventory_transactionable_id: string) {
  const txs = await prisma.inventory_transaction.findMany({
    where: { inventory_transactionable_id },
    orderBy: { created_at: 'asc' },
  });
  return JSON.parse(JSON.stringify(txs));
}

export async function countAllInventoryTransactions() {
  return prisma.inventory_transaction.count();
}
