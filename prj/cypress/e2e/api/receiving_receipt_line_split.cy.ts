// cmd_296 Phase1: generic x-splittable split action, exercised against
// receiving_receipt_line (quantityField=receipt_quantity, perPartRequired=
// [inventory_id], parentField=parent_id). Covers the quantity invariant
// (Σ(parts) == parent), the boundary cases, and approvable_id mandatory
// (殿裁定B — approvable is never deleted/null'd; only pending
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
            approvalFlowIds: [flowSetup.flow.id],
          })
          .then((data) => {
            Cypress.session.clearAllSavedSessions();
            cy.clearCookies();
            cy.login(flowSetup.approverUser.email, 'test-password');
            return cy.wrap({ ...data, flowSetup, inventory: invSeed.inventory, receiptQuantity });
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

        // approvable record itself is NOT deleted (殿裁定B — history/audit preserved).
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
});
