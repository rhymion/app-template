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
 * inventory.location_id is a required FK (cmd_562 id-FK migration) with no
 * default — every inventory.create() call needs one. Find-or-create by name
 * (same pattern as seedSecondInventoryLot below and the generated
 * populatePurchaseOrderDependencies helper) so repeated calls within a test
 * run reuse one row instead of piling up duplicates.
 */
async function getOrCreateDefaultLocation(testUser: { id: string }) {
  let locationRecord = await prisma.location.findFirst({
    where: { name: 'Reservation Test Location' },
    orderBy: { created_at: 'asc' },
  });
  if (!locationRecord) {
    locationRecord = await prisma.location.create({
      data: {
        name: 'Reservation Test Location',
        creator_id: testUser.id,
        updater_id: testUser.id,
      },
    });
  }
  return locationRecord;
}

/**
 * Seed a product + inventory row with a specific quantity, plus a customer.
 * Returns { product, inventory, customer } for use in reservation Cypress tests.
 */
export async function seedReservationInventory(quantity: number) {
  const testUser = await getTestUser();

  let productRecord = await prisma.product.findFirst({
    where: { name: 'Reservation Test Product' },
    orderBy: { created_at: 'asc' },
  });
  if (!productRecord) {
    const attachable = await prisma.attachable.create({ data: {} });
    productRecord = await prisma.product.create({
      data: {
        attachable_id: attachable.id,
        code: 'RES-PROD-001',
        name: 'Reservation Test Product',
        price: 100,
        creator_id: testUser.id,
        updater_id: testUser.id,
      },
    });
  }

  const locationRecord = await getOrCreateDefaultLocation(testUser);

  // Always create a fresh inventory row with the requested quantity
  const inventoryRecord = await prisma.inventory.create({
    data: {
      product_id: productRecord.id,
      quantity,
      reserved_quantity: 0,
      location_id: locationRecord.id,
      creator_id: testUser.id,
      updater_id: testUser.id,
    },
  });

  let customerRecord = await prisma.user.findFirst({
    where: { name: 'Reservation Test Customer' },
    orderBy: { created_at: 'asc' },
  });
  if (!customerRecord) {
    customerRecord = await prisma.user.create({
      data: {
        name: 'Reservation Test Customer',
        email: `res-customer-${Date.now()}@example.com`,
        password: 'test-password',
        creator_id: testUser.id,
        updater_id: testUser.id,
      },
    });
  }

  return JSON.parse(JSON.stringify({
    product: productRecord,
    inventory: inventoryRecord,
    customer: customerRecord,
  }));
}

/**
 * Directly set an inventory row's on-hand quantity (bypassing reserve/cancel
 * netting) to simulate physical stock changes outside the reservation flow.
 */
export async function setInventoryQuantity(inventory_id: string, quantity: number) {
  return await prisma.inventory.update({
    where: { id: inventory_id },
    data: { quantity },
  });
}

/**
 * Seed a second, DISTINCT product + its own inventory lot (item3: cross-
 * product reservation/receive guard tests need two genuinely different
 * products, unlike seedSecondInventoryLot which is a second lot of the SAME
 * product).
 */
export async function seedSecondProduct(quantity: number) {
  const testUser = await getTestUser();

  const attachable = await prisma.attachable.create({ data: {} });
  const productRecord = await prisma.product.create({
    data: {
      attachable_id: attachable.id,
      code: `RES-PROD-B-${Date.now()}`,
      name: 'Reservation Test Product B',
      price: 200,
      creator_id: testUser.id,
      updater_id: testUser.id,
    },
  });

  const locationRecord = await getOrCreateDefaultLocation(testUser);

  const inventoryRecord = await prisma.inventory.create({
    data: {
      product_id: productRecord.id,
      quantity,
      reserved_quantity: 0,
      location_id: locationRecord.id,
      creator_id: testUser.id,
      updater_id: testUser.id,
    },
  });

  return JSON.parse(JSON.stringify({
    product: productRecord,
    inventory: inventoryRecord,
  }));
}

/**
 * Seed a second inventory lot (same product, distinct location) with a given
 * quantity, for tests that need a re-reservation to spill across two lots.
 */
export async function seedSecondInventoryLot(product_id: string, quantity: number, location: string) {
  const testUser = await getTestUser();

  // Phase4: inventory.location_id FK — resolve the location name to a
  // location_id via find-or-create (same pattern as populate*Dependencies helpers).
  let locationRecord = await prisma.location.findFirst({
    where: { name: location },
    orderBy: { created_at: 'asc' },
  });
  if (!locationRecord) {
    locationRecord = await prisma.location.create({
      data: {
        name: location,
        creator_id: testUser.id,
        updater_id: testUser.id,
      },
    });
  }

  const inventoryRecord = await prisma.inventory.create({
    data: {
      product_id,
      quantity,
      reserved_quantity: 0,
      location_id: locationRecord.id,
      creator_id: testUser.id,
      updater_id: testUser.id,
    },
  });

  return JSON.parse(JSON.stringify(inventoryRecord));
}

