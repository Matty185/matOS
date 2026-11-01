// Stage O3 — turn whatever roster a coach actually has (a pasted WhatsApp
// list, a Google Sheet copy, an exported CSV) into editable member drafts.
//
// Deliberately forgiving: this only *suggests* field values. Every draft is
// then validated with createMemberSchema in the preview table (and again
// server-side), where the coach fixes anything it guessed wrong before a
// single row is written.

import type { BeltColor } from "../belt/constants";

export type RosterDraft = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  belt: BeltColor;
  stripes: number;
  join_date: string;
  membership_plan: "monthly" | "casual" | "comp_team";
};

export const EMPTY_DRAFT: RosterDraft = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  belt: "white",
  stripes: 0,
  join_date: "",
  membership_plan: "monthly",
};

export const ROSTER_CSV_TEMPLATE =
  "first_name,last_name,email,phone,belt,stripes,join_date,plan\n" +
  "Aoife,Byrne,aoife@example.com,+353871234567,blue,2,2023-09-01,monthly\n" +
  "Liam,Walsh,liam@example.com,,white,0,,casual\n";

type Field = keyof RosterDraft | "full_name";

const HEADER_ALIASES: Record<string, Field> = {
  name: "full_name",
  "full name": "full_name",
  fullname: "full_name",
  member: "full_name",
  "first name": "first_name",
  firstname: "first_name",
  first: "first_name",
  forename: "first_name",
  "given name": "first_name",
  "last name": "last_name",
  lastname: "last_name",
  last: "last_name",
  surname: "last_name",
  "family name": "last_name",
  email: "email",
  "e-mail": "email",
  "email address": "email",
  phone: "phone",
  mobile: "phone",
  "phone number": "phone",
  "mobile number": "phone",
  number: "phone",
  belt: "belt",
  rank: "belt",
  grade: "belt",
  stripes: "stripes",
  stripe: "stripes",
  joined: "join_date",
  "join date": "join_date",
  "joined on": "join_date",
  "start date": "join_date",
  since: "join_date",
  "member since": "join_date",
  plan: "membership_plan",
  membership: "membership_plan",
  "membership plan": "membership_plan",
};

function normaliseHeader(cell: string): string {
  return cell.toLowerCase().replace(/[_*]/g, " ").replace(/\s+/g, " ").trim();
}

/** Minimal RFC-4180-ish line splitter: quotes, escaped quotes, one delimiter. */
function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function detectDelimiter(lines: string[]): string {
  const sample = lines.slice(0, 5).join("\n");
  if (sample.includes("\t")) return "\t";
  const commas = (sample.match(/,/g) ?? []).length;
  const semis = (sample.match(/;/g) ?? []).length;
  return semis > commas ? ";" : ",";
}

const BELT_WORDS: [RegExp, BeltColor][] = [
  [/^gr[ae]y\s*(\/|and|-)?\s*white$/, "grey_white"],
  [/^gr[ae]y\s*(\/|and|-)?\s*black$/, "grey_black"],
  [/^gr[ae]y$/, "grey"],
  [/^yellow\s*(\/|and|-)?\s*white$/, "yellow_white"],
  [/^yellow\s*(\/|and|-)?\s*black$/, "yellow_black"],
  [/^yellow$/, "yellow"],
  [/^orange\s*(\/|and|-)?\s*white$/, "orange_white"],
  [/^orange\s*(\/|and|-)?\s*black$/, "orange_black"],
  [/^orange$/, "orange"],
  [/^green\s*(\/|and|-)?\s*white$/, "green_white"],
  [/^green\s*(\/|and|-)?\s*black$/, "green_black"],
  [/^green$/, "green"],
  [/^(white|w|wh)$/, "white"],
  [/^(blue|b|bl)$/, "blue"],
  [/^(purple|p|pu)$/, "purple"],
  [/^(brown|br)$/, "brown"],
  [/^(black|bk|blk)$/, "black"],
];

/**
 * "Purple", "purple belt", "Blue 2 stripes", "grey/white", "B2" → belt
 * (+ stripes if written in the same cell). Null when it isn't a belt.
 */
