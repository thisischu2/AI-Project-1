"use client";

import { motion } from "framer-motion";
import { Plus, Search, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { blankContact, ContactForm } from "@/components/contact-form";
import { ContactProfile } from "@/components/contact-profile";
import { Avatar, Badge, Button, Card, DemoBadge, EmptyState, Input, PageHeader, Sheet, cn } from "@/components/ui";
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
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus size={16} /> Add contact
          </Button>
        }
      />

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
          onCancel={() => setCreating(false)}
          onSubmit={(v) => {
            const c = store.addContact(v);
            setCreating(false);
            setSelected(c.id);
          }}
        />
      </Sheet>
    </>
  );
}
