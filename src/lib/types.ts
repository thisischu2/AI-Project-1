/**
 * Core data model for 6IX DEGREES.
 *
 * These shapes mirror the Supabase tables in supabase/migrations so that the
 * browser-storage version (v1) can be swapped for the database later without
 * changing the UI.
 */

export type Category =
  | "friend"
  | "family"
  | "classmate"
  | "mentor"
  | "colleague"
  | "collaborator"
  | "community"
  | "acquaintance";

export const CATEGORIES: Category[] = [
  "friend",
  "family",
  "classmate",
  "mentor",
  "colleague",
  "collaborator",
  "community",
  "acquaintance",
];

export interface ImportantDate {
  label: string; // e.g. "Birthday"
  date: string; // ISO date, YYYY-MM-DD
}

export interface Contact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  location?: string;
  occupation?: string;
  organization?: string;
  categories: Category[];
  tags: string[];
  interests: string[];
  goals: string[];
  skills: string[];
  metContext?: string; // how/where you met
  notes?: string;
  importantDates: ImportantDate[];
  isDemo?: boolean; // fictional demo data is always labeled
  createdAt: string;
  updatedAt: string;
}

/**
 * An explicitly recorded relationship between two people.
 * "me" is the reserved id for the user's own node.
 * Connections are undirected: A knows B means B knows A.
 */
export interface Connection {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string; // e.g. "college roommates"
  createdAt: string;
}

export type InteractionKind = "meeting" | "call" | "message" | "event" | "other";

export const INTERACTION_KINDS: InteractionKind[] = [
  "meeting",
  "call",
  "message",
  "event",
  "other",
];

export interface Interaction {
  id: string;
  contactId: string;
  kind: InteractionKind;
  date: string; // YYYY-MM-DD
  summary: string;
  rawNote?: string; // the original natural-language note, if any
  createdAt: string;
}

export interface Reminder {
  id: string;
  contactId?: string;
  title: string;
  dueDate?: string; // YYYY-MM-DD
  done: boolean;
  createdAt: string;
}

export interface Profile {
  name: string;
  priorities: string[]; // what the user wants their network to help with
}

export interface NetworkData {
  version: 1;
  profile: Profile;
  contacts: Contact[];
  connections: Connection[];
  interactions: Interaction[];
  reminders: Reminder[];
  onboarded: boolean;
  /** Pairs ("idA|idB") the person marked as different people, so they aren't flagged again. */
  dismissedDuplicates?: string[];
}

export const ME = "me";
