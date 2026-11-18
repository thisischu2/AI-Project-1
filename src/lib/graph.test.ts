import { describe, expect, it } from "vitest";
import { distancesFrom, isVerifiedPath, shortestPath } from "./graph";
import type { Connection } from "./types";

const edge = (a: string, b: string): Connection => ({
  id: `${a}-${b}`,
  sourceId: a,
  targetId: b,
  createdAt: "2026-01-01",
});

// You → Marcus → Danielle → James, plus a longer detour and an island.
const graph = [
  edge("me", "marcus"),
  edge("marcus", "danielle"),
  edge("danielle", "james"),
  edge("me", "priya"),
  edge("priya", "leo"),
  edge("leo", "sam"),
  edge("sam", "james"),
  edge("island-a", "island-b"),
];

describe("shortestPath", () => {
  it("finds the spec example: You → Marcus → Danielle → James (3 degrees)", () => {
    const result = shortestPath(graph, "me", "james");
    expect(result).toEqual({ found: true, path: ["me", "marcus", "danielle", "james"], degrees: 3 });
  });

  it("treats connections as undirected", () => {
    const result = shortestPath(graph, "james", "me");
    expect(result.found && result.degrees).toBe(3);
  });

  it("reports 1 degree for a direct connection", () => {
    expect(shortestPath(graph, "me", "marcus")).toMatchObject({ found: true, degrees: 1 });
  });

  it("says no path exists instead of guessing", () => {
    expect(shortestPath(graph, "me", "island-a")).toEqual({ found: false, path: [], degrees: null });
  });

  it("handles people with no connections at all", () => {
    expect(shortestPath(graph, "me", "nobody")).toMatchObject({ found: false });
  });

  it("returns 0 degrees for the same person", () => {
    expect(shortestPath(graph, "me", "me")).toEqual({ found: true, path: ["me"], degrees: 0 });
  });

  it("is deterministic when several shortest paths tie", () => {
    const tie = [edge("me", "b"), edge("me", "a"), edge("a", "z"), edge("b", "z")];
    const first = shortestPath(tie, "me", "z");
    for (let i = 0; i < 5; i++) expect(shortestPath(tie, "me", "z")).toEqual(first);
    expect(first.path).toEqual(["me", "a", "z"]);
  });

  it("ignores self-loops", () => {
    expect(shortestPath([edge("me", "me")], "me", "x")).toMatchObject({ found: false });
  });
});

describe("isVerifiedPath", () => {
  it("accepts a path made only of recorded edges", () => {
    expect(isVerifiedPath(graph, ["me", "marcus", "danielle", "james"])).toBe(true);
  });
  it("rejects a path with a missing edge", () => {
    expect(isVerifiedPath(graph, ["me", "danielle", "james"])).toBe(false);
  });
});

describe("distancesFrom", () => {
  it("computes BFS layers", () => {
    const d = distancesFrom(graph, "me");
    expect(d.get("marcus")).toBe(1);
    expect(d.get("danielle")).toBe(2);
    expect(d.get("james")).toBe(3);
    expect(d.has("island-a")).toBe(false);
  });
});
