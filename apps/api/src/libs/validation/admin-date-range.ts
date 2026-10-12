import { directoryError } from '../pagination/admin-directory';
export function adminDateRange(from?: string, to?: string) {
  const start = from
    ? new Date(from.length === 10 ? from + 'T00:00:00+05:00' : from)
    : undefined;
  const end = to
    ? new Date(
        to.length === 10
          ? new Date(to + 'T00:00:00+05:00').getTime() + 86400000
          : to,
      )
    : undefined;
  if (
    (start && !Number.isFinite(start.getTime())) ||
    (end && !Number.isFinite(end.getTime())) ||
    (start && end && start >= end)
  )
    throw directoryError('Invalid date range');
  return { ...(start ? { gte: start } : {}), ...(end ? { lt: end } : {}) };
}
