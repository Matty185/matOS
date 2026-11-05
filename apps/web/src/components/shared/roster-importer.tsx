"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Download, FileUp, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  createMemberSchema,
  parseRoster,
  EMPTY_DRAFT,
  MAX_IMPORT_ROWS,
  ROSTER_CSV_TEMPLATE,
  type RosterDraft,
} from "@matos/shared";
import { ALL_BELTS, BELT_LABELS, BeltDisplay } from "@/components/shared/belt-display";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type DraftRow = RosterDraft & { key: number };
type RowErrors = Partial<Record<keyof RosterDraft, string>>;

const PASTE_PLACEHOLDER = `Aoife Byrne, aoife@example.com, blue 2
Liam Walsh, liam@example.com, purple, 087 123 4567
Ciara O'Brien, ciara@example.com, white`;

let nextKey = 1;
const withKeys = (drafts: RosterDraft[]): DraftRow[] =>
  drafts.map((d) => ({ ...d, key: nextKey++ }));

function validate(row: RosterDraft, duplicateOf: number | null): RowErrors {
  const errors: RowErrors = {};
  const parsed = createMemberSchema.safeParse(row);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof RosterDraft | undefined;
      if (field && !errors[field]) errors[field] = issue.message;
    }
  }
  if (!errors.email && duplicateOf !== null) errors.email = `Same email as row ${duplicateOf + 1}.`;
  return errors;
}

/**
 * Stage O3: get a whole roster in at once. Paste anything (a WhatsApp list,
 * a copied spreadsheet) or upload a CSV, then fix flagged cells in place.
 * Nothing is saved until "Import" — and then all-or-nothing.
 */
