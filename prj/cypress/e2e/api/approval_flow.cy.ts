// Hand-written (frozen from the last generator output) — cmd_636.
//
// approval_flow moved to x-generate.test: false (see
// prj/code_generator/json_schema.yaml and the header of
// cypress/support/approval_flow/helper.ts for why); that flag also stops
// this spec from being regenerated. This is the mandatory-gate
// (test:e2e:cy:api) API spec, so it is frozen here as hand-written rather
// than dropped, to avoid regressing that gate's approval_flow coverage.
// Content is unchanged from the last generated version — see report for the
// generated-vs-frozen diff (none).
import { TEST_API_KEY, TEST_CREDENTIALS } from '../../support/test-credentials';

const API_BASE = '/api/approval_flow';

// FK Permission / Cross-org Test Coverage (cmd_520 batch A): 7.3(PUT denied)=yes, 7.4(DELETE denied)=yes, 7.5(export denied)=yes, 7.6(import denied)=yes, G3(cross-org isolation)=no(should_filter_by_org=false)

describe('API: Approval Flow', () => {
  beforeEach(() => {
    cy.task('db:resetApprovalFlowCallSeq');
    cy.task('db:reset');
    cy.task('db:seed');
    cy.task('db:grantAllPermissions');
    Cypress.session.clearAllSavedSessions();
  });

  describe('GET /api/approval_flow', () => {
    it('1.1 returns empty page when no items', () => {
      cy.request({ url: API_BASE, headers: { 'X-API-Key': TEST_API_KEY } })
        .then((res) => {
          expect(res.status).to.eq(200);
          expect(res.body.rows).to.deep.eq([]);
          expect(res.body.total).to.eq(0);
          expect(res.body.page).to.eq(0);
          expect(res.body.pageSize).to.be.a('number');
        });
    });

    it('1.2 returns page with items', () => {
      cy.task('db:populateApprovalFlow', 1);
      cy.request({ url: API_BASE, headers: { 'X-API-Key': TEST_API_KEY } })
        .then((res) => {
          expect(res.status).to.eq(200);
          expect(res.body.rows).to.have.length(1);
          expect(res.body.total).to.eq(1);
        });
    });
  });

  describe('GET /api/approval_flow/:id', () => {
    it('2.1 returns item detail by id', () => {
      cy.task<any[]>('db:populateApprovalFlow', 1).then((records) => {
        cy.request({ url: `${API_BASE}/${records[0].id}`, headers: { 'X-API-Key': TEST_API_KEY } })
          .then((res) => {
            expect(res.status).to.eq(200);
            expect(res.body.id).to.eq(records[0].id);
          });
      });
    });

    it('2.2 returns 404 for non-existent id', () => {
      cy.request({ url: `${API_BASE}/non-existent-id`, headers: { 'X-API-Key': TEST_API_KEY }, failOnStatusCode: false })
        .then((res) => {
          expect(res.status).to.eq(404);
        });
    });
  });

  describe('POST /api/approval_flow', () => {
    it('3.1 creates with required fields, verified by GET', () => {
      cy.task<any>('db:populateApprovalFlowDependencies').then((deps) => {
        cy.request({
          method: 'POST',
          url: API_BASE,
          headers: { 'X-API-Key': TEST_API_KEY },
          body: {
            entity_name: 'user',
            approver_role_id: deps.role.id,
            preceded_by: [],
            followed_by: [],
          },
        }).then((res) => {
          expect(res.status).to.eq(201);
          cy.request({ url: `${API_BASE}/${res.body.id}`, headers: { 'X-API-Key': TEST_API_KEY } })
            .then((getRes) => {
              expect(getRes.status).to.eq(200);
              expect(getRes.body.entity_name).to.eq('user');
            });
        });
      });
    });

    it('5.1 fails when a required field is missing', () => {
      cy.task<any>('db:populateApprovalFlowDependencies').then((deps) => {
        cy.request({
          method: 'POST',
          url: API_BASE,
          headers: { 'X-API-Key': TEST_API_KEY },
          body: {
            approver_role_id: deps.role.id,
            preceded_by: [],
            followed_by: [],
          },
          failOnStatusCode: false,
        }).then((res) => {
          expect(res.status).to.be.gte(400);
        });
      });
    });
  });

  describe('PUT /api/approval_flow/:id', () => {
    it('4.1 updates, verified by GET', () => {
      cy.task<any[]>('db:populateApprovalFlow', 1).then((records) => {
        cy.request({
          method: 'PUT',
          url: `${API_BASE}/${records[0].id}`,
          headers: { 'X-API-Key': TEST_API_KEY },
          body: {
            entity_name: 'setting',
            requestor_role_id: records[0].requestor_role_id,
            approver_role_id: records[0].approver_role_id,
            preceded_by: [],
            followed_by: [],
          },
        }).then((res) => {
          expect(res.status).to.eq(200);
          cy.request({ url: `${API_BASE}/${records[0].id}`, headers: { 'X-API-Key': TEST_API_KEY } })
            .then((getRes) => {
              expect(getRes.status).to.eq(200);
              expect(getRes.body.entity_name).to.eq('setting');
            });
        });
      });
    });
  });

  describe('DELETE /api/approval_flow/:id', () => {
    it('4.2 deletes item, verified by GET returning 4xx', () => {
      cy.task<any[]>('db:populateApprovalFlow', 1).then((records) => {
        cy.request({
          method: 'DELETE',
          url: `${API_BASE}/${records[0].id}`,
          headers: { 'X-API-Key': TEST_API_KEY },
        }).then((res) => {
          expect(res.status).to.eq(204);
          cy.request({ url: `${API_BASE}/${records[0].id}`, headers: { 'X-API-Key': TEST_API_KEY }, failOnStatusCode: false })
            .then((getRes) => {
              expect(getRes.status).to.be.gte(400);
            });
        });
      });
    });
  });

  // -------------------------------------------------------------------------
  // Bulk operations
  // -------------------------------------------------------------------------

  describe('POST /api/approval_flow/bulk', () => {
    it('8.1 bulk creates — all succeed, summary reflects counts', () => {
      cy.task<any>('db:populateApprovalFlowDependencies').then((deps) => {
        cy.request({
          method: 'POST',
          url: `${API_BASE}/bulk`,
          headers: { 'X-API-Key': TEST_API_KEY },
          body: [
            {
              entity_name: 'user',
              approver_role_id: deps.role.id,
              preceded_by: [],
              followed_by: [],
            },
          ],
        }).then((res) => {
          expect(res.status).to.eq(207);
          expect(res.body.summary.total).to.eq(1);
          expect(res.body.summary.succeeded).to.eq(1);
          expect(res.body.summary.failed).to.eq(0);
          expect(res.body.results[0].success).to.be.true;
          expect(res.body.results[0].data.id).to.exist;
        });
      });
    });

    it('8.2 bulk creates — partial failure when a required field is missing', () => {
      cy.task<any>('db:populateApprovalFlowDependencies').then((deps) => {
        cy.request({
          method: 'POST',
          url: `${API_BASE}/bulk`,
          headers: { 'X-API-Key': TEST_API_KEY },
          body: [
            {
              entity_name: 'user',
              approver_role_id: deps.role.id,
              preceded_by: [],
              followed_by: [],
            },
            {
              approver_role_id: deps.role.id,
              preceded_by: [],
              followed_by: [],
            },
          ],
        }).then((res) => {
          expect(res.status).to.eq(207);
          expect(res.body.summary.total).to.eq(2);
          expect(res.body.summary.succeeded).to.eq(1);
          expect(res.body.summary.failed).to.eq(1);
          expect(res.body.results[0].success).to.be.true;
          expect(res.body.results[1].success).to.be.false;
          expect(res.body.results[1].error).to.be.a('string');
        });
      });
    });
  });

  describe('PUT /api/approval_flow/bulk', () => {
    it('9.1 bulk updates — all succeed, summary reflects counts', () => {
      cy.task<any[]>('db:populateApprovalFlow', 1).then((records) => {
        cy.request({
          method: 'PUT',
          url: `${API_BASE}/bulk`,
          headers: { 'X-API-Key': TEST_API_KEY },
          body: [
            {
              id: records[0].id,
              entity_name: 'setting',
              requestor_role_id: records[0].requestor_role_id,
              approver_role_id: records[0].approver_role_id,
              preceded_by: [],
              followed_by: [],
            },
          ],
        }).then((res) => {
          expect(res.status).to.eq(207);
          expect(res.body.summary.total).to.eq(1);
          expect(res.body.summary.succeeded).to.eq(1);
          expect(res.body.summary.failed).to.eq(0);
          expect(res.body.results[0].success).to.be.true;
        });
      });
    });

    it('9.2 bulk updates — partial failure for non-existent id', () => {
      cy.task<any[]>('db:populateApprovalFlow', 1).then((records) => {
        cy.request({
          method: 'PUT',
          url: `${API_BASE}/bulk`,
          headers: { 'X-API-Key': TEST_API_KEY },
          body: [
            {
              id: records[0].id,
              entity_name: 'setting',
              requestor_role_id: records[0].requestor_role_id,
              approver_role_id: records[0].approver_role_id,
              preceded_by: [],
              followed_by: [],
            },
            { id: 'non-existent-id' },
          ],
        }).then((res) => {
          expect(res.status).to.eq(207);
          expect(res.body.summary.total).to.eq(2);
          expect(res.body.summary.succeeded).to.eq(1);
          expect(res.body.summary.failed).to.eq(1);
          expect(res.body.results[1].success).to.be.false;
        });
      });
    });
  });

  describe('DELETE /api/approval_flow/bulk', () => {
    it('10.1 bulk deletes — all succeed, items are gone', () => {
      cy.task<any[]>('db:populateApprovalFlow', 1).then((records) => {
        cy.request({
          method: 'DELETE',
          url: `${API_BASE}/bulk`,
          headers: { 'X-API-Key': TEST_API_KEY },
          body: [{ id: records[0].id }],
        }).then((res) => {
          expect(res.status).to.eq(207);
          expect(res.body.summary.succeeded).to.eq(1);
          expect(res.body.summary.failed).to.eq(0);
          cy.request({
            url: `${API_BASE}/${records[0].id}`,
            headers: { 'X-API-Key': TEST_API_KEY },
            failOnStatusCode: false,
          }).then((getRes) => {
            expect(getRes.status).to.be.gte(400);
          });
        });
      });
    });

    it('10.2 bulk deletes — partial failure for non-existent id', () => {
      cy.task<any[]>('db:populateApprovalFlow', 1).then((records) => {
        cy.request({
          method: 'DELETE',
          url: `${API_BASE}/bulk`,
          headers: { 'X-API-Key': TEST_API_KEY },
          body: [{ id: records[0].id }, { id: 'non-existent-id' }],
        }).then((res) => {
          expect(res.status).to.eq(207);
          expect(res.body.summary.total).to.eq(2);
          expect(res.body.summary.succeeded).to.eq(1);
          expect(res.body.summary.failed).to.eq(1);
          expect(res.body.results[0].success).to.be.true;
          expect(res.body.results[1].success).to.be.false;
        });
      });
    });
  });



  // cmd_516 Option B: searchRoleOptions()/
  // getAvailable...() now degrade gracefully (empty + permissionDenied flag)
  // instead of throwing when the caller lacks read on role —
  // see docs/knowledge/fk-read-permission-graceful-degradation.md. This regression-
  // tests the most dangerous failure mode: a PUT that omits the FK field entirely
  // (exactly what the UI now sends when that field renders disabled) must leave
  // the existing approver_role_id value untouched, never null it out.
  describe('FK read-permission graceful degradation (PUT /api/approval_flow/:id)', () => {
    it('4.4 preserves approver_role_id when the acting user cannot read role and omits it from the PUT body', () => {
      cy.task<any[]>('db:populateApprovalFlow', 1).then((records) => {
        const original = records[0];
        // Full CRUD on approval_flow itself, but no permission row at all on
        // role — defaults to deny (getModelPermissions:
        // "no rows = deny all"), reproducing the exact actor the UI's
        // AppFieldRelation permissionDenied branch is for.
        cy.task<string>('db:createApiUserWithPermission', {
          entityName: 'approval_flow',
          flags: { create: true, read: true, update: true, delete: true },
          label: 'fk_read_denied',
        }).then((restrictedKey) => {
          cy.request({
            method: 'PUT',
            url: `${API_BASE}/${original.id}`,
            headers: { 'X-API-Key': restrictedKey },
            body: {
            entity_name: original.entity_name,
            requestor_role_id: original.requestor_role_id,
            preceded_by: [],
            followed_by: [],
            },
          }).then((res) => {
            expect(res.status).to.eq(200);
            cy.request({ url: `${API_BASE}/${original.id}`, headers: { 'X-API-Key': restrictedKey } })
              .then((getRes) => {
                expect(getRes.status).to.eq(200);
                expect(
                  getRes.body.approver_role?.id,
                  'approver_role_id must not be nulled out by a PUT that omits it',
                ).to.eq(original.approver_role_id);
              });
          });
        });
      });
    });
  });

  describe('Authentication errors', () => {
    it('6.1 returns 4xx without API key', () => {
      cy.request({ url: API_BASE, failOnStatusCode: false })
        .then((res) => {
          expect(res.status).to.be.gte(400);
        });
    });

    it('6.2 returns 4xx with invalid API key', () => {
      cy.request({ url: API_BASE, headers: { 'X-API-Key': 'invalid_key' }, failOnStatusCode: false })
        .then((res) => {
          expect(res.status).to.be.gte(400);
        });
    });
  });

  describe('Permission errors', () => {
    it('7.1 returns 4xx for GET list when permission denied', () => {
      cy.task<string>('db:createLimitedApiUser', 'approval_flow').then((limitedKey) => {
        cy.request({ url: API_BASE, headers: { 'X-API-Key': limitedKey }, failOnStatusCode: false })
          .then((res) => {
            expect(res.status).to.be.gte(400);
          });
      });
    });

    it('7.2 returns 4xx for POST when permission denied', () => {
      cy.task<any>('db:populateApprovalFlowDependencies').then((deps) => {
        cy.task<string>('db:createLimitedApiUser', 'approval_flow').then((limitedKey) => {
          cy.request({
            method: 'POST',
            url: API_BASE,
            headers: { 'X-API-Key': limitedKey },
            body: {
              entity_name: 'user',
              approver_role_id: deps.role.id,
              preceded_by: [],
              followed_by: [],
            },
            failOnStatusCode: false,
          }).then((res) => {
            expect(res.status).to.be.gte(400);
          });
        });
      });
    });

    it('7.3 returns 4xx for PUT when permission denied', () => {
      cy.task<any>('db:populateApprovalFlow', 1).then((records) => {
        cy.task<string>('db:createLimitedApiUser', 'approval_flow').then((limitedKey) => {
          cy.request({
            method: 'PUT',
            url: `${API_BASE}/${records[0].id}`,
            headers: { 'X-API-Key': limitedKey },
            body: {},
            failOnStatusCode: false,
          }).then((res) => {
            expect(res.status).to.be.gte(400);
          });
        });
      });
    });

    it('7.4 returns 4xx for DELETE when permission denied', () => {
      cy.task<any>('db:populateApprovalFlow', 1).then((records) => {
        cy.task<string>('db:createLimitedApiUser', 'approval_flow').then((limitedKey) => {
          cy.request({
            method: 'DELETE',
            url: `${API_BASE}/${records[0].id}`,
            headers: { 'X-API-Key': limitedKey },
            failOnStatusCode: false,
          }).then((res) => {
            expect(res.status).to.be.gte(400);
          });
        });
      });
    });

    // 7.5 uses a SESSION-loginable actor (db:createSessionUserWithPermission + cy.login),
    // not X-API-Key: the export route resolves the actor exclusively via
    // getSessionUserId() (see lib/authz.ts / api_export_route.ts.jinja2) and never reads
    // X-API-Key, so createLimitedApiUser's key would be silently ignored here.
    it('7.5 returns 4xx for GET export when permission denied', () => {
      cy.task<string>('db:createSessionUserWithPermission', {
        entityName: 'approval_flow',
        flags: {},
        label: 'export_denied',
      }).then((email) => {
        cy.login(email, TEST_CREDENTIALS.password);
        cy.request({
          url: `${API_BASE}/export`,
          failOnStatusCode: false,
        }).then((res) => {
          expect(res.status).to.be.gte(400);
        });
      });
    });

    // 7.6 uses a SESSION-loginable actor — see the 7.5 comment above; the import
    // route (api_import_route.ts.jinja2) resolves the actor the same way.
    it('7.6 returns 4xx for POST import when permission denied', () => {
      cy.task<string>('db:createSessionUserWithPermission', {
        entityName: 'approval_flow',
        flags: {},
        label: 'import_denied',
      }).then((email) => {
        cy.login(email, TEST_CREDENTIALS.password);
        cy.request({
          method: 'POST',
          url: `${API_BASE}/import`,
          body: { csv: '', dryRun: true },
          failOnStatusCode: false,
        }).then((res) => {
          expect(res.status).to.be.gte(400);
        });
      });
    });
  });

  describe('GET /api/approval_flow/export', () => {
    beforeEach(() => {
      Cypress.session.clearAllSavedSessions();
      cy.login(TEST_CREDENTIALS.email, TEST_CREDENTIALS.password);
    });

    it('N1 returns 200 CSV with attachment disposition', () => {
      cy.request({ url: `/api/approval_flow/export` })
        .then((res) => {
          expect(res.status).to.eq(200);
          expect(res.headers['content-type']).to.include('text/csv');
          expect(res.headers['content-disposition']).to.include('attachment');
        });
    });

    it('N2 CSV header row does not include an id column', () => {
      cy.task('db:populateApprovalFlow', 1);
      cy.request({ url: `/api/approval_flow/export` })
        .then((res) => {
          const headerLine = (res.body as string).replace(/^\uFEFF/, '').split('\r\n')[0];
          const headers = headerLine.split(',');
          expect(headers).to.not.include('id');
        });
    });

    it('N4 CSV header includes the x-import-key natural-key column(s) present in the export allowlist', () => {
      cy.task('db:populateApprovalFlow', 1);
      cy.request({ url: `/api/approval_flow/export` })
        .then((res) => {
          const headerLine = (res.body as string).replace(/^\uFEFF/, '').split('\r\n')[0];
          const headers = headerLine.split(',');
          expect(headers).to.include('entity_name');
        });
    });

    it('N5 CSV header does not include system fields (timestamps/audit/tenant refs)', () => {
      cy.task('db:populateApprovalFlow', 1);
      cy.request({ url: `/api/approval_flow/export` })
        .then((res) => {
          const headerLine = (res.body as string).replace(/^\uFEFF/, '').split('\r\n')[0];
          const headers = headerLine.split(',');
          expect(headers).to.not.include('id');
          expect(headers).to.not.include('created_at');
          expect(headers).to.not.include('updated_at');
          expect(headers).to.not.include('creator_id');
          expect(headers).to.not.include('updater_id');
          expect(headers).to.not.include('organization_id');
        });
    });

    it('N6 CSV export headers match the view-field allowlist exactly', () => {
      cy.task('db:populateApprovalFlow', 1);
      cy.request({ url: `/api/approval_flow/export` })
        .then((res) => {
          const headerLine = (res.body as string).replace(/^\uFEFF/, '').split('\r\n')[0];
          const headers = headerLine.split(',');
          // Positive: expected allowlist columns
          expect(headers).to.include('entity_name');
          expect(headers).to.include('requestor_role_name');
          expect(headers).to.include('approver_role_name');
          // Negative: system columns must not appear
          expect(headers).to.not.include('id');
          expect(headers).to.not.include('creator_id');
          expect(headers).to.not.include('updater_id');
          expect(headers).to.not.include('organization_id');
          expect(headers).to.not.include('tenant_id');
        });
    });

    it('N11 CSV import round-trip: re-importing an exported row matches it via the natural key with zero errors (dry run)', () => {
      cy.task('db:populateApprovalFlow', 1).then(() => {
        cy.request({ url: `/api/approval_flow/export` }).then((exportRes) => {
          expect(exportRes.status).to.eq(200);
          const csv = exportRes.body as string;
          cy.request({
            method: 'POST',
            url: `/api/approval_flow/import`,
            body: { csv, dryRun: true },
          }).then((res) => {
            expect(res.status).to.eq(200);
            expect(res.body.errors).to.have.length(0);
            expect(res.body.summary.failed).to.eq(0);
            expect(res.body.summary.total).to.be.greaterThan(0);
            expect(res.body.summary.succeeded).to.eq(res.body.summary.total);
            expect(res.body.confirmToken).to.be.a('string');
          });
        });
      });
    });

    it('N12 CSV import round-trip: confirming the dry run (dryRun=false) commits with zero write failures', () => {
      cy.task('db:populateApprovalFlow', 1).then(() => {
        cy.request({ url: `/api/approval_flow/export` }).then((exportRes) => {
          const csv = exportRes.body as string;
          cy.request({
            method: 'POST',
            url: `/api/approval_flow/import`,
            body: { csv, dryRun: true },
          }).then((dryRunRes) => {
            const confirmToken = dryRunRes.body.confirmToken as string;
            cy.request({
              method: 'POST',
              url: `/api/approval_flow/import`,
              body: { csv, dryRun: false, confirmToken },
            }).then((commitRes) => {
              expect(commitRes.status).to.eq(200);
              expect(commitRes.body.errors).to.have.length(0);
              expect(commitRes.body.summary.failed).to.eq(0);
              expect(commitRes.body.summary.succeeded).to.be.greaterThan(0);
            });
          });
        });
      });
    });

    it('N13 CSV import rejects an unconfirmed commit (dryRun=false without a valid confirmToken)', () => {
      cy.task('db:populateApprovalFlow', 1).then(() => {
        cy.request({ url: `/api/approval_flow/export` }).then((exportRes) => {
          const csv = exportRes.body as string;
          cy.request({
            method: 'POST',
            url: `/api/approval_flow/import`,
            body: { csv, dryRun: false },
            failOnStatusCode: false,
          }).then((res) => {
            expect(res.status).to.eq(400);
            expect(res.body.errors[0].code).to.eq('INVALID_CONFIRM_TOKEN');
          });
        });
      });
    });
  });

  describe('Search coverage (GET /api/search)', () => {
    beforeEach(() => {
      Cypress.session.clearAllSavedSessions();
      cy.login(TEST_CREDENTIALS.email, TEST_CREDENTIALS.password);
    });

    it('N10 per-entity data surfaces in global search results', () => {
      cy.task<any[]>('db:populateApprovalFlow', 1).then((records) => {
        const q = records[0].entity_name as string;
        cy.request({ url: `/api/search?q=${encodeURIComponent(q)}` })
          .then((res) => {
            expect(res.status).to.eq(200);
            expect(
              res.body.results.some((r: { entity_type: string }) => r.entity_type === 'approval_flow')
            ).to.eq(true);
          });
      });
    });
  });
});