export function parseBelt(cell: string): { belt: BeltColor; stripes: number | null } | null {
  let text = cell.toLowerCase().replace(/[,()]/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return null;
  let stripes: number | null = null;
  const stripeMatch = text.match(/(\d)\s*(stripes?|st|s)?$/);
  if (stripeMatch && stripeMatch.index !== undefined && stripeMatch.index > 0) {
    const n = Number(stripeMatch[1]);
    if (n >= 0 && n <= 4) {
      stripes = n;
      text = text.slice(0, stripeMatch.index);
    }
  }
  text = text
    .replace(/\bbelt\b/g, "")
    .replace(/[,()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (const [re, belt] of BELT_WORDS) {
    if (re.test(text)) return { belt, stripes };
  }
  return null;
}

function parsePlan(cell: string): RosterDraft["membership_plan"] | null {
  const t = cell.toLowerCase().trim();
  if (!t) return null;
  if (/comp/.test(t)) return "comp_team";
  if (/casual|drop|pay as|payg|class pass|pass/.test(t)) return "casual";
  if (/month|standard|full|unlimited/.test(t)) return "monthly";
  return null;
}

/** Accepts 2024-03-01, 01/03/2024 and 1/3/24 (day-first — Irish/UK). */
export function parseDate(cell: string): string | null {
  const t = cell.trim();
  if (!t) return null;
  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return toIso(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const dmy = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (dmy) {
    const year = Number(dmy[3]!.length === 2 ? `20${dmy[3]}` : dmy[3]);
    return toIso(year, Number(dmy[2]), Number(dmy[1]));
  }
  return null;
}

function toIso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMBEDDED_EMAIL_RE = /[^\s@<>(),"]+@[^\s@<>(),"]+\.[^\s@<>(),"]+/;
const PHONE_RE = /^\+?[\d\s()-]{7,}$/;

function splitName(full: string): { first_name: string; last_name: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length <= 1) return { first_name: parts[0] ?? "", last_name: "" };
  return { first_name: parts[0]!, last_name: parts.slice(1).join(" ") };
}

function applyField(draft: RosterDraft, field: Field, value: string) {
  const v = value.trim();
  if (!v) return;
  switch (field) {
    case "full_name":
      Object.assign(draft, splitName(v));
      return;
    case "email":
      draft.email = v.toLowerCase();
      return;
    case "belt": {
      const b = parseBelt(v);
      if (b) {
        draft.belt = b.belt;
        if (b.stripes !== null) draft.stripes = b.stripes;
      }
      return;
    }
    case "stripes": {
      const n = Number.parseInt(v, 10);
      if (Number.isFinite(n)) draft.stripes = n;
      return;
    }
    case "join_date":
      draft.join_date = parseDate(v) ?? v;
      return;
    case "membership_plan":
      draft.membership_plan = parsePlan(v) ?? draft.membership_plan;
      return;
    default:
      draft[field] = v;
  }
}

/** Headerless row: classify each cell by what it looks like. */
function guessRow(cells: string[]): RosterDraft {
  const draft: RosterDraft = { ...EMPTY_DRAFT };
  const nameParts: string[] = [];
  const beltCells: string[] = [];
  for (const raw of cells) {
    let cell = raw.trim();
    if (!cell) continue;
    if (EMAIL_RE.test(cell)) {
      draft.email = cell.toLowerCase();
      continue;
    }
    // "Aoife Byrne <aoife@x.ie>" (contacts / Gmail paste): take the email,
    // keep the rest as the name.
    const embedded = cell.match(EMBEDDED_EMAIL_RE);
    if (embedded && !draft.email) {
      draft.email = embedded[0].toLowerCase();
      cell = cell
        .replace(embedded[0], "")
        .replace(/[<>()"]/g, "")
        .trim();
      if (!cell) continue;
    }
    const date = parseDate(cell);
    if (date) {
      draft.join_date = date;
      continue;
    }
    if (/^[0-4]$/.test(cell)) {
      draft.stripes = Number(cell);
      continue;
    }
    if (PHONE_RE.test(cell) && /\d{6,}/.test(cell.replace(/\D/g, ""))) {
      draft.phone = cell;
      continue;
    }
    const belt = parseBelt(cell);
    if (belt) {
      beltCells.push(cell);
      continue;
    }
    const plan = parsePlan(cell);
    if (plan && /comp|casual|monthly|month/i.test(cell)) {
      draft.membership_plan = plan;
      continue;
    }
    nameParts.push(cell);
  }
  // Two belt-looking cells next to a lone first name ("Aoife, Brown, blue")
  // means the first one is a surname, not a rank.
  if (nameParts.length === 1 && beltCells.length >= 2) {
    nameParts.push(beltCells.shift()!);
  }
  const beltCell = beltCells[beltCells.length - 1];
  if (beltCell) {
    const belt = parseBelt(beltCell)!;
    draft.belt = belt.belt;
    if (belt.stripes !== null) draft.stripes = belt.stripes;
  }
  if (nameParts.length >= 2) {
    draft.first_name = nameParts[0]!;
    draft.last_name = nameParts.slice(1).join(" ");
  } else if (nameParts.length === 1) {
    Object.assign(draft, splitName(nameParts[0]!));
  }
  return draft;
}

/**
 * Parses pasted text or CSV content into drafts. Blank lines are skipped.
 * If the first row looks like a header (any cell matches a known column
 * name), columns are mapped by header; otherwise each cell is classified by
 * its shape (email, date, phone, belt, …), so a plain
 * "Aoife Byrne, aoife@x.ie, blue 2" list works with no setup.
 */
export function parseRoster(text: string): RosterDraft[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const delimiter = detectDelimiter(lines);
  const rows = lines.map((l) => splitLine(l, delimiter));

  const headerFields = rows[0]!.map((c) => {
    const key = normaliseHeader(c);
    // Own keys only — a header literally called "constructor" mustn't
    // resolve to Object.prototype members.
    return Object.prototype.hasOwnProperty.call(HEADER_ALIASES, key) ? HEADER_ALIASES[key]! : null;
  });
  const hasHeader = headerFields.some((f) => f !== null);

  if (!hasHeader) return rows.map(guessRow);

  return rows.slice(1).map((cells) => {
    const draft: RosterDraft = { ...EMPTY_DRAFT };
    cells.forEach((cell, i) => {
      const field = headerFields[i];
      if (field) applyField(draft, field, cell);
    });
    return draft;
  });
}
