import { TEST_API_KEY } from '../../support/test-credentials';

// D7 (B-5 Phase2c, subtask_281m revised_14_4_equiv_scenario_A + subtask_281d
// generic 13.5/13.6 templates, applied to receiving_receipt_line):
// receiving_receipt_line's terminal reject is a no-op on inventory — its
// x-ledger-source only fires on approve (afterApprove), which as of Phase2c
// remains a TODO stub. See qc_subtask_281p_gunshi.yaml e2e_gate_verdict and
// subtask_281n_gunshi.yaml final_phase2_plan.Phase2c (G13/G14).

const INV_API = '/api/inventory';

describe('API: Receiving Receipt Line — Terminal Reject (D7)', () => {
  beforeEach(() => {
    cy.task('db:reset');
    cy.task('db:seed');
    cy.task('db:grantAllPermissions');
  });

  it('14.4a_equiv: receiving_receipt_line terminal reject has no inventory effect (no-op)', () => {
    cy.task<any>('db:setupReceivingReceiptLineSingleApprovalFlow').then((flowSetup) => {
      cy.task<any>('db:seedReservationInventory', { quantity: 10 }).then((seed) => {
        cy.task<any>('db:populateReceivingReceiptLineSingleApproval', {
          creatorId: flowSetup.approverUser.id,
          approvalFlowIds: [flowSetup.flow.id],
          inventoryId: seed.inventory.id,
        }).then((data) => {
          const arId = data.approvalRequests[0].id;

          cy.task('db:countAllInventoryTransactions').then((preCount) => {
            expect(preCount).to.eq(0);
          });

          Cypress.session.clearAllSavedSessions();
          cy.clearCookies();
          cy.login(flowSetup.approverUser.email, 'test-password');
          cy.request({
            method: 'POST',
            url: `/api/approval_request/${arId}/reject`,
          }).then((res) => {
            expect(res.status).to.eq(200);
            expect(res.body.status).to.eq(3); // terminal_rejected

            cy.request({
              url: `${INV_API}/${seed.inventory.id}`,
              headers: { 'X-API-Key': TEST_API_KEY },
            }).then((invRes) => {
              // no-op: line creation never touched inventory, and afterApprove
              // (the only path that would) never fired.
              expect(invRes.body.quantity).to.eq(10);
              expect(invRes.body.reserved_quantity).to.eq(0);
            });

            cy.task('db:countAllInventoryTransactions').then((postCount) => {
              expect(postCount).to.eq(0);
            });
          });
        });
      });
    });
  });

  it('13.5_equiv: terminal reject sets approval_request.status = 3 (terminal_rejected)', () => {
    cy.task<any>('db:setupReceivingReceiptLineSingleApprovalFlow').then((flowSetup) => {
      cy.task<any>('db:populateReceivingReceiptLineSingleApproval', {
        creatorId: flowSetup.approverUser.id,
        approvalFlowIds: [flowSetup.flow.id],
      }).then((data) => {
        const arId = data.approvalRequests[0].id;

        Cypress.session.clearAllSavedSessions();
        cy.clearCookies();
        cy.login(flowSetup.approverUser.email, 'test-password');
        cy.request({
          method: 'POST',
          url: `/api/approval_request/${arId}/reject`,
        }).then((res) => {
          expect(res.status).to.eq(200);
          expect(res.body.status).to.eq(3);
        });
      });
    });
  });

  it('13.6_equiv: terminal reject sets approvable.approved_at (idempotency guard)', () => {
    cy.task<any>('db:setupReceivingReceiptLineSingleApprovalFlow').then((flowSetup) => {
      cy.task<any>('db:populateReceivingReceiptLineSingleApproval', {
        creatorId: flowSetup.approverUser.id,
        approvalFlowIds: [flowSetup.flow.id],
      }).then((data) => {
        const arId = data.approvalRequests[0].id;
        const approvableId = data.line.approvable_id;

        Cypress.session.clearAllSavedSessions();
        cy.clearCookies();
        cy.login(flowSetup.approverUser.email, 'test-password');
        cy.request({
          method: 'POST',
          url: `/api/approval_request/${arId}/reject`,
        }).then(() => {
          cy.task<any>('db:getApprovableById', { approvable_id: approvableId }).then((approvable) => {
            expect(approvable.approved_at).to.not.be.null;
          });
        });
      });
    });
  });
});
