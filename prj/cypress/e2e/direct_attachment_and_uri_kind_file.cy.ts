// Browser-driven coverage for two generator features that share the same
// two standard components (SingleAttachmentUpload / SingleAttachmentDisplay):
//   - x-relationship: { target: attachment, type: direct } -- a single-file
//     FK (product.warranty_card_id, leave_request.medical_certificate_id).
//   - x-uri-kind: file -- a plain URL-string field that uploads like an
//     image but displays as a download link, not an <img> (product.spec_sheet_url).
//
// The generated API spec suite (cypress/e2e/api/product.cy.ts,
// cypress/e2e/api/leave_request.cy.ts) already exercises these fields as
// generic scalar round-trips. This spec is the one place that drives the
// actual upload widget through the browser and asserts the image-vs-file
// display branch, which no generated spec covers.
//
// Elements are targeted via SingleAttachmentUpload's own
// `data-testid="single-attachment-upload-{label}-file"` / `-value` (not a
// label->for lookup or cy.contains(filename)): the component wraps the
// whole MUI TextField in its own outer <label htmlFor={inputId}>, while
// MUI's TextField also renders its OWN inner <label> around its own
// (read-only) input -- two nested <label> elements with different `for`
// targets. And the uploaded file name is the TextField's `value`, which is
// not part of the DOM's rendered text content, so cy.contains(filename)
// never matches it -- `have.value` against the value input is required.
import { TEST_CREDENTIALS } from '../support/test-credentials';

function pngFile(name: string) {
  return {
    // 1x1 transparent PNG -- real, valid image bytes so the browser/server
    // accept it as image/png without needing a binary fixture file on disk.
    contents: Cypress.Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    ),
    fileName: name,
    mimeType: 'image/png',
    lastModified: 0,
  };
}

function pdfFile(name: string) {
  // Content bytes are never parsed as a real PDF by app/api/upload/route.ts
  // (it only checks file.type against an allowlist and writes the bytes
  // through) -- ASCII content with an explicit mimeType is sufficient.
  return {
    contents: Cypress.Buffer.from('%PDF-1.4 direct-attachment test fixture', 'utf8'),
    fileName: name,
    mimeType: 'application/pdf',
    lastModified: 0,
  };
}

function loginAs(email: string, password: string = TEST_CREDENTIALS.password) {
  Cypress.session.clearAllSavedSessions();
  cy.clearCookies();
  cy.clearLocalStorage();
  cy.visit('/en/');
  cy.window().then((win) => {
    win.sessionStorage.clear();
  });
  cy.login(email, password);
}

describe('UI: direct-attachment FK + x-uri-kind: file (SingleAttachmentUpload/SingleAttachmentDisplay)', () => {
  beforeEach(() => {
    cy.task('db:reset');
    cy.task('db:seed');
    cy.task('db:grantAllPermissions');
  });

  it('product: uploads a REQUIRED-shape image FK (warrantyCard) and a non-image file URL (specSheetUrl) on Edit, both persist and render correctly on View', () => {
    cy.task<any[]>('db:populateProduct', 1).then(([product]) => {
      loginAs(TEST_CREDENTIALS.email);
      cy.visit(`/en/product/edit/${product.id}`);
      cy.contains('Warranty Card').should('be.visible');

      // Direct-attachment FK (mode='fk'): upload an image -- displays as an <img>.
      cy.get('[data-testid="single-attachment-upload-warrantyCard-file"]').selectFile(pngFile('warranty.png'), { force: true });
      cy.get('[data-testid="single-attachment-upload-warrantyCard-value"]', { timeout: 10000 }).should('have.value', 'warranty.png');

      // x-uri-kind: file (mode='url'): upload a PDF -- displays as a download link, not an <img>.
      cy.get('[data-testid="single-attachment-upload-specSheetUrl-file"]').selectFile(pdfFile('spec-sheet.pdf'), { force: true });
      cy.get('[data-testid="single-attachment-upload-specSheetUrl-value"]', { timeout: 10000 }).should('have.value', 'spec-sheet.pdf');

      cy.contains('button', 'Save').click();
      cy.url().should('not.include', '/edit/');

      cy.visit(`/en/product/view/${product.id}`);
      // Direct-attachment FK renders as an <img> for an image-kind attachment.
      cy.get('img[alt="Warranty Card"]').should('be.visible');
      // x-uri-kind: file renders as a plain link, never an <img>, even
      // though it went through the same upload widget as the image above.
      cy.contains('a', 'spec-sheet.pdf').should('be.visible').should('not.match', 'img');
      cy.get('img[alt="Spec Sheet Url"]').should('not.exist');
    });
  });

  it('product: Remove clears a direct-attachment FK value, verified after reload', () => {
    cy.task<any[]>('db:populateProduct', 1).then(([product]) => {
      loginAs(TEST_CREDENTIALS.email);
      cy.visit(`/en/product/edit/${product.id}`);

      cy.get('[data-testid="single-attachment-upload-warrantyCard-file"]').selectFile(pngFile('to-remove.png'), { force: true });
      cy.get('[data-testid="single-attachment-upload-warrantyCard-value"]', { timeout: 10000 }).should('have.value', 'to-remove.png');

      cy.contains('button', 'Remove').first().click();
      cy.get('[data-testid="single-attachment-upload-warrantyCard-value"]').should('have.value', '');

      cy.contains('button', 'Save').click();
      cy.url().should('not.include', '/edit/');

      cy.visit(`/en/product/edit/${product.id}`);
      cy.contains('Warranty Card').should('be.visible');
      cy.get('img[alt="Warranty Card"]').should('not.exist');
    });
  });

  it('leave_request: uploads a nullable direct-attachment FK (medicalCertificate), persists, and view page shows it read-only', () => {
    cy.task<any[]>('db:populateLeaveRequest', 1).then(([leaveRequest]) => {
      loginAs(TEST_CREDENTIALS.email);
      cy.visit(`/en/leave_request/edit/${leaveRequest.id}`);
      cy.contains('Medical Certificate').should('be.visible');

      cy.get('[data-testid="single-attachment-upload-medicalCertificate-file"]').selectFile(pdfFile('cert.pdf'), { force: true });
      cy.get('[data-testid="single-attachment-upload-medicalCertificate-value"]', { timeout: 10000 }).should('have.value', 'cert.pdf');

      cy.contains('button', 'Save').click();
      cy.url().should('not.include', '/edit/');

      cy.visit(`/en/leave_request/view/${leaveRequest.id}`);
      cy.contains('a', 'cert.pdf').should('be.visible');
    });
  });

  it('leave_request: a leave_request with no medical certificate renders nothing for the field (nullable, no crash)', () => {
    cy.task<any[]>('db:populateLeaveRequest', 1).then(([leaveRequest]) => {
      loginAs(TEST_CREDENTIALS.email);
      cy.visit(`/en/leave_request/view/${leaveRequest.id}`);
      cy.contains('a', '.pdf').should('not.exist');
      cy.get('img[alt="Medical Certificate"]').should('not.exist');
    });
  });
});
