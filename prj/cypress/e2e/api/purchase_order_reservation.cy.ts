import { TEST_API_KEY, TEST_CREDENTIALS } from '../../support/test-credentials';

const API_BASE = '/api/purchase_order';
const INV_API = '/api/inventory';

describe('Reservation Allocation (B3/B4)', () => {
  beforeEach(() => {
    cy.task('db:reset');
    cy.task('db:seed');
    cy.task('db:grantAllPermissions');
  });

  // cmd_869a: purchase_per_item (the order's `items` line entity) now has
  // its own x-approval.submit_on (cmd_856) -- creating a purchase_order no
  // longer reserves inventory immediately; reservation only happens once
  // each line is submitted for approval, which for this edit:false entity
  // only exists as the ApprovalSection "Submit" button's server action.
  // Same pattern as purchase_per_item_split.cy.ts / purchase_per_item_approval_approve.cy.ts.
  function submitPurchasePerItemForApproval(itemId: string) {
    Cypress.session.clearAllSavedSessions();
    cy.clearCookies();
    cy.login(TEST_CREDENTIALS.email, TEST_CREDENTIALS.password);
    cy.visit(`/en/purchase_per_item/view/${itemId}`);
    cy.get('button[aria-label="Submit"]').click();
    cy.get('button[aria-label="Submit"]').should('not.exist');
  }

  // -------------------------------------------------------------------------
  // B3: inventory decrement + allocation row + insufficient inventory
  // -------------------------------------------------------------------------

  it('R1: successful order decrements inventory and creates allocation row', () => {
    cy.task('db:setupPurchasePerItemSingleApprovalFlow');
    cy.task<any>('db:seedReservationInventory', { quantity: 10 }).then((seed) => {
      cy.request({
        method: 'POST',
        url: API_BASE,
        headers: { 'X-API-Key': TEST_API_KEY },
        body: {
          order_no: 'RES-001',
          customer_id: seed.customer.id,
          items: [{ product_id: seed.product.id, quantity: 3, price: null }],
        },
      }).then((res) => {
        expect(res.status).to.eq(201);
        const orderId = res.body.id;

        cy.task<any>('db:getPurchasePerItemsForOrder', { purchase_order_id: orderId }).then((items) => {
          submitPurchasePerItemForApproval(items[0].id);

          cy.request({
            url: `${INV_API}/${seed.inventory.id}`,
            headers: { 'X-API-Key': TEST_API_KEY },
          }).then((invRes) => {
            expect(invRes.status).to.eq(200);
            // O-4 (B-5 Phase2 ledger redesign): reserve only moves reserved_quantity;
            // quantity is untouched until ship (ship is the only path that decrements it).
            expect(invRes.body.quantity).to.eq(10);
            expect(invRes.body.reserved_quantity).to.eq(3);
          });

          cy.task<any>('db:getInventoryAllocation', { purchase_order_id: orderId }).then((alloc) => {
            expect(alloc).to.not.be.null;
            expect(alloc.quantity).to.eq(3);
            expect(alloc.inventory_id).to.eq(seed.inventory.id);
          });
        });
      });
    });
  });

  it('R2: rejects insufficient-stock submission — no reservation is created, inventory unchanged', () => {
    // cmd_869a: creation no longer checks capacity at all (that moved to
    // submit-time, see R1's comment above) -- POST always succeeds (201)
    // here. The InsufficientPoolCapacityError thrown inside
    // submitForApprovalPurchasePerItem's transaction (submit_actions.ts)
    // rolls the whole transaction back; the client-side call site
    // (ApprovalSection.tsx's onClick -> startTransition(() =>
    // onSubmitForApproval())) has no .catch, so this surfaces only as an
    // uncaught promise rejection in the browser -- there is no HTTP status
    // to assert on for a UI-driven server action. Verified instead via DB
    // state: the transaction rollback leaves quantity/reserved_quantity
    // untouched and the item stuck in 'draft' (never reaches 'pending').
    cy.task('db:setupPurchasePerItemSingleApprovalFlow');
    cy.task<any>('db:seedReservationInventory', { quantity: 2 }).then((seed) => {
      cy.request({
        method: 'POST',
        url: API_BASE,
        headers: { 'X-API-Key': TEST_API_KEY },
        body: {
          order_no: 'RES-002',
          customer_id: seed.customer.id,
          items: [{ product_id: seed.product.id, quantity: 5, price: null }],
        },
      }).then((res) => {
        expect(res.status).to.eq(201);
        const orderId = res.body.id;
        cy.task<any>('db:getPurchasePerItemsForOrder', { purchase_order_id: orderId }).then((items) => {
          const itemId = items[0].id;
          Cypress.session.clearAllSavedSessions();
          cy.clearCookies();
          cy.login(TEST_CREDENTIALS.email, TEST_CREDENTIALS.password);
          cy.on('uncaught:exception', () => false);
          cy.visit(`/en/purchase_per_item/view/${itemId}`);
          cy.get('button[aria-label="Submit"]').click();
          cy.wait(2000);

          cy.task<any>('db:getPurchasePerItemsForOrder', { purchase_order_id: orderId }).then((postItems) => {
            expect(postItems[0].status).to.eq('draft'); // never reached 'pending' -- rolled back
          });
        });

        cy.request({
          url: `${INV_API}/${seed.inventory.id}`,
          headers: { 'X-API-Key': TEST_API_KEY },
        }).then((invRes) => {
          expect(invRes.body.quantity).to.eq(2);
          expect(invRes.body.reserved_quantity).to.eq(0);
        });
      });
    });
  });

  // -------------------------------------------------------------------------
  // B4/B6: true concurrent depletion — 2 requests fired simultaneously
  //        one must succeed (201), one must fail (409), inventory stays >= 0
  // -------------------------------------------------------------------------

  // cmd_871/cmd_873 (was cmd_869a UNRESOLVED, superseded): app-generator
  // PR#455 (subtask_871b) changed _build_approval_lines_post_create_code's
  // submit_on skip from a compile-time declaration check to a runtime
  // value check -- a purchase_per_item line created directly in its
  // x-approval.submit_on state (status: 'pending') now fires the
  // approval_request + reservation claim in the *same* create-edge
  // transaction, instead of requiring a separate UI-driven "Submit"
  // action afterward. Sending `status: 'pending'` on each line item here
  // (rather than the default 'draft') re-establishes this test's original
  // premise: firing two concurrent POSTs against the REST endpoint now
  // exercises the atomic-reservation race guarantee again, without needing
  // to hand-encode the Server Action's wire protocol.
  it('R3 (B6-concurrent): two simultaneous orders for last unit → exactly [201, 409]', () => {
    cy.task<any>('db:seedReservationInventory', { quantity: 1 }).then((seed) => {
      // Use cy.window() to get the fetch API, then fire both requests in parallel
      // via Promise.all so they hit the server at the same time.
      cy.wrap(
        Promise.all([
          fetch(`${Cypress.config('baseUrl')}${API_BASE}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': TEST_API_KEY,
            },
            body: JSON.stringify({
              order_no: 'RES-003A',
              customer_id: seed.customer.id,
              items: [{ product_id: seed.product.id, quantity: 1, price: null, status: 'pending' }],
            }),
          }),
          fetch(`${Cypress.config('baseUrl')}${API_BASE}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': TEST_API_KEY,
            },
            body: JSON.stringify({
              order_no: 'RES-003B',
              customer_id: seed.customer.id,
              items: [{ product_id: seed.product.id, quantity: 1, price: null, status: 'pending' }],
            }),
          }),
        ])
      ).then(([res1, res2]: [Response, Response]) => {
        const statuses = [res1.status, res2.status].sort();
        expect(statuses).to.deep.equal([201, 409]);

        cy.request({
          url: `${INV_API}/${seed.inventory.id}`,
          headers: { 'X-API-Key': TEST_API_KEY },
        }).then((invRes) => {
          // O-4: reserve leaves quantity untouched; the winning request only
          // moves reserved_quantity. available = quantity - reserved_quantity
          // must never go negative.
          expect(invRes.body.quantity).to.eq(1);
          expect(invRes.body.reserved_quantity).to.eq(1);
          expect(invRes.body.quantity - invRes.body.reserved_quantity).to.be.gte(0);
        });
      });
    });
  });

  // -------------------------------------------------------------------------
  // B1: update guard + delete guard
  // -------------------------------------------------------------------------

  it('R4 (B1 update guard): PUT with changed item quantity after allocation → 409', () => {
    cy.task('db:setupPurchasePerItemSingleApprovalFlow');
    cy.task<any>('db:seedReservationInventory', { quantity: 10 }).then((seed) => {
      cy.request({
        method: 'POST',
        url: API_BASE,
        headers: { 'X-API-Key': TEST_API_KEY },
        body: {
          order_no: 'RES-004',
          customer_id: seed.customer.id,
          items: [{ product_id: seed.product.id, quantity: 2, price: null }],
        },
      }).then((res) => {
        expect(res.status).to.eq(201);
        const orderId = res.body.id;

        cy.task<any>('db:getPurchasePerItemsForOrder', { purchase_order_id: orderId }).then((items) => {
          submitPurchasePerItemForApproval(items[0].id);

          cy.request({
            url: `${API_BASE}/${orderId}`,
            headers: { 'X-API-Key': TEST_API_KEY },
          }).then((detailRes) => {
            const detailItems = detailRes.body.items;
            cy.request({
              method: 'PUT',
              url: `${API_BASE}/${orderId}`,
              headers: { 'X-API-Key': TEST_API_KEY },
              body: {
                order_no: 'RES-004',
                customer_id: seed.customer.id,
                items: detailItems.map((item: any) => ({ ...item, quantity: 5 })),
              },
              failOnStatusCode: false,
            }).then((putRes) => {
              expect(putRes.status).to.eq(409);
            });
          });
        });
      });
    });
  });

  it('R5 (B1 delete guard): DELETE with existing allocation → 409', () => {
    cy.task('db:setupPurchasePerItemSingleApprovalFlow');
    cy.task<any>('db:seedReservationInventory', { quantity: 10 }).then((seed) => {
      cy.request({
        method: 'POST',
        url: API_BASE,
        headers: { 'X-API-Key': TEST_API_KEY },
        body: {
          order_no: 'RES-005',
          customer_id: seed.customer.id,
          items: [{ product_id: seed.product.id, quantity: 2, price: null }],
        },
      }).then((res) => {
        expect(res.status).to.eq(201);
        const orderId = res.body.id;

        cy.task<any>('db:getPurchasePerItemsForOrder', { purchase_order_id: orderId }).then((items) => {
          submitPurchasePerItemForApproval(items[0].id);

          cy.request({
            method: 'DELETE',
            url: `${API_BASE}/${orderId}`,
            headers: { 'X-API-Key': TEST_API_KEY },
            failOnStatusCode: false,
          }).then((delRes) => {
            expect(delRes.status).to.eq(409);
          });
        });
      });
    });
  });

  it('R6 (B1 update guard): non-criteria field update (order_no) allowed after allocation', () => {
    cy.task<any>('db:seedReservationInventory', { quantity: 10 }).then((seed) => {
      cy.request({
        method: 'POST',
        url: API_BASE,
        headers: { 'X-API-Key': TEST_API_KEY },
        body: {
          order_no: 'RES-006-original',
          customer_id: seed.customer.id,
          items: [{ product_id: seed.product.id, quantity: 2, price: null }],
        },
      }).then((res) => {
        expect(res.status).to.eq(201);
        const orderId = res.body.id;

        cy.request({
          url: `${API_BASE}/${orderId}`,
          headers: { 'X-API-Key': TEST_API_KEY },
        }).then((detailRes) => {
          const items = detailRes.body.items;
          cy.request({
            method: 'PUT',
            url: `${API_BASE}/${orderId}`,
            headers: { 'X-API-Key': TEST_API_KEY },
            body: {
              order_no: 'RES-006-updated',
              customer_id: seed.customer.id,
              items,
            },
          }).then((putRes) => {
            expect(putRes.status).to.eq(200);
          });
        });
      });
    });
  });

  // -------------------------------------------------------------------------
  // D7 (B-5 Phase2c, 14.4b_equiv): terminal reject of a reserved
  // purchase_per_item must revert reserved_quantity via a cancel ledger tx,
  // leaving physical quantity untouched (O-4).
  // -------------------------------------------------------------------------

  it('14.4b_equiv: purchase_per_item terminal reject creates a reverting cancel tx (reserved_quantity restored, quantity unchanged)', () => {
    cy.task<any>('db:setupPurchasePerItemSingleApprovalFlow').then((flowSetup) => {
      cy.task<any>('db:seedReservationInventory', { quantity: 10 }).then((seed) => {
        cy.request({
          method: 'POST',
          url: API_BASE,
          headers: { 'X-API-Key': TEST_API_KEY },
          body: {
            order_no: 'RES-144B',
            customer_id: seed.customer.id,
            items: [{ product_id: seed.product.id, quantity: 4, price: null }],
          },
        }).then((res) => {
          expect(res.status).to.eq(201);
          const orderId = res.body.id;

          cy.task<any>('db:getPurchasePerItemsForOrder', { purchase_order_id: orderId }).then((preSubmitItems) => {
            submitPurchasePerItemForApproval(preSubmitItems[0].id);

          cy.request({
            url: `${INV_API}/${seed.inventory.id}`,
            headers: { 'X-API-Key': TEST_API_KEY },
          }).then((preRes) => {
            const preQuantity = preRes.body.quantity;
            const preReserved = preRes.body.reserved_quantity;
            // O-4: reserve leaves quantity untouched; only reserved_quantity moves.
            expect(preQuantity).to.eq(10);
            expect(preReserved).to.eq(4);

            cy.task<any>('db:getPurchasePerItemsForOrder', { purchase_order_id: orderId }).then((items) => {
              const item = items[0];
              expect(item.approvable_id).to.not.be.null;
              expect(item.inventory_transactionable_id).to.not.be.null;

              cy.task<any>('db:getPendingApprovalRequest', { approvable_id: item.approvable_id }).then((ar) => {
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

                  cy.task<any>('db:getApprovableById', { approvable_id: item.approvable_id }).then((approvable: any) => {
                    expect(approvable.approved_at).to.not.be.null;
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
                    expect(sumReserved).to.eq(0); // reserve(+4) + cancel(-4) nets to zero
                  });

                  cy.request({
                    url: `${INV_API}/${seed.inventory.id}`,
                    headers: { 'X-API-Key': TEST_API_KEY },
                  }).then((postRes) => {
                    expect(postRes.body.reserved_quantity).to.eq(preReserved - 4); // reverted to 0
                    expect(postRes.body.quantity).to.eq(preQuantity); // O-4: cancel never touches quantity
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
