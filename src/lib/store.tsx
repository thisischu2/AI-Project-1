"use client";

/**
 * v1 storage layer: keeps the user's network in browser localStorage.
 * Saved data is checked on load (src/lib/persistence.ts) and never silently replaced.
 *
 * Every read/write goes through this one provider, so replacing it with a
 * Supabase-backed implementation later only touches this file.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { buildDemoNetwork, emptyNetwork } from "./demo-data";
import { hasConnection } from "./graph";
import { mergeContacts, pairId } from "./duplicates";
import { mergeNetworks, parseSaved, type MergeSummary } from "./persistence";
import type { Connection, Contact, Interaction, NetworkData, Reminder } from "./types";

const STORAGE_KEY = "6ix-degrees:network:v1";
/** Where unreadable or partly unreadable saved data is kept, so it is never lost. */
export const RECOVERY_KEY = "6ix-degrees:recovery";

/** Something the person should know about their saved data. */
export type StorageNotice =
  | { kind: "recovered"; message: string } // a copy of unreadable data was kept
  | { kind: "save-failed"; message: string }; // the browser refused to save (usually storage full)

export function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

const today = () => new Date().toISOString();

type ContactInput = Omit<Contact, "id" | "createdAt" | "updatedAt">;

interface Store {
  data: NetworkData;
  ready: boolean;
  notice: StorageNotice | null;
  dismissNotice: () => void;
  /** The raw text kept aside after a load problem, if any. */
  recoveryCopy: () => string | null;
  // backup
  replaceAll: (data: NetworkData) => void;
  mergeIn: (data: NetworkData) => MergeSummary;
  deleteAllData: () => void;
  contactById: (id: string) => Contact | undefined;
  nameOf: (id: string) => string;
  // onboarding
  startFresh: (name: string) => void;
  loadDemo: (name: string) => void;
  removeDemo: () => void;
  resetAll: () => void;
  // contacts
  addContact: (input: ContactInput) => Contact;
  updateContact: (id: string, patch: Partial<ContactInput>) => void;
  deleteContact: (id: string) => void;
  /** Merge one contact into another (history and connections move over). */
  mergeContactInto: (keepId: string, removeId: string) => void;
  /** Remember that two contacts are different people. */
  dismissDuplicate: (aId: string, bId: string) => void;
  /** Add many contacts at once, and/or update existing ones (used by import). */
  applyImport: (add: ContactInput[], update: { id: string; patch: Partial<ContactInput> }[]) => void;
  // connections
  addConnection: (sourceId: string, targetId: string, label?: string) => boolean;
  deleteConnection: (id: string) => void;
  // interactions
  addInteraction: (input: Omit<Interaction, "id" | "createdAt">) => string;
  deleteInteraction: (id: string) => void;
  // reminders
  addReminder: (input: Omit<Reminder, "id" | "createdAt" | "done">) => void;
  toggleReminder: (id: string) => void;
  deleteReminder: (id: string) => void;
}

