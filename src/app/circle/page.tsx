"use client";

import { motion } from "framer-motion";
import { Copy, FileUp, Plus, Search, Users } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { blankContact, ContactForm } from "@/components/contact-form";
import { ContactProfile } from "@/components/contact-profile";
import { Avatar, Badge, Button, Card, DemoBadge, EmptyState, Input, PageHeader, Sheet, cn } from "@/components/ui";
import { findDuplicatePairs, type DuplicatePair } from "@/lib/duplicates";
import { distancesFrom } from "@/lib/graph";
import { useNetwork } from "@/lib/store";
import { CATEGORIES, ME, type Category } from "@/lib/types";

export default function CirclePage() {
  const store = useNetwork();
  const { data } = store;
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category | "all">("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const duplicatePairs = useMemo(() => findDuplicatePairs(data.contacts, data.dismissedDuplicates), [data.contacts, data.dismissedDuplicates]);

  const distances = useMemo(() => distancesFrom(data.connections, ME), [data.connections]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.contacts
      .filter((c) => category === "all" || c.categories.includes(category))
      .filter(
        (c) =>
          !q ||
          [c.name, c.location, c.occupation, c.organization, ...c.tags, ...c.interests, ...c.skills]
            .filter(Boolean)
            .some((x) => x!.toLowerCase().includes(q)),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data.contacts, query, category]);

  return (
    <>
      <PageHeader
        title="My Circle"
        subtitle={`${data.contacts.length} ${data.contacts.length === 1 ? "person" : "people"} in your network`}
        action={
          <div className="flex gap-2">
            <Link href="/import">
              <Button>
                <FileUp size={15} /> Import
              </Button>
            </Link>
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus size={16} /> Add contact
            </Button>
          </div>
        }
      />

      {duplicatePairs.length > 0 && (
        <button
          onClick={() => setReviewing(true)}
          className="mb-5 flex w-full items-center gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-left text-sm text-amber-100/90 transition hover:bg-amber-500/10"
        >
          <Copy size={16} className="shrink-0" />
          <span className="flex-1">
            {duplicatePairs.length === 1 ? "1 possible duplicate" : `${duplicatePairs.length} possible duplicates`} in your circle.
          </span>
          <span className="font-medium underline underline-offset-2">Review</span>
        </button>
      )}

      <div className="mb-6 flex flex-col gap-3">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <Input
            aria-label="Search contacts"
            className="pl-10"
            placeholder="Search by name, city, company, interest…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
          {(["all", ...CATEGORIES] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              className={cn(
                "rounded-full border px-3 py-1 text-xs capitalize transition",
                category === c ? "border-cobalt/60 bg-cobalt/15 text-blue-200" : "border-white/10 text-silver hover:border-white/20",
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {data.contacts.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users size={20} />}
            title="Your circle is empty"
            body="Add the people you know. You can record how they're connected afterwards."
            action={
              <div className="flex gap-2">
                <Button variant="primary" onClick={() => setCreating(true)}>
                  Add your first contact
                </Button>
                <Button onClick={() => store.loadDemo(data.profile.name)}>Load demo network</Button>
              </div>
            }
          />
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState icon={<Search size={20} />} title="No matches" body="Try a different search or category." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c, i) => {
            const d = distances.get(c.id);
            return (
              <motion.button
                key={c.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.02, 0.3) }}
                onClick={() => setSelected(c.id)}
                className="surface group rounded-2xl p-4 text-left transition hover:border-white/15 hover:bg-white/[0.02]"
              >
                <div className="flex items-start gap-3">
                  <Avatar name={c.name} size={42} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-medium">{c.name}</p>
                      {c.isDemo && <DemoBadge />}
                    </div>
                    <p className="truncate text-sm text-silver">
                      {[c.occupation, c.organization].filter(Boolean).join(" · ") || "No occupation recorded"}
                    </p>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {c.categories.slice(0, 2).map((cat) => (
                        <Badge key={cat} tone="cobalt" className="capitalize">
                          {cat}
                        </Badge>
                      ))}
                      {c.location && <Badge>{c.location}</Badge>}
                      <Badge tone={d === undefined ? "neutral" : "violet"}>{d === undefined ? "no path" : `${d}°`}</Badge>
                    </div>
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>
      )}

      <Sheet open={!!selected} onClose={() => setSelected(null)} title="Profile" wide>
        {selected && <ContactProfile id={selected} onDeleted={() => setSelected(null)} />}
      </Sheet>
      <Sheet open={creating} onClose={() => setCreating(false)} title="New contact">
        <ContactForm
          initial={blankContact()}
          existing={data.contacts}
          onOpenExisting={(id) => {
            setCreating(false);
            setSelected(id);
          }}
          onCancel={() => setCreating(false)}
          onSubmit={(v) => {
            const c = store.addContact(v);
            setCreating(false);
            setSelected(c.id);
          }}
        />
      </Sheet>
      <Sheet open={reviewing} onClose={() => setReviewing(false)} title="Possible duplicates" wide>
        <DuplicateReview pairs={duplicatePairs} onDone={() => setReviewing(false)} />
      </Sheet>
    </>
  );
}

function DuplicateReview({ pairs, onDone }: { pairs: DuplicatePair[]; onDone: () => void }) {
  const store = useNetwork();
  const [message, setMessage] = useState("");
  const counts = (id: string) => ({
    notes: store.data.interactions.filter((i) => i.contactId === id).length,
    links: store.data.connections.filter((e) => e.sourceId === id || e.targetId === id).length,
  });

  if (pairs.length === 0) {
    return (
      <div className="space-y-4">
        {message && <p className="text-sm text-emerald-300">{message}</p>}
        <EmptyState icon={<Users size={20} />} title="No possible duplicates" body="Everyone in your circle looks like a different person." />
        <Button onClick={onDone}>Close</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-silver">
        Matched by plain rules (same email, phone or name, or a common nickname). Merging keeps one record, fills in its blanks from the other, and moves notes,
        follow-ups and connections over. You decide each one.
      </p>
      {message && (
        <p role="status" className="text-sm text-emerald-300">
          {message}
        </p>
      )}
      {pairs.map(({ a, b, confidence, reasons }) => (
        <Card key={a.id + b.id} className="space-y-3 p-4">
          <Badge tone={confidence === "high" ? "amber" : "neutral"}>{confidence === "high" ? "Very likely the same person" : "Possibly the same person"}</Badge>
          <p className="text-xs text-silver">{reasons.join(" · ")}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {[a, b].map((c) => {
              const n = counts(c.id);
              return (
                <div key={c.id} className="rounded-xl bg-white/[0.03] p-3 text-sm">
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-silver">{[c.occupation, c.organization, c.email, c.phone].filter(Boolean).join(" · ") || "No details"}</p>
                  <p className="mt-1 text-xs text-silver">
                    {n.notes} notes · {n.links} connections · edited {c.updatedAt.slice(0, 10)}
                  </p>
                  <Button
                    size="sm"
                    variant="primary"
                    className="mt-2 w-full"
                    onClick={() => {
                      store.mergeContactInto(c.id, c.id === a.id ? b.id : a.id);
                      setMessage(`Merged. ${c.name} now has both records' details and history.`);
                    }}
                  >
                    Keep this one and merge
                  </Button>
                </div>
              );
            })}
          </div>
          <Button size="sm" variant="ghost" onClick={() => (store.dismissDuplicate(a.id, b.id), setMessage("Marked as different people."))}>
            These are different people
          </Button>
        </Card>
      ))}
    </div>
  );
}
