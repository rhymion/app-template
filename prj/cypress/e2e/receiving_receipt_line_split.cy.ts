// cmd_296 Phase1: split UI (SplitActionSection), browser-driven. Exercises the
// Split dialog on receiving_receipt_line's view page — trigger, per-part
// quantity input, the inventory_id Autocomplete+lookup (D2 ruling — not a
// plain TextField), the live remaining-quantity readout, submit-disabled
// until remaining is 0, and post-submit reflection (router.refresh — D3).
import { TEST_CREDENTIALS } from '../support/test-credentials';

describe('UI: Receiving Receipt Line — Split (cmd_296)', () => {
  beforeEach(() => {
    cy.task('db:reset');
    cy.task('db:seed');
    cy.task('db:grantAllPermissions');
  });

  it('splits via the Split dialog: quantity inputs + inventory Autocomplete lookup, remaining validation, DB reflects split', () => {
    cy.task<any>('db:setupReceivingReceiptLineSingleApprovalFlow').then((flowSetup) => {
      cy.task<any>('db:seedReservationInventory', { quantity: 100 }).then((invSeed) => {
        cy.task<any>('db:populateReceivingReceiptLineSingleApproval', {
          creatorId: flowSetup.approverUser.id,
          approvalFlowIds: [],
          // item3 cross-product guard: the split parts below select the seeded
          // reservation inventory, so the parent line's product must match it
          // (otherwise the guard's product mismatch check 400s and the dialog
          // never closes — cmd_309 item4 QC cluster C).
          productId: invSeed.product.id,
        }).then((data) => {
          const { line } = data;
          const inventory = invSeed.inventory;

          Cypress.session.clearAllSavedSessions();
          cy.clearCookies();
          cy.clearLocalStorage();
          cy.visit('/en/');
          cy.window().then((win) => {
            win.sessionStorage.clear();
          });
          cy.login(TEST_CREDENTIALS.email, TEST_CREDENTIALS.password);

          cy.visit(`/en/receiving_receipt_line/view/${line.id}`);

          // Only the trigger button exists before the dialog opens.
          cy.contains('button', 'Split').click();
          cy.get('[role="dialog"]').should('be.visible');

          // Nothing assigned yet — remaining equals the full parent quantity (5).
          cy.get('[role="dialog"]').contains('Remaining: 5').should('be.visible');
          cy.get('[role="dialog"]').contains('button', 'Split').should('be.disabled');

          // Row 0: quantity=2, inventory = seeded inventory row (Autocomplete+lookup, not free text).
          // {selectall} (not .clear()) — matches this codebase's fillField convention;
          // .clear() on a controlled MUI number input races with React's re-render
          // and can interleave with the typed digits.
          // Search by product name (cmd_304 FIX-4: labelField is now the composite
          // product name + location + lot_number, not the raw id, and the search
          // endpoint's searchable_relation_fields resolves product.name).
          cy.get('[role="dialog"] input[type="number"]').eq(0).type('{selectall}2');
          selectInventoryOption(0, 'Reservation Test Product');

          // Row 1: quantity=3 — remaining should now read 0 and the submit button enable.
          cy.get('[role="dialog"] input[type="number"]').eq(1).type('{selectall}3');
          selectInventoryOption(1, 'Reservation Test Product');

          cy.get('[role="dialog"]').contains('Remaining: 0').should('be.visible');
          cy.get('[role="dialog"]').contains('button', 'Split').should('not.be.disabled');

          cy.get('[role="dialog"]').contains('button', 'Split').click();

          // Dialog closes on success (no error surfaced).
          cy.get('[role="dialog"]').should('not.exist');

          // router.refresh() (D3) re-fetches server data — the status field flips
          // from 'pending' to 'split' without a full page reload.
          cy.contains('split', { matchCase: false }).should('be.visible');

          // Real-behavior confirmation: the browser-driven split actually
          // persisted (status flipped, approvable preserved, 2 children created).
          cy.task<any>('db:getReceivingReceiptLineById', { id: line.id }).then((parent) => {
            expect(parent.status).to.eq(1);
            expect(parent.approvable_id).to.eq(line.approvable_id);
          });
          cy.task<any>('db:getReceivingReceiptLineChildren', { parentId: line.id }).then((children) => {
            expect(children).to.have.length(2);
          });
        });
      });
    });
  });
});

/**
 * Select the option matching `searchText` (a substring, not an exact label —
 * cmd_304 FIX-4 made the label a composite "product location lot_number"
 * string, so exact-match against a single field no longer applies) in the
 * Nth (0-indexed) inventory_id EntityAutocomplete inside the open Split
 * dialog. Both split-part rows render the same field label ("inventory_id"),
 * so — unlike the generic `cy.selectAutocomplete` helper (label lookup,
 * .first() only) — this targets the row by DOM position. The MUI popper
 * portals to document.body, so the option list is queried outside the
 * dialog's DOM subtree.
 */
function selectInventoryOption(rowIndex: number, searchText: string) {
  cy.get('[role="dialog"] input[role="combobox"]')
    .eq(rowIndex)
    .click({ force: true })
    .type('{selectall}' + searchText, { force: true });
  cy.document().then((doc) => {
    const optionSelector = '[role="listbox"] [role="option"], .MuiAutocomplete-popper li';
    cy.wrap(doc.body)
      .find(optionSelector)
      .should(($opts) => {
        const $matched = $opts.filter((_, el) => (el.textContent ?? '').includes(searchText));
        expect($matched.length).to.be.greaterThan(0);
      })
      .then(($opts) => {
        const $matched = $opts.filter((_, el) => (el.textContent ?? '').includes(searchText)).first();
        cy.wrap($matched).click();
      });
  });
}
