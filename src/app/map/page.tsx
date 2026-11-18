"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Route, Share2, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ContactProfile } from "@/components/contact-profile";
import { CATEGORY_COLORS, NetworkGraph } from "@/components/network-graph";
import { Badge, Button, Card, EmptyState, PageHeader, Sheet, cn, inputClass } from "@/components/ui";
import { degreeLabel, shortestPath } from "@/lib/graph";
import { useNetwork } from "@/lib/store";
import { CATEGORIES, ME, type Category } from "@/lib/types";

export default function MapPage() {
  const store = useNetwork();
  const { data, nameOf } = store;
  const [from, setFrom] = useState<string>(ME);
  const [to, setTo] = useState<string>("");
  const [hidden, setHidden] = useState<Set<Category>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  const visibleContacts = useMemo(
    () => data.contacts.filter((c) => !c.categories.length || c.categories.some((cat) => !hidden.has(cat))),
    [data.contacts, hidden],
  );
  // Paths always use the FULL recorded graph; filters only change what's drawn.
  const result = useMemo(() => (from && to ? shortestPath(data.connections, from, to) : null), [data.connections, from, to]);
  const people = [{ id: ME, name: "You" }, ...[...data.contacts].sort((a, b) => a.name.localeCompare(b.name))];
  const pathHidden = result?.found && result.path.some((id) => id !== ME && !visibleContacts.some((c) => c.id === id));

  const toggle = (c: Category) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });

  if (data.contacts.length === 0) {
    return (
      <>
        <PageHeader title="The Map" />
        <Card>
          <EmptyState
            icon={<Share2 size={20} />}
            title="Nothing to map yet"
            body="Add contacts and record who knows whom. The map only draws connections you record."
            action={
              <Link href="/circle">
                <Button variant="primary">Go to My Circle</Button>
              </Link>
            }
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="The Map"
        subtitle={`${data.contacts.length + 1} people · ${data.connections.length} recorded connections`}
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <Card className="relative overflow-hidden">
          <NetworkGraph
            contacts={visibleContacts}
            connections={data.connections}
            userName="You"
            highlightPath={result?.found ? result.path : []}
            selectedId={selected}
            onSelect={(id) => {
              setSelected(id);
              if (id && id !== ME) setProfileOpen(false);
            }}
            height="min(62vh, 640px)"
          />
          <AnimatePresence>
            {selected && selected !== ME && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                className="absolute inset-x-4 bottom-4 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-charcoal/90 px-4 py-3 backdrop-blur"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{nameOf(selected)}</p>
                  <p className="truncate text-xs text-silver">
                    {store.contactById(selected)?.occupation ?? "No occupation recorded"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" onClick={() => setTo(selected)}>
                    <Route size={13} /> Path to here
                  </Button>
                  <Button size="sm" variant="primary" onClick={() => setProfileOpen(true)}>
                    Profile
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelected(null)} aria-label="Clear selection">
                    <X size={14} />
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>

        <div className="order-first space-y-5 lg:order-none">
          <Card className="p-5">
            <p className="mb-4 flex items-center gap-2 font-medium">
              <Route size={16} className="text-violet" /> Find the shortest known path
            </p>
            <div className="space-y-2">
              <select aria-label="From" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)}>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <select aria-label="To" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)}>
                <option value="">Choose a person…</option>
                {people
                  .filter((p) => p.id !== from)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </div>

            <AnimatePresence mode="wait">
              {result && (
                <motion.div
                  key={`${from}-${to}-${result.found}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-5"
                >
                  {result.found ? (
                    <>
                      <p className="text-gradient text-2xl font-semibold">{degreeLabel(result.degrees)}</p>
                      <ol className="mt-3 flex flex-wrap items-center gap-1.5 text-sm">
                        {result.path.map((id, i) => (
                          <li key={id} className="flex items-center gap-1.5">
                            <span className="rounded-lg bg-violet/15 px-2 py-1 text-violet-200">{nameOf(id)}</span>
                            {i < result.path.length - 1 && <ArrowRight size={12} className="text-zinc-500" />}
                          </li>
                        ))}
                      </ol>
                      <p className="mt-3 text-xs text-silver">
                        Every step is a connection you recorded. Computed with breadth-first search, not AI.
                      </p>
                      {pathHidden && <p className="mt-2 text-xs text-amber-300">Some people on this path are hidden by your filters.</p>}
                      <Link
                        href={`/ask?q=${encodeURIComponent(`How is ${from === ME ? "me" : nameOf(from)} connected to ${nameOf(to)}?`)}`}
                        className="mt-4 inline-block"
                      >
                        <Button size="sm">✦ Have Ask 6ix explain it</Button>
                      </Link>
                    </>
                  ) : (
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm">
                      <p className="font-medium">No recorded path</p>
                      <p className="mt-1 text-silver">
                        There&apos;s no chain of recorded connections between {nameOf(from)} and {nameOf(to)}. If you know how
                        they&apos;re linked, record that connection on a profile.
                      </p>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </Card>

          <Card className="p-5">
            <p className="mb-3 text-sm font-medium">Filter by category</p>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => toggle(c)}
                  aria-pressed={!hidden.has(c)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs capitalize transition",
                    hidden.has(c) ? "border-white/5 text-zinc-600" : "border-white/10 text-zinc-300",
                  )}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: hidden.has(c) ? "#3f3f46" : CATEGORY_COLORS[c] }} />
                  {c}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-silver">Scroll to zoom, drag to pan, tap a person to select them.</p>
          </Card>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge tone="violet">Path</Badge>
            <Badge>Recorded connection</Badge>
          </div>
        </div>
      </div>

      <Sheet open={profileOpen && !!selected} onClose={() => setProfileOpen(false)} title="Profile" wide>
        {selected && (
          <ContactProfile
            id={selected}
            onDeleted={() => {
              setProfileOpen(false);
              setSelected(null);
            }}
          />
        )}
      </Sheet>
    </>
  );
}
