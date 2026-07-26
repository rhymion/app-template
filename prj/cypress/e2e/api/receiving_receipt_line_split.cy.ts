import { TEST_API_KEY } from '../../support/test-credentials';

// cmd_296 Phase1: generic x-splittable split action, exercised against
// receiving_receipt_line (quantityField=receipt_quantity, perPartRequired=
// [inventory_id], parentField=parent_id). Covers the quantity invariant
// (Σ(parts) == parent), the boundary cases, and approvable_id mandatory
// (approved design — approvable is never deleted/null'd; only pending
// approval_requests are removed and status flips to split).

describe('API: Receiving Receipt Line — Split (cmd_296)', () => {
  beforeEach(() => {
    cy.task('db:reset');
    cy.task('db:seed');
    cy.task('db:grantAllPermissions');
  });

  function seedLineWithApproval(receiptQuantity = 5) {
    return cy.task<any>('db:setupReceivingReceiptLineApprovalFlow').then((flowSetup) => {
      return cy.task<any>('db:seedReservationInventory', { quantity: 100 }).then((invSeed) => {
        return cy
          .task<any>('db:populateReceivingReceiptLineWithApproval', {
            creatorId: flowSetup.approverUser.id,
            approvalFlowIds: [flowSetup.flowWithRole.id],
            // Align the line's own product/inventory with invSeed's lot so the
            // split parts below (which pass invSeed.inventory.id) don't trip
            // the split action's cross-product guard.
            overrides: { receipt_quantity: receiptQuantity, inventory_id: invSeed.inventory.id, product_id: invSeed.product.id },
          })
          .then((data) => {
            Cypress.session.clearAllSavedSessions();
            cy.clearCookies();
            cy.login(flowSetup.approverUser.email, 'test-password');
            return cy.wrap({ line: data.record, approvalRequests: data.approvalRequests, flowSetup, inventory: invSeed.inventory, receiptQuantity });
          });
      });
    });
  }

  it('splits into parts summing to the parent quantity: parent → split status, approvable preserved, children created', () => {
    seedLineWithApproval().then((ctx) => {
      const { line, inventory } = ctx;
      cy.request({
        method: 'POST',
        url: `/api/receiving_receipt_line/${line.id}/actions/split`,
        body: {
          parts: [
            { receipt_quantity: 2, inventory_id: inventory.id },
            { receipt_quantity: 3, inventory_id: inventory.id },
          ],
        },
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body.ok).to.eq(true);

        // Parent: status flipped to split (1), approvable_id preserved (not null'd).
        cy.task<any>('db:getReceivingReceiptLineById', { id: line.id }).then((parent) => {
          expect(parent.status).to.eq(1);
          expect(parent.approvable_id).to.eq(line.approvable_id);
        });

        // approvable record itself is NOT deleted (approved design — history/audit preserved).
        cy.task<any>('db:getApprovableById', { approvable_id: line.approvable_id }).then((approvable) => {
          expect(approvable).to.not.be.null;
        });

        // The parent's pending approval_request was removed (invalidated), not
        // just left dangling against a still-open approvable.
        cy.task<any>('db:getPendingApprovalRequest', { approvable_id: line.approvable_id }).then((ar) => {
          expect(ar).to.be.null;
        });

        // Children: 2 rows, parent_id set, is_split_result=true, quantities preserved,
        // each with its own non-null approvable_id (fresh approvable per child).
        cy.task<any>('db:getReceivingReceiptLineChildren', { parentId: line.id }).then((children) => {
          expect(children).to.have.length(2);
          const quantities = children.map((c: any) => c.receipt_quantity).sort();
          expect(quantities).to.deep.eq([2, 3]);
          for (const child of children) {
            expect(child.parent_id).to.eq(line.id);
            expect(child.is_split_result).to.eq(true);
            expect(child.inventory_id).to.eq(inventory.id);
            expect(child.approvable_id).to.not.be.null;
            expect(child.approvable_id).to.not.eq(line.approvable_id);
            expect(child.status).to.eq(0); // pending
            // inherited (non-overridden) parent fields carried over
            expect(child.receiving_receipt_id).to.eq(line.receiving_receipt_id);
            expect(child.product_id).to.eq(line.product_id);
          }
        });
      });
    });
  });

  it('rejects fewer than 2 parts (400)', () => {
    seedLineWithApproval().then((ctx) => {
      const { line, inventory } = ctx;
      cy.request({
        method: 'POST',
        url: `/api/receiving_receipt_line/${line.id}/actions/split`,
        body: { parts: [{ receipt_quantity: 5, inventory_id: inventory.id }] },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(400);
      });
    });
  });

  it('rejects a non-positive part quantity (400)', () => {
    seedLineWithApproval().then((ctx) => {
      const { line, inventory } = ctx;
      cy.request({
        method: 'POST',
        url: `/api/receiving_receipt_line/${line.id}/actions/split`,
        body: {
          parts: [
            { receipt_quantity: 0, inventory_id: inventory.id },
            { receipt_quantity: 5, inventory_id: inventory.id },
          ],
        },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(400);
      });
    });
  });

  it('rejects parts that do not sum to the parent quantity (400)', () => {
    seedLineWithApproval().then((ctx) => {
      const { line, inventory } = ctx;
      cy.request({
        method: 'POST',
        url: `/api/receiving_receipt_line/${line.id}/actions/split`,
        body: {
          parts: [
            { receipt_quantity: 2, inventory_id: inventory.id },
            { receipt_quantity: 2, inventory_id: inventory.id },
          ], // sums to 4, parent is 5
        },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(400);
      });
    });
  });

  it('rejects a part missing the required perPartRequired field (inventory_id) (400)', () => {
    seedLineWithApproval().then((ctx) => {
      const { line } = ctx;
      cy.request({
        method: 'POST',
        url: `/api/receiving_receipt_line/${line.id}/actions/split`,
        body: {
          parts: [{ receipt_quantity: 2 }, { receipt_quantity: 3 }],
        },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(400);
      });
    });
  });

  it("cmd_307 FIX-β: splitting a receive-type entity never touches reserved_quantity or the 'Concurrent reservation conflict' path — children get an empty bridge only", () => {
    // receiving_receipt_line has x-ledger-source event_type=receive: its
    // afterApprove hook ADDS inventory on approval, it never reserves
    // existing stock. Before FIX-β the split template unconditionally
    // reused the reserve-type inventory bridge logic (hardcoded
    // event_type:'reserve'), which would spuriously touch reserved_quantity
    // and could throw 'Concurrent reservation conflict' for an entity that
    // has no reservation semantics at all.
    seedLineWithApproval().then((ctx) => {
      const { line, inventory } = ctx;
      cy.request({
        url: `/api/inventory/${inventory.id}`,
        headers: { 'X-API-Key': TEST_API_KEY },
      }).then((preRes) => {
        const reservedBefore = preRes.body.reserved_quantity;
        const quantityBefore = preRes.body.quantity;

        cy.request({
          method: 'POST',
          url: `/api/receiving_receipt_line/${line.id}/actions/split`,
          body: {
            parts: [
              { receipt_quantity: 2, inventory_id: inventory.id },
              { receipt_quantity: 3, inventory_id: inventory.id },
            ],
          },
        }).then((res) => {
          expect(res.status).to.eq(200);

          cy.request({
            url: `/api/inventory/${inventory.id}`,
            headers: { 'X-API-Key': TEST_API_KEY },
          }).then((postRes) => {
            expect(postRes.body.reserved_quantity).to.eq(reservedBefore); // untouched
            expect(postRes.body.quantity).to.eq(quantityBefore); // untouched
          });

          // Children still get their own bridge (for afterApprove to write the
          // receive ledger row against later) but no inventory_transaction rows.
          cy.task<any>('db:getReceivingReceiptLineChildren', { parentId: line.id }).then((children) => {
            expect(children).to.have.length(2);
            for (const child of children) {
              expect(child.inventory_transactionable_id).to.not.be.null;
              cy.task<any>('db:getInventoryTransactionsByBridge', {
                inventory_transactionable_id: child.inventory_transactionable_id,
              }).then((txs: any[]) => {
                expect(txs).to.have.length(0); // no reserve/receive rows written at split time
              });
            }
          });
        });
      });
    });
  });

  it('does not leave the un-split part of an entity behind — parts must cover the full quantity, not a subset', () => {
    seedLineWithApproval().then((ctx) => {
      const { line, inventory } = ctx;
      cy.request({
        method: 'POST',
        url: `/api/receiving_receipt_line/${line.id}/actions/split`,
        body: {
          parts: [
            { receipt_quantity: 1, inventory_id: inventory.id },
            { receipt_quantity: 1, inventory_id: inventory.id },
          ], // sums to 2, parent is 5 — partial split must be rejected
        },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(400);
      });
      // Parent must remain unmodified after the rejected request.
      cy.task<any>('db:getReceivingReceiptLineById', { id: line.id }).then((parent) => {
        expect(parent.status).to.eq(0);
      });
    });
  });

  it('item3: hard-fails a split part whose specified inventory_id belongs to a different product than the line (real bug fix)', () => {
    // Pre-fix, the receive-type (split_reserves_inventory=false) branch of
    // the split template stored `_childInventoryId` on the child with NO
    // existence or product check at all — the mismatch would only have
    // surfaced later, silently, when afterApprove wrote the receive ledger
    // against the wrong product's inventory cache. Now checked at split time.
    seedLineWithApproval().then((ctx) => {
      const { line } = ctx;
      cy.task<any>('db:seedSecondProduct', { quantity: 10 }).then((otherProduct) => {
        cy.request({
          method: 'POST',
          url: `/api/receiving_receipt_line/${line.id}/actions/split`,
          body: {
            parts: [
              { receipt_quantity: 2, inventory_id: otherProduct.inventory.id }, // wrong product's lot
              { receipt_quantity: 3, inventory_id: otherProduct.inventory.id },
            ],
          },
          failOnStatusCode: false,
        }).then((res) => {
          expect(res.status).to.eq(400);
          expect(res.body.error || res.body.message).to.match(/different product/i);

          cy.task<any>('db:getReceivingReceiptLineById', { id: line.id }).then((parent) => {
            expect(parent.status).to.eq(0); // unchanged — not split
          });
          cy.task<any>('db:getReceivingReceiptLineChildren', { parentId: line.id }).then((children) => {
            expect(children).to.have.length(0);
          });
        });
      });
    });
  });
});
