// Manual supplemental spec — verifies cmd_167 §4 / cmd_172:
// fc_link CRUD (create/edit/delete) from its parent (music) via the parent-embedded BridgeGrid.
// Lives in prj/ so prj:sync preserves it across regen/cleanup.
import { TEST_CREDENTIALS } from '../support/test-credentials';

/** Navigate to the music view for 'Test Title 1' and wait for BridgeGrid fetch. */
function goToMusicView() {
  cy.intercept('POST', /\/music\/view\//).as('bridgeFetch');
  cy.visit('/en/music');
  cy.get('.MuiDataGrid-virtualScroller').scrollTo('bottom', { ensureScrollable: false });
  cy.contains('Test Title 1').click();
  cy.url().should('include', '/music/view');
  // Wait for the FcLinkBridgeGrid Server Action to complete.
  cy.wait('@bridgeFetch', { timeout: 20000 });
}

/** Create an fc_link from the embedded grid and wait for the redirect away from /fc_link/new. */
function createFcLinkFromParent(name: string) {
  cy.contains('a', '+ Fc Link').click();
  cy.url().should('include', '/fc_link/new');
  cy.url().should('include', 'parentType=music');
  cy.fillField('Name', name);
  cy.fillField('Image URL', 'https://example.com/test.jpg');
  cy.clickButton('Save');
  cy.url().should('not.include', '/fc_link/new');
}

describe('Fc Link: CRUD from parent (music) via embedded BridgeGrid', () => {
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

  it('creates an fc_link bound to a music via the embedded grid', () => {
    cy.task('db:populateMusic', 1);

    goToMusicView();

    cy.contains('a', '+ Fc Link')
      .should('have.attr', 'href')
      .and('match', /\/fc_link\/new\?parentType=music&parentId=/);

    createFcLinkFromParent('FcLink From Music');

    goToMusicView();
    cy.contains('h2', 'Fc Link').scrollIntoView();
    cy.contains('FcLink From Music').should('exist');
  });

  it('edits an fc_link from the embedded grid without changing parent context', () => {
    cy.task('db:populateMusic', 1);

    goToMusicView();
    createFcLinkFromParent('FcLink To Edit');

    goToMusicView();
    cy.contains('h2', 'Fc Link').scrollIntoView();
    cy.contains('FcLink To Edit').should('exist');

    cy.contains('.MuiDataGrid-row', 'FcLink To Edit').find('[aria-label="Edit"]').click();
    cy.url().should('include', '/fc_link/edit');

    cy.clearAndFillField('Name', 'FcLink Edited');
    cy.clickButton('Save');
    cy.url().should('not.include', '/fc_link/edit');

    goToMusicView();
    cy.contains('h2', 'Fc Link').scrollIntoView();
    cy.contains('FcLink Edited').should('exist');
    cy.contains('FcLink To Edit').should('not.exist');
  });

  it('deletes an fc_link from the embedded grid', () => {
    cy.task('db:populateMusic', 1);

    goToMusicView();
    createFcLinkFromParent('FcLink To Delete');

    goToMusicView();
    cy.contains('h2', 'Fc Link').scrollIntoView();
    cy.contains('FcLink To Delete').should('exist');

    cy.contains('.MuiDataGrid-row', 'FcLink To Delete').find('input[type="checkbox"]').check();
    cy.get('button[aria-label="Delete Selected"]').first().click();
    cy.get('div[role="dialog"]').find('button[aria-label="Delete"]').click();

    // removeFcLink Server Action calls redirect('/fc_link') — wait for navigation.
    cy.url().should('not.include', '/music/view');

    goToMusicView();
    cy.contains('h2', 'Fc Link').scrollIntoView();
    cy.contains('FcLink To Delete').should('not.exist');
  });
});