/**
 * Reconstruct the reservation for a given purchase_order_id from the
 * inventory_transaction ledger (B-5 Phase2: inventory_allocation was removed —
 * O-2/O-6/O-8. See afterReject/afterApprove for the same netting pattern).
 *
 * Returns a shape compatible with the old inventory_allocation row
 * ({ quantity, inventory_id }) for the single-lot reservations exercised by
 * these tests; `quantity` is the net outstanding reserved amount summed
 * across all lots (O-8), and `inventory_id` identifies the first active lot.
 */
export async function getInventoryAllocation(purchase_order_id: string) {
  const item = await prisma.purchase_per_item.findFirst({
    where: { purchase_order_id, inventory_transactionable_id: { not: null } },
  });
  if (!item?.inventory_transactionable_id) return null;

  const txs = await prisma.inventory_transaction.findMany({
    where: { inventory_transactionable_id: item.inventory_transactionable_id },
  });
  if (txs.length === 0) return null;

  // Net reserved_delta per inventory identity (O-6 denormalized fields; O-8 multi-lot).
  type NetEntry = {
    product_id: string;
    location_id: string | null;
    lot_number: string | null;
    expiration_date: Date | null;
    net: number;
  };
  const netByInv = new Map<string, NetEntry>();
  for (const t of txs) {
    const key = `${t.product_id}|${t.location_id ?? ''}|${t.lot_number ?? ''}|${t.expiration_date?.toISOString() ?? ''}`;
    const existing = netByInv.get(key) ?? {
      product_id: t.product_id,
      location_id: t.location_id,
      lot_number: t.lot_number,
      expiration_date: t.expiration_date,
      net: 0,
    };
    existing.net += t.reserved_delta;
    netByInv.set(key, existing);
  }

  const active = [...netByInv.values()].filter((r) => r.net > 0);
  if (active.length === 0) return null;

  const quantity = active.reduce((sum, r) => sum + r.net, 0);
  const first = active[0];
  // cmd_562: location_id is an id-FK on both pool and ledger — re-identify
  // the inventory cache row directly, no reverse name lookup needed.
  const inventoryCache = await prisma.inventory.findFirst({
    where: {
      product_id: first.product_id,
      location_id: first.location_id,
      lot_number: first.lot_number,
      expiration_date: first.expiration_date,
    },
  });

  return JSON.parse(JSON.stringify({
    quantity,
    inventory_id: inventoryCache?.id ?? null,
    inventory_transactionable_id: item.inventory_transactionable_id,
  }));
}

/**
 * Single-role approval_flow + approver user, for the hand-written API-level
 * approval specs (approve/reject/dispatch/reservation). Renamed from
 * setupPurchasePerItemApprovalFlow to avoid colliding with the generated
 * (multi-flow) helper of that name under the same cy.task key — the
 * collision made this narrow one shadow the generated one everywhere,
 * including the generated UI spec (cmd_322 RC5).
 */
export async function setupPurchasePerItemSingleApprovalFlow() {
  const { hashPassword } = require('../test-credentials');
  const testUser = await getTestUser();
  const hashedPw = await hashPassword('test-password');

  const approverRole = await prisma.role.create({
    data: { name: `Test Purchase Per Item Approver Role ${Date.now()}`, creator_id: testUser.id, updater_id: testUser.id },
  });
  const approverUser = await prisma.user.create({
    data: {
      name: 'Test Purchase Per Item Approver User',
      email: `test-purchase_per_item-approver-${Date.now()}@example.com`,
      password: hashedPw,
      creator_id: testUser.id,
      updater_id: testUser.id,
      roles: { connect: [{ id: approverRole.id }] },
    },
  });
  // requestor_role_id: null so any creator (e.g. the default TEST_API_KEY user)
  // satisfies the flow's requestor gate in purchase_order/service.ts.
  const flow = await prisma.approval_flow.create({
    data: {
      entity_name: 'purchase_per_item',
      requestor_role_id: null,
      approver_role_id: approverRole.id,
      creator_id: testUser.id,
      updater_id: testUser.id,
    },
  });

  return JSON.parse(JSON.stringify({ approverRole, approverUser, flow }));
}

/**
 * Retrieve the purchase_per_item row(s) for a given purchase_order_id,
 * including the fields needed to locate its approvable/approval_request and
 * inventory_transaction ledger (approvable_id, inventory_transactionable_id).
 */
export async function getPurchasePerItemsForOrder(purchase_order_id: string) {
  const items = await prisma.purchase_per_item.findMany({
    where: { purchase_order_id },
  });
  return JSON.parse(JSON.stringify(items));
}

/**
 * Fetch a single purchase_per_item row by id (cmd_305 FIX-B follow-up,
 * split/reject-reservation permanent spec coverage).
 */
export async function getPurchasePerItemById(id: string) {
  const item = await prisma.purchase_per_item.findUnique({ where: { id } });
  return JSON.parse(JSON.stringify(item));
}

/**
 * List purchase_per_item rows whose parent_id points at `parentId`
 * (split children), ordered by creation time.
 */
export async function getPurchasePerItemChildren(parentId: string) {
  const children = await prisma.purchase_per_item.findMany({
    where: { parent_id: parentId },
    orderBy: { created_at: 'asc' },
  });
  return JSON.parse(JSON.stringify(children));
}
