"use client";

import { ArrowRight, PenLine, Plus, Target, UserRound, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toPayload } from "@/lib/api";
import { draftAsk, findOpportunities, MAX_GOALS, opportunityKey, type Opportunity } from "@/lib/opportunities";
import { useNetwork } from "@/lib/store";
import type { NetworkPayload } from "@/lib/validation";
import { ContactProfile } from "./contact-profile";
import { MessageDraft } from "./message-draft";
import { Avatar, Badge, Button, Card, Sheet, inputClass } from "./ui";

/** Your goals, and for each one the people who might help, with the reasons from your records. */
export function Opportunities() {
  const store = useNetwork();
  const { data, nameOf } = store;
  const goals = data.profile.priorities;
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<{ id: string; note?: string } | null>(null);
  const [drafting, setDrafting] = useState<{ goal: string; o: Opportunity } | null>(null);
  const payload = useMemo(() => toPayload(data) as NetworkPayload, [data]);
  const results = useMemo(
    () => goals.map((g) => ({ goal: g, matches: findOpportunities(g, payload, data.dismissedOpportunities ?? []) })),
    [goals, payload, data.dismissedOpportunities],
  );

  const add = () => {
    const g = input.trim().replace(/\s+/g, " ");
    setError("");
    if (!g) return;
    if (g.length > 120) return setError("Keep a goal under 120 characters.");
    if (goals.some((x) => x.toLowerCase() === g.toLowerCase())) return setError("That goal is already saved.");
    if (goals.length >= MAX_GOALS) return setError(`You can save up to ${MAX_GOALS} goals. Remove one first.`);
    store.setGoals([...goals, g]);
    setInput("");
  };

  const draft = drafting ? draftAsk(drafting.o, drafting.goal, payload) : null;

  return (
    <section className="mb-10">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
        <Target size={18} className="text-violet" /> Your goals
      </h2>
      <p className="mb-4 max-w-2xl text-sm text-silver">
        Save what you&apos;re working toward. For each goal, the app lists people whose recorded job, skills, interests or your notes match it, closest on the
        map first when the evidence is similar. Same city alone never counts.
      </p>

      <form
        className="mb-5 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          aria-label="New goal"
          className={inputClass}
          placeholder="e.g. Find a summer role in tech policy"
          value={input}
          maxLength={160}
          onChange={(e) => setInput(e.target.value)}
        />
        <Button type="submit" variant="primary" disabled={!input.trim()}>
          <Plus size={15} /> Add goal
        </Button>
      </form>
      {error && (
        <p role="alert" className="-mt-3 mb-4 text-sm text-red-300">
          {error}
        </p>
      )}

      {goals.length === 0 ? (
        <Card className="p-5 text-sm text-silver">No goals saved yet. Add one above to see who in your circle might help.</Card>
      ) : (
        <div className="space-y-4">
          {results.map(({ goal, matches }) => (
            <Card key={goal} className="p-4 sm:p-5">
              <div className="mb-3 flex items-start justify-between gap-3">
                <p className="font-medium">{goal}</p>
                <button
                  type="button"
                  aria-label={`Remove goal: ${goal}`}
                  onClick={() => store.setGoals(goals.filter((g) => g !== goal))}
                  className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center text-silver hover:text-red-300"
                >
                  <X size={16} />
                </button>
              </div>
              {matches.length === 0 ? (
                <p className="text-sm text-silver">
                  Nobody in your records matches this goal yet. Adding jobs, skills and interests to people (or using more specific words here) helps.
                </p>
              ) : (
                <ul className="divide-y divide-white/5">
                  {matches.map((o) => (
                    <li key={o.contactId} className="py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={nameOf(o.contactId)} size={34} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{nameOf(o.contactId)}</p>
                          <p className="flex flex-wrap items-center gap-1 text-xs text-silver">
                            {o.degrees === 1 ? (
                              "You know them directly"
                            ) : o.degrees !== null ? (
                              <>
                                {o.degrees}° · via
                                {o.path.slice(1, -1).map((id, k) => (
                                  <span key={id} className="flex items-center gap-1">
                                    {k > 0 && <ArrowRight size={10} />}
                                    {nameOf(id)}
                                  </span>
                                ))}
                              </>
                            ) : (
                              "No recorded path to them"
                            )}
                          </p>
                        </div>
                        <Badge tone={o.degrees === 1 ? "green" : o.degrees !== null ? "violet" : "neutral"}>{o.degrees === null ? "no path" : `${o.degrees}°`}</Badge>
                      </div>
                      <ul className="mt-2 space-y-0.5 pl-[46px] text-xs text-zinc-300">
                        {o.reasons.map((r) => (
                          <li key={r.text}>
                            {r.noteId ? (
                              <button
                                type="button"
                                className="text-left underline decoration-white/20 underline-offset-2"
                                onClick={() => setProfile({ id: o.contactId, note: r.noteId })}
                              >
                                {r.text}
                              </button>
                            ) : (
                              r.text
                            )}
                          </li>
                        ))}
                      </ul>
                      <div className="mt-2 flex flex-wrap gap-2 pl-[46px]">
                        <Button size="sm" onClick={() => setProfile({ id: o.contactId })}>
                          <UserRound size={13} /> Open
                        </Button>
                        <Button size="sm" onClick={() => setDrafting({ goal, o })}>
                          <PenLine size={13} /> {o.degrees !== null && o.degrees >= 2 ? `Ask ${nameOf(o.path[1]).split(" ")[0]} for an intro` : "Draft a message"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`${nameOf(o.contactId)} isn't relevant to this goal`}
                          onClick={() => store.dismissOpportunity(opportunityKey(goal, o.contactId))}
                        >
                          Not relevant
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}

      <Sheet open={!!profile} onClose={() => setProfile(null)} title="Profile" wide>
        {profile && <ContactProfile key={profile.id + (profile.note ?? "")} id={profile.id} focusNoteId={profile.note} onDeleted={() => setProfile(null)} />}
      </Sheet>
      <Sheet open={!!drafting} onClose={() => setDrafting(null)} title={draft && draft.to !== drafting?.o.contactId ? "Ask for an introduction" : "Message draft"}>
        {draft && <MessageDraft key={draft.body} contactIds={[draft.to]} subject={draft.subject} body={draft.body} basedOn={draft.basedOn} />}
      </Sheet>
    </section>
  );
}
