/**
 * Duplicate detection and merging. Plain rules, no AI.
 *
 * A match always comes with the reasons behind it, so the person decides.
 * Nothing here changes data on its own; mergeContacts returns a new network.
 */
import type { Contact, NetworkData } from "./types";

export type Confidence = "high" | "medium";

export interface DuplicateMatch {
  contact: Contact;
  confidence: Confidence;
  reasons: string[];
}

/** Common English nicknames, both directions resolve to one key. */
const NICKNAMES: Record<string, string[]> = {
  alexander: ["alex", "xander", "sandy"],
  alexandra: ["alex", "alexa", "sandra", "lexi"],
  anthony: ["tony"],
  benjamin: ["ben", "benji"],
  catherine: ["cathy", "cat", "kate", "katie"],
  katherine: ["kathy", "kat", "kate", "katie"],
  christopher: ["chris", "topher"],
  christina: ["chris", "tina", "christy"],
  daniel: ["dan", "danny"],
  danielle: ["dani", "elle"],
  david: ["dave", "davey"],
  edward: ["ed", "eddie", "ted", "ned"],
  elizabeth: ["liz", "lizzie", "beth", "betty", "eliza", "liza"],
  james: ["jim", "jimmy", "jamie"],
  jennifer: ["jen", "jenny"],
  jonathan: ["jon", "jonny"],
  john: ["johnny", "jack"],
  joseph: ["joe", "joey"],
  joshua: ["josh"],
  margaret: ["maggie", "meg", "peggy"],
  matthew: ["matt"],
  michael: ["mike", "mikey", "mick"],
  nicholas: ["nick", "nicky"],
  patricia: ["pat", "patty", "trish"],
  patrick: ["pat", "paddy"],
  rebecca: ["becca", "becky"],
  richard: ["rich", "rick", "ricky", "dick"],
  robert: ["rob", "robbie", "bob", "bobby", "bert"],
  samantha: ["sam", "sammy"],
  samuel: ["sam", "sammy"],
  stephen: ["steve", "stevie"],
  steven: ["steve", "stevie"],
  susan: ["sue", "suzy"],
  thomas: ["tom", "tommy"],
  victoria: ["vicky", "tori"],
  william: ["will", "bill", "billy", "liam"],
};
const NICK_INDEX = new Map<string, Set<string>>();
for (const [full, nicks] of Object.entries(NICKNAMES)) {
  for (const n of [full, ...nicks]) {
    if (!NICK_INDEX.has(n)) NICK_INDEX.set(n, new Set());
    NICK_INDEX.get(n)!.add(full);
  }
}

const TITLES = new Set(["dr", "mr", "mrs", "ms", "mx", "prof", "sir", "madam", "jr", "sr", "ii", "iii", "iv", "esq", "phd", "md", "jd"]);

/** "Dr. José  O'Neil-Smith, Jr." → ["jose", "oneilsmith"] */
export function nameTokens(name: string): string[] {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’.\-]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !TITLES.has(t));
}

export const normalizeEmail = (e?: string) => (e ?? "").trim().toLowerCase() || undefined;

/** Digits only, last 10 (so +1 (415) 555-0100 and 415.555.0100 match). Too short → undefined. */
export function normalizePhone(p?: string) {
  const d = (p ?? "").replace(/\D/g, "");
  return d.length >= 7 ? d.slice(-10) : undefined;
}

function sameFirstName(a: string, b: string): "exact" | "nickname" | "initial" | null {
  if (a === b) return "exact";
  const fa = NICK_INDEX.get(a);
  const fb = NICK_INDEX.get(b);
  if (fa && fb && [...fa].some((x) => fb.has(x))) return "nickname";
  if ((a.length === 1 && b.startsWith(a)) || (b.length === 1 && a.startsWith(b))) return "initial";
  return null;
}

type Comparable = Pick<Contact, "name" | "email" | "phone">;

/** Why two records might be the same person, or null if there's no real sign. */
export function compareContacts(a: Comparable, b: Comparable): { confidence: Confidence; reasons: string[] } | null {
  const reasons: string[] = [];
  let high = false;

  const ea = normalizeEmail(a.email);
  if (ea && ea === normalizeEmail(b.email)) {
    reasons.push(`Same email (${ea})`);
    high = true;
  }
  const pa = normalizePhone(a.phone);
  if (pa && pa === normalizePhone(b.phone)) {
    reasons.push("Same phone number");
    high = true;
  }

  const ta = nameTokens(a.name);
  const tb = nameTokens(b.name);
  if (ta.length && tb.length) {
    if (ta.join(" ") === tb.join(" ")) {
      reasons.push("Same name");
      // A full name (two or more words) matching exactly is strong; a lone first name is not.
      if (ta.length >= 2) high = true;
    } else if (ta.length >= 2 && tb.length >= 2 && ta.at(-1) === tb.at(-1)) {
      const first = sameFirstName(ta[0], tb[0]);
      if (first === "exact") reasons.push("Same first and last name (middle name differs)");
      if (first === "nickname") reasons.push(`"${ta[0]}" and "${tb[0]}" can be the same first name, same last name`);
      if (first === "initial") reasons.push("Same last name and matching first initial");
    }
  }

  if (!reasons.length) return null;
  return { confidence: high ? "high" : "medium", reasons };
}

