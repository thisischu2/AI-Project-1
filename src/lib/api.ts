"use client";

import type { NetworkData } from "./types";

/** Shape the browser sends to the AI routes. Only what the routes need. */
export function toPayload(data: NetworkData) {
  return {
    profileName: data.profile.name,
    priorities: data.profile.priorities,
    contacts: data.contacts.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      location: c.location,
      occupation: c.occupation,
      organization: c.organization,
      categories: c.categories,
      tags: c.tags,
      interests: c.interests,
      goals: c.goals,
      skills: c.skills,
      metContext: c.metContext,
      notes: c.notes,
      importantDates: c.importantDates,
      isDemo: c.isDemo,
    })),
    connections: data.connections.map(({ id, sourceId, targetId, label }) => ({ id, sourceId, targetId, label })),
    interactions: data.interactions.map(({ id, contactId, kind, date, summary }) => ({ id, contactId, kind, date, summary })),
  };
}

export async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json as T;
}

export function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function formatDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
