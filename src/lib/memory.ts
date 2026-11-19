/**
 * RELATIONSHIP MEMORY, in plain code (no AI):
 * - search across every note you've written,
 * - spot promises and follow-ups in a note from its wording,
 * - a per-person summary where every line points at the notes it came from.
 *
 * Nothing here guesses facts about people. Detection only reads the words you
 * wrote, and suggestions are shown to you before anything is saved.
 */
import type { Contact, Interaction, Reminder } from "./types";

/* --------------------------------- SEARCH --------------------------------- */

const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function queryTerms(q: string): string[] {
  return [...new Set(fold(q).split(/[^a-z0-9@.'-]+/).map((t) => t.replace(/^['.-]+|['.-]+$/g, "")).filter((t) => t.length >= 2))];
}

export interface NoteHit {
  interaction: Interaction;
  contactName: string;
  /** Character ranges in the summary to highlight. */
  ranges: [number, number][];
  score: number;
}

/** Every note containing all the search words (in the note or the person's name), newest first. */
export function searchNotes(query: string, interactions: Interaction[], contacts: Contact[]): NoteHit[] {
  const terms = queryTerms(query);
  if (!terms.length) return [];
  const names = new Map(contacts.map((c) => [c.id, c.name]));
  const hits: NoteHit[] = [];
  for (const i of interactions) {
    const name = names.get(i.contactId) ?? "";
    const text = fold(i.summary);
    const who = fold(name);
    if (!terms.every((t) => text.includes(t) || who.includes(t))) continue;
    const ranges: [number, number][] = [];
    let score = 0;
    for (const t of terms) {
      let from = 0;
      let at: number;
      while ((at = text.indexOf(t, from)) !== -1) {
        ranges.push([at, at + t.length]);
        score++;
        from = at + t.length;
      }
    }
    hits.push({ interaction: i, contactName: name, ranges: mergeRanges(ranges), score });
  }
  return hits.sort((a, b) => b.interaction.date.localeCompare(a.interaction.date) || b.score - a.score);
}

function mergeRanges(r: [number, number][]): [number, number][] {
  const s = [...r].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const x of s) {
    const last = out.at(-1);
    if (last && x[0] <= last[1]) last[1] = Math.max(last[1], x[1]);
    else out.push([...x]);
  }
  return out;
}

/* ------------------------------ COMMITMENTS ------------------------------- */

export interface Commitment {
  /** Suggested follow-up title. */
  title: string;
  /** YYYY-MM-DD when the note gives a time ("by Friday", "next week"). */
  dueDate?: string;
  /** "me" = something you promised; "them" = something they promised you, to check on. */
  owner: "me" | "them";
  /** The sentence it came from, shown so you can judge it. */
  sentence: string;
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

const iso = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
const fromIso = (s: string) => new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)));
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

/** Turn time words in a sentence into a date, relative to the day the note is about. */
export function findDueDate(sentence: string, noteDate: string): string | undefined {
  const s = fold(sentence);
  const base = fromIso(noteDate);
  if (/\b(today|tonight|this evening)\b/.test(s)) return iso(base);
  if (/\btomorrow\b/.test(s)) return iso(addDays(base, 1));
  let m = /\bin (\d{1,2}|a|one|two|three|four) (day|week|month)s?\b/.exec(s);
  if (m) {
    const n = ({ a: 1, one: 1, two: 2, three: 3, four: 4 } as Record<string, number>)[m[1]] ?? +m[1];
    if (m[2] === "day") return iso(addDays(base, n));
    if (m[2] === "week") return iso(addDays(base, 7 * n));
    const d = new Date(base);
    d.setUTCMonth(d.getUTCMonth() + n);
    return iso(d);
  }
  if (/\bnext week\b/.test(s)) return iso(addDays(base, ((8 - base.getUTCDay()) % 7) || 7)); // next Monday
  if (/\b(this weekend|over the weekend)\b/.test(s)) return iso(addDays(base, (6 - base.getUTCDay() + 7) % 7 || 7));
  if (/\b(end of (the )?month)\b/.test(s)) return iso(new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)));
  m = new RegExp(`\\b(next )?(${WEEKDAYS.join("|")})\\b`).exec(s);
  if (m) {
    const target = WEEKDAYS.indexOf(m[2]);
    let diff = (target - base.getUTCDay() + 7) % 7 || 7;
    if (m[1]) diff += diff < 7 ? 7 : 0;
    return iso(addDays(base, diff));
  }
  m = new RegExp(`\\b(${MONTHS.join("|")}|${MONTHS.map((x) => x.slice(0, 3)).join("|")})\\.? (\\d{1,2})(st|nd|rd|th)?\\b`).exec(s);
  if (m) {
    const month = MONTHS.findIndex((x) => x.startsWith(m![1].slice(0, 3)));
    let d = new Date(Date.UTC(base.getUTCFullYear(), month, +m[2]));
    if (d.getUTCMonth() !== month) return undefined;
    if (d < base) d = new Date(Date.UTC(base.getUTCFullYear() + 1, month, +m[2]));
    return iso(d);
  }
  m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /\b(\d{1,2})\/(\d{1,2})\b/.exec(s);
  if (m && +m[1] <= 12 && +m[2] <= 31) {
    let d = new Date(Date.UTC(base.getUTCFullYear(), +m[1] - 1, +m[2]));
    if (d < base) d = new Date(Date.UTC(base.getUTCFullYear() + 1, +m[1] - 1, +m[2]));
    return iso(d);
  }
  return undefined;
}

