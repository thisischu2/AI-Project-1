/**
 * Contact import from CSV (Google, Outlook, LinkedIn, Apple Numbers…) and
 * vCard (.vcf from iPhone, Android, Outlook). Runs entirely on the device.
 *
 * Flow: parse file → (CSV) map columns to fields → candidates → classify each
 * against existing contacts and the rest of the file → person reviews → save.
 */
import { combineContactFields, findDuplicates, type DuplicateMatch } from "./duplicates";
import type { Contact, ImportantDate } from "./types";

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;

/* ----------------------------------- CSV ----------------------------------- */

/** RFC 4180 CSV: quoted fields, "" escapes, newlines inside quotes, CRLF, BOM. */
export function parseCSV(text: string, delimiter?: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const d = delimiter ?? detectDelimiter(src);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"' && field === "") inQuotes = true;
    else if (ch === d) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function detectDelimiter(text: string): string {
  const firstLines = text.split(/\r?\n/).slice(0, 5).join("\n");
  const counts = [",", ";", "\t"].map((d) => [d, firstLines.split(d).length] as const);
  return counts.sort((a, b) => b[1] - a[1])[0][0];
}

export const IMPORT_FIELDS = [
  { key: "name", label: "Full name" },
  { key: "firstName", label: "First name" },
  { key: "middleName", label: "Middle name" },
  { key: "lastName", label: "Last name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "organization", label: "Organization" },
  { key: "occupation", label: "Job title" },
  { key: "location", label: "City or location" },
  { key: "birthday", label: "Birthday" },
  { key: "notes", label: "Notes" },
  { key: "tags", label: "Groups or tags" },
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number]["key"];
/** Column index for each field; -1 = not used. */
export type ColumnMap = Record<ImportField, number>;

const HEADER_HINTS: Record<ImportField, RegExp> = {
  name: /^(name|full ?name|display ?name|contact ?name)$/,
  firstName: /^(first ?name|given ?name|first)$/,
  middleName: /^(middle ?name|additional ?name)$/,
  lastName: /^(last ?name|family ?name|surname|last)$/,
  email: /^(e-?mail( ?address)?|e-?mail 1 - value|e-?mail address|primary e-?mail|email 1)$/,
  phone: /^(phone|mobile|mobile ?phone|cell|phone ?number|phone 1 - value|primary phone|business phone|home phone|telephone)$/,
  organization: /^(company|organi[sz]ation|organi[sz]ation 1 - name|organi[sz]ation name|employer|business|company name)$/,
  occupation: /^(job ?title|title|position|role|occupation|organi[sz]ation 1 - title|organi[sz]ation title)$/,
  location: /^(city|location|business city|home city|address 1 - city|town|address)$/,
  birthday: /^(birthday|birth ?date|date of birth|dob)$/,
  notes: /^(notes?|comments?|description)$/,
  tags: /^(group membership|groups?|labels?|categories|tags?)$/,
};

const normHeader = (h: string) => h.trim().toLowerCase().replace(/\s+/g, " ").replace(/[:*]/g, "");

/** First column whose header matches each field (spreadsheets often repeat similar columns). */
export function guessColumnMap(headers: string[]): ColumnMap {
  const map = Object.fromEntries(IMPORT_FIELDS.map((f) => [f.key, -1])) as ColumnMap;
  const used = new Set<number>();
  for (const f of IMPORT_FIELDS) {
    const i = headers.findIndex((h, idx) => !used.has(idx) && HEADER_HINTS[f.key].test(normHeader(h)));
    if (i >= 0) {
      map[f.key] = i;
      used.add(i);
    }
  }
  return map;
}

const knownHeaderCount = (row: string[]) =>
  row.filter((h) => IMPORT_FIELDS.some((f) => HEADER_HINTS[f.key].test(normHeader(h)))).length;

/**
 * Find the header row. LinkedIn exports start with a few lines of notes, so
 * look at the first 10 rows for the one that names the most known columns.
 */
export function splitHeader(rows: string[][]): { headers: string[]; body: string[][] } {
  let best = 0;
  let bestScore = -1;
  rows.slice(0, 10).forEach((r, i) => {
    const s = knownHeaderCount(r);
    if (s > bestScore) {
      best = i;
      bestScore = s;
    }
  });
  return { headers: rows[best] ?? [], body: rows.slice(best + 1) };
}

/* ---------------------------------- vCard ---------------------------------- */

const unescapeV = (s: string) => s.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");

function decodeQuotedPrintable(s: string) {
  const bytes: number[] = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "=" && /^[0-9A-F]{2}$/i.test(s.slice(i + 1, i + 3))) {
      bytes.push(parseInt(s.slice(i + 1, i + 3), 16));
      i += 2;
    } else bytes.push(s.charCodeAt(i));
  }
  try {
    return new TextDecoder().decode(new Uint8Array(bytes));
  } catch {
    return s;
  }
}