export function RosterImporter({
  onImported,
  onUnsavedChange,
}: {
  onImported: (count: number) => void;
  /** Number of previewed-but-not-imported rows (0 when nothing to lose). */
  onUnsavedChange?: (rows: number) => void;
}) {
  const [rows, setRows] = useState<DraftRow[] | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [serverDuplicateRows, setServerDuplicateRows] = useState<Set<number>>(new Set());
  const fileInput = useRef<HTMLInputElement>(null);

  const errorsByRow = useMemo(() => {
    if (!rows) return [];
    const firstIndex = new Map<string, number>();
    return rows.map((row, i) => {
      const email = row.email.trim().toLowerCase();
      const prev = email ? firstIndex.get(email) : undefined;
      if (email && prev === undefined) firstIndex.set(email, i);
      const errors = validate(row, prev ?? null);
      if (!errors.email && serverDuplicateRows.has(i + 1)) {
        errors.email = "Already a member of your academy.";
      }
      return errors;
    });
  }, [rows, serverDuplicateRows]);

  useEffect(() => {
    onUnsavedChange?.(rows?.length ?? 0);
  }, [rows, onUnsavedChange]);

  const invalidCount = errorsByRow.filter((e) => Object.keys(e).length > 0).length;
  const validCount = (rows?.length ?? 0) - invalidCount;

  function loadDrafts(drafts: RosterDraft[]) {
    if (drafts.length === 0) {
      toast.error("Couldn't find anyone in that — check there's one person per line.");
      return;
    }
    if (drafts.length > MAX_IMPORT_ROWS) {
      toast.error(`That's ${drafts.length} people — import at most ${MAX_IMPORT_ROWS} at a time.`);
      return;
    }
    setServerDuplicateRows(new Set());
    setRows(withKeys(drafts));
  }

  async function handleFile(file: File) {
    if (file.size > 1_000_000) {
      toast.error("That file is too big for a roster — is it the right one?");
      return;
    }
    loadDrafts(parseRoster(await file.text()));
  }

  function downloadTemplate() {
    const blob = new Blob([ROSTER_CSV_TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "matos-roster-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function updateRow(key: number, patch: Partial<RosterDraft>) {
    setServerDuplicateRows(new Set());
    setRows((prev) => prev?.map((r) => (r.key === key ? { ...r, ...patch } : r)) ?? null);
  }

  function removeRow(key: number) {
    setServerDuplicateRows(new Set());
    setRows((prev) => prev?.filter((r) => r.key !== key) ?? null);
  }

  async function handleImport() {
    if (!rows || rows.length === 0 || invalidCount > 0) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/members/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          members: rows.map((r) => ({
            first_name: r.first_name,
            last_name: r.last_name,
            email: r.email,
            phone: r.phone,
            belt: r.belt,
            stripes: r.stripes,
            join_date: r.join_date,
            membership_plan: r.membership_plan,
          })),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        if (Array.isArray(body.rows)) setServerDuplicateRows(new Set(body.rows as number[]));
        toast.error(body.error ?? "Couldn't import — nothing was saved.");
        return;
      }
      // Saved — nothing left to lose.
      setRows(null);
      setPasteText("");
      onImported(body.imported as number);
    } catch {
      toast.error("Couldn't import — check your connection. Nothing was saved.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!rows) {
    return (
      <Tabs defaultValue="paste" className="flex flex-col gap-4">
        <TabsList className="grid h-11 w-full grid-cols-2 sm:w-80">
          <TabsTrigger value="paste" className="h-9">
            Paste a list
          </TabsTrigger>
          <TabsTrigger value="csv" className="h-9">
            Upload CSV
          </TabsTrigger>
        </TabsList>

        <TabsContent value="paste" className="flex flex-col gap-3">
          <Label htmlFor="roster-paste">
            One person per line — name, email, and belt if you have it. Kids without an email can be
            added without one (no login).
          </Label>
          <Textarea
            id="roster-paste"
            rows={8}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={PASTE_PLACEHOLDER}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Copying from Google Sheets or Excel works too — include the header row. You&apos;ll
            check everything before it&apos;s saved.
          </p>
          <Button
            className="h-11 self-start"
            onClick={() => loadDrafts(parseRoster(pasteText))}
            disabled={!pasteText.trim()}
          >
            Review list
          </Button>
        </TabsContent>

        <TabsContent value="csv" className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Columns can be in any order: name (or first/last name), email, phone, belt, stripes,
            joined, plan.
          </p>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,.tsv,.txt,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = "";
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button className="h-11" onClick={() => fileInput.current?.click()}>
              <FileUp className="mr-2 h-4 w-4" /> Choose CSV file
            </Button>
            <Button variant="outline" className="h-11" onClick={downloadTemplate}>
              <Download className="mr-2 h-4 w-4" /> Download template
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"
        role="status"
        aria-live="polite"
      >
        <span className="flex items-center gap-1.5">
          <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
          {validCount} ready
        </span>
        {invalidCount > 0 ? (
          <span className="flex items-center gap-1.5 text-destructive">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            {invalidCount} need{invalidCount === 1 ? "s" : ""} a fix
          </span>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          No one left in the list. Add a row, or start over with a new list.
        </p>
      ) : null}

      <ol className="flex flex-col gap-3">
        {rows.map((row, i) => {
          const errors = errorsByRow[i] ?? {};
          const hasErrors = Object.keys(errors).length > 0;
          return (
            <li
              key={row.key}
              className={`rounded-md border p-3 ${hasErrors ? "border-destructive/60 bg-destructive/5" : ""}`}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  Row {i + 1}
                  <BeltDisplay belt={row.belt} stripes={row.stripes} size="sm" />
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-11 w-11"
                  onClick={() => removeRow(row.key)}
                  aria-label={`Remove row ${i + 1}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-[1fr_1fr_1.6fr_9rem_5rem_9.5rem]">
                <Field label="First name" error={errors.first_name}>
                  <Input
                    className="h-11"
                    value={row.first_name}
                    onChange={(e) => updateRow(row.key, { first_name: e.target.value })}
                    aria-invalid={Boolean(errors.first_name)}
                  />
                </Field>
                <Field label="Last name" error={errors.last_name}>
                  <Input
                    className="h-11"
                    value={row.last_name}
                    onChange={(e) => updateRow(row.key, { last_name: e.target.value })}
                    aria-invalid={Boolean(errors.last_name)}
                  />
                </Field>
                <Field label="Email" error={errors.email} className="col-span-2 md:col-span-1">
                  <Input
                    className="h-11"
                    type="email"
                    placeholder="Optional for kids"
                    value={row.email}
                    onChange={(e) => updateRow(row.key, { email: e.target.value })}
                    aria-invalid={Boolean(errors.email)}
                  />
                </Field>
                <Field label="Belt" error={errors.belt}>
                  <Select
                    value={row.belt}
                    onValueChange={(v) => updateRow(row.key, { belt: v as RosterDraft["belt"] })}
                  >
                    <SelectTrigger className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ALL_BELTS.map((b) => (
                        <SelectItem key={b} value={b}>
                          {BELT_LABELS[b]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Stripes" error={errors.stripes}>
                  <Select
                    value={String(row.stripes)}
                    onValueChange={(v) => updateRow(row.key, { stripes: Number(v) })}
                  >
                    <SelectTrigger className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[0, 1, 2, 3, 4].map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {String(n)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Joined" error={errors.join_date} className="col-span-2 md:col-span-1">
                  <Input
                    className="h-11"
                    type="date"
                    value={row.join_date}
                    onChange={(e) => updateRow(row.key, { join_date: e.target.value })}
                    aria-invalid={Boolean(errors.join_date)}
                  />
                </Field>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          className="h-11"
          onClick={() => setRows((prev) => [...(prev ?? []), ...withKeys([{ ...EMPTY_DRAFT }])])}
          disabled={rows.length >= MAX_IMPORT_ROWS}
        >
          <Plus className="mr-2 h-4 w-4" /> Add a row
        </Button>
        <Button variant="ghost" className="h-11" onClick={() => setRows(null)}>
          Start over
        </Button>
      </div>

      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t bg-background p-4 sm:flex-row sm:items-center sm:justify-between md:-mx-8 md:px-8">
        <p className="text-sm text-muted-foreground">
          {invalidCount > 0
            ? "Fix the highlighted rows (or remove them) to import."
            : "Nobody is invited yet — you'll choose that next."}
        </p>
        <Button
          className="h-11"
          onClick={handleImport}
          disabled={submitting || invalidCount > 0 || rows.length === 0}
        >
          {submitting
            ? "Importing..."
            : `Import ${validCount} member${validCount === 1 ? "" : "s"}`}
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  error,
  className,
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex min-w-0 flex-col gap-1 ${className ?? ""}`}>
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </label>
  );
}
