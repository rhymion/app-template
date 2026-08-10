// Hand-written (not generator-produced) — cmd_636.
//
// approval_flow was moved to x-generate.test: false (see
// prj/code_generator/json_schema.yaml) for the same reason
// cypress/e2e/approval_flow_same_entity_autocomplete_filter.cy.ts (cmd_613)
// was hand-written in the first place: preceded_by/followed_by candidate
// narrowing (lib/approval_flow/autocomplete_filter.ts) is bespoke,
// entity-specific business logic the generator's declarative CRUD spec
// template has no way to represent or verify — see that file's header for
// the full rationale (same reasoning, extended here to the whole entity
// rather than just the candidate-filter behavior).
//
// This spec replaces the last generator-produced
// cypress/e2e/approval_flow.cy.ts (13 cases: 1.1-1.3 list, 2.1-2.2 create,
// 3.1-3.3 edit, 4.1-4.3 delete, 5.1 fail-create, 6.1 fail-edit) item-for-item
// (see report's mapping table), PLUS closes a real coverage gap the
// generated spec had: 2.2 and 3.1 clicked "Add Preceded By" / "Add Followed
// By" but never asserted the relationship actually persisted and rendered —
// this spec adds that assertion (cy.contains on the composite label,
// matching the convention already used by
// approval_flow_same_entity_autocomplete_filter.cy.ts's label-consistency
// test) after Save, on both the list-return and the view page.
//
// Division of labor vs. the two existing hand-written specs (no duplication):
//  - approval_flow_same_entity_autocomplete_filter.cy.ts: candidate-picker
//    filtering (does a different-entity_name row appear/not appear in the
//    "Add Preceded By" autocomplete dropdown?) and View/Edit label-rendering
//    consistency. It never completes an Add + Save.
//  - This spec: full CRUD UI flow (list/create/edit/delete/validation),
//    including completing an Add Preceded By/Followed By through Save and
//    confirming the result renders on View/Edit/List afterward. It does not
//    re-test candidate filtering or label-rendering consistency — those stay
//    owned by the other file.
//
// cmd_636 empirical finding (see report for detail): on this project's
// schema (which adds a uniqueness constraint on [entity_name,
// approver_role_id] via cmd_613's migration
// 20260723024027_approval_flow_unique — the app-generator default schema
// has no such constraint), the last generated spec's 2.1 and 2.2 were
// ALREADY FAILING before this change, because
// populateApprovalFlowDependencies()'s precededBy fixture row shared
// (entity_name, approver_role_id) with the row 2.1/2.2 create via the UI
// form, and (found once the api/mobile specs were run alongside this one)
// also with the API spec's own POST bodies. Fixed in
// cypress/support/approval_flow/helper.ts (precededBy now uses a dedicated
// approverRole3, distinct from every other role these specs use at
// entity_name 'user') as part of this change — see that file's header.
import { TEST_CREDENTIALS } from '../support/test-credentials';
import { assertDataGridEmpty, getDataGridTotalRowCount } from '../support/datagrid-helpers';

