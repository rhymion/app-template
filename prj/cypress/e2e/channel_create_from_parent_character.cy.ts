// Manual supplemental spec — verifies cmd_177 P1-P3:
// channel CRUD (create/edit/delete) from its parent (character) via the parent-embedded BridgeGrid.
// P1: add button lives on parent EDIT page (detail page is read-only list).
// Lives in prj/ so prj:sync preserves it across regen/cleanup.
import { TEST_CREDENTIALS } from '../support/test-credentials';

/** Navigate to the character EDIT page for 'Character 1' and wait for both BridgeGrid fetches. */
function goToCharacterEdit() {
  cy.intercept('POST', /\/character\/edit\//).as('bridgeFetch');
  cy.visit('/en/character');
  cy.get('.MuiDataGrid-virtualScroller').scrollTo('bottom', { ensureScrollable: false });
  cy.contains('.MuiDataGrid-row', 'Character 1').find('[aria-label="Edit"]').click();
  cy.url().should('include', '/character/edit');
  cy.wait('@bridgeFetch', { timeout: 20000 });
  cy.wait('@bridgeFetch', { timeout: 20000 });
}

/** Navigate to the character VIEW page for 'Character 1' and wait for both BridgeGrid fetches. */
function goToCharacterView() {
  cy.intercept('POST', /\/character\/view\//).as('bridgeFetch');
  cy.visit('/en/character');
  cy.get('.MuiDataGrid-virtualScroller').scrollTo('bottom', { ensureScrollable: false });
  cy.contains('Character 1').click();
  cy.url().should('include', '/character/view');
  cy.wait('@bridgeFetch', { timeout: 20000 });
  cy.wait('@bridgeFetch', { timeout: 20000 });
}

/** Create a channel from the embedded grid (must be on parent edit page) and wait for redirect. */
function createChannelFromParent(name: string) {
  // P2: button has target="_blank" — strip it so Cypress navigates in the same tab.
  cy.contains('a', '+ Channel').invoke('removeAttr', 'target').click();
  cy.url().should('include', '/channel/new');
  cy.url().should('include', 'parentType=character');
  cy.fillField('Name', name);
  cy.selectAutocomplete('Kind', 'general');
  cy.selectAutocomplete('Visibility', 'public');
  cy.clickButton('Save');
  cy.url().should('not.include', '/channel/new');
}

describe('Channel: CRUD from parent (character) via embedded BridgeGrid', () => {
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

  it('creates a channel bound to a character via the embedded grid', () => {
    cy.task('db:populateCharacter', 1);

    // P1: add button is on edit page, not view page.
    goToCharacterEdit();

    cy.contains('a', '+ Channel')
      .should('have.attr', 'href')
      .and('match', /\/channel\/new\?parentType=character&parentId=/);

    createChannelFromParent('Channel From Character');

    goToCharacterView();
    cy.contains('h2', 'Channel').scrollIntoView();
    cy.contains('Channel From Character').should('exist');
  });

  it('edits a channel from the embedded grid without changing parent context', () => {
    cy.task('db:populateCharacter', 1);

    goToCharacterEdit();
    createChannelFromParent('Channel To Edit');

    goToCharacterView();
    cy.contains('h2', 'Channel').scrollIntoView();
    cy.contains('Channel To Edit').should('exist');

    cy.contains('.MuiDataGrid-row', 'Channel To Edit').find('[aria-label="Edit"]').click();
    cy.url().should('include', '/channel/edit');

    cy.clearAndFillField('Name', 'Channel Edited');
    cy.clickButton('Save');
    cy.url().should('not.include', '/channel/edit');

    goToCharacterView();
    cy.contains('h2', 'Channel').scrollIntoView();
    cy.contains('Channel Edited').should('exist');
    cy.contains('Channel To Edit').should('not.exist');
  });

  it('deletes a channel from the embedded grid', () => {
    cy.task('db:populateCharacter', 1);

    goToCharacterEdit();
    createChannelFromParent('Channel To Delete');

    goToCharacterView();
    cy.contains('h2', 'Channel').scrollIntoView();
    cy.contains('Channel To Delete').should('exist');

    cy.contains('.MuiDataGrid-row', 'Channel To Delete').find('input[type="checkbox"]').check();
    cy.get('button[aria-label="Delete Selected"]').first().click();
    cy.get('div[role="dialog"]').find('button[aria-label="Delete"]').click();

    // removeChannel Server Action calls redirect('/channel') — wait for navigation.
    cy.url().should('not.include', '/character/view');

    goToCharacterView();
    cy.contains('h2', 'Channel').scrollIntoView();
    cy.contains('Channel To Delete').should('not.exist');
  });
});
