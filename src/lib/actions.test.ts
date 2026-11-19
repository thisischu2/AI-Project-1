import { describe, expect, it } from "vitest";
import { askWithActions, draftCheckIn } from "./actions";
import { demoConnections, demoContacts, demoInteractions } from "./demo-data";
import { NetworkPayloadSchema } from "./validation";

const network = NetworkPayloadSchema.parse({
  profileName: "Chu",
  contacts: demoContacts,
  connections: demoConnections,
  interactions: demoInteractions,
});
const today = "2026-11-19"; // a Thursday
const byName = (n: string) => network.contacts.find((c) => c.name === n)!;

describe("follow-up requests", () => {
  it("turns 'remind me to…' into a follow-up for the named person, with a date", () => {
    const a = askWithActions("Remind me to send Marcus the portfolio deck on Friday", network, today);
    expect(a.actions).toEqual([{ type: "reminder", contactId: "demo-marcus", title: "Send Marcus the portfolio deck", dueDate: "2026-11-20" }]);
    expect(a.answer).toMatch(/Nothing is saved until you do/);
  });

  it("handles 'follow up with' and 'add a follow-up'", () => {
    expect(askWithActions("Follow up with Priya next week", network, today).actions[0]).toMatchObject({
      type: "reminder",
      contactId: "demo-priya",
      title: "Follow up with Priya",
      dueDate: "2026-11-23",
    });
    expect(askWithActions("add a follow-up to call Leo in 3 days", network, today).actions[0]).toMatchObject({
      title: "Call Leo",
      contactId: "demo-leo",
      dueDate: "2026-11-22",
    });
  });

  it("does not link a follow-up to anyone when no saved person is named", () => {
    const a = askWithActions("Remind me to renew my bar card", network, today);
    expect(a.actions[0]).toMatchObject({ type: "reminder", title: "Renew my bar card" });
    expect((a.actions[0] as { contactId?: string }).contactId).toBeUndefined();
    expect(a.answer).toMatch(/isn't linked to anyone/);
  });
});

describe("draft requests", () => {
  it("drafts a check-in from recorded facts only, and lists them", () => {
    const a = askWithActions("Draft a message to Priya", network, today);
    const d = a.actions.find((x) => x.type === "draft")!;
    expect(d.type === "draft" && d.draft.body).toMatch(/^Hi Priya,/);
    expect(d.type === "draft" && d.draft.body).toContain("I remember you were hoping to find a summer role in tech policy.");
    expect(d.type === "draft" && d.draft.body).toMatch(/Best,\nChu$/);
    expect(d.type === "draft" && d.draft.basedOn).toContain("Their recorded goal: find a summer role in tech policy");
    expect(a.actions.some((x) => x.type === "open" && x.contactId === "demo-priya")).toBe(true);
  });

  it("drafts an introduction for two people, with a placeholder when nothing links them", () => {
    const a = askWithActions("Write an intro for Priya and Leo", network, today);
    const d = a.actions[0];
    expect(d.type).toBe("draft");
    expect(d.type === "draft" && d.draft.subject).toBe("Introduction: Priya and Leo?");
    expect(d.type === "draft" && d.draft.body).toContain("AI policy");
    const none = askWithActions("Write an intro for Marcus and Jordan", network, today);
    const nd = none.actions[0];
    expect(nd.type === "draft" && nd.draft.body).toContain("[Add a line on why you thought of them]");
    expect(none.gaps[0]).toMatch(/have in common/);
  });

  it("asks who, when no saved person is named", () => {
    const a = askWithActions("Draft a message to my landlord", network, today);
    expect(a.actions).toEqual([]);
    expect(a.answer).toMatch(/Who should the message go to/);
  });

  it("writes a plain check-in when nothing is recorded about the person", () => {
    const bare = { ...byName("Jordan Ellis"), goals: [], interests: [] };
    const d = draftCheckIn(bare, { ...network, interactions: [] }, today);
    expect(d.body).toContain("I wanted to reach out and say hello. How have things been?");
    expect(d.basedOn).toEqual([]);
  });
});

describe("other questions", () => {
  it("opens a profile on request", () => {
    expect(askWithActions("Open Sofia", network, today).actions).toEqual([{ type: "open", contactId: "demo-sofia" }]);
  });

  it("offers open, draft and follow-up after an answer about one person, and lists its source note", () => {
    const a = askWithActions("What did I last discuss with Marcus?", network, today);
    expect(a.actions.map((x) => x.type)).toEqual(["open", "draft", "reminder"]);
    expect(a.noteIds?.length).toBe(1);
    expect(network.interactions.find((i) => i.id === a.noteIds![0])?.contactId).toBe("demo-marcus");
  });

  it("offers no actions for path answers or lists of people", () => {
    expect(askWithActions("How am I connected to James?", network, today).actions).toEqual([]);
    expect(askWithActions("Who do I know in Toronto?", network, today).actions).toEqual([]);
  });

  it("returns note sources for keyword answers", () => {
    const a = askWithActions("moot court", network, today);
    expect(a.noteIds?.length).toBeGreaterThan(0);
  });
});