const MINE =
  /\b(i(?:'ll| will| shall)|i promised(?: to)?|i need to|i have to|i should|i owe (?:him|her|them)|i agreed to|i offered to|i said i(?:'d| would)|remind me to|note to self:?|todo:?|to do:?)\s+(.+)/i;
const THEIRS =
  /\b(?:(?:s?he|they)(?:'ll| will)|(?:s?he|they) promised(?: to)?|(?:s?he|they) said (?:s?he|they)(?:'d| would)|(?:s?he|they) offered to)\s+(.+)/i;
const FOLLOW_UP = /\b(follow up|check in|circle back|get back to (?:him|her|them))\b(.*)/i;

const TIME_TAIL = new RegExp(
  `\\s*\\b(by|on|before|next|this|in|at the|at|over the)?\\s*(today|tonight|tomorrow|next week|this weekend|the weekend|end of (the )?month|in (\\d+|a|one|two|three|four) (days?|weeks?|months?)|${WEEKDAYS.join("|")}|(${MONTHS.join("|")})\\.? \\d{1,2}(st|nd|rd|th)?|\\d{1,2}/\\d{1,2}|\\d{4}-\\d{2}-\\d{2})\\b.*$`,
  "i",
);

/** Clean a follow-up title: drop trailing time words and punctuation, capitalise. */
export function tidy(action: string) {
  const a = action
    .replace(TIME_TAIL, "")
    .replace(/[.!?,;:\s]+$/, "")
    .trim();
  return a ? a[0].toUpperCase() + a.slice(1) : "";
}

const swapPronouns = (s: string) => s.replace(/\bme\b/gi, "you").replace(/\bmy\b/gi, "your");

