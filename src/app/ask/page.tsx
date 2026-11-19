"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ArrowUp, BellPlus, Check, FileText, Info, PenLine, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ContactProfile } from "@/components/contact-profile";
import { MessageDraft } from "@/components/message-draft";
import { LogoMark } from "@/components/logo";
import { Avatar, Badge, Button, Card, PageHeader, Sheet, cn, inputClass } from "@/components/ui";
import { formatDate, toPayload, todayISO } from "@/lib/api";
import { askWithActions, type ActionAnswer, type AskAction } from "@/lib/actions";
import { degreeLabel } from "@/lib/graph";
import { useNetwork } from "@/lib/store";

import type { NetworkPayload } from "@/lib/validation";

type Turn = { q: string; a: ActionAnswer };
type DraftAction = Extract<AskAction, { type: "draft" }>;

const EXAMPLES = [
  "Who do I know in New York?",
  "What did I last discuss with Marcus?",
  "How am I connected to James?",
  "Who might benefit from an introduction?",
  "Draft a message to Priya",
  "Remind me to call Marcus on Friday",
];

export default function AskPage() {
  const { data, nameOf, contactById } = useNetwork();
  const [profile, setProfile] = useState<{ id: string; note?: string } | null>(null);
  const [drafting, setDrafting] = useState<DraftAction | null>(null);
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const bottom = useRef<HTMLDivElement>(null);
  const autoAsked = useRef(false);

  // Answers are computed on the phone from saved records. No AI, no network.
  const ask = (question: string) => {
    const q = question.trim();
    if (!q) return;
    setInput("");
    setTurns((t) => [...t, { q, a: askWithActions(q, toPayload(data) as NetworkPayload, todayISO()) }]);
  };

  // Support links like /ask?q=... from other pages.
  useEffect(() => {
    if (autoAsked.current) return;
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) {
      autoAsked.current = true;
      window.history.replaceState(null, "", "/ask");
      queueMicrotask(() => ask(q));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  return (
    <>
      <PageHeader title="Ask 6ix" subtitle="Ask about your network, or ask for a draft or a reminder. Answers come only from what you've recorded, worked out on your phone. Nothing is saved or sent without your tap." />

      <div className="mx-auto max-w-3xl">
        {turns.length === 0 && (
          <div className="mb-8 flex flex-col items-center text-center">
            <LogoMark size={48} />
            <p className="mt-4 text-lg font-medium">What would you like to know?</p>
            <div className="mt-6 grid w-full gap-2 sm:grid-cols-2">
              {EXAMPLES.map((e) => (
                <button
                  key={e}
                  onClick={() => ask(e)}
                  className="surface rounded-xl px-4 py-3.5 text-left text-sm text-zinc-300 transition hover:border-white/15 hover:text-platinum"
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-6">
          <AnimatePresence initial={false}>
            {turns.map((t, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                <div className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-br-md bg-cobalt/20 px-4 py-2.5 text-sm text-blue-50">{t.q}</p>
                </div>
                {(
                  <Card className="p-5">
                    <div className="mb-3 flex items-center gap-2">
                      <LogoMark size={18} />
                      <span className="text-sm font-medium">Ask 6ix</span>
                      <Badge>From your records</Badge>
                    </div>
                    {t.a.paths.map((p, j) => (
                      <div key={j} className="mb-4 rounded-xl border border-violet/25 bg-violet/5 p-3">
                        <p className="mb-2 text-xs font-medium text-violet-300">
                          Verified by the map · {p.found ? degreeLabel(p.degrees!) : "No recorded path"}
                        </p>
                        {p.found && (
                          <ol className="flex flex-wrap items-center gap-1.5 text-sm">
                            {p.names.map((n, k) => (
                              <li key={k} className="flex items-center gap-1.5">
                                <span className="rounded-lg bg-violet/15 px-2 py-0.5">{n}</span>
                                {k < p.names.length - 1 && <ArrowRight size={12} className="text-zinc-500" />}
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>
                    ))}
                    <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-200">{t.a.answer}</p>
                    {t.a.referencedContactIds.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {t.a.referencedContactIds.map((id) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setProfile({ id })}
                            aria-label={`Open ${nameOf(id)}'s profile`}
                            className="flex min-h-9 items-center gap-1.5 rounded-full bg-white/[0.06] py-1 pl-1 pr-3 text-xs transition hover:bg-white/10"
                          >
                            <Avatar name={nameOf(id)} size={22} /> {nameOf(id)}
                          </button>
                        ))}
                      </div>
                    )}
                    {(t.a.noteIds ?? []).length > 0 && (
                      <div className="mt-4">
                        <p className="mb-1.5 text-xs text-silver">Sources</p>
                        <ul className="space-y-1.5">
                          {t.a.noteIds!.map((nid) => {
                            const n = data.interactions.find((x) => x.id === nid);
                            if (!n) return null;
                            return (
                              <li key={nid}>
                                <button
                                  type="button"
                                  onClick={() => setProfile({ id: n.contactId, note: nid })}
                                  className="flex min-h-11 w-full items-start gap-2 rounded-xl bg-white/[0.03] px-3 py-2 text-left text-xs transition hover:bg-white/[0.06]"
                                >
                                  <FileText size={13} className="mt-0.5 shrink-0 text-violet" />
                                  <span className="min-w-0">
                                    <span className="text-platinum">
                                      Your note on {formatDate(n.date)} · {nameOf(n.contactId)}
                                    </span>
                                    <span className="block truncate text-silver">{n.summary}</span>
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                    {t.a.actions.length > 0 && (
                      <div className="mt-4 space-y-3 border-t border-white/5 pt-4">
                        <div className="flex flex-wrap gap-2">
                          {t.a.actions.map((act, k) =>
                            act.type === "open" ? (
                              <Button key={k} size="sm" onClick={() => setProfile({ id: act.contactId })}>
                                <UserRound size={13} /> Open {nameOf(act.contactId).split(" ")[0]}
                              </Button>
                            ) : act.type === "draft" ? (
                              <Button key={k} size="sm" onClick={() => setDrafting(act)}>
                                <PenLine size={13} /> {act.contactIds.length > 1 ? "See the introduction draft" : "Draft a message"}
                              </Button>
                            ) : null,
                          )}
                        </div>
                        {t.a.actions.map((act, k) =>
                          act.type === "reminder" ? <ReminderCard
                              key={k}
                              action={act}
                              name={act.contactId ? contactById(act.contactId)?.name : undefined}
                              collapsed={t.a.actions.length > 1}
                            /> : null,
                        )}
                      </div>
                    )}
                    {t.a.gaps.length > 0 && (
                      <div className="mt-4 flex gap-2 rounded-xl bg-white/[0.03] p-3 text-xs text-silver">
                        <Info size={14} className="mt-0.5 shrink-0" />
                        <span>Not in your records: {t.a.gaps.join("; ")}</span>
                      </div>
                    )}
                  </Card>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          <div ref={bottom} />
        </div>

        <form
          className="sticky bottom-24 mt-8 lg:bottom-6"
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
        >
          <div className="surface flex items-center gap-2 rounded-2xl p-2 pl-4 backdrop-blur-xl">
            <input
              aria-label="Ask a question"
              enterKeyHint="send"
              className="min-w-0 flex-1 bg-transparent text-base placeholder:text-zinc-500 focus:outline-none"
              placeholder="Ask about anyone in your network…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <Button type="submit" variant="primary" size="sm" disabled={!input.trim()} aria-label="Send">
              <ArrowUp size={15} />
            </Button>
          </div>
        </form>
      </div>

      <Sheet open={!!profile} onClose={() => setProfile(null)} title="Profile" wide>
        {profile && <ContactProfile key={profile.id + (profile.note ?? "")} id={profile.id} focusNoteId={profile.note} onDeleted={() => setProfile(null)} />}
      </Sheet>
      <Sheet open={!!drafting} onClose={() => setDrafting(null)} title={drafting && drafting.contactIds.length > 1 ? "Introduction draft" : "Message draft"}>
        {drafting && (
          <MessageDraft
            key={drafting.draft.body}
            contactIds={drafting.contactIds}
            subject={drafting.draft.subject}
            body={drafting.draft.body}
            basedOn={drafting.draft.basedOn}
          />
        )}
      </Sheet>
    </>
  );
}

/** A follow-up the person can edit, then save with one tap. Nothing is saved before that tap. */
function ReminderCard({ action, name, collapsed }: { action: Extract<AskAction, { type: "reminder" }>; name?: string; collapsed?: boolean }) {
  const { addReminder } = useNetwork();
  const [open, setOpen] = useState(!collapsed);
  const [title, setTitle] = useState(action.title);
  const [due, setDue] = useState(action.dueDate ?? "");
  const [saved, setSaved] = useState(false);
  if (saved) {
    return (
      <p role="status" className="flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
        <Check size={15} /> Saved{name ? ` to ${name}'s follow-ups` : " as a follow-up"}
        {due ? `, due ${formatDate(due)}` : ""}.
      </p>
    );
  }
  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <BellPlus size={13} /> Add a follow-up
      </Button>
    );
  }
  return (
    <div className="space-y-2 rounded-xl border border-violet/30 bg-violet/5 p-3">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <BellPlus size={14} className="text-violet" /> {name ? `Follow-up for ${name}` : "Follow-up"}
      </p>
      <input aria-label="Follow-up" className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <input type="date" aria-label="Due date (optional)" className={cn(inputClass, "sm:w-48")} value={due} onChange={(e) => setDue(e.target.value)} />
        <Button
          variant="primary"
          disabled={!title.trim()}
          onClick={() => {
            addReminder({ contactId: action.contactId, title: title.trim(), dueDate: due || undefined });
            setSaved(true);
          }}
        >
          <Check size={14} /> Save follow-up
        </Button>
      </div>
    </div>
  );
}
