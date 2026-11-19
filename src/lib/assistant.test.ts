import { describe, expect, it } from "vitest";
import { ASK_CAPABILITIES, answerQuestion, draftIntroduction, suggestIntroductions } from "./assistant";
import { demoConnections, demoContacts, demoInteractions, demoReminders } from "./demo-data";
import { NetworkPayloadSchema } from "./validation";

const network = NetworkPayloadSchema.parse({
  profileName: "Sam",
  contacts: demoContacts,
  connections: demoConnections,
  interactions: demoInteractions,
});

describe("answerQuestion (no AI)", () => {
  it("answers path questions with the verified BFS path only", () => {
    const a = answerQuestion("How am I connected to James?", network);
    expect(a.paths).toEqual([{ found: true, degrees: 3, names: ["You", "Marcus Reed", "Danielle Okafor", "James Whitfield"] }]);
    expect(a.answer).toContain("3 degrees");
  });

  it("says so when no recorded path exists", () => {
    const lonely = { ...network, connections: [] };
    const a = answerQuestion("How am I connected to James?", lonely);
    expect(a.paths[0].found).toBe(false);
    expect(a.answer).toMatch(/no recorded path/i);
    expect(a.gaps.length).toBe(1);
  });

  it("finds people by recorded location", () => {
    const a = answerQuestion("Who do I know in New York?", network);
    const expected = network.contacts.filter((c) => c.location === "New York, NY").map((c) => c.id);
    expect(a.referencedContactIds.sort()).toEqual(expected.sort());
  });

  it("reports a gap for a place nobody is recorded in", () => {
    const a = answerQuestion("Who do I know in Paris?", network);
    expect(a.referencedContactIds).toEqual([]);
    expect(a.gaps).toEqual(["contacts located in Paris"]);
  });

  it("quotes the latest stored note for a named person", () => {
    const a = answerQuestion("What did I last discuss with Marcus?", network);
    const latest = network.interactions
      .filter((i) => i.contactId === "demo-marcus")
      .sort((x, y) => y.date.localeCompare(x.date))[0];
    expect(a.referencedContactIds).toEqual(["demo-marcus"]);
    expect(a.answer).toContain(latest.summary);
  });

  it("never invents an answer when nothing matches", () => {
    const a = answerQuestion("zzzz qqqq", network);
    expect(a.referencedContactIds).toEqual([]);
    expect(a.answer).toMatch(/couldn't find anything/i);
  });
});

describe("suggestIntroductions (no AI)", () => {
  it("only suggests unconnected pairs and keeps the app's evidence", () => {
    const s = suggestIntroductions(network);
    expect(s.length).toBeGreaterThan(0);
    for (const x of s) {
      expect(x.evidence.length).toBeGreaterThan(0);
      expect(x.rationale).toMatch(/might/);
    }
  });

  it("drafts an intro without contact details", () => {
    const [first] = suggestIntroductions(network);
    const a = network.contacts.find((c) => c.id === first.aId)!;
    const b = network.contacts.find((c) => c.id === first.bId)!;
    const d = draftIntroduction({ ...a, email: "a@example.com" }, b, first.evidence, "Sam");
    expect(d.body).not.toContain("a@example.com");
    expect(d.body).toContain("Sam");
    expect(d.sharedDetails.length).toBeGreaterThan(0);
  });
});

describe("answerQuestion: structured questions (no AI)", () => {
  const opts = { reminders: demoReminders, today: "2026-11-19" };

  it("lists people by relationship category", () => {
    const a = answerQuestion("Who are my mentors?", network, opts);
    expect(a.referencedContactIds).toEqual(network.contacts.filter((c) => c.categories.includes("mentor")).map((c) => c.id));
    expect(a.answer).toMatch(/as mentor:/);
    const fam = answerQuestion("Show my family", network, opts);
    expect(fam.referencedContactIds.length).toBe(network.contacts.filter((c) => c.categories.includes("family")).length);
  });

  it("lists follow-ups with dates, by window and by person", () => {
    const all = answerQuestion("What follow-ups do I have?", network, opts);
    expect(all.answer).toMatch(/open follow-ups?:/);
    expect(all.answer).toContain("Send Marcus the consultancy pricing article");
    expect(all.answer).toContain("due tomorrow");
    const week = answerQuestion("What's due this week?", network, opts);
    expect(week.answer).toContain("Send Marcus the consultancy pricing article");
    expect(week.answer).not.toContain("moot court final");
    const priya = answerQuestion("Follow-ups with Priya", network, opts);
    expect(priya.referencedContactIds).toEqual(["demo-priya"]);
    expect(priya.answer).toContain("Wish Priya luck");
    expect(answerQuestion("Anything overdue?", network, opts).answer).toBe("No overdue follow-ups.");
  });

  it("counts a follow-up as overdue once its date passes", () => {
    const a = answerQuestion("What's overdue?", network, { ...opts, today: "2026-11-25" });
    expect(a.answer).toMatch(/Send Marcus the consultancy pricing article \(Marcus Reed\), 5 days overdue/);
  });

  it("lists someone's recorded connections, and only those", () => {
    const a = answerQuestion("Who does Marcus know?", network, opts);
    const links = network.connections.filter((e) => e.sourceId === "demo-marcus" || e.targetId === "demo-marcus");
    expect(a.answer).toMatch(new RegExp(`${links.length} connections? for Marcus Reed`));
    expect(a.paths).toEqual([]);
    const none = answerQuestion("Who does Marcus know?", { ...network, connections: [] }, opts);
    expect(none.answer).toMatch(/haven't recorded who Marcus Reed knows/);
  });

  it("finds people by field of work, not location", () => {
    const a = answerQuestion("Who works in policy?", network, opts);
    expect(a.referencedContactIds).toContain("demo-leo");
    expect(a.answer).toMatch(/recorded work matches/);
    const b = answerQuestion("Who do I know in design?", network, opts);
    expect(b.referencedContactIds).toContain("demo-marcus");
    expect(b.answer).toMatch(/Nobody's recorded location matches/);
  });

  it("lists recent conversations with their notes as sources", () => {
    const a = answerQuestion("Who did I talk to recently?", network, opts);
    expect(a.noteIds?.length).toBe(Math.min(5, network.interactions.length));
    expect(a.answer).toMatch(/^Your most recent conversations:/);
  });

  it("includes a person's open follow-ups in their answer", () => {
    expect(answerQuestion("Tell me about Marcus", network, opts).answer).toMatch(/Open follow-ups: Send Marcus the consultancy pricing article/);
  });

  it("explains what it can answer instead of guessing", () => {
    const a = answerQuestion("qwerty asdf zxcv", network, opts);
    expect(a.answer).toMatch(/couldn't find anything/);
    for (const c of ASK_CAPABILITIES) expect(a.answer).toContain(c);
    expect(answerQuestion("What can I ask?", network, opts).answer).toMatch(/^Here's what I can answer/);
  });
});
