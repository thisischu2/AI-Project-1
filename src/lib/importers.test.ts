import { describe, expect, it } from "vitest";
import { buildDemoNetwork } from "./demo-data";
import { classifyRows, guessColumnMap, parseBirthday, parseCSV, parseVCards, planImport, rowsToCandidates, splitHeader, toContactInput } from "./importers";

const demo = buildDemoNetwork("Sam").contacts;

describe("parseCSV", () => {
  it("handles quotes, embedded commas, newlines, escaped quotes, CRLF and BOM", () => {
    const rows = parseCSV('﻿Name,Notes\r\n"Reed, Marcus","Said ""hi""\nthen left"\r\nAna,\r\n');
    expect(rows).toEqual([["Name", "Notes"], ["Reed, Marcus", 'Said "hi"\nthen left'], ["Ana", ""]]);
  });
  it("detects semicolons and tabs", () => {
    expect(parseCSV("a;b\n1;2")).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseCSV("a\tb\n1\t2")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("returns nothing for an empty file", () => {
    expect(parseCSV("")).toEqual([]);
  });
});

describe("column guessing", () => {
  it("maps Google Contacts headers", () => {
    const m = guessColumnMap(["First Name", "Middle Name", "Last Name", "E-mail 1 - Value", "Phone 1 - Value", "Organization Name", "Organization Title", "Birthday", "Notes", "Labels"]);
    expect(m).toMatchObject({ firstName: 0, middleName: 1, lastName: 2, email: 3, phone: 4, organization: 5, occupation: 6, birthday: 7, notes: 8, tags: 9, name: -1 });
  });
  it("maps Outlook headers", () => {
    const m = guessColumnMap(["First Name", "Last Name", "E-mail Address", "Mobile Phone", "Company", "Job Title", "Business City"]);
    expect(m).toMatchObject({ email: 2, phone: 3, organization: 4, occupation: 5, location: 6 });
  });
  it("finds LinkedIn's header below its notes preamble", () => {
    const rows = parseCSV('Notes:\n"When exporting your connection data, you may notice..."\n\nFirst Name,Last Name,URL,Email Address,Company,Position,Connected On\nAna,Ruiz,https://x,,Acme,Counsel,01 Nov 2026');
    const { headers, body } = splitHeader(rows);
    expect(headers[0]).toBe("First Name");
    const [c] = rowsToCandidates(body, guessColumnMap(headers));
    expect(c).toMatchObject({ firstName: "Ana", lastName: "Ruiz", organization: "Acme", occupation: "Counsel" });
  });
});

describe("parseVCards", () => {
  it("reads vCard 3.0 with folding, escapes and item. prefixes", () => {
    const [c] = parseVCards(
      "BEGIN:VCARD\r\nVERSION:3.0\r\nN:Ruiz;Ana;M.;;\r\nFN:Ana M. Ruiz\r\nORG:Acme\\, Inc.;Legal\r\nTITLE:Counsel\r\nitem1.EMAIL;type=INTERNET:ana@acme.com\r\nTEL;type=CELL:+1 415 555 0100\r\nADR;type=HOME:;;1 Main St;Toronto;ON;M5V;Canada\r\nBDAY:1998-04-12\r\nNOTE:Met at moot\\ncourt\r\n  final\r\nEND:VCARD\r\n",
    );
    expect(c).toMatchObject({ name: "Ana M. Ruiz", organization: "Acme, Inc., Legal", occupation: "Counsel", email: "ana@acme.com", location: "Toronto, ON", birthday: "1998-04-12" });
    expect(c.notes).toBe("Met at moot\ncourt final");
  });
  it("reads vCard 2.1 quoted-printable and multiple cards", () => {
    const cards = parseVCards("BEGIN:VCARD\nVERSION:2.1\nFN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Jos=C3=A9 P=\n=C3=A9rez\nEND:VCARD\nBEGIN:VCARD\nFN:Ben\nEND:VCARD");
    expect(cards.map((c) => c.name)).toEqual(["José Pérez", "Ben"]);
  });
  it("ignores text outside cards", () => {
    expect(parseVCards("hello\nFN:Nobody")).toEqual([]);
  });
});

describe("rows to contacts", () => {
  it("builds a name from parts and keeps text as plain text", () => {
    const r = toContactInput({ firstName: "Ana", lastName: "Ruiz", notes: '=HYPERLINK("http://evil","x")' });
    expect("contact" in r && r.contact.name).toBe("Ana Ruiz");
    expect("contact" in r && r.contact.notes).toBe('=HYPERLINK("http://evil","x")');
  });
  it("rejects rows without a name", () => {
    expect(toContactInput({ email: "a@b.com" })).toEqual({ error: "No name in this row (only an email)" });
  });
  it("warns about bad emails and yearless birthdays", () => {
    const r = toContactInput({ name: "Ana", email: "not-an-email", birthday: "--04-12" });
    expect("warnings" in r && r.warnings).toHaveLength(2);
  });
  it.each([
    ["1998-04-12", "1998-04-12"],
    ["19980412", "1998-04-12"],
    ["4/12/1998", "1998-04-12"],
    ["25.12.1998", "1998-12-25"],
    ["1998-02-30", undefined],
    ["April 12", undefined],
  ])("parses birthday %s", (input, out) => expect(parseBirthday(input)).toBe(out));
});

describe("classifyRows and planImport", () => {
  const rows = classifyRows(
    [
      { name: "Ana Ruiz", email: "ana@x.com" },
      { name: "Marcus Reed", email: "marcus@new.com", occupation: "Design lead" },
      { name: "ANA RUIZ", email: "ana@x.com" },
      { email: "ghost@x.com" },
    ],
    demo,
  );
  it("labels new, duplicate, repeated and invalid rows with cautious defaults", () => {
    expect(rows.map((r) => [r.status, r.action])).toEqual([
      ["new", "add"],
      ["duplicate", "skip"],
      ["repeat", "skip"],
      ["invalid", "skip"],
    ]);
    expect(rows[1].match?.contact.name).toBe("Marcus Reed");
    expect(rows[2].repeatOf).toBe(0);
  });
  it("updating an existing person only fills blanks", () => {
    const plan = planImport(rows.map((r, i) => (i === 1 ? { ...r, action: "update" } : r)), demo);
    expect(plan.add.map((c) => c.name)).toEqual(["Ana Ruiz"]);
    const marcus = demo.find((c) => c.name === "Marcus Reed")!;
    const patch = plan.update[0];
    expect(patch.id).toBe(marcus.id);
    expect(patch.patch.occupation).toBe(marcus.occupation); // existing value kept
    expect(patch.patch.email).toBe("marcus@new.com"); // blank filled
  });
});
