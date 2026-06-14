// Manual supplemental spec (not generated) — verifies cmd_177 P1-P3:
// channel CRUD (create/edit/delete) from its parent (work) via the parent-embedded BridgeGrid.
// P1: add button lives on parent EDIT page (detail page is read-only list).
// P2: add button opens new tab (target="_blank"); Cypress navigates same tab in test.
// P3: named button "+ Channel" (not generic "+").
// Lives in prj/ so prj:sync preserves it across regen/cleanup.
import { TEST_CREDENTIALS } from '../support/test-credentials';

/** Navigate to the work EDIT page for 'Test Title 1' and wait for bridge grid fetches. */
function goToWorkEdit() {
  cy.intercept('POST', /\/work\/edit\//).as('bridgeFetch');
  cy.visit('/en/work');
  cy.get('.MuiDataGrid-virtualScroller').scrollTo('bottom', { ensureScrollable: false });
  cy.contains('.MuiDataGrid-row', 'Test Title 1').find('[aria-label="Edit"]').click();
  cy.url().should('include', '/work/edit');
  cy.wait('@bridgeFetch', { timeout: 20000 });
  cy.wait('@bridgeFetch', { timeout: 20000 });
}

/** Navigate to the work VIEW page for 'Test Title 1' and wait for bridge grid fetches. */
function goToWorkView() {
  cy.intercept('POST', /\/work\/view\//).as('bridgeFetch');
  cy.visit('/en/work');
  cy.get('.MuiDataGrid-virtualScroller').scrollTo('bottom', { ensureScrollable: false });
  cy.contains('Test Title 1').click();
  cy.url().should('include', '/work/view');
  cy.wait('@bridgeFetch', { timeout: 20000 });
  cy.wait('@bridgeFetch', { timeout: 20000 });
}

/** Create a channel from the embedded grid (must be on parent edit page) and wait for redirect. */
function createChannelFromParent(name: string) {
  // P2: button has target="_blank" — strip it so Cypress navigates in the same tab.
  cy.contains('a', '+ Channel').invoke('removeAttr', 'target').click();
  cy.url().should('include', '/channel/new');
  cy.url().should('include', 'parentType=work');
  cy.fillField('Name', name);
  cy.selectAutocomplete('Kind', 'general');
  cy.selectAutocomplete('Visibility', 'public');
  cy.clickButton('Save');
  cy.url().should('not.include', '/channel/new');
}

describe('Channel: CRUD from parent (work) via embedded BridgeGrid', () => {
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

  it('creates a channel bound to a work via the embedded grid', () => {
    cy.task('db:populateWork', 1);

    // P1: add button is on edit page, not view page.
    goToWorkEdit();

    // P2: button has target="_blank"; href still carries parent context.
    cy.contains('a', '+ Channel')
      .should('have.attr', 'href')
      .and('match', /\/channel\/new\?parentType=work&parentId=/);

    // Create a channel from the parent context.
    createChannelFromParent('Channel From Work');

    // Re-open the work view: the new channel appears in its embedded grid.
    goToWorkView();
    cy.contains('h2', 'Channel').scrollIntoView();
    cy.contains('Channel From Work').should('exist');
  });

  it('edits a channel from the embedded grid without changing parent context', () => {
    cy.task('db:populateWork', 1);

    // Create a channel via the embedded grid on the edit page.
    goToWorkEdit();
    createChannelFromParent('Channel To Edit');

    // Navigate to the work view to see the channel list.
    goToWorkView();
    cy.contains('h2', 'Channel').scrollIntoView();
    cy.contains('Channel To Edit').should('exist');

    // Edit from the view page (view page shows edit icons in same tab).
    cy.contains('.MuiDataGrid-row', 'Channel To Edit').find('[aria-label="Edit"]').click();
    cy.url().should('include', '/channel/edit');

    cy.clearAndFillField('Name', 'Channel Edited');
    cy.clickButton('Save');
    cy.url().should('not.include', '/channel/edit');

    goToWorkView();
    cy.contains('h2', 'Channel').scrollIntoView();
    cy.contains('Channel Edited').should('exist');
    cy.contains('Channel To Edit').should('not.exist');
  });

  it('deletes a channel from the embedded grid', () => {
    cy.task('db:populateWork', 1);

    // Create a channel via the embedded grid on the edit page.
    goToWorkEdit();
    createChannelFromParent('Channel To Delete');

    // Navigate to the work view to see and delete the channel.
    goToWorkView();
    cy.contains('h2', 'Channel').scrollIntoView();
    cy.contains('Channel To Delete').should('exist');

    cy.contains('.MuiDataGrid-row', 'Channel To Delete').find('input[type="checkbox"]').check();
    cy.get('button[aria-label="Delete Selected"]').first().click();
    cy.get('div[role="dialog"]').find('button[aria-label="Delete"]').click();

    // removeChannel Server Action calls redirect('/channel') — wait for navigation.
    cy.url().should('not.include', '/work/view');

    goToWorkView();
    cy.contains('h2', 'Channel').scrollIntoView();
    cy.contains('Channel To Delete').should('not.exist');
  });
});
