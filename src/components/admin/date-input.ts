/**
 * `<input type="date">` ↔ ISO-8601 conversions shared by admin forms.
 *
 * The browser's date input emits `YYYY-MM-DD`; the API expects an ISO
 * timestamp. We pin the time to UTC midnight so users in different
 * timezones don't see a one-day drift on round-trip.
 */

export function toDateInput(iso: string | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export function fromDateInput(value: string): string {
  return new Date(`${value}T00:00:00Z`).toISOString();
}
