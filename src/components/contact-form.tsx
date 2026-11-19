"use client";

import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { findDuplicates, type DuplicateMatch } from "@/lib/duplicates";
import { CATEGORIES, type Category, type Contact } from "@/lib/types";
import { Button, Input, Label, Textarea, cn } from "./ui";

type ContactInput = Omit<Contact, "id" | "createdAt" | "updatedAt">;

const splitList = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

export function blankContact(): ContactInput {
  return { name: "", categories: [], tags: [], interests: [], goals: [], skills: [], importantDates: [] };
}

export function ContactForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel = "Save contact",
  existing,
  editingId,
  onOpenExisting,
  hints,
  extra,
}: {
  initial: ContactInput;
  onSubmit: (value: ContactInput) => void;
  onCancel: () => void;
  submitLabel?: string;
  /** Other contacts to check for duplicates before saving. */
  existing?: Contact[];
  editingId?: string;
  onOpenExisting?: (id: string) => void;
  /** Words each prefilled value came from (contact capture), shown under the field. */
  hints?: Partial<Record<string, string[]>>;
  /** Extra choices shown above the save button. */
  extra?: React.ReactNode;
}) {
  const [v, setV] = useState(initial);
  const [lists, setLists] = useState({
    tags: initial.tags.join(", "),
    interests: initial.interests.join(", "),
    goals: initial.goals.join(", "),
    skills: initial.skills.join(", "),
  });
  const [dates, setDates] = useState(initial.importantDates);
  const [error, setError] = useState("");
  // Possible duplicates found on save; shown once, then "Save anyway" goes through.
  const [dupes, setDupes] = useState<DuplicateMatch[] | null>(null);

  const set = <K extends keyof ContactInput>(k: K, value: ContactInput[K]) => setV((p) => ({ ...p, [k]: value }));
  const toggleCat = (c: Category) =>
    set("categories", v.categories.includes(c) ? v.categories.filter((x) => x !== c) : [...v.categories, c]);

  const hint = (key: string) => {
    const from = hints?.[key];
    if (!from?.length) return null;
    return (
      <p className="mt-1 text-xs text-violet-300/90">
        From your words: {from.map((f) => `“${f}”`).join(", ")}
      </p>
    );
  };

  const field = (key: "location" | "occupation" | "organization" | "email" | "phone", label: string, placeholder = "") => (
    <div>
      <Label htmlFor={`f-${key}`}>{label}</Label>
      <Input id={`f-${key}`} value={v[key] ?? ""} placeholder={placeholder} onChange={(e) => set(key, e.target.value || undefined)} />
      {hint(key)}
    </div>
  );

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!v.name.trim()) return setError("A name is required.");
        if (v.email && !/^\S+@\S+\.\S+$/.test(v.email)) return setError("That email doesn't look right.");
        if (existing && dupes === null) {
          const found = findDuplicates({ name: v.name, email: v.email, phone: v.phone }, existing, editingId);
          if (found.length) return setDupes(found.slice(0, 3));
        }
        onSubmit({
          ...v,
          name: v.name.trim(),
          tags: splitList(lists.tags),
          interests: splitList(lists.interests),
          goals: splitList(lists.goals),
          skills: splitList(lists.skills),
          importantDates: dates.filter((d) => d.label.trim() && d.date),
        });
      }}
    >
      <div>
        <Label htmlFor="f-name">Name *</Label>
        <Input id="f-name" value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="Full name" autoFocus={!hints} />
        {hint("name")}
        {hints && !v.name && <p className="mt-1 text-xs text-amber-300">We couldn&apos;t tell the name from your description. Please type it.</p>}
      </div>
      <div>
        <Label>Categories</Label>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              type="button"
              key={c}
              onClick={() => toggleCat(c)}
              aria-pressed={v.categories.includes(c)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs capitalize transition",
                v.categories.includes(c)
                  ? "border-cobalt/60 bg-cobalt/15 text-blue-200"
                  : "border-white/10 text-silver hover:border-white/20",
              )}
            >
              {c}
            </button>
          ))}
        </div>
        {hint("categories")}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {field("occupation", "Occupation", "e.g. Product Designer")}
        {field("organization", "Organization")}
        {field("location", "Location", "City, Region")}
        {field("email", "Email (optional)")}
        {field("phone", "Phone (optional)")}
      </div>
      {(["interests", "goals", "skills", "tags"] as const).map((k) => (
        <div key={k}>
          <Label htmlFor={`f-${k}`}>
            <span className="capitalize">{k}</span> <span className="text-zinc-500">(comma separated)</span>
          </Label>
          <Input id={`f-${k}`} value={lists[k]} onChange={(e) => setLists((p) => ({ ...p, [k]: e.target.value }))} />
          {hint(k)}
        </div>
      ))}
      <div>
        <Label htmlFor="f-met">How you met</Label>
        <Input id="f-met" value={v.metContext ?? ""} onChange={(e) => set("metContext", e.target.value || undefined)} />
        {hint("metContext")}
      </div>
      <div>
        <Label htmlFor="f-notes">Notes</Label>
        <Textarea id="f-notes" value={v.notes ?? ""} onChange={(e) => set("notes", e.target.value || undefined)} />
      </div>
      <div>
        <Label>Important dates</Label>
        <div className="space-y-2">
          {dates.map((d, i) => (
            <div key={i} className="flex gap-2">
              <Input
                aria-label="Date label"
                placeholder="Birthday"
                value={d.label}
                onChange={(e) => setDates(dates.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
              />
              <Input
                aria-label="Date"
                type="date"
                value={d.date}
                onChange={(e) => setDates(dates.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))}
              />
              <Button type="button" variant="ghost" onClick={() => setDates(dates.filter((_, j) => j !== i))} aria-label="Remove date">
                ×
              </Button>
            </div>
          ))}
          <Button type="button" size="sm" variant="ghost" onClick={() => setDates([...dates, { label: "", date: "" }])}>
            + Add date
          </Button>
        </div>
        {hint("birthday")}
      </div>
      {extra}
      {error && <p className="text-sm text-red-300">{error}</p>}
      {dupes && dupes.length > 0 && (
        <div role="alert" className="space-y-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-sm">
          <p className="flex items-center gap-2 font-medium text-amber-200">
            <AlertTriangle size={15} /> This might already be in your circle
          </p>
          <ul className="space-y-2">
            {dupes.map((d) => (
              <li key={d.contact.id} className="flex items-start justify-between gap-3">
                <span>
                  <span className="text-platinum">{d.contact.name}</span>
                  <span className="block text-xs text-amber-100/80">{d.reasons.join(" · ")}</span>
                </span>
                {onOpenExisting && (
                  <Button type="button" size="sm" onClick={() => onOpenExisting(d.contact.id)}>
                    Open
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <p className="text-xs text-amber-100/80">If it&apos;s a different person, save again. You can also merge duplicates later from My Circle.</p>
        </div>
      )}
      <div className="flex justify-end gap-2 border-t border-white/5 pt-5">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary">
          {dupes?.length ? "Save anyway" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
