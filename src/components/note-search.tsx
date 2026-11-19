"use client";

import { Search, X } from "lucide-react";
import { formatDate } from "@/lib/api";
import type { NoteHit } from "@/lib/memory";
import { cn, inputClass } from "./ui";

/** A note's text with the matched words marked. */
export function Highlight({ text, ranges }: { text: string; ranges: [number, number][] }) {
  const parts: React.ReactNode[] = [];
  let at = 0;
  for (const [a, b] of ranges) {
    if (a > at) parts.push(text.slice(at, a));
    parts.push(
      <mark key={a} className="rounded bg-violet/30 px-0.5 text-platinum">
        {text.slice(a, b)}
      </mark>,
    );
    at = b;
  }
  parts.push(text.slice(at));
  return <>{parts}</>;
}

export function SearchBox({ value, onChange, label, placeholder }: { value: string; onChange: (v: string) => void; label: string; placeholder: string }) {
  return (
    <div className="relative">
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-silver" />
      <input
        type="search"
        aria-label={label}
        className={cn(inputClass, "pl-9 pr-11")}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-silver hover:text-platinum"
        >
          <X size={15} />
        </button>
      )}
    </div>
  );
}

/** Search results; shows who each note is about unless `hideName`. */
export function NoteHits({ hits, query, hideName, onOpen }: { hits: NoteHit[]; query: string; hideName?: boolean; onOpen?: (contactId: string) => void }) {
  if (!hits.length) return <p className="py-3 text-sm text-silver">No notes mention &ldquo;{query.trim()}&rdquo;. Try fewer or different words.</p>;
  return (
    <div>
      <p className="mb-2 text-xs text-silver">
        {hits.length} {hits.length === 1 ? "note" : "notes"} found
      </p>
      <ul className="divide-y divide-white/5">
        {hits.map((h) => (
          <li key={h.interaction.id} className="py-3">
            <p className="text-xs text-silver">
              {!hideName &&
                (onOpen ? (
                  <button type="button" className="text-platinum underline underline-offset-2" onClick={() => onOpen(h.interaction.contactId)}>
                    {h.contactName || "Unknown"}
                  </button>
                ) : (
                  <span className="text-platinum">{h.contactName || "Unknown"}</span>
                ))}
              {!hideName && " · "}
              <span className="capitalize">{h.interaction.kind}</span> · {formatDate(h.interaction.date)}
            </p>
            <p className="mt-1 text-sm text-zinc-300">
              <Highlight text={h.interaction.summary} ranges={h.ranges} />
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
