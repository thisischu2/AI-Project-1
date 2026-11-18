"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ArrowUp, Info } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LogoMark } from "@/components/logo";
import { Avatar, Badge, Button, Card, PageHeader } from "@/components/ui";
import { toPayload } from "@/lib/api";
import { answerQuestion, type Answer } from "@/lib/assistant";
import { degreeLabel } from "@/lib/graph";
import { useNetwork } from "@/lib/store";

import type { NetworkPayload } from "@/lib/validation";

type Turn = { q: string; a: Answer };

const EXAMPLES = [
  "Who do I know in New York?",
  "What did I last discuss with Marcus?",
  "How am I connected to James?",
  "Who might benefit from an introduction?",
];

export default function AskPage() {
  const { data, nameOf } = useNetwork();
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const bottom = useRef<HTMLDivElement>(null);
  const autoAsked = useRef(false);

  // Answers are computed on the phone from saved records. No AI, no network.
  const ask = (question: string) => {
    const q = question.trim();
    if (!q) return;
    setInput("");
    setTurns((t) => [...t, { q, a: answerQuestion(q, toPayload(data) as NetworkPayload) }]);
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
      <PageHeader title="Ask 6ix" subtitle="Ask about your own network. Answers come only from what you've recorded, worked out on your phone." />

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
                          <span key={id} className="flex items-center gap-1.5 rounded-full bg-white/[0.04] py-1 pl-1 pr-3 text-xs">
                            <Avatar name={nameOf(id)} size={20} /> {nameOf(id)}
                          </span>
                        ))}
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
    </>
  );
}
