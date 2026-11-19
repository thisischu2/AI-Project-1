/**
 * OPPORTUNITY ENGINE, in plain code (no AI).
 *
 * You save goals ("find a summer role in tech policy"). For each goal, people
 * are ranked by what you recorded about them (job, workplace, skills,
 * interests, your notes) and how close they are on the map. Every match
 * lists its reasons. Being in the same city never counts on its own, and
 * nobody is suggested without a recorded reason.
 */
import { shortestPath } from "./graph";
import { ME } from "./types";
import type { NetworkPayload, PayloadContact } from "./validation";

export interface Reason {
  kind: "work" | "skill" | "interest" | "same_goal" | "note" | "tag" | "place";
  text: string;
  /** For notes: the note it came from. */
  noteId?: string;
}

export interface Opportunity {
  contactId: string;
  score: number;
  /** Steps from you on the map, or null when there's no recorded path. */
  degrees: number | null;
  /** Ids from you to them (inclusive), when there is a path. */
  path: string[];
  reasons: Reason[];
}

export const MAX_GOALS = 10;
export const opportunityKey = (goal: string, contactId: string) => `${goal.trim().toLowerCase()}|${contactId}`;

const STOP = new Set(
  "a an and are as at be by do for from have how i in into is it me my of on or the to who what with you your get find want need help more some new make good better start become land work job role looking about learn meet know like someone people person things stuff way".split(
    " ",
  ),
);

/** Lowercase word stems: "policies" ~ "policy", "designer" ~ "design", "founders" ~ "founder". */
export function goalWords(text: string): string[] {
  return [
    ...new Set(
      text
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length > 1 && !STOP.has(w))
        .map(stem),
    ),
  ];
}

function stem(w: string) {
  if (w.length <= 4) return w;
  return w
    .replace(/ies$/, "y")
    .replace(w.length >= 7 ? /(ers|er|ing|ed|es|s|ists|ist|ians|ian)$/ : /(ing|ed|es|s)$/, "")
    .replace(/(.)\1$/, "$1");
}

/** Which goal words appear in a piece of text. A common word alone (see `common`) doesn't count. */
function overlapWith(goal: string[], common: Set<string>, text: string | undefined): string[] {
  if (!text) return [];
  const have = new Set(goalWords(text));
  const m = goal.filter((w) => have.has(w));
  return m.length >= 2 || m.some((w) => !common.has(w)) ? m : [];
}

/** Goal words that appear in most people's records ("tech" in a tech-heavy circle) say little on their own. */
function commonWords(words: string[], network: NetworkPayload): Set<string> {
  const n = network.contacts.length;
  if (n < 5) return new Set();
  const count = new Map<string, number>();
  for (const c of network.contacts) {
    const have = new Set(goalWords([c.occupation, c.organization, ...c.skills, ...c.interests, ...c.goals, ...c.tags].filter(Boolean).join(" ")));
    for (const w of words) if (have.has(w)) count.set(w, (count.get(w) ?? 0) + 1);
  }
  return new Set(words.filter((w) => (count.get(w) ?? 0) / n > 0.4));
}

const WEIGHT: Record<Reason["kind"], number> = { work: 3, skill: 3, interest: 2, same_goal: 1, note: 1, tag: 1, place: 1 };
const DISTANCE = (d: number | null) => (d === 1 ? 1 : d === 2 ? 0.8 : d === null ? 0.5 : 0.6);

/** People who might help with a goal, best first, each with its reasons. */
export function findOpportunities(goal: string, network: NetworkPayload, dismissed: string[] = [], limit = 5): Opportunity[] {
  const words = goalWords(goal);
  if (!words.length) return [];
  const skip = new Set(dismissed);
  const common = commonWords(words, network);
  const out: Opportunity[] = [];

  for (const c of network.contacts) {
    if (skip.has(opportunityKey(goal, c.id))) continue;
    const reasons = reasonsFor(words, c, network, (text) => overlapWith(words, common, text));
    if (!reasons.some((r) => r.kind !== "place")) continue; // location alone never counts
    const p = shortestPath(network.connections, ME, c.id);
    const degrees = p.found ? p.degrees : null;
    const raw = reasons.reduce((s, r) => s + WEIGHT[r.kind], 0);
    out.push({ contactId: c.id, score: Math.round(raw * DISTANCE(degrees) * 10) / 10, degrees, path: p.found ? p.path : [], reasons });
  }
  return out.sort((a, b) => b.score - a.score || (a.degrees ?? 99) - (b.degrees ?? 99) || a.contactId.localeCompare(b.contactId)).slice(0, limit);
}

