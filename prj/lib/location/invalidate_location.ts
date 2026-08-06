'use server';

import prisma from '@/lib/prisma';

export async function doInvalidateLocation(id: string): Promise<void> {
  await prisma.location.update({ where: { id }, data: { invalidated_at: new Date() } });
}
