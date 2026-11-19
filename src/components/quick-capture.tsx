"use client";

import { Link2, Wand2 } from "lucide-react";
import { useState } from "react";
import { extractContact, MAX_DESCRIPTION, type Capture } from "@/lib/capture";
import type { Contact } from "@/lib/types";
import { blankContact, ContactForm } from "./contact-form";
import { Button, Label, Textarea, cn, inputClass } from "./ui";

type ContactInput = Omit<Contact, "id" | "createdAt" | "updatedAt">;

export interface CaptureLinks {
  /** Record a connection between you and the new person. */
  knowsYou: boolean;
  /** A saved person to record as knowing the new person. */
  introducerId?: string;
  introducerLabel?: string;
}

const FIELD_NAMES: Record<string, string> = {
  name: "name",
  occupation: "job",
  organization: "workplace",
  location: "city",
  email: "email",
  phone: "phone",
  metContext: "how you met",
  interests: "interests",
  goals: "goals",
  skills: "skills",
  categories: "relationship",
  birthday: "birthday",
};

/**
 * Add a contact by describing them. Step 1: type a description. Step 2: the
 * usual form, filled from your words, with each value's source shown. Nothing
 * is saved until you press Save.
 */
export function QuickCapture({
  contacts,
  onSave,
  onCancel,
  onOpenExisting,
}: {
  contacts: Contact[];
  onSave: (contact: ContactInput, links: CaptureLinks) => void;
  onCancel: () => void;
  onOpenExisting: (id: string) => void;
}) {
  const [text, setText] = useState("");
  const [capture, setCapture] = useState<Capture | null>(null);
  const [manual, setManual] = useState(false);
  const [knowsYou, setKnowsYou] = useState(true);
  const [introducerId, setIntroducerId] = useState("");

  if (!capture && !manual) {
    return (
      <div className="space-y-4">
        <div>
          <Label htmlFor="describe">Describe them in your own words</Label>
          <Textarea
            id="describe"
            className="min-h-36"
            maxLength={MAX_DESCRIPTION}
            placeholder="e.g. Met Sarah Lee at the ABA tech conference. She's an associate at Davis Polk in New York, into legal tech. sarah@example.com. Introduced by Marcus."
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
          />
          <p className="mt-1.5 text-xs text-silver">
            We fill in the form from your wording (name, job, workplace, city, email, phone, how you met, interests, goals). You check everything before it&apos;s
            saved. Nothing is looked up or sent anywhere.
          </p>
        </div>
        <Button
          variant="primary"
          className="w-full"
          disabled={!text.trim()}
          onClick={() => {
            const c = extractContact(text, contacts);
            setCapture(c);
            setIntroducerId(c.introducer?.matches.length === 1 ? c.introducer.matches[0].id : "");
          }}
        >
          <Wand2 size={15} /> Fill in the form
        </Button>
        <div className="flex justify-between">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="ghost" onClick={() => setManual(true)}>
            Skip, I&apos;ll type it in
          </Button>
        </div>
      </div>
    );
  }

  const hints: Record<string, string[]> = {};
  for (const f of capture?.found ?? []) {
    const list = (hints[f.field] ??= []);
    if (!list.includes(f.from)) list.push(f.from);
  }
  const filled = [...new Set((capture?.found ?? []).map((f) => FIELD_NAMES[f.field]))];
  const intro = capture?.introducer;

  return (
    <div className="space-y-4">
      {capture && (
        <div role="status" className="rounded-2xl border border-violet/30 bg-violet/5 p-3 text-sm">
          {filled.length ? (
            <>
              Filled in from your description: {filled.join(", ")}. Check each one; the words it came from are shown under the field. Your description is kept in
              Notes.
            </>
          ) : (
            <>We couldn&apos;t pick out any details from that wording, so the form is blank except Notes. Fill it in below.</>
          )}
          <button type="button" className="mt-1 block min-h-8 text-xs text-violet underline underline-offset-2" onClick={() => setCapture(null)}>
            Edit the description
          </button>
        </div>
      )}
      <ContactForm
        key={capture ? "captured" : "manual"}
        initial={capture?.contact ?? blankContact()}
        hints={capture ? hints : undefined}
        existing={contacts}
        onOpenExisting={onOpenExisting}
        onCancel={onCancel}
        extra={
          <div className="space-y-3 rounded-xl border border-white/10 p-3">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <Link2 size={14} className="text-violet" /> Connections to record
            </p>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
              <input type="checkbox" className="h-5 w-5 shrink-0 accent-violet-500" checked={knowsYou} onChange={(e) => setKnowsYou(e.target.checked)} />
              You know them directly
            </label>
            {intro && (
              <div className="text-sm">
                <p className="text-xs text-silver">
                  Your description says: &ldquo;{intro.from}&rdquo;
                  {intro.matches.length === 0 && ` — no one called ${intro.name} is saved yet, so this can't be recorded.`}
                </p>
                {intro.matches.length > 0 && (
                  <select
                    aria-label={`Who is ${intro.name}?`}
                    className={cn(inputClass, "mt-2")}
                    value={introducerId}
                    onChange={(e) => setIntroducerId(e.target.value)}
                  >
                    <option value="">Don&apos;t record a connection</option>
                    {intro.matches.map((m) => (
                      <option key={m.id} value={m.id}>
                        Record that {m.name} knows them
                      </option>
                    ))}
                  </select>
                )}
                {intro.matches.length > 1 && !introducerId && (
                  <p className="mt-1 text-xs text-amber-300">More than one saved person is called {intro.name}. Pick one, or leave it.</p>
                )}
              </div>
            )}
          </div>
        }
        onSubmit={(v) =>
          onSave(v, {
            knowsYou,
            introducerId: introducerId || undefined,
            introducerLabel: introducerId && intro ? (intro.kind === "introduced" ? "made the introduction" : intro.from.replace(/^.*?'s\s+/, "")) : undefined,
          })
        }
      />
    </div>
  );
}