export interface RawCandidate {
  name?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  organization?: string;
  occupation?: string;
  location?: string;
  birthday?: string;
  notes?: string;
  tags?: string;
}

/** Parse one or more vCards (versions 2.1, 3.0 and 4.0). */
export function parseVCards(text: string): RawCandidate[] {
  // Unfold: a line starting with space or tab continues the previous one. 2.1 QP uses a trailing "=".
  const lines = text
    .replace(/^﻿/, "")
    .replace(/=\r?\n/g, "=\u0000")
    .replace(/\r?\n[ \t]/g, "")
    .split(/\r?\n/)
    .map((l) => l.replace(/=\u0000/g, ""));
  const cards: RawCandidate[] = [];
  let cur: RawCandidate | null = null;
  for (const line of lines) {
    const upper = line.trim().toUpperCase();
    if (upper === "BEGIN:VCARD") {
      cur = {};
      continue;
    }
    if (upper === "END:VCARD") {
      if (cur) cards.push(cur);
      cur = null;
      continue;
    }
    if (!cur) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const head = line.slice(0, colon);
    let value = line.slice(colon + 1);
    const [rawProp, ...params] = head.split(";");
    const prop = rawProp.replace(/^item\d+\./i, "").toUpperCase();
    if (params.some((p) => /QUOTED-PRINTABLE/i.test(p))) value = decodeQuotedPrintable(value);
    const v = unescapeV(value).trim();
    if (!v) continue;
    switch (prop) {
      case "FN":
        cur.name ??= v;
        break;
      case "N": {
        const [last, first, middle] = value.split(";").map((x) => unescapeV(x).trim());
        cur.lastName ??= last || undefined;
        cur.firstName ??= first || undefined;
        cur.middleName ??= middle || undefined;
        break;
      }
      case "EMAIL":
        cur.email ??= v;
        break;
      case "TEL":
        cur.phone ??= v.replace(/^tel:/i, "");
        break;
      case "ORG":
        cur.organization ??= value.split(";").map((x) => unescapeV(x).trim()).filter(Boolean).join(", ");
        break;
      case "TITLE":
        cur.occupation ??= v;
        break;
      case "ADR": {
        // ADR: PO box; extended; street; city; region; postal code; country
        const parts = value.split(";").map((x) => unescapeV(x).trim());
        const place = [parts[3], parts[4] || parts[6]].filter(Boolean).join(", ");
        if (place) cur.location ??= place;
        break;
      }
      case "BDAY":
        cur.birthday ??= v;
        break;
      case "NOTE":
        cur.notes ??= v;
        break;
      case "CATEGORIES":
        cur.tags ??= v;
        break;
    }
  }
  return cards;
}

/* ------------------------------- CANDIDATES -------------------------------- */

export function rowsToCandidates(rows: string[][], map: ColumnMap): RawCandidate[] {
  return rows.map((r) => {
    const c: RawCandidate = {};
    for (const f of IMPORT_FIELDS) {
      const i = map[f.key];
      if (i >= 0 && r[i] !== undefined && r[i].trim() !== "") c[f.key] = r[i].trim();
    }
    return c;
  });
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Accepts 1990-04-12, 19900412, 4/12/1990, 12.04.1990 (day first when the first number is over 12). Returns undefined when unclear or yearless. */
export function parseBirthday(s?: string): string | undefined {
  if (!s) return undefined;
  const t = s.trim();
  let y: number, m: number, d: number;
  let r = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(t);
  if (r) [y, m, d] = [+r[1], +r[2], +r[3]];
  else if ((r = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(t))) {
    const a = +r[1];
    const b = +r[2];
    y = +r[3];
    if (a > 12) [d, m] = [a, b];
    else [m, d] = [a, b];
  } else return undefined;
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return undefined;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1) return undefined; // e.g. Feb 30
  return `${y}-${pad(m)}-${pad(d)}`;
}

