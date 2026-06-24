import { useState, useEffect } from 'react';
import { checkBookingOverlap } from '@/lib/booking/service_validation';
import type { Dayjs } from 'dayjs';

const REQUIRED_FIELDS = [
  { key: 'name', label: 'Name' },
  { key: 'resource_id', label: 'Resource' },
  { key: 'start_time', label: 'Start Time' },
  { key: 'end_time', label: 'End Time' },
] as const;

function isMissingValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (typeof value === 'boolean') return false;
  if (typeof value === 'number') return Number.isNaN(value);
  if (value instanceof Date) return Number.isNaN(value.getTime());
  if (typeof value === 'object' && value !== null && 'isValid' in value) {
    const maybeDayjs = value as { isValid?: () => boolean };
    if (typeof maybeDayjs.isValid === 'function') {
      return !maybeDayjs.isValid();
    }
  }
  return false;
}

export function validateForm(values: Record<string, unknown>): string | null {
  for (const field of REQUIRED_FIELDS) {
    if (isMissingValue(values[field.key])) {
      return `${field.label} is required`;
    }
  }
  const { start_time, end_time } = values as { start_time: Dayjs | null; end_time: Dayjs | null };
  if (start_time && end_time && (start_time.isAfter(end_time) || start_time.isSame(end_time))) {
    return 'Start time must be before end time';
  }
  return null;
}

export function useBookingOverlapValidation(values: Record<string, unknown>): string | null {
  const [error, setError] = useState<string | null>(null);
  const { resource_id, start_time, end_time, isEdit, id } = values as {
    resource_id: string | null;
    start_time: Dayjs | null;
    end_time: Dayjs | null;
    isEdit: boolean;
    id: string;
  };

  useEffect(() => {
    if (!resource_id || !start_time || !end_time) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(null);
      return;
    }
    if (start_time.isAfter(end_time) || start_time.isSame(end_time)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(null);
      return;
    }
    const excludeId = isEdit ? id : null;
    checkBookingOverlap(resource_id, start_time.toISOString(), end_time.toISOString(), excludeId)
      .then((hasOverlap) => {
        setError(hasOverlap ? 'Booking time overlaps with an existing booking for this resource' : null);
      })
      .catch(() => setError(null));
  }, [resource_id, start_time, end_time, isEdit, id]);

  return error;
}
