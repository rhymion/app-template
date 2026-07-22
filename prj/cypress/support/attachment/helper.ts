// Hand-written (not generator output — analogous to
// cypress/support/purchase_order/reservation_helper.ts and
// cypress/support/receiving_receipt/notification_helper.ts). Supports the
// resource/product attachment view/edit-boundary + permission + org-scope
// regression spec (cmd_421 Batch4 / subtask_421f).
import { prisma, createSessionUserWithPermission } from '../db-helpers';
import { decryptFileName } from '../../../lib/compliance/attachment_name_crypto';

/**
 * Enrolls an already-created session user (by email) into an organization,
 * so a permission-holding non-creator user can also satisfy resource's
 * organization-membership read/edit scope (lib/resource/getters.ts
 * buildResourceAccessWhere / getResourceDetail — org_id membership is
 * required unconditionally, independent of RBAC read/update flags).
 */
export async function addUserToOrganizationByEmail(email: string, organizationId: string): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  await prisma.organization.update({
    where: { id: organizationId },
    data: { users: { connect: [{ id: user.id }] } },
  });
}

/**
 * DB-truth read of an attachable's persisted attachments, for post-UI-action
 * assertions. `name` is a random UUID at rest (P2-5 filename-at-rest
 * encryption, lib/compliance/attachment_name_crypto.ts) — decrypt back to
 * the original filename here, mirroring lib/resource/getters.ts's
 * getResourceDetail / lib/product/getters.ts's getProductDetail, so callers
 * can assert on the same display name the UI shows instead of a raw UUID.
 */
export async function getAttachableAttachments(attachableId: string) {
  const rows = await prisma.attachment.findMany({
    where: { attachable_id: attachableId },
    orderBy: { order: 'asc' },
  });
  const withDisplayName = rows.map((row) => {
    let displayName = row.name;
    if (row.encrypted_original_name) {
      try {
        displayName = decryptFileName(row.encrypted_original_name);
      } catch {
        // leave displayName as the raw stored value (matches getters.ts fallback)
      }
    }
    return { ...row, name: displayName };
  });
  return JSON.parse(JSON.stringify(withDisplayName));
}

/**
 * Seeds an attachment row directly (bypassing the upload UI), for the
 * View-screen read-only-display assertion — that test cares whether the
 * View page renders an EXISTING attachment without edit affordances, not
 * whether upload itself works (that's the Edit-screen persistence spec).
 */
export async function seedAttachment(params: {
  attachableId: string;
  type: number;
  name: string;
  path: string;
  order?: number;
}) {
  const row = await prisma.attachment.create({
    data: {
      attachable_id: params.attachableId,
      type: params.type,
      name: params.name,
      path: params.path,
      order: params.order ?? 0,
    },
  });
  return JSON.parse(JSON.stringify(row));
}

/**
 * Grants an additional entity's RBAC flags to a user already created via
 * createSessionUserWithPermission, by adding a second permission row to
 * their existing custom role. Needed because /resource/edit/:id also loads
 * `searchAssociatedOrganizationOptions` for the Organization field's
 * autocomplete (assertPermission('organization', 'read', ...) — a real,
 * independent RBAC requirement of the resource edit FORM, unrelated to the
 * attachment bridge's own authorization bugs 1/2/3), so a user who only
 * holds resource:update 500s on that page with "Access denied:
 * organization.read" before ever reaching AttachmentSection.
 */
export async function grantAdditionalEntityPermission(
  email: string,
  entityName: string,
  flags: { create?: boolean; read?: boolean; update?: boolean; delete?: boolean; import?: boolean },
): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email },
    include: { roles: true },
  });
  const role = user.roles[0];
  if (!role) throw new Error(`User ${email} has no role to attach an additional permission to`);
  await prisma.permission.create({
    data: {
      name: entityName,
      role_id: role.id,
      create: flags.create ?? false,
      read: flags.read ?? false,
      update: flags.update ?? false,
      delete: flags.delete ?? false,
      import: flags.import ?? false,
      creator_id: user.id,
      updater_id: user.id,
    },
  });
}

export { createSessionUserWithPermission };
