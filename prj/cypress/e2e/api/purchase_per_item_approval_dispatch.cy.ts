import { TEST_API_KEY, TEST_CREDENTIALS } from '../../support/test-credentials';

// cmd_305 FIX-B follow-up (subtask_305i, test-coverage-gap review): permanent,
// entity-focused coverage for purchase_per_item's terminal-reject reservation
// release (lib/purchase_per_item/service_after_reject.ts, invoked via
// on_rejected dispatch — FIX-C). This path already correctly undoes the O-6
// ''→null denormalization at service_after_reject.ts:105 (unlike the split
// template's parent-release block, which had the location=null bug fixed in
// this same follow-up — see purchase_per_item_split.cy.ts). Previously this
// flow only had ad-hoc coverage buried in purchase_order_reservation.cy.ts
// (14.4b_equiv); this file gives it a dedicated, permanent home and adds the
// location=null case explicitly (the default/most common lot, and the same
// shape of case the sibling split bug involved).

const PO_API = '/api/purchase_order';
const INV_API = '/api/inventory';

describe('API: Purchase Per Item — Terminal Reject Reservation Release (cmd_305 FIX-C)', () => {
  beforeEach(() => {
    cy.task('db:reset');
    cy.task('db:seed');
    cy.task('db:grantAllPermissions');
  });

  function reserveAndReject(quantity: number, invSeed: any, orderNo: string) {
    return cy.task<any>('db:setupPurchasePerItemSingleApprovalFlow').then((flowSetup) => {
      return cy
        .request({
          method: 'POST',
          url: PO_API,
          headers: { 'X-API-Key': TEST_API_KEY },
          body: {
            order_no: orderNo,
            customer_id: invSeed.customer.id,
            items: [{ product_id: invSeed.product.id, quantity, price: null }],
          },
        })
        .then((poRes) => {
          expect(poRes.status).to.eq(201);
          const orderId = poRes.body.id;

          return cy.task<any>('db:getPurchasePerItemsForOrder', { purchase_order_id: orderId }).then((items) => {
            const item = items[0];
            return cy.task<any>('db:getPendingApprovalRequest', { approvable_id: item.approvable_id }).then((ar) => {
              expect(ar).to.not.be.null;

              Cypress.session.clearAllSavedSessions();
              cy.clearCookies();
              cy.login(flowSetup.approverUser.email, 'test-password');

              return cy
                .request({
                  method: 'POST',
                  url: `/api/approval_request/${ar.id}/reject`,
                })
                .then((rejectRes) => {
                  expect(rejectRes.status).to.eq(200);
                  expect(rejectRes.body.status).to.eq('terminal_rejected');
                  return cy.wrap({ item, orderId });
                });
            });
          });
        });
    });
  }

  it('location=null lot (default): terminal reject releases reserved_quantity, quantity untouched', () => {
    cy.task<any>('db:seedReservationInventory', { quantity: 10 }).then((seed) => {
      cy.request({
        url: `${INV_API}/${seed.inventory.id}`,
        headers: { 'X-API-Key': TEST_API_KEY },
      }).then(() => {
        reserveAndReject(4, seed, 'DISPATCH-001').then((ctx: any) => {
          const { item } = ctx;

          cy.request({
            url: `${INV_API}/${seed.inventory.id}`,
            headers: { 'X-API-Key': TEST_API_KEY },
          }).then((postRes) => {
            expect(postRes.body.reserved_quantity).to.eq(0); // reverted to 0
            expect(postRes.body.quantity).to.eq(10); // O-4: cancel never touches quantity
          });

          cy.task<any>('db:getInventoryTransactionsByBridge', {
            inventory_transactionable_id: item.inventory_transactionable_id,
          }).then((txs: any[]) => {
            expect(txs.length).to.eq(2); // reserve + cancel
            const cancelTx = txs.find((t) => t.event_type === 'cancel');
            expect(cancelTx).to.exist;
            expect(cancelTx.reserved_delta).to.eq(-4);
            expect(cancelTx.quantity_delta).to.eq(0);
            const sumReserved = txs.reduce((s, t) => s + t.reserved_delta, 0);
            expect(sumReserved).to.eq(0);
          });

          cy.task<any>('db:getApprovableById', { approvable_id: item.approvable_id }).then((approvable: any) => {
            expect(approvable.approved_at).to.not.be.null; // idempotency guard set
          });
        });
      });
    });
  });

  it('explicit-location lot: terminal reject releases reserved_quantity (no regression on the already-correct path)', () => {
    cy.task<any>('db:seedReservationInventory', { quantity: 2 }).then((seed) => {
      // Give the location=null lot no headroom so the PO is forced onto the
      // explicit-location lot for its reservation.
      cy.task<any>('db:seedSecondInventoryLot', {
        product_id: seed.product.id,
        quantity: 10,
        location: 'DISPATCH-LOT-B',
      }).then((invExplicit) => {
        cy.task<any>('db:setInventoryQuantity', { inventory_id: seed.inventory.id, quantity: 0 }).then(() => {
          reserveAndReject(6, seed, 'DISPATCH-002').then((ctx: any) => {
            const { item } = ctx;

            cy.request({
              url: `${INV_API}/${invExplicit.id}`,
              headers: { 'X-API-Key': TEST_API_KEY },
            }).then((postRes) => {
              expect(postRes.body.reserved_quantity).to.eq(0);
              expect(postRes.body.quantity).to.eq(10);
            });

            cy.task<any>('db:getInventoryTransactionsByBridge', {
              inventory_transactionable_id: item.inventory_transactionable_id,
            }).then((txs: any[]) => {
              const sumReserved = txs.reduce((s: number, t: any) => s + t.reserved_delta, 0);
              expect(sumReserved).to.eq(0);
            });
          });
        });
      });
    });
  });

  it('split child (own bridge, location=null lot) terminal reject also releases its reservation independently of the parent', () => {
    cy.task<any>('db:setupPurchasePerItemSingleApprovalFlow').then((flowSetup) => {
      cy.task<any>('db:seedReservationInventory', { quantity: 20 }).then((seed) => {
        cy.request({
          method: 'POST',
          url: PO_API,
          headers: { 'X-API-Key': TEST_API_KEY },
          body: {
            order_no: 'DISPATCH-003',
            customer_id: seed.customer.id,
            items: [{ product_id: seed.product.id, quantity: 10, price: null }],
          },
        }).then((poRes) => {
          const orderId = poRes.body.id;

          cy.task<any>('db:getPurchasePerItemsForOrder', { purchase_order_id: orderId }).then((items) => {
            const parent = items[0];

            Cypress.session.clearAllSavedSessions();
            cy.clearCookies();
            cy.login(TEST_CREDENTIALS.email, TEST_CREDENTIALS.password);
            cy.request({
              method: 'POST',
              url: `/api/purchase_per_item/${parent.id}/actions/split`,
              body: { parts: [{ quantity: 4 }, { quantity: 6 }] },
            }).then((splitRes) => {
              expect(splitRes.status).to.eq(200);

              cy.task<any>('db:getPurchasePerItemChildren', { parentId: parent.id }).then((children) => {
                const child = children[0];

                cy.task<any>('db:getPendingApprovalRequest', { approvable_id: child.approvable_id }).then((ar: any) => {
                  expect(ar).to.not.be.null;

                  Cypress.session.clearAllSavedSessions();
                  cy.clearCookies();
                  cy.login(flowSetup.approverUser.email, 'test-password');
                  cy.request({
                    method: 'POST',
                    url: `/api/approval_request/${ar.id}/reject`,
                  }).then((rejectRes) => {
                    expect(rejectRes.status).to.eq(200);
                    expect(rejectRes.body.status).to.eq('terminal_rejected');

                    cy.task<any>('db:getInventoryTransactionsByBridge', {
                      inventory_transactionable_id: child.inventory_transactionable_id,
                    }).then((txs: any[]) => {
                      const sumReserved = txs.reduce((s: number, t: any) => s + t.reserved_delta, 0);
                      expect(sumReserved).to.eq(0); // child's own reservation fully reverted
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });
});
