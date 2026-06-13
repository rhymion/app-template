// Manual supplemental spec (not generated) — verifies cmd_167 §4:
// fc_link CRUD (create/edit/delete) from its parent (work) via the parent-embedded BridgeGrid.
// Lives in prj/ so prj:sync preserves it across regen/cleanup.
import { TEST_CREDENTIALS } from '../support/test-credentials';

/** Navigate to the work view for 'Test Title 1' and wait for both BridgeGrid fetches to complete. */
function goToWorkView() {
  // Set up intercept BEFORE navigation so it catches the useEffect Server Action POSTs.
  cy.intercept('POST', /\/work\/view\//).as('bridgeFetch');
  cy.visit('/en/work');
  cy.get('.MuiDataGrid-virtualScroller').scrollTo('bottom', { ensureScrollable: false });
  cy.contains('Test Title 1').click();
  cy.url().should('include', '/work/view');
  // Wait for both BridgeGrid Server Actions (channelPage + fcLinkPage) to complete
  // so row assertions don't need their own timeouts.
  cy.wait('@bridgeFetch', { timeout: 20000 });
  cy.wait('@bridgeFetch', { timeout: 20000 });
}

/** Create an fc_link from the embedded grid and wait for the redirect away from /fc_link/new. */
function createFcLinkFromParent(name: string) {
  cy.contains('a', '+ Fc Link').click();
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

    // Open the work detail (view) page, which embeds the Channel + Fc Link grids.
    goToWorkView();

    // The embedded Fc Link section + an Add link carrying parent context.
    cy.contains('a', '+ Fc Link')
      .should('have.attr', 'href')
      .and('match', /\/fc_link\/new\?parentType=work&parentId=/);

    // Create an fc_link from the parent context.
    createFcLinkFromParent('FcLink From Work');

    // Re-open the work view: the new fc_link appears in the embedded grid.
    goToWorkView();
    cy.contains('h2', 'Fc Link').scrollIntoView();
    cy.contains('FcLink From Work').should('exist');
  });

  it('edits an fc_link from the embedded grid without changing parent context', () => {
    cy.task('db:populateWork', 1);

    // Create an fc_link via the embedded grid.
    goToWorkView();
    createFcLinkFromParent('FcLink To Edit');

    // Navigate back to the work view; wait for the fc_link row to appear.
    goToWorkView();
    cy.contains('h2', 'Fc Link').scrollIntoView();
    cy.contains('FcLink To Edit').should('exist');

    // Open the edit form from the row action menu.
    cy.contains('.MuiDataGrid-row', 'FcLink To Edit').find('[aria-label="Edit"]').click();
    cy.url().should('include', '/fc_link/edit');

    // Edit the name (AP-3=B: parent context fields excluded from the edit form).
    cy.clearAndFillField('Name', 'FcLink Edited');
    cy.clickButton('Save');
    cy.url().should('not.include', '/fc_link/edit');

    // Navigate back to the work view: the updated name appears in the embedded grid.
    goToWorkView();
    cy.contains('h2', 'Fc Link').scrollIntoView();
    cy.contains('FcLink Edited').should('exist');
    cy.contains('FcLink To Edit').should('not.exist');
  });

  it('deletes an fc_link from the embedded grid', () => {
    cy.task('db:populateWork', 1);

    // Create an fc_link via the embedded grid.
    goToWorkView();
    createFcLinkFromParent('FcLink To Delete');

    // Navigate back to the work view; wait for the fc_link row to appear.
    goToWorkView();
    cy.contains('h2', 'Fc Link').scrollIntoView();
    cy.contains('FcLink To Delete').should('exist');

    // Select the fc_link row (FcLink grid is the second DataGrid — use last() for its toolbar).
    cy.contains('.MuiDataGrid-row', 'FcLink To Delete').find('input[type="checkbox"]').check();
    cy.get('button[aria-label="Delete Selected"]').last().click();
    cy.get('div[role="dialog"]').find('button[aria-label="Delete"]').click();

    // removeFcLink Server Action calls redirect('/fc_link') — wait for navigation.
    cy.url().should('not.include', '/work/view');

    // Navigate back to the work view: the deleted fc_link is no longer in the grid.
    goToWorkView();
    cy.contains('h2', 'Fc Link').scrollIntoView();
    cy.contains('FcLink To Delete').should('not.exist');
  });
});
