import { TEST_CREDENTIALS } from '../support/test-credentials';
import { fillDataGridRow } from '../support/datagrid-helpers';

// Hand-written regression guard for the x-uri-kind: link form-input wiring
// fix in the generator's form_upsert_context()/form_view_context(). Before
// the fix, a format:uri field categorized as cats['link_uri'] in
// build_context.py was never rendered as an input in FormUpsert.tsx, so it
// could never be set through the UI — and on every edit, the missing
// FormData entry let the update path silently overwrite (erase) any
// existing value. parent1.image_url already declares x-uri-kind: link and
// is optional, so this spec doubles as coverage for the generator's
// nullable-link-field code path, which the generator's own auto-generated
// test-data helpers do not yet exercise (they skip nullable uri fields
// regardless of kind).
describe('parent1.image_url (x-uri-kind: link) input wiring and data-loss guard', () => {
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

  function createParent1WithImageUrl(name: string, url: string) {
    cy.task<any>('db:populateParent1Dependencies').then(() => {
      cy.visit('/en/parent1');
      cy.clickButton('Create New Parent1');
      cy.url().should('include', '/parent1/new');
      cy.fillField('Name', name);
      cy.fillField('Price', '100');
      cy.fillDateTime('Due Date', '01/15/2025 09:00 AM');
      // The bug: before the fix, no input exists for a link field, so this
      // fillField would time out finding the labeled input at all.
      cy.fillField('Image Url', url);
      cy.clickButton('Add Parent1 Child1s');
      fillDataGridRow(0, { name: 'Child1', written_by: 'Tester' }, true, 'Parent1 Child1s');
      cy.clickButton('Add Parent1 Child2s');
      fillDataGridRow(0, { name: 'Child2', end_date: '2025-01-16T00:00' }, true, 'Parent1 Child2s');
      cy.clickButton('Save');
      cy.url().should('include', '/parent1');
      cy.url().should('not.include', '/parent1/');
    });
  }

  it('renders an input for the link field, saves it, and shows it as a clickable external link on view', () => {
    const url = 'https://example.com/image/1.png';
    createParent1WithImageUrl('Link Field Test Parent1', url);

    cy.contains('Link Field Test Parent1').click();
    cy.url().should('include', '/parent1/view');
    // Read-only view must render a clickable external link, not an <img>.
    cy.contains('Image Url').parent().find('a').should('have.attr', 'href', url).and('have.text', url);
    cy.contains('Image Url').parent().find('img').should('not.exist');
  });

  it('does not silently wipe the link field value when only another field is edited', () => {
    const url = 'https://example.com/image/2.png';
    createParent1WithImageUrl('Data Loss Guard Parent1', url);

    // Edit WITHOUT touching Image Url — only change Name.
    cy.contains('Data Loss Guard Parent1').click();
    cy.url().should('include', '/parent1/view');
    cy.get('a[aria-label="Edit"]').click();
    cy.url().should('include', '/parent1/edit');
    // The edit form's Image Url input must already be pre-filled with the
    // existing value (proves the input is wired to src, not just present).
    cy.checkField('Image Url', url);
    cy.clearAndFillField('Name', 'Data Loss Guard Parent1 Renamed');
    cy.clickButton('Save');

    cy.contains('Data Loss Guard Parent1 Renamed').click();
    cy.url().should('include', '/parent1/view');
    // Core data-loss assertion: the untouched link field must still hold
    // its original value, not have been overwritten to null/empty.
    cy.contains('Image Url').parent().find('a').should('have.attr', 'href', url).and('have.text', url);
  });
});
