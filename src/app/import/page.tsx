"use client";

import { AlertTriangle, ArrowLeft, Check, FileUp } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { Badge, Button, Card, EmptyState, PageHeader, SectionTitle, Spinner, cn, inputClass } from "@/components/ui";
import {
  IMPORT_FIELDS,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  classifyRows,
  guessColumnMap,
  parseCSV,
  parseVCards,
  planImport,
  rowsToCandidates,
  splitHeader,
  type ColumnMap,
  type ImportRow,
  type RawCandidate,
  type RowAction,
} from "@/lib/importers";
import { useNetwork } from "@/lib/store";

type Source =
  | { kind: "csv"; fileName: string; headers: string[]; body: string[][]; map: ColumnMap }
  | { kind: "vcard"; fileName: string; cards: RawCandidate[] };

const STATUS: Record<ImportRow["status"], { label: string; tone: "green" | "amber" | "neutral" | "violet" }> = {
  new: { label: "New", tone: "green" },
  duplicate: { label: "Already in your circle?", tone: "amber" },
  repeat: { label: "Repeated in this file", tone: "neutral" },
  invalid: { label: "Can't import", tone: "neutral" },
};

export default function ImportPage() {
  const store = useNetwork();
  const fileInput = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [actions, setActions] = useState<Record<number, RowAction>>({});
  const [result, setResult] = useState("");
  const [showAll, setShowAll] = useState(false);

  const pick = async (file: File | undefined) => {
    setError("");
    setResult("");
    setSource(null);
    setActions({});
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) return setError("That file is larger than 5 MB. Export fewer contacts at a time.");
    setReading(true);
    try {
      const text = await file.text();
      const isVcf = /\.vcf$/i.test(file.name) || /BEGIN:VCARD/i.test(text.slice(0, 2000));
      if (isVcf) {
        const cards = parseVCards(text);
        if (!cards.length) setError("No contacts found in that vCard file.");
        else setSource({ kind: "vcard", fileName: file.name, cards });
      } else {
        const rows = parseCSV(text);
        if (rows.length < 2) setError("That file has no contact rows. Choose a CSV with a header row and at least one contact.");
        else {
          const { headers, body } = splitHeader(rows);
          setSource({ kind: "csv", fileName: file.name, headers, body, map: guessColumnMap(headers) });
        }
      }
    } catch {
      setError("Couldn't read that file. Make sure it's a .csv or .vcf contacts export.");
    } finally {
      setReading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const candidates = useMemo(() => {
    if (!source) return [];
    return source.kind === "vcard" ? source.cards : rowsToCandidates(source.body, source.map);
  }, [source]);
  const tooMany = candidates.length > MAX_IMPORT_ROWS;
  const rows = useMemo(() => classifyRows(candidates, store.data.contacts), [candidates, store.data.contacts]);
  const withActions = rows.map((r) => ({ ...r, action: actions[r.index] ?? r.action }));
  const plan = useMemo(() => planImport(withActions, store.data.contacts), [withActions, store.data.contacts]);
  const nameMapped = source?.kind === "vcard" || (source && (source.map.name >= 0 || source.map.firstName >= 0 || source.map.lastName >= 0));

  const counts = {
    new: rows.filter((r) => r.status === "new").length,
    duplicate: rows.filter((r) => r.status === "duplicate").length,
    other: rows.filter((r) => r.status === "repeat" || r.status === "invalid").length,
  };

  const save = () => {
    store.applyImport(plan.add, plan.update);
    setResult(
      [plan.add.length && `Added ${plan.add.length} ${plan.add.length === 1 ? "person" : "people"}`, plan.update.length && `updated ${plan.update.length}`]
        .filter(Boolean)
        .join(" and ") + ". Imported people are tagged “imported” so you can find them.",
    );
    setSource(null);
    setActions({});
  };

  const visible = showAll ? withActions : withActions.slice(0, 100);

  return (
    <>
      <PageHeader
        title="Import contacts"
        subtitle="Bring in contacts from a CSV (Google, Outlook, LinkedIn, a spreadsheet) or a vCard (.vcf from iPhone or Android). The file is read on this device and never uploaded."
        action={
          <Link href="/circle">
            <Button variant="ghost">
              <ArrowLeft size={15} /> My Circle
            </Button>
          </Link>
        }
      />

      <Card className="mb-6 space-y-3 p-5">
        <input
          ref={fileInput}
          type="file"
          accept=".csv,.vcf,.vcard,text/csv,text/vcard,text/x-vcard"
          className="hidden"
          aria-label="Choose a contacts file"
          onChange={(e) => pick(e.target.files?.[0])}
        />
        <Button variant="primary" onClick={() => fileInput.current?.click()} disabled={reading}>
          {reading ? <Spinner /> : <FileUp size={15} />} {source ? "Choose a different file" : "Choose contacts file"}
        </Button>
        <p className="text-xs text-silver">
          Tip: on iPhone, export from the Contacts app or iCloud as vCard. In Google Contacts, use Export → Google CSV or vCard. On LinkedIn, Settings → Data
          privacy → Get a copy of your data → Connections.
        </p>
        {error && (
          <p role="alert" className="flex items-start gap-2 text-sm text-red-300">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {error}
          </p>
        )}
        {result && (
          <p role="status" className="flex items-start gap-2 text-sm text-emerald-300">
            <Check size={15} className="mt-0.5 shrink-0" /> {result}{" "}
            <Link href="/circle" className="underline underline-offset-2">
              See My Circle
            </Link>
          </p>
        )}
      </Card>

      {!source && !result && (
        <Card>
          <EmptyState icon={<FileUp size={20} />} title="No file chosen" body="You'll see every contact, and what will happen to it, before anything is saved." />
        </Card>
      )}

      {source?.kind === "csv" && (
        <Card className="mb-6 p-5">
          <SectionTitle>Match the columns</SectionTitle>
          <p className="mb-4 text-sm text-silver">
            {source.fileName}: {source.body.length} rows. We guessed which column holds what. Fix anything that looks wrong.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {IMPORT_FIELDS.map((f) => (
              <label key={f.key} className="block text-xs text-silver">
                {f.label}
                <select
                  className={cn(inputClass, "mt-1")}
                  value={source.map[f.key]}
                  onChange={(e) => setSource({ ...source, map: { ...source.map, [f.key]: Number(e.target.value) } })}
                >
                  <option value={-1}>Not in this file</option>
                  {source.headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Column ${i + 1}`}
                      {source.body[0]?.[i] ? ` (e.g. ${source.body[0][i].slice(0, 24)})` : ""}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          {!nameMapped && <p className="mt-3 text-sm text-amber-300">Choose which column holds the name (full name, or first and last name).</p>}
        </Card>
      )}

      {source && nameMapped && (
        <Card className="p-5">
          <SectionTitle>Preview</SectionTitle>
          <div className="mb-4 flex flex-wrap gap-2 text-xs">
            <Badge tone="green">{counts.new} new</Badge>
            <Badge tone="amber">{counts.duplicate} possibly already in your circle</Badge>
            <Badge>{counts.other} skipped (repeats or no name)</Badge>
          </div>
          {tooMany && <p className="mb-3 text-sm text-amber-300">Only the first {MAX_IMPORT_ROWS} contacts can be imported at once.</p>}
          <p className="mb-4 text-sm text-silver">
            New people are added. Possible duplicates are skipped unless you choose to add them or to fill in the existing person&apos;s missing details (their
            current details are never overwritten).
          </p>
          <ul className="divide-y divide-white/5">
            {visible.map((r) => (
              <li key={r.index} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium">{r.contact?.name ?? `Row ${r.index + 1}`}</p>
                    <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                  </div>
                  <p className="truncate text-xs text-silver">
                    {r.contact ? [r.contact.occupation, r.contact.organization, r.contact.email, r.contact.phone].filter(Boolean).join(" · ") : r.error}
                  </p>
                  {r.match && (
                    <p className="text-xs text-amber-200/90">
                      Matches {r.match.contact.name}: {r.match.reasons.join(" · ")}
                    </p>
                  )}
                  {r.repeatOf !== undefined && <p className="text-xs text-silver">Same person as row {r.repeatOf + 1}</p>}
                  {r.warnings.map((w) => (
                    <p key={w} className="text-xs text-silver">
                      {w}
                    </p>
                  ))}
                </div>
                {r.contact && (
                  <select
                    aria-label={`What to do with ${r.contact.name}`}
                    className={cn(inputClass, "sm:w-56")}
                    value={r.action}
                    onChange={(e) => setActions({ ...actions, [r.index]: e.target.value as RowAction })}
                  >
                    <option value="add">Add as new person</option>
                    {r.match && <option value="update">Fill in {r.match.contact.name.split(" ")[0]}&apos;s missing details</option>}
                    <option value="skip">Skip</option>
                  </select>
                )}
              </li>
            ))}
          </ul>
          {withActions.length > visible.length && (
            <Button variant="ghost" size="sm" onClick={() => setShowAll(true)}>
              Show all {withActions.length}
            </Button>
          )}
          <div className="sticky bottom-20 mt-5 flex flex-col gap-2 rounded-2xl border border-white/10 bg-charcoal/95 p-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between lg:bottom-4">
            <p className="text-sm">
              {plan.add.length} to add · {plan.update.length} to update
            </p>
            <Button variant="primary" disabled={plan.add.length + plan.update.length === 0} onClick={save}>
              <Check size={15} /> Import
            </Button>
          </div>
        </Card>
      )}
    </>
  );
}
