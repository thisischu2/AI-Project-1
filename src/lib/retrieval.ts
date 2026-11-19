/**
 * Deterministic search over the user's own records: find the people a
 * question is about, compute verified paths, and gather Discover evidence.
 * Everything here is plain code; nothing is sent anywhere.
 */
import { shortestPath, hasConnection } from "./graph";
import type { NetworkPayload, PayloadContact } from "./validation";

const STOPWORDS = new Set(
  "a an and are as at be by do for from have how i in is it know me my of on or the to who what with you your who's whom does did about any anyone someone people person they them this that".split(
    " ",
  ),
);

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t))
    .map((t) => (t.length > 4 && t.endsWith("s") ? t.slice(0, -1) : t));
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Contacts named in free text, by full name or by an unambiguous first name. */
export function findMentioned(text: string, contacts: PayloadContact[]): PayloadContact[] {
  const lower = text.toLowerCase();
  const firstNameCount = new Map<string, number>();
  for (const c of contacts) {
    const first = c.name.split(/\s+/)[0].toLowerCase();
    firstNameCount.set(first, (firstNameCount.get(first) ?? 0) + 1);
  }
  const hits: { c: PayloadContact; at: number }[] = [];
  for (const c of contacts) {
    const full = new RegExp(`\\b${escapeRegExp(c.name.toLowerCase())}\\b`);
    const first = c.name.split(/\s+/)[0].toLowerCase();
    const firstRe = new RegExp(`\\b${escapeRegExp(first)}('s)?\\b`);
    const m = full.exec(lower) ?? (firstNameCount.get(first) === 1 ? firstRe.exec(lower) : null);
    if (m) hits.push({ c, at: m.index });
  }
  return hits.sort((a, b) => a.at - b.at).map((h) => h.c);
}

export function isPathQuestion(question: string): boolean {
  return /\b(connected|connection|path|degrees?|separation|introduc|reach|how (do|am) i (know|get to))/i.test(question);
}

export function contactSearchText(c: PayloadContact): string {
  return [
    c.name,
    c.location,
    c.occupation,
    c.organization,
    c.metContext,
    c.notes,
    ...c.categories,
    ...c.tags,
    ...c.interests,
    ...c.goals,
    ...c.skills,
  ]
    .filter(Boolean)
    .join(" ");
}

export interface PathFact {
  fromId: string;
  toId: string;
  found: boolean;
  path: string[];
  names: string[];
  degrees: number | null;
}

export interface AskContext {
  contacts: PayloadContact[];
  interactions: NetworkPayload["interactions"];
  pathFacts: PathFact[];
  totalContacts: number;
}

const MAX_CONTEXT_CONTACTS = 40;

export function selectForAsk(question: string, network: NetworkPayload): AskContext {
  const nameOf = (id: string) =>
    id === "me" ? "You" : (network.contacts.find((c) => c.id === id)?.name ?? "Unknown");
  const mentioned = findMentioned(question, network.contacts);

  // Paths are computed deterministically (breadth-first search) and used as verified facts.
  const pathFacts: PathFact[] = [];
  if (isPathQuestion(question) && mentioned.length > 0) {
    // Two names: path between them. One name: path from you to them.
    const pairs: [string, string][] =
      mentioned.length >= 2 ? [[mentioned[0].id, mentioned[1].id]] : [["me", mentioned[0].id]];
    for (const [a, b] of pairs) {
      const r = shortestPath(network.connections, a, b);
      pathFacts.push({ fromId: a, toId: b, found: r.found, path: r.path, names: r.path.map(nameOf), degrees: r.degrees });
    }
  }

  // Rank contacts: mentioned or on a path first, then by keyword overlap.
  const q = new Set(tokens(question));
  const pinned = new Set([...mentioned.map((c) => c.id), ...pathFacts.flatMap((p) => p.path)]);
  const scored = network.contacts.map((c) => {
    const overlap = tokens(contactSearchText(c)).filter((t) => q.has(t)).length;
    return { c, score: (pinned.has(c.id) ? 100 : 0) + overlap };
  });
  const small = network.contacts.length <= MAX_CONTEXT_CONTACTS;
  const chosen = scored
    .filter((s) => small || s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CONTEXT_CONTACTS)
    .map((s) => s.c);
  const ids = new Set(chosen.map((c) => c.id));
  const interactions = network.interactions
    .filter((i) => ids.has(i.contactId))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 60);

  return { contacts: chosen, interactions, pathFacts, totalContacts: network.contacts.length };
}

