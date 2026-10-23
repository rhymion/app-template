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
    async 'db:setupGoodsReceiptNotificationFixture'() {
      const { setupGoodsReceiptNotificationFixture } = require('./goods_receipt/notification_helper');
      return await setupGoodsReceiptNotificationFixture();
    },
    async 'db:getGoodsReceiptLineById'(params: { id: string }) {
      const { getGoodsReceiptLineById } = require('./goods_receipt/goods_receipt_line_helper');
      return await getGoodsReceiptLineById(params.id);
    },
    async 'db:getGoodsReceiptLineChildren'(params: { parentId: string }) {
      const { getGoodsReceiptLineChildren } = require('./goods_receipt/goods_receipt_line_helper');
      return await getGoodsReceiptLineChildren(params.parentId);
    },
    async 'db:setupGoodsReceiptLineSingleApprovalFlow'() {
      const { setupGoodsReceiptLineSingleApprovalFlow } = require('./goods_receipt/goods_receipt_line_helper');
      return await setupGoodsReceiptLineSingleApprovalFlow();
    },
    async 'db:populateGoodsReceiptLineSingleApproval'(params: {
      creatorId: string;
      approvalFlowIds: string[];
      inventoryId?: string | null;
      productId?: string;
      receiptQuantity?: number;
    }) {
      const { populateGoodsReceiptLineSingleApproval } = require('./goods_receipt/goods_receipt_line_helper');
      return await populateGoodsReceiptLineSingleApproval(
        params.creatorId,
        params.approvalFlowIds,
        { inventoryId: params.inventoryId, productId: params.productId, receiptQuantity: params.receiptQuantity }
      );
    },
    async 'db:seedReservationInventory'(params: { quantity: number }) {
      const { seedReservationInventory } = require('./sales_order/reservation_helper');
      return await seedReservationInventory(params.quantity);
    },
    async 'db:getInventoryAllocation'(params: { sales_order_id: string }) {
      const { getInventoryAllocation } = require('./sales_order/reservation_helper');
      return await getInventoryAllocation(params.sales_order_id);
    },
    async 'db:setInventoryQuantity'(params: { inventory_id: string; quantity: number }) {
      const { setInventoryQuantity } = require('./sales_order/reservation_helper');
      return await setInventoryQuantity(params.inventory_id, params.quantity);
    },
    async 'db:seedSecondInventoryLot'(params: { product_id: string; quantity: number; location: string }) {
      const { seedSecondInventoryLot } = require('./sales_order/reservation_helper');
      return await seedSecondInventoryLot(params.product_id, params.quantity, params.location);
    },
    async 'db:seedSecondProduct'(params: { quantity: number }) {
      const { seedSecondProduct } = require('./sales_order/reservation_helper');
      return await seedSecondProduct(params.quantity);
    },
    async 'db:setupSalesOrderLineSingleApprovalFlow'() {
      const { setupSalesOrderLineSingleApprovalFlow } = require('./sales_order/reservation_helper');
      return await setupSalesOrderLineSingleApprovalFlow();
    },
    async 'db:getSalesOrderLinesForOrder'(params: { sales_order_id: string }) {
      const { getSalesOrderLinesForOrder } = require('./sales_order/reservation_helper');
      return await getSalesOrderLinesForOrder(params.sales_order_id);
    },
    async 'db:getSalesOrderLineById'(params: { id: string }) {
      const { getSalesOrderLineById } = require('./sales_order/reservation_helper');
      return await getSalesOrderLineById(params.id);
    },
    async 'db:getSalesOrderLineChildren'(params: { parentId: string }) {
      const { getSalesOrderLineChildren } = require('./sales_order/reservation_helper');
      return await getSalesOrderLineChildren(params.parentId);
    },
  };
}
