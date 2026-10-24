import { TEST_API_KEY, TEST_CREDENTIALS } from '../../support/test-credentials';

const API_BASE = '/api/sales_order';

describe('moveReservation authorization and line-state guard', () => {
  beforeEach(() => {
    cy.task('db:reset');
    cy.task('db:seed');
    cy.task('db:grantAllPermissions');
    cy.task('db:setupSalesOrderLineSingleApprovalFlow');
  });

  // Creates an order with one line, submits it for approval (which creates the
  // reservation) and yields the ids plus the ledger rows that exist before any move.
  function setupReservedLine(orderNo: string, then: (ctx: { orderId: string; lineId: string; bridgeId: string; before: any[] }) => void) {
    cy.task<any>('db:seedReservationInventory', { quantity: 5 }).then((seed) => {
      cy.request({
        method: 'POST',
        url: API_BASE,
        headers: { 'X-API-Key': TEST_API_KEY },
        body: {
          order_no: orderNo,
          customer_id: seed.customer.id,
          items: [{ product_id: seed.product.id, quantity: 5, price: null }],
        },
      }).then((res) => {
        const orderId = res.body.id;
        cy.task<any>('db:getSalesOrderLinesForOrder', { sales_order_id: orderId }).then((lines) => {
          Cypress.session.clearAllSavedSessions();
          cy.clearCookies();
          cy.login(TEST_CREDENTIALS.email, TEST_CREDENTIALS.password);
          cy.visit(`/en/sales_order_line/view/${lines[0].id}`);
          cy.contains('button', 'Submit').click();
          cy.contains('button', 'Submit').should('not.exist');
          cy.task<any>('db:getSalesOrderLinesForOrder', { sales_order_id: orderId }).then((submitted) => {
            const bridgeId = submitted[0].inventory_transactionable_id;
            expect(bridgeId).to.not.be.null;
            cy.task<any[]>('db:getInventoryTransactionsByBridge', {
              inventory_transactionable_id: bridgeId,
            }).then((before) => {
              then({ orderId, lineId: submitted[0].id, bridgeId, before });
            });
          });
        });
      });
    });
  }

  function expectLedgerUnchanged(bridgeId: string, before: any[]) {
    cy.task<any[]>('db:getInventoryTransactionsByBridge', {
      inventory_transactionable_id: bridgeId,
    }).then((after) => {
      expect(after.length).to.eq(before.length);
    });
  }

  it('401: rejects a request with no credentials and writes no ledger rows', () => {
    setupReservedLine('MOVE-AUTHZ-401', ({ orderId, lineId, bridgeId, before }) => {
      Cypress.session.clearAllSavedSessions();
      cy.clearCookies();
      cy.request({
        method: 'POST',
        url: `${API_BASE}/${orderId}/actions/moveReservation`,
        body: { sales_order_line_id: lineId },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(401);
        expectLedgerUnchanged(bridgeId, before);
      });
    });
  });

  it('403: rejects an authenticated user without sales_order permission and writes no ledger rows', () => {
    setupReservedLine('MOVE-AUTHZ-403', ({ orderId, lineId, bridgeId, before }) => {
      cy.task<string>('db:createLimitedApiUser', 'sales_order').then((limitedKey) => {
        Cypress.session.clearAllSavedSessions();
        cy.clearCookies();
        cy.request({
          method: 'POST',
          url: `${API_BASE}/${orderId}/actions/moveReservation`,
          headers: { 'X-API-Key': limitedKey },
          body: { sales_order_line_id: lineId },
          failOnStatusCode: false,
        }).then((res) => {
          expect(res.status).to.eq(403);
          expectLedgerUnchanged(bridgeId, before);
        });
      });
    });
  });

  it('200: a permitted user moves the reservation of a pending line (cancel + reserve rows added)', () => {
    setupReservedLine('MOVE-AUTHZ-200', ({ orderId, lineId, bridgeId, before }) => {
      Cypress.session.clearAllSavedSessions();
      cy.clearCookies();
      cy.login(TEST_CREDENTIALS.email, TEST_CREDENTIALS.password);
      cy.request({
        method: 'POST',
        url: `${API_BASE}/${orderId}/actions/moveReservation`,
        body: { sales_order_line_id: lineId },
      }).then((res) => {
        expect(res.status).to.eq(200);
        cy.task<any[]>('db:getInventoryTransactionsByBridge', {
          inventory_transactionable_id: bridgeId,
        }).then((after) => {
          const added = after.length - before.length;
          expect(added).to.eq(2);
          const beforeIds = new Set(before.map((t) => t.id));
          const newTypes = after.filter((t) => !beforeIds.has(t.id)).map((t) => t.event_type).sort();
          expect(newTypes).to.deep.eq(['cancel', 'reserve']);
        });
      });
    });
  });

  ['split', 'rejected', 'draft'].forEach((status) => {
    it(`400: rejects a line in status "${status}" and writes no ledger rows`, () => {
      setupReservedLine(`MOVE-AUTHZ-${status}`, ({ orderId, lineId, bridgeId, before }) => {
        cy.task('db:setSalesOrderLineStatus', { id: lineId, status });
        cy.request({
          method: 'POST',
          url: `${API_BASE}/${orderId}/actions/moveReservation`,
          body: { sales_order_line_id: lineId },
          failOnStatusCode: false,
        }).then((res) => {
          expect(res.status).to.eq(400);
          expectLedgerUnchanged(bridgeId, before);
        });
      });
    });
  });
});
