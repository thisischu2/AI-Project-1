import { describe, expect, it } from "vitest";
import { nextOccurrence, upcoming } from "./reconnect";

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
