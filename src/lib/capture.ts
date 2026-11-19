/**
 * CONTACT CAPTURE, in plain code (no AI).
 *
 * Reads a description you typed ("Met Sarah Lee at the ABA conference. She's an
 * associate at Hartwell Lane in New York, into legal tech…") and fills in what the
 * wording plainly says. Every value keeps the words it came from, so the review
 * screen can show why. Anything not clearly written stays blank: nothing is
 * guessed or looked up, and nothing is saved until you approve it.
 */
import { nameTokens } from "./duplicates";
import { parseBirthday, type ContactInput } from "./importers";
import type { Category, Contact } from "./types";

export type CaptureField =
  | "name"
  | "occupation"
  | "organization"
  | "location"
  | "email"
  | "phone"
  | "metContext"
  | "interests"
  | "goals"
  | "skills"
  | "categories"
  | "birthday";

export interface Found {
  field: CaptureField;
  value: string;
  /** The words in the description this came from. */
  from: string;
}

export interface Capture {
  contact: ContactInput;
  found: Found[];
  /** "introduced by Marcus" — with the saved people that name could be. */
  introducer?: { name: string; from: string; kind: "introduced" | "relation"; matches: Pick<Contact, "id" | "name">[] };
}

export const MAX_DESCRIPTION = 2000;

// A person's name: 1–3 capitalised words, allowing particles (de, van…), apostrophes, hyphens and accents.
const WORD = "\\p{Lu}[\\p{L}'’-]*";
const NAME = `${WORD}(?:\\s+(?:(?:de|da|del|della|di|van|von|der|den|la|le|bin|al|du|dos)\\s+)?${WORD}){0,2}`;
const TITLE = "(?:(?:Dr|Prof|Professor|Mr|Mrs|Ms|Mx|Judge|Justice)\\.?\\s+)?";
// An organisation: capitalised words (or numbers), joined by small words like "of" or "&".
const ORGW = "[\\p{Lu}\\d](?:[\\p{L}\\d&'’-]|\\.(?=[\\p{L}\\d]))*";
const ORG = `(?:the\\s+)?${ORGW}(?:\\s+(?:(?:of|for|and|&|the|de|on)\\s+)?${ORGW}){0,5}`;
const PLACE = `${WORD}(?:\\s+${WORD}){0,2}(?:,\\s*${WORD}(?:\\s+${WORD})?)?`;
const STOP = "[^.;!?\\n]";

const NOT_NAMES = new Set(
  "i we you he she they it the a an my our met meet coffee lunch dinner drinks talked spoke chatted had today yesterday tonight this last next just call called new great quick really also and but so then she's he's they're i'm we're monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december".split(
    " ",
  ),
);

