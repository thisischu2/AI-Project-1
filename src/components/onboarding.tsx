"use client";

import { motion } from "framer-motion";
import { ArrowRight, Brain, FileUp, Network, ShieldCheck, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { MAX_BACKUP_BYTES, readBackup } from "@/lib/persistence";
import { useNetwork } from "@/lib/store";
import { LogoMark } from "./logo";
import { Button, Input } from "./ui";

const pillars = [
  { icon: Brain, title: "Remember", body: "Turn quick notes into a timeline of who you met and what you talked about." },
  { icon: Network, title: "Connect", body: "See your network as a living map, with real degrees of separation." },
  { icon: Sparkles, title: "Discover", body: "Spot introductions that might help, with the evidence behind each one." },
];

/** First-run landing + onboarding. Shown until the user picks a starting point. */
export function Onboarding() {
  const { startFresh, loadDemo, replaceAll } = useNetwork();
  const [name, setName] = useState("");
  const [restoreError, setRestoreError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  // Moving from another device: load its backup file instead of starting over.
  const restore = async (file: File | undefined) => {
    setRestoreError("");
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) return setRestoreError("That file is too large to be a 6IX backup.");
    try {
      const r = readBackup(await file.text());
      if (r.ok) replaceAll(r.data);
      else setRestoreError(r.error);
    } catch {
      setRestoreError("Couldn't read that file. Try choosing it again.");
    }
    if (fileInput.current) fileInput.current.value = "";
  };

  return (
    <div className="app-glow relative min-h-screen overflow-hidden">
      <OrbitBackdrop />
      <div className="relative mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-6 py-16 text-center">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6 }}>
          <LogoMark size={64} />
        </motion.div>
        <motion.p
          className="mt-6 text-xs font-medium uppercase tracking-[0.35em] text-silver"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
        >
          6IX DEGREES
        </motion.p>
        <motion.h1
          className="text-gradient mt-4 text-4xl font-semibold tracking-tight sm:text-6xl"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
        >
          Everyone is closer
          <br />
          than you think.
        </motion.h1>
        <motion.p
          className="mt-5 max-w-xl text-base text-silver sm:text-lg"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35 }}
        >
          It&apos;s not just who you know. It&apos;s who you know, who they know, and what connects you.
        </motion.p>

        <motion.form
          className="surface mt-10 w-full max-w-md rounded-2xl p-5 text-left"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          onSubmit={(e) => {
            e.preventDefault();
            startFresh(name.trim() || "You");
          }}
        >
          <label htmlFor="onb-name" className="mb-2 block text-sm font-medium">
            What should we call you?
          </label>
          <Input id="onb-name" placeholder="Your first name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button type="submit" variant="primary" className="flex-1">
              Start my network <ArrowRight size={16} />
            </Button>
            <Button type="button" className="flex-1" onClick={() => loadDemo(name.trim() || "You")}>
              Explore demo network
            </Button>
          </div>
          <p className="mt-3 flex items-start gap-2 text-xs text-silver">
            <ShieldCheck size={14} className="mt-0.5 shrink-0 text-emerald-400" />
            The demo uses clearly labeled fictional people. You can remove them anytime.
          </p>
          <div className="mt-4 border-t border-white/5 pt-4">
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              className="hidden"
              aria-label="Choose a backup file"
              onChange={(e) => restore(e.target.files?.[0])}
            />
            <Button type="button" variant="ghost" className="w-full" onClick={() => fileInput.current?.click()}>
              <FileUp size={15} /> Already use 6IX on another device? Load your backup
            </Button>
            {restoreError && (
              <p role="alert" className="mt-2 text-sm text-red-300">
                {restoreError}
              </p>
            )}
          </div>
        </motion.form>

        <div className="mt-14 grid w-full gap-4 sm:grid-cols-3">
          {pillars.map(({ icon: Icon, title, body }, i) => (
            <motion.div
              key={title}
              className="surface rounded-2xl p-5 text-left"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55 + i * 0.08 }}
            >
              <Icon size={18} className="text-cobalt" />
              <p className="mt-3 font-medium">{title}</p>
              <p className="mt-1 text-sm text-silver">{body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

function OrbitBackdrop() {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-40" aria-hidden="true">
      {[220, 340, 480, 640].map((r, i) => (
        <circle
          key={r}
          cx="50%"
          cy="38%"
          r={r}
          fill="none"
          stroke="url(#orbit)"
          strokeOpacity={0.35 - i * 0.07}
          strokeDasharray="2 8"
        />
      ))}
      <defs>
        <linearGradient id="orbit" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
    </svg>
  );
}
