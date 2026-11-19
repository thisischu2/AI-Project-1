/**
 * Reading, checking, backing up and combining saved networks.
 *
 * Pure functions with no browser APIs, so every rule here is unit tested.
 * Rule of thumb: never throw saved data away. If something can't be read,
 * keep the original text so it can be recovered.
 */
import { CATEGORIES, INTERACTION_KINDS, type Category, type Connection, type Contact, type Interaction, type NetworkData, type Reminder } from "./types";

export const BACKUP_APP = "6ix-degrees";
export const BACKUP_KIND = "backup";
export const BACKUP_FORMAT = 1;
/** Hard cap so a wrong or hostile file can't freeze the phone. */
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 4000): string | undefined =>
  typeof v === "string" && v.trim() ? v.slice(0, max) : undefined;
const strList = (v: unknown, max = 200): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "").slice(0, max) : [];
const isoDate = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v : undefined);
const nowIso = () => new Date().toISOString();

export interface NormalizeReport {
  /** Records that were unusable (for example, a contact with no name) and were left out. */
  dropped: number;
  /** Records that were kept but had missing or invalid fields filled in. */
  repaired: number;
}

function normalizeContact(v: unknown, report: NormalizeReport): Contact | null {
  if (!isObj(v)) return (report.dropped++, null);
  const id = str(v.id, 200);
  const name = str(v.name, 200);
  if (!id || !name) return (report.dropped++, null);
  const categories = strList(v.categories).filter((c): c is Category => (CATEGORIES as string[]).includes(c));
  const importantDates = Array.isArray(v.importantDates)
    ? v.importantDates
        .filter(isObj)
        .map((d) => ({ label: str(d.label, 120) ?? "Date", date: isoDate(d.date) ?? "" }))
        .filter((d) => d.date)
    : [];
  const c: Contact = {
    id,
    name,
    email: str(v.email, 300),
    phone: str(v.phone, 100),
    location: str(v.location, 200),
    occupation: str(v.occupation, 200),
    organization: str(v.organization, 200),
    categories,
    tags: strList(v.tags),
    interests: strList(v.interests),
    goals: strList(v.goals),
    skills: strList(v.skills),
    metContext: str(v.metContext),
    notes: str(v.notes, 20000),
    importantDates,
    isDemo: v.isDemo === true ? true : undefined,
    createdAt: str(v.createdAt, 40) ?? nowIso(),
    updatedAt: str(v.updatedAt, 40) ?? str(v.createdAt, 40) ?? nowIso(),
  };
  const touched =
    !Array.isArray(v.categories) || !Array.isArray(v.tags) || !Array.isArray(v.interests) ||
    !Array.isArray(v.goals) || !Array.isArray(v.skills) || !Array.isArray(v.importantDates) ||
    typeof v.createdAt !== "string" || typeof v.updatedAt !== "string";
  if (touched) report.repaired++;
  return c;
}

function normalizeConnection(v: unknown, ids: Set<string>, report: NormalizeReport): Connection | null {
  if (!isObj(v)) return (report.dropped++, null);
  const id = str(v.id, 200);
  const sourceId = str(v.sourceId, 200);
  const targetId = str(v.targetId, 200);
  if (!id || !sourceId || !targetId || sourceId === targetId || !ids.has(sourceId) || !ids.has(targetId)) {
    return (report.dropped++, null);
  }
  return { id, sourceId, targetId, label: str(v.label, 200), createdAt: str(v.createdAt, 40) ?? nowIso() };
}

function normalizeInteraction(v: unknown, ids: Set<string>, report: NormalizeReport): Interaction | null {
  if (!isObj(v)) return (report.dropped++, null);
  const id = str(v.id, 200);
  const contactId = str(v.contactId, 200);
  const summary = str(v.summary, 20000);
  if (!id || !contactId || !ids.has(contactId) || !summary) return (report.dropped++, null);
  const kind = (INTERACTION_KINDS as string[]).includes(v.kind as string) ? (v.kind as Interaction["kind"]) : "other";
  const date = isoDate(v.date) ?? nowIso().slice(0, 10);
  if (kind !== v.kind || date !== v.date) report.repaired++;
  return { id, contactId, kind, date, summary, rawNote: str(v.rawNote, 20000), createdAt: str(v.createdAt, 40) ?? nowIso() };
}

