import { TEST_API_KEY } from '../../support/test-credentials';

// item3 (cmd_309): receiving_receipt_line's approve path (afterApprove —
// writes the 'receive' ledger row + increments inventory.quantity) had NO
// coverage anywhere in the suite (receiving_receipt_line_approval_dispatch.cy.ts
// only exercises terminal reject, a documented no-op). This fills that gap
// with the successful path, a split child's independent approve, and the
// item3 cross-product hard-error (which also serves as the '承認中失敗
// (tx abort)' error case: the guard throws inside the same $transaction as
// the approval_request status flip, so everything rolls back atomically).

const INV_API = '/api/inventory';

describe('API: Receiving Receipt Line — Approve / Receive Ledger (cmd_309 item3)', () => {
  beforeEach(() => {
    cy.task('db:reset');
    cy.task('db:seed');
    cy.task('db:grantAllPermissions');
  });

  function seedLineWithApprovalAndInventory(receiptQuantity = 5) {
    return cy.task<any>('db:setupReceivingReceiptLineApprovalFlow').then((flowSetup) => {
      return cy.task<any>('db:seedReservationInventory', { quantity: 100 }).then((invSeed) => {
        return cy
          .task<any>('db:populateReceivingReceiptLineWithApproval', {
            creatorId: flowSetup.approverUser.id,
            approvalFlowIds: [flowSetup.flow.id],
          })
          .then((data) => {
            return cy.wrap({ line: data.record, approvalRequests: data.approvalRequests, flowSetup, inventory: invSeed.inventory, receiptQuantity });
          });
      });
    });
  }

  it('matching product: approve writes the receive ledger and increments inventory.quantity by receipt_quantity', () => {
    seedLineWithApprovalAndInventory(5).then((ctx) => {
      const { line, inventory, flowSetup } = ctx;
      const arId = (ctx as any).approvalRequests[0].id;

      cy.request({
        url: `${INV_API}/${inventory.id}`,
        headers: { 'X-API-Key': TEST_API_KEY },
      }).then((preRes) => {
        const quantityBefore = preRes.body.quantity;

        Cypress.session.clearAllSavedSessions();
        cy.clearCookies();
        cy.login(flowSetup.approverUser.email, 'test-password');
        cy.request({
          method: 'POST',
          url: `/api/approval_request/${arId}/approve`,
        }).then((res) => {
          expect(res.status).to.eq(200);
          expect(res.body.status).to.eq(1);

          cy.request({
            url: `${INV_API}/${inventory.id}`,
            headers: { 'X-API-Key': TEST_API_KEY },
          }).then((postRes) => {
            expect(postRes.body.quantity).to.eq(quantityBefore + line.receipt_quantity);
            expect(postRes.body.reserved_quantity).to.eq(0); // O-4: receive never touches reserved
          });

          cy.task<any>('db:getReceivingReceiptLineById', { id: line.id }).then((lineAfter: any) => {
            cy.task<any>('db:getInventoryTransactionsByBridge', {
              inventory_transactionable_id: lineAfter.inventory_transactionable_id,
            }).then((txs: any[]) => {
              expect(txs.length).to.eq(1);
              expect(txs[0].event_type).to.eq('receive');
              expect(txs[0].quantity_delta).to.eq(line.receipt_quantity);
              expect(txs[0].reserved_delta).to.eq(0);
              expect(txs[0].product_id).to.eq(line.product_id);
            });
          });

          cy.task<any>('db:getApprovableById', { approvable_id: line.approvable_id }).then((approvable: any) => {
            expect(approvable.approved_at).to.not.be.null;
          });
        });
      });
    });
  });

  it('split children: each approve independently writes its own receive ledger row against the same (matching) product', () => {
    seedLineWithApprovalAndInventory(5).then((ctx) => {
      const { line, inventory, flowSetup } = ctx;

      Cypress.session.clearAllSavedSessions();
      cy.clearCookies();
      cy.login(flowSetup.approverUser.email, 'test-password');
      cy.request({
        method: 'POST',
        url: `/api/receiving_receipt_line/${line.id}/actions/split`,
        body: {
          parts: [
            { receipt_quantity: 2, inventory_id: inventory.id },
            { receipt_quantity: 3, inventory_id: inventory.id },
          ],
        },
      }).then((splitRes) => {
        expect(splitRes.status).to.eq(200);

        cy.task<any>('db:getReceivingReceiptLineChildren', { parentId: line.id }).then((children) => {
          const [childA, childB] = children;

          cy.task<any>('db:getPendingApprovalRequest', { approvable_id: childA.approvable_id }).then((ar: any) => {
            expect(ar).to.not.be.null;
            cy.request({
              method: 'POST',
              url: `/api/approval_request/${ar.id}/approve`,
            }).then((approveRes) => {
              expect(approveRes.status).to.eq(200);

              cy.task<any>('db:getInventoryTransactionsByBridge', {
                inventory_transactionable_id: childA.inventory_transactionable_id,
              }).then((txsA: any[]) => {
                expect(txsA.length).to.eq(1);
                expect(txsA[0].quantity_delta).to.eq(childA.receipt_quantity);
              });

              // Sibling untouched — no ledger row, still pending.
              cy.task<any>('db:getReceivingReceiptLineById', { id: childB.id }).then((siblingAfter: any) => {
                expect(siblingAfter.status).to.eq(0);
              });
              cy.task<any>('db:getInventoryTransactionsByBridge', {
                inventory_transactionable_id: childB.inventory_transactionable_id,
              }).then((txsB: any[]) => {
                expect(txsB.length).to.eq(0);
              });
            });
          });
        });
      });
    });
  });

  it('item3: cross-product inventory_id hard-fails inside afterApprove — whole transaction aborts (承認中失敗/tx abort case)', () => {
    // The line's own product_id and its inventory_id's product diverge here
    // on purpose (productId left as the helper's own fresh product, while
    // inventoryId points at a different, unrelated product's lot). Pre-fix,
    // afterApprove would have written the receive ledger + incremented the
    // WRONG product's inventory cache (driven by inventory.product_id, not
    // entity.product_id) — silently. Post-fix this throws inside the same
    // $transaction as the approval_request status flip, so everything rolls
    // back: status stays pending, approved_at stays null, no ledger row, no
    // inventory change.
    cy.task<any>('db:setupReceivingReceiptLineApprovalFlow').then((flowSetup) => {
      cy.task<any>('db:seedSecondProduct', { quantity: 50 }).then((otherProduct) => {
        cy.task<any>('db:populateReceivingReceiptLineWithApproval', {
          creatorId: flowSetup.approverUser.id,
          approvalFlowIds: [flowSetup.flow.id],
        }).then((data) => {
          const { record: line, approvalRequests } = data;
          expect(line.product_id).to.not.eq(otherProduct.product.id); // genuine mismatch, confirmed

          cy.request({
            url: `${INV_API}/${otherProduct.inventory.id}`,
            headers: { 'X-API-Key': TEST_API_KEY },
          }).then((preRes) => {
            const quantityBefore = preRes.body.quantity;

            Cypress.session.clearAllSavedSessions();
            cy.clearCookies();
            cy.login(flowSetup.approverUser.email, 'test-password');
            cy.request({
              method: 'POST',
              url: `/api/approval_request/${approvalRequests[0].id}/approve`,
              failOnStatusCode: false,
            }).then((res) => {
              expect(res.status).to.eq(500);
              expect(res.body.error || res.body.message).to.match(/different product/i);

              // tx abort: approval_request never flipped, approvable never marked approved.
              cy.task<any>('db:getPendingApprovalRequest', { approvable_id: line.approvable_id }).then((ar: any) => {
                expect(ar).to.not.be.null; // still pending
              });
              cy.task<any>('db:getApprovableById', { approvable_id: line.approvable_id }).then((approvable: any) => {
                expect(approvable.approved_at).to.be.null;
              });

              // no ledger row, no inventory change on the wrong-product lot.
              cy.request({
                url: `${INV_API}/${otherProduct.inventory.id}`,
                headers: { 'X-API-Key': TEST_API_KEY },
              }).then((postRes) => {
                expect(postRes.body.quantity).to.eq(quantityBefore);
              });
              cy.task('db:countAllInventoryTransactions').then((count) => {
                expect(count).to.eq(0);
              });
            });
          });
        });
      });
    });
  });
});
