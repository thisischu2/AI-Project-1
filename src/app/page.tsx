"use client";

import { motion } from "framer-motion";
import { ArrowRight, ArrowUp, Bell, CalendarHeart, Compass, Network, NotebookPen, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { NetworkGraph } from "@/components/network-graph";
import { Avatar, Badge, Button, Card, DemoBadge, EmptyState, SectionTitle } from "@/components/ui";
import { formatDate, todayISO, toPayload } from "@/lib/api";
import { distancesFrom } from "@/lib/graph";
import { relativeDay, upcoming } from "@/lib/reconnect";
import { discoverCandidates } from "@/lib/retrieval";
import { useNetwork } from "@/lib/store";
import { ME } from "@/lib/types";
import type { NetworkPayload } from "@/lib/validation";

const fade = (i: number) => ({ initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.05 * i, duration: 0.4 } });

export default function Dashboard() {
  const store = useNetwork();
  const { data, contactById, nameOf } = store;
  const router = useRouter();
  const [q, setQ] = useState("");

  const distances = useMemo(() => distancesFrom(data.connections, ME), [data.connections]);
  const reachable = distances.size - 1;
  const farthest = Math.max(0, ...distances.values());
  const today = todayISO();
  const items = useMemo(() => upcoming(data.contacts, data.reminders, today).slice(0, 5), [data.contacts, data.reminders, today]);
  const candidates = useMemo(() => discoverCandidates(toPayload(data) as NetworkPayload, 3), [data]);
  const recentContacts = [...data.contacts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  const recentMemories = [...data.interactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  const hasDemo = data.contacts.some((c) => c.isDemo);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const stats = [
    { label: "People", value: data.contacts.length, icon: Users },
    { label: "Recorded connections", value: data.connections.length, icon: Network },
    { label: "Reachable through your map", value: reachable, icon: Compass },
    { label: "Farthest known degree", value: farthest ? `${farthest}°` : "—", icon: ArrowRight },
  ];

  return (
    <div className="space-y-8">
      {hasDemo && (
        <motion.div {...fade(0)} className="flex flex-col gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="text-amber-100/90">You&apos;re exploring a fictional demo network. None of these people are real.</span>
          <Button size="sm" variant="ghost" onClick={store.removeDemo}>
            Remove demo data
          </Button>
        </motion.div>
      )}

      <motion.section {...fade(1)}>
        <p className="text-sm text-silver">{greeting},</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
          {data.profile.name === "You" ? "Welcome back" : data.profile.name}
          <span className="text-gradient">.</span>
        </h1>
        <form
          className="mt-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) router.push(`/ask?q=${encodeURIComponent(q.trim())}`);
          }}
        >
          <div className="surface flex items-center gap-3 rounded-2xl p-2 pl-5 shadow-[0_0_0_1px_rgba(59,130,246,0.15),0_20px_60px_-30px_rgba(59,130,246,0.6)]">
            <span className="text-violet">✦</span>
            <input
              aria-label="Ask 6ix"
              className="flex-1 bg-transparent py-2 text-[15px] placeholder:text-zinc-500 focus:outline-none"
              placeholder="Ask 6ix: “How am I connected to James?”"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <Button type="submit" variant="primary" disabled={!q.trim()} aria-label="Ask">
              <ArrowUp size={16} />
            </Button>
          </div>
        </form>
      </motion.section>

      <motion.section {...fade(2)} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="p-4">
            <Icon size={16} className="text-cobalt" />
            <p className="mt-3 text-2xl font-semibold tabular-nums">{value}</p>
            <p className="text-xs text-silver">{label}</p>
          </Card>
        ))}
      </motion.section>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <motion.section {...fade(3)}>
          <SectionTitle
            action={
              <Link href="/map" className="text-xs text-silver hover:text-platinum">
                Open map →
              </Link>
            }
          >
            Network overview
          </SectionTitle>
          <Card className="overflow-hidden">
            {data.contacts.length ? (
              <NetworkGraph contacts={data.contacts} connections={data.connections} userName="You" height={340} interactive={false} />
            ) : (
              <EmptyState icon={<Network size={20} />} title="Your map is empty" body="Add contacts and record who knows whom." />
            )}
          </Card>
        </motion.section>

        <motion.section {...fade(4)}>
          <SectionTitle>Reconnect</SectionTitle>
          <Card className="p-2">
            {items.length === 0 ? (
              <EmptyState icon={<Bell size={20} />} title="Nothing coming up" body="Follow-ups and important dates appear here." />
            ) : (
              <ul>
                {items.map((it) => (
                  <li key={it.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-white/[0.03]">
                    {it.kind === "date" ? <CalendarHeart size={16} className="shrink-0 text-pink-400" /> : <Bell size={16} className="shrink-0 text-cobalt" />}
                    <span className="min-w-0 flex-1 truncate text-sm">{it.title}</span>
                    <Badge tone={it.daysAway !== undefined && it.daysAway < 0 ? "amber" : "neutral"}>{relativeDay(it.daysAway)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </motion.section>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <motion.section {...fade(5)}>
          <SectionTitle
            action={
              <Link href="/circle" className="text-xs text-silver hover:text-platinum">
                All →
              </Link>
            }
          >
            Recent contacts
          </SectionTitle>
          <Card className="p-2">
            {recentContacts.length === 0 ? (
              <EmptyState icon={<Users size={20} />} title="No contacts yet" body="Start with the people you talk to most." />
            ) : (
              <ul>
                {recentContacts.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 rounded-xl px-3 py-2">
                    <Avatar name={c.name} size={30} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{c.name}</p>
                      <p className="truncate text-xs text-silver">{c.occupation ?? c.location ?? ""}</p>
                    </div>
                    {c.isDemo && <DemoBadge />}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </motion.section>

        <motion.section {...fade(6)}>
          <SectionTitle
            action={
              <Link href="/memory" className="text-xs text-silver hover:text-platinum">
                Add →
              </Link>
            }
          >
            Recent memories
          </SectionTitle>
          <Card className="p-4">
            {recentMemories.length === 0 ? (
              <EmptyState icon={<NotebookPen size={20} />} title="No memories yet" body="Log a conversation in Memory." />
            ) : (
              <ul className="space-y-4">
                {recentMemories.map((i) => (
                  <li key={i.id}>
                    <p className="text-xs text-silver">
                      {contactById(i.contactId)?.name} · {formatDate(i.date)}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-sm text-zinc-300">{i.summary}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </motion.section>

        <motion.section {...fade(7)}>
          <SectionTitle
            action={
              <Link href="/discover" className="text-xs text-silver hover:text-platinum">
                Discover →
              </Link>
            }
          >
            Possible introductions
          </SectionTitle>
          <Card className="p-4">
            {candidates.length === 0 ? (
              <EmptyState icon={<Compass size={20} />} title="No possibilities yet" body="Add interests, goals, and skills to contacts." />
            ) : (
              <ul className="space-y-4">
                {candidates.map((c) => (
                  <li key={c.aId + c.bId}>
                    <p className="text-sm">
                      {nameOf(c.aId)} <span className="text-silver">↔</span> {nameOf(c.bId)}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-silver">{c.evidence[0].detail}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </motion.section>
      </div>
    </div>
  );
}
