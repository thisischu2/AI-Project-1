import { describe, expect, it } from "vitest";
import { nextOccurrence, todayView, upcoming } from "./reconnect";

describe("nextOccurrence", () => {
  it("repeats birthdays each year", () => {
    expect(nextOccurrence("1999-12-04", "Birthday", "2026-11-18")).toBe("2026-12-04");
    expect(nextOccurrence("1999-01-04", "Birthday", "2026-11-18")).toBe("2027-01-04");
  });
  it("does not repeat one-off dates, and drops past ones", () => {
    expect(nextOccurrence("2026-12-02", "Moot court final", "2026-11-18")).toBe("2026-12-02");
    expect(nextOccurrence("2026-10-02", "Conference", "2026-11-18")).toBeNull();
  });
});

describe("upcoming", () => {
  it("sorts overdue and soonest first and skips done reminders", () => {
    const items = upcoming(
      [],
      [
        { id: "a", title: "later", dueDate: "2026-12-10", done: false, createdAt: "" },
        { id: "b", title: "overdue", dueDate: "2026-11-10", done: false, createdAt: "" },
        { id: "c", title: "done", dueDate: "2026-11-19", done: true, createdAt: "" },
        { id: "d", title: "undated", done: false, createdAt: "" },
      ],
      "2026-11-18",
    );
    expect(items.map((i) => i.title)).toEqual(["overdue", "later", "undated"]);
  });
});

describe("todayView", () => {
  const r = (id: string, dueDate?: string, done = false) => ({ id, title: id, dueDate, done, createdAt: "" });
  it("groups follow-ups into overdue, today, this week and undated, and lists dates in the next 30 days", () => {
    const v = todayView(
      [
        { id: "c1", name: "Ana", importantDates: [{ label: "Birthday", date: "1990-12-01" }, { label: "Birthday", date: "1990-01-30" }] } as never,
      ],
      [r("late", "2026-11-10"), r("now", "2026-11-19"), r("soon", "2026-11-26"), r("later", "2026-12-20"), r("nodate"), r("finished", "2026-11-19", true)],
      "2026-11-19",
    );
    expect(v.overdue.map((i) => i.title)).toEqual(["late"]);
    expect(v.dueToday.map((i) => i.title)).toEqual(["now"]);
    expect(v.thisWeek.map((i) => i.title)).toEqual(["soon"]);
    expect(v.undated.map((i) => i.title)).toEqual(["nodate"]);
    expect(v.dates.map((i) => [i.title, i.date, i.daysAway])).toEqual([["Ana: Birthday", "2026-12-01", 12]]);
  });
});
