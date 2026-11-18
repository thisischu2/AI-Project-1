"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Check, NotebookPen, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { AIBadge, Avatar, Button, Card, EmptyState, PageHeader, SectionTitle, Spinner, Textarea, cn, inputClass } from "@/components/ui";
import { formatDate, postJSON, todayISO, toPayload } from "@/lib/api";
import { useNetwork } from "@/lib/store";
import type { Contact, InteractionKind } from "@/lib/types";

interface Extraction {
  contactName: string | null;
  matchedContactId: string | null;
  isNewContact: boolean;
  interaction: { kind: InteractionKind; date: string | null; summary: string };
  fields: { location: string | null; occupation: string | null; organization: string | null; metContext: string | null };
  addInterests: string[];
  addGoals: string[];
  addSkills: string[];
  followUps: { title: string; dueDate: string | null }[];
  importantDates: { label: string; date: string }[];
  ambiguities: string[];
}

const EXAMPLE =
  "Had coffee with Marcus yesterday. He's officially leaving Northline in March to start his own design studio and wants to meet climate founders. I promised to send him the pricing article by Friday.";

type Item = { key: string; label: string; value: string; existing?: string; defaultOn: boolean };

export default function MemoryPage() {
  const store = useNetwork();
  const { data, contactById } = store;
  const [note, setNote] = useState("");
  const [contactId, setContactId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Extraction | null>(null);
  const [target, setTarget] = useState<string>(""); // contact id or "new"
  const [newName, setNewName] = useState("");
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [summary, setSummary] = useState("");
  const [date, setDate] = useState(todayISO());
  const [saved, setSaved] = useState(false);

  const extract = async () => {
    setLoading(true);
    setError("");
    setSaved(false);
    try {
      const r = await postJSON<Extraction>("/api/ai/extract", {
        note,
        today: todayISO(),
        contactId: contactId || undefined,
        network: toPayload(data),
      });
      setResult(r);
      setTarget(r.matchedContactId ?? "new");
      setNewName(r.contactName ?? "");
      setSummary(r.interaction.summary);
      setDate(r.interaction.date ?? todayISO());
      setAccepted({});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const existing: Contact | undefined = target && target !== "new" ? contactById(target) : undefined;

  // Each proposed change is a reviewable item. Changing an existing value is OFF by default.
  const items: Item[] = useMemo(() => {
    if (!result) return [];
    const out: Item[] = [];
    (Object.entries(result.fields) as [keyof Extraction["fields"], string | null][]).forEach(([k, v]) => {
      if (!v) return;
      const current = existing?.[k];
      if (current && current.toLowerCase() === v.toLowerCase()) return;
      out.push({ key: `field:${k}`, label: k === "metContext" ? "How you met" : k, value: v, existing: current, defaultOn: !current });
    });
    const addList = (kind: "interests" | "goals" | "skills", values: string[]) =>
      values
        .filter((v) => !existing?.[kind].some((x) => x.toLowerCase() === v.toLowerCase()))
        .forEach((v) => out.push({ key: `${kind}:${v}`, label: `Add ${kind.slice(0, -1)}`, value: v, defaultOn: true }));
    addList("interests", result.addInterests);
    addList("goals", result.addGoals);
    addList("skills", result.addSkills);
    result.importantDates.forEach((d) =>
      out.push({ key: `date:${d.label}:${d.date}`, label: "Important date", value: `${d.label} · ${d.date}`, defaultOn: true }),
    );
    result.followUps.forEach((f, i) =>
      out.push({
        key: `follow:${i}`,
        label: "Follow-up",
        value: f.dueDate ? `${f.title} (by ${f.dueDate})` : f.title,
        defaultOn: true,
      }),
    );
    return out;
  }, [result, existing]);

  const isOn = (it: Item) => accepted[it.key] ?? it.defaultOn;

  const save = () => {
    if (!result) return;
    let id = target;
    const on = (k: string) => items.some((it) => it.key === k && isOn(it));
    const fieldPatch: Partial<Contact> = {};
    (Object.entries(result.fields) as [keyof Extraction["fields"], string | null][]).forEach(([k, v]) => {
      if (v && on(`field:${k}`)) fieldPatch[k] = v;
    });
    const pick = (kind: "interests" | "goals" | "skills", values: string[]) => values.filter((v) => on(`${kind}:${v}`));
    const dates = result.importantDates.filter((d) => on(`date:${d.label}:${d.date}`));

    if (target === "new") {
      if (!newName.trim()) return setError("Give the new contact a name before saving.");
      const c = store.addContact({
        name: newName.trim(),
        categories: [],
        tags: [],
        interests: pick("interests", result.addInterests),
        goals: pick("goals", result.addGoals),
        skills: pick("skills", result.addSkills),
        importantDates: dates,
        ...fieldPatch,
      });
      id = c.id;
    } else if (existing) {
      store.updateContact(existing.id, {
        ...fieldPatch,
        interests: [...existing.interests, ...pick("interests", result.addInterests)],
        goals: [...existing.goals, ...pick("goals", result.addGoals)],
        skills: [...existing.skills, ...pick("skills", result.addSkills)],
        importantDates: [...existing.importantDates, ...dates],
      });
    }
    if (summary.trim()) {
      store.addInteraction({ contactId: id, kind: result.interaction.kind, date, summary: summary.trim(), rawNote: note });
    }
    result.followUps.forEach((f, i) => {
      if (on(`follow:${i}`)) store.addReminder({ contactId: id, title: f.title, dueDate: f.dueDate ?? undefined });
    });
    setSaved(true);
    setResult(null);
    setNote("");
  };

  const timeline = [...data.interactions].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

  return (
    <>
      <PageHeader title="Memory" subtitle="Write a quick note. Claude proposes structured details, and nothing is saved until you approve it." />

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-5">
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-medium">New memory</p>
              <button className="text-xs text-silver hover:text-platinum" onClick={() => setNote(EXAMPLE)}>
                Use example
              </button>
            </div>
            <Textarea
              aria-label="Interaction note"
              className="min-h-36"
              placeholder="e.g. Ran into Priya at the library. She's applying to tech policy internships and asked if I know anyone at a digital rights org…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <select aria-label="About" className={inputClass} value={contactId} onChange={(e) => setContactId(e.target.value)}>
                <option value="">Let Claude detect who it&apos;s about</option>
                {data.contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <Button variant="primary" onClick={extract} disabled={!note.trim() || loading} className="shrink-0">
                {loading ? <Spinner /> : <Sparkles size={15} />} Extract details
              </Button>
            </div>
            {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
            {saved && (
              <p className="mt-3 flex items-center gap-2 text-sm text-emerald-300">
                <Check size={15} /> Saved to your timeline.
              </p>
            )}
          </Card>

          <AnimatePresence>
            {result && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Card className="p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <p className="font-medium">Review before saving</p>
                    <AIBadge>Proposed by Claude</AIBadge>
                  </div>

                  <label className="mb-1.5 block text-xs text-silver">Who is this about?</label>
                  <select aria-label="Contact" className={inputClass} value={target} onChange={(e) => setTarget(e.target.value)}>
                    <option value="new">+ New contact{result.contactName ? `: ${result.contactName}` : ""}</option>
                    {data.contacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {target === "new" && (
                    <input
                      aria-label="New contact name"
                      className={cn(inputClass, "mt-2")}
                      placeholder="Name"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                    />
                  )}

                  <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_160px]">
                    <div>
                      <label className="mb-1.5 block text-xs text-silver">
                        Timeline entry <span className="capitalize">({result.interaction.kind})</span>
                      </label>
                      <Textarea aria-label="Summary" className="min-h-20" value={summary} onChange={(e) => setSummary(e.target.value)} />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs text-silver">Date{!result.interaction.date && " (not stated)"}</label>
                      <input type="date" aria-label="Date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
                    </div>
                  </div>

                  {items.length > 0 && (
                    <ul className="mt-4 space-y-2">
                      {items.map((it) => (
                        <li key={it.key}>
                          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5 text-sm hover:bg-white/[0.04]">
                            <input
                              type="checkbox"
                              className="mt-0.5 accent-cobalt"
                              checked={isOn(it)}
                              onChange={(e) => setAccepted({ ...accepted, [it.key]: e.target.checked })}
                            />
                            <span>
                              <span className="text-xs capitalize text-silver">{it.label}</span>
                              <span className="block">{it.value}</span>
                              {it.existing && (
                                <span className="mt-0.5 block text-xs text-amber-300">
                                  Would replace current value: “{it.existing}”
                                </span>
                              )}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}

                  {result.ambiguities.length > 0 && (
                    <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-sm">
                      <p className="mb-1 flex items-center gap-2 font-medium text-amber-200">
                        <AlertTriangle size={14} /> Worth double-checking
                      </p>
                      <ul className="list-disc space-y-0.5 pl-5 text-amber-100/80">
                        {result.ambiguities.map((a) => (
                          <li key={a}>{a}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="mt-5 flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => setResult(null)}>
                      Discard
                    </Button>
                    <Button variant="primary" onClick={save}>
                      <Check size={15} /> Approve & save
                    </Button>
                  </div>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div>
          <SectionTitle>Timeline</SectionTitle>
          {timeline.length === 0 ? (
            <Card>
              <EmptyState icon={<NotebookPen size={20} />} title="No memories yet" body="Your interactions will appear here, newest first." />
            </Card>
          ) : (
            <Card className="p-5">
              <ol className="relative space-y-5 border-l border-white/10 pl-6">
                {timeline.map((i) => {
                  const c = contactById(i.contactId);
                  return (
                    <li key={i.id} className="relative">
                      <span className="absolute -left-[31px] top-1">
                        <Avatar name={c?.name ?? "?"} size={14} />
                      </span>
                      <p className="text-xs text-silver">
                        <span className="text-platinum">{c?.name ?? "Unknown"}</span> · <span className="capitalize">{i.kind}</span> ·{" "}
                        {formatDate(i.date)}
                      </p>
                      <p className="mt-1 text-sm text-zinc-300">{i.summary}</p>
                    </li>
                  );
                })}
              </ol>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