function normalizeReminder(v: unknown, ids: Set<string>, report: NormalizeReport): Reminder | null {
  if (!isObj(v)) return (report.dropped++, null);
  const id = str(v.id, 200);
  const title = str(v.title, 500);
  if (!id || !title) return (report.dropped++, null);
  const contactId = str(v.contactId, 200);
  return {
    id,
    // A reminder whose person no longer exists is kept, just unlinked.
    contactId: contactId && ids.has(contactId) ? contactId : undefined,
    title,
    dueDate: isoDate(v.dueDate),
    done: v.done === true,
    ...(str(v.sourceInteractionId, 200) ? { sourceInteractionId: str(v.sourceInteractionId, 200) } : {}),
    createdAt: str(v.createdAt, 40) ?? nowIso(),
  };
}

function uniqueById<T extends { id: string }>(items: (T | null)[], report: NormalizeReport): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const x of items) {
    if (!x) continue;
    if (seen.has(x.id)) {
      report.dropped++;
      continue;
    }
    seen.add(x.id);
    out.push(x);
  }
  return out;
}

/**
 * Turn anything that claims to be a saved network into a valid one.
 * Returns null only when the value isn't a network at all.
 */
export function normalizeNetwork(value: unknown): { data: NetworkData; report: NormalizeReport } | null {
  if (!isObj(value) || value.version !== 1 || !Array.isArray(value.contacts)) return null;
  const report: NormalizeReport = { dropped: 0, repaired: 0 };
  const contacts = uniqueById(value.contacts.map((c) => normalizeContact(c, report)), report);
  const ids = new Set(["me", ...contacts.map((c) => c.id)]);
  const list = (v: unknown) => (Array.isArray(v) ? v : []);
  const profile = isObj(value.profile) ? value.profile : {};
  return {
    data: {
      version: 1,
      profile: { name: str(profile.name, 120) ?? "", priorities: strList(profile.priorities, 20) },
      contacts,
      connections: uniqueById(list(value.connections).map((c) => normalizeConnection(c, ids, report)), report),
      interactions: uniqueById(list(value.interactions).map((i) => normalizeInteraction(i, ids, report)), report),
      reminders: uniqueById(list(value.reminders).map((r) => normalizeReminder(r, ids, report)), report),
      onboarded: value.onboarded !== false,
      ...(Array.isArray(value.dismissedDuplicates) ? { dismissedDuplicates: strList(value.dismissedDuplicates, 5000) } : {}),
    },
    report,
  };
}

export type LoadResult =
  | { status: "empty" }
  | { status: "ok"; data: NetworkData; report: NormalizeReport }
  | { status: "unreadable"; reason: string };

/** Read what the browser saved. Never decides to discard; the caller keeps a recovery copy. */
export function parseSaved(raw: string | null): LoadResult {
  if (raw === null || raw === "") return { status: "empty" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: "unreadable", reason: "The saved data is damaged and can't be read." };
  }
  const n = normalizeNetwork(parsed);
  if (!n) return { status: "unreadable", reason: "The saved data is from an unknown or newer version of the app." };
  return { status: "ok", ...n };
}

/* --------------------------------- BACKUP --------------------------------- */

export interface BackupFile {
  app: typeof BACKUP_APP;
  kind: typeof BACKUP_KIND;
  format: typeof BACKUP_FORMAT;
  exportedAt: string;
  counts: Counts;
  network: NetworkData;
}

export interface Counts {
  contacts: number;
  connections: number;
  interactions: number;
  reminders: number;
}

export const countsOf = (d: NetworkData): Counts => ({
  contacts: d.contacts.length,
  connections: d.connections.length,
  interactions: d.interactions.length,
  reminders: d.reminders.length,
});

export function makeBackup(data: NetworkData, at = new Date()): BackupFile {
  return { app: BACKUP_APP, kind: BACKUP_KIND, format: BACKUP_FORMAT, exportedAt: at.toISOString(), counts: countsOf(data), network: data };
}

