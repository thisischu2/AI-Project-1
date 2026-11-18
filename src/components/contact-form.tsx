"use client";

import { useState } from "react";
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
}: {
  initial: ContactInput;
  onSubmit: (value: ContactInput) => void;
  onCancel: () => void;
  submitLabel?: string;
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

  const set = <K extends keyof ContactInput>(k: K, value: ContactInput[K]) => setV((p) => ({ ...p, [k]: value }));
  const toggleCat = (c: Category) =>
    set("categories", v.categories.includes(c) ? v.categories.filter((x) => x !== c) : [...v.categories, c]);

  const field = (key: "location" | "occupation" | "organization" | "email" | "phone", label: string, placeholder = "") => (
    <div>
      <Label htmlFor={`f-${key}`}>{label}</Label>
      <Input id={`f-${key}`} value={v[key] ?? ""} placeholder={placeholder} onChange={(e) => set(key, e.target.value || undefined)} />
    </div>
  );

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!v.name.trim()) return setError("A name is required.");
        if (v.email && !/^\S+@\S+\.\S+$/.test(v.email)) return setError("That email doesn't look right.");
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
        <Input id="f-name" value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="Full name" autoFocus />
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
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
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
        </div>
      ))}
      <div>
        <Label htmlFor="f-met">How you met</Label>
        <Input id="f-met" value={v.metContext ?? ""} onChange={(e) => set("metContext", e.target.value || undefined)} />
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
      </div>
      {error && <p className="text-sm text-red-300">{error}</p>}
      <div className="flex justify-end gap-2 border-t border-white/5 pt-5">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
