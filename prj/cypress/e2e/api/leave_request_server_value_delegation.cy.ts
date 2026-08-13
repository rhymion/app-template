// Regression tests for leave_request.user_id's x-server-value delegation
// (dict form: {source: actor, override_permission: delete}).
//
// The generated leave_request suite already proves the alpha (no explicit
// value -> actorId) and beta (default fully-privileged test actor's
// explicit value honored, since grantAllPermissions grants delete on every
// entity) paths as a side effect of its normal CRUD coverage — see
// api/leave_request.cy.ts test 3.1. What it does NOT cover is the gamma
// path: an actor who does NOT hold override_permission supplying an
// explicit user_id. This spec exercises gamma directly with a
// purpose-built limited-permission actor.
import { TEST_API_KEY } from '../../support/test-credentials';

const API_BASE = '/api/leave_request';

describe('API: Leave Request — x-server-value delegation (user_id)', () => {
  beforeEach(() => {
    cy.task('db:reset');
    cy.task('db:seed');
  });

  it('gamma: an actor without delete permission on leave_request cannot impersonate another user via user_id — value is silently replaced with actorId, surfaced via _server_value_overrides', () => {
    cy.task<any>('db:createUserWithName', { name: 'Impersonation Target' }).then((impersonationTarget) => {
      cy.task<string>('db:createApiUserWithPermission', {
        entityName: 'leave_request',
        flags: { create: true, read: true, update: true, delete: false },
        label: 'no_delete',
      }).then((limitedApiKey) => {
        cy.request({
          method: 'POST',
          url: API_BASE,
          headers: { 'X-API-Key': limitedApiKey },
          body: {
            start_date: '2025-01-15T09:00:00.000Z',
            end_date: '2025-01-15T17:00:00.000Z',
            reason: 'Gamma path check',
            user_id: impersonationTarget.id,
          },
        }).then((res) => {
          // Not a rejection: the create still succeeds (gamma is a silent
          // substitution, not a 4xx) -- the design doc's explicit contract.
          expect(res.status).to.eq(201);
          expect(res.body._server_value_overrides).to.deep.eq({ user_id: 'overridden' });

          cy.request({
            url: `${API_BASE}/${res.body.id}`,
            headers: { 'X-API-Key': limitedApiKey },
          }).then((getRes) => {
            expect(getRes.status).to.eq(200);
            // Attributed to the real actor, not the id they tried to supply.
            expect(getRes.body.user.id).to.not.eq(impersonationTarget.id);
          });
        });
      });
    });
  });

  it('beta (explicit, purpose-built): an actor holding delete permission on leave_request may file a request on another user\'s behalf — no _server_value_overrides is present', () => {
    cy.task<any>('db:createUserWithName', { name: 'Delegation Target' }).then((targetUser) => {
      cy.task<string>('db:createApiUserWithPermission', {
        entityName: 'leave_request',
        flags: { create: true, read: true, update: true, delete: true },
        label: 'with_delete',
      }).then((privilegedApiKey) => {
        cy.request({
          method: 'POST',
          url: API_BASE,
          headers: { 'X-API-Key': privilegedApiKey },
          body: {
            start_date: '2025-01-15T09:00:00.000Z',
            end_date: '2025-01-15T17:00:00.000Z',
            reason: 'Beta path check',
            user_id: targetUser.id,
          },
        }).then((res) => {
          expect(res.status).to.eq(201);
          expect(res.body._server_value_overrides).to.be.undefined;

          cy.request({
            url: `${API_BASE}/${res.body.id}`,
            headers: { 'X-API-Key': privilegedApiKey },
          }).then((getRes) => {
            expect(getRes.status).to.eq(200);
            expect(getRes.body.user.id).to.eq(targetUser.id);
          });
        });
      });
    });
  });

  it('alpha: an actor submitting no user_id gets their own id — sanity check, no _server_value_overrides', () => {
    cy.task('db:grantAllPermissions');
    cy.request({
      method: 'POST',
      url: API_BASE,
      headers: { 'X-API-Key': TEST_API_KEY },
      body: {
        start_date: '2025-01-15T09:00:00.000Z',
        end_date: '2025-01-15T17:00:00.000Z',
        reason: 'Alpha path check',
      },
    }).then((res) => {
      expect(res.status).to.eq(201);
      expect(res.body._server_value_overrides).to.be.undefined;

      cy.request({
        url: `${API_BASE}/${res.body.id}`,
        headers: { 'X-API-Key': TEST_API_KEY },
      }).then((getRes) => {
        // actorId was written unconditionally — a truthy, well-formed id,
        // never null (this attribution mechanism is proven pervasively
        // elsewhere via creator_id; this is a narrow sanity check that
        // the same actorId also lands in user_id specifically).
        expect(getRes.body.user.id).to.be.a('string').and.not.be.empty;
      });
    });
  });
});