/* ------------------------------ DISCOVER ------------------------------ */

export interface Evidence {
  kind: "shared_interest" | "goal_match" | "same_field" | "same_location" | "mutual_connection";
  detail: string;
}

export interface Candidate {
  aId: string;
  bId: string;
  evidence: Evidence[];
  score: number;
}

const norm = (s: string) => s.trim().toLowerCase();

/** One person's goal matched by another's skills, occupation, or organization. */
function goalMatches(seeker: PayloadContact, helper: PayloadContact): Evidence[] {
  const offered = tokens([helper.occupation, helper.organization, ...helper.skills].filter(Boolean).join(" "));
  const offeredSet = new Set(offered);
  const out: Evidence[] = [];
  for (const goal of seeker.goals) {
    const overlap = [...new Set(tokens(goal).filter((t) => offeredSet.has(t)))];
    if (overlap.length > 0) {
      out.push({
        kind: "goal_match",
        detail: `${seeker.name}'s recorded goal "${goal}" overlaps with ${helper.name}'s recorded ${
          [helper.occupation && "occupation", helper.skills.length && "skills"].filter(Boolean).join("/") || "profile"
        } (matching words: ${overlap.join(", ")})`,
      });
    }
  }
  return out;
}

// Job-title words that say nothing about the field itself.
const GENERIC_TITLE = new Set(
  "senior junior lead head chief manager director associate assistant intern student staff vice president founder cofounder owner partner principal officer member specialist coordinator consultant".split(" "),
);

/**
 * What two people's records have in common. Same city and a shared
 * connection only count alongside something else.
 */
export function pairEvidence(a: PayloadContact, b: PayloadContact, connections: NetworkPayload["connections"] = [], nameOf?: (id: string) => string): Evidence[] {
  const evidence: Evidence[] = [];
  const bInterests = new Map(b.interests.map((x) => [norm(x), x]));
  for (const x of a.interests) {
    if (bInterests.has(norm(x))) evidence.push({ kind: "shared_interest", detail: `Both list "${x}" as an interest` });
  }
  evidence.push(...goalMatches(a, b), ...goalMatches(b, a));
  // Same field of work: a shared, specific word in their job titles ("policy", "design").
  const field = (c: PayloadContact) => new Set(tokens(c.occupation ?? "").filter((t) => !GENERIC_TITLE.has(t)));
  const fa = field(a);
  const sharedField = [...field(b)].filter((t) => fa.has(t));
  if (sharedField.length)
    evidence.push({ kind: "same_field", detail: `Both work in ${sharedField.join(", ")} (${a.occupation} and ${b.occupation})` });
  // Supporting only: a person you've recorded as knowing both.
  if (evidence.length && nameOf) {
    const neighbours = (id: string) => new Set(connections.flatMap((e) => (e.sourceId === id ? [e.targetId] : e.targetId === id ? [e.sourceId] : [])));
    const na = neighbours(a.id);
    const mutual = [...neighbours(b.id)].filter((id) => na.has(id) && id !== "me");
    if (mutual.length) evidence.push({ kind: "mutual_connection", detail: `Both know ${mutual.map(nameOf).join(" and ")}, so there's someone in common` });
  }
  // Location alone is too weak to suggest an introduction; it only supports other evidence.
  if (evidence.length && a.location && b.location && norm(a.location) === norm(b.location))
    evidence.push({ kind: "same_location", detail: `Both are recorded in ${a.location}` });
  return evidence;
}

/**
 * Pairs of contacts who are NOT already connected and have at least one piece
 * of recorded, complementary evidence. Pure function: same input, same output.
 */
export function discoverCandidates(network: NetworkPayload, limit = 8): Candidate[] {
  const people = network.contacts;
  const names = new Map(people.map((c) => [c.id, c.name]));
  const nameOf = (id: string) => names.get(id) ?? "someone";
  const out: Candidate[] = [];
  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      const a = people[i];
      const b = people[j];
      if (hasConnection(network.connections, a.id, b.id)) continue;
      const evidence = pairEvidence(a, b, network.connections, nameOf);
      if (evidence.length === 0) continue;
      const score = evidence.reduce((s, e) => s + (e.kind === "goal_match" ? 3 : e.kind === "shared_interest" ? 2 : 1), 0);
      out.push({ aId: a.id, bId: b.id, evidence, score });
    }
  }
  return out
    .sort((x, y) => y.score - x.score || x.aId.localeCompare(y.aId) || x.bId.localeCompare(y.bId))
    .slice(0, limit);
}
