"use client";

import { clsx } from "clsx";
import { motion } from "framer-motion";
import { Compass, Home, MessageCircleQuestion, NotebookPen, Share2, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useNetwork } from "@/lib/store";
import { Wordmark } from "./logo";
import { Onboarding } from "./onboarding";
import { Spinner } from "./ui";

export const NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/circle", label: "My Circle", icon: Users },
  { href: "/map", label: "The Map", icon: Share2 },
  { href: "/memory", label: "Memory", icon: NotebookPen },
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/ask", label: "Ask 6ix", icon: MessageCircleQuestion },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { ready, data } = useNetwork();
  const pathname = usePathname();

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (!data.onboarded) return <Onboarding />;

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <div className="app-glow min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-white/5 bg-obsidian/80 px-4 py-6 backdrop-blur-xl lg:flex">
        <Link href="/" className="mb-10 px-2">
          <Wordmark />
        </Link>
        <nav className="flex flex-col gap-1" aria-label="Main">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={clsx(
                "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                isActive(href) ? "text-platinum" : "text-silver hover:bg-white/[0.04] hover:text-platinum",
              )}
            >
              {isActive(href) && (
                <motion.span
                  layoutId="nav-active"
                  className="absolute inset-0 rounded-xl border border-white/10 bg-white/[0.06]"
                  transition={{ type: "spring", damping: 30, stiffness: 400 }}
                />
              )}
              <Icon size={17} className="relative" />
              <span className="relative">{label}</span>
            </Link>
          ))}
        </nav>
        <div className="mt-auto rounded-xl border border-white/5 bg-white/[0.02] p-3 text-xs leading-relaxed text-silver">
          Your network is saved on this device and works offline. Degrees of separation come only from connections you
          record.
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/5 bg-obsidian/80 px-5 py-3.5 backdrop-blur-xl lg:hidden">
        <Link href="/">
          <Wordmark />
        </Link>
      </header>

      <main className="px-5 pb-28 pt-6 sm:px-8 lg:ml-60 lg:px-12 lg:pb-12 lg:pt-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>

      {/* Mobile bottom nav */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-white/5 bg-obsidian/90 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
      >
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(href) ? "page" : undefined}
            className={clsx(
              "flex min-h-14 flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium",
              isActive(href) ? "text-platinum" : "text-zinc-500",
            )}
          >
            <Icon size={21} className={isActive(href) ? "text-cobalt" : ""} />
            {label.replace("My ", "").replace("The ", "")}
          </Link>
        ))}
      </nav>
    </div>
  );
}
