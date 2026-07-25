// cmd_445 subtask E: end-to-end regression coverage for the exact 9-step
// mechanism in the RCA verification design
// (queue/reports/subtask_445a_gunshi.yaml verification_design.local_single_process.mechanism).
//
// Reuses db:setupLeaveRequestApprovalFlow's flowWithRole fixture as-is
// (requestor_role_id + approver_role_id both set, and each returned user
// holds exactly one of those roles). The RCA's final root cause (subtask_445i)
// is that approval_request creation is gated on requestor/approver role
// matching the approval_flow's role fields *exactly* — a flow or user set up
// without that strict role wiring silently produces zero approval_requests
// and therefore zero notifications, which is exactly the false-negative this
// spec exists to prevent (a data-setup shortcut here would make this spec
// pass without exercising the real trigger at all).
const LEAVE_REQUEST_API_BASE = '/api/leave_request';
const PROCEDURE_API_BASE = '/api/procedure';

function notificationsFor(email: string) {
  Cypress.session.clearAllSavedSessions();
  cy.clearCookies();
  cy.login(email, 'test-password');
  return cy.request({ url: '/api/notifications' }).then((res) => {
    expect(res.status).to.eq(200);
    return res.body.items as any[];
  });
}

describe('API: Notification Trigger End-to-End (cmd_445 subtask E)', () => {
  beforeEach(() => {
    cy.task('db:reset');
    cy.task('db:seed');
    cy.task('db:grantAllPermissions');
  });

  it('walks approval_requested + assigned notifications with self-exclusion at every step', () => {
    cy.task<any>('db:setupLeaveRequestApprovalFlow').then((setup) => {
      const userA = setup.requestorUser; // holds requestorRole only
      const userB = setup.approverUser; // holds approverRole only

      // Steps 1-3: user A creates a leave_request under flowWithRole.
      cy.request({
        method: 'POST',
        url: LEAVE_REQUEST_API_BASE,
        headers: { 'X-API-Key': userA.api_key },
        body: {
          user_id: userA.id,
          start_date: '2025-01-15T09:00:00.000Z',
          end_date: '2025-01-15T17:00:00.000Z',
          reason: 'cmd_445 subtask E verification',
        },
      }).then((createRes) => {
        expect(createRes.status).to.eq(201);

        // Step 4: user B (approver-role holder) receives approval_requested.
        notificationsFor(userB.email).then((items) => {
          const approvalNotifs = items.filter(
            (n) => n.type === 'approval_requested' && n.payload.entityName === 'leave_request',
          );
          expect(approvalNotifs.length).to.be.greaterThan(0);
        });

        // Step 5: user A (requestor/creator) receives none — self-exclusion.
        notificationsFor(userA.email).then((items) => {
          const approvalNotifs = items.filter((n) => n.type === 'approval_requested');
          expect(approvalNotifs).to.have.length(0);
        });
      });

      // Step 6: user A creates a procedure (no assignee yet), then assigns it to user B.
      cy.request({
        method: 'POST',
        url: PROCEDURE_API_BASE,
        headers: { 'X-API-Key': userA.api_key },
        body: { name: 'cmd_445 subtask E procedure', children: [], preceded_by: [], followed_by: [] },
      }).then((procCreateRes) => {
        expect(procCreateRes.status).to.eq(201);
        const procedureId = procCreateRes.body.id;

        cy.request({
          method: 'PUT',
          url: `${PROCEDURE_API_BASE}/${procedureId}`,
          headers: { 'X-API-Key': userA.api_key },
          body: {
            name: 'cmd_445 subtask E procedure',
            description: null,
            parent_id: null,
            assignee_id: userB.id,
            children: [],
            preceded_by: [],
            followed_by: [],
          },
        }).then((assignRes) => {
          expect(assignRes.status).to.eq(200);

          // Step 7: user B receives an assigned notification.
          notificationsFor(userB.email).then((items) => {
            const assignedNotifs = items.filter(
              (n) => n.type === 'assigned' && n.payload.itemType === 'procedure' && n.payload.itemId === procedureId,
            );
            expect(assignedNotifs).to.have.length(1);
          });

          // Step 8: user A re-assigns the same procedure back to themself (self-assign).
          cy.request({
            method: 'PUT',
            url: `${PROCEDURE_API_BASE}/${procedureId}`,
            headers: { 'X-API-Key': userA.api_key },
            body: {
              name: 'cmd_445 subtask E procedure',
              description: null,
              parent_id: null,
              assignee_id: userA.id,
              children: [],
              preceded_by: [],
              followed_by: [],
            },
          }).then((selfAssignRes) => {
            expect(selfAssignRes.status).to.eq(200);

            // Step 9: user A gets no new assigned notification for the self-assign.
            notificationsFor(userA.email).then((items) => {
              const assignedNotifs = items.filter(
                (n) => n.type === 'assigned' && n.payload.itemType === 'procedure' && n.payload.itemId === procedureId,
              );
              expect(assignedNotifs).to.have.length(0);
            });

            // User B's earlier assigned notification is unaffected by a change they were not party to.
            notificationsFor(userB.email).then((items) => {
              const assignedNotifs = items.filter(
                (n) => n.type === 'assigned' && n.payload.itemType === 'procedure' && n.payload.itemId === procedureId,
              );
              expect(assignedNotifs).to.have.length(1);
            });
          });
        });
      });
    });
  });
});
