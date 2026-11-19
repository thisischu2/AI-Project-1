import { describe, expect, it } from "vitest";
import { extractContact, MAX_DESCRIPTION } from "./capture";

const saved = [
  { id: "c1", name: "Marcus Reed" },
  { id: "c2", name: "Priya Shah" },
  { id: "c3", name: "Priya Nair" },
];

describe("extractContact", () => {
  it("reads a full description, keeping the words each value came from", () => {
    const r = extractContact(
      "Met Sarah Lee at the ABA tech conference. She's an associate at Davis Polk in New York, really into legal tech and climate policy. Wants to move in-house. sarah.lee@dpw.com, (212) 555-0182. Introduced by Marcus.",
      saved,
    );
    expect(r.contact).toMatchObject({
      name: "Sarah Lee",
      occupation: "associate",
      organization: "Davis Polk",
      location: "New York",
      email: "sarah.lee@dpw.com",
      phone: "(212) 555-0182",
      metContext: "At the ABA tech conference",
      interests: ["legal tech", "climate policy"],
      goals: ["move in-house"],
    });
    expect(r.found.find((f) => f.field === "organization")?.from).toBe("She's an associate at Davis Polk in New York");
    expect(r.introducer).toEqual({ name: "Marcus", from: "Introduced by Marcus", kind: "introduced", matches: [{ id: "c1", name: "Marcus Reed" }] });
    // The person's own words are kept as the contact's notes.
    expect(r.contact.notes).toMatch(/^Met Sarah Lee/);
  });

  it("handles titles, accents, organisations with 'of', skills and a dated birthday", () => {
    const r = extractContact("Dr. José Ramírez — professor at Columbia Law School. Expert in antitrust and data privacy. Lives in Brooklyn. Birthday is March 3, 1975.");
    expect(r.contact).toMatchObject({
      name: "José Ramírez",
      occupation: "professor",
      organization: "Columbia Law School",
      location: "Brooklyn",
      skills: ["antitrust", "data privacy"],
      categories: ["mentor"],
      importantDates: [{ label: "Birthday", date: "1975-03-03" }],
    });
  });

  it("reads student descriptions, classmates and 'applying to' goals", () => {
    const r = extractContact("Coffee with Tom, a 2L at NYU in my contracts class. He's applying to clerkships and loves rock climbing.");
    expect(r.contact).toMatchObject({
      name: "Tom",
      occupation: "2L",
      organization: "NYU",
      categories: ["classmate"],
      interests: ["rock climbing"],
      goals: ["apply to clerkships"],
    });
  });

  it("treats 'Priya's cousin' as a relation to Priya, not family of yours", () => {
    const r = extractContact("Priya's cousin Anika works at Google. Looking for mentors in product.", saved);
    expect(r.contact.name).toBe("Anika");
    expect(r.contact.organization).toBe("Google");
    expect(r.contact.categories).toEqual([]);
    expect(r.contact.metContext).toBeUndefined();
    expect(r.contact.goals).toEqual(["find mentors in product"]);
    // Two saved Priyas: both offered, none picked for you.
    expect(r.introducer?.kind).toBe("relation");
    expect(r.introducer?.matches.map((m) => m.id)).toEqual(["c2", "c3"]);
  });

  it("matches an introducer only to people already saved", () => {
    expect(extractContact("Met Ana through Jordan Blake.", saved).introducer?.matches).toEqual([]);
    expect(extractContact("Met Ana through Priya Shah.", saved).introducer?.matches).toEqual([{ id: "c2", name: "Priya Shah" }]);
  });

  it("reads names with apostrophes and hyphens, places with a country, and languages", () => {
    const r = extractContact("Talked to Jamie O'Neil-Smith. Lives in Toronto, Canada. Speaks French and Spanish.");
    expect(r.contact).toMatchObject({ name: "Jamie O'Neil-Smith", location: "Toronto, Canada", skills: ["French", "Spanish"] });
  });

  it("leaves things blank rather than guessing", () => {
    const r = extractContact("great chat today about nothing in particular");
    expect(r.contact.name).toBe("");
    expect(r.found).toEqual([]);
    expect(r.introducer).toBeUndefined();
    expect(extractContact("").found).toEqual([]);
  });

  it("does not take common words, months or days as a name", () => {
    expect(extractContact("Met Monday at the bar association mixer.").contact.name).toBe("");
    expect(extractContact("The meeting went well.").contact.name).toBe("");
  });

  it("does not take a date as a phone number, and ignores birthdays without a year", () => {
    const r = extractContact("Met Lena on 2026-11-02. Birthday is March 3.");
    expect(r.contact.phone).toBeUndefined();
    expect(r.contact.importantDates).toEqual([]);
  });

  it("caps very long input", () => {
    const r = extractContact(`Met Sam Ortiz. ${"x ".repeat(5000)}`);
    expect(r.contact.name).toBe("Sam Ortiz");
    expect(r.contact.notes!.length).toBeLessThanOrEqual(MAX_DESCRIPTION);
  });
});
