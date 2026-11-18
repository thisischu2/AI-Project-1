/**
 * RECONNECT: deterministic list of upcoming commitments and dates.
 * We never score relationship "quality" or treat infrequent contact as bad.
 */
import type { Contact, Reminder } from "./types";

export interface UpcomingItem {
  kind: "reminder" | "date";
  id: string;
  title: string;
  contactId?: string;
  date?: string; // YYYY-MM-DD
  daysAway?: number;
}

const RECURRING = /birthday|anniversary/i;

function daysBetween(fromISO: string, toISO: string) {
  const a = Date.UTC(+fromISO.slice(0, 4), +fromISO.slice(5, 7) - 1, +fromISO.slice(8, 10));
  const b = Date.UTC(+toISO.slice(0, 4), +toISO.slice(5, 7) - 1, +toISO.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

/** Next occurrence of a date. Birthdays and anniversaries repeat every year. */
export function nextOccurrence(dateISO: string, label: string, todayISO: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return null;
  if (!RECURRING.test(label)) return dateISO >= todayISO ? dateISO : null;
  const year = +todayISO.slice(0, 4);
  const thisYear = `${year}${dateISO.slice(4)}`;
  return thisYear >= todayISO ? thisYear : `${year + 1}${dateISO.slice(4)}`;
}

export function upcoming(contacts: Contact[], reminders: Reminder[], todayISO: string, windowDays = 45): UpcomingItem[] {
  const items: UpcomingItem[] = [];
  for (const r of reminders) {
    if (r.done) continue;
    items.push({
      kind: "reminder",
      id: r.id,
      title: r.title,
      contactId: r.contactId,
      date: r.dueDate,
      daysAway: r.dueDate ? daysBetween(todayISO, r.dueDate) : undefined,
    });
  }
  for (const c of contacts) {
    for (const d of c.importantDates) {
      const next = nextOccurrence(d.date, d.label, todayISO);
      if (!next) continue;
      const days = daysBetween(todayISO, next);
      if (days <= windowDays) {
        items.push({ kind: "date", id: `${c.id}-${d.label}-${d.date}`, title: `${c.name}: ${d.label}`, contactId: c.id, date: next, daysAway: days });
      }
    }
  }
  // Dated items soonest first (overdue first), undated reminders last.
  return items.sort((a, b) => (a.daysAway ?? 9999) - (b.daysAway ?? 9999));
}

export function relativeDay(days?: number) {
  if (days === undefined) return "No date";
  if (days < 0) return `${-days}d overdue`;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}
