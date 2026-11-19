import { describe, expect, it } from "vitest";
import { demoConnections, demoContacts, demoInteractions } from "./demo-data";
import { discoverCandidates, findMentioned, pairEvidence, selectForAsk } from "./retrieval";
import { NetworkPayloadSchema } from "./validation";

const network = NetworkPayloadSchema.parse({
  profileName: "Test",
  contacts: demoContacts,
  connections: demoConnections,
  interactions: demoInteractions,
});

describe("findMentioned", () => {
  it("finds contacts by first name", () => {
    expect(findMentioned("What did I last discuss with Marcus?", network.contacts).map((c) => c.id)).toEqual([
      "demo-marcus",
    ]);
  });
  it("finds nobody when no name is used", () => {
    expect(findMentioned("Who do I know in New York?", network.contacts)).toEqual([]);
  });
});

describe("selectForAsk", () => {
  it("computes a verified path for 'How am I connected to James?'", () => {
    const ctx = selectForAsk("How am I connected to James?", network);
    expect(ctx.pathFacts[0]).toMatchObject({
      found: true,
      degrees: 3,
      names: ["You", "Marcus Reed", "Danielle Okafor", "James Whitfield"],
    });
  });
  it("reports no path for someone with no recorded route", () => {
    const isolated = { ...network, connections: network.connections.filter((c) => c.targetId !== "demo-jordan") };
    const ctx = selectForAsk("How am I connected to Jordan?", isolated);
    expect(ctx.pathFacts[0]).toMatchObject({ found: false, degrees: null });
  });
});

describe("discoverCandidates", () => {
  const candidates = discoverCandidates(network);
  it("never suggests people who are already connected", () => {
    for (const c of candidates) {
      expect(
        network.connections.some(
          (e) => (e.sourceId === c.aId && e.targetId === c.bId) || (e.sourceId === c.bId && e.targetId === c.aId),
        ),
      ).toBe(false);
    }
  });
  it("attaches recorded evidence to every suggestion", () => {
    expect(candidates.length).toBeGreaterThan(0);
    for (const c of candidates) expect(c.evidence.length).toBeGreaterThan(0);
  });
  it("matches James's goal of hiring a product designer with Marcus", () => {
    const pair = candidates.find((c) => [c.aId, c.bId].sort().join() === "demo-james,demo-marcus");
    expect(pair?.evidence.some((e) => e.kind === "goal_match")).toBe(true);
  });
  it("does not suggest a pair based on location alone", () => {
    const loc = NetworkPayloadSchema.parse({
      contacts: [
        { id: "x", name: "X Person", location: "Toronto" },
        { id: "y", name: "Y Person", location: "Toronto" },
      ],
      connections: [],
    });
    expect(discoverCandidates(loc)).toEqual([]);
  });
});

describe("pairEvidence: field of work and mutual connections", () => {
  const base = { categories: [], tags: [], interests: [], goals: [], skills: [], importantDates: [] };
  const a = { ...base, id: "a", name: "Ana", occupation: "Senior Policy Analyst", interests: ["hiking"] };
  const b = { ...base, id: "b", name: "Ben", occupation: "Policy Associate", interests: ["hiking"] };
  const m = { ...base, id: "m", name: "Mo" };
  const conns = [
    { id: "1", sourceId: "a", targetId: "m" },
    { id: "2", sourceId: "m", targetId: "b" },
  ];
  const name = (id: string) => ({ a: "Ana", b: "Ben", m: "Mo" })[id] ?? "?";

  it("names the shared field, ignoring generic title words", () => {
    const e = pairEvidence(a as never, b as never, conns, name);
    expect(e.find((x) => x.kind === "same_field")?.detail).toBe("Both work in policy (Senior Policy Analyst and Policy Associate)");
    expect(pairEvidence({ ...a, occupation: "Senior Associate" } as never, { ...b, occupation: "Associate" } as never).some((x) => x.kind === "same_field")).toBe(false);
  });

  it("adds a mutual connection only alongside other evidence", () => {
    expect(pairEvidence(a as never, b as never, conns, name).find((x) => x.kind === "mutual_connection")?.detail).toMatch(/^Both know Mo/);
    const bare = pairEvidence({ ...m, id: "a" } as never, { ...m, id: "b" } as never, conns, name);
    expect(bare).toEqual([]);
  });
});
