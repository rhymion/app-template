import { TEST_API_KEY, TEST_CREDENTIALS } from '../../support/test-credentials';

// cmd_305 FIX-B follow-up: permanent regression coverage for
// purchase_per_item's x-splittable action (quantityField=quantity,
// perPartRequired=[inventory_id], parentField=parent_id) — child generation,
// per-child inventory bridge, auto-allocate, DP-B1a hard error, and the
// parent-reservation-release bug (found during QC): the split
// template's parent-release WHERE clause used `_row.location ?? ''`, which
// never matches inventory.location=NULL rows (the default/most common case —
// location is only written on inventory_transaction as '' via O-6
// denormalization, never on inventory itself). Fixed to
// `_row.location === '' ? null : _row.location` (same pattern as
// service_after_reject.ts:105). See docs/reservation-split-approval-reject-design.md §B-4.

const PO_API = '/api/purchase_order';
const INV_API = '/api/inventory';
const SPLIT_API = '/api/purchase_per_item';

describe('API: Purchase Per Item — Split (cmd_305 FIX-B)', () => {
  beforeEach(() => {
    cy.task('db:reset');
    cy.task('db:seed');
    cy.task('db:grantAllPermissions');
  });

  // cmd_856 [変更1]: see purchase_per_item_approval_approve.cy.ts for the
  // full rationale — purchase_per_item now starts in 'draft' and the split
  // action's pre-submission guard (cmd_847 [③]) requires a real
  // approval_request to exist, which only the ApprovalSection "Submit"
  // button's server action creates for this edit:false entity.
  function submitPurchasePerItemForApproval(itemId: string) {
    Cypress.session.clearAllSavedSessions();
    cy.clearCookies();
    cy.login(TEST_CREDENTIALS.email, TEST_CREDENTIALS.password);
    cy.visit(`/en/purchase_per_item/view/${itemId}`);
    cy.get('button[aria-label="Submit"]').click();
    cy.get('button[aria-label="Submit"]').should('not.exist');
  }

  it('splits into children summing to the parent quantity: parent → split status, children get their own bridge (specified lot + auto-allocate)', () => {
    cy.task('db:setupPurchasePerItemSingleApprovalFlow');
    cy.task<any>('db:seedReservationInventory', { quantity: 30 }).then((seed) => {
      // parent reserves 20 out of INV1 (location=null — the default lot).
      cy.request({
        method: 'POST',
        url: PO_API,
        headers: { 'X-API-Key': TEST_API_KEY },
        body: {
          order_no: 'SPLIT-001',
          customer_id: seed.customer.id,
          items: [{ product_id: seed.product.id, quantity: 20, price: null }],
        },
      }).then((poRes) => {
        expect(poRes.status).to.eq(201);
        const orderId = poRes.body.id;

        cy.task<any>('db:seedSecondInventoryLot', {
          product_id: seed.product.id,
          quantity: 20,
          location: 'SPLIT-LOT-B',
        }).then((inv2) => {
          cy.task<any>('db:getPurchasePerItemsForOrder', { purchase_order_id: orderId }).then((items) => {
            const parent = items[0];

            submitPurchasePerItemForApproval(parent.id);
            cy.request({
              method: 'POST',
              url: `${SPLIT_API}/${parent.id}/actions/split`,
              body: {
                parts: [
                  { quantity: 6, inventory_id: seed.inventory.id }, // specified lot (location=null)
                  { quantity: 14 }, // auto-allocate
                ],
              },
            }).then((splitRes) => {
              expect(splitRes.status).to.eq(200);
              expect(splitRes.body.ok).to.eq(true);

              cy.task<any>('db:getPurchasePerItemById', { id: parent.id }).then((parentAfter) => {
                expect(parentAfter.status).to.eq('split'); // split
              });

              cy.task<any>('db:getPurchasePerItemChildren', { parentId: parent.id }).then((children) => {
                expect(children).to.have.length(2);
                const quantities = children.map((c: any) => c.quantity).sort((a: number, b: number) => a - b);
                expect(quantities).to.deep.eq([6, 14]);
                for (const child of children) {
                  expect(child.parent_id).to.eq(parent.id);
                  expect(child.status).to.eq('pending'); // pending
                  expect(child.approvable_id).to.not.be.null;
                  expect(child.approvable_id).to.not.eq(parent.approvable_id);
                  expect(child.inventory_transactionable_id).to.not.be.null;
                  expect(child.inventory_transactionable_id).to.not.eq(parent.inventory_transactionable_id);
                  // inherited (non-overridden) parent fields carried over
                  expect(child.purchase_order_id).to.eq(parent.purchase_order_id);
                  expect(child.product_id).to.eq(parent.product_id);
                }
              });

              // ---- THE REGRESSION CHECK ----
              // Before fix: parent's 20 units were never released (silent no-op on
              // the location=null lot) → total reserved = 40 (20 stale + 6 + 14).
              // After fix: parent's reservation is released → total reserved = 20
              // (only the two children's reservations remain).
              cy.request({
                url: `${INV_API}/${seed.inventory.id}`,
                headers: { 'X-API-Key': TEST_API_KEY },
              }).then((inv1Res) => {
                cy.request({
                  url: `${INV_API}/${inv2.id}`,
                  headers: { 'X-API-Key': TEST_API_KEY },
                }).then((inv2Res) => {
                  const totalReserved = inv1Res.body.reserved_quantity + inv2Res.body.reserved_quantity;
                  expect(totalReserved).to.eq(20); // NOT 40 — parent's location=null reservation was released
                  // physical quantity is never touched by reserve/cancel (O-4)
                  expect(inv1Res.body.quantity).to.eq(30);
                  expect(inv2Res.body.quantity).to.eq(20);
                });
              });

              // Parent's own bridge must show a 'cancel' ledger row netting its reserve to zero.
              cy.task<any>('db:getInventoryTransactionsByBridge', {
                inventory_transactionable_id: parent.inventory_transactionable_id,
              }).then((txs: any[]) => {
                const sumReserved = txs.reduce((s, t) => s + t.reserved_delta, 0);
                expect(sumReserved).to.eq(0); // reserve(+20) + cancel(-20) nets to zero
                const cancelTx = txs.find((t) => t.event_type === 'cancel');
                expect(cancelTx).to.exist;
                expect(cancelTx.reserved_delta).to.eq(-20);
                expect(cancelTx.quantity_delta).to.eq(0); // O-4: cancel never touches physical quantity
              });
            });
          });
        });
      });
    });
  });

  it('no regression: parent release still works for a lot with an explicit (non-null) location', () => {
    cy.task('db:setupPurchasePerItemSingleApprovalFlow');
    // Same scenario as above, but the parent's ORIGINAL reservation is taken
    // entirely from a lot that already has a non-empty location string, which
    // was never affected by the bug (`_row.location ?? ''` and
    // `_row.location === '' ? null : _row.location` are equivalent when the
    // value isn't ''/null). The location=null lot's quantity is zeroed out so
    // the PO's own auto-allocation is forced entirely onto the explicit lot
    // (otherwise it would spill across both, defeating the isolation this
    // test needs). The explicit lot is provisioned generously (60) since the
    // split's parent-release happens only *after* the children have already
    // claimed their reservations in the same transaction (temporary
    // double-booking window).
    cy.task<any>('db:seedReservationInventory', { quantity: 5 }).then((seed) => {
      cy.task<any>('db:seedSecondInventoryLot', {
        product_id: seed.product.id,
        quantity: 60,
        location: 'SPLIT-LOT-EXPLICIT',
      }).then((invExplicit) => {
        cy.task('db:setInventoryQuantity', { inventory_id: seed.inventory.id, quantity: 0 }).then(() => {
          cy.request({
            method: 'POST',
            url: PO_API,
            headers: { 'X-API-Key': TEST_API_KEY },
            body: {
              order_no: 'SPLIT-002',
              customer_id: seed.customer.id,
              items: [{ product_id: seed.product.id, quantity: 20, price: null }],
            },
          }).then((poRes) => {
            expect(poRes.status).to.eq(201);
            const orderId = poRes.body.id;

            cy.request({
              url: `${INV_API}/${invExplicit.id}`,
              headers: { 'X-API-Key': TEST_API_KEY },
            }).then((preRes) => {
              expect(preRes.body.reserved_quantity).to.eq(20); // entire parent reservation on the explicit lot

              cy.task<any>('db:getPurchasePerItemsForOrder', { purchase_order_id: orderId }).then((items) => {
                const parent = items[0];

                submitPurchasePerItemForApproval(parent.id);
                cy.request({
                  method: 'POST',
                  url: `${SPLIT_API}/${parent.id}/actions/split`,
                  body: {
                    parts: [
                      { quantity: 8, inventory_id: invExplicit.id },
                      { quantity: 12 },
                    ],
                  },
                }).then((splitRes) => {
                  expect(splitRes.status).to.eq(200);

                  cy.request({
                    url: `${INV_API}/${invExplicit.id}`,
                    headers: { 'X-API-Key': TEST_API_KEY },
                  }).then((postRes) => {
                    expect(postRes.body.reserved_quantity).to.eq(20); // only the children's 8+12 remain
                    expect(postRes.body.quantity).to.eq(60); // O-4: physical quantity untouched
                  });
                });
              });
            });
          });
        });
      });
    });
  });

  it('DP-B1a: insufficient inventory for a split part is a hard error — tx aborts, no children created, parent unaffected', () => {
    cy.task('db:setupPurchasePerItemSingleApprovalFlow');
    // cmd_307 FIX-α: parent's own reservation is now released BEFORE the
    // children auto-allocate (same $transaction), so re-splitting entirely
    // within the parent's own already-reserved lot legitimately succeeds —
    // that is the bug FIX-α fixes, not insufficiency. To exercise a genuine
    // insufficient-inventory failure post-FIX-α, the lot's physical quantity
    // is dropped (via db:setInventoryQuantity, simulating real-world
    // shrinkage after the reservation was made) to below what the split
    // needs, so even with the parent's 10 units released there still isn't
    // enough physical stock to cover both parts.
    cy.task<any>('db:seedReservationInventory', { quantity: 10 }).then((seed) => {
      cy.request({
        method: 'POST',
        url: PO_API,
        headers: { 'X-API-Key': TEST_API_KEY },
        body: {
          order_no: 'SPLIT-003',
          customer_id: seed.customer.id,
          items: [{ product_id: seed.product.id, quantity: 10, price: null }],
        },
      }).then((poRes) => {
        expect(poRes.status).to.eq(201);
        const orderId = poRes.body.id;

        cy.request({
          url: `${INV_API}/${seed.inventory.id}`,
          headers: { 'X-API-Key': TEST_API_KEY },
        }).then((preRes) => {
          expect(preRes.body.reserved_quantity).to.eq(10);

          // Physical shrinkage after the reservation: only 6 units of real
          // stock remain, below the 10 the split's parts require in total.
          cy.task('db:setInventoryQuantity', { inventory_id: seed.inventory.id, quantity: 6 }).then(() => {
            cy.task<any>('db:getPurchasePerItemsForOrder', { purchase_order_id: orderId }).then((items) => {
              const parent = items[0];

              submitPurchasePerItemForApproval(parent.id);
              cy.request({
                method: 'POST',
                url: `${SPLIT_API}/${parent.id}/actions/split`,
                body: {
                  parts: [{ quantity: 4 }, { quantity: 6 }], // both auto-allocate, only 6 physically available
                },
                failOnStatusCode: false,
              }).then((splitRes) => {
                expect(splitRes.status).to.eq(400);
                expect(splitRes.body.error || splitRes.body.message).to.match(/Insufficient inventory/);

                cy.task<any>('db:getPurchasePerItemById', { id: parent.id }).then((parentAfter) => {
                  expect(parentAfter.status).to.eq('pending'); // unchanged — not split
                });

                cy.task<any>('db:getPurchasePerItemChildren', { parentId: parent.id }).then((children) => {
                  expect(children).to.have.length(0); // tx rolled back, no partial children
                });

                cy.request({
                  url: `${INV_API}/${seed.inventory.id}`,
                  headers: { 'X-API-Key': TEST_API_KEY },
                }).then((postRes) => {
                  // tx rollback undoes both the parent-release and any partial
                  // child claims — reserved_quantity is exactly as before the split attempt.
                  expect(postRes.body.reserved_quantity).to.eq(10);
                  expect(postRes.body.quantity).to.eq(6);
                });
              });
            });
          });
        });
      });
    });
  });

  it('cmd_307 FIX-α: re-splitting entirely within the parent\'s own already-reserved lot succeeds (parent release happens before child re-reservation)', () => {
    cy.task('db:setupPurchasePerItemSingleApprovalFlow');
    // Before FIX-α: the parent's reserve rows were released AFTER the
    // children auto-allocated/claimed, so a re-split into the very same lot
    // the parent already reserved double-counted reserved_quantity and
    // tripped a false 'Concurrent reservation conflict'. After FIX-α, the
    // release happens first (same $transaction, so isolation is preserved),
    // so this legitimate re-split succeeds.
    cy.task<any>('db:seedReservationInventory', { quantity: 100 }).then((seed) => {
      cy.request({
        method: 'POST',
        url: PO_API,
        headers: { 'X-API-Key': TEST_API_KEY },
        body: {
          order_no: 'SPLIT-004',
          customer_id: seed.customer.id,
          items: [{ product_id: seed.product.id, quantity: 100, price: null }],
        },
      }).then((poRes) => {
        expect(poRes.status).to.eq(201);
        const orderId = poRes.body.id;

        cy.request({
          url: `${INV_API}/${seed.inventory.id}`,
          headers: { 'X-API-Key': TEST_API_KEY },
        }).then((preRes) => {
          expect(preRes.body.reserved_quantity).to.eq(100);
          expect(preRes.body.quantity).to.eq(100);

          cy.task<any>('db:getPurchasePerItemsForOrder', { purchase_order_id: orderId }).then((items) => {
            const parent = items[0];

            submitPurchasePerItemForApproval(parent.id);
            cy.request({
              method: 'POST',
              url: `${SPLIT_API}/${parent.id}/actions/split`,
              body: {
                parts: [{ quantity: 50 }, { quantity: 50 }], // both auto-allocate into the same lot the parent held
              },
            }).then((splitRes) => {
              // Before FIX-α this returned 409 'Concurrent reservation conflict'.
              expect(splitRes.status).to.eq(200);
              expect(splitRes.body.ok).to.eq(true);

              cy.task<any>('db:getPurchasePerItemById', { id: parent.id }).then((parentAfter) => {
                expect(parentAfter.status).to.eq('split'); // split
              });

              cy.task<any>('db:getPurchasePerItemChildren', { parentId: parent.id }).then((children) => {
                expect(children).to.have.length(2);
                const quantities = children.map((c: any) => c.quantity).sort((a: number, b: number) => a - b);
                expect(quantities).to.deep.eq([50, 50]);
              });

              cy.request({
                url: `${INV_API}/${seed.inventory.id}`,
                headers: { 'X-API-Key': TEST_API_KEY },
              }).then((postRes) => {
                // Parent's 100 released, then both children (50+50) claim the
                // same lot — net reserved is still 100, not 200.
                expect(postRes.body.reserved_quantity).to.eq(100);
                expect(postRes.body.quantity).to.eq(100); // O-4: physical quantity untouched
              });
            });
          });
        });
      });
    });
  });

  it("cmd_307 FIX-γ: an unspecified part's inventory_id sent as '' (UI sentinel) auto-allocates instead of causing a purchase_per_item_inventory_id_fkey violation", () => {
    cy.task('db:setupPurchasePerItemSingleApprovalFlow');
    // Before FIX-γ: '' is falsy so the reserve-vs-auto-allocate branch took
    // the auto-allocate path correctly, but the child record's own
    // `inventory_id: part.inventory_id ?? parent.inventory_id` used `??`,
    // which does NOT treat '' as nullish — '' was written straight into the
    // child's inventory_id FK column, violating purchase_per_item_inventory_id_fkey
    // (no inventory row has id=''). After FIX-γ, '' is normalized to
    // undefined up front, so the auto-allocated child's inventory_id is null
    // (it must not inherit the parent's single inventory_id either, since
    // auto-allocate can span multiple lots).
    cy.task<any>('db:seedReservationInventory', { quantity: 30 }).then((seed) => {
      cy.request({
        method: 'POST',
        url: PO_API,
        headers: { 'X-API-Key': TEST_API_KEY },
        body: {
          order_no: 'SPLIT-005',
          customer_id: seed.customer.id,
          items: [{ product_id: seed.product.id, quantity: 20, price: null }],
        },
      }).then((poRes) => {
        expect(poRes.status).to.eq(201);
        const orderId = poRes.body.id;

        cy.task<any>('db:getPurchasePerItemsForOrder', { purchase_order_id: orderId }).then((items) => {
          const parent = items[0];

          submitPurchasePerItemForApproval(parent.id);
          cy.request({
            method: 'POST',
            url: `${SPLIT_API}/${parent.id}/actions/split`,
            body: {
              parts: [
                { quantity: 8, inventory_id: '' }, // UI "no lot selected" sentinel
                { quantity: 12, inventory_id: '' },
              ],
            },
          }).then((splitRes) => {
            expect(splitRes.status).to.eq(200);
            expect(splitRes.body.ok).to.eq(true);

            cy.task<any>('db:getPurchasePerItemChildren', { parentId: parent.id }).then((children) => {
              expect(children).to.have.length(2);
              for (const child of children) {
                expect(child.inventory_id).to.be.null; // never '' and never parent's inventory_id
                expect(child.inventory_transactionable_id).to.not.be.null;
              }
            });
          });
        });
      });
    });
  });

  it('item3: rejects fewer than 2 parts (400) — quantity invariant validation, generic across x-splittable entities', () => {
    cy.task('db:setupPurchasePerItemSingleApprovalFlow');
    cy.task<any>('db:seedReservationInventory', { quantity: 10 }).then((seed) => {
      cy.request({
        method: 'POST',
        url: PO_API,
        headers: { 'X-API-Key': TEST_API_KEY },
        body: {
          order_no: 'SPLIT-VAL-001',
          customer_id: seed.customer.id,
          items: [{ product_id: seed.product.id, quantity: 10, price: null }],
        },
      }).then((poRes) => {
        cy.task<any>('db:getPurchasePerItemsForOrder', { purchase_order_id: poRes.body.id }).then((items) => {
          const parent = items[0];
          submitPurchasePerItemForApproval(parent.id);
          cy.request({
            method: 'POST',
            url: `${SPLIT_API}/${parent.id}/actions/split`,
            body: { parts: [{ quantity: 10 }] },
            failOnStatusCode: false,
          }).then((res) => {
            expect(res.status).to.eq(400);
          });
        });
      });
    });
  });

  it('item3: rejects a non-positive part quantity (400)', () => {
    cy.task('db:setupPurchasePerItemSingleApprovalFlow');
    cy.task<any>('db:seedReservationInventory', { quantity: 10 }).then((seed) => {
      cy.request({
        method: 'POST',
        url: PO_API,
        headers: { 'X-API-Key': TEST_API_KEY },
        body: {
          order_no: 'SPLIT-VAL-002',
          customer_id: seed.customer.id,
          items: [{ product_id: seed.product.id, quantity: 10, price: null }],
        },
      }).then((poRes) => {
        cy.task<any>('db:getPurchasePerItemsForOrder', { purchase_order_id: poRes.body.id }).then((items) => {
          const parent = items[0];
          submitPurchasePerItemForApproval(parent.id);
          cy.request({
            method: 'POST',
            url: `${SPLIT_API}/${parent.id}/actions/split`,
            body: { parts: [{ quantity: 0 }, { quantity: 10 }] },
            failOnStatusCode: false,
          }).then((res) => {
            expect(res.status).to.eq(400);
          });
        });
      });
    });
  });

  it('item3: rejects parts that do not sum to the parent quantity (400)', () => {
    cy.task('db:setupPurchasePerItemSingleApprovalFlow');
    cy.task<any>('db:seedReservationInventory', { quantity: 10 }).then((seed) => {
      cy.request({
        method: 'POST',
        url: PO_API,
        headers: { 'X-API-Key': TEST_API_KEY },
        body: {
          order_no: 'SPLIT-VAL-003',
          customer_id: seed.customer.id,
          items: [{ product_id: seed.product.id, quantity: 10, price: null }],
        },
      }).then((poRes) => {
        cy.task<any>('db:getPurchasePerItemsForOrder', { purchase_order_id: poRes.body.id }).then((items) => {
          const parent = items[0];
          submitPurchasePerItemForApproval(parent.id);
          cy.request({
            method: 'POST',
            url: `${SPLIT_API}/${parent.id}/actions/split`,
            body: { parts: [{ quantity: 4 }, { quantity: 4 }] }, // sums to 8, parent is 10
            failOnStatusCode: false,
          }).then((res) => {
            expect(res.status).to.eq(400);
            cy.task<any>('db:getPurchasePerItemById', { id: parent.id }).then((parentAfter) => {
              expect(parentAfter.status).to.eq('pending'); // unchanged — not split
            });
          });
        });
      });
    });
  });

  it('item3: hard-fails a split part whose specified inventory_id belongs to a different product than the line (real bug fix — pre-fix this silently reserved cross-product)', () => {
    cy.task('db:setupPurchasePerItemSingleApprovalFlow');
    // Pre-fix, app/api/purchase_per_item/[id]/actions/split/route.ts's
    // specified-lot branch only checked inventory existence
    // (`tx.inventory.findUnique`), never `_childInv.product_id ===
    // (part.product_id ?? parent.product_id)` — so a lot belonging to an
    // unrelated product could be claimed. Two genuinely distinct products
    // are seeded here (seedReservationInventory vs seedSecondProduct) so the
    // mismatch is real, not just a different lot of the same product.
    cy.task<any>('db:seedReservationInventory', { quantity: 10 }).then((seed) => {
      cy.task<any>('db:seedSecondProduct', { quantity: 10 }).then((otherProduct) => {
        cy.request({
          method: 'POST',
          url: PO_API,
          headers: { 'X-API-Key': TEST_API_KEY },
          body: {
            order_no: 'SPLIT-XPROD-001',
            customer_id: seed.customer.id,
            items: [{ product_id: seed.product.id, quantity: 10, price: null }],
          },
        }).then((poRes) => {
          expect(poRes.status).to.eq(201);
          const orderId = poRes.body.id;

          cy.task<any>('db:getPurchasePerItemsForOrder', { purchase_order_id: orderId }).then((items) => {
            const parent = items[0];
            expect(parent.product_id).to.eq(seed.product.id);

            submitPurchasePerItemForApproval(parent.id);
            cy.request({
              method: 'POST',
              url: `${SPLIT_API}/${parent.id}/actions/split`,
              body: {
                parts: [
                  { quantity: 4, inventory_id: otherProduct.inventory.id }, // wrong product's lot
                  { quantity: 6 },
                ],
              },
              failOnStatusCode: false,
            }).then((splitRes) => {
              expect(splitRes.status).to.eq(400);
              expect(splitRes.body.error || splitRes.body.message).to.match(/different product/i);

              // tx rolled back entirely: parent untouched, no children created
              cy.task<any>('db:getPurchasePerItemById', { id: parent.id }).then((parentAfter) => {
                expect(parentAfter.status).to.eq('pending');
              });
              cy.task<any>('db:getPurchasePerItemChildren', { parentId: parent.id }).then((children) => {
                expect(children).to.have.length(0);
              });

              // the other product's lot was never touched — this is the
              // concrete proof the cross-product reservation did NOT happen.
              cy.request({
                url: `${INV_API}/${otherProduct.inventory.id}`,
                headers: { 'X-API-Key': TEST_API_KEY },
              }).then((otherInvRes) => {
                expect(otherInvRes.body.reserved_quantity).to.eq(0);
                expect(otherInvRes.body.quantity).to.eq(10);
              });
            });
          });
        });
      });
    });
  });
});
