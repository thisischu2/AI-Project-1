"use client";

import cytoscape, { type Core, type ElementDefinition } from "cytoscape";
import { useEffect, useMemo, useRef } from "react";
import { radialLayout } from "@/lib/layout";
import type { Category, Connection, Contact } from "@/lib/types";
import { ME } from "@/lib/types";

const CATEGORY_COLORS: Record<Category, string> = {
  friend: "#3B82F6",
  family: "#F59E0B",
  classmate: "#22D3EE",
  mentor: "#8B5CF6",
  colleague: "#10B981",
  collaborator: "#EC4899",
  community: "#F97316",
  acquaintance: "#A1A1AA",
};
export { CATEGORY_COLORS };

interface Props {
  contacts: Contact[];
  connections: Connection[];
  userName: string;
  highlightPath?: string[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  height?: number | string;
  interactive?: boolean;
}

export function NetworkGraph({
  contacts,
  connections,
  userName,
  highlightPath = [],
  selectedId,
  onSelect,
  height = 560,
  interactive = true,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const cy = useRef<Core | null>(null);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  const visibleIds = useMemo(() => new Set([ME, ...contacts.map((c) => c.id)]), [contacts]);
  const structureKey = useMemo(
    () =>
      [...visibleIds].sort().join(",") +
      "|" +
      connections
        .filter((e) => visibleIds.has(e.sourceId) && visibleIds.has(e.targetId))
        .map((e) => e.id)
        .sort()
        .join(","),
    [visibleIds, connections],
  );

  // (Re)build the graph when the set of nodes or edges changes.
  useEffect(() => {
    if (!container.current) return;
    // Radial layout: rings are degrees of separation from you.
    const positions = radialLayout(ME, contacts.map((c) => c.id), connections);
    const elements: ElementDefinition[] = [
      { data: { id: ME, label: userName || "You", color: "#F4F4F5", me: 1 }, position: positions.get(ME) },
      ...contacts.map((c) => ({
        data: { id: c.id, label: c.name.split(" ")[0], color: CATEGORY_COLORS[c.categories[0] ?? "acquaintance"] },
        position: positions.get(c.id),
      })),
      ...connections
        .filter((e) => visibleIds.has(e.sourceId) && visibleIds.has(e.targetId))
        .map((e) => ({ data: { id: e.id, source: e.sourceId, target: e.targetId, label: e.label ?? "" } })),
    ];

    const instance = cytoscape({
      container: container.current,
      elements,
      minZoom: 0.3,
      maxZoom: 1.6,
      userZoomingEnabled: interactive,
      userPanningEnabled: interactive,
      boxSelectionEnabled: false,
      autoungrabify: !interactive,
      style: [
        {
          selector: "node",
          style: {
            "background-color": "data(color)",
            "background-opacity": 0.95,
            width: 22,
            height: 22,
            label: "data(label)",
            color: "#D4D4D8",
            "font-size": 11,
            "font-family": "Geist, Inter, system-ui, sans-serif",
            "text-valign": "bottom",
            "text-margin-y": 7,
            "border-width": 2,
            "border-color": "#09090B",
            "transition-property": "opacity, width, height, border-color, border-width",
            "transition-duration": 250,
          },
        },
        {
          selector: "node[me = 1]",
          style: {
            width: 34,
            height: 34,
            "border-width": 3,
            "border-color": "#3B82F6",
            "font-weight": 600,
            color: "#F4F4F5",
          },
        },
        {
          selector: "edge",
          style: {
            width: 1.4,
            "line-color": "#3F3F46",
            "curve-style": "bezier",
            opacity: 0.8,
            "transition-property": "opacity, line-color, width",
            "transition-duration": 250,
          },
        },
        { selector: ".dim", style: { opacity: 0.15 } },
        { selector: "node.on-path", style: { "border-color": "#8B5CF6", "border-width": 4, width: 30, height: 30, color: "#FFFFFF" } },
        { selector: "edge.on-path", style: { "line-color": "#8B5CF6", width: 3.5, opacity: 1 } },
        { selector: "node.selected", style: { "border-color": "#F4F4F5", "border-width": 3 } },
      ],
      layout: { name: "preset", padding: 36 },
    });

    // Keep names readable on a phone: when the map is zoomed out to fit a
    // small screen, grow the label size so it stays about 12px on screen.
    const keepLabelsReadable = () => {
      const z = instance.zoom();
      instance.style().selector("node").style("font-size", Math.min(24, Math.max(11, 12 / z))).update();
    };
    instance.on("zoom", keepLabelsReadable);
    keepLabelsReadable();

    instance.on("tap", "node", (evt) => onSelectRef.current?.(evt.target.id()));
    instance.on("tap", (evt) => {
      if (evt.target === instance) onSelectRef.current?.(null);
    });
    instance.on("mouseover", "node", () => {
      if (container.current) container.current.style.cursor = "pointer";
    });
    instance.on("mouseout", "node", () => {
      if (container.current) container.current.style.cursor = "default";
    });
    cy.current = instance;
    return () => {
      instance.destroy();
      cy.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structureKey, userName, interactive]);

  // Highlight path and selection without rebuilding the layout.
  const pathKey = highlightPath.join(">");
  useEffect(() => {
    const instance = cy.current;
    if (!instance) return;
    const highlightPath = pathKey ? pathKey.split(">") : [];
    instance.elements().removeClass("dim on-path selected");
    if (highlightPath.length > 1) {
      const onPath = instance.collection();
      highlightPath.forEach((id, i) => {
        onPath.merge(instance.getElementById(id));
        if (i < highlightPath.length - 1) {
          onPath.merge(instance.getElementById(id).edgesWith(instance.getElementById(highlightPath[i + 1])));
        }
      });
      instance.elements().not(onPath).addClass("dim");
      onPath.addClass("on-path");
      instance.stop();
      instance.animate({ fit: { eles: onPath, padding: 120 }, duration: 450, easing: "ease-in-out-cubic" });
    } else {
      instance.stop();
      instance.animate({ fit: { eles: instance.elements(), padding: 36 }, duration: 300 });
    }
    if (selectedId) instance.getElementById(selectedId).addClass("selected");
  }, [pathKey, selectedId, structureKey]);

  return (
    <div
      ref={container}
      style={{ height }}
      className="w-full"
      role="img"
      aria-label={`Network map with ${contacts.length} contacts and ${connections.length} recorded connections`}
    />
  );
}