function reasonsFor(words: string[], c: PayloadContact, network: NetworkPayload, match: (text?: string) => string[]): Reason[] {
  const reasons: Reason[] = [];
  const quote = (m: string[]) => `matches “${m.join("”, “")}”`;

  const job = [c.occupation, c.organization && `at ${c.organization}`].filter(Boolean).join(" ");
  const jm = match(job);
  if (jm.length) reasons.push({ kind: "work", text: `Works as ${job} (${quote(jm)})` });

  for (const s of c.skills) {
    const m = match(s);
    if (m.length) reasons.push({ kind: "skill", text: `Skill: ${s}` });
  }
  for (const s of c.interests) {
    const m = match(s);
    if (m.length) reasons.push({ kind: "interest", text: `Interested in ${s}` });
  }
  for (const g of c.goals) {
    const m = match(g);
    if (m.length) reasons.push({ kind: "same_goal", text: `Their goal is similar: ${g}` });
  }
  for (const t of c.tags) if (match(t).length) reasons.push({ kind: "tag", text: `Tagged ${t}` });

  const notes = network.interactions.filter((i) => i.contactId === c.id).sort((a, b) => b.date.localeCompare(a.date));
  for (const n of notes) {
    const m = match(n.summary);
    if (m.length) reasons.push({ kind: "note", text: `Your note on ${n.date} mentions ${quote(m).replace("matches ", "")}`, noteId: n.id });
    if (reasons.filter((r) => r.kind === "note").length >= 2) break;
  }
  if (c.notes && match(c.notes).length) reasons.push({ kind: "note", text: `Your notes on ${c.name.split(" ")[0]} mention ${quote(match(c.notes)).replace("matches ", "")}` });

  const pm = match(c.location);
  if (pm.length) reasons.push({ kind: "place", text: `Based in ${c.location}` });
  return reasons;
}

/** A short request for help (1°) or for an introduction from the person in between (2°+). */
export function draftAsk(o: Opportunity, goal: string, network: NetworkPayload): { to: string; subject: string; body: string; basedOn: string[] } {
  const byId = new Map(network.contacts.map((c) => [c.id, c]));
  const target = byId.get(o.contactId)!;
  const first = (c: PayloadContact) => c.name.split(" ")[0];
  const me = network.profileName || "Me";
  const why = o.reasons.find((r) => r.kind === "work" || r.kind === "skill") ?? o.reasons.find((r) => r.kind !== "place")!;
  const basedOn = [why.text];
  const reasonLine =
    why.kind === "work"
      ? `you're ${[target.occupation && `a ${target.occupation}`, target.organization && `at ${target.organization}`].filter(Boolean).join(" ") || "in the field"}`
      : why.kind === "skill"
        ? `of your experience with ${why.text.replace(/^Skill: /, "")}`
        : "of what you've shared before";

  if (o.degrees !== null && o.degrees >= 2 && o.path.length >= 3) {
    const middle = byId.get(o.path[1]);
    if (middle) {
      basedOn.push(`Recorded connection: ${middle.name} → ${o.path.length === 3 ? target.name : "…"}`);
      return {
        to: middle.id,
        subject: `Could you introduce me to ${first(target)}?`,
        body: `Hi ${first(middle)},\n\nI'm working on a goal: ${goal}. I thought ${target.name} might be a good person to talk to, because ${reasonLine.replace(/^you're/, "they're").replace(/^of your/, "of their")}.\n\nWould you be comfortable introducing us? Only if it feels right, and no worries at all if not.\n\nThanks,\n${me}`,
        basedOn,
      };
    }
  }
  return {
    to: target.id,
    subject: "Quick question",
    body: `Hi ${first(target)},\n\nI'm working on a goal: ${goal}. I thought of you because ${reasonLine}.\n\nWould you be open to a short chat in the next few weeks? I'd really value your perspective.\n\nThanks,\n${me}`,
    basedOn,
  };
}
