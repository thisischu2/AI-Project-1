"use client";

import { AlertTriangle, Check, Download, FileUp, LifeBuoy, Share, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Button, Card, PageHeader, SectionTitle, Spinner, cn, inputClass } from "@/components/ui";
import { formatDate } from "@/lib/api";
import {
  MAX_BACKUP_BYTES,
  backupFileName,
  countsOf,
  makeBackup,
  readBackup,
  type Counts,
  type MergeSummary,
} from "@/lib/persistence";
import { useNetwork } from "@/lib/store";
import type { NetworkData } from "@/lib/types";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const describeCounts = (c: Counts) =>
  [plural(c.contacts, "person", "people"), plural(c.connections, "connection"), plural(c.interactions, "note"), plural(c.reminders, "follow-up")].join(", ");

/** Hand a file to the phone's share sheet when possible, otherwise download it. */
async function shareOrDownload(text: string, name: string): Promise<"shared" | "downloaded" | "cancelled"> {
  const file = new File([text], name, { type: "application/json" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  const touch = window.matchMedia("(pointer: coarse)").matches;
  if (touch && nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "6IX DEGREES backup" });
      return "shared";
    } catch (e) {
      if ((e as Error).name === "AbortError") return "cancelled";
      // Fall through to a download if sharing fails for another reason.
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "downloaded";
}

type Pending = { data: NetworkData; fileName: string; exportedAt?: string; repaired: number; dropped: number };

export default function DataPage() {
  const store = useNetwork();
  const { data } = store;
  const fileInput = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [reading, setReading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [done, setDone] = useState("");
  const [deleteText, setDeleteText] = useState("");
  const recovery = store.recoveryCopy();

  const counts = countsOf(data);
  const isEmpty = counts.contacts === 0 && counts.interactions === 0 && counts.reminders === 0;

  const save = async () => {
    setSaving(true);
    setSaveMsg("");
    try {
      const result = await shareOrDownload(JSON.stringify(makeBackup(data), null, 1), backupFileName());
      setSaveMsg(
        result === "shared"
          ? "Backup shared. Keep it somewhere safe, such as Files, Drive or your email."
          : result === "downloaded"
            ? "Backup saved to your Downloads folder."
            : "",
      );
    } catch {
      setSaveMsg("Couldn't create the backup file. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const pick = async (file: File | undefined) => {
    setLoadError("");
    setDone("");
    setPending(null);
    setConfirmReplace(false);
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) return setLoadError("That file is too large to be a 6IX backup.");
    setReading(true);
    try {
      const r = readBackup(await file.text());
      if (!r.ok) setLoadError(r.error);
      else setPending({ data: r.data, fileName: file.name, exportedAt: r.exportedAt, repaired: r.report.repaired, dropped: r.report.dropped });
    } catch {
      setLoadError("Couldn't read that file. Try choosing it again.");
    } finally {
      setReading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const combine = () => {
    if (!pending) return;
    const s: MergeSummary = store.mergeIn(pending.data);
    const parts = [
      s.added.contacts && plural(s.added.contacts, "person", "people"),
      s.added.connections && plural(s.added.connections, "connection"),
      s.added.interactions && plural(s.added.interactions, "note"),
      s.added.reminders && plural(s.added.reminders, "follow-up"),
    ].filter(Boolean) as string[];
    const added = parts.length ? `Added ${parts.join(", ")}.` : "Nothing new to add.";
    setDone(`Combined. ${added}${s.updated ? ` Updated ${plural(s.updated, "person", "people")} with newer details from the backup.` : ""}`);
    setPending(null);
  };

  const replace = () => {
    if (!pending) return;
    store.replaceAll(pending.data);
    setDone(`Replaced. This device now has ${describeCounts(countsOf(pending.data))}.`);
    setPending(null);
    setConfirmReplace(false);
  };

  return (
    <>
      <PageHeader
        title="Your data"
        subtitle="Everything you record is saved only on this device. Use a backup to keep a copy or to move it to your phone or computer."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="space-y-4 p-5">
          <SectionTitle>Save a backup</SectionTitle>
          <p className="text-sm text-silver">
            On this device: {isEmpty ? "nothing recorded yet" : describeCounts(counts)}. The backup is one file. On a phone you can send it with AirDrop, email it to
            yourself, or save it to Files or Drive.
          </p>
          <Button variant="primary" className="w-full sm:w-auto" onClick={save} disabled={saving || isEmpty}>
            {saving ? <Spinner /> : <Share size={15} />} Save backup
          </Button>
          {isEmpty && <p className="text-xs text-silver">Add someone first. There&apos;s nothing to back up yet.</p>}
          {saveMsg && (
            <p className="flex items-start gap-2 text-sm text-emerald-300">
              <Check size={15} className="mt-0.5 shrink-0" /> {saveMsg}
            </p>
          )}
          <p className="text-xs text-silver">
            The file contains everything you recorded about people, including notes. Treat it like a private document.
          </p>
        </Card>

        <Card className="space-y-4 p-5">
          <SectionTitle>Load a backup</SectionTitle>
          <p className="text-sm text-silver">Open a backup file from your other device. You&apos;ll see what&apos;s in it before anything changes.</p>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label="Choose a backup file"
            onChange={(e) => pick(e.target.files?.[0])}
          />
          <Button className="w-full sm:w-auto" onClick={() => fileInput.current?.click()} disabled={reading}>
            {reading ? <Spinner /> : <FileUp size={15} />} Choose backup file
          </Button>
          {loadError && (
            <p role="alert" className="flex items-start gap-2 text-sm text-red-300">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {loadError}
            </p>
          )}
          {done && (
            <p role="status" className="flex items-start gap-2 text-sm text-emerald-300">
              <Check size={15} className="mt-0.5 shrink-0" /> {done}
            </p>
          )}

          {pending && (
            <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div>
                <p className="font-medium">{pending.fileName}</p>
                <p className="mt-1 text-sm text-silver">
                  {pending.exportedAt ? `Saved ${formatDate(pending.exportedAt.slice(0, 10))}. ` : ""}Contains {describeCounts(countsOf(pending.data))}.
                </p>
                {pending.dropped > 0 && (
                  <p className="mt-1 text-xs text-amber-300">{plural(pending.dropped, "damaged item")} in the file will be skipped.</p>
                )}
              </div>
              <div className="space-y-2">
                <Button variant="primary" className="w-full" onClick={combine}>
                  Combine with this device
                </Button>
                <p className="text-xs text-silver">
                  Adds anyone and anything new. If the same person is on both, the most recently edited version is kept. Nothing is deleted.
                </p>
              </div>
              <div className="space-y-2">
                {confirmReplace ? (
                  <div className="space-y-2 rounded-xl border border-red-500/30 bg-red-500/5 p-3">
                    <p className="text-sm text-red-200">
                      This removes the {describeCounts(counts)} on this device and replaces them with the backup. Save a backup of this device first if you
                      might need them.
                    </p>
                    <div className="flex gap-2">
                      <Button variant="danger" onClick={replace}>
                        Replace everything
                      </Button>
                      <Button variant="ghost" onClick={() => setConfirmReplace(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="ghost" className="w-full" onClick={() => (isEmpty ? replace() : setConfirmReplace(true))}>
                    Replace this device with the backup
                  </Button>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={() => setPending(null)}>
                Cancel
              </Button>
            </div>
          )}
        </Card>

        {recovery && (
          <Card className="space-y-3 border-amber-500/20 p-5">
            <SectionTitle>Recovered data</SectionTitle>
            <p className="flex items-start gap-2 text-sm text-amber-100/90">
              <LifeBuoy size={15} className="mt-0.5 shrink-0" />
              Some saved data couldn&apos;t be read, so a copy of the original was kept. Download it and send it to whoever helps you with the app, so it can be
              repaired.
            </p>
            <Button onClick={() => shareOrDownload(recovery, "6ix-degrees-recovered-data.json")}>
              <Download size={15} /> Download recovered copy
            </Button>
          </Card>
        )}

        <Card className="space-y-3 p-5">
          <SectionTitle>Delete all my data</SectionTitle>
          <p className="text-sm text-silver">Permanently removes everyone and everything from this device. Backups you saved elsewhere are not affected.</p>
          <label htmlFor="confirm-delete" className="block text-xs text-silver">
            Type DELETE to confirm
          </label>
          <input
            id="confirm-delete"
            className={cn(inputClass, "max-w-xs")}
            autoComplete="off"
            autoCapitalize="characters"
            value={deleteText}
            onChange={(e) => setDeleteText(e.target.value)}
          />
          <Button variant="danger" disabled={deleteText.trim().toUpperCase() !== "DELETE"} onClick={store.deleteAllData}>
            <Trash2 size={15} /> Delete all my data
          </Button>
        </Card>
      </div>
    </>
  );
}
