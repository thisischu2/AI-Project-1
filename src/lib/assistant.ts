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

/** Answer a question about the user's own network, using only stored records. */
export function answerQuestion(question: string, network: NetworkPayload): Answer {
  const ctx = selectForAsk(question, network);
  const mentioned = findMentioned(question, network.contacts);
  const nameById = new Map(network.contacts.map((c) => [c.id, c.name]));

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
    return { answer: parts.join("\n"), referencedContactIds: [c.id], gaps, paths: [] };
  }

  // 4. A place: match the recorded location field only.
  const place = placeQuery(question);
  if (place) {
    const want = tokens(place);
    const hits = network.contacts.filter((c) => {
      const loc = tokens(c.location ?? "");
      return want.length > 0 && want.every((w) => loc.includes(w));
    });
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
      answer:
        "I couldn't find anything in your records that matches. Try a person's name, a city (\"Who do I know in Toronto?\"), or a topic like \"AI policy\".",
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
    .join("\n");
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
