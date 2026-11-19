import { describe, expect, it } from "vitest";
import { detectCommitments, findDueDate, queryTerms, searchNotes, summarizePerson } from "./memory";
import type { Contact, Interaction, Reminder } from "./types";

const person = (id: string, name: string): Contact =>
  ({
    id,
    name,
    categories: [],
    tags: [],
    interests: [],
    goals: [],
    skills: [],
    importantDates: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }) as unknown as Contact;

const note = (id: string, contactId: string, date: string, summary: string): Interaction =>
  ({ id, contactId, date, kind: "coffee", summary, createdAt: `${date}T00:00:00.000Z` }) as unknown as Interaction;

const maya = person("c1", "Maya Okafor");
const leo = person("c2", "Leo Brandt");
const notes = [
  note("n1", "c1", "2026-10-02", "Talked about her clerkship applications and the Ninth Circuit."),
  note("n2", "c1", "2026-11-10", "She got the clerkship interview. Wants mock interview practice."),
  note("n3", "c2", "2026-11-12", "Leo is moving to Toronto for a startup job."),
];

describe("search", () => {
  it("splits and folds query words", () => {
    expect(queryTerms("  Café   CLERKSHIP a ")).toEqual(["cafe", "clerkship"]);
    expect(queryTerms("")).toEqual([]);
  });

  it("finds every note with all words, newest first, with highlight ranges", () => {
    const hits = searchNotes("clerkship", notes, [maya, leo]);
    expect(hits.map((h) => h.interaction.id)).toEqual(["n2", "n1"]);
    const h = hits[0];
    const [a, b] = h.ranges[0];
    expect(h.interaction.summary.slice(a, b).toLowerCase()).toBe("clerkship");
  });

  it("matches the person's name together with note words", () => {
    expect(searchNotes("maya interview", notes, [maya, leo]).map((h) => h.interaction.id)).toEqual(["n2"]);
    expect(searchNotes("leo clerkship", notes, [maya, leo])).toEqual([]);
  });

  it("returns nothing for an empty or one-letter query", () => {
    expect(searchNotes("", notes, [maya])).toEqual([]);
    expect(searchNotes("a", notes, [maya])).toEqual([]);
  });
});

describe("due dates", () => {
  // 2026-11-19 is a Thursday.
  const d = "2026-11-19";
  it.each([
    ["call her today", "2026-11-19"],
    ["send it tomorrow", "2026-11-20"],
    ["in 3 days", "2026-11-22"],
    ["in two weeks", "2026-12-03"],
    ["in a month", "2026-12-19"],
    ["sometime next week", "2026-11-23"],
    ["this weekend", "2026-11-21"],
    ["by end of the month", "2026-11-30"],
    ["by Friday", "2026-11-20"],
    ["on Thursday", "2026-11-26"],
    ["next Monday", "2026-11-30"],
    ["before Dec 4th", "2026-12-04"],
    ["by January 10", "2027-01-10"],
    ["on 2026-12-01", "2026-12-01"],
    ["by 12/5", "2026-12-05"],
    ["by 2/3", "2027-02-03"],
  ])("%s → %s", (s, want) => expect(findDueDate(s, d)).toBe(want));

  it("ignores sentences with no time and impossible dates", () => {
    expect(findDueDate("send her the article", d)).toBeUndefined();
    expect(findDueDate("by February 31", d)).toBeUndefined();
    expect(findDueDate("score was 13/40", d)).toBeUndefined();
  });
});

describe("commitments", () => {
  const d = "2026-11-19";
  it("spots my promises with dates", () => {
    const c = detectCommitments("Great coffee. I'll send her my outline by Friday.", d, "Maya Okafor");
    expect(c).toEqual([{ title: "Send her my outline", dueDate: "2026-11-20", owner: "me", sentence: "I'll send her my outline by Friday." }]);
  });

  it("spots several promises in one note, including joined by 'and'", () => {
    const c = detectCommitments("I promised to intro her to Leo and I need to review her cover letter tomorrow.", d);
    expect(c.map((x) => x.title)).toEqual(["Intro her to Leo", "Review her cover letter"]);
    expect(c[1].dueDate).toBe("2026-11-20");
  });

  it("turns their promises into a check-in for me", () => {
    const [c] = detectCommitments("She said she'd send me the job posting next week.", d, "Maya Okafor");
    expect(c.owner).toBe("them");
    expect(c.title).toBe("Check on: Maya to send you the job posting");
    expect(c.dueDate).toBe("2026-11-23");
  });

  it("spots follow-ups", () => {
    const [c] = detectCommitments("Should follow up about the internship in two weeks.", d, "Leo Brandt");
    expect(c.title).toMatch(/^Follow up with Leo on the internship$/);
    expect(c.dueDate).toBe("2026-12-03");
  });

  it("does not invent promises from plain notes or third parties", () => {
    expect(detectCommitments("Leo is moving to Toronto. He likes hiking.", d)).toEqual([]);
    expect(detectCommitments("I will.", d)).toEqual([]);
    expect(detectCommitments("", d)).toEqual([]);
  });
});

describe("summary", () => {
  const reminders: Reminder[] = [
    { id: "r1", contactId: "c1", title: "Mock interview", dueDate: "2026-11-25", done: false, sourceInteractionId: "n2" } as unknown as Reminder,
    { id: "r2", contactId: "c1", title: "Old thing", done: true } as unknown as Reminder,
  ];

  it("builds lines that each name their source notes", () => {
    const lines = summarizePerson(maya, notes, reminders, "2026-11-19");
    const by = Object.fromEntries(lines.map((l) => [l.label, l]));
    expect(by["Last time"].text).toMatch(/^9 days ago \(coffee\): She got the clerkship interview/);
    expect(by["Last time"].sources).toEqual(["n2"]);
    expect(by["History"].text).toBe("2 conversations logged since 2026-10-02");
    expect(by["Keeps coming up"].text).toContain("clerkship (2 notes)");
    expect(by["Keeps coming up"].sources.sort()).toEqual(["n1", "n2"]);
    expect(by["Open follow-ups"].text).toBe("Mock interview (by 2026-11-25)");
    expect(by["Open follow-ups"].sources).toEqual(["n2"]);
  });

  it("is empty when there are no notes", () => {
    expect(summarizePerson(person("c9", "Nobody"), notes, [], "2026-11-19")).toEqual([]);
  });
});