const re = (s: string, flags = "u") => new RegExp(s, flags);
/** Let a lowercase phrase also match at the start of a sentence ("lives in" → "[lL]ives in"). */
const ci = (s: string) => s.replace(/(?<![\\\w[])([a-z])/g, (_, c: string) => `[${c}${c.toUpperCase()}]`);
const RELATIONS = "cousin|friend|sister|brother|colleague|coworker|co-worker|classmate|roommate|mentor|boss|neighbou?r|partner|wife|husband|son|daughter|aunt|uncle";
const clean = (s: string) =>
  s
    .replace(/\s+/g, " ")
    .replace(/^[\s,:-]+|[\s,;:.!?-]+$/g, "")
    .trim();
const okName = (s: string) => !NOT_NAMES.has(s.split(/\s+/)[0].toLowerCase());
const splitList = (s: string) =>
  s
    .split(/,\s*|\s+and\s+|\s+or\s+|\s*&\s*|\s*\/\s*/)
    .map((x) => clean(x.replace(/^(?:the|a|an|also|really|very|especially)\s+/i, "")))
    .filter((x) => x && x.split(" ").length <= 5);
// Cut a free-text phrase where a new clause starts ("…, and she wants…", "… but …").
const clause = (s: string) =>
  clean(
    s.split(
      /\s+(?:but|because|so|which|who|while)\s+|,?\s+and\s+(?:s?he|they|i|we|her|his|their|loves|likes|enjoys|wants|is|has|works|lives|studies|plays|hopes|plans|speaks)\b/i,
    )[0],
  );

const CATEGORY_WORDS: [Category, RegExp][] = [
  ["classmate", /\b(classmates?|in my [\w-]+ class|study group|same cohort|1L section|law school friend)\b/i],
  ["mentor", /\b(mentor|professor|advis[eo]r|supervisor|my boss)\b/i],
  ["colleague", /\b(colleague|coworker|co-worker|works with me|my team|same firm)\b/i],
  ["collaborator", /\b(collaborat\w*|co-founder|cofounder|working together on|partner on)\b/i],
  ["family", /\b(cousin|sister|brother|aunt|uncle|mom|dad|mother|father|niece|nephew|grandma|grandpa|in-law)\b/i],
  ["friend", /\b(friend|buddy|roommate)\b/i],
  ["community", /\b(neighbou?r|church|mosque|temple|synagogue|volunteer\w*|club|meetup|alumni)\b/i],
];

export function extractContact(text: string, contacts: Pick<Contact, "id" | "name">[] = []): Capture {
  const t = text.slice(0, MAX_DESCRIPTION).replace(/\s+/g, " ").trim();
  const found: Found[] = [];
  const add = (field: CaptureField, value: string | undefined, from: string) => {
    const v = value && clean(value);
    if (v && !found.some((f) => f.field === field && f.value.toLowerCase() === v.toLowerCase())) found.push({ field, value: v, from: clean(from) });
  };
  const first = (field: CaptureField) => found.find((f) => f.field === field)?.value;

  // Email and phone: exact patterns only.
  const email = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/.exec(t);
  if (email) add("email", email[0].toLowerCase(), email[0]);
  for (const m of t.matchAll(/(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?)?\d[\d\s.-]{5,}\d/g)) {
    if (/\b\d{4}-\d{2}-\d{2}\b/.test(m[0])) continue;
    if (m[0].replace(/\D/g, "").length >= 7) {
      add("phone", m[0].trim(), m[0]);
      break;
    }
  }

  // Name, strongest wording first.
  const namePatterns = [
    re(
      `\\b${ci("(?:met|meeting|talked (?:to|with)|spoke (?:to|with)|chatted with|coffee with|lunch with|dinner with|drinks with|call with|introduced to|connected with|ran into)")}\\s+${TITLE}(${NAME})`,
    ),
    re(`\\b${ci("(?:name is|named|called)")}\\s+${TITLE}(${NAME})`),
    re(`\\b(?:[Mm]y|[Hh]is|[Hh]er|[Tt]heir|\\p{Lu}\\p{L}+'s)\\s+(?:${RELATIONS})\\s+${TITLE}(${NAME})`),
    re(`^${TITLE}(${NAME})(?=\\s*(?:[,(:—–-]|\\s(?:is|was|works|from|studies|runs|leads|teaches|just|wants|lives)\\b|$))`),
  ];
  for (const p of namePatterns) {
    const m = p.exec(t);
    if (m && okName(m[1])) {
      add("name", m[1], m[0]);
      break;
    }
  }

  // Job and workplace.
  const role = `([a-z0-9][\\w'’-]*(?:\\s+[\\w'’-]+){0,4}?)`;
  const where = `(?:\\s+in\\s+(${PLACE}))?`;
  const jobPatterns: [RegExp, number, number, number][] = [
    // [pattern, role group, org group, place group]
    [re(`\\b${ci("(?:is|was|she's|he's|they're|she is|he is|they are|works as|working as|currently|now)")}\\s+(?:a|an|the)\\s+${role}\\s+(?:at|for|with)\\s+(${ORG})${where}`), 1, 2, 3],
    [re(`(?:^|,\\s*|—\\s*|-\\s+)(?:a|an)?\\s*${role}\\s+at\\s+(${ORG})${where}`), 1, 2, 3],
  ];
  for (const [p, r, o, w] of jobPatterns) {
    const m = p.exec(t);
    if (m && m[o]) {
      if (!/^(meeting|conference|event|party|dinner|lunch|coffee|wedding|panel|reception)$/i.test(m[r])) add("occupation", m[r].replace(/^(?:a|an)\s+/i, ""), m[0]);
      add("organization", m[o].replace(/^the\s+/i, (x) => (/^the\s+\p{Lu}/u.test(m[o]) ? x : "")), m[0]);
      if (m[w]) add("location", m[w], m[0]);
      break;
    }
  }
  if (!first("organization")) {
    const m = re(`\\b(works|working|interns|interning|clerks|clerking|studies|studying|teaches|teaching)\\s+(?:at|for)\\s+(${ORG})${where}`).exec(t.replace(/\b(Works|Working|Interns|Interning|Clerks|Clerking|Studies|Studying|Teaches|Teaching)\b/g, (w) => w.toLowerCase()));
    if (m) {
      const job = { interns: "Intern", interning: "Intern", clerks: "Law clerk", clerking: "Law clerk", studies: "Student", studying: "Student", teaches: "Teacher", teaching: "Teacher" }[m[1]];
      if (job) add("occupation", job, m[0]);
      add("organization", m[2], m[0]);
      if (m[3]) add("location", m[3], m[0]);
    }
  }

  // Where they live.
  const loc = re(`\\b${ci("(?:lives in|living in|based in|located in|moved to|moving to|relocating to|is from|originally from|grew up in)")}\\s+(${PLACE})`).exec(t);
  if (loc) add("location", loc[1], loc[0]);

  // How you met.
  const met = re(`\\b(?:[Mm]et|[Mm]eeting)\\s+(?:${TITLE}${NAME}\\s+|(?:him|her|them)\\s+)?((?:at|during|in|on|through|via)\\s+${STOP}{3,80})`).exec(t);
  if (met) {
    const ctx = clause(met[1]);
    add("metContext", ctx.charAt(0).toUpperCase() + ctx.slice(1), met[0]);
  }

  // Who introduced you. Matched to saved people by name; never to anyone else.
  const relation = re(`(${NAME})'s\\s+(?:${RELATIONS})\\b`).exec(t);
  const intro =
    re(`\\b${ci("(?:introduced (?:to (?:me|us) )?by|introduction from|intro from|referred by|through|via)")}\\s+${TITLE}(${NAME})`).exec(t) ??
    re(`(${NAME})\\s+introduced (?:us|me)`).exec(t) ??
    relation;
  let introducer: Capture["introducer"];
  if (intro && okName(intro[1]) && intro[1] !== first("name")) {
    const want = nameTokens(intro[1]);
    const matches = contacts.filter((c) => {
      const have = nameTokens(c.name);
      return want.length > 0 && want.every((w, i) => have[i] === w);
    });
    introducer = { name: intro[1], from: clean(intro[0]), kind: intro === relation ? "relation" : "introduced", matches: matches.map(({ id, name }) => ({ id, name })) };
  }

  // Interests, goals, skills: the words after a clear phrase, split into a list.
  for (const m of t.matchAll(
    /\b(?:interested in|is into|she's into|he's into|they're into|really into|loves|passionate about|likes|enjoys|a fan of|big fan of|obsessed with|cares about)\s+([^.;!?\n]+)/gi,
  ))
    for (const x of splitList(clause(m[1]))) add("interests", x, m[0]);
  for (const m of t.matchAll(
    /\b(?:wants to|hoping to|hopes to|looking to|trying to|planning to|plans to|aims to|goal is to|dreams of)\s+([^.;!?\n]+)/gi,
  ))
    add("goals", clause(m[1]).replace(/^./, (c) => c.toLowerCase()), m[0]);
  for (const m of t.matchAll(/\b(looking for|applying (?:to|for)|seeking)\s+([^.;!?\n]+)/gi))
    add("goals", `${m[1].toLowerCase().replace("looking for", "find").replace("seeking", "find")} ${clause(m[2])}`.replace(/^applying/, "apply"), m[0]);
  for (const m of t.matchAll(/\b(?:good at|great at|expert (?:in|on)|skilled (?:in|at)|speciali[sz]es in|fluent in|speaks)\s+([^.;!?\n]+)/gi))
    for (const x of splitList(clause(m[1]))) add("skills", x, m[0]);

  // Relationship type from plain words ("classmate", "mentor", "cousin"…).
  // "Priya's cousin" says how they relate to Priya, not to you, so it's left out here.
  const aboutYou = t.replace(re(`\\p{Lu}\\p{L}+'s\\s+(?:${RELATIONS})\\b`, "gu"), "");
  for (const [cat, rx] of CATEGORY_WORDS) {
    const m = rx.exec(aboutYou);
    if (m) add("categories", cat, m[0]);
  }

  // Birthday, only when the full date is written.
  const bd = /\bbirthday(?: is| on|:)?\s+([\d/.-]{8,10}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2}(?:st|nd|rd|th)?,? \d{4})/i.exec(t);
  if (bd) {
    let iso = parseBirthday(bd[1]);
    if (!iso) {
      const d = new Date(`${bd[1].replace(/(st|nd|rd|th),?/, ",")} UTC`);
      if (!Number.isNaN(d.getTime())) iso = d.toISOString().slice(0, 10);
    }
    if (iso) add("birthday", iso, bd[0]);
  }

  const list = (f: CaptureField) => found.filter((x) => x.field === f).map((x) => x.value);
  const contact: ContactInput = {
    name: first("name") ?? "",
    occupation: first("occupation"),
    organization: first("organization"),
    location: first("location"),
    email: first("email"),
    phone: first("phone"),
    metContext: first("metContext") ?? (introducer?.kind === "introduced" ? `Introduced by ${introducer.name}` : undefined),
    notes: t || undefined,
    categories: list("categories") as Category[],
    tags: [],
    interests: list("interests"),
    goals: list("goals"),
    skills: list("skills"),
    importantDates: first("birthday") ? [{ label: "Birthday", date: first("birthday")! }] : [],
  };
  return { contact, found, introducer };
}
