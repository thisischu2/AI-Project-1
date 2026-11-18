"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Compass, Copy, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { AIBadge, Avatar, Badge, Button, Card, EmptyState, PageHeader, Sheet, Spinner, Textarea } from "@/components/ui";
import { postJSON, toPayload } from "@/lib/api";
import { useNetwork } from "@/lib/store";

interface Suggestion {
  aId: string;
  bId: string;
  headline: string;
  rationale: string;
  confidence: "low" | "medium" | "high";
  evidence: { kind: string; detail: string }[];
}

interface Draft {
  subject: string;
  body: string;
  sharedDetails: string[];
}

export default function DiscoverPage() {
  const { data, nameOf } = useNetwork();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [drafting, setDrafting] = useState<Suggestion | null>(null);

  const run = async () => {
    setLoading(true);
    setError("");
    try {
      const r = await postJSON<{ suggestions: Suggestion[] }>("/api/ai/discover", { network: toPayload(data) });
      setSuggestions(r.suggestions);
      setDismissed(new Set());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const visible = (suggestions ?? []).filter((s) => !dismissed.has(s.aId + s.bId));

  return (
    <>
      <PageHeader
        title="Discover"
        subtitle="Possible introductions between people you know, based only on what you've recorded."
        action={
          <Button variant="primary" onClick={run} disabled={loading || data.contacts.length < 2}>
            {loading ? <Spinner /> : <Sparkles size={15} />} {suggestions ? "Refresh" : "Find possibilities"}
          </Button>
        }
      />
      <p className="-mt-4 mb-6 max-w-2xl text-xs text-silver">
        The app finds pairs who aren&apos;t connected yet and share recorded interests or have complementary goals and skills.
        Claude explains each one. These are possibilities, not certainties, and nothing is shared without you.
      </p>
      {error && <p className="mb-4 text-sm text-red-300">{error}</p>}

      {!suggestions ? (
        <Card>
          <EmptyState
            icon={<Compass size={20} />}
            title="Discover who might help whom"
            body="Run a scan of your network. Location alone never counts as a reason to introduce people."
          />
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Compass size={20} />}
            title="No suggestions right now"
            body="Add interests, goals, and skills to contacts to give Discover more to work with."
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
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
                      <AIBadge>Possibility</AIBadge>
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
                      Draft introduction
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
  const { data, nameOf } = useNetwork();
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [body, setBody] = useState("");
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    setLoading(true);
    setError("");
    try {
      const r = await postJSON<Draft>("/api/ai/draft-intro", {
        aId: s.aId,
        bId: s.bId,
        reason: s.rationale,
        consentConfirmed: true,
        network: toPayload(data),
      });
      setDraft(r);
      setBody(`Subject: ${r.subject}\n\n${r.body}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-silver">
        6IX never sends messages. Claude drafts a note you can edit, copy, and send yourself to {nameOf(s.aId)} and {nameOf(s.bId)}.
      </p>
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm">
        <input type="checkbox" className="mt-0.5 accent-cobalt" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>
          I&apos;ll check with both people before sharing their details, and I approve drafting this introduction.
        </span>
      </label>
      <Button variant="primary" disabled={!consent || loading} onClick={generate}>
        {loading ? <Spinner /> : <Sparkles size={15} />} Draft it
      </Button>
      {error && <p className="text-sm text-red-300">{error}</p>}
      {draft && (
        <>
          <Textarea aria-label="Draft" className="min-h-64" value={body} onChange={(e) => setBody(e.target.value)} />
          {draft.sharedDetails.length > 0 && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-sm">
              <p className="mb-1 font-medium text-amber-200">This draft shares:</p>
              <ul className="list-disc pl-5 text-amber-100/80">
                {draft.sharedDetails.map((d) => (
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
