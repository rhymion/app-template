// cmd_452: org-membership IDOR regression suite (design review,
// implementation fix). Uses `resource` — the only entity in this
// schema that is both org-scoped (organization_id) and fully CRUD+api
// enabled — as the target. R1 belongs to org_a (created by populateResource,
// which also enrolls the main TEST_CREDENTIALS user in org_a). user_b is a
// distinct actor granted full CRUD+import permission on 'resource' but
// deliberately NOT enrolled in org_a — the exact IDOR precondition the audit
// flagged ("actor has general.update/delete role").
//
// ORG-ISO-4/5 (session-based server actions upsertResource/removeResource)
// have no stable HTTP path reachable through the app's own UI: every page
// that could render their form (list, edit) already requires org membership
// to load (the already-CLEAN read path 404s first), so a genuine UI click
// from user_b never reaches the action at all. That UI-unreachability is
// exactly why these two mutation paths were IDOR-vulnerable in the first
// place — a real attacker doesn't need the UI, they replay a captured
// request with a forged id. These two tests do the same: capture the exact
// request Next.js sends for a legitimate same-org edit/delete (via
// cy.intercept, without letting it reach the server), then replay that
// same request verbatim under user_b's session. The Next-Action wire format
// carries the mutation arguments in plain, unencrypted JSON/multipart
// fields (verified by inspecting the captured body) — there is no
// closure-encryption blocking this on the arguments used here, so the
// replay exercises the exact server-side authorization code path a forged
// request would.
import { TEST_CREDENTIALS, TEST_API_KEY } from '../../support/test-credentials';

const RESOURCE_API_BASE = '/api/resource';

function createNonMemberApiUser() {
  return cy.task<string>('db:createApiUserWithPermission', {
    entityName: 'resource',
    flags: { create: true, read: true, update: true, delete: true, import: true },
    label: 'orgb_api',
  });
}

function createNonMemberSessionUser() {
  return cy.task<string>('db:createSessionUserWithPermission', {
    entityName: 'resource',
    flags: { create: true, read: true, update: true, delete: true, import: true },
    label: 'orgb_session',
  });
}

