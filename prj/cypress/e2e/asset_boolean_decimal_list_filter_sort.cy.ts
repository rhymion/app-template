// Real-browser regression coverage for list-view filter/sort on `boolean`
// and `Decimal`-typed columns (cmd_1200): a permanent testbed fixture in
// this consumer, since a browser-caused defect class (below) cannot be
// reached by generator-side unit coverage alone.
//
// Background: app-generator#759 (found by subtask_1193a) is a browser-only
// defect -- a Decimal list-column's filter input is a real
// `<input type="number">` (MUI DataGrid's default numeric operator,
// InputComponentProps: { type: 'number' }). Typing an exact value like
// '99.99' into that native input round-trips it through the browser's own
// IEEE-754 double (99.99 -> 99.98999999999999...) BEFORE the value ever
// reaches buildFilter -- no pytest-level assertion can reach this, because
// nothing about it happens in generated server code; it happens inside the
// browser's own <input> element. #759's fix re-quantizes a JS-number-typed
// Decimal filter value (via x-decimal-scale, auto-reflected from
// `@db.Decimal(p, s)`) before building the Prisma clause.
//
// `asset` (already a permanent regression fixture entity, see the schema
// comment block above its definition) is extended here with `unit_cost`
// (pre-existing Decimal field, now added to x-display.table) and a new
// `under_warranty` Boolean field -- per subtask_1195b's disclosed gap,
// neither kind had any real-entity list-column coverage anywhere across
// this generator's own dogfood schema or any of its three known consumers
// before this task. Reusing `asset` instead of adding a new entity is
// deliberate (cmd_1200 execution_step 3: prefer an existing entity when one
// can substitute).
//
// To prove this spec actually catches the #759 regression class (not just
// exercises the happy path), the Decimal test below was run once against a
// deliberately-reverted lib/_pagination.ts buildFilter (dropping the
// x-decimal-scale re-quantization) and confirmed to fail -- see this task's
// completion report for the revert/restore transcript; the revert itself
// was never committed.
import { TEST_CREDENTIALS, TEST_API_KEY } from '../support/test-credentials';

const API_BASE = '/api/asset';