/** Existing contacts that might be the same person as `candidate`, strongest first. */
export function findDuplicates(candidate: Comparable, contacts: Contact[], excludeId?: string): DuplicateMatch[] {
  const out: DuplicateMatch[] = [];
  for (const c of contacts) {
    if (c.id === excludeId) continue;
    const m = compareContacts(candidate, c);
    if (m) out.push({ contact: c, ...m });
  }
  return out.sort((x, y) => (x.confidence === y.confidence ? y.reasons.length - x.reasons.length : x.confidence === "high" ? -1 : 1));
}

export const pairId = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export interface DuplicatePair {
  a: Contact;
  b: Contact;
  confidence: Confidence;
  reasons: string[];
}

/** Every likely duplicate pair in the network, minus pairs the person said are different people. */
export function findDuplicatePairs(contacts: Contact[], dismissed: string[] = []): DuplicatePair[] {
  const skip = new Set(dismissed);
  const pairs: DuplicatePair[] = [];
  for (let i = 0; i < contacts.length; i++) {
    for (let j = i + 1; j < contacts.length; j++) {
      const a = contacts[i];
      const b = contacts[j];
      if (skip.has(pairId(a.id, b.id))) continue;
      const m = compareContacts(a, b);
      if (m) pairs.push({ a, b, ...m });
    }
  }
  return pairs.sort((x, y) => (x.confidence === y.confidence ? 0 : x.confidence === "high" ? -1 : 1));
}

const unionCI = (a: string[], b: string[]) => {
  const seen = new Set(a.map((x) => x.toLowerCase()));
  return [...a, ...b.filter((x) => !seen.has(x.toLowerCase()) && (seen.add(x.toLowerCase()), true))];
};

/** Combine two contact records: the kept one's values win; blanks are filled from the other; lists are joined. */
export function combineContactFields(keep: Contact, other: Pick<Contact, "name"> & Partial<Contact>): Contact {
  const fill = <K extends "email" | "phone" | "location" | "occupation" | "organization" | "metContext">(k: K) => keep[k] ?? other[k];
  const dates = [...keep.importantDates];
  for (const d of other.importantDates ?? []) {
    if (!dates.some((x) => x.label.toLowerCase() === d.label.toLowerCase() && x.date === d.date)) dates.push(d);
  }
  const notes = [keep.notes, other.notes && other.notes !== keep.notes ? other.notes : undefined].filter(Boolean).join("\n\n");
  return {
    ...keep,
    email: fill("email"),
    phone: fill("phone"),
    location: fill("location"),
    occupation: fill("occupation"),
    organization: fill("organization"),
    metContext: fill("metContext"),
    notes: notes || undefined,
    categories: [...new Set([...keep.categories, ...(other.categories ?? [])])],
    tags: unionCI(keep.tags, other.tags ?? []),
    interests: unionCI(keep.interests, other.interests ?? []),
    goals: unionCI(keep.goals, other.goals ?? []),
    skills: unionCI(keep.skills, other.skills ?? []),
    importantDates: dates,
    // Real data absorbing a demo record stays real; two demo records stay demo.
    isDemo: keep.isDemo && other.isDemo ? true : undefined,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Merge `removeId` into `keepId`: fields combined, and every connection, note
 * and follow-up moved to the kept person. Connections that would duplicate or
 * point at themselves are dropped. Returns the new network.
 */
export function mergeContacts(data: NetworkData, keepId: string, removeId: string): NetworkData {
  const keep = data.contacts.find((c) => c.id === keepId);
  const remove = data.contacts.find((c) => c.id === removeId);
  if (!keep || !remove || keepId === removeId) return data;

  const seen = new Set<string>();
  const connections = data.connections
    .map((e) => ({
      ...e,
      sourceId: e.sourceId === removeId ? keepId : e.sourceId,
      targetId: e.targetId === removeId ? keepId : e.targetId,
    }))
    .filter((e) => {
      if (e.sourceId === e.targetId) return false;
      const k = pairId(e.sourceId, e.targetId);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

  return {
    ...data,
    contacts: data.contacts.filter((c) => c.id !== removeId).map((c) => (c.id === keepId ? combineContactFields(keep, remove) : c)),
    connections,
    interactions: data.interactions.map((i) => (i.contactId === removeId ? { ...i, contactId: keepId } : i)),
    reminders: data.reminders.map((r) => (r.contactId === removeId ? { ...r, contactId: keepId } : r)),
    dismissedDuplicates: (data.dismissedDuplicates ?? []).filter((p) => !p.split("|").includes(removeId)),
  };
}
