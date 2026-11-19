/**
 * The "assistant" features, written as plain code. No AI service is called and
 * no keys are needed, so the whole app works on a phone with no connection.
 *
 * Every answer is built only from records the user saved. When something is
 * not recorded we say so instead of guessing.
 */
import { degreeLabel } from "./graph";
import {
  contactSearchText,
  discoverCandidates,
  findMentioned,
  selectForAsk,
  tokens,
  type Candidate,
  type Evidence,
} from "./retrieval";
import type { Category } from "./types";
import type { NetworkPayload, PayloadContact } from "./validation";

export interface PathAnswer {
  found: boolean;
  names: string[];
  degrees: number | null;
}

export interface Answer {
  answer: string;
  referencedContactIds: string[];
  gaps: string[];
  paths: PathAnswer[];
  /** Notes the answer quotes or lists, so they can be shown as sources. */
  noteIds?: string[];
}

const list = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

function formatDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function describe(c: PayloadContact) {
  const role = [c.occupation, c.organization && `at ${c.organization}`].filter(Boolean).join(" ");
  const where = c.location ? `in ${c.location}` : "";
  return [c.name, [role, where].filter(Boolean).join(", ")].filter(Boolean).join(": ");
}

/** "Who do I know in New York?" → the place words after "in". */
function placeQuery(question: string): string | null {
  const m = /\b(?:in|from|near|around|based in|living in|lives in)\s+([a-z][a-z .,'-]{1,60}?)\s*\??$/i.exec(question.trim());
  return m ? m[1].replace(/[.,]+$/, "").trim() : null;
}

const isIntroQuestion = (q: string) => /\b(introduc|benefit|should meet|who should|match|discover)/i.test(q);
const isLastTalkQuestion = (q: string) =>
  /\b(last|latest|recent|discuss|talk|spoke|speak|said|chat|conversation|catch up|met)\b/i.test(q);

/** Follow-ups and today's date, which the network payload doesn't carry. */
export interface AskOptions {
  reminders?: { id: string; contactId?: string; title: string; dueDate?: string; done: boolean }[];
  today?: string;
}

const CATEGORY_WORDS: [Category, RegExp][] = [
  ["mentor", /\bmentors?\b/i],
  ["friend", /\bfriends?\b/i],
  ["family", /\bfamily|relatives?\b/i],
  ["classmate", /\bclassmates?\b/i],
  ["colleague", /\b(colleagues?|co-?workers?)\b/i],
  ["collaborator", /\bcollaborators?\b/i],
  ["community", /\bcommunity\b/i],
  ["acquaintance", /\bacquaintances?\b/i],
];

/** What Ask 6ix can answer, shown when a question isn't one of them. */
export const ASK_CAPABILITIES = [
  'A person: "What did I last discuss with Marcus?"',
  'A city: "Who do I know in Toronto?"',
  'A field of work: "Who works in law?"',
  'A relationship type: "Who are my mentors?"',
  'Follow-ups: "What\'s due this week?" or "Follow-ups with Priya"',
  'Recent conversations: "Who did I talk to recently?"',
  'Connections: "Who does Marcus know?" or "How am I connected to James?"',
  'Introductions: "Who might benefit from an introduction?"',
  'Actions: "Draft a message to Priya" or "Remind me to call Leo on Friday"',
];
const capabilityText = () => `Here's what I can answer from your records:\n${ASK_CAPABILITIES.map((c) => `• ${c}`).join("\n")}`;

const daysFrom = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/** Match words in someone's work fields (occupation, organization, skills, tags). */
function fieldHits(field: string, contacts: PayloadContact[]) {
  const want = tokens(field);
  if (!want.length) return [];
  return contacts.filter((c) => {
    const have = tokens([c.occupation, c.organization, ...c.skills, ...c.tags].filter(Boolean).join(" "));
    // "design" matches "Designer"; short words must match exactly.
    return want.every((w) => have.some((h) => h === w || (w.length >= 4 && h.startsWith(w))));
  });
}

/** Answer a question about the user's own network, using only stored records. */
export function answerQuestion(question: string, network: NetworkPayload, opts: AskOptions = {}): Answer {
  const ctx = selectForAsk(question, network);
  const mentioned = findMentioned(question, network.contacts);
  const nameById = new Map(network.contacts.map((c) => [c.id, c.name]));
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const reminders = (opts.reminders ?? []).filter((r) => !r.done);

  // "What can I ask?"
  if (/^\s*(help|\?|what can (you|i) (do|ask)|what (questions|can i ask))\b/i.test(question)) {
    return { answer: capabilityText(), referencedContactIds: [], gaps: [], paths: [] };
  }

  // 0a. "Who does Marcus know?" / "Who is Marcus connected to?": their recorded connections.
  if (mentioned.length === 1 && /\bwho (?:does|do|did) .+ know\b|\bwho (?:is|are) .+ connected (?:to|with)\b|\bconnections? (?:of|for)\b|'s connections\b/i.test(question)) {
    const c = mentioned[0];
    const links = network.connections.filter((e) => e.sourceId === c.id || e.targetId === c.id);
    const other = (e: (typeof links)[number]) => (e.sourceId === c.id ? e.targetId : e.sourceId);
    const label = (id: string) => (id === "me" ? "You" : (nameById.get(id) ?? "Someone"));
    return links.length
      ? {
          answer: `You've recorded ${links.length} ${links.length === 1 ? "connection" : "connections"} for ${c.name}:\n${links.map((e) => `• ${label(other(e))}${e.label ? ` (${e.label})` : ""}`).join("\n")}`,
          referencedContactIds: [c.id, ...links.map(other).filter((id) => id !== "me")],
          gaps: [],
          paths: [],
        }
      : { answer: `You haven't recorded who ${c.name} knows yet. Add connections from their profile in My Circle.`, referencedContactIds: [c.id], gaps: [`connections for ${c.name}`], paths: [] };
  }

  // 0b. Follow-ups: overall, by time window, or for one person.
  if (/\b(follow[- ]?ups?|reminders?|due|overdue|to-?dos?|commitments?|owe)\b/i.test(question) && !/\bremind me\b/i.test(question)) {
    const window = /\btoday\b/i.test(question) ? 0 : /\btomorrow\b/i.test(question) ? 1 : /\bthis week|next 7 days|next week\b/i.test(question) ? 7 : /\bthis month|next 30 days\b/i.test(question) ? 30 : null;
    const onlyOverdue = /\boverdue|late|missed\b/i.test(question);
    let list = reminders.filter((r) => !mentioned.length || mentioned.some((m) => m.id === r.contactId));
    if (onlyOverdue) list = list.filter((r) => r.dueDate && r.dueDate < today);
    else if (window !== null) list = list.filter((r) => r.dueDate && daysFrom(today, r.dueDate) <= window);
    list.sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
    const when = (d?: string) => {
      if (!d) return "no date";
      const n = daysFrom(today, d);
      return n < 0 ? `${-n} ${n === -1 ? "day" : "days"} overdue` : n === 0 ? "due today" : n === 1 ? "due tomorrow" : `due ${formatDay(d)}`;
    };
    const who = mentioned.length ? ` with ${mentioned.map((m) => m.name).join(" and ")}` : "";
    const scope = onlyOverdue ? " overdue" : window === 0 ? " due today" : window === 1 ? " due by tomorrow" : window === 7 ? " due in the next 7 days" : window === 30 ? " due in the next 30 days" : " open";
    return list.length
      ? {
          answer: `${list.length}${scope} ${list.length === 1 ? "follow-up" : "follow-ups"}${who}:\n${list
            .map((r) => `• ${r.title}${r.contactId && !mentioned.length ? ` (${nameById.get(r.contactId) ?? "someone"})` : ""}, ${when(r.dueDate)}`)
            .join("\n")}`,
          referencedContactIds: [...new Set(list.map((r) => r.contactId).filter((x): x is string => !!x && nameById.has(x)))],
          gaps: [],
          paths: [],
        }
      : { answer: `No${scope} follow-ups${who}.`, referencedContactIds: mentioned.map((m) => m.id), gaps: [], paths: [] };
  }

  // 0c. "Who are my mentors?": the relationship categories you set.
  const cat = CATEGORY_WORDS.find(([, rx]) => rx.test(question));
  if (cat && mentioned.length === 0 && /\b(who|list|show|which|my|all)\b/i.test(question)) {
    const hits = network.contacts.filter((c) => c.categories.includes(cat[0]));
    return hits.length
      ? {
          answer: `You've marked ${hits.length} ${hits.length === 1 ? "person" : "people"} as ${cat[0]}:\n${hits.map((c) => `• ${describe(c)}`).join("\n")}`,
          referencedContactIds: hits.map((c) => c.id),
          gaps: [],
          paths: [],
        }
      : { answer: `Nobody is marked as ${cat[0]} yet. You can set categories when you edit a person.`, referencedContactIds: [], gaps: [`contacts marked ${cat[0]}`], paths: [] };
  }

  // 0d. "Who did I talk to recently?": the latest notes across everyone.
  if (mentioned.length === 0 && /\b(recent(ly)?|lately|latest|last (few|week|month))\b/i.test(question) && /\b(talk|talked|spoke|spoken|met|meet|conversations?|interactions?|notes?|chat|caught up|saw)\b/i.test(question)) {
    const notes = [...network.interactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
    return notes.length
      ? {
          answer: `Your most recent conversations:\n${notes.map((i) => `• ${nameById.get(i.contactId) ?? "Someone"}, ${formatDay(i.date)} (${i.kind}): "${i.summary.length > 90 ? `${i.summary.slice(0, 90)}…` : i.summary}"`).join("\n")}`,
          referencedContactIds: [...new Set(notes.map((i) => i.contactId).filter((id) => nameById.has(id)))],
          gaps: [],
          paths: [],
          noteIds: notes.map((i) => i.id),
        }
      : { answer: "You haven't logged any conversations yet. Add one in Memory.", referencedContactIds: [], gaps: ["logged conversations"], paths: [] };
  }

  // 0e. "Who works in law?" / "Who's in the tech industry?": work fields only.
  const field = /\b(?:works?|working|is|are) (?:in|at|for)\s+(?:the\s+)?([a-z][a-z &'-]{1,40}?)(?:\s+(?:industry|field|sector|space|world))?\s*\??$/i.exec(question) ??
    /\bin (?:the\s+)?([a-z][a-z &'-]{1,40}?)\s+(?:industry|field|sector|space|world)\b/i.exec(question);
  if (field && mentioned.length === 0) {
    const hits = fieldHits(field[1], network.contacts);
    if (hits.length) {
      return {
        answer: `${hits.length} ${hits.length === 1 ? "person's" : "people's"} recorded work matches "${field[1]}":\n${hits.map((c) => `• ${describe(c)}`).join("\n")}`,
        referencedContactIds: hits.map((c) => c.id),
        gaps: [],
        paths: [],
      };
    }
  }

  // 1. Path questions: the answer is the BFS result from the map, nothing else.
  if (ctx.pathFacts.length > 0) {
    const p = ctx.pathFacts[0];
    const from = p.fromId === "me" ? "you" : nameById.get(p.fromId);
    const to = nameById.get(p.toId);
    const answer = p.found
      ? `${p.degrees === 1 ? `You recorded a direct connection between ${from} and ${to}.` : `The shortest chain you've recorded from ${from} to ${to} is ${p.names.join(" → ")}.`} That is ${degreeLabel(p.degrees!)}. Every step is a connection you saved yourself.`
      : `There's no recorded path from ${from} to ${to}. If you know how they're linked, add that connection in My Circle and the map will find it.`;
    return {
      answer,
      referencedContactIds: p.path.filter((id) => id !== "me"),
      gaps: p.found ? [] : [`a connection linking ${from} to ${to}`],
      paths: [{ found: p.found, names: p.names, degrees: p.degrees }],
    };
  }

  // 2. Introduction questions: the same evidence Discover uses.
  if (isIntroQuestion(question) && mentioned.length === 0) {
    const cands = discoverCandidates(network, 3);
    if (cands.length === 0) {
      return {
        answer: "I couldn't find any pairs with recorded shared interests or matching goals and skills.",
        referencedContactIds: [],
        gaps: ["interests, goals or skills on your contacts"],
        paths: [],
      };
    }
    const lines = cands.map((c) => `• ${nameById.get(c.aId)} and ${nameById.get(c.bId)}: ${c.evidence[0].detail}.`);
    return {
      answer: `Based on what you've recorded, these introductions might be worth considering:\n${lines.join("\n")}\nThese are possibilities, not certainties. Open Discover for more detail.`,
      referencedContactIds: [...new Set(cands.flatMap((c) => [c.aId, c.bId]))],
      gaps: [],
      paths: [],
    };
  }

  // 3. A named person: their profile and the latest timeline entry.
  if (mentioned.length > 0) {
    const c = mentioned[0];
    const notes = network.interactions
      .filter((i) => i.contactId === c.id)
      .sort((a, b) => b.date.localeCompare(a.date));
    const parts = [describe(c) + "."];
    const gaps: string[] = [];
    if (notes.length > 0) {
      parts.push(`Your latest note (${notes[0].kind}, ${formatDay(notes[0].date)}): "${notes[0].summary}"`);
      if (notes.length > 1) parts.push(`You have ${notes.length} timeline entries with ${c.name.split(" ")[0]} in total.`);
    } else {
      gaps.push(`any conversations with ${c.name}`);
    }
    if (c.goals.length) parts.push(`Recorded goals: ${list(c.goals)}.`);
    if (c.interests.length) parts.push(`Interests: ${list(c.interests)}.`);
    if (!isLastTalkQuestion(question) && c.notes) parts.push(`Your notes: ${c.notes}`);
    const open = reminders.filter((r) => r.contactId === c.id);
    if (open.length) parts.push(`Open follow-ups: ${open.map((r) => (r.dueDate ? `${r.title} (${formatDay(r.dueDate)})` : r.title)).join("; ")}.`);
    return { answer: parts.join("\n"), referencedContactIds: [c.id], gaps, paths: [], noteIds: notes.slice(0, 1).map((n) => n.id) };
  }

  // 4. A place: match the recorded location field only.
  const place = placeQuery(question);
  if (place) {
    const want = tokens(place);
    const hits = network.contacts.filter((c) => {
      const loc = tokens(c.location ?? "");
      return want.length > 0 && want.every((w) => loc.includes(w));
    });
    const work = hits.length ? [] : fieldHits(place, network.contacts);
    if (work.length) {
      return {
        answer: `Nobody's recorded location matches "${place}", but ${work.length} ${work.length === 1 ? "person's" : "people's"} work does:\n${work.map((c) => `• ${describe(c)}`).join("\n")}`,
        referencedContactIds: work.map((c) => c.id),
        gaps: [],
        paths: [],
      };
    }
    return hits.length
      ? {
          answer: `You've recorded ${hits.length} ${hits.length === 1 ? "person" : "people"} in ${place}:\n${hits.map((c) => `• ${describe(c)}`).join("\n")}`,
          referencedContactIds: hits.map((c) => c.id),
          gaps: [],
          paths: [],
        }
      : {
          answer: `Nobody in your records has a location matching "${place}".`,
          referencedContactIds: [],
          gaps: [`contacts located in ${place}`],
          paths: [],
        };
  }

  // 5. Anything else: keyword search over contacts and notes.
  const q = new Set(tokens(question));
  const scored = network.contacts
    .map((c) => ({ c, score: tokens(contactSearchText(c)).filter((t) => q.has(t)).length }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
  const noteHits = network.interactions
    .filter((i) => tokens(i.summary).some((t) => q.has(t)))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);
  if (scored.length === 0 && noteHits.length === 0) {
    return {
      answer: `I couldn't find anything in your records that matches, and I only answer from what you've saved. ${capabilityText()}`,
      referencedContactIds: [],
      gaps: ["records matching your question"],
      paths: [],
    };
  }
  const parts: string[] = [];
  if (scored.length) parts.push(`People whose records match:\n${scored.map((s) => `• ${describe(s.c)}`).join("\n")}`);
  if (noteHits.length)
    parts.push(
      `Matching notes:\n${noteHits.map((i) => `• ${nameById.get(i.contactId) ?? "Someone"}, ${formatDay(i.date)}: "${i.summary}"`).join("\n")}`,
    );
  return {
    answer: parts.join("\n\n"),
    referencedContactIds: [...new Set([...scored.map((s) => s.c.id), ...noteHits.map((i) => i.contactId)])].filter((id) =>
      nameById.has(id),
    ),
    gaps: [],
    paths: [],
    noteIds: noteHits.map((i) => i.id),
  };
}

/* -------------------------------- DISCOVER -------------------------------- */

export interface Suggestion extends Candidate {
  headline: string;
  rationale: string;
  confidence: "low" | "medium" | "high";
}

function headlineFor(c: Candidate, a: PayloadContact, b: PayloadContact) {
  const goal = c.evidence.find((e) => e.kind === "goal_match");
  if (goal) {
    const seeker = goal.detail.startsWith(a.name) ? a : b;
    const helper = seeker === a ? b : a;
    return `${helper.name.split(" ")[0]} might help with ${seeker.name.split(" ")[0]}'s goal`;
  }
  const shared = c.evidence.filter((e) => e.kind === "shared_interest").length;
  if (!shared && c.evidence.some((e) => e.kind === "same_field")) return "Same field of work";
  return shared > 1 ? "Several shared interests" : "A shared interest";
}

/** Turn the app's own evidence into a plain sentence and a support level. */
export function suggestIntroductions(network: NetworkPayload, limit = 8): Suggestion[] {
  const byId = new Map(network.contacts.map((c) => [c.id, c]));
  return discoverCandidates(network, limit).map((c) => {
    const a = byId.get(c.aId)!;
    const b = byId.get(c.bId)!;
    const kinds = new Set(c.evidence.map((e: Evidence) => e.kind));
    const confidence: Suggestion["confidence"] = c.score >= 5 ? "high" : c.score >= 3 ? "medium" : "low";
    const reasons = [
      kinds.has("goal_match") && "one person's recorded goal lines up with the other's work or skills",
      kinds.has("shared_interest") && "they list the same interest",
      kinds.has("same_field") && "they work in the same field",
      kinds.has("mutual_connection") && "you've recorded someone who knows them both",
      kinds.has("same_location") && "they're recorded in the same city",
    ].filter(Boolean) as string[];
    return {
      ...c,
      headline: headlineFor(c, a, b),
      rationale: `${a.name} and ${b.name} aren't connected in your records yet, but ${list(reasons)}. This might be worth an introduction if both are open to it.`,
      confidence,
    };
  });
}

export interface Draft {
  subject: string;
  body: string;
  sharedDetails: string[];
}

/** A double-opt-in introduction template the user edits and sends themselves. */
export function draftIntroduction(a: PayloadContact, b: PayloadContact, evidence: Evidence[], senderName: string): Draft {
  const first = (c: PayloadContact) => c.name.split(" ")[0];
  const intro = (c: PayloadContact) =>
    [c.occupation, c.organization && `at ${c.organization}`].filter(Boolean).join(" ") || "someone I know";
  const why = evidence
    .filter((e) => e.kind !== "same_location")
    .map((e) => `• ${e.detail}`)
    .join("\n") || "• [Add a line on why you thought of them]";
  const sharedDetails = [
    a.occupation && `${a.name}'s occupation`,
    a.organization && `${a.name}'s organization`,
    b.occupation && `${b.name}'s occupation`,
    b.organization && `${b.name}'s organization`,
    ...evidence.filter((e) => e.kind !== "same_location").map((e) => e.detail),
  ].filter(Boolean) as string[];
  return {
    subject: `Introduction: ${first(a)} and ${first(b)}?`,
    body: `Hi ${first(a)} and ${first(b)},

I thought you two might enjoy meeting. ${first(a)} is ${intro(a)}, and ${first(b)} is ${intro(b)}.

Why I thought of you both:
${why}

No pressure at all. If you're both happy to connect, reply and I'll leave it to you from there.

Best,
${senderName || "Me"}`,
    sharedDetails,
  };
}
