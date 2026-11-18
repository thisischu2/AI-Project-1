/**
 * Radial "degrees" layout for THE MAP: you in the center, each ring is one
 * more degree away. Each person sits inside the angular slice of whoever
 * first reached them in the breadth-first search, so branches stay together
 * and lines rarely cross. Deterministic: same network, same picture.
 */
import { buildAdjacency } from "./graph";
import type { Connection } from "./types";

type Edge = Pick<Connection, "sourceId" | "targetId">;

export function radialLayout(
  rootId: string,
  nodeIds: string[],
  connections: Edge[],
  ringGap = 120,
): Map<string, { x: number; y: number }> {
  const present = new Set([rootId, ...nodeIds]);
  const adj = buildAdjacency(connections.filter((e) => present.has(e.sourceId) && present.has(e.targetId)));

  // BFS spanning tree from the root.
  const children = new Map<string, string[]>();
  const depth = new Map<string, number>([[rootId, 0]]);
  const queue = [rootId];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const next of [...(adj.get(cur) ?? [])].sort()) {
      if (depth.has(next)) continue;
      depth.set(next, depth.get(cur)! + 1);
      children.set(cur, [...(children.get(cur) ?? []), next]);
      queue.push(next);
    }
  }

  // Weight = number of leaves under each node, so busy branches get more room.
  const weight = new Map<string, number>();
  const leaves = (id: string): number => {
    const kids = children.get(id) ?? [];
    const w = kids.length ? kids.reduce((s, k) => s + leaves(k), 0) : 1;
    weight.set(id, w);
    return w;
  };
  leaves(rootId);

  const pos = new Map<string, { x: number; y: number }>([[rootId, { x: 0, y: 0 }]]);
  const place = (id: string, start: number, end: number) => {
    const kids = children.get(id) ?? [];
    const total = kids.reduce((s, k) => s + weight.get(k)!, 0);
    let cursor = start;
    for (const k of kids) {
      const span = ((end - start) * weight.get(k)!) / total;
      const angle = cursor + span / 2;
      const r = depth.get(k)! * ringGap;
      pos.set(k, { x: r * Math.cos(angle), y: r * Math.sin(angle) });
      place(k, cursor, cursor + span);
      cursor += span;
    }
  };
  place(rootId, -Math.PI / 2, (3 * Math.PI) / 2);

  // People with no recorded path to you: an outer ring, evenly spaced.
  const unreachable = nodeIds.filter((id) => !pos.has(id)).sort();
  const maxDepth = Math.max(0, ...depth.values());
  const outer = (maxDepth + 1.3) * ringGap;
  unreachable.forEach((id, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(unreachable.length, 1) + 0.35;
    pos.set(id, { x: outer * Math.cos(a), y: outer * Math.sin(a) });
  });
  return pos;
}
