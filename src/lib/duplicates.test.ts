import { describe, expect, it } from "vitest";
import { buildDemoNetwork } from "./demo-data";
import { compareContacts, findDuplicatePairs, mergeContacts, nameTokens, normalizePhone, pairId } from "./duplicates";
import type { Contact } from "./types";

const person = (id: string, name: string, extra: Partial<Contact> = {}): Contact => ({
  id, name, categories: [], tags: [], interests: [], goals: [], skills: [], importantDates: [], createdAt: "2026-01-01", updatedAt: "2026-01-01", ...extra,
});

describe("matching rules", () => {
  it("normalizes names, accents, titles and punctuation", () => {
    expect(nameTokens("Dr. José  O'Neil-Smith, Jr.")).toEqual(["jose", "oneilsmith"]);
  });
  it("normalizes phone formats", () => {
    expect(normalizePhone("+1 (415) 555-0100")).toBe(normalizePhone("415.555.0100"));
    expect(normalizePhone("12")).toBeUndefined();
  });
  it.each([
    [{ name: "Ana Ruiz", email: "ANA@x.com " }, { name: "A. R.", email: "ana@x.com" }, "high", "Same email"],
    [{ name: "Ana", phone: "+1 415 555 0100" }, { name: "Someone", phone: "(415) 555-0100" }, "high", "Same phone"],
    [{ name: "Marcus Reed" }, { name: "marcus  reed" }, "high", "Same name"],
    [{ name: "Bob Smith" }, { name: "Robert Smith" }, "medium", "same first name"],
    [{ name: "J. Whitfield" }, { name: "James Whitfield" }, "medium", "first initial"],
    [{ name: "James A. Whitfield" }, { name: "James Whitfield" }, "medium", "middle name"],
  ])("flags %#", (a, b, conf, reason) => {
    const m = compareContacts(a, b)!;
    expect(m.confidence).toBe(conf);
    expect(m.reasons.join(" ").toLowerCase()).toContain(reason.toLowerCase());
  });
  it.each([
    [{ name: "Ana Ruiz" }, { name: "Ana Torres" }],
    [{ name: "Sam" }, { name: "Samuel Lee" }],
    [{ name: "Jordan Park" }, { name: "Jordan Parker" }],
  ])("does not flag different people %#", (a, b) => {
    expect(compareContacts(a, b)).toBeNull();
  });
  it("treats a shared lone first name as weak, not certain", () => {
    expect(compareContacts({ name: "Ana" }, { name: "ana" })?.confidence).toBe("medium");
  });
  it("finds no duplicates in the demo network, and respects dismissals", () => {
    const d = buildDemoNetwork("Chu");
    expect(findDuplicatePairs(d.contacts)).toEqual([]);
    const cs = [person("a", "Bob Smith"), person("b", "Robert Smith")];
    expect(findDuplicatePairs(cs)).toHaveLength(1);
    expect(findDuplicatePairs(cs, [pairId("b", "a")])).toHaveLength(0);
  });
});

describe("mergeContacts", () => {
  it("moves history and connections to the kept person without duplicates", () => {
    const d = buildDemoNetwork("Chu");
    const marcus = d.contacts.find((c) => c.name === "Marcus Reed")!;
    const copy = person("dup", "Marcus Reed", { email: "marcus@example.com", interests: ["Jazz", "chess"] });
    const before = {
      ...d,
      contacts: [...d.contacts, copy],
      connections: [
        ...d.connections,
        { id: "x1", sourceId: "me", targetId: "dup", createdAt: "" }, // duplicates me–marcus once merged
        { id: "x2", sourceId: "dup", targetId: marcus.id, createdAt: "" }, // would become a self-loop
      ],
      interactions: [...d.interactions, { id: "ix", contactId: "dup", kind: "call" as const, date: "2026-11-01", summary: "Call", createdAt: "" }],
    };
    const after = mergeContacts(before, marcus.id, "dup");
    expect(after.contacts.find((c) => c.id === "dup")).toBeUndefined();
    const merged = after.contacts.find((c) => c.id === marcus.id)!;
    expect(merged.email).toBe("marcus@example.com");
    expect(merged.interests.map((x) => x.toLowerCase())).toEqual(["design systems", "basketball", "jazz", "chess"]);
    expect(after.connections).toHaveLength(d.connections.length);
    expect(after.interactions.find((i) => i.id === "ix")!.contactId).toBe(marcus.id);
  });
  it("does nothing for unknown or identical ids", () => {
    const d = buildDemoNetwork("Chu");
    expect(mergeContacts(d, "nope", d.contacts[0].id)).toBe(d);
    expect(mergeContacts(d, d.contacts[0].id, d.contacts[0].id)).toBe(d);
  });
});