/** Promises and follow-ups written in a note. Wording-based, so it can miss or misread; you review each one. */
export function detectCommitments(note: string, noteDate: string, personName?: string): Commitment[] {
  const sentences = note
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?;])\s+|\s+(?:and|but) (?=i(?:'ll| will| promised| need| should)\b)/i)
    .map((s) => s.trim())
    .filter(Boolean);
  const first = personName?.split(" ")[0];
  const out: Commitment[] = [];
  for (const sentence of sentences) {
    let m = MINE.exec(sentence);
    if (m) {
      const title = tidy(m[2]);
      if (title && title.split(" ").length >= 2) out.push({ title, dueDate: findDueDate(sentence, noteDate), owner: "me", sentence });
      continue;
    }
    m = THEIRS.exec(sentence);
    if (m) {
      const action = tidy(swapPronouns(m[1]));
      if (action && action.split(" ").length >= 2) {
        out.push({
          title: `Check on: ${first ?? "they"} to ${action.charAt(0).toLowerCase()}${action.slice(1)}`,
          dueDate: findDueDate(sentence, noteDate),
          owner: "them",
          sentence,
        });
      }
      continue;
    }
    m = FOLLOW_UP.exec(sentence);
    if (m) {
      const rest = tidy(m[2].replace(/^\s*(with \w+|on|about)?\s*/i, (x) => (/(on|about)/i.test(x) ? "on " : "")));
      out.push({
        title: `${m[1][0].toUpperCase()}${m[1].slice(1)}${first ? ` with ${first}` : ""}${rest ? ` ${rest.charAt(0).toLowerCase()}${rest.slice(1)}` : ""}`,
        dueDate: findDueDate(sentence, noteDate),
        owner: "me",
        sentence,
      });
    }
  }
  return out;
}

/* -------------------------------- SUMMARY --------------------------------- */

export interface SummaryLine {
  label: string;
  text: string;
  /** Notes this line is based on, newest first. Empty for lines from the profile itself. */
  sources: string[];
}

const STOP = new Set(
  "the a an and or but to of in on at for with about from that this it is was were be been are he she they them his her their we i you me my our your had has have did do does just also very really some more most into over after before then than as so if not no yes up out about would could should will can said says told talked talk chat chatted met meet meeting call called coffee lunch dinner quick caught catch week today yesterday tomorrow".split(
    " ",
  ),
);

/** A digest built only from your own records. Every line names the notes it came from. */
export function summarizePerson(contact: Contact, interactions: Interaction[], reminders: Reminder[], todayISO: string): SummaryLine[] {
  const notes = interactions.filter((i) => i.contactId === contact.id).sort((a, b) => b.date.localeCompare(a.date));
  const lines: SummaryLine[] = [];
  if (!notes.length) return lines;

  const last = notes[0];
  const days = Math.round((fromIso(todayISO).getTime() - fromIso(last.date).getTime()) / 86_400_000);
  lines.push({
    label: "Last time",
    text: `${days <= 0 ? "Today" : days === 1 ? "Yesterday" : `${days} days ago`} (${last.kind}): ${last.summary.length > 140 ? `${last.summary.slice(0, 140)}…` : last.summary}`,
    sources: [last.id],
  });
  lines.push({
    label: "History",
    text: `${notes.length} ${notes.length === 1 ? "conversation" : "conversations"} logged since ${notes.at(-1)!.date}`,
    sources: notes.map((n) => n.id),
  });

  // Words that come up in at least two different notes.
  const seen = new Map<string, Set<string>>();
  for (const n of notes) {
    const words = new Set(
      fold(n.summary)
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length > 3 && !STOP.has(w)),
    );
    for (const w of words) {
      if (!seen.has(w)) seen.set(w, new Set());
      seen.get(w)!.add(n.id);
    }
  }
  const recurring = [...seen.entries()]
    .filter(([, ids]) => ids.size >= 2)
    .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))
    .slice(0, 5);
  if (recurring.length) {
    lines.push({
      label: "Keeps coming up",
      text: recurring.map(([w, ids]) => `${w} (${ids.size} notes)`).join(", "),
      sources: [...new Set(recurring.flatMap(([, ids]) => [...ids]))],
    });
  }

  const open = reminders.filter((r) => r.contactId === contact.id && !r.done);
  if (open.length) {
    lines.push({
      label: "Open follow-ups",
      text: open.map((r) => (r.dueDate ? `${r.title} (by ${r.dueDate})` : r.title)).join("; "),
      sources: [...new Set(open.map((r) => r.sourceInteractionId).filter((x): x is string => !!x))],
    });
  }
  return lines;
}
