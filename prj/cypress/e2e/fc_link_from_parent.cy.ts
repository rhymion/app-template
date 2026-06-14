// Manual supplemental spec (not generated) — verifies cmd_177 P1-P3:
// fc_link CRUD (create/edit/delete) from its parent (work) via the parent-embedded BridgeGrid.
// P1: add button lives on parent EDIT page (detail page is read-only list).
// Lives in prj/ so prj:sync preserves it across regen/cleanup.
import { TEST_CREDENTIALS } from '../support/test-credentials';

/** Navigate to the work EDIT page for 'Test Title 1' and wait for both BridgeGrid fetches. */
function goToWorkEdit() {
  cy.intercept('POST', /\/work\/edit\//).as('bridgeFetch');
  cy.visit('/en/work');
  cy.get('.MuiDataGrid-virtualScroller').scrollTo('bottom', { ensureScrollable: false });
  cy.contains('.MuiDataGrid-row', 'Test Title 1').find('[aria-label="Edit"]').click();
  cy.url().should('include', '/work/edit');
  cy.wait('@bridgeFetch', { timeout: 20000 });
  cy.wait('@bridgeFetch', { timeout: 20000 });
}

/** Navigate to the work VIEW page for 'Test Title 1' and wait for both BridgeGrid fetches. */
function goToWorkView() {
  cy.intercept('POST', /\/work\/view\//).as('bridgeFetch');
  cy.visit('/en/work');
  cy.get('.MuiDataGrid-virtualScroller').scrollTo('bottom', { ensureScrollable: false });
  cy.contains('Test Title 1').click();
  cy.url().should('include', '/work/view');
  cy.wait('@bridgeFetch', { timeout: 20000 });
  cy.wait('@bridgeFetch', { timeout: 20000 });
}

/** Create an fc_link from the embedded grid (must be on parent edit page) and wait for redirect. */
function createFcLinkFromParent(name: string) {
  // P2: button has target="_blank" — strip it so Cypress navigates in the same tab.
  cy.contains('a', '+ Fc Link').invoke('removeAttr', 'target').click();
  cy.url().should('include', '/fc_link/new');
  cy.url().should('include', 'parentType=work');
  cy.fillField('Name', name);
  cy.fillField('Image URL', 'https://example.com/test.jpg');
  cy.clickButton('Save');
  cy.url().should('not.include', '/fc_link/new');
}

describe('Fc Link: CRUD from parent (work) via embedded BridgeGrid', () => {
  beforeEach(() => {
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

  it('creates an fc_link bound to a work via the embedded grid', () => {
    cy.task('db:populateWork', 1);

    // P1: add button is on edit page, not view page.
    goToWorkEdit();

    cy.contains('a', '+ Fc Link')
      .should('have.attr', 'href')
      .and('match', /\/fc_link\/new\?parentType=work&parentId=/);

    createFcLinkFromParent('FcLink From Work');

    goToWorkView();
    cy.contains('h2', 'Fc Link').scrollIntoView();
    cy.contains('FcLink From Work').should('exist');
  });

  it('edits an fc_link from the embedded grid without changing parent context', () => {
    cy.task('db:populateWork', 1);

    goToWorkEdit();
    createFcLinkFromParent('FcLink To Edit');

    goToWorkView();
    cy.contains('h2', 'Fc Link').scrollIntoView();
    cy.contains('FcLink To Edit').should('exist');

    // Edit from the view page (view page shows edit icons in same tab).
    cy.contains('.MuiDataGrid-row', 'FcLink To Edit').find('[aria-label="Edit"]').click();
    cy.url().should('include', '/fc_link/edit');

    cy.clearAndFillField('Name', 'FcLink Edited');
    cy.clickButton('Save');
    cy.url().should('not.include', '/fc_link/edit');

    goToWorkView();
    cy.contains('h2', 'Fc Link').scrollIntoView();
    cy.contains('FcLink Edited').should('exist');
    cy.contains('FcLink To Edit').should('not.exist');
  });

  it('deletes an fc_link from the embedded grid', () => {
    cy.task('db:populateWork', 1);

    goToWorkEdit();
    createFcLinkFromParent('FcLink To Delete');

    goToWorkView();
    cy.contains('h2', 'Fc Link').scrollIntoView();
    cy.contains('FcLink To Delete').should('exist');

    // Fc Link grid is the second DataGrid on work view — use last() for its toolbar.
    cy.contains('.MuiDataGrid-row', 'FcLink To Delete').find('input[type="checkbox"]').check();
    cy.get('button[aria-label="Delete Selected"]').last().click();
    cy.get('div[role="dialog"]').find('button[aria-label="Delete"]').click();

    // removeFcLink Server Action calls redirect('/fc_link') — wait for navigation.
    cy.url().should('not.include', '/work/view');

    goToWorkView();
    cy.contains('h2', 'Fc Link').scrollIntoView();
    cy.contains('FcLink To Delete').should('not.exist');
  });
});
