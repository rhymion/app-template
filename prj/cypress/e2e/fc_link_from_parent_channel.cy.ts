// Manual supplemental spec — verifies cmd_177 P1-P3:
// fc_link CRUD (create/edit/delete) from its parent (channel) via the parent-embedded BridgeGrid.
// P1: add button lives on parent EDIT page (detail page is read-only list).
// Lives in prj/ so prj:sync preserves it across regen/cleanup.
import { TEST_CREDENTIALS } from '../support/test-credentials';

/** Navigate to the channel EDIT page for 'Channel 1' and wait for the FcLinkBridgeGrid fetch. */
function goToChannelEdit() {
  cy.intercept('POST', /\/channel\/edit\//).as('bridgeFetch');
  cy.visit('/en/channel');
  cy.get('.MuiDataGrid-virtualScroller').scrollTo('bottom', { ensureScrollable: false });
  cy.contains('.MuiDataGrid-row', 'Channel 1').find('[aria-label="Edit"]').click();
  cy.url().should('include', '/channel/edit');
  cy.wait('@bridgeFetch', { timeout: 20000 });
}

/** Navigate to the channel VIEW page for 'Channel 1' and wait for the FcLinkBridgeGrid fetch. */
function goToChannelView() {
  cy.intercept('POST', /\/channel\/view\//).as('bridgeFetch');
  cy.visit('/en/channel');
  cy.get('.MuiDataGrid-virtualScroller').scrollTo('bottom', { ensureScrollable: false });
  cy.contains('Channel 1').click();
  cy.url().should('include', '/channel/view');
  cy.wait('@bridgeFetch', { timeout: 20000 });
}

/** Create an fc_link from the embedded grid (must be on parent edit page) and wait for redirect. */
function createFcLinkFromParent(name: string) {
  // P2: button has target="_blank" — strip it so Cypress navigates in the same tab.
  cy.contains('a', '+ Fc Link').invoke('removeAttr', 'target').click();
  cy.url().should('include', '/fc_link/new');
  cy.url().should('include', 'parentType=channel');
  cy.fillField('Name', name);
  cy.fillField('Image URL', 'https://example.com/test.jpg');
  cy.clickButton('Save');
  cy.url().should('not.include', '/fc_link/new');
}

describe('Fc Link: CRUD from parent (channel) via embedded BridgeGrid', () => {
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

  it('creates an fc_link bound to a channel via the embedded grid', () => {
    cy.task('db:populateChannel', 1);

    // P1: add button is on edit page, not view page.
    goToChannelEdit();

    cy.contains('a', '+ Fc Link')
      .should('have.attr', 'href')
      .and('match', /\/fc_link\/new\?parentType=channel&parentId=/);

    createFcLinkFromParent('FcLink From Channel');

    goToChannelView();
    cy.contains('h2', 'Fc Link').scrollIntoView();
    cy.contains('FcLink From Channel').should('exist');
  });

  it('edits an fc_link from the embedded grid without changing parent context', () => {
    cy.task('db:populateChannel', 1);

    goToChannelEdit();
    createFcLinkFromParent('FcLink To Edit');

    goToChannelView();
    cy.contains('h2', 'Fc Link').scrollIntoView();
    cy.contains('FcLink To Edit').should('exist');

    cy.contains('.MuiDataGrid-row', 'FcLink To Edit').find('[aria-label="Edit"]').click();
    cy.url().should('include', '/fc_link/edit');

    cy.clearAndFillField('Name', 'FcLink Edited');
    cy.clickButton('Save');
    cy.url().should('not.include', '/fc_link/edit');

    goToChannelView();
    cy.contains('h2', 'Fc Link').scrollIntoView();
    cy.contains('FcLink Edited').should('exist');
    cy.contains('FcLink To Edit').should('not.exist');
  });

  it('deletes an fc_link from the embedded grid', () => {
    cy.task('db:populateChannel', 1);

    goToChannelEdit();
    createFcLinkFromParent('FcLink To Delete');

    goToChannelView();
    cy.contains('h2', 'Fc Link').scrollIntoView();
    cy.contains('FcLink To Delete').should('exist');

    cy.contains('.MuiDataGrid-row', 'FcLink To Delete').find('input[type="checkbox"]').check();
    cy.get('button[aria-label="Delete Selected"]').first().click();
    cy.get('div[role="dialog"]').find('button[aria-label="Delete"]').click();

    // removeFcLink Server Action calls redirect('/fc_link') — wait for navigation.
    cy.url().should('not.include', '/channel/view');

    goToChannelView();
    cy.contains('h2', 'Fc Link').scrollIntoView();
    cy.contains('FcLink To Delete').should('not.exist');
  });
});
