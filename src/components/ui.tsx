"use client";

import { clsx } from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { forwardRef, useEffect } from "react";

export { clsx as cn };

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", className, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]",
        size === "sm" ? "h-10 px-3 text-[13px] sm:h-8" : "h-11 px-4 text-sm sm:h-10",
        variant === "primary" &&
          "bg-gradient-to-b from-cobalt to-[#2563eb] text-white shadow-[0_8px_24px_-12px_rgba(59,130,246,0.8)] hover:brightness-110",
        variant === "secondary" && "border border-white/10 bg-white/[0.04] text-platinum hover:bg-white/[0.08]",
        variant === "ghost" && "text-silver hover:bg-white/[0.06] hover:text-platinum",
        variant === "danger" && "border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20",
        className,
      )}
      {...props}
    />
  );
});

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx("surface rounded-2xl", className)} {...props} />;
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-[13px] font-medium uppercase tracking-[0.14em] text-silver">{children}</h2>
      {action}
    </div>
  );
}

export const inputClass =
  "w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-base text-platinum sm:text-sm placeholder:text-zinc-500 transition focus:border-cobalt/60 focus:bg-black/40 focus:outline-none focus:ring-2 focus:ring-cobalt/20";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={clsx(inputClass, className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={clsx(inputClass, "min-h-24 resize-y", className)} {...props} />;
  },
);

export function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-silver">
      {children}
    </label>
  );
}

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "cobalt" | "violet" | "amber" | "green";
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        tone === "neutral" && "bg-white/[0.06] text-silver",
        tone === "cobalt" && "bg-cobalt/15 text-blue-300",
        tone === "violet" && "bg-violet/15 text-violet-300",
        tone === "amber" && "bg-amber-500/15 text-amber-300",
        tone === "green" && "bg-emerald-500/15 text-emerald-300",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function DemoBadge() {
  return (
    <Badge tone="amber" className="shrink-0">
      Demo · fictional
    </Badge>
  );
}

export function Avatar({ name, size = 36, highlight }: { name: string; size?: number; highlight?: boolean }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
  // Stable hue per name so avatars feel personal without photos.
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return (
    <span
      className={clsx(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white/90",
        highlight && "ring-2 ring-cobalt ring-offset-2 ring-offset-obsidian",
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: `linear-gradient(135deg, hsl(${h} 45% 32%), hsl(${(h + 40) % 360} 50% 22%))`,
      }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-silver">
        {icon}
      </div>
      <p className="font-medium text-platinum">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-silver">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Slide-over panel used for editing and profiles. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={clsx(
              "fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-white/10 bg-charcoal/95 backdrop-blur-xl",
              wide ? "sm:max-w-2xl" : "sm:max-w-lg",
            )}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
          >
            <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
              <h2 className="text-base font-semibold">{title}</h2>
              <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
                <X size={16} />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={clsx("inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white", className)}
      aria-label="Loading"
    />
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-silver">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
