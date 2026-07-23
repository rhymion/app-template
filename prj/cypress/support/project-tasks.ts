// Project-specific Cypress task registrations for app-template.
// Loaded by app-generator/cypress.config.ts via dynamic require in setupNodeEvents
// after prj:sync copies this file to app-generator/cypress/support/project-tasks.ts.
//
// Adding tasks: add entries to the returned object.
// Task names must not collide with base tasks in app-generator/cypress.config.ts.
// If a name collision occurs, this project task takes precedence (spread order).
// When adding a new helper function in prj/cypress/support/ for a non-default entity,
// add its task registration here too.
export function getProjectTasks(): Record<string, (...args: any[]) => any> {
  return {
    async 'db:getInventoryTransactionsByBridge'(params: { inventory_transactionable_id: string }) {
      const { getInventoryTransactionsByBridge } = require('./inventory_test_helpers');
      return await getInventoryTransactionsByBridge(params.inventory_transactionable_id);
    },
    async 'db:countAllInventoryTransactions'() {
      const { countAllInventoryTransactions } = require('./inventory_test_helpers');
      return await countAllInventoryTransactions();
    },
    async 'db:setupReceivingReceiptNotificationFixture'() {
      const { setupReceivingReceiptNotificationFixture } = require('./receiving_receipt/notification_helper');
      return await setupReceivingReceiptNotificationFixture();
    },
    async 'db:getReceivingReceiptLineById'(params: { id: string }) {
      const { getReceivingReceiptLineById } = require('./receiving_receipt/receiving_receipt_line_helper');
      return await getReceivingReceiptLineById(params.id);
    },
    async 'db:getReceivingReceiptLineChildren'(params: { parentId: string }) {
      const { getReceivingReceiptLineChildren } = require('./receiving_receipt/receiving_receipt_line_helper');
      return await getReceivingReceiptLineChildren(params.parentId);
    },
    async 'db:setupReceivingReceiptLineSingleApprovalFlow'() {
      const { setupReceivingReceiptLineSingleApprovalFlow } = require('./receiving_receipt/receiving_receipt_line_helper');
      return await setupReceivingReceiptLineSingleApprovalFlow();
    },
    async 'db:populateReceivingReceiptLineSingleApproval'(params: {
      creatorId: string;
      approvalFlowIds: string[];
      inventoryId?: string | null;
      productId?: string;
      receiptQuantity?: number;
    }) {
      const { populateReceivingReceiptLineSingleApproval } = require('./receiving_receipt/receiving_receipt_line_helper');
      return await populateReceivingReceiptLineSingleApproval(
        params.creatorId,
        params.approvalFlowIds,
        { inventoryId: params.inventoryId, productId: params.productId, receiptQuantity: params.receiptQuantity }
      );
    },
  };
}