describe('API: org-membership isolation (cmd_452)', () => {
  beforeEach(() => {
    cy.task('db:reset');
    cy.task('db:seed');
    // TEST_CREDENTIALS becomes the org_a member/control actor: populateResource's
    // dependency helper enrolls it in "Test Organization" (org_a) as R1's creator;
    // grantAllPermissions gives it the RBAC flags needed to act as a legitimate
    // in-org control for each negative assertion below.
    cy.task('db:grantAllPermissions');
    Cypress.session.clearAllSavedSessions();
    cy.clearCookies();
  });

  it('ORG-ISO-1: detail GET — non-member gets 404, member gets 200 (regression guard)', () => {
    cy.task<any[]>('db:populateResource', 1).then(([r1]) => {
      createNonMemberApiUser().then((userBKey) => {
        cy.request({
          url: `${RESOURCE_API_BASE}/${r1.id}`,
          headers: { 'X-API-Key': userBKey },
          failOnStatusCode: false,
        }).then((res) => {
          expect(res.status).to.eq(404);
        });
      });
      cy.request({
        url: `${RESOURCE_API_BASE}/${r1.id}`,
        headers: { 'X-API-Key': TEST_API_KEY },
      }).then((res) => {
        expect(res.status).to.eq(200);
      });
    });
  });

  it('ORG-ISO-2: detail PUT — non-member gets 404, record unchanged (GAP-1 fix)', () => {
    cy.task<any[]>('db:populateResource', 1).then(([r1]) => {
      createNonMemberApiUser().then((userBKey) => {
        cy.request({
          method: 'PUT',
          url: `${RESOURCE_API_BASE}/${r1.id}`,
          headers: { 'X-API-Key': userBKey },
          body: { name: 'Attempted Overwrite By User B', description: null, organization_id: r1.organization_id },
          failOnStatusCode: false,
        }).then((res) => {
          expect(res.status).to.eq(404);
        });
      });
      cy.request({
        url: `${RESOURCE_API_BASE}/${r1.id}`,
        headers: { 'X-API-Key': TEST_API_KEY },
      }).then((res) => {
        expect(res.body.name).to.eq('Resource 1');
      });
    });
  });

  it('ORG-ISO-3: detail DELETE — non-member gets 404, record survives (GAP-1 fix)', () => {
    cy.task<any[]>('db:populateResource', 1).then(([r1]) => {
      createNonMemberApiUser().then((userBKey) => {
        cy.request({
          method: 'DELETE',
          url: `${RESOURCE_API_BASE}/${r1.id}`,
          headers: { 'X-API-Key': userBKey },
          failOnStatusCode: false,
        }).then((res) => {
          expect(res.status).to.eq(404);
        });
      });
      cy.request({
        url: `${RESOURCE_API_BASE}/${r1.id}`,
        headers: { 'X-API-Key': TEST_API_KEY },
      }).then((res) => {
        expect(res.status).to.eq(200);
      });
    });
  });

  it('ORG-ISO-4: session delete (removeResource) — non-member replay leaves R1 intact (GAP-3 fix)', () => {
    cy.task<any[]>('db:populateResource', 1).then(([r1]) => {
      let captured: { headers: Record<string, string>; body: string } | null = null;
      cy.intercept('POST', '**/en/resource', (req) => {
        captured = { headers: req.headers as Record<string, string>, body: req.body };
        req.reply({ statusCode: 200, headers: { 'content-type': 'text/x-component' }, body: '' });
      }).as('deleteCall');

      cy.visit('/en/');
      cy.login(TEST_CREDENTIALS.email, TEST_CREDENTIALS.password);
      cy.visit('/en/resource');
      cy.get('.MuiDataGrid-virtualScroller').scrollTo('bottom', { ensureScrollable: false });
      cy.contains('Resource 1').should('be.visible');
      cy.get('input[type="checkbox"]').eq(1).click({ force: true });
      cy.get('div').find('button[aria-label="Delete Selected"]').first().click();
      cy.get('div[role="dialog"]').find('button').contains('Delete').first().click();

      cy.wait('@deleteCall').then(() => {
        expect(captured).to.not.be.null;
        createNonMemberSessionUser().then((emailB) => {
          Cypress.session.clearAllSavedSessions();
          cy.clearCookies();
          cy.visit('/en/');
          cy.login(emailB, TEST_CREDENTIALS.password);
          cy.request({
            method: 'POST',
            url: '/en/resource',
            headers: {
              'next-action': captured!.headers['next-action'],
              'content-type': captured!.headers['content-type'],
              accept: 'text/x-component',
            },
            body: captured!.body,
            failOnStatusCode: false,
          });

          cy.request({
            url: `${RESOURCE_API_BASE}/${r1.id}`,
            headers: { 'X-API-Key': TEST_API_KEY },
          }).then((res) => {
            expect(res.status).to.eq(200);
          });
        });
      });
    });
  });

  it('ORG-ISO-5: session upsert (upsertResource) — non-member replay leaves R1 unchanged (GAP-2 fix)', () => {
    cy.task<any[]>('db:populateResource', 1).then(([r1]) => {
      let captured: { headers: Record<string, string>; body: string } | null = null;
      cy.intercept('POST', `**/en/resource/edit/${r1.id}`, (req) => {
        captured = { headers: req.headers as Record<string, string>, body: req.body };
        req.reply({ statusCode: 200, headers: { 'content-type': 'text/x-component' }, body: '' });
      }).as('saveCall');

      cy.visit('/en/');
      cy.login(TEST_CREDENTIALS.email, TEST_CREDENTIALS.password);
      cy.visit(`/en/resource/edit/${r1.id}`);
      cy.fillField('Name', 'Resource 1 EDITED BY ATTACKER');
      cy.clickButton('Save');

      cy.wait('@saveCall').then(() => {
        expect(captured).to.not.be.null;
        createNonMemberSessionUser().then((emailB) => {
          Cypress.session.clearAllSavedSessions();
          cy.clearCookies();
          cy.visit('/en/');
          cy.login(emailB, TEST_CREDENTIALS.password);
          cy.request({
            method: 'POST',
            url: `/en/resource/edit/${r1.id}`,
            headers: {
              'next-action': captured!.headers['next-action'],
              'content-type': captured!.headers['content-type'],
              accept: 'text/x-component',
            },
            body: captured!.body,
            failOnStatusCode: false,
          });

          cy.request({
            url: `${RESOURCE_API_BASE}/${r1.id}`,
            headers: { 'X-API-Key': TEST_API_KEY },
          }).then((res) => {
            expect(res.body.name).to.eq('Resource 1');
          });
        });
      });
    });
  });

  it('ORG-ISO-6: list — non-member never sees R1 (regression guard)', () => {
    cy.task<any[]>('db:populateResource', 1).then(([r1]) => {
      createNonMemberApiUser().then((userBKey) => {
        cy.request({
          url: RESOURCE_API_BASE,
          headers: { 'X-API-Key': userBKey },
        }).then((res) => {
          expect(res.status).to.eq(200);
          expect(res.body.rows.map((row: any) => row.id)).to.not.include(r1.id);
        });
      });
    });
  });

  it('ORG-ISO-7: export — non-member CSV never contains R1 (regression guard)', () => {
    cy.task<any[]>('db:populateResource', 1).then(([r1]) => {
      createNonMemberSessionUser().then((emailB) => {
        cy.visit('/en/');
        cy.login(emailB, TEST_CREDENTIALS.password);
        cy.request({ url: `${RESOURCE_API_BASE}/export` }).then((res) => {
          expect(res.status).to.eq(200);
          expect(res.body).to.not.include(r1.id);
          expect(res.body).to.not.include('Resource 1');
        });
      });
    });
  });

  // ORG-ISO-8 (GAP-4, import UPDATE path): NOT executable against a real
  // entity today. Import (x-import-key) and organization scoping never
  // co-occur on any entity in the current schema (verified via a schema
  // sweep across all `definitions` — 8 entities carry x-import-key, none
  // of them carry organization_id, and vice versa for the 2 org-scoped
  // entities: `resource`, `parent1`). The GAP-4 fix (api_import_route.ts.jinja2)
  // is still applied and covered by the golden-diff backward check — this
  // is a template-level fix with no live entity to exercise via e2e until a
  // future entity combines both. Adding a schema-only synthetic entity
  // solely to exercise this branch was judged out of scope for a security
  // patch (see cmd_452 for the full rationale).
});
