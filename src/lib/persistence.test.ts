import { describe, expect, it } from "vitest";
import { buildDemoNetwork, emptyNetwork } from "./demo-data";
import { backupFileName, makeBackup, mergeNetworks, normalizeNetwork, parseSaved, readBackup } from "./persistence";
import type { NetworkData } from "./types";

const demo = () => buildDemoNetwork("Sam");

describe("parseSaved: never discards silently", () => {
  it("treats nothing saved as empty", () => {
    expect(parseSaved(null)).toEqual({ status: "empty" });
  });
  it("flags damaged text as unreadable instead of returning an empty network", () => {
    expect(parseSaved("{not json").status).toBe("unreadable");
  });
  it("flags an unknown version as unreadable", () => {
    expect(parseSaved(JSON.stringify({ ...demo(), version: 2 })).status).toBe("unreadable");
  });
  it("loads a normal save unchanged", () => {
    const d = demo();
    const r = parseSaved(JSON.stringify(d));
    expect(r.status).toBe("ok");
    if (r.status === "ok") {
      expect(r.data).toEqual(d);
      expect(r.report).toEqual({ dropped: 0, repaired: 0 });
    }
  });
});

describe("normalizeNetwork: repairs instead of crashing", () => {
  it("fills in missing lists on an old or partial contact", () => {
    const r = normalizeNetwork({ version: 1, contacts: [{ id: "c1", name: "Ana" }] })!;
    expect(r.data.contacts[0]).toMatchObject({ id: "c1", name: "Ana", tags: [], interests: [], categories: [] });
    expect(r.report.repaired).toBe(1);
  });
  it("drops records that can't be used and counts them", () => {
    const r = normalizeNetwork({
      version: 1,
      contacts: [{ id: "c1", name: "Ana" }, { id: "c2" }, "junk", { id: "c1", name: "Dup" }],
      connections: [{ id: "e1", sourceId: "me", targetId: "c1" }, { id: "e2", sourceId: "me", targetId: "ghost" }],
      interactions: [{ id: "i1", contactId: "c1", kind: "nonsense", date: "bad", summary: "Coffee" }],
      reminders: [{ id: "r1", title: "Call", contactId: "ghost" }],
    })!;
    expect(r.data.contacts.map((c) => c.name)).toEqual(["Ana"]);
    expect(r.data.connections.map((e) => e.id)).toEqual(["e1"]);
    expect(r.data.interactions[0].kind).toBe("other");
    expect(r.data.reminders[0].contactId).toBeUndefined(); // kept, just unlinked
    expect(r.report.dropped).toBe(4); // c2, "junk", duplicate c1, e2
  });
  it("ignores unknown categories and bad dates", () => {
    const r = normalizeNetwork({
      version: 1,
      contacts: [{ id: "c1", name: "Ana", categories: ["friend", "enemy"], importantDates: [{ label: "Bday", date: "soon" }] }],
    })!;
    expect(r.data.contacts[0].categories).toEqual(["friend"]);
    expect(r.data.contacts[0].importantDates).toEqual([]);
  });
});

describe("backup files", () => {
  it("round-trips exactly", () => {
    const d = demo();
    const r = readBackup(JSON.stringify(makeBackup(d)));
    expect(r.ok && r.data).toEqual(d);
  });
  it("accepts a raw saved network too", () => {
    expect(readBackup(JSON.stringify(demo())).ok).toBe(true);
  });
  it.each([
    ["", "empty"],
    ["hello", "isn't a 6IX backup"],
    [JSON.stringify({ some: "other app" }), "isn't a 6IX backup"],
    [JSON.stringify({ app: "6ix-degrees", format: 99, network: {} }), "newer version"],
    [JSON.stringify({ app: "6ix-degrees", format: 1, network: { version: 1 } }), "damaged"],
  ])("rejects bad input %#", (text, msg) => {
    const r = readBackup(text);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(msg);
  });
  it("names files with the date", () => {
    expect(backupFileName(new Date(2026, 10, 18, 23, 5))).toMatch(/^6ix-degrees-backup-2026-11-18-2305\.json$/);
  });
});

describe("mergeNetworks: combine never deletes", () => {
  const withContact = (d: NetworkData, id: string, name: string, updatedAt: string): NetworkData => ({
    ...d,
    contacts: [...d.contacts, { id, name, categories: [], tags: [], interests: [], goals: [], skills: [], importantDates: [], createdAt: updatedAt, updatedAt }],
  });

  it("adds what is new on either side", () => {
    const phone = withContact(emptyNetwork("Sam"), "c-phone", "Ana", "2026-11-01");
    const laptop = withContact(emptyNetwork("Sam"), "c-laptop", "Ben", "2026-11-02");
    const { data, summary } = mergeNetworks(phone, laptop);
    expect(data.contacts.map((c) => c.name).sort()).toEqual(["Ana", "Ben"]);
    expect(summary.added.contacts).toBe(1);
  });

  it("keeps the most recently edited copy of the same person", () => {
    const older = withContact(emptyNetwork("Sam"), "c1", "Ana (old)", "2026-11-01T10:00:00Z");
    const newer = withContact(emptyNetwork("Sam"), "c1", "Ana (new)", "2026-11-05T10:00:00Z");
    expect(mergeNetworks(older, newer).data.contacts[0].name).toBe("Ana (new)");
    expect(mergeNetworks(newer, older).data.contacts[0].name).toBe("Ana (new)");
  });

  it("does not duplicate connections recorded on both devices", () => {
    const a = demo();
    const b = { ...demo(), connections: demo().connections.map((e) => ({ ...e, id: e.id + "-other", sourceId: e.targetId, targetId: e.sourceId })) };
    const { data, summary } = mergeNetworks(a, b);
    expect(data.connections.length).toBe(a.connections.length);
    expect(summary.added.connections).toBe(0);
  });

  it("is safe to run twice", () => {
    const once = mergeNetworks(demo(), demo()).data;
    const twice = mergeNetworks(once, demo()).data;
    expect(twice.contacts.length).toBe(demo().contacts.length);
    expect(twice.interactions.length).toBe(demo().interactions.length);
  });
});
