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
//
// Save is clicked via `button[aria-label="Save"]`, not
// cy.contains('button', 'Save'): FormWithChildGrid's real submit button is
// icon-only (SaveIcon inside a Tooltip, label only in aria-label/Tooltip
// title, no visible text). On product -- which also carries a legacy
// attachable_id bridge (AttachmentSection) -- cy.contains('button', 'Save')
// silently matches that section's unrelated "Save attachments" button
// instead, so the real form is never submitted and the page never leaves
// /edit/.
//
// attachmentTestid() below (rather than a bare cy.get('[data-testid=...]'))
// is required because this data-testid is not always unique in the raw DOM:
// every one of these edit pages wraps its async Server Component in
// `<Suspense fallback={<FormSkeleton />}>` (the generator's standard
// page.tsx.jinja2 pattern, used project-wide -- not specific to this
// feature). React's streaming SSR occasionally leaves the resolved
// boundary's HTML sitting in BOTH its final position AND a leftover
// `<div hidden id="S:n">` streaming-template container that never gets
// cleared client-side -- a framework-level timing artifact, not a real
// second field: the `#S:n` copy is `hidden`/`display:none` and inert
// (matches nothing a user can see or interact with). Reproduced locally
// ~75% of runs (cmd_951 investigation) via cy.get(...).selectFile()
// throwing "Your subject contained 2 elements" on whichever field's DOM
// query happened to land while the leftover copy was still present.
// The `:not([hidden] *)` suffix excludes anything nested under a `[hidden]`
// ancestor, selecting the one live element deterministically -- via a plain
// CSS selector so cy.get()'s own retry/timeout polling still applies,
// without loosening what the test actually asserts.
import { TEST_CREDENTIALS } from '../support/test-credentials';

function attachmentTestid(testid: string, options?: Partial<Cypress.Timeoutable>) {
  return cy.get(`[data-testid="${testid}"]:not([hidden] *)`, options);
}

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
      attachmentTestid('single-attachment-upload-warrantyCard-file').selectFile(pngFile('warranty.png'), { force: true });
      attachmentTestid('single-attachment-upload-warrantyCard-value', { timeout: 10000 }).should('have.value', 'warranty.png');

      // x-uri-kind: file (mode='url'): upload a PDF -- displays as a download link, not an <img>.
      attachmentTestid('single-attachment-upload-specSheetUrl-file').selectFile(pdfFile('spec-sheet.pdf'), { force: true });
      attachmentTestid('single-attachment-upload-specSheetUrl-value', { timeout: 10000 }).should('have.value', 'spec-sheet.pdf');

      cy.get('button[aria-label="Save"]').click();
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

      attachmentTestid('single-attachment-upload-warrantyCard-file').selectFile(pngFile('to-remove.png'), { force: true });
      attachmentTestid('single-attachment-upload-warrantyCard-value', { timeout: 10000 }).should('have.value', 'to-remove.png');

      cy.contains('button', 'Remove').first().click();
      attachmentTestid('single-attachment-upload-warrantyCard-value').should('have.value', '');

      cy.get('button[aria-label="Save"]').click();
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

      attachmentTestid('single-attachment-upload-medicalCertificate-file').selectFile(pdfFile('cert.pdf'), { force: true });
      attachmentTestid('single-attachment-upload-medicalCertificate-value', { timeout: 10000 }).should('have.value', 'cert.pdf');

      cy.get('button[aria-label="Save"]').click();
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
