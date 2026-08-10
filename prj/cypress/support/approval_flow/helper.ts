// Hand-written (not generator-produced) — cmd_636.
//
// approval_flow was switched to x-generate.test: false (see
// prj/code_generator/json_schema.yaml) because approval_flow.preceded_by /
// followed_by candidate narrowing is bespoke business logic the generator's
// declarative CRUD spec has no way to fully exercise (see
// cypress/e2e/approval_flow_same_entity_autocomplete_filter.cy.ts's header
// for that rationale). Turning test:false off also drops this file, the
// desktop/mobile/api cy.ts specs, and their cy.task registrations from
// generation entirely (code_generator/generate.py gates all of it on a
// single `test` flag) — so this file, cypress/e2e/approval_flow.cy.ts,
// cypress/e2e/mobile/approval_flow.cy.ts, cypress/e2e/api/approval_flow.cy.ts,
// and their task registrations in project-tasks.ts are now all hand-written,
// preserving equivalent coverage rather than silently losing it.
//
// cmd_636 fix: precededByRecord now uses a dedicated approverRole3 (not
// approverRole or approverRoleAlias) so it doesn't share (entity_name,
// approver_role_id) with any other row these specs create at entity_name
// 'user': the desktop spec's own 2.1/2.2 create (approverRole) and the API
// spec's 3.1/8.1/8.2 POST bodies (approverRoleAlias, aka `role`). This
// project's schema has @@unique([entity_name, approver_role_id]) (absent
// from the app-generator default schema; added by cmd_613's migration
// 20260723024027_approval_flow_unique), so any of those collisions silently
// fails the create. Verified empirically: reproduced the 2.1/2.2 failure
// against the pre-fix generated spec, then dropped the unique index in
// isolation and re-ran the same spec unchanged to confirm the constraint was
// the sole cause (see report for detail); the approverRoleAlias collision
// with the API spec (3.1/8.1/8.2) was caught the same way, by running all
// four specs together after the first fix and observing those three fail.
import { prisma } from '../db-helpers';
import { TEST_CREDENTIALS } from '../test-credentials';

async function getTestUser() {
  const testUser = await prisma.user.findUnique({
    where: { email: TEST_CREDENTIALS.email },
  });
  if (!testUser) throw new Error('Test user not found. Make sure db:seed has run first.');
  return testUser;
}

// cmd_620 (Option β, full isolation): monotonic per-call index shared by
// populateApprovalFlowData and populateApprovalFlowFullData. Persists for the life
// of the Cypress plugin (Node) process, so it stays unique across every call
// either function receives during a run — including repeat calls within the
// same test/DB session, which is exactly the case find-or-create used to
// (silently) collapse into a shared row.
let _ApprovalFlowCallSeq = 0;
export function _resetApprovalFlowCallSeq(): void {
  _ApprovalFlowCallSeq = 0;
}
async function _createApprovalFlowBaseDeps() {
  const testUser = await getTestUser();
  // Idempotent: re-use an existing row when the helper is called more than
  // once in a single test (e.g. parent populator + child populator).
  let requestorRoleRecord = await prisma.role.findFirst({
    where: { name: 'Test Requestor Role A' },
    orderBy: { created_at: 'asc' },
  });
  if (!requestorRoleRecord) {
    requestorRoleRecord = await prisma.role.create({
      data: {
        name: 'Test Requestor Role A',
        creator_id: testUser.id,
        updater_id: testUser.id,
        users: {
          connect: [testUser.id].map((id) => ({ id })),
        },
      },
    });
  }
  const requestorRole = requestorRoleRecord;
  // Idempotent: re-use an existing row when the helper is called more than
  // once in a single test (e.g. parent populator + child populator).
  let approverRoleRecord = await prisma.role.findFirst({
    where: { name: 'Test Approver Role A' },
    orderBy: { created_at: 'asc' },
  });
  if (!approverRoleRecord) {
    approverRoleRecord = await prisma.role.create({
      data: {
        name: 'Test Approver Role A',
        creator_id: testUser.id,
        updater_id: testUser.id,
        users: {
          connect: [testUser.id].map((id) => ({ id })),
        },
      },
    });
  }
  const approverRole = approverRoleRecord;
  let approverRole2Record = await prisma.role.findFirst({
    where: { name: 'Test Approver Role B' },
    orderBy: { created_at: 'asc' },
  });
  if (!approverRole2Record) {
    approverRole2Record = await prisma.role.create({
      data: {
        name: 'Test Approver Role B',
        creator_id: testUser.id,
        updater_id: testUser.id,
      },
    });
  }
  const approverRole2 = approverRole2Record;
  // Idempotent: re-use an existing row when the helper is called more than
  // once in a single test (e.g. parent populator + child populator).
  let approverRoleAliasRecord = await prisma.role.findFirst({
    where: { name: 'Test Approver Role Alias A' },
    orderBy: { created_at: 'asc' },
  });
  if (!approverRoleAliasRecord) {
    approverRoleAliasRecord = await prisma.role.create({
      data: {
        name: 'Test Approver Role Alias A',
        creator_id: testUser.id,
        updater_id: testUser.id,
        users: {
          connect: [testUser.id].map((id) => ({ id })),
        },
      },
    });
  }
  const approverRoleAlias = approverRoleAliasRecord;
  // cmd_636: dedicated role for the precededBy fixture row (see
  // populateApprovalFlowDependencies below) — approverRole is used by the
  // desktop spec's own create/edit test records and approverRoleAlias
  // (aka `role`) is used by the API spec's own POST bodies, both with
  // entity_name 'user'; reusing either here would collide with those under
  // this project's @@unique([entity_name, approver_role_id]).
  let approverRole3Record = await prisma.role.findFirst({
    where: { name: 'Test Approver Role C' },
    orderBy: { created_at: 'asc' },
  });
  if (!approverRole3Record) {
    approverRole3Record = await prisma.role.create({
      data: {
        name: 'Test Approver Role C',
        creator_id: testUser.id,
        updater_id: testUser.id,
      },
    });
  }
  const approverRole3 = approverRole3Record;
  return JSON.parse(JSON.stringify({ requestorRole, approverRole, approverRole2, approverRoleAlias, approverRole3, role: approverRoleAlias }));
}