export function backupFileName(at = new Date()) {
  const d = new Date(at.getTime() - at.getTimezoneOffset() * 60000).toISOString().slice(0, 16).replace("T", "-").replace(":", "");
  return `6ix-degrees-backup-${d}.json`;
}

export type ReadBackupResult =
  | { ok: true; data: NetworkData; exportedAt?: string; report: NormalizeReport }
  | { ok: false; error: string };

/** Check a file the user picked. Accepts our backup format, or a raw saved network. */
export function readBackup(text: string): ReadBackupResult {
  if (!text.trim()) return { ok: false, error: "That file is empty." };
  if (text.length > MAX_BACKUP_BYTES) return { ok: false, error: "That file is too large to be a 6IX backup." };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "That isn't a 6IX backup file. Choose the .json file you saved from 6IX." };
  }
  if (isObj(parsed) && parsed.app === BACKUP_APP) {
    if (typeof parsed.format === "number" && parsed.format > BACKUP_FORMAT) {
      return { ok: false, error: "This backup was made by a newer version of 6IX. Update the app on this device first." };
    }
    const n = normalizeNetwork(parsed.network);
    if (!n) return { ok: false, error: "This backup is damaged and can't be read." };
    return { ok: true, data: n.data, exportedAt: str(parsed.exportedAt, 40), report: n.report };
  }
  const n = normalizeNetwork(parsed);
  if (n) return { ok: true, data: n.data, report: n.report };
  return { ok: false, error: "That isn't a 6IX backup file. Choose the .json file you saved from 6IX." };
}

/* --------------------------------- COMBINE -------------------------------- */

export interface MergeSummary {
  added: Counts;
  updated: number; // contacts where the backup's copy was newer
  kept: number; // contacts where this device's copy was newer or the same
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Combine a backup into what's on this device. Nothing is deleted.
 * Records are matched by id (the same record moved between devices keeps its id).
 * When both sides have the same contact, the most recently edited copy wins.
 */
export function mergeNetworks(current: NetworkData, incoming: NetworkData): { data: NetworkData; summary: MergeSummary } {
  const summary: MergeSummary = { added: { contacts: 0, connections: 0, interactions: 0, reminders: 0 }, updated: 0, kept: 0 };

  const contacts = new Map(current.contacts.map((c) => [c.id, c]));
  for (const c of incoming.contacts) {
    const mine = contacts.get(c.id);
    if (!mine) {
      contacts.set(c.id, c);
      summary.added.contacts++;
    } else if (c.updatedAt > mine.updatedAt) {
      contacts.set(c.id, c);
      summary.updated++;
    } else {
      summary.kept++;
    }
  }

  const connections = [...current.connections];
  const pairs = new Set(connections.map((e) => pairKey(e.sourceId, e.targetId)));
  for (const e of incoming.connections) {
    const k = pairKey(e.sourceId, e.targetId);
    if (pairs.has(k)) continue;
    pairs.add(k);
    connections.push(e);
    summary.added.connections++;
  }

  const addById = <T extends { id: string }>(mine: T[], theirs: T[], key: keyof Counts) => {
    const ids = new Set(mine.map((x) => x.id));
    const out = [...mine];
    for (const x of theirs) {
      if (ids.has(x.id)) continue;
      ids.add(x.id);
      out.push(x);
      summary.added[key]++;
    }
    return out;
  };

  return {
    data: {
      ...current,
      profile: current.profile.name ? current.profile : incoming.profile,
      contacts: [...contacts.values()],
      connections,
      interactions: addById(current.interactions, incoming.interactions, "interactions"),
      reminders: addById(current.reminders, incoming.reminders, "reminders"),
      onboarded: true,
      ...(current.dismissedDuplicates || incoming.dismissedDuplicates
        ? { dismissedDuplicates: [...new Set([...(current.dismissedDuplicates ?? []), ...(incoming.dismissedDuplicates ?? [])])] }
        : {}),
    },
    summary,
  };
}
