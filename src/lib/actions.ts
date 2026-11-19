/**
 * ASK 6IX ACTIONS, in plain code (no AI).
 *
 * Turns a question into things you can do next: open a profile, draft a
 * message, or create a follow-up. Requests are recognised from their wording
 * ("remind me to…", "draft a message to…"). Drafts use only facts you saved.
 * Nothing here changes data: the page asks you to confirm before saving.
 */
import { answerQuestion, draftIntroduction, type Answer, type AskOptions, type Draft } from "./assistant";
import { findDueDate, tidy } from "./memory";
import { hasConnection } from "./graph";
import { findMentioned, pairEvidence } from "./retrieval";
import type { NetworkPayload, PayloadContact } from "./validation";

export type AskAction =
  | { type: "open"; contactId: string }
  | { type: "draft"; contactIds: string[]; draft: Draft & { basedOn: string[] } }
  | { type: "reminder"; contactId?: string; title: string; dueDate?: string };

export interface ActionAnswer extends Answer {
  actions: AskAction[];
}

const first = (c: PayloadContact) => c.name.split(" ")[0];
const GOAL_VERB =
  /^(start|meet|find|get|land|move|build|become|learn|apply|launch|grow|raise|join|break|switch|write|publish|go|work|open|make|create|hire|travel|run|lead|finish|pass|transition|pivot|connect|secure|study|teach)\b/i;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/** A friendly check-in, built only from what you recorded about them. */
export function draftCheckIn(c: PayloadContact, network: NetworkPayload, today: string): Draft & { basedOn: string[] } {
  const notes = network.interactions.filter((i) => i.contactId === c.id).sort((a, b) => b.date.localeCompare(a.date));
  const basedOn: string[] = [];
  const lines: string[] = [];
  const last = notes[0];
  if (last && daysBetween(last.date, today) <= 14) {
    lines.push("It was great catching up recently.");
    basedOn.push(`Your last note with ${first(c)} (${last.date})`);
  } else if (last) {
    lines.push("It's been a while since we last caught up, and I wanted to say hello.");
    basedOn.push(`Your last note with ${first(c)} (${last.date})`);
  } else {
    lines.push("I wanted to reach out and say hello.");
  }
  const goal = c.goals[0];
  const interest = c.interests[0];
  if (goal) {
    lines.push(GOAL_VERB.test(goal) ? `I remember you were hoping to ${goal}. How's that going?` : `I remember you mentioned ${goal}. How's that going?`);
    basedOn.push(`Their recorded goal: ${goal}`);
  } else if (interest) {
    lines.push(`Have you been up to anything with ${interest} lately?`);
    basedOn.push(`Their recorded interest: ${interest}`);
  } else {
    lines.push("How have things been?");
  }
  return {
    subject: "Catching up",
    body: `Hi ${first(c)},\n\n${lines.join(" ")}\n\nWould you be up for a quick coffee or call in the next couple of weeks?\n\nBest,\n${network.profileName || "Me"}`,
    sharedDetails: [],
    basedOn,
  };
}

const REMINDER =
  /\b(?:remind me to|set (?:a |up a )?reminder to|add (?:a )?(?:follow[- ]?up|reminder|to-?do)(?: to| for| about)?|create (?:a )?(?:follow[- ]?up|reminder)(?: to| for| about)?|(follow up with))\s+(.+)/i;
const DRAFT =
  /\b(draft|write|compose|prepare)\b.*\b(message|email|text|note|intro|introduction|check-?in)\b|\b(help me )?(reach out to|reconnect with)\b|\bsend (?:a |an )?(message|email|text|note)\b/i;
const OPEN = /^\s*(?:please\s+)?(open|show(?: me)?|view|pull up|go to)\b/i;

/** Answer a question, and offer the actions that fit it. */
export function askWithActions(question: string, network: NetworkPayload, today: string, opts: AskOptions = {}): ActionAnswer {
  const mentioned = findMentioned(question, network.contacts);
  const person = mentioned[0];

  // "Remind me to send Marcus the deck on Friday"
  const r = REMINDER.exec(question);
  if (r) {
    const raw = r[1] ? `follow up with ${r[2]}` : r[2];
    const title = tidy(raw.replace(/[?]+$/, ""));
    if (title) {
      const dueDate = findDueDate(question, today);
      return {
        answer: `Here's the follow-up I'd save${person ? ` for ${person.name}` : ""}. Check the wording and date, then tap Save. Nothing is saved until you do.${
          person ? "" : "\nIt isn't linked to anyone, because your request doesn't name a saved person."
        }`,
        referencedContactIds: person ? [person.id] : [],
        gaps: [],
        paths: [],
        actions: [{ type: "reminder", contactId: person?.id, title, dueDate }],
      };
    }
  }

  // "Draft a message to Priya" / "Write an intro for Marcus and Leo"
  if (DRAFT.test(question)) {
    if (mentioned.length >= 2 && /intro/i.test(question)) {
      const [a, b] = mentioned;
      const evidence = pairEvidence(a, b, network.connections, (id) => network.contacts.find((c) => c.id === id)?.name ?? "someone");
      const linked = hasConnection(network.connections, a.id, b.id);
      const d = draftIntroduction(a, b, evidence, network.profileName);
      return {
        answer: `${linked ? `Your records say ${a.name} and ${b.name} already know each other, so check they need an introduction. ` : ""}Here's an introduction draft for them. ${
          evidence.length ? "It mentions what they have in common in your records." : "Your records don't show what they have in common, so add a line on why."
        } Edit it, then copy it or open it in your email app. Nothing is sent for you.`,
        referencedContactIds: [a.id, b.id],
        gaps: evidence.length ? [] : [`anything ${a.name} and ${b.name} have in common`],
        paths: [],
        actions: [{ type: "draft", contactIds: [a.id, b.id], draft: { ...d, basedOn: d.sharedDetails } }, { type: "open", contactId: a.id }, { type: "open", contactId: b.id }],
      };
    }
    if (person) {
      const d = draftCheckIn(person, network, today);
      return {
        answer: `Here's a check-in draft for ${person.name}, written from what you've recorded. Edit it, then copy it or open it in your email or text app. Nothing is sent for you.`,
        referencedContactIds: [person.id],
        gaps: d.basedOn.length ? [] : [`notes, goals or interests for ${person.name}, so the draft is generic`],
        paths: [],
        actions: [{ type: "draft", contactIds: [person.id], draft: d }, { type: "open", contactId: person.id }],
      };
    }
    return {
      answer: "Who should the message go to? Include the name of someone in your circle, for example \"Draft a message to Marcus\".",
      referencedContactIds: [],
      gaps: ["a saved person named in your request"],
      paths: [],
      actions: [],
    };
  }

  // "Open Marcus"
  if (OPEN.test(question) && person) {
    return { answer: `Here's ${person.name}.`, referencedContactIds: [person.id], gaps: [], paths: [], actions: [{ type: "open", contactId: person.id }] };
  }

  // Everything else: the usual answer, plus next steps when it's about one person.
  const a = answerQuestion(question, network, { ...opts, today });
  const actions: AskAction[] = [];
  if (a.referencedContactIds.length === 1 && a.paths.length === 0) {
    const c = network.contacts.find((x) => x.id === a.referencedContactIds[0]);
    if (c) {
      actions.push({ type: "open", contactId: c.id });
      actions.push({ type: "draft", contactIds: [c.id], draft: draftCheckIn(c, network, today) });
      actions.push({ type: "reminder", contactId: c.id, title: `Follow up with ${first(c)}` });
    }
  }
  return { ...a, actions };
}