export async function populateApprovalFlowDependencies() {
  const baseDeps = await _createApprovalFlowBaseDeps();
  const testUser = await getTestUser();
  // Idempotent: re-use an existing row when the helper is called more than
  // once in a single test (e.g. multiple it() blocks each calling
  // populateApprovalFlowDependencies()) — without this, a self-ref decoy
  // record with no distinguishing field issues a fresh create() every call
  // and trips any @@unique its own required fields participate in (cmd_592).
  let precededByRecord = await prisma.approval_flow.findFirst({
    where: { entity_name: 'user', approver_role_id: baseDeps.approverRole3.id },
    orderBy: { created_at: 'asc' },
  });
  if (!precededByRecord) {
    precededByRecord = await prisma.approval_flow.create({
      data: {
        entity_name: 'user',
        approver_role_id: baseDeps.approverRole3.id,
        creator_id: testUser.id,
        updater_id: testUser.id,
      },
    });
  }
  const precededBy = { ...precededByRecord, name: (precededByRecord.entity_name ?? '') };
  // Idempotent: re-use an existing row when the helper is called more than
  // once in a single test (e.g. multiple it() blocks each calling
  // populateApprovalFlowDependencies()) — without this, a self-ref decoy
  // record with no distinguishing field issues a fresh create() every call
  // and trips any @@unique its own required fields participate in (cmd_592).
  let followedByRecord = await prisma.approval_flow.findFirst({
    where: { entity_name: 'user', approver_role_id: baseDeps.approverRole2.id },
    orderBy: { created_at: 'asc' },
  });
  if (!followedByRecord) {
    followedByRecord = await prisma.approval_flow.create({
      data: {
        entity_name: 'user',
        approver_role_id: baseDeps.approverRole2.id,
        creator_id: testUser.id,
        updater_id: testUser.id,
      },
    });
  }
  const followedBy = { ...followedByRecord, name: (followedByRecord.entity_name ?? '') };
  return JSON.parse(JSON.stringify({ ...baseDeps, precededBy, followedBy }));
}

export async function populateApprovalFlowData(length: number) {
  const testUser = await getTestUser();
  // cmd_620 (Option β, full isolation): each populateApprovalFlowData/FullData
  // call gets its own slice of the primary FK dep's namespace (callIndex), so
  // two calls in the same test — or a hand-written spec calling this helper
  // more than once — never resolve to the same underlying row.
  const callIndex = _ApprovalFlowCallSeq++;
  const records = [];
  for (let i = 1; i <= length; i++) {
    // (cmd_620 Option β): always a fresh row, no find-or-create — see
    // populateApprovalFlowDependencies' idempotency hook for the *shared*,
    // non-loop dep rows this doesn't apply to.
    const approverRoleItem = await prisma.role.create({
      data: {
        name: `Test Approver Role ${callIndex}_${i}`,
        creator_id: testUser.id,
        updater_id: testUser.id,
      },
    });
    const record = await prisma.approval_flow.create({
      data: {
        entity_name: 'user',
        approver_role_id: approverRoleItem.id,
        creator_id: testUser.id,
        updater_id: testUser.id,
      },
    });
    records.push(record);
  }
  // Serialize Dates to ISO strings so Cypress cy.task can JSON-transfer results
  return JSON.parse(JSON.stringify(records));
}


export async function populateApprovalFlowFullData(length: number) {
  const testUser = await getTestUser();
  const deps = await populateApprovalFlowDependencies();
  // cmd_620 (Option β) — see populateApprovalFlowData for the rationale. Shares
  // the same counter as populateApprovalFlowData so the two functions can never
  // hand out the same callIndex to a caller within one test.
  const callIndex = _ApprovalFlowCallSeq++;
  const records = [];
  for (let i = 1; i <= length; i++) {
    // (cmd_620 Option β): always a fresh row — see populateApprovalFlowData for the rationale.
    const approverRoleItem = await prisma.role.create({
      data: {
        name: `Test Approver Role ${callIndex}_${i}`,
        creator_id: testUser.id,
        updater_id: testUser.id,
      },
    });
    const record = await prisma.approval_flow.create({
      data: {
        entity_name: 'user',
        requestor_role_id: deps.requestorRole.id,
        approver_role_id: approverRoleItem.id,
        creator_id: testUser.id,
        updater_id: testUser.id,
      },
    });
    records.push(record);
  }
  // Serialize Dates to ISO strings so Cypress cy.task can JSON-transfer results
  return JSON.parse(JSON.stringify(records));
}
