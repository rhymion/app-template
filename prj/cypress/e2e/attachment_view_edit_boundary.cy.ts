// cmd_421 Batch4 (DP-C): browser-driven regression coverage for cmd_419's
// three attachment bugs, scoped to resource + product — the only two
// entities wired to components/_standard/AttachmentSection (scoped to
// the original investigation scope for cmd_419):
//   bug1 (persistence): a stale-closure/useMemo bug in AttachmentSection.tsx
//     silently discarded a just-added file on save. Fixed by memoizing
//     initialImages/initialFiles on the `attachments` array reference.
//   bug2 (permission+org-scope): assertCanEditBridge used to gate purely on
//     `creator_id === userId`, so a non-creator user who legitimately held
//     RBAC `update` on the owner entity could not save attachments. Fixed to
//     call requirePermission('<owner>', 'update', item) — the same path
//     every owner entity's own upsert action already uses. `resource` also
//     carries an unconditional organization-membership requirement at the
//     getters layer (lib/resource/getters.ts getResourceDetail — org
//     membership is required regardless of RBAC flags), so a permitted but
//     non-member user can't even reach /resource/edit/:id (404); `product`
//     has no organization_id, so its bug2 check is permission-only.
//   bug3 (view/edit boundary): resource_detail/product_detail's
//     AttachmentSection was wired with a single x-custom-components entry
//     targeting both view+edit, so the upload/Save UI leaked onto the
//     read-only View page. Fixed by splitting into separate view (readOnly:
//     true) and edit targets.
//
// IMPORTANT — bug3 fix landing status (see the historical QC record for detail):
// the schema half of the bug3 fix is commit 1a6890c on branch
// doreen/cmd419-view-boundary-fix, which is NOT YET MERGED into this
// branch's history as of this spec's authoring (that branch is being
// held unmerged until cmd_419 QC completes). The 'view screen read-only'
// assertions below (`it.skip` markers none — they run for real) will FAIL
// against a checkout that lacks 1a6890c, and will PASS once cmd_419 lands.
// That is expected, correct regression-catching behavior, not a defect in
// this spec.
import { TEST_CREDENTIALS } from '../support/test-credentials';

const TYPE_IMAGE = 'image';
const TYPE_FILE = 'file';

