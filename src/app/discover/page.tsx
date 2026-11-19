"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Compass, Copy, PenLine, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Opportunities } from "@/components/opportunities";
import { Avatar, Badge, Button, Card, EmptyState, PageHeader, Sheet, Textarea } from "@/components/ui";
import { toPayload } from "@/lib/api";
import { draftIntroduction, suggestIntroductions, type Suggestion } from "@/lib/assistant";
import { useNetwork } from "@/lib/store";
import type { NetworkPayload } from "@/lib/validation";

export default function DiscoverPage() {
  const { data, nameOf } = useNetwork();
  // Worked out on the phone from recorded interests, goals and skills.
  const suggestions = useMemo(() => suggestIntroductions(toPayload(data) as NetworkPayload), [data]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [drafting, setDrafting] = useState<Suggestion | null>(null);

  const visible = suggestions.filter((s) => !dismissed.has(s.aId + s.bId));

  return (
    <>
      <PageHeader
        title="Discover"
        subtitle="Who might help with your goals, and introductions between people you know. Based only on what you've recorded."
      />
      <Opportunities />
      <h2 className="mb-1 text-lg font-semibold">Introductions between people you know</h2>
      <p className="mb-6 max-w-2xl text-xs text-silver">
        The app finds pairs who aren&apos;t connected yet and share recorded interests or have complementary goals and skills.
        Location alone never counts. These are possibilities, not certainties, and nothing is shared without you.
      </p>

      {visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Compass size={20} />}
            title="No suggestions right now"
            body="Add interests, goals, and skills to contacts to give Discover more to work with."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <AnimatePresence>
            {visible.map((s, i) => (
              <motion.div key={s.aId + s.bId} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.05 } }} exit={{ opacity: 0, scale: 0.97 }}>
                <Card className="flex h-full flex-col p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex -space-x-2">
                      <Avatar name={nameOf(s.aId)} size={34} />
                      <Avatar name={nameOf(s.bId)} size={34} />
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={s.confidence === "high" ? "green" : s.confidence === "medium" ? "cobalt" : "neutral"}>
                        {s.confidence} support
                      </Badge>
                      <Badge tone="violet">Possibility</Badge>
                    </div>
                  </div>
                  <p className="text-sm text-silver">
                    {nameOf(s.aId)} ↔ {nameOf(s.bId)}
                  </p>
                  <p className="mt-1 font-medium">{s.headline}</p>
                  <p className="mt-2 text-sm text-zinc-300">{s.rationale}</p>
                  <div className="mt-4 rounded-xl bg-white/[0.03] p-3">
                    <p className="mb-1.5 text-xs font-medium text-silver">Recorded evidence</p>
                    <ul className="space-y-1 text-xs text-zinc-300">
                      {s.evidence.map((e) => (
                        <li key={e.detail}>• {e.detail}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="mt-auto flex justify-end gap-2 pt-4">
                    <Button size="sm" variant="ghost" onClick={() => setDismissed(new Set(dismissed).add(s.aId + s.bId))}>
                      <X size={13} /> Dismiss
                    </Button>
                    <Button size="sm" onClick={() => setDrafting(s)}>
                      <PenLine size={13} /> Draft introduction
                    </Button>
                  </div>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <Sheet open={!!drafting} onClose={() => setDrafting(null)} title="Draft an introduction">
        {drafting && <DraftPanel s={drafting} />}
      </Sheet>
    </>
  );
}

function DraftPanel({ s }: { s: Suggestion }) {
  const { data, nameOf, contactById } = useNetwork();
  const [consent, setConsent] = useState(false);
  const [body, setBody] = useState("");
  const [shared, setShared] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const generate = () => {
    const payload = toPayload(data) as NetworkPayload;
    const a = payload.contacts.find((c) => c.id === s.aId);
    const b = payload.contacts.find((c) => c.id === s.bId);
    if (!a || !b || !contactById(s.aId) || !contactById(s.bId)) return;
    const d = draftIntroduction(a, b, s.evidence, data.profile.name);
    setBody(`Subject: ${d.subject}\n\n${d.body}`);
    setShared(d.sharedDetails);
    setCopied(false);
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-silver">
        6IX never sends messages. It fills in a template you can edit, copy, and send yourself to {nameOf(s.aId)} and {nameOf(s.bId)}.
      </p>
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm">
        <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-cobalt" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>
          I&apos;ll check with both people before sharing their details, and I approve drafting this introduction.
        </span>
      </label>
      <Button variant="primary" disabled={!consent} onClick={generate}>
        <PenLine size={15} /> Draft it
      </Button>
      {body && (
        <>
          <Textarea aria-label="Draft" className="min-h-64" value={body} onChange={(e) => setBody(e.target.value)} />
          {shared.length > 0 && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-sm">
              <p className="mb-1 font-medium text-amber-200">This draft shares:</p>
              <ul className="list-disc pl-5 text-amber-100/80">
                {shared.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </div>
          )}
          <Button
            onClick={async () => {
              await navigator.clipboard.writeText(body);
              setCopied(true);
            }}
          >
            <Copy size={14} /> {copied ? "Copied" : "Copy to clipboard"}
          </Button>
        </>
      )}
    </div>
  );
}
