// GENERATED ONCE — safe to edit (will not be overwritten on regeneration)
//
// x-payment: how many units of the room's Stripe Price a room_reservation is
// charged for -- one unit per night.
//
// Nights are counted between UTC calendar dates, not elapsed hours. The date
// picker stores UTC midnight, but a REST call may carry any time of day, and
// an elapsed-24h count would then disagree with the calendar (22:00Z to 02:00Z
// two days later is 28 hours, i.e. one "day", though it spans two nights).
// A stay that is not at least one night long is charged as one night.
//
// Called on the server only, after the record's own create transaction has
// committed, with the just-created row -- never with a client-submitted value.

import type { room_reservation } from '@/app/generated/prisma/client';

const MS_PER_DAY = 86_400_000;

function utcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export async function resolveRoomReservationQuantity(record: room_reservation): Promise<number> {
  const nights = Math.round((utcDay(record.check_out) - utcDay(record.check_in)) / MS_PER_DAY);
  return Math.max(1, nights);
}
