"use client";

/**
 * v1 storage layer: keeps the user's network in browser localStorage.
 *
 * Every read/write goes through this one provider, so replacing it with a
 * Supabase-backed implementation later only touches this file.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { buildDemoNetwork, emptyNetwork } from "./demo-data";
import { hasConnection } from "./graph";
import type { Connection, Contact, Interaction, NetworkData, Reminder } from "./types";

const STORAGE_KEY = "6ix-degrees:network:v1";

export function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

const today = () => new Date().toISOString();

type ContactInput = Omit<Contact, "id" | "createdAt" | "updatedAt">;

interface Store {
  data: NetworkData;
  ready: boolean;
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
  // connections
  addConnection: (sourceId: string, targetId: string, label?: string) => boolean;
  deleteConnection: (id: string) => void;
  // interactions
  addInteraction: (input: Omit<Interaction, "id" | "createdAt">) => void;
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

  // Load once on the client (localStorage does not exist on the server).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as NetworkData;
        // One-time hydration from browser storage, which isn't available during server rendering.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (parsed?.version === 1) setData(parsed);
      }
    } catch {
      // Corrupt storage: fall back to an empty network rather than crashing.
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data, ready]);

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

      addConnection: (sourceId, targetId, label) => {
        if (sourceId === targetId || hasConnection(data.connections, sourceId, targetId)) return false;
        const connection: Connection = { id: newId("e"), sourceId, targetId, label, createdAt: today() };
        setData((prev) => ({ ...prev, connections: [...prev.connections, connection] }));
        return true;
      },
      deleteConnection: (id) =>
        setData((prev) => ({ ...prev, connections: prev.connections.filter((c) => c.id !== id) })),

      addInteraction: (input) =>
        setData((prev) => ({
          ...prev,
          interactions: [...prev.interactions, { ...input, id: newId("i"), createdAt: today() }],
        })),
      deleteInteraction: (id) =>
        setData((prev) => ({ ...prev, interactions: prev.interactions.filter((i) => i.id !== id) })),

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
    [data, ready, contactById, nameOf],
  );

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useNetwork() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useNetwork must be used inside <NetworkProvider>");
  return ctx;
}
