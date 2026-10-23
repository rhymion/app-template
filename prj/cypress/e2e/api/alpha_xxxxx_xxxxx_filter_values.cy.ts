// cmd_874/subtask_874f: x-filter-values end-to-end regression coverage.
// alpha_xxxxx_xxxxx is a view of xxxxx_xxxxx restricted to team=alpha rows
// (x-filter-values: { team: [alpha] }). This spec creates rows directly via
// xxxxx_xxxxx's own full-CRUD API (bypassing the auto-generated populate
// helper's random `team` values, which do not exist to satisfy any
// particular filter) so each test controls exactly which rows are inside
// vs. outside the filtered view, then proves the filter is enforced
// server-side on every path: list/detail read, and PUT/DELETE write,
// judged against the row's PRE-image state.
import { TEST_API_KEY } from '../../support/test-credentials';

const BASE_API = '/api/xxxxx_xxxxx';
const FILTERED_API = '/api/alpha_xxxxx_xxxxx';

function createXxxxxXxxxx(team: string, name = `Row ${team} ${Date.now()}`) {
  return cy
    .request({
      method: 'POST',
      url: BASE_API,
      headers: { 'X-API-Key': TEST_API_KEY },
      body: { name, team, yyyyy_yyyyys: [] },
    })
    .then((res) => {
      expect(res.status).to.eq(201);
      return res.body.id as string;
    });
}

