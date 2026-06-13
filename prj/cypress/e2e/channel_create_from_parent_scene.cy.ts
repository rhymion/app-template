// Manual supplemental spec — verifies cmd_167 §4 / cmd_172:
// channel CRUD (create/edit/delete) from its parent (scene) via the parent-embedded BridgeGrid.
// Lives in prj/ so prj:sync preserves it across regen/cleanup.
import { TEST_CREDENTIALS } from '../support/test-credentials';

/** Navigate to the scene view for 'Test Label 1' and wait for BridgeGrid fetch. */
function goToSceneView() {
  cy.intercept('POST', /\/scene\/view\//).as('bridgeFetch');
  cy.visit('/en/scene');
  cy.get('.MuiDataGrid-virtualScroller').scrollTo('bottom', { ensureScrollable: false });
  cy.contains('Test Label 1').click();
  cy.url().should('include', '/scene/view');
  // Wait for the ChannelBridgeGrid Server Action to complete.
  cy.wait('@bridgeFetch', { timeout: 20000 });
}

/** Create a channel from the embedded grid and wait for the redirect away from /channel/new. */
function createChannelFromParent(name: string) {
  cy.contains('a', '+ Channel').click();
  cy.url().should('include', '/channel/new');
  cy.url().should('include', 'parentType=scene');
  cy.fillField('Name', name);
  cy.selectAutocomplete('Kind', 'general');
  cy.selectAutocomplete('Visibility', 'public');
  cy.clickButton('Save');
  cy.url().should('not.include', '/channel/new');
}

describe('Channel: CRUD from parent (scene) via embedded BridgeGrid', () => {
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

  it('creates a channel bound to a scene via the embedded grid', () => {
    cy.task('db:populateScene', 1);

    goToSceneView();

    cy.contains('a', '+ Channel')
      .should('have.attr', 'href')
      .and('match', /\/channel\/new\?parentType=scene&parentId=/);

    createChannelFromParent('Channel From Scene');

    goToSceneView();
    cy.contains('h2', 'Channel').scrollIntoView();
    cy.contains('Channel From Scene').should('exist');
  });

  it('edits a channel from the embedded grid without changing parent context', () => {
    cy.task('db:populateScene', 1);

    goToSceneView();
    createChannelFromParent('Channel To Edit');

    goToSceneView();
    cy.contains('h2', 'Channel').scrollIntoView();
    cy.contains('Channel To Edit').should('exist');

    cy.contains('.MuiDataGrid-row', 'Channel To Edit').find('[aria-label="Edit"]').click();
    cy.url().should('include', '/channel/edit');

    cy.clearAndFillField('Name', 'Channel Edited');
    cy.clickButton('Save');
    cy.url().should('not.include', '/channel/edit');

    goToSceneView();
    cy.contains('h2', 'Channel').scrollIntoView();
    cy.contains('Channel Edited').should('exist');
    cy.contains('Channel To Edit').should('not.exist');
  });

  it('deletes a channel from the embedded grid', () => {
    cy.task('db:populateScene', 1);

    goToSceneView();
    createChannelFromParent('Channel To Delete');

    goToSceneView();
    cy.contains('h2', 'Channel').scrollIntoView();
    cy.contains('Channel To Delete').should('exist');

    cy.contains('.MuiDataGrid-row', 'Channel To Delete').find('input[type="checkbox"]').check();
    cy.get('button[aria-label="Delete Selected"]').first().click();
    cy.get('div[role="dialog"]').find('button[aria-label="Delete"]').click();

    // removeChannel Server Action calls redirect('/channel') — wait for navigation.
    cy.url().should('not.include', '/scene/view');

    goToSceneView();
    cy.contains('h2', 'Channel').scrollIntoView();
    cy.contains('Channel To Delete').should('not.exist');
  });
});