const StoreContext = createContext<Store | null>(null);

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<NetworkData>(() => emptyNetwork());
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<StorageNotice | null>(null);
  // Writes are blocked if a damaged original couldn't be copied aside first.
  const [blocked, setBlocked] = useState(false);

  // Load once on the client (localStorage does not exist on the server).
  // Saved data is checked first. Anything that can't be read is copied to
  // RECOVERY_KEY before the app is allowed to write, so it is never overwritten.
  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // Storage blocked (e.g. some private modes): run with an empty network.
    }
    const result = parseSaved(raw);
    const keepCopy = (message: string) => {
      try {
        window.localStorage.setItem(RECOVERY_KEY, JSON.stringify({ savedAt: new Date().toISOString(), raw }));
        setNotice({ kind: "recovered", message });
      } catch {
        setNotice({ kind: "save-failed", message: `${message} This browser's storage is full, so the app could not keep a copy. Nothing will be saved until you clear space.` });
        return false;
      }
      return true;
    };
    let writable = true;
    if (result.status === "ok") {
      // One-time hydration from browser storage, which isn't available during server rendering.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setData(result.data);
      if (result.report.dropped > 0) {
        writable = keepCopy(
          `${result.report.dropped} saved ${result.report.dropped === 1 ? "item was" : "items were"} damaged and left out. A copy of the original data was kept.`,
        );
      }
    } else if (result.status === "unreadable") {
      writable = keepCopy(`${result.reason} A copy was kept so nothing is lost, and you can download it below.`);
    }
    if (!writable) setBlocked(true);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || blocked) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNotice((n) => (n?.kind === "save-failed" ? null : n));
    } catch {
      setNotice({
        kind: "save-failed",
        message: "Your latest changes couldn't be saved because this browser's storage is full. Save a backup now so nothing is lost.",
      });
    }
  }, [data, ready, blocked]);

  // Another tab or the installed app changed the data: follow it instead of overwriting it.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || e.newValue === null) return;
      const r = parseSaved(e.newValue);
      if (r.status === "ok") setData(r.data);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const contactById = useCallback(
    (id: string) => data.contacts.find((c) => c.id === id),
    [data.contacts],
  );
  const nameOf = useCallback(
    (id: string) => (id === "me" ? "You" : (contactById(id)?.name ?? "Unknown")),
    [contactById],
  );

  const store = useMemo<Store>(
    () => ({
      data,
      ready,
      notice,
      dismissNotice: () => setNotice(null),
      recoveryCopy: () => {
        try {
          return window.localStorage.getItem(RECOVERY_KEY);
        } catch {
          return null;
        }
      },
      replaceAll: (incoming) => setData({ ...incoming, onboarded: true }),
      mergeIn: (incoming) => {
        const { data: merged, summary } = mergeNetworks(data, incoming);
        setData(merged);
        return summary;
      },
      deleteAllData: () => {
        try {
          window.localStorage.removeItem(STORAGE_KEY);
          window.localStorage.removeItem(RECOVERY_KEY);
        } catch {
          // nothing stored
        }
        setBlocked(false);
        setNotice(null);
        setData(emptyNetwork());
      },
      contactById,
      nameOf,
      startFresh: (name) => setData({ ...emptyNetwork(name), onboarded: true }),
      loadDemo: (name) =>
        setData((prev) => {
          const demo = buildDemoNetwork(name || prev.profile.name);
          // Keep anything the user already created; demo ids never collide.
          return {
            ...demo,
            contacts: [...prev.contacts.filter((c) => !c.isDemo), ...demo.contacts],
            connections: [...prev.connections.filter((c) => !c.id.startsWith("demo-")), ...demo.connections],
            interactions: [...prev.interactions.filter((i) => !i.id.startsWith("demo-")), ...demo.interactions],
            reminders: [...prev.reminders.filter((r) => !r.id.startsWith("demo-")), ...demo.reminders],
          };
        }),
      removeDemo: () =>
        setData((prev) => {
          const demoIds = new Set(prev.contacts.filter((c) => c.isDemo).map((c) => c.id));
          return {
            ...prev,
            contacts: prev.contacts.filter((c) => !c.isDemo),
            connections: prev.connections.filter((c) => !demoIds.has(c.sourceId) && !demoIds.has(c.targetId)),
            interactions: prev.interactions.filter((i) => !demoIds.has(i.contactId)),
            reminders: prev.reminders.filter((r) => !r.contactId || !demoIds.has(r.contactId)),
          };
        }),
      resetAll: () => setData(emptyNetwork()),

      addContact: (input) => {
        const contact: Contact = { ...input, id: newId("c"), createdAt: today(), updatedAt: today() };
        setData((prev) => ({ ...prev, contacts: [...prev.contacts, contact] }));
        return contact;
      },
      updateContact: (id, patch) =>
        setData((prev) => ({
          ...prev,
          contacts: prev.contacts.map((c) => (c.id === id ? { ...c, ...patch, updatedAt: today() } : c)),
        })),
      deleteContact: (id) =>
        setData((prev) => ({
          ...prev,
          contacts: prev.contacts.filter((c) => c.id !== id),
          connections: prev.connections.filter((c) => c.sourceId !== id && c.targetId !== id),
          interactions: prev.interactions.filter((i) => i.contactId !== id),
          reminders: prev.reminders.filter((r) => r.contactId !== id),
        })),

      mergeContactInto: (keepId, removeId) => setData((prev) => mergeContacts(prev, keepId, removeId)),
      dismissDuplicate: (aId, bId) =>
        setData((prev) => ({ ...prev, dismissedDuplicates: [...new Set([...(prev.dismissedDuplicates ?? []), pairId(aId, bId)])] })),
      applyImport: (add, update) =>
        setData((prev) => {
          const patches = new Map(update.map((u) => [u.id, u.patch]));
          const t = today();
          return {
            ...prev,
            contacts: [
              ...prev.contacts.map((c) => (patches.has(c.id) ? { ...c, ...patches.get(c.id), updatedAt: t } : c)),
              ...add.map((input) => ({ ...input, id: newId("c"), createdAt: t, updatedAt: t })),
            ],
          };
        }),

      addConnection: (sourceId, targetId, label) => {
        if (sourceId === targetId || hasConnection(data.connections, sourceId, targetId)) return false;
        const connection: Connection = { id: newId("e"), sourceId, targetId, label, createdAt: today() };
        setData((prev) => ({ ...prev, connections: [...prev.connections, connection] }));
        return true;
      },
      deleteConnection: (id) =>
        setData((prev) => ({ ...prev, connections: prev.connections.filter((c) => c.id !== id) })),

      addInteraction: (input) => {
        const id = newId("i");
        setData((prev) => ({ ...prev, interactions: [...prev.interactions, { ...input, id, createdAt: today() }] }));
        return id;
      },
      deleteInteraction: (id) =>
        setData((prev) => ({
          ...prev,
          interactions: prev.interactions.filter((i) => i.id !== id),
          // Follow-ups taken from this note stay, just without the link.
          reminders: prev.reminders.map((r) => (r.sourceInteractionId === id ? { ...r, sourceInteractionId: undefined } : r)),
        })),

      addReminder: (input) =>
        setData((prev) => ({
          ...prev,
          reminders: [...prev.reminders, { ...input, id: newId("r"), done: false, createdAt: today() }],
        })),
      toggleReminder: (id) =>
        setData((prev) => ({
          ...prev,
          reminders: prev.reminders.map((r) => (r.id === id ? { ...r, done: !r.done } : r)),
        })),
      deleteReminder: (id) =>
        setData((prev) => ({ ...prev, reminders: prev.reminders.filter((r) => r.id !== id) })),
    }),
    [data, ready, notice, contactById, nameOf],
  );

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useNetwork() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useNetwork must be used inside <NetworkProvider>");
  return ctx;
}
