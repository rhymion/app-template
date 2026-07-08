import { prisma } from '../db-helpers';
import { TEST_CREDENTIALS } from '../test-credentials';

async function getTestUser() {
  const testUser = await prisma.user.findUnique({
    where: { email: TEST_CREDENTIALS.email },
  });
  if (!testUser) throw new Error('Test user not found. Make sure db:seed has run first.');
  return testUser;
}

/**
 * Create an approval_flow for receiving_receipt_line's terminal-reject path
 * (B-5 Phase2c D7 tests: 13.5_equiv/13.6_equiv/14.4a_equiv), plus an approver
 * user/role to exercise the reject action.
 */
export async function setupReceivingReceiptLineApprovalFlow() {
  const { hashPassword } = require('../test-credentials');
  const testUser = await getTestUser();
  const hashedPw = await hashPassword('test-password');

  const approverRole = await prisma.role.create({
    data: { name: `Test Receiving Receipt Line Approver Role ${Date.now()}`, creator_id: testUser.id, updater_id: testUser.id },
  });
  const approverUser = await prisma.user.create({
    data: {
      name: 'Test Receiving Receipt Line Approver User',
      email: `test-receiving_receipt_line-approver-${Date.now()}@example.com`,
      password: hashedPw,
      creator_id: testUser.id,
      updater_id: testUser.id,
      roles: { connect: [{ id: approverRole.id }] },
    },
  });
  const flow = await prisma.approval_flow.create({
    data: {
      entity_name: 'receiving_receipt_line',
      requestor_role_id: null,
      approver_role_id: approverRole.id,
      creator_id: testUser.id,
      updater_id: testUser.id,
    },
  });

  return JSON.parse(JSON.stringify({ approverRole, approverUser, flow }));
}

/**
 * Directly seed a receiving_receipt + receiving_receipt_line (status=pending)
 * with a pending approval_request tied to its approvable_id — mirroring the
 * populate{{Entity}}WithApproval pattern used by generated approval-flow
 * helpers (e.g. leave_request), since receiving_receipt_line has no
 * standalone create API (it's only created as a receiving_receipt child, and
 * that path doesn't accept approvable_id).
 */
export async function populateReceivingReceiptLineWithApproval(
  creatorId: string,
  approvalFlowIds: string[],
  opts?: { inventoryId?: string | null },
) {
  const testUser = await getTestUser();
  const attachable = await prisma.attachable.create({ data: {} });
  const product = await prisma.product.create({
    data: {
      attachable_id: attachable.id,
      code: `RRL-PROD-${Date.now()}`,
      name: 'Receiving Receipt Line Test Product',
      price: 50,
      creator_id: testUser.id,
      updater_id: testUser.id,
    },
  });

  const receipt = await prisma.receiving_receipt.create({
    data: {
      receipt_no: `RRL-${Date.now()}`,
      status: 0,
      creator_id: creatorId,
      updater_id: creatorId,
    },
  });

  const approvableItem = await prisma.approvable.create({ data: {} });
  const line = await prisma.receiving_receipt_line.create({
    data: {
      receiving_receipt_id: receipt.id,
      product_id: product.id,
      receipt_quantity: 5,
      status: 0,
      inventory_id: opts?.inventoryId ?? null,
      approvable_id: approvableItem.id,
    },
  });

  const approvalRequests = [];
  for (const flowId of approvalFlowIds) {
    const ar = await prisma.approval_request.create({
      data: { approvable_id: approvableItem.id, approval_flow_id: flowId, status: 0 },
    });
    approvalRequests.push(ar);
  }

  return JSON.parse(JSON.stringify({ receipt, line, product, approvalRequests }));
}