function exactRe(text: string): RegExp {
  return new RegExp('^' + text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$');
}

function apiCreateAsset(overrides: {
  asset_tag: string;
  unit_cost?: string;
  under_warranty?: boolean;
}) {
  return cy
    .request({
      method: 'POST',
      url: API_BASE,
      headers: { 'X-API-Key': TEST_API_KEY },
      body: {
        asset_tag: overrides.asset_tag,
        manual_url: `https://example.com/${encodeURIComponent(overrides.asset_tag)}`,
        ...(overrides.unit_cost !== undefined ? { unit_cost: overrides.unit_cost } : {}),
        ...(overrides.under_warranty !== undefined ? { under_warranty: overrides.under_warranty } : {}),
        components: [],
      },
    })
    .then((res) => {
      expect(res.status).to.eq(201);
      return res.body;
    });
}

function openColumnFilter(field: string) {
  cy.get(`.MuiDataGrid-columnHeader[data-field="${field}"] .MuiDataGrid-menuIconButton`).click({ force: true });
  cy.get('.MuiDataGrid-menuList').contains('Filter').click();
}

function setNumberFilterValue(value: string) {
  cy.get('.MuiDataGrid-panel .MuiDataGrid-filterForm input[type="number"]').last().clear().type(value);
}

function setBooleanFilterValue(value: 'true' | 'false') {
  // The filter form has three comboboxes (Column / Operator / Value) --
  // the Value select is the last one in DOM order.
  cy.get('.MuiDataGrid-panel .MuiDataGrid-filterForm').find('[role="combobox"]').last().click();
  cy.get('ul[role="listbox"]').contains(exactRe(value)).click();
}

describe('List filter/sort on boolean & Decimal columns (asset, cmd_1200 / app-generator#756 #759)', () => {
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

  it('filters the Decimal (unit_cost) column by an exact value without a browser IEEE-754 round-trip mismatch', () => {
    apiCreateAsset({ asset_tag: 'Decimal Filter Match', unit_cost: '99.99' });
    apiCreateAsset({ asset_tag: 'Decimal Filter Other', unit_cost: '10.50' });
    cy.visit('/en/asset');
    cy.get('.MuiDataGrid-row').should('have.length', 2);

    openColumnFilter('unit_cost');
    setNumberFilterValue('99.99');

    // Before app-generator#759's fix, the browser's own <input type="number">
    // mangles '99.99' into 99.98999999999999... before buildFilter ever sees
    // it, so an exact-match '=' filter against a real 99.99-valued row
    // returns zero rows instead of one.
    cy.get('.MuiDataGrid-row').should('have.length', 1);
    cy.contains('.MuiDataGrid-cell', exactRe('Decimal Filter Match')).should('exist');
    cy.contains('.MuiDataGrid-cell', exactRe('Decimal Filter Other')).should('not.exist');

    // A value matching neither row must return zero rows (proves the
    // filter is a real comparison, not a pass-through).
    setNumberFilterValue('123.45');
    cy.get('.MuiDataGrid-row').should('have.length', 0);
  });

  it('sorts by the Decimal (unit_cost) column', () => {
    apiCreateAsset({ asset_tag: 'Decimal Sort Low', unit_cost: '1.00' });
    apiCreateAsset({ asset_tag: 'Decimal Sort High', unit_cost: '50.00' });
    cy.visit('/en/asset');
    cy.get('.MuiDataGrid-row').should('have.length', 2);

    cy.get('[data-field="unit_cost"] .MuiDataGrid-columnHeaderTitle').click();
    cy.get('.MuiDataGrid-row').eq(0).should('contain.text', 'Decimal Sort Low');
    cy.get('.MuiDataGrid-row').eq(1).should('contain.text', 'Decimal Sort High');

    // Click again for descending order.
    cy.get('[data-field="unit_cost"] .MuiDataGrid-columnHeaderTitle').click();
    cy.get('.MuiDataGrid-row').eq(0).should('contain.text', 'Decimal Sort High');
    cy.get('.MuiDataGrid-row').eq(1).should('contain.text', 'Decimal Sort Low');
  });

  it('filters the boolean (under_warranty) column', () => {
    apiCreateAsset({ asset_tag: 'Warranty Yes', under_warranty: true });
    apiCreateAsset({ asset_tag: 'Warranty No', under_warranty: false });
    cy.visit('/en/asset');
    cy.get('.MuiDataGrid-row').should('have.length', 2);

    openColumnFilter('under_warranty');
    setBooleanFilterValue('true');

    cy.get('.MuiDataGrid-row').should('have.length', 1);
    cy.contains('.MuiDataGrid-cell', exactRe('Warranty Yes')).should('exist');
    cy.contains('.MuiDataGrid-cell', exactRe('Warranty No')).should('not.exist');

    setBooleanFilterValue('false');
    cy.get('.MuiDataGrid-row').should('have.length', 1);
    cy.contains('.MuiDataGrid-cell', exactRe('Warranty No')).should('exist');
    cy.contains('.MuiDataGrid-cell', exactRe('Warranty Yes')).should('not.exist');
  });

  it('sorts by the boolean (under_warranty) column', () => {
    apiCreateAsset({ asset_tag: 'Bool Sort False', under_warranty: false });
    apiCreateAsset({ asset_tag: 'Bool Sort True', under_warranty: true });
    cy.visit('/en/asset');
    cy.get('.MuiDataGrid-row').should('have.length', 2);

    cy.get('[data-field="under_warranty"] .MuiDataGrid-columnHeaderTitle').click();
    cy.get('.MuiDataGrid-row').eq(0).should('contain.text', 'Bool Sort False');
    cy.get('.MuiDataGrid-row').eq(1).should('contain.text', 'Bool Sort True');

    cy.get('[data-field="under_warranty"] .MuiDataGrid-columnHeaderTitle').click();
    cy.get('.MuiDataGrid-row').eq(0).should('contain.text', 'Bool Sort True');
    cy.get('.MuiDataGrid-row').eq(1).should('contain.text', 'Bool Sort False');
  });
});