describe('Testing Approval Flow pages and their behavior', () => {
  beforeEach(() => {
    cy.task('db:resetApprovalFlowCallSeq');
    cy.task('db:reset');
    cy.task('db:seed');
    cy.task('db:grantAllPermissions');
    Cypress.session.clearAllSavedSessions();
    cy.clearCookies();
    cy.clearLocalStorage();
    cy.visit('/en/');
    cy.window().then((win) => { win.sessionStorage.clear(); });
    cy.login(TEST_CREDENTIALS.email, TEST_CREDENTIALS.password);
  });

  describe('Display list', () => {
    it('1.1 shows empty state with no items', () => {
      cy.visit('/en/approval_flow');
      cy.visit('/en/approval_flow');
      assertDataGridEmpty();
    });

    it('1.2 shows list with one item', () => {
      cy.task('db:populateApprovalFlow', 1);
      cy.visit('/en/approval_flow');
      cy.get('.MuiDataGrid-virtualScroller').scrollTo('bottom', { ensureScrollable: false });
      cy.contains('user').scrollIntoView().should('be.visible');
      getDataGridTotalRowCount().should('eq', 1);
    });

    it('1.3 shows list with multiple items', () => {
      cy.task('db:populateApprovalFlow', 3);
      cy.visit('/en/approval_flow');
      cy.get('.MuiDataGrid-virtualScroller').scrollTo('bottom', { ensureScrollable: false });
      cy.contains('user').scrollIntoView().should('be.visible');
      getDataGridTotalRowCount().should('eq', 3);
    });
  });

  describe('Create', () => {
    it('2.1 creates with minimal data (required fields only)', () => {
      cy.task<any>('db:populateApprovalFlowDependencies').then((deps) => {
        cy.visit('/en/approval_flow');
        cy.clickButton('Create New Approval Flow');
        cy.url().should('include', '/approval_flow/new');
        cy.selectAutocomplete('Entity Name', 'User');
        cy.selectAutocomplete('Approver Role', deps.approverRole.name);
        cy.clickButton('Save');
        cy.url().should('include', '/approval_flow');
        cy.url().should('not.include', '/approval_flow/');
        cy.get('.MuiDataGrid-virtualScroller').scrollTo('bottom', { ensureScrollable: false });
        cy.contains('user').scrollIntoView().should('be.visible');
        // Verify on view page. populateApprovalFlowDependencies() also
        // creates a precededBy fixture row with entity_name 'user' (a
        // different approver role) as a side effect, so more than one grid
        // row now contains the text 'user' — disambiguate by the role text,
        // which is unique to the row this test just created.
        cy.get('.MuiDataGrid-virtualScroller').scrollTo('bottom', { ensureScrollable: false });
        cy.contains('.MuiDataGrid-row', 'Test Approver Role A').find('a').first().click();
        cy.url().should('include', '/approval_flow/view');
        cy.checkField('Entity Name', 'User');
        cy.checkField('Approver Role', 'Test Approver Role A');
      });
    });

    it('2.2 creates with full data (all fields and children)', () => {
      cy.task<any>('db:populateApprovalFlowDependencies').then((deps) => {
        cy.visit('/en/approval_flow');
        cy.clickButton('Create New Approval Flow');
        cy.url().should('include', '/approval_flow/new');
        cy.selectAutocomplete('Entity Name', 'User');
        cy.selectAutocomplete('Requestor Role', deps.requestorRole.name);
        cy.selectAutocomplete('Approver Role', deps.approverRole.name);
        // Add list item: Preceded By. deps.precededBy.name and
        // deps.followedBy.name are both the literal string 'user'
        // (entity_name) — searching by that would match BOTH fixture rows
        // (same entity_name, different approver role) in the candidate
        // dropdown, non-deterministically picking one. Search by the
        // role name instead, which is unique per candidate.
        cy.clickButton('Add Preceded By');
        cy.get('div[role="dialog"]').find('input').type(deps.approverRole3.name);
        cy.get('.MuiAutocomplete-popper li').first().click();
        cy.get('div[role="dialog"]').find('button').contains('Add').click();
        // Add list item: Followed By
        cy.clickButton('Add Followed By');
        cy.get('div[role="dialog"]').find('input').type(deps.approverRole2.name);
        cy.get('.MuiAutocomplete-popper li').first().click();
        cy.get('div[role="dialog"]').find('button').contains('Add').click();
        cy.clickButton('Save');
        cy.url().should('include', '/approval_flow');
        cy.url().should('not.include', '/approval_flow/');
        cy.get('.MuiDataGrid-virtualScroller').scrollTo('bottom', { ensureScrollable: false });
        cy.contains('user').scrollIntoView().should('be.visible');
        // Verify on view page
        cy.get('.MuiDataGrid-virtualScroller').scrollTo('bottom', { ensureScrollable: false });
        cy.get('.MuiDataGrid-row').last().find('a').first().click();
        cy.url().should('include', '/approval_flow/view');
        cy.checkField('Entity Name', 'User');
        cy.checkField('Requestor Role', 'Test Requestor Role A');
        cy.checkField('Approver Role', 'Test Approver Role A');
        // cmd_636: the generated spec clicked Add Preceded By/Followed By but
        // never confirmed the m2m relation actually saved — close that gap.
        // Label format matches approval_flow_same_entity_autocomplete_filter
        // .cy.ts's label-consistency test: entity_name + approver_role.name,
        // space-joined.
        cy.contains(`user ${deps.approverRole3.name}`).should('exist'); // Preceded By
        cy.contains(`user ${deps.approverRole2.name}`).should('exist'); // Followed By
      });
    });
  });

  describe('Edit', () => {
    it('3.1 adds optional data and child items', () => {
      cy.task<any>('db:populateApprovalFlowDependencies').then((deps) => {
        cy.task<any[]>('db:populateApprovalFlow', 1).then((records) => {
          // Navigate by record ID rather than clicking a grid row matched by
          // 'user' text — populateApprovalFlowDependencies() also creates
          // precededBy/followedBy fixture rows with entity_name 'user', so a
          // text-contains match is ambiguous among 3 rows (see 3.3's
          // existing comment for the same reasoning applied to a different
          // ambiguity).
          cy.visit(`/en/approval_flow/edit/${records[0].id}`);
          cy.url().should('include', '/approval_flow/edit');
          cy.selectAutocomplete('Requestor Role', deps.requestorRole.name);
          // Search by role name, not deps.precededBy.name/deps.followedBy.name
          // (both the literal string 'user') — see 2.2's comment for why.
          cy.clickButton('Add Preceded By');
          cy.get('div[role="dialog"]').find('input').type(deps.approverRole3.name);
          cy.get('.MuiAutocomplete-popper li').first().click();
          cy.get('div[role="dialog"]').find('button').contains('Add').click();
          cy.clickButton('Add Followed By');
          cy.get('div[role="dialog"]').find('input').type(deps.approverRole2.name);
          cy.get('.MuiAutocomplete-popper li').first().click();
          cy.get('div[role="dialog"]').find('button').contains('Add').click();
          cy.clickButton('Save');
          cy.url().should('include', '/approval_flow');
          cy.url().should('not.include', '/approval_flow/');
          cy.get('.MuiDataGrid-virtualScroller').scrollTo('bottom', { ensureScrollable: false });
          cy.contains('user').scrollIntoView().should('be.visible');
          // Verify on view page
          cy.visit(`/en/approval_flow/view/${records[0].id}`);
          cy.url().should('include', '/approval_flow/view');
          cy.checkField('Entity Name', 'User');
          // cmd_636: verify the Add Preceded By/Followed By performed above
          // actually persisted (see 2.2's comment for rationale/format).
          cy.contains(`user ${deps.approverRole3.name}`).should('exist'); // Preceded By
          cy.contains(`user ${deps.approverRole2.name}`).should('exist'); // Followed By
        });
      });
    });

    it('3.2 removes optional data and child items', () => {
      cy.task<any[]>('db:populateApprovalFlowFull', 1).then((_records) => {
        cy.visit('/en/approval_flow');
        cy.get('.MuiDataGrid-virtualScroller').scrollTo('bottom', { ensureScrollable: false });
        cy.contains('.MuiDataGrid-row', 'user').find('a').first().click();
        cy.get('a[aria-label="Edit"]').click();
        cy.url().should('include', '/approval_flow/edit');
        cy.clickButton('Save');
        cy.url().should('include', '/approval_flow');
        cy.url().should('not.include', '/approval_flow/');
        cy.get('.MuiDataGrid-virtualScroller').scrollTo('bottom', { ensureScrollable: false });
        cy.contains('user').scrollIntoView().should('be.visible');
      });
    });

    it('3.3 edits with mixed changes', () => {
      cy.task<any[]>('db:populateApprovalFlow', 1).then((records) => {
        // Use record ID to navigate directly — list_id_1 may not be unique (e.g. entity_select
        // overlap with seed data from grantAllEntityPermissions), causing the wrong row to be
        // clicked and leading to a unique-constraint conflict on save.
        cy.visit(`/en/approval_flow/edit/${records[0].id}`);
        cy.selectAutocomplete('Entity Name', 'Setting');
        cy.clickButton('Save');
        cy.url().should('include', '/approval_flow');
        cy.url().should('not.include', '/approval_flow/');
        // Verify on view page
        // Non-unique list_id: navigate by record ID to avoid virtual-scroll
        // range issues (the renamed value may be beyond the initial viewport).
        cy.visit(`/en/approval_flow/view/${records[0].id}`);
        cy.url().should('include', '/approval_flow/view');
        cy.checkField('Entity Name', 'Setting');
      });
    });
  });

  describe('Delete', () => {
    it('4.1 deletes a single item from list view', () => {
      cy.task('db:populateApprovalFlow', 2);
      cy.visit('/en/approval_flow');
      cy.selectDataGridRows([0]);
      cy.get('div').find('button[aria-label="Delete Selected"]').first().click();
      cy.get('div[role="dialog"]').find('button').contains('Delete').first().click();
      getDataGridTotalRowCount().should('eq', 1);
    });

    it('4.2 deletes multiple items from list view', () => {
      cy.task('db:populateApprovalFlow', 3);
      cy.visit('/en/approval_flow');
      cy.selectDataGridRows([0, 1]);
      cy.get('div').find('button[aria-label="Delete Selected"]').first().click();
      cy.get('div[role="dialog"]').find('button').contains('Delete').first().click();
      getDataGridTotalRowCount().should('eq', 1);
    });

    it('4.3 deletes an item from edit page', () => {
      cy.task('db:populateApprovalFlow', 1);
      cy.visit('/en/approval_flow');
      cy.get('.MuiDataGrid-virtualScroller').scrollTo('bottom', { ensureScrollable: false });
      cy.contains('.MuiDataGrid-row', 'user').find('a').first().click();
      cy.get('a[aria-label="Edit"]').click();
      cy.url().should('include', '/approval_flow/edit');
      cy.clickButton('Delete Approval Flow');
      cy.get('div[role="dialog"]').find('button').contains('Delete').first().click();
      cy.url().should('not.include', '/edit');
      cy.url().should('include', '/approval_flow');
      cy.url().should('not.include', '/approval_flow/');
    });
  });

  describe('Fail create', () => {
    it('5.1 fails when required parent field is missing', () => {
      cy.task<any>('db:populateApprovalFlowDependencies').then((deps) => {
        cy.visit('/en/approval_flow/new');
        // Wait for form to fully render before interacting (async autocomplete options can
        // cause a re-render that detaches checkbox elements mid-assertion).
        cy.get('button[aria-label="Save"]').should('be.visible');
        cy.selectAutocomplete('Approver Role', deps.role.name);
        cy.clickButton('Save');
        cy.url().should('include', '/approval_flow/new');
      });
    });
  });

  describe('Fail edit', () => {
    it('6.1 fails when required parent field is cleared', () => {
      cy.task('db:populateApprovalFlow', 1);
      cy.visit('/en/approval_flow');
      cy.get('.MuiDataGrid-virtualScroller').scrollTo('bottom', { ensureScrollable: false });
      cy.contains('.MuiDataGrid-row', 'user').find('a').first().click();
      cy.get('a[aria-label="Edit"]').click();
      cy.clearAutocomplete('Entity Name');
      cy.clickButton('Save');
      cy.url().should('include', '/approval_flow/edit');
    });
  });
});
