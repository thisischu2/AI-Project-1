"use client";

import { Copy, Mail, MessageSquare } from "lucide-react";
import { useState } from "react";
import { useNetwork } from "@/lib/store";
import { Button, Label, Textarea } from "./ui";

/** An editable draft. Copy it, or open it in the phone's email or text app; the person sends it themselves. */
export function MessageDraft({ contactIds, subject, body: initial, basedOn }: { contactIds: string[]; subject: string; body: string; basedOn: string[] }) {
  const { contactById } = useNetwork();
  const [body, setBody] = useState(initial);
  const [copied, setCopied] = useState(false);
  const people = contactIds.map((id) => contactById(id)).filter(Boolean);
  const emails = people.map((c) => c!.email).filter(Boolean) as string[];
  const phone = people.length === 1 ? people[0]!.phone : undefined;
  return (
    <div className="space-y-4">
      <p className="text-sm text-silver">Written from your records. Change anything you like. Nothing is sent from here.</p>
      {basedOn.length > 0 && (
        <div className="rounded-xl bg-white/[0.03] p-3 text-xs text-silver">
          <p className="mb-1 font-medium text-platinum">Based on</p>
          <ul className="list-disc space-y-0.5 pl-4">
            {basedOn.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <Label htmlFor="draft-body">Message</Label>
        <Textarea id="draft-body" className="min-h-64" value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button
          variant="primary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(body);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          <Copy size={14} /> {copied ? "Copied" : "Copy"}
        </Button>
        {emails.length > 0 && (
          <a href={`mailto:${emails.join(",")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}>
            <Button className="w-full">
              <Mail size={14} /> Open in email app
            </Button>
          </a>
        )}
        {phone && (
          <a href={`sms:${phone.replace(/[^\d+]/g, "")}?&body=${encodeURIComponent(body)}`}>
            <Button className="w-full">
              <MessageSquare size={14} /> Open in messages
            </Button>
          </a>
        )}
      </div>
      {emails.length === 0 && !phone && <p className="text-xs text-silver">No email or phone saved for {people.length > 1 ? "them" : people[0]?.name}, so copy the text instead.</p>}
    </div>
  );
}
