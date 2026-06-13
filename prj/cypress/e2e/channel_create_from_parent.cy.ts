// Manual supplemental spec (not generated) — verifies cmd_167 §4:
// channel CRUD (create/edit/delete) from its parent (work) via the parent-embedded BridgeGrid.
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

/** Create a channel from the embedded grid and wait for the redirect away from /channel/new. */
function createChannelFromParent(name: string) {
  cy.contains('a', '+ Channel').click();
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

    // Open the work detail (view) page, which embeds the Channel + Fc Link grids.
    goToWorkView();

    // The embedded grid section + an Add link carrying parent context.
    cy.contains('a', '+ Channel')
      .should('have.attr', 'href')
      .and('match', /\/channel\/new\?parentType=work&parentId=/);

    // Create a channel from the parent context.
    createChannelFromParent('Channel From Work');

    // Re-open the work view: the new channel appears in its embedded grid,
    // proving it was bound to this work's bridge row.
    goToWorkView();
    // Scroll to the Channel section and wait up to 20s for the async grid fetch.
    cy.contains('h2', 'Channel').scrollIntoView();
    cy.contains('Channel From Work').should('exist');
  });

  it('edits a channel from the embedded grid without changing parent context', () => {
    cy.task('db:populateWork', 1);

    // Create a channel via the embedded grid.
    goToWorkView();
    createChannelFromParent('Channel To Edit');

    // Navigate back to the work view; wait for the channel row to appear in the grid.
    goToWorkView();
    cy.contains('h2', 'Channel').scrollIntoView();
    cy.contains('Channel To Edit').should('exist');

    // Open the edit form from the row action menu.
    cy.contains('.MuiDataGrid-row', 'Channel To Edit').find('[aria-label="Edit"]').click();
    cy.url().should('include', '/channel/edit');

    // Edit the name (AP-3=B: parent context fields are excluded from the edit form).
    cy.clearAndFillField('Name', 'Channel Edited');
    cy.clickButton('Save');
    cy.url().should('not.include', '/channel/edit');

    // Navigate back to the work view: the updated name appears in the embedded grid.
    goToWorkView();
    cy.contains('h2', 'Channel').scrollIntoView();
    cy.contains('Channel Edited').should('exist');
    cy.contains('Channel To Edit').should('not.exist');
  });

  it('deletes a channel from the embedded grid', () => {
    cy.task('db:populateWork', 1);

    // Create a channel via the embedded grid.
    goToWorkView();
    createChannelFromParent('Channel To Delete');

    // Navigate back to the work view; wait for the channel row to appear.
    goToWorkView();
    cy.contains('h2', 'Channel').scrollIntoView();
    cy.contains('Channel To Delete').should('exist');

    // Select row and trigger delete.
    cy.contains('.MuiDataGrid-row', 'Channel To Delete').find('input[type="checkbox"]').check();
    cy.get('button[aria-label="Delete Selected"]').first().click();
    cy.get('div[role="dialog"]').find('button[aria-label="Delete"]').click();

    // removeChannel Server Action calls redirect('/channel') — wait for navigation.
    cy.url().should('not.include', '/work/view');

    // Navigate back to the work view: the deleted channel is no longer in the grid.
    goToWorkView();
    cy.contains('h2', 'Channel').scrollIntoView();
    cy.contains('Channel To Delete').should('not.exist');
  });
});