const clip = (s: string | undefined, max: number) => (s ? s.slice(0, max) : undefined);

export type ContactInput = Omit<Contact, "id" | "createdAt" | "updatedAt">;

/** Turn a raw row into a contact, or explain why it can't be one. */
export function toContactInput(raw: RawCandidate): { contact: ContactInput; warnings: string[] } | { error: string } {
  const pieced = [raw.firstName, raw.middleName, raw.lastName].filter(Boolean).join(" ");
  const name = (raw.name || pieced || "").replace(/\s+/g, " ").trim();
  const email = raw.email?.split(/[;,\s]+/).find((e) => e.includes("@"));
  if (!name) return { error: email ? "No name in this row (only an email)" : "No name in this row" };
  const warnings: string[] = [];
  if (raw.email && !email) warnings.push("Email ignored (doesn't look like an email)");
  const birthday = parseBirthday(raw.birthday);
  if (raw.birthday && !birthday) warnings.push("Birthday ignored (no year or unclear format)");
  const dates: ImportantDate[] = birthday ? [{ label: "Birthday", date: birthday }] : [];
  const tags = (raw.tags ?? "")
    .split(/[,;:]| ::: /)
    .map((t) => t.replace(/^\*\s*/, "").trim())
    .filter((t) => t && !/^(myContacts|starred|\* myContacts)$/i.test(t))
    .slice(0, 20);
  return {
    contact: {
      name: name.slice(0, 200),
      email: clip(email, 300),
      phone: clip(raw.phone?.split(/ ::: |;/)[0].trim(), 100),
      organization: clip(raw.organization, 200),
      occupation: clip(raw.occupation, 200),
      location: clip(raw.location, 200),
      notes: clip(raw.notes, 20000),
      categories: [],
      tags: [...new Set(["imported", ...tags])],
      interests: [],
      goals: [],
      skills: [],
      importantDates: dates,
    },
    warnings,
  };
}

export type RowAction = "add" | "update" | "skip";

export interface ImportRow {
  index: number;
  status: "new" | "duplicate" | "repeat" | "invalid";
  contact?: ContactInput;
  match?: DuplicateMatch; // an existing contact this row might be
  repeatOf?: number; // an earlier row in the same file with the same person
  error?: string;
  warnings: string[];
  action: RowAction;
}

/**
 * Classify every row. Defaults are cautious: new people are added,
 * likely duplicates and repeats are skipped until the person chooses.
 */
export function classifyRows(raws: RawCandidate[], existing: Contact[]): ImportRow[] {
  const accepted: { index: number; contact: ContactInput }[] = [];
  return raws.slice(0, MAX_IMPORT_ROWS).map((raw, index) => {
    const r = toContactInput(raw);
    if ("error" in r) return { index, status: "invalid", error: r.error, warnings: [], action: "skip" };
    const [match] = findDuplicates(r.contact, existing);
    if (match) return { index, status: "duplicate", contact: r.contact, match, warnings: r.warnings, action: "skip" };
    const asContacts = accepted.map((a) => ({ ...a.contact, id: String(a.index), createdAt: "", updatedAt: "" }));
    const [repeat] = findDuplicates(r.contact, asContacts).filter((m) => m.confidence === "high");
    if (repeat) return { index, status: "repeat", contact: r.contact, repeatOf: +repeat.contact.id, warnings: r.warnings, action: "skip" };
    accepted.push({ index, contact: r.contact });
    return { index, status: "new", contact: r.contact, warnings: r.warnings, action: "add" };
  });
}

/** What saving would do: contacts to add, and patches that fill blanks on existing ones. */
export function planImport(rows: ImportRow[], existing: Contact[]) {
  const add: ContactInput[] = [];
  const updates = new Map<string, Contact>();
  for (const row of rows) {
    if (!row.contact || row.action === "skip") continue;
    if (row.action === "add") add.push(row.contact);
    else if (row.action === "update" && row.match) {
      const base = updates.get(row.match.contact.id) ?? existing.find((c) => c.id === row.match!.contact.id);
      if (base) updates.set(base.id, combineContactFields(base, row.contact));
    }
  }
  const update = [...updates.values()].map((c) => {
    const patch: Partial<ContactInput> & Partial<Contact> = { ...c };
    delete patch.id;
    delete patch.createdAt;
    delete patch.updatedAt;
    return { id: c.id, patch: patch as Partial<ContactInput> };
  });
  return { add, update };
}
