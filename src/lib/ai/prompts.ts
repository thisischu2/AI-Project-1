import "server-only";
import { z } from "zod";
import { formatContact, type AskContext, type Candidate } from "../retrieval";
import type { NetworkPayload, PayloadContact } from "../validation";

const wrapRecords = (body: string) => `<records>\n${body}\n</records>`;

/* --------------------------------- ASK 6IX -------------------------------- */

export const AskOutput = z.object({
  answer: z.string().describe("Plain-language answer grounded only in the records. Short paragraphs, no markdown headings."),
  referencedContactIds: z.array(z.string()).describe("ids of contacts the answer relies on"),
  gaps: z.array(z.string()).describe("Things the user asked about that are not recorded. Empty if none."),
});

export const ASK_SYSTEM = `You are Ask 6ix, the assistant inside 6IX DEGREES, a personal relationship intelligence app.
You help the user search and understand THEIR OWN recorded network. Be warm, concise, and specific.
When a <verified_path> is provided, it was computed by the app's breadth-first search over recorded connections. Explain it exactly as given; do not add, remove, or reorder people. If it says no path was found, say no recorded path exists and suggest recording a connection if they know one.
Never compute degrees of separation yourself.
If the records do not contain the answer, say so plainly and list what is missing in "gaps".`;

export function askUserMessage(question: string, ctx: AskContext, network: NetworkPayload) {
  const nameById = new Map(network.contacts.map((c) => [c.id, c.name]));
  const paths = ctx.pathFacts
    .map((p) =>
      p.found
        ? `<verified_path from="${p.names[0]}" to="${p.names.at(-1)}" degrees="${p.degrees}">${p.names.join(" → ")}</verified_path>`
        : `<verified_path from="${p.fromId === "me" ? "You" : nameById.get(p.fromId)}" to="${nameById.get(p.toId)}">NO RECORDED PATH</verified_path>`,
    )
    .join("\n");
  const interactions = ctx.interactions
    .map((i) => `<interaction contact="${nameById.get(i.contactId)}" kind="${i.kind}" date="${i.date}">${i.summary}</interaction>`)
    .join("\n");
  const omitted = ctx.totalContacts - ctx.contacts.length;
  return `${wrapRecords(
    `${ctx.contacts.map(formatContact).join("\n")}\n${interactions}${
      omitted > 0 ? `\n<note_from_app>${omitted} other contacts were not relevant to this question and are not shown.</note_from_app>` : ""
    }`,
  )}
${paths}
<user_name>${network.profileName}</user_name>

Question: ${question}`;
}

/* --------------------------------- MEMORY --------------------------------- */

const nullableStr = z.string().nullable();

export const ExtractOutput = z.object({
  contactName: nullableStr.describe("The main person the note is about, exactly as written in the note. null if unclear."),
  matchedContactId: nullableStr.describe("id of an existing contact from <records> that clearly matches, else null"),
  isNewContact: z.boolean().describe("true if the person does not match any existing contact"),
  interaction: z.object({
    kind: z.enum(["meeting", "call", "message", "event", "other"]),
    date: nullableStr.describe("YYYY-MM-DD. Resolve relative dates using <today>. null if the note gives no date."),
    summary: z.string().describe("One or two sentence factual summary of what happened, using only the note."),
  }),
  fields: z.object({
    location: nullableStr,
    occupation: nullableStr,
    organization: nullableStr,
    metContext: nullableStr,
  }).describe("Only values explicitly stated in the note. null when not stated."),
  addInterests: z.array(z.string()),
  addGoals: z.array(z.string()),
  addSkills: z.array(z.string()),
  followUps: z.array(z.object({ title: z.string(), dueDate: nullableStr })).describe("Commitments the user made or should follow up on, only if stated or clearly implied."),
  importantDates: z.array(z.object({ label: z.string(), date: z.string() })).describe("Only with a full explicit date."),
  ambiguities: z.array(z.string()).describe("Anything unclear the user should double-check. Empty if none."),
});

export const EXTRACT_SYSTEM = `You convert a user's natural-language note about an interaction into structured fields for their personal network app.
Extract ONLY what the note states. Leave fields null or lists empty when the note does not say. Do not guess job titles, employers, cities, or dates.
The user will review every field before anything is saved, so flag uncertainty in "ambiguities" instead of guessing.
If the note mentions several people, focus on the main person and mention the others in "ambiguities".`;

export function extractUserMessage(note: string, today: string, network: NetworkPayload, focus?: PayloadContact) {
  const roster = network.contacts.map((c) => `<contact id="${c.id}" name="${c.name}"${c.organization ? ` org="${c.organization}"` : ""}/>`).join("\n");
  return `${wrapRecords(roster)}
${focus ? `<selected_contact>${formatContact(focus)}</selected_contact>\n` : ""}<today>${today}</today>
<note>
${note}
</note>`;
}

/* -------------------------------- DISCOVER -------------------------------- */

export const DiscoverOutput = z.object({
  suggestions: z.array(
    z.object({
      aId: z.string(),
      bId: z.string(),
      headline: z.string().describe("Short, e.g. 'Marcus could help James find a designer'"),
      rationale: z.string().describe("2-3 sentences explaining why this MIGHT be valuable, citing only the listed evidence. Use tentative language."),
      confidence: z.enum(["low", "medium", "high"]).describe("How strongly the recorded evidence supports this possibility"),
    }),
  ),
});

export const DISCOVER_SYSTEM = `You help a user spot introductions that might be valuable between people they know.
The app has already found candidate pairs and the recorded evidence for each. For each worthwhile candidate, write a short headline and a tentative rationale.
Use ONLY the evidence listed for that pair. Do not claim the introduction will succeed or that either person wants it. Always frame it as a possibility.
You may drop weak candidates. Keep aId/bId exactly as given.`;

export function discoverUserMessage(candidates: Candidate[], network: NetworkPayload) {
  const byId = new Map(network.contacts.map((c) => [c.id, c]));
  const people = new Set(candidates.flatMap((c) => [c.aId, c.bId]));
  return `${wrapRecords([...people].map((id) => formatContact(byId.get(id)!)).join("\n"))}
<user_priorities>${network.priorities.join(", ") || "not set"}</user_priorities>
<candidates>
${candidates
  .map(
    (c) =>
      `<candidate aId="${c.aId}" bId="${c.bId}">\n${c.evidence.map((e) => `  - ${e.detail}`).join("\n")}\n</candidate>`,
  )
  .join("\n")}
</candidates>`;
}

/* ------------------------------ DRAFT INTRO ------------------------------- */

export const DraftOutput = z.object({
  subject: z.string(),
  body: z.string().describe("A short, friendly double-opt-in introduction message the user can edit and send themselves."),
  sharedDetails: z.array(z.string()).describe("Each personal detail about either person that the draft reveals, so the user can confirm consent."),
});

export const DRAFT_SYSTEM = `You draft a short introduction message the user will review, edit, and send themselves. The app never sends anything.
Write a double-opt-in style message: the user checks that both people are happy to be introduced.
Share only details that appear in the records and are needed for the introduction. List each one in sharedDetails.
No contact details (emails, phone numbers) in the body.`;

export function draftUserMessage(a: PayloadContact, b: PayloadContact, reason: string, userName: string) {
  return `${wrapRecords(`${formatContact(a)}\n${formatContact(b)}`)}
<reason_for_intro>${reason}</reason_for_intro>
<sender_name>${userName}</sender_name>`;
}
