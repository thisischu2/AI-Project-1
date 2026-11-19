"use client";

import { BellPlus, Check, NotebookPen, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { NoteHits, SearchBox } from "@/components/note-search";
import { Avatar, Button, Card, EmptyState, Label, PageHeader, SectionTitle, Textarea, cn, inputClass } from "@/components/ui";
import { formatDate, todayISO } from "@/lib/api";
import { detectCommitments, searchNotes } from "@/lib/memory";
import { findMentioned } from "@/lib/retrieval";
import { useNetwork } from "@/lib/store";
import { INTERACTION_KINDS, type InteractionKind } from "@/lib/types";
import type { PayloadContact } from "@/lib/validation";

const KIND_LABEL: Record<InteractionKind, string> = {
  meeting: "Met in person",
  call: "Call",
  message: "Message",
  event: "Event",
  other: "Other",
};

export default function MemoryPage() {
  const store = useNetwork();
  const { data, contactById } = store;
  const [note, setNote] = useState("");
  const [who, setWho] = useState(""); // contact id, "new", or "" (not chosen yet)
  const [newName, setNewName] = useState("");
  const [kind, setKind] = useState<InteractionKind>("meeting");
  const [date, setDate] = useState(todayISO());
  const [followUp, setFollowUp] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [query, setQuery] = useState("");
  // Spotted promises the person ticked, keyed by sentence, with any date they changed.
  const [picked, setPicked] = useState<Record<string, { on: boolean; date?: string }>>({});

  // Plain-code helper: if the note names someone you've saved, offer them.
  const detected = useMemo(
    () => (who ? undefined : findMentioned(note, data.contacts as unknown as PayloadContact[])[0]),
    [note, who, data.contacts],
  );

  const chosenId = who || detected?.id || "";
  const personName = chosenId === "new" ? newName : contactById(chosenId)?.name;
  const spotted = useMemo(() => detectCommitments(note, date || todayISO(), personName || undefined), [note, date, personName]);
  const hits = useMemo(() => searchNotes(query, data.interactions, data.contacts), [query, data.interactions, data.contacts]);

  const reset = () => {
    setPicked({});
    setNote("");
    setWho("");
    setNewName("");
    setKind("meeting");
    setDate(todayISO());
    setFollowUp("");
    setFollowUpDate("");
  };

  const save = () => {
    setError("");
    setSaved("");
    const chosen = chosenId;
    if (!note.trim()) return setError("Write a line about what happened.");
    if (!chosen) return setError("Choose who this is about.");
    let id = chosen;
    if (chosen === "new") {
      if (!newName.trim()) return setError("Give the new person a name.");
      id = store.addContact({ name: newName.trim(), categories: [], tags: [], interests: [], goals: [], skills: [], importantDates: [] }).id;
    }
    const noteId = store.addInteraction({ contactId: id, kind, date, summary: note.trim() });
    let added = 0;
    for (const c of spotted) {
      const p = picked[c.sentence + c.title];
      if (!p?.on) continue;
      store.addReminder({ contactId: id, title: c.title, dueDate: (p.date ?? c.dueDate) || undefined, sourceInteractionId: noteId });
      added++;
    }
    if (followUp.trim()) {
      store.addReminder({ contactId: id, title: followUp.trim(), dueDate: followUpDate || undefined, sourceInteractionId: noteId });
      added++;
    }
    const name = chosen === "new" ? newName.trim() : (contactById(id)?.name ?? "");
    setSaved(added ? `${name}'s timeline, with ${added} ${added === 1 ? "follow-up" : "follow-ups"}` : `${name}'s timeline`);
    reset();
  };

  const timeline = [...data.interactions].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

  return (
    <>
      <PageHeader title="Memory" subtitle="Jot down a conversation so you remember it. It's saved on this phone." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-5">
          <Card className="space-y-4 p-5">
            <p className="font-medium">New memory</p>
            <div>
              <Label htmlFor="note">What happened?</Label>
              <Textarea
                id="note"
                className="min-h-28"
                placeholder="e.g. Coffee with Priya. She's applying to tech policy internships."
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="who">Who was it with?</Label>
              <select id="who" className={inputClass} value={who || detected?.id || ""} onChange={(e) => setWho(e.target.value)}>
                <option value="" disabled>
                  Choose a person
                </option>
                {data.contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option value="new">+ Someone new</option>
              </select>
              {detected && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-silver">
                  <Sparkles size={12} className="text-violet" /> Picked {detected.name} because your note mentions them. Change it if that&apos;s wrong.
                </p>
              )}
              {who === "new" && (
                <input
                  aria-label="New person's name"
                  className={cn(inputClass, "mt-2")}
                  placeholder="Their name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="kind">How</Label>
                <select id="kind" className={inputClass} value={kind} onChange={(e) => setKind(e.target.value as InteractionKind)}>
                  {INTERACTION_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABEL[k]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="date">When</Label>
                <input id="date" type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>

            {spotted.length > 0 && (
              <div className="rounded-2xl border border-violet/30 bg-violet/5 p-3">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <BellPlus size={15} className="text-violet" /> Promises spotted in your note
                </p>
                <p className="mb-2 text-xs text-silver">Found from your wording, so check them. Tick any you want saved as a follow-up.</p>
                <ul className="space-y-2">
                  {spotted.map((c) => {
                    const key = c.sentence + c.title;
                    const p = picked[key];
                    return (
                      <li key={key} className="rounded-xl bg-white/5 p-2">
                        <label className="flex min-h-11 cursor-pointer items-start gap-3">
                          <input
                            type="checkbox"
                            className="mt-1 h-5 w-5 shrink-0 accent-violet-500"
                            checked={!!p?.on}
                            onChange={(e) => setPicked({ ...picked, [key]: { ...p, on: e.target.checked } })}
                          />
                          <span className="min-w-0">
                            <span className="block text-sm">{c.title}</span>
                            <span className="block text-xs text-silver">
                              {c.owner === "them" ? "They said they would" : "You said you would"}: &ldquo;{c.sentence}&rdquo;
                            </span>
                          </span>
                        </label>
                        {p?.on && (
                          <input
                            type="date"
                            aria-label={`Due date for ${c.title}`}
                            className={cn(inputClass, "mt-2")}
                            value={p.date ?? c.dueDate ?? ""}
                            onChange={(e) => setPicked({ ...picked, [key]: { ...p, date: e.target.value } })}
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <div>
              <Label htmlFor="follow">{spotted.length ? "Anything else to follow up on? (optional)" : "Anything to follow up on? (optional)"}</Label>
              <input
                id="follow"
                className={inputClass}
                placeholder="e.g. Send her the internship list"
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
              />
              {followUp.trim() && (
                <input
                  type="date"
                  aria-label="Follow-up date"
                  className={cn(inputClass, "mt-2")}
                  value={followUpDate}
                  onChange={(e) => setFollowUpDate(e.target.value)}
                />
              )}
            </div>

            {error && <p className="text-sm text-red-300">{error}</p>}
            {saved && (
              <p className="flex items-center gap-2 text-sm text-emerald-300">
                <Check size={15} /> Saved to {saved}.
              </p>
            )}
            <Button variant="primary" className="w-full" onClick={save}>
              <Check size={15} /> Save memory
            </Button>
          </Card>
        </div>

        <div>
          <SectionTitle>Timeline</SectionTitle>
          {timeline.length > 0 && (
            <div className="mb-3">
              <SearchBox value={query} onChange={setQuery} label="Search your notes" placeholder="Search notes, e.g. clerkship or Priya" />
            </div>
          )}
          {query.trim().length >= 2 ? (
            <Card className="p-5">
              <NoteHits hits={hits} query={query} />
            </Card>
          ) : timeline.length === 0 ? (
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
