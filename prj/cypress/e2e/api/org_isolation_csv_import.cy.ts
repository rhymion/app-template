// Regression/proof suite for the CSV-import organization-isolation fix
// (self-id filter on organization-typed lookups) and the required-vs-optional
// organization branching it unlocks. Uses `resource` (organization required)
// and `parent1` (organization optional) as the two testbed entities.
//
// Both entities are should_filter_by_org=true (they carry an organization
// relationship), so their import routes resolve the actor via session auth
// (getSessionUserId()), not X-API-Key -- same as the generated N11/N12/N13
// round-trip tests in resource.cy.ts, which this suite follows the pattern of.
import { TEST_API_KEY, TEST_CREDENTIALS } from '../../support/test-credentials';

const RESOURCE_API_BASE = '/api/resource';
const PARENT1_API_BASE = '/api/parent1';

function commitCsv(base: string, csv: string) {
  return cy.request({
    method: 'POST',
    url: `${base}/import`,
    body: { csv, dryRun: true },
  }).then((dryRes) => {
    const confirmToken = dryRes.body.confirmToken as string;
    return cy.request({
      method: 'POST',
      url: `${base}/import`,
      body: { csv, dryRun: false, confirmToken },
    });
  });
}

function dryRunCsv(base: string, csv: string) {
  return cy.request({
    method: 'POST',
    url: `${base}/import`,
    body: { csv, dryRun: true },
    failOnStatusCode: false,
  });
}

describe('API: CSV import organization isolation (cmd_611/612)', () => {
  beforeEach(() => {
    cy.task('db:reset');
    cy.task('db:seed');
    cy.task('db:grantAllPermissions');
    Cypress.session.clearAllSavedSessions();
    cy.login(TEST_CREDENTIALS.email, TEST_CREDENTIALS.password);
  });

  // 甲 is proven via UPDATE (re-import of an already-existing row), not CREATE:
  // `resource` also carries an auto-create one-to-one bridge (attachable_id),
  // which api_import_route.ts.jinja2 cannot satisfy on CREATE (it writes
  // straight to tx.model.create(), bypassing service.ts's one_to_one_pre_creates
  // step that the interactive form path relies on) -- a pre-existing gap in
  // the CSV-import mechanism, unrelated to org isolation and already
  // independently proven by the generated N11/N12 round-trip tests in
  // resource.cy.ts (both green). UPDATE only touches the fields actually
  // present in updateData, so it never hits that gap, and still exercises
  // the exact same org self-id-filter lookup path as CREATE would.
  it('甲 (resource, required org): importing a row explicitly naming the actor\'s own organization is honored, matched by key, and updates the existing row', () => {
    cy.task<any[]>('db:populateResource', 1).then(([r1]) => {
      cy.task<any>('db:populateResourceDependencies').then((deps) => {
        const csv = `name,organization_name\n${r1.name},${deps.organization.name}\n`;
        commitCsv(RESOURCE_API_BASE, csv).then((res) => {
          expect(res.status).to.eq(200);
          expect(res.body.summary.succeeded, JSON.stringify(res.body)).to.eq(1);
          expect(res.body.summary.failed).to.eq(0);
          expect(res.body.errors).to.deep.eq([]);

          cy.request({
            url: `${RESOURCE_API_BASE}/${r1.id}`,
            headers: { 'X-API-Key': TEST_API_KEY },
          }).then((getRes) => {
            expect(getRes.status).to.eq(200);
            expect(getRes.body.organization.id).to.eq(deps.organization.id);
          });
        });
      });
    });
  });

  it('乙 (resource, required org, MOST IMPORTANT): importing a row naming a DIFFERENT organization is rejected with a row number, not silently attached', () => {
    cy.task<any>('db:createCrossOrgScenario', { entityName: 'resource' }).then((scenario) => {
      // orgB is deliberately NOT enrolled for the acting test user (the
      // "foreign" org) -- fetch its name via the organization CRUD route,
      // which is unfiltered by membership (organization doesn't org-scope
      // against itself), same as any admin-permissioned actor could.
      cy.request({
        url: `/api/organization/${scenario.orgB.id}`,
        headers: { 'X-API-Key': TEST_API_KEY },
      }).then((orgBRes) => {
        const otherOrgName = orgBRes.body.name;
        const csv = `name,organization_name\nForeign Org Resource,${otherOrgName}\n`;
        dryRunCsv(RESOURCE_API_BASE, csv).then((res) => {
          expect(res.status).to.eq(200);
          expect(res.body.summary.succeeded).to.eq(0);
          expect(res.body.summary.failed).to.eq(1);
          expect(res.body.errors).to.have.length(1);
          expect(res.body.errors[0].row).to.eq(2);
          expect(res.body.errors[0].code).to.eq('NOT_FOUND');

          // The row must never actually be created, even though the other
          // org genuinely exists in the DB -- it's just not one the actor belongs to.
          cy.request({
            url: `${RESOURCE_API_BASE}?search=Foreign Org Resource`,
            headers: { 'X-API-Key': TEST_API_KEY },
          }).then((getRes) => {
            expect(getRes.body.rows.length).to.eq(0);
          });
        });
      });
    });
  });

  it('B-2 required-org path (resource): missing organization column value is a dry-run row error, not a silent null write', () => {
    const csv = `name,organization_name\nNo Org Resource,\n`;
    dryRunCsv(RESOURCE_API_BASE, csv).then((res) => {
      expect(res.status).to.eq(200);
      expect(res.body.summary.succeeded).to.eq(0);
      expect(res.body.summary.failed).to.eq(1);
      expect(res.body.errors[0].row).to.eq(2);
      expect(res.body.errors[0].code).to.eq('NOT_FOUND');
    });
  });

  it('B-2 optional-org path (parent1): missing organization column value succeeds, row created with no organization', () => {
    const csv = 'name,organization_name,price,due_date\nOrgless Parent1,,100,2026-12-31T00:00:00.000Z\n';
    commitCsv(PARENT1_API_BASE, csv).then((res) => {
      expect(res.status).to.eq(200);
      expect(res.body.summary.succeeded, JSON.stringify(res.body)).to.eq(1);
      expect(res.body.summary.failed).to.eq(0);
      expect(res.body.errors).to.deep.eq([]);
      // NOTE: deliberately not asserting list/search visibility here -- see
      // the getters.ts.jinja2 null-organization list-filter gap flagged
      // separately in the report (SQL `IN` never matches NULL, so an
      // org-less parent1 row is invisible to every org-scoped list query,
      // including its own creator's). That's an open design question
      // (same one flagged for A-1's onDelete choice), not something this
      // task resolves unilaterally -- this test only proves the IMPORT
      // itself succeeds without an organization, per B-2's requirement.
    });
  });
});