describe('API: x-filter-values row scope (alpha_xxxxx_xxxxx, cmd_874/subtask_874f)', () => {
  beforeEach(() => {
    cy.task('db:reset');
    cy.task('db:seed');
    cy.task('db:grantAllPermissions');
    Cypress.session.clearAllSavedSessions();
  });

  describe('Read paths exclude filtered-out rows', () => {
    it('FV-1: list only returns team=alpha rows', () => {
      createXxxxxXxxxx('alpha').then((alphaId) => {
        createXxxxxXxxxx('beta').then((betaId) => {
          cy.request({ url: FILTERED_API, headers: { 'X-API-Key': TEST_API_KEY } }).then((res) => {
            expect(res.status).to.eq(200);
            const ids = res.body.rows.map((r: { id: string }) => r.id);
            expect(ids).to.include(alphaId);
            expect(ids).to.not.include(betaId);
          });
        });
      });
    });

    it('FV-2: detail GET — alpha row 200, beta row 404', () => {
      createXxxxxXxxxx('alpha').then((alphaId) => {
        createXxxxxXxxxx('beta').then((betaId) => {
          cy.request({ url: `${FILTERED_API}/${alphaId}`, headers: { 'X-API-Key': TEST_API_KEY } }).then((res) => {
            expect(res.status).to.eq(200);
            expect(res.body.id).to.eq(alphaId);
          });
          cy.request({
            url: `${FILTERED_API}/${betaId}`,
            headers: { 'X-API-Key': TEST_API_KEY },
            failOnStatusCode: false,
          }).then((res) => {
            expect(res.status).to.eq(404);
          });
        });
      });
    });

    it('FV-3: export CSV excludes the beta row', () => {
      createXxxxxXxxxx('alpha', 'Alpha Export Row').then(() => {
        createXxxxxXxxxx('beta', 'Beta Export Row').then(() => {
          cy.request({ url: `${FILTERED_API}/export`, headers: { 'X-API-Key': TEST_API_KEY } }).then((res) => {
            expect(res.status).to.eq(200);
            expect(res.body as string).to.include('Alpha Export Row');
            expect(res.body as string).to.not.include('Beta Export Row');
          });
        });
      });
    });

    it('FV-4: global search surfaces only the alpha row', () => {
      const marker = `Uniq${Date.now()}`;
      createXxxxxXxxxx('alpha', `${marker} Alpha`).then(() => {
        createXxxxxXxxxx('beta', `${marker} Beta`).then(() => {
          cy.request({ url: `/api/search?q=${marker}`, headers: { 'X-API-Key': TEST_API_KEY } }).then((res) => {
            expect(res.status).to.eq(200);
            const alphaHits = res.body.results.filter(
              (r: { entity_type: string }) => r.entity_type === 'alpha_xxxxx_xxxxx'
            );
            expect(alphaHits.length).to.eq(1);
            const xxxxxHits = res.body.results.filter(
              (r: { entity_type: string }) => r.entity_type === 'xxxxx_xxxxx'
            );
            // The base (unfiltered) view still surfaces both rows —
            // x-filter-values scopes the view it's declared on, not the
            // underlying model's other views.
            expect(xxxxxHits.length).to.eq(2);
          });
        });
      });
    });
  });

  describe('Write paths judge the pre-image row (cmd_874 ruling_C)', () => {
    it('FV-5: PUT on an already-filtered-out row (beta) 404s, row unchanged', () => {
      createXxxxxXxxxx('beta', 'Untouched Beta').then((betaId) => {
        cy.request({
          method: 'PUT',
          url: `${FILTERED_API}/${betaId}`,
          headers: { 'X-API-Key': TEST_API_KEY },
          body: { name: 'Attempted Overwrite', description: null, team: 'alpha' },
          failOnStatusCode: false,
        }).then((res) => {
          expect(res.status).to.eq(404);
        });
        cy.request({ url: `${BASE_API}/${betaId}`, headers: { 'X-API-Key': TEST_API_KEY } }).then((res) => {
          expect(res.status).to.eq(200);
          expect(res.body.name).to.eq('Untouched Beta');
          expect(res.body.team).to.eq('beta');
        });
      });
    });

    it('FV-6: a legitimate PUT moving a row OUT of the filter (alpha -> beta) succeeds', () => {
      createXxxxxXxxxx('alpha', 'Transitioning Row').then((alphaId) => {
        cy.request({
          method: 'PUT',
          url: `${FILTERED_API}/${alphaId}`,
          headers: { 'X-API-Key': TEST_API_KEY },
          body: { name: 'Transitioning Row', description: null, team: 'beta' },
        }).then((res) => {
          expect(res.status).to.eq(200);
        });
        cy.request({ url: `${BASE_API}/${alphaId}`, headers: { 'X-API-Key': TEST_API_KEY } }).then((res) => {
          expect(res.status).to.eq(200);
          expect(res.body.team).to.eq('beta');
        });
      });
    });

    it('FV-7: once outside the filter, a second PUT via the filtered view 404s (pre-image now beta)', () => {
      createXxxxxXxxxx('alpha', 'Twice Touched Row').then((alphaId) => {
        cy.request({
          method: 'PUT',
          url: `${FILTERED_API}/${alphaId}`,
          headers: { 'X-API-Key': TEST_API_KEY },
          body: { name: 'Twice Touched Row', description: null, team: 'beta' },
        }).then((res) => {
          expect(res.status).to.eq(200);
        });
        cy.request({
          method: 'PUT',
          url: `${FILTERED_API}/${alphaId}`,
          headers: { 'X-API-Key': TEST_API_KEY },
          body: { name: 'Should Not Apply', description: null, team: 'beta' },
          failOnStatusCode: false,
        }).then((res) => {
          expect(res.status).to.eq(404);
        });
        cy.request({ url: `${BASE_API}/${alphaId}`, headers: { 'X-API-Key': TEST_API_KEY } }).then((res) => {
          expect(res.body.name).to.eq('Twice Touched Row');
        });
      });
    });

    it('FV-8: DELETE on a filtered-out row (beta) 404s, row still exists', () => {
      createXxxxxXxxxx('beta').then((betaId) => {
        cy.request({
          method: 'DELETE',
          url: `${FILTERED_API}/${betaId}`,
          headers: { 'X-API-Key': TEST_API_KEY },
          failOnStatusCode: false,
        }).then((res) => {
          expect(res.status).to.eq(404);
        });
        cy.request({ url: `${BASE_API}/${betaId}`, headers: { 'X-API-Key': TEST_API_KEY } }).then((res) => {
          expect(res.status).to.eq(200);
        });
      });
    });

    it('FV-9: DELETE on an in-filter row (alpha) succeeds', () => {
      createXxxxxXxxxx('alpha').then((alphaId) => {
        cy.request({
          method: 'DELETE',
          url: `${FILTERED_API}/${alphaId}`,
          headers: { 'X-API-Key': TEST_API_KEY },
        }).then((res) => {
          expect(res.status).to.eq(204);
        });
        cy.request({
          url: `${BASE_API}/${alphaId}`,
          headers: { 'X-API-Key': TEST_API_KEY },
          failOnStatusCode: false,
        }).then((res) => {
          expect(res.status).to.eq(404);
        });
      });
    });

    it('FV-10: bulk PUT — a filtered-out row fails per-item, an in-filter row succeeds', () => {
      createXxxxxXxxxx('alpha', 'Bulk Alpha').then((alphaId) => {
        createXxxxxXxxxx('beta', 'Bulk Beta').then((betaId) => {
          cy.request({
            method: 'PUT',
            url: `${FILTERED_API}/bulk`,
            headers: { 'X-API-Key': TEST_API_KEY },
            body: [
              { id: alphaId, name: 'Bulk Alpha Updated', description: null, team: 'alpha' },
              { id: betaId, name: 'Bulk Beta Updated', description: null, team: 'alpha' },
            ],
          }).then((res) => {
            expect(res.status).to.eq(207);
            expect(res.body.summary.succeeded).to.eq(1);
            expect(res.body.summary.failed).to.eq(1);
            expect(res.body.results[0].success).to.be.true;
            expect(res.body.results[1].success).to.be.false;
          });
          cy.request({ url: `${BASE_API}/${betaId}`, headers: { 'X-API-Key': TEST_API_KEY } }).then((res) => {
            expect(res.body.name).to.eq('Bulk Beta');
          });
        });
      });
    });

    it('FV-11: bulk DELETE — a filtered-out row fails per-item, an in-filter row succeeds', () => {
      createXxxxxXxxxx('alpha').then((alphaId) => {
        createXxxxxXxxxx('beta').then((betaId) => {
          cy.request({
            method: 'DELETE',
            url: `${FILTERED_API}/bulk`,
            headers: { 'X-API-Key': TEST_API_KEY },
            body: [{ id: alphaId }, { id: betaId }],
          }).then((res) => {
            expect(res.status).to.eq(207);
            expect(res.body.summary.succeeded).to.eq(1);
            expect(res.body.summary.failed).to.eq(1);
          });
          cy.request({
            url: `${BASE_API}/${alphaId}`,
            headers: { 'X-API-Key': TEST_API_KEY },
            failOnStatusCode: false,
          }).then((res) => expect(res.status).to.eq(404));
          cy.request({ url: `${BASE_API}/${betaId}`, headers: { 'X-API-Key': TEST_API_KEY } }).then((res) =>
            expect(res.status).to.eq(200)
          );
        });
      });
    });
  });

  describe('Org isolation / role scoping regression (unaffected by x-filter-values)', () => {
    it('FV-12: xxxxx_xxxxx (the unfiltered base view) is unaffected — both rows visible', () => {
      createXxxxxXxxxx('alpha').then((alphaId) => {
        createXxxxxXxxxx('beta').then((betaId) => {
          cy.request({ url: BASE_API, headers: { 'X-API-Key': TEST_API_KEY } }).then((res) => {
            const ids = res.body.rows.map((r: { id: string }) => r.id);
            expect(ids).to.include(alphaId);
            expect(ids).to.include(betaId);
          });
        });
      });
    });
  });
});
