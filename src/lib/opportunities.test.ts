import { describe, expect, it } from "vitest";
import { demoConnections, demoContacts, demoInteractions } from "./demo-data";
import { draftAsk, findOpportunities, goalWords, opportunityKey } from "./opportunities";
import { mergeNetworks, normalizeNetwork } from "./persistence";
import { NetworkPayloadSchema } from "./validation";

const network = NetworkPayloadSchema.parse({ profileName: "Sam", contacts: demoContacts, connections: demoConnections, interactions: demoInteractions });

describe("goal words", () => {
  it("drops filler words and folds word forms", () => {
    expect(goalWords("Find a summer role in tech policies")).toEqual(["summer", "tech", "policy"]);
    expect(goalWords("Designers and founders")).toEqual(goalWords("design founder"));
    expect(goalWords("planning")).toEqual(goalWords("plans"));
    expect(goalWords("help me get a job")).toEqual([]);
  });
});

describe("findOpportunities", () => {
  it("ranks people by recorded evidence and distance, with reasons", () => {
    const r = findOpportunities("find a summer role in tech policy", network);
    expect(r.map((o) => o.contactId)).toEqual(["demo-leo", "demo-priya"]);
    const leo = r[0];
    expect(leo.degrees).toBe(2);
    expect(leo.path[0]).toBe("me");
    expect(leo.path.at(-1)).toBe("demo-leo");
    expect(leo.reasons[0].text).toMatch(/^Works as Policy Analyst/);
    // Priya is closer (1°) but has less recorded evidence.
    expect(r[1].degrees).toBe(1);
  });

  it("cites the note a match came from", () => {
    const r = findOpportunities("start a design consultancy", network);
    expect(r[0].contactId).toBe("demo-marcus");
    const note = r[0].reasons.find((x) => x.kind === "note");
    expect(network.interactions.find((i) => i.id === note?.noteId)?.contactId).toBe("demo-marcus");
  });

  it("ignores a word most of your circle shares when it's the only match", () => {
    const r = findOpportunities("find a summer role in tech policy", network);
    expect(r.some((o) => o.contactId === "demo-sofia")).toBe(false); // only "civic tech"
  });

  it("never suggests someone for location alone", () => {
    expect(findOpportunities("move to Toronto", network)).toEqual([]);
  });

  it("returns nothing for empty or filler-only goals", () => {
    expect(findOpportunities("", network)).toEqual([]);
    expect(findOpportunities("help me get a job", network)).toEqual([]);
    expect(findOpportunities("zzz qqq", network)).toEqual([]);
  });

  it("leaves out people you dismissed for that goal only", () => {
    const goal = "find a summer role in tech policy";
    const r = findOpportunities(goal, network, [opportunityKey(goal, "demo-leo")]);
    expect(r.map((o) => o.contactId)).toEqual(["demo-priya"]);
    expect(findOpportunities("learn about AI policy", network, [opportunityKey(goal, "demo-leo")]).some((o) => o.contactId === "demo-leo")).toBe(true);
  });

  it("shows people with no recorded path, ranked lower", () => {
    const lonely = { ...network, connections: [] };
    const r = findOpportunities("start a design consultancy", lonely);
    expect(r[0]).toMatchObject({ contactId: "demo-marcus", degrees: null, path: [] });
  });
});

describe("draftAsk", () => {
  it("asks a 1° contact directly", () => {
    const [m] = findOpportunities("start a design consultancy", network);
    const d = draftAsk(m, "start a design consultancy", network);
    expect(d.to).toBe("demo-marcus");
    expect(d.body).toMatch(/^Hi Marcus,/);
    expect(d.body).toContain("you're a Product Designer at Northline Studio");
    expect(d.body).toMatch(/Thanks,\nSam$/);
  });

  it("asks the person in between for an introduction to a 2° contact", () => {
    const [leo] = findOpportunities("find a summer role in tech policy", network);
    const d = draftAsk(leo, "find a summer role in tech policy", network);
    expect(d.to).toBe(leo.path[1]);
    expect(d.subject).toBe("Could you introduce me to Leo?");
    expect(d.body).toContain("Would you be comfortable introducing us?");
  });
});

describe("saving goals", () => {
  it("keeps goals and dismissals through a reload and combines them across devices", () => {
    const base = normalizeNetwork({
      version: 1,
      profile: { name: "Sam", priorities: ["find a mentor"] },
      contacts: [],
      connections: [],
      interactions: [],
      reminders: [],
      dismissedOpportunities: ["find a mentor|c1"],
    })!.data;
    expect(base.profile.priorities).toEqual(["find a mentor"]);
    expect(base.dismissedOpportunities).toEqual(["find a mentor|c1"]);
    const other = { ...base, profile: { name: "Sam", priorities: ["Find a mentor", "learn piano"] }, dismissedOpportunities: ["learn piano|c2"] };
    const merged = mergeNetworks(base, other).data;
    expect(merged.profile.priorities).toEqual(["Find a mentor", "learn piano"]);
    expect(merged.dismissedOpportunities).toEqual(["find a mentor|c1", "learn piano|c2"]);
  });
});
