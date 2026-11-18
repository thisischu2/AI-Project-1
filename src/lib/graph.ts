/**
 * Deterministic graph logic for THE MAP.
 *
 * Degrees of separation are computed ONLY from connections the user recorded.
 * Shared interests, employers, or schools never create an edge. If no recorded
 * path exists we say so; we never guess.
 */
import type { Connection as FullConnection } from "./types";

/** Graph functions only need the endpoints of each edge. */
type Connection = Pick<FullConnection, "sourceId" | "targetId">;

export type Adjacency = Map<string, Set<string>>;

export function buildAdjacency(connections: Connection[]): Adjacency {
  const adj: Adjacency = new Map();
  const link = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set());
    adj.get(a)!.add(b);
  };
  for (const c of connections) {
    if (c.sourceId === c.targetId) continue; // ignore self-loops
    link(c.sourceId, c.targetId);
    link(c.targetId, c.sourceId);
  }
  return adj;
}

export type PathResult =
  | { found: true; path: string[]; degrees: number }
  | { found: false; path: []; degrees: null };

/**
 * Breadth-first search for the shortest known path between two people.
 * Neighbors are visited in sorted id order so the result is reproducible
 * when several shortest paths exist.
 */
export function shortestPath(
  connections: Connection[],
  fromId: string,
  toId: string,
): PathResult {
  if (fromId === toId) return { found: true, path: [fromId], degrees: 0 };
  const adj = buildAdjacency(connections);
  if (!adj.has(fromId) || !adj.has(toId)) {
    return { found: false, path: [], degrees: null };
  }

  const previous = new Map<string, string>();
  const visited = new Set<string>([fromId]);
  const queue: string[] = [fromId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbors = [...(adj.get(current) ?? [])].sort();
    for (const next of neighbors) {
      if (visited.has(next)) continue;
      visited.add(next);
      previous.set(next, current);
      if (next === toId) {
        const path = [toId];
        let step = toId;
        while (previous.has(step)) {
          step = previous.get(step)!;
          path.unshift(step);
        }
        return { found: true, path, degrees: path.length - 1 };
      }
      queue.push(next);
    }
  }
  return { found: false, path: [], degrees: null };
}

/** True when every consecutive pair in the path is a recorded connection. */
export function isVerifiedPath(connections: Connection[], path: string[]): boolean {
  if (path.length < 2) return path.length === 1;
  const adj = buildAdjacency(connections);
  for (let i = 0; i < path.length - 1; i++) {
    if (!adj.get(path[i])?.has(path[i + 1])) return false;
  }
  return true;
}

/** Shortest-path distance from one node to every reachable node. */
export function distancesFrom(connections: Connection[], fromId: string): Map<string, number> {
  const adj = buildAdjacency(connections);
  const dist = new Map<string, number>([[fromId, 0]]);
  const queue = [fromId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of adj.get(current) ?? []) {
      if (dist.has(next)) continue;
      dist.set(next, dist.get(current)! + 1);
      queue.push(next);
    }
  }
  return dist;
}

export function hasConnection(connections: Connection[], a: string, b: string): boolean {
  return connections.some(
    (c) => (c.sourceId === a && c.targetId === b) || (c.sourceId === b && c.targetId === a),
  );
}

export function degreeLabel(degrees: number): string {
  if (degrees === 0) return "Same person";
  return `${degrees} ${degrees === 1 ? "degree" : "degrees"} of separation`;
}
