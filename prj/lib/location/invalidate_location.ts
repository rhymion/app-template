'use server';

// cmd_564/cmd_569: generic invalidate mechanism wiring for `location`.
// Hand-written (not generated) — the generator only imports and calls this
// via the x-generate.invalidate.module/handler config on the location entity.
// See docs/knowledge/appendix/cmd564-location-invalidate-consumer-patch.md.

import prisma from '@/lib/prisma';

export async function doInvalidateLocation(id: string): Promise<void> {
  await prisma.location.update({ where: { id }, data: { invalidated_at: new Date() } });
}
