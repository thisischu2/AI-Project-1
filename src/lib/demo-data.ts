/**
 * Clearly labeled FICTIONAL demo network. None of these people are real.
 * Every contact carries isDemo: true so the UI can badge it.
 */
import type { Connection, Contact, Interaction, NetworkData, Reminder } from "./types";
import { ME } from "./types";

const now = "2026-11-01T12:00:00.000Z";

type Seed = Omit<Contact, "createdAt" | "updatedAt" | "isDemo" | "tags" | "goals" | "skills" | "importantDates"> &
  Partial<Pick<Contact, "tags" | "goals" | "skills" | "importantDates">>;

const seeds: Seed[] = [
  {
    id: "demo-marcus",
    name: "Marcus Reed",
    location: "Toronto, ON",
    occupation: "Product Designer",
    organization: "Northline Studio",
    categories: ["friend", "classmate"],
    interests: ["design systems", "basketball", "jazz"],
    skills: ["UX research", "Figma"],
    goals: ["start a design consultancy"],
    metContext: "Roommates in first year of university",
    notes: "Always up for a pickup game on Sundays.",
    importantDates: [{ label: "Birthday", date: "1999-12-04" }],
  },
  {
    id: "demo-danielle",
    name: "Danielle Okafor",
    location: "New York, NY",
    occupation: "Venture Associate",
    organization: "Harbor Seed Fund",
    categories: ["colleague"],
    interests: ["climate tech", "running", "founder communities"],
    skills: ["fundraising", "market sizing"],
    goals: ["meet early-stage climate founders"],
    metContext: "Introduced by Marcus at a design meetup",
  },
  {
    id: "demo-james",
    name: "James Whitfield",
    location: "New York, NY",
    occupation: "Climate Startup Founder",
    organization: "Tidewater Energy",
    categories: ["acquaintance"],
    interests: ["battery storage", "sailing"],
    skills: ["hardware engineering"],
    goals: ["raise a seed round", "hire a product designer"],
  },
  {
    id: "demo-priya",
    name: "Priya Shah",
    location: "Toronto, ON",
    occupation: "Law Student",
    organization: "Osgoode Hall",
    categories: ["classmate", "friend"],
    interests: ["AI policy", "privacy law", "pottery"],
    skills: ["legal research", "public speaking"],
    goals: ["find a summer role in tech policy"],
    metContext: "AI & Legal Reasoning study group",
    importantDates: [{ label: "Moot court final", date: "2026-12-02" }],
  },
  {
    id: "demo-leo",
    name: "Leo Tanaka",
    location: "Vancouver, BC",
    occupation: "Policy Analyst",
    organization: "Pacific Digital Rights Institute",
    categories: ["mentor"],
    interests: ["AI policy", "hiking", "photography"],
    skills: ["policy writing", "stakeholder engagement"],
    goals: ["mentor students entering tech policy"],
    metContext: "Spoke on a panel at a privacy conference",
  },
  {
    id: "demo-jordan",
    name: "Jordan Ellis",
    location: "Chicago, IL",
    occupation: "Software Engineer",
    organization: "Brightloop",
    categories: ["collaborator"],
    interests: ["open source", "cycling"],
    skills: ["TypeScript", "data visualization"],
    goals: ["contribute to civic tech"],
  },
  {
    id: "demo-sofia",
    name: "Sofia Alvarez",
    location: "Toronto, ON",
    occupation: "Community Organizer",
    organization: "Kensington Youth Collective",
    categories: ["community"],
    interests: ["civic tech", "food justice", "salsa dancing"],
    skills: ["event planning", "grant writing"],
    goals: ["build a volunteer app for the collective"],
    metContext: "Volunteered together at a winter food drive",
  },
  {
    id: "demo-aunt-grace",
    name: "Grace Mensah",
    location: "Ottawa, ON",
    occupation: "Retired Teacher",
    categories: ["family"],
    interests: ["gardening", "choir"],
    importantDates: [{ label: "Birthday", date: "1961-11-24" }],
  },
  {
    id: "demo-ethan",
    name: "Ethan Brooks",
    location: "New York, NY",
    occupation: "Journalist",
    organization: "The Metro Ledger",
    categories: ["acquaintance"],
    interests: ["tech accountability", "jazz"],
    skills: ["investigative reporting"],
  },
];

export const demoContacts: Contact[] = seeds.map((s) => ({
  tags: [],
  goals: [],
  skills: [],
  importantDates: [],
  ...s,
  isDemo: true,
  createdAt: now,
  updatedAt: now,
}));

const pairs: [string, string, string?][] = [
  [ME, "demo-marcus", "university roommates"],
  ["demo-marcus", "demo-danielle", "design meetup"],
  ["demo-danielle", "demo-james", "portfolio founder"],
  [ME, "demo-priya", "study group"],
  ["demo-priya", "demo-leo", "mentorship"],
  [ME, "demo-sofia", "food drive volunteers"],
  ["demo-sofia", "demo-jordan", "civic hackathon"],
  [ME, "demo-aunt-grace", "family"],
  ["demo-danielle", "demo-ethan", "college friends"],
];

export const demoConnections: Connection[] = pairs.map(([a, b, label], i) => ({
  id: `demo-edge-${i}`,
  sourceId: a,
  targetId: b,
  label,
  createdAt: now,
}));

export const demoInteractions: Interaction[] = [
  {
    id: "demo-int-1",
    contactId: "demo-marcus",
    kind: "meeting",
    date: "2026-11-09",
    summary: "Coffee at Dineen. Marcus is thinking about leaving Northline to start a consultancy next spring.",
    createdAt: now,
  },
  {
    id: "demo-int-2",
    contactId: "demo-priya",
    kind: "call",
    date: "2026-11-12",
    summary: "Prepped for moot court. She asked if I know anyone working in AI policy.",
    createdAt: now,
  },
  {
    id: "demo-int-3",
    contactId: "demo-sofia",
    kind: "event",
    date: "2026-10-28",
    summary: "Planning meeting for the winter food drive. She wants a simple app to schedule volunteers.",
    createdAt: now,
  },
];

export const demoReminders: Reminder[] = [
  {
    id: "demo-rem-1",
    contactId: "demo-marcus",
    title: "Send Marcus the consultancy pricing article",
    dueDate: "2026-11-20",
    done: false,
    createdAt: now,
  },
  {
    id: "demo-rem-2",
    contactId: "demo-priya",
    title: "Wish Priya luck before the moot court final",
    dueDate: "2026-12-01",
    done: false,
    createdAt: now,
  },
];

export function buildDemoNetwork(userName: string): NetworkData {
  return {
    version: 1,
    profile: { name: userName || "You", priorities: ["find a summer role in tech policy", "staying close to friends"] },
    contacts: demoContacts,
    connections: demoConnections,
    interactions: demoInteractions,
    reminders: demoReminders,
    onboarded: true,
  };
}

export function emptyNetwork(userName = "You"): NetworkData {
  return {
    version: 1,
    profile: { name: userName, priorities: [] },
    contacts: [],
    connections: [],
    interactions: [],
    reminders: [],
    onboarded: false,
  };
}
