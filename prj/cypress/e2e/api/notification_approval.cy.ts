// cmd_318: Trigger #2 permanent fix (notifyApprovalRequestCreated wired into
// service_after_create_stub.ts.jinja2) + Trigger #1 regression coverage.
// cmd_479: href assertions — approval notifications must link to the
// approvable's own detail page, never the nonexistent /approval_request/view/.
import { TEST_API_KEY } from '../../support/test-credentials';

const LEAVE_REQUEST_API_BASE = '/api/leave_request';

describe('API: Approval / Assignment Notifications', () => {
  beforeEach(() => {
    cy.task('db:reset');
    cy.task('db:seed');
    cy.task('db:grantAllPermissions');
  });

  describe('Trigger #2: approval_request creation notifies approvers', () => {
    it('notifies the approver-role holder when a leave_request is created', () => {
      cy.task<any>('db:setupLeaveRequestApprovalFlow').then((setup) => {
        cy.request({
          method: 'POST',
          url: LEAVE_REQUEST_API_BASE,
          headers: { 'X-API-Key': setup.requestorUser.api_key },
          body: {
            user_id: setup.requestorUser.id,
            start_date: '2025-01-15T09:00:00.000Z',
            end_date: '2025-01-15T17:00:00.000Z',
            reason: 'Test Reason',
          },
        }).then((res) => {
          expect(res.status).to.eq(201);

          Cypress.session.clearAllSavedSessions();
          cy.clearCookies();
          cy.login(setup.approverUser.email, 'test-password');
          cy.request({ url: '/api/notifications' }).then((notifRes) => {
            expect(notifRes.status).to.eq(200);
            const approvalNotifications = notifRes.body.items.filter(
              (n: any) => n.type === 'approval_requested' && n.payload.entityName === 'leave_request',
            );
            expect(approvalNotifications.length).to.be.greaterThan(0);
            // cmd_479: link the approver to the leave_request's own detail
            // page, not the (nonexistent) approval_request view page.
            expect(approvalNotifications[0].payload.href).to.eq(`/leave_request/view/${res.body.id}`);
            expect(approvalNotifications[0].payload.href).not.to.match(/^\/approval_request\/view\//);
          });
        });
      });
    });

    it('does not notify the requestor (creator) themselves', () => {
      cy.task<any>('db:setupLeaveRequestApprovalFlow').then((setup) => {
        cy.request({
          method: 'POST',
          url: LEAVE_REQUEST_API_BASE,
          headers: { 'X-API-Key': setup.requestorUser.api_key },
          body: {
            user_id: setup.requestorUser.id,
            start_date: '2025-01-15T09:00:00.000Z',
            end_date: '2025-01-15T17:00:00.000Z',
            reason: 'Test Reason',
          },
        }).then((res) => {
          expect(res.status).to.eq(201);

          Cypress.session.clearAllSavedSessions();
          cy.clearCookies();
          cy.login(setup.requestorUser.email, 'test-password');
          cy.request({ url: '/api/notifications' }).then((notifRes) => {
            expect(notifRes.status).to.eq(200);
            const approvalNotifications = notifRes.body.items.filter(
              (n: any) => n.type === 'approval_requested',
            );
            expect(approvalNotifications).to.have.length(0);
          });
        });
      });
    });
  });

  describe('Trigger #1 regression: assignee still gets notified', () => {
    it('notifies the assignee when a procedure is created with an assignee (unaffected by Trigger #2 change)', () => {
      cy.task<any>('db:setupLeaveRequestApprovalFlow').then((setup) => {
        cy.request({
          method: 'POST',
          url: '/api/procedure',
          headers: { 'X-API-Key': TEST_API_KEY },
          body: {
            name: 'Test Procedure For Notification',
            assignee_id: setup.approverUser.id,
          },
        }).then((res) => {
          expect(res.status).to.eq(201);

          Cypress.session.clearAllSavedSessions();
          cy.clearCookies();
          cy.login(setup.approverUser.email, 'test-password');
          cy.request({ url: '/api/notifications' }).then((notifRes) => {
            expect(notifRes.status).to.eq(200);
            const assignedNotifications = notifRes.body.items.filter(
              (n: any) => n.type === 'assigned' && n.payload.itemType === 'procedure',
            );
            expect(assignedNotifications.length).to.be.greaterThan(0);
            // cmd_479 regression guard: Trigger #1 already linked correctly
            // before this fix — confirm it still does.
            expect(assignedNotifications[0].payload.href).to.eq(`/procedure/view/${res.body.id}`);
          });
        });
      });
    });
  });

  describe('Trigger #3: approve/reject response notifies the requestor (cmd_479)', () => {
    it('links the requestor to the leave_request detail page on approve, never /approval_request/view/', () => {
      cy.task<any>('db:setupLeaveRequestApprovalFlow').then((setup) => {
        cy.task<any>('db:populateLeaveRequestWithApproval', {
          creatorId: setup.requestorUser.id,
          approvalFlowIds: [setup.flowWithRole.id],
        }).then((data) => {
          const arId = data.approvalRequests[0].id;
          const leaveRequestId = data.record.id;
          Cypress.session.clearAllSavedSessions();
          cy.clearCookies();
          cy.login(setup.approverUser.email, 'test-password');
          cy.request({
            method: 'POST',
            url: `/api/approval_request/${arId}/approve`,
          }).then((res) => {
            expect(res.status).to.eq(200);

            Cypress.session.clearAllSavedSessions();
            cy.clearCookies();
            cy.login(setup.requestorUser.email, 'test-password');
            cy.request({ url: '/api/notifications' }).then((notifRes) => {
              expect(notifRes.status).to.eq(200);
              const responded = notifRes.body.items.filter(
                (n: any) => n.type === 'approval_responded',
              );
              expect(responded.length).to.be.greaterThan(0);
              expect(responded[0].payload.href).to.eq(`/leave_request/view/${leaveRequestId}`);
              expect(responded[0].payload.href).not.to.match(/^\/approval_request\/view\//);
            });
          });
        });
      });
    });

    it('links the requestor to the leave_request detail page on reject, never /approval_request/view/', () => {
      cy.task<any>('db:setupLeaveRequestApprovalFlow').then((setup) => {
        cy.task<any>('db:populateLeaveRequestWithApproval', {
          creatorId: setup.requestorUser.id,
          approvalFlowIds: [setup.flowWithRole.id],
        }).then((data) => {
          const arId = data.approvalRequests[0].id;
          const leaveRequestId = data.record.id;
          Cypress.session.clearAllSavedSessions();
          cy.clearCookies();
          cy.login(setup.approverUser.email, 'test-password');
          cy.request({
            method: 'POST',
            url: `/api/approval_request/${arId}/reject`,
          }).then((res) => {
            expect(res.status).to.eq(200);

            Cypress.session.clearAllSavedSessions();
            cy.clearCookies();
            cy.login(setup.requestorUser.email, 'test-password');
            cy.request({ url: '/api/notifications' }).then((notifRes) => {
              expect(notifRes.status).to.eq(200);
              const responded = notifRes.body.items.filter(
                (n: any) => n.type === 'approval_responded',
              );
              expect(responded.length).to.be.greaterThan(0);
              expect(responded[0].payload.href).to.eq(`/leave_request/view/${leaveRequestId}`);
              expect(responded[0].payload.href).not.to.match(/^\/approval_request\/view\//);
            });
          });
        });
      });
    });
  });
});