function pngFile(name: string) {
  return {
    // 1x1 transparent PNG — real, valid image bytes so the browser/server
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
  // through) — ASCII content with an explicit mimeType is sufficient.
  return {
    contents: Cypress.Buffer.from('%PDF-1.4 cmd_421 test fixture', 'utf8'),
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

/** Opens the Add Image/Add File dialog, selects a file, submits — leaves the item added locally (unsaved). */
function addAttachmentViaDialog(addButtonLabel: 'Add Image' | 'Add File', file: ReturnType<typeof pngFile>) {
  cy.get(`[aria-label="${addButtonLabel}"]`).first().click();
  cy.get('[role="dialog"]').should('be.visible');
  cy.get('[role="dialog"] input[type="file"]').selectFile(file, { force: true });
  cy.get('[role="dialog"]').contains('Selected:').should('be.visible');
  cy.get('[role="dialog"]').contains('button', addButtonLabel).click();
  cy.get('[role="dialog"]').should('not.exist');
}

describe('UI: resource attachments — view/edit boundary, save persistence, permission+org-scope (cmd_421)', () => {
  beforeEach(() => {
    cy.task('db:reset');
    cy.task('db:seed');
    cy.task('db:grantAllPermissions');
  });

  // resource's FormView/FormUpsert pass showImages=true, showFiles=false
  // (an entity config choice, unrelated to the view/edit-boundary bug —
  // confirmed via an earlier production-build verification) — so this
  // entity's coverage below is images-only; file-type coverage lives in
  // the product describe block.

  it('creator uploads an image on Edit, saves, reload persists it (bug1); Edit shows full upload/save UI (bug3 control)', () => {
    cy.task<any[]>('db:populateResource', 1).then(([resource]) => {
      loginAs(TEST_CREDENTIALS.email);
      cy.visit(`/en/resource/edit/${resource.id}`);

      addAttachmentViaDialog('Add Image', pngFile('verify-resource-image.png'));
      cy.contains('verify-resource-image.png').should('be.visible');

      cy.contains('button', 'Save attachments').click();
      cy.contains('Saved').should('be.visible');

      cy.reload();
      cy.contains('verify-resource-image.png').should('be.visible');
      // Edit-screen control: upload/save affordance still present post-reload.
      cy.contains('button', 'Save attachments').should('be.visible');
      cy.get('[aria-label="Add Image"]').should('exist');

      cy.task<any[]>('db:getAttachableAttachments', { attachableId: resource.attachable_id }).then((rows) => {
        expect(rows.map((r) => r.name)).to.include('verify-resource-image.png');
      });
    });
  });

  it('View page shows an existing attachment read-only: no upload/save UI (bug3)', () => {
    cy.task<any[]>('db:populateResource', 1).then(([resource]) => {
      cy.task<any>('db:seedAttachment', {
        attachableId: resource.attachable_id,
        type: TYPE_IMAGE,
        name: 'preexisting-resource-image.png',
        path: '/uploads/preexisting-resource-image.png',
      }).then(() => {
        loginAs(TEST_CREDENTIALS.email);
        cy.visit(`/en/resource/view/${resource.id}`);

        // The attachment itself IS visible (read-only display)...
        cy.contains('preexisting-resource-image.png').should('be.visible');
        // ...but none of the edit affordances leak onto this screen.
        cy.contains('button', 'Save attachments').should('not.exist');
        cy.get('[aria-label="Add Image"]').should('not.exist');
        cy.get('[aria-label="Add File"]').should('not.exist');
      });
    });
  });

  it('non-creator user with update permission AND organization membership can add + delete attachments (bug2 positive)', () => {
    cy.task<any[]>('db:populateResource', 1).then(([resource]) => {
      cy.task<string>('db:createSessionUserWithPermission', {
        entityName: 'resource',
        flags: { read: true, update: true },
        label: 'attach_org_member',
      }).then((email) => {
        // The resource edit form also loads the Organization field's
        // autocomplete (searchAssociatedOrganizationOptions -> assertPermission
        // 'organization' 'read'), an independent RBAC requirement of the FORM
        // itself, unrelated to the attachment bridge's own authorization
        // (bugs 1/2/3) — grant it so it isn't the thing gating page access.
        cy.task('db:grantAdditionalEntityPermission', { email, entityName: 'organization', flags: { read: true } });
        cy.task('db:addUserToOrganizationByEmail', { email, organizationId: resource.organization_id }).then(() => {
          loginAs(email);
          cy.visit(`/en/resource/edit/${resource.id}`);
          // Reached the real edit page (not a 404) — RBAC + org membership both satisfied.
          cy.contains('button', 'Save attachments').should('be.visible');

          addAttachmentViaDialog('Add Image', pngFile('verify-resource-nonowner.png'));
          cy.contains('button', 'Save attachments').click();
          cy.contains('Saved').should('be.visible');

          cy.task<any[]>('db:getAttachableAttachments', { attachableId: resource.attachable_id }).then((rows) => {
            expect(rows.map((r) => r.name)).to.include('verify-resource-nonowner.png');
            const added = rows.find((r) => r.name === 'verify-resource-nonowner.png');

            // Delete it back out via the UI and confirm the deletion persists too.
            cy.reload();
            cy.contains('verify-resource-nonowner.png')
              .parents('li')
              .first()
              .find('[aria-label="delete"]')
              .click();
            cy.contains('button', 'Save attachments').click();
            cy.contains('Saved').should('be.visible');

            cy.task<any[]>('db:getAttachableAttachments', { attachableId: resource.attachable_id }).then((after) => {
              expect(after.map((r) => r.id)).not.to.include(added.id);
            });
          });
        });
      });
    });
  });

  it('non-creator user with update permission but NOT an organization member cannot reach the edit page (bug2 org-scope negative)', () => {
    cy.task<any[]>('db:populateResource', 1).then(([resource]) => {
      cy.task<string>('db:createSessionUserWithPermission', {
        entityName: 'resource',
        flags: { read: true, update: true },
        label: 'attach_non_member',
      }).then((email) => {
        // Grant 'organization' read too (see the positive-case test above for
        // why) so the ONLY thing gating page access in this negative case is
        // the org-membership dimension actually under test — not an unrelated
        // missing RBAC permission on the Organization autocomplete field.
        cy.task('db:grantAdditionalEntityPermission', { email, entityName: 'organization', flags: { read: true } });
        // Deliberately skip db:addUserToOrganizationByEmail — this user has
        // the RBAC flag but is not enrolled in the resource's organization.
        loginAs(email);
        cy.visit(`/en/resource/edit/${resource.id}`, { failOnStatusCode: false });
        // getResourceDetail's org-membership filter makes the row invisible
        // to this user regardless of their RBAC update flag -> notFound()
        // (this app's custom not-found page reads "404 - Page Not Found").
        cy.contains(/page not found/i).should('be.visible');
        cy.contains('button', 'Save attachments').should('not.exist');
      });
    });
  });
});

describe('UI: product attachments — view/edit boundary, save persistence, permission (cmd_421)', () => {
  beforeEach(() => {
    cy.task('db:reset');
    cy.task('db:seed');
    cy.task('db:grantAllPermissions');
  });

  // product has no organization_id (confirmed via
  // code_generator/json_schema.yaml definitions.product — no org-scope
  // dimension for this entity) and its FormView/FormUpsert pass neither
  // showImages nor showFiles (both default true), so this entity's coverage
  // exercises BOTH image and file attachments.

  it('creator uploads image+file on Edit, saves, reload persists them (bug1); Edit shows full upload/save UI (bug3 control)', () => {
    cy.task<any[]>('db:populateProduct', 1).then(([product]) => {
      loginAs(TEST_CREDENTIALS.email);
      cy.visit(`/en/product/edit/${product.id}`);

      addAttachmentViaDialog('Add Image', pngFile('verify-product-image.png'));
      cy.contains('verify-product-image.png').should('be.visible');
      addAttachmentViaDialog('Add File', pdfFile('verify-product-file.pdf'));
      cy.contains('verify-product-file.pdf').should('be.visible');

      cy.contains('button', 'Save attachments').click();
      cy.contains('Saved').should('be.visible');

      cy.reload();
      cy.contains('verify-product-image.png').should('be.visible');
      cy.contains('verify-product-file.pdf').should('be.visible');
      cy.contains('button', 'Save attachments').should('be.visible');
      cy.get('[aria-label="Add Image"]').should('exist');
      cy.get('[aria-label="Add File"]').should('exist');

      cy.task<any[]>('db:getAttachableAttachments', { attachableId: product.attachable_id }).then((rows) => {
        expect(rows.map((r) => r.name)).to.include.members(['verify-product-image.png', 'verify-product-file.pdf']);
      });
    });
  });

  it('View page shows an existing attachment read-only: no upload/save UI (bug3)', () => {
    cy.task<any[]>('db:populateProduct', 1).then(([product]) => {
      cy.task<any>('db:seedAttachment', {
        attachableId: product.attachable_id,
        type: TYPE_FILE,
        name: 'preexisting-product-file.pdf',
        path: '/uploads/preexisting-product-file.pdf',
      }).then(() => {
        loginAs(TEST_CREDENTIALS.email);
        cy.visit(`/en/product/view/${product.id}`);

        cy.contains('preexisting-product-file.pdf').should('be.visible');
        cy.contains('button', 'Save attachments').should('not.exist');
        cy.get('[aria-label="Add Image"]').should('not.exist');
        cy.get('[aria-label="Add File"]').should('not.exist');
      });
    });
  });

  it('non-creator user with update permission can add + delete attachments (bug2, no org dimension for product)', () => {
    cy.task<any[]>('db:populateProduct', 1).then(([product]) => {
      cy.task<string>('db:createSessionUserWithPermission', {
        entityName: 'product',
        flags: { read: true, update: true },
        label: 'attach_nonowner',
      }).then((email) => {
        loginAs(email);
        cy.visit(`/en/product/edit/${product.id}`);
        cy.contains('button', 'Save attachments').should('be.visible');

        addAttachmentViaDialog('Add File', pdfFile('verify-product-nonowner.pdf'));
        cy.contains('button', 'Save attachments').click();
        cy.contains('Saved').should('be.visible');

        cy.task<any[]>('db:getAttachableAttachments', { attachableId: product.attachable_id }).then((rows) => {
          expect(rows.map((r) => r.name)).to.include('verify-product-nonowner.pdf');
          const added = rows.find((r) => r.name === 'verify-product-nonowner.pdf');

          cy.reload();
          cy.contains('verify-product-nonowner.pdf')
            .parents('li')
            .first()
            .find('[aria-label="delete"]')
            .click();
          cy.contains('button', 'Save attachments').click();
          cy.contains('Saved').should('be.visible');

          cy.task<any[]>('db:getAttachableAttachments', { attachableId: product.attachable_id }).then((after) => {
            expect(after.map((r) => r.id)).not.to.include(added.id);
          });
        });
      });
    });
  });
});
