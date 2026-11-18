import { describe, expect, it } from "vitest";
import { answerQuestion, draftIntroduction, suggestIntroductions } from "./assistant";
import { demoConnections, demoContacts, demoInteractions } from "./demo-data";
import { NetworkPayloadSchema } from "./validation";

const network = NetworkPayloadSchema.parse({
  profileName: "Chu",
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
    const d = draftIntroduction({ ...a, email: "a@example.com" }, b, first.evidence, "Chu");
    expect(d.body).not.toContain("a@example.com");
    expect(d.body).toContain("Chu");
    expect(d.sharedDetails.length).toBeGreaterThan(0);
  });
});
