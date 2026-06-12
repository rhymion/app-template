import prisma from '@/lib/prisma';

export async function resolveVirtualColumns(
  rows: ReadonlyArray<Record<string, unknown>>
): Promise<Map<string, Record<string, string>>> {
  if (!rows.length) return new Map();

  // Map each row id → creator_id (creator_id is a direct column, always present in rowsRaw)
  const rowCreatorMap = new Map<string, string>();
  for (const r of rows) {
    const rowId = String(r['id'] ?? '');
    const creatorId = r['creator_id'] != null ? String(r['creator_id']) : '';
    if (rowId) rowCreatorMap.set(rowId, creatorId);
  }

  const uniqueCreatorIds = [...new Set([...rowCreatorMap.values()].filter(Boolean))];
  const users = uniqueCreatorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: uniqueCreatorIds } },
        select: { id: true, name: true },
      })
    : [];

  const userNameMap = new Map(users.map(u => [u.id, u.name ?? '']));

  return new Map(
    rows.map(r => {
      const rowId = String(r['id'] ?? '');
      const creatorId = rowCreatorMap.get(rowId) ?? '';
      return [rowId, { created_by: creatorId ? (userNameMap.get(creatorId) ?? '') : '' }];
    })
  );
}
