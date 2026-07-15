import { TEST_API_KEY, TEST_CREDENTIALS } from '../../support/test-credentials';

// item3 (cmd_309): purchase_per_item's approve path (afterApprove — 'ship')
// had no dedicated permanent coverage anywhere in the suite (only reject/
// terminal-cancel was covered, in purchase_per_item_approval_dispatch.cy.ts).
// This fills that gap: single-lot ship, multi-lot ship (reservation spans
// two inventory lots via auto-allocate), and a split child's independent
// ship — matching the approve×split-has/split-none combinations required by
// cmd_309 item3(b).

const PO_API = '/api/purchase_order';
const INV_API = '/api/inventory';

describe('API: Purchase Per Item — Approve / Ship (cmd_309 item3)', () => {
  beforeEach(() => {
    cy.task('db:reset');
    cy.task('db:seed');
    cy.task('db:grantAllPermissions');
  });

  function reserveAndApprove(quantity: number, invSeed: any, orderNo: string, flowSetup: any) {
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
                url: `/api/approval_request/${ar.id}/approve`,
              })
              .then((approveRes) => {
                expect(approveRes.status).to.eq(200);
                expect(approveRes.body.status).to.eq(1); // approved
                return cy.wrap({ item, orderId });
              });
          });
        });
      });
  }

  it('single-lot reservation: approve ships — quantity and reserved_quantity both decrement, one ship ledger row', () => {
    cy.task<any>('db:setupPurchasePerItemSingleApprovalFlow').then((flowSetup) => {
      cy.task<any>('db:seedReservationInventory', { quantity: 10 }).then((seed) => {
        reserveAndApprove(4, seed, 'APPROVE-001', flowSetup).then((ctx: any) => {
          const { item } = ctx;

          cy.request({
            url: `${INV_API}/${seed.inventory.id}`,
            headers: { 'X-API-Key': TEST_API_KEY },
          }).then((postRes) => {
            expect(postRes.body.reserved_quantity).to.eq(0); // reservation consumed by ship
            expect(postRes.body.quantity).to.eq(6); // O-4: ship decrements physical quantity too
          });

          cy.task<any>('db:getInventoryTransactionsByBridge', {
            inventory_transactionable_id: item.inventory_transactionable_id,
          }).then((txs: any[]) => {
            expect(txs.length).to.eq(2); // reserve + ship
            const shipTx = txs.find((t) => t.event_type === 'ship');
            expect(shipTx).to.exist;
            expect(shipTx.quantity_delta).to.eq(-4);
            expect(shipTx.reserved_delta).to.eq(-4);
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

  it('multi-lot reservation (auto-allocate spans two inventory lots): approve ships both lots independently', () => {
    cy.task<any>('db:setupPurchasePerItemSingleApprovalFlow').then((flowSetup) => {
      // First lot only has 5 units — a quantity-12 order must spill onto a
      // second lot (O-8) to be satisfied.
      cy.task<any>('db:seedReservationInventory', { quantity: 5 }).then((seed) => {
        cy.task<any>('db:seedSecondInventoryLot', {
          product_id: seed.product.id,
          quantity: 20,
          location: 'APPROVE-LOT-B',
        }).then((inv2) => {
          reserveAndApprove(12, seed, 'APPROVE-002', flowSetup).then((ctx: any) => {
            const { item } = ctx;

            cy.request({
              url: `${INV_API}/${seed.inventory.id}`,
              headers: { 'X-API-Key': TEST_API_KEY },
            }).then((lot1Res) => {
              cy.request({
                url: `${INV_API}/${inv2.id}`,
                headers: { 'X-API-Key': TEST_API_KEY },
              }).then((lot2Res) => {
                // Both lots' reservations were fully shipped.
                expect(lot1Res.body.reserved_quantity).to.eq(0);
                expect(lot2Res.body.reserved_quantity).to.eq(0);
                // Physical quantity: lot1 exhausted (5), remainder (7) shipped from lot2.
                expect(lot1Res.body.quantity).to.eq(0);
                expect(lot2Res.body.quantity).to.eq(13);
              });
            });

            cy.task<any>('db:getInventoryTransactionsByBridge', {
              inventory_transactionable_id: item.inventory_transactionable_id,
            }).then((txs: any[]) => {
              const shipTxs = txs.filter((t) => t.event_type === 'ship');
              expect(shipTxs.length).to.eq(2); // one ship row per lot
              const shippedTotal = shipTxs.reduce((s, t) => s + -t.quantity_delta, 0);
              expect(shippedTotal).to.eq(12);
              const sumReserved = txs.reduce((s, t) => s + t.reserved_delta, 0);
              expect(sumReserved).to.eq(0);
            });
          });
        });
      });
    });
  });

  it('split child (own bridge): approve ships the child independently of any sibling', () => {
    cy.task<any>('db:setupPurchasePerItemSingleApprovalFlow').then((flowSetup) => {
      cy.task<any>('db:seedReservationInventory', { quantity: 20 }).then((seed) => {
        cy.request({
          method: 'POST',
          url: PO_API,
          headers: { 'X-API-Key': TEST_API_KEY },
          body: {
            order_no: 'APPROVE-003',
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
                const [childA, childB] = children;

                cy.task<any>('db:getPendingApprovalRequest', { approvable_id: childA.approvable_id }).then((ar: any) => {
                  expect(ar).to.not.be.null;

                  Cypress.session.clearAllSavedSessions();
                  cy.clearCookies();
                  cy.login(flowSetup.approverUser.email, 'test-password');
                  cy.request({
                    method: 'POST',
                    url: `/api/approval_request/${ar.id}/approve`,
                  }).then((approveRes) => {
                    expect(approveRes.status).to.eq(200);

                    cy.task<any>('db:getInventoryTransactionsByBridge', {
                      inventory_transactionable_id: childA.inventory_transactionable_id,
                    }).then((txs: any[]) => {
                      const shipTx = txs.find((t) => t.event_type === 'ship');
                      expect(shipTx).to.exist;
                      expect(-shipTx.quantity_delta).to.eq(childA.quantity);
                    });

                    // Sibling child (still pending) must be unaffected.
                    cy.task<any>('db:getPurchasePerItemById', { id: childB.id }).then((siblingAfter) => {
                      expect(siblingAfter.status).to.eq(0); // pending
                    });
                    cy.task<any>('db:getInventoryTransactionsByBridge', {
                      inventory_transactionable_id: childB.inventory_transactionable_id,
                    }).then((txs: any[]) => {
                      expect(txs.some((t) => t.event_type === 'ship')).to.eq(false);
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
