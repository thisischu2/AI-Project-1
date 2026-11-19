"use client";

import { BellPlus, Briefcase, CalendarDays, Link2, MapPin, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatDate, todayISO } from "@/lib/api";
import { distancesFrom } from "@/lib/graph";
import { detectCommitments, searchNotes, summarizePerson, type Commitment } from "@/lib/memory";
import { useNetwork } from "@/lib/store";
import { INTERACTION_KINDS, ME, type InteractionKind } from "@/lib/types";
import { ContactForm } from "./contact-form";
import { Highlight, SearchBox } from "./note-search";
import { Avatar, Badge, Button, DemoBadge, Input, SectionTitle, Textarea, inputClass } from "./ui";

export function ContactProfile({ id, onDeleted, focusNoteId }: { id: string; onDeleted?: () => void; focusNoteId?: string }) {
  const store = useNetwork();
  const { data, contactById, nameOf } = store;
  const contact = contactById(id);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [linkTo, setLinkTo] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [note, setNote] = useState({ kind: "meeting" as InteractionKind, date: todayISO(), summary: "" });
  const [reminder, setReminder] = useState({ title: "", dueDate: "" });
  const [query, setQuery] = useState("");
  // Notes to highlight after tapping a summary line's source link.
  const [focus, setFocus] = useState<string[]>(focusNoteId ? [focusNoteId] : []);
  useEffect(() => {
    if (!focusNoteId) return;
    const t = setTimeout(() => document.getElementById(`note-${focusNoteId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 350);
    return () => clearTimeout(t);
  }, [focusNoteId]);
  // Promises found in the note just logged here, offered one by one.
  const [offered, setOffered] = useState<{ noteId: string; items: Commitment[] } | null>(null);

  if (!contact) return <p className="text-sm text-silver">This contact no longer exists.</p>;

  if (editing) {
    return (
      <ContactForm
        initial={contact}
        onCancel={() => setEditing(false)}
        onSubmit={(v) => {
          store.updateContact(id, v);
          setEditing(false);
        }}
      />
    );
  }

  const degrees = distancesFrom(data.connections, ME).get(id);
  const links = data.connections.filter((c) => c.sourceId === id || c.targetId === id);
  const interactions = data.interactions.filter((i) => i.contactId === id).sort((a, b) => b.date.localeCompare(a.date));
  const reminders = data.reminders.filter((r) => r.contactId === id);
  const summary = summarizePerson(contact, data.interactions, data.reminders, todayISO());
  const hits = query.trim().length >= 2 ? searchNotes(query, interactions, []) : null;
  const shown = hits ? hits.map((h) => ({ i: h.interaction, ranges: h.ranges })) : interactions.map((i) => ({ i, ranges: [] as [number, number][] }));
  const noteById = new Map(interactions.map((i) => [i.id, i]));
  const showNotes = (ids: string[]) => {
    setQuery("");
    setFocus(ids);
    requestAnimationFrame(() => document.getElementById(`note-${ids[0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };
  const linkable = [{ id: ME, name: "You" }, ...data.contacts]
    .filter((c) => c.id !== id)
    .filter((c) => !links.some((l) => l.sourceId === c.id || l.targetId === c.id));

  return (
    <div className="space-y-8">
      <div className="flex items-start gap-4">
        <Avatar name={contact.name} size={56} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl font-semibold">{contact.name}</h3>
            {contact.isDemo && <DemoBadge />}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-silver">
            {(contact.occupation || contact.organization) && (
              <span className="flex items-center gap-1.5">
                <Briefcase size={13} />
                {[contact.occupation, contact.organization].filter(Boolean).join(" · ")}
              </span>
            )}
            {contact.location && (
              <span className="flex items-center gap-1.5">
                <MapPin size={13} />
                {contact.location}
              </span>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {contact.categories.map((c) => (
              <Badge key={c} tone="cobalt" className="capitalize">
                {c}
              </Badge>
            ))}
            <Badge>{degrees === undefined ? "No recorded path to you" : `${degrees}° from you`}</Badge>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <Button size="sm" onClick={() => setEditing(true)}>
          <Pencil size={13} /> Edit
        </Button>
        <Link href={`/ask?q=${encodeURIComponent(`What should I know before reaching out to ${contact.name}?`)}`}>
          <Button size="sm">✦ Ask 6ix about {contact.name.split(" ")[0]}</Button>
        </Link>
        {confirmDelete ? (
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              store.deleteContact(id);
              onDeleted?.();
            }}
          >
            Confirm delete
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)} aria-label="Delete contact">
            <Trash2 size={13} />
          </Button>
        )}
      </div>

      {summary.length > 0 && (
        <div>
          <SectionTitle>At a glance</SectionTitle>
          <p className="-mt-1 mb-2 text-xs text-silver">Built from your own notes and follow-ups. Tap a source to see the notes behind a line.</p>
          <ul className="space-y-2 rounded-2xl border border-white/5 bg-white/[0.02] p-3 text-sm">
            {summary.map((l) => (
              <li key={l.label}>
                <span className="text-silver">{l.label}: </span>
                {l.text}
                {l.sources.length > 0 && (
                  <button
                    type="button"
                    className="ml-1.5 inline-flex min-h-8 items-center text-xs text-violet underline underline-offset-2"
                    onClick={() => showNotes(l.sources)}
                  >
                    {l.sources.length === 1 ? "source note" : `${l.sources.length} source notes`}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {([
        ["Interests", contact.interests],
        ["Goals", contact.goals],
        ["Skills", contact.skills],
        ["Tags", contact.tags],
      ] as const).some(([, v]) => v.length) && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {([
            ["Interests", contact.interests],
            ["Goals", contact.goals],
            ["Skills", contact.skills],
            ["Tags", contact.tags],
          ] as const)
            .filter(([, v]) => v.length)
            .map(([label, values]) => (
              <div key={label}>
                <p className="mb-1.5 text-xs text-silver">{label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {values.map((x) => (
                    <Badge key={x}>{x}</Badge>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}

      {(contact.metContext || contact.notes || contact.email || contact.phone) && (
        <div className="space-y-2 text-sm">
          {contact.metContext && (
            <p>
              <span className="text-silver">How you met: </span>
              {contact.metContext}
            </p>
          )}
          {contact.notes && <p className="whitespace-pre-wrap text-zinc-300">{contact.notes}</p>}
          {contact.email && <p className="text-silver">{contact.email}</p>}
          {contact.phone && <p className="text-silver">{contact.phone}</p>}
        </div>
      )}

      {contact.importantDates.length > 0 && (
        <div>
          <SectionTitle>Important dates</SectionTitle>
          <ul className="space-y-1.5 text-sm">
            {contact.importantDates.map((d) => (
              <li key={d.label + d.date} className="flex items-center gap-2">
                <CalendarDays size={13} className="text-silver" /> {d.label} · {formatDate(d.date)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <SectionTitle>Recorded connections</SectionTitle>
        {links.length === 0 && <p className="mb-3 text-sm text-silver">No connections recorded yet.</p>}
        <ul className="mb-3 space-y-1.5">
          {links.map((l) => {
            const other = l.sourceId === id ? l.targetId : l.sourceId;
            return (
              <li key={l.id} className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <Link2 size={13} className="text-violet" />
                  {nameOf(other)}
                  {l.label && <span className="text-silver">· {l.label}</span>}
                </span>
                <Button size="sm" variant="ghost" onClick={() => store.deleteConnection(l.id)} aria-label={`Remove connection to ${nameOf(other)}`}>
                  ×
                </Button>
              </li>
            );
          })}
        </ul>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (linkTo && store.addConnection(id, linkTo, linkLabel.trim() || undefined)) {
              setLinkTo("");
              setLinkLabel("");
            }
          }}
        >
          <select aria-label="Connect to" className={inputClass} value={linkTo} onChange={(e) => setLinkTo(e.target.value)}>
            <option value="">Record that {contact.name.split(" ")[0]} knows…</option>
            {linkable.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Input placeholder="How (optional)" value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} />
          <Button type="submit" disabled={!linkTo}>
            Add
          </Button>
        </form>
      </div>

      <div>
        <SectionTitle>Timeline</SectionTitle>
        <form
          className="mb-4 space-y-2 rounded-xl border border-white/5 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!note.summary.trim()) return;
            const noteId = store.addInteraction({ contactId: id, ...note, summary: note.summary.trim() });
            const items = detectCommitments(note.summary, note.date || todayISO(), contact.name);
            setOffered(items.length ? { noteId, items } : null);
            setNote({ ...note, summary: "" });
          }}
        >
          <div className="flex gap-2">
            <select
              aria-label="Interaction type"
              className={inputClass}
              value={note.kind}
              onChange={(e) => setNote({ ...note, kind: e.target.value as InteractionKind })}
            >
              {INTERACTION_KINDS.map((k) => (
                <option key={k} value={k} className="capitalize">
                  {k}
                </option>
              ))}
            </select>
            <Input type="date" aria-label="Date" value={note.date} onChange={(e) => setNote({ ...note, date: e.target.value })} />
          </div>
          <Textarea
            aria-label="What happened"
            className="min-h-16"
            placeholder="What did you talk about?"
            value={note.summary}
            onChange={(e) => setNote({ ...note, summary: e.target.value })}
          />
          <div className="flex justify-end">
            <Button size="sm" type="submit" disabled={!note.summary.trim()}>
              Log interaction
            </Button>
          </div>
        </form>
        {offered && (
          <div className="mb-4 rounded-2xl border border-violet/30 bg-violet/5 p-3">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <BellPlus size={15} className="text-violet" /> Promises spotted in that note
            </p>
            <p className="mb-2 text-xs text-silver">Found from your wording, so check them first.</p>
            <ul className="space-y-2">
              {offered.items.map((c) => (
                <li key={c.sentence + c.title} className="flex flex-col gap-2 rounded-xl bg-white/5 p-2 sm:flex-row sm:items-center sm:justify-between">
                  <span className="min-w-0 text-sm">
                    {c.title}
                    {c.dueDate && <span className="text-silver"> · by {formatDate(c.dueDate)}</span>}
                    <span className="block text-xs text-silver">&ldquo;{c.sentence}&rdquo;</span>
                  </span>
                  <Button
                    size="sm"
                    onClick={() => {
                      store.addReminder({ contactId: id, title: c.title, dueDate: c.dueDate, sourceInteractionId: offered.noteId });
                      const rest = offered.items.filter((x) => x !== c);
                      setOffered(rest.length ? { ...offered, items: rest } : null);
                    }}
                  >
                    Add follow-up
                  </Button>
                </li>
              ))}
            </ul>
            <Button size="sm" variant="ghost" className="mt-2" onClick={() => setOffered(null)}>
              No thanks
            </Button>
          </div>
        )}
        {interactions.length >= 3 && (
          <div className="mb-3">
            <SearchBox value={query} onChange={setQuery} label={`Search notes about ${contact.name}`} placeholder="Search these notes" />
          </div>
        )}
        {focus.length > 0 && !hits && (
          <p className="mb-3 flex items-center justify-between text-xs text-violet">
            Highlighted: the {focus.length === 1 ? "note" : `${focus.length} notes`} behind that line.
            <button type="button" className="min-h-8 px-2 text-silver underline" onClick={() => setFocus([])}>
              Clear
            </button>
          </p>
        )}
        {interactions.length === 0 ? (
          <p className="text-sm text-silver">No interactions logged yet.</p>
        ) : hits && hits.length === 0 ? (
          <p className="text-sm text-silver">No notes about {contact.name.split(" ")[0]} mention &ldquo;{query.trim()}&rdquo;.</p>
        ) : (
          <ol className="relative space-y-4 border-l border-white/10 pl-5">
            {shown.map(({ i, ranges }) => (
              <li
                key={i.id}
                id={`note-${i.id}`}
                className={`relative rounded-lg transition-colors ${focus.includes(i.id) && !hits ? "bg-violet/10 p-2 ring-1 ring-violet/40" : ""}`}
              >
                <span className="absolute -left-[25px] top-1.5 h-2 w-2 rounded-full bg-cobalt" />
                <p className="text-xs text-silver">
                  <span className="capitalize">{i.kind}</span> · {formatDate(i.date)}
                  <button className="ml-2 text-zinc-500 hover:text-red-300" onClick={() => store.deleteInteraction(i.id)}>
                    remove
                  </button>
                </p>
                <p className="mt-0.5 text-sm">
                  <Highlight text={i.summary} ranges={ranges} />
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div>
        <SectionTitle>Follow-ups</SectionTitle>
        <ul className="mb-3 space-y-1.5">
          {reminders.map((r) => (
            <li key={r.id} className="flex items-center gap-3 rounded-xl bg-white/[0.03] px-3 py-2 text-sm">
              <input type="checkbox" checked={r.done} onChange={() => store.toggleReminder(r.id)} aria-label={`Mark "${r.title}" done`} className="accent-cobalt" />
              <span className="min-w-0">
                <span className={r.done ? "text-zinc-500 line-through" : ""}>{r.title}</span>
                {r.sourceInteractionId && noteById.has(r.sourceInteractionId) && (
                  <button type="button" className="block text-left text-xs text-violet underline underline-offset-2" onClick={() => showNotes([r.sourceInteractionId!])}>
                    from your note on {formatDate(noteById.get(r.sourceInteractionId)!.date)}
                  </button>
                )}
              </span>
              {r.dueDate && <span className="ml-auto text-xs text-silver">{formatDate(r.dueDate)}</span>}
              <button className="text-zinc-500 hover:text-red-300" onClick={() => store.deleteReminder(r.id)} aria-label="Delete follow-up">
                ×
              </button>
            </li>
          ))}
        </ul>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!reminder.title.trim()) return;
            store.addReminder({ contactId: id, title: reminder.title.trim(), dueDate: reminder.dueDate || undefined });
            setReminder({ title: "", dueDate: "" });
          }}
        >
          <Input placeholder="Add a follow-up" value={reminder.title} onChange={(e) => setReminder({ ...reminder, title: e.target.value })} />
          <Input type="date" aria-label="Due date" value={reminder.dueDate} onChange={(e) => setReminder({ ...reminder, dueDate: e.target.value })} className="sm:w-44" />
          <Button type="submit" disabled={!reminder.title.trim()}>
            Add
          </Button>
        </form>
      </div>
    </div>
  );
}
