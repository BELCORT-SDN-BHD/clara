"use client";

// #635 / #960 — THE FIRM'S PROCESSING CAPS, READ **AND** SET.
//
// THIS CARD SITTING BEHIND ADMIN+ IS AN AFFORDANCE, NOT A WALL — and saying so out loud is the
// point of this comment (`lib/firm/capabilities.ts:19-23`'s own idiom). The numbers come from
// `clara.firm_document_limits`, which every member of the firm may already SELECT directly
// (0007:810-811, :2742-2744 — a written, reviewed grant). They arrive here on
// `clara.get_firm_commercial_state`'s `capacity` object, which IS admin-floored, purely because
// they belong beside the plan on a commercial card and because a second read of the same numbers
// would be a second answer free to disagree with the first. A viewer who reads that relation
// another way is not doing anything the estate forbids, and nothing in #635 narrows that grant:
// migration 0233 asserts it unmoved in both directions, and #960's 0270 asserts the same matrix
// again, in both directions, in its own prestate and tail.
//
// THERE IS NOW A CONTROL, AND THE OWNER RULED WHOSE IT IS. #635 shipped this card read-only
// because `clara.firm_document_limits` had NO HUMAN WRITER anywhere in the estate (0196:36-40,
// whose header names #635 by number), and filed #960. The owner's ruling on that ticket
// (2026-09-20) is option C: the FIRM's own owner or admin sets all four caps, with no operator
// gate and no operator-side surface. Migration 0270 is that door.
//
// THE CONTROL RIDES THE SAME READ AS THE FIGURES, and that is deliberate: it renders when
// `view.status === "ready"`, i.e. when the admin-floored door answered, never off a rank this
// component read from the session. `clara.set_firm_document_limits` re-derives the floor for
// itself (`clara._human_ctx(clara.role_rank('admin'))`), so the wall is the database's, and a
// caller who reaches the door anyway meets its CLR04 rather than a hidden button.
//
// ONLY WHAT THE PERSON CHANGED IS SENT. The four fields are an OVERLAY on the read: a field the
// person never touched renders the stored number and contributes NO argument, so the relation's
// column-preserving trigger (0196) leaves that cap exactly as it is. Re-sending all four on
// every save would silently re-assert values another admin may have changed since this page
// read them. CLEARING a field is therefore "leave this one alone", not "unset it": there is no
// way to unset a cap, and there is no door that would.
//
// A MISSING ROW IS A NAMED ZERO, NOT A DEFAULT. On a firm with no `firm_document_limits` row the
// door answers NULLs, and this card says so — and its fields start EMPTY. It does NOT pre-fill
// the relation's first-insert values (100 / 1000 / 2 / 2): those are what a row would start at
// if somebody wrote one, not what this firm's caps are, and the enforcing doors coalesce to
// their own fallbacks anyway (0090:422-436). A number nobody stored is the same defect as a
// price nobody ruled.
//
// THE RECEIPT IS A REPORT, NOT THE TRUTH. `lib/doors.ts`'s hydrate-never-trust rule: the save's
// own answer is rendered as a receipt, and the FIGURES above it come from the parent's re-read
// of `clara.get_firm_commercial_state`. A refusal is rendered VERBATIM with its code — the
// ceiling refusal names the estate's number, and that sentence is the only place this build
// learns it.

import { useState } from "react";
import { useTranslations } from "next-intl";

import { SectionHeader } from "@/components/common/section-header";
import { StateBanner } from "@/components/common/state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PROCESSING_CAPS,
  type ProcessingCap,
  type ProcessingCapEdits,
  type SetProcessingCapsOutcome,
} from "@/lib/firm/capacity-doors";
import { formatInteger } from "@/lib/firm/commercial-format";
import type { FirmCommercialState } from "@/lib/firm/commercial-reads";
import type { FirmSettingsView } from "./firm-settings-view";

/** The field id and the label key for each cap. The ids are the door's own column names in
 *  kebab-case, so a walk can name a field by the cap it sets. */
const FIELD: Record<ProcessingCap, { readonly id: string; readonly label: string }> = {
  docsPerDay: { id: "firm-capacity-docs-per-day", label: "capacityDocsPerDay" },
  pagesPerDay: { id: "firm-capacity-pages-per-day", label: "capacityPagesPerDay" },
  ocrConcurrency: { id: "firm-capacity-ocr-concurrency", label: "capacityOcrConcurrency" },
  llmWitnessConcurrency: { id: "firm-capacity-llm-witness-concurrency", label: "capacityWitnessConcurrency" },
};

type Capacity = FirmCommercialState["capacity"];

export function ProcessingCapacityCard({
  view,
  save,
}: {
  readonly view: FirmSettingsView<FirmCommercialState>;
  /** The parent's door call. Absent means this mount has no writer wired — the card then
   *  renders exactly what it rendered before #960. */
  readonly save?: (edits: ProcessingCapEdits) => Promise<SetProcessingCapsOutcome>;
}) {
  const t = useTranslations("FirmSettings");
  const capacity: Capacity | null = view.status === "ready" ? view.data.capacity : null;
  const [typed, setTyped] = useState<Partial<Record<ProcessingCap, string>>>({});
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<SetProcessingCapsOutcome | null>(null);

  const stored = (cap: ProcessingCap): number | null => capacity?.[cap] ?? null;
  const shown = (cap: ProcessingCap): string => {
    const own = typed[cap];
    if (own !== undefined) return own;
    const value = stored(cap);
    return value === null ? "" : String(value);
  };

  // WHAT WOULD BE SENT, and whether every field can be read at all. An EMPTY field contributes
  // nothing (see the header: clearing is "leave this alone"); anything else must be a whole
  // number above zero, which mirrors the relation's own CHECKs — the door refuses the same
  // shapes with a typed CLR10, so this is a courtesy, never the wall.
  let malformed = false;
  const edits: ProcessingCapEdits = {};
  for (const cap of PROCESSING_CAPS) {
    const raw = shown(cap).trim();
    if (raw === "") continue;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed <= 0) { malformed = true; continue; }
    if (parsed !== stored(cap)) edits[cap] = parsed;
  }
  const pending = Object.keys(edits).length > 0;

  async function submit(): Promise<void> {
    if (save === undefined || !pending || malformed) return;
    setBusy(true);
    setOutcome(null);
    try {
      const answer = await save(edits);
      setOutcome(answer);
      // THE OVERLAY IS CLEARED ONLY BY AN ACCEPTED WRITE. After a refusal the person's own
      // numbers stay in the fields — the refusal tells them what to change, and snapping the
      // field back to the stored value would take away the thing they have to edit.
      if (answer.kind === "set") setTyped({});
    } finally {
      setBusy(false);
    }
  }

  const rows: readonly [string, number | null][] =
    capacity === null
      ? []
      : PROCESSING_CAPS.map((cap) => [t(FIELD[cap].label), stored(cap)] as [string, number | null]);
  const anyStored = rows.some(([, value]) => value !== null);

  return (
    <Card>
      <CardHeader>
        <SectionHeader level={2}>{t("capacityHeading")}</SectionHeader>
        <CardDescription className="text-xs">{t("capacitySubheading")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {view.status === "loading" ? <Skeleton className="h-20 w-full" /> : null}
        {capacity !== null && anyStored ? (
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            {rows.map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="font-medium">{value === null ? "—" : formatInteger(value)}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {capacity !== null && !anyStored ? (
          <p className="max-w-prose text-sm text-muted-foreground">{t("capacityNone")}</p>
        ) : null}

        {capacity !== null && save !== undefined ? (
          <div className="flex flex-col gap-3 border-t pt-3">
            {outcome?.kind === "set" ? (
              <StateBanner tone="info">
                {t("capacityReceipt", {
                  docs: formatInteger(outcome.caps.docsPerDay),
                  pages: formatInteger(outcome.caps.pagesPerDay),
                  ocr: formatInteger(outcome.caps.ocrConcurrency),
                  witness: formatInteger(outcome.caps.llmWitnessConcurrency),
                })}
              </StateBanner>
            ) : null}
            {outcome?.kind === "refused" ? (
              <StateBanner
                tone="warning"
                title={t("capacityRefusedTitle")}
                code={outcome.reason ? `${outcome.code} · ${outcome.reason}` : outcome.code}
              >
                {/* VERBATIM — never re-worded. The ceiling refusal names the estate's number. */}
                {outcome.message}
              </StateBanner>
            ) : null}
            {outcome?.kind === "unavailable" ? (
              <StateBanner tone="error">{t("capacityUnavailable")}</StateBanner>
            ) : null}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {PROCESSING_CAPS.map((cap) => (
                <div className="grid gap-1.5" key={cap}>
                  <Label htmlFor={FIELD[cap].id}>{t(FIELD[cap].label)}</Label>
                  <Input
                    id={FIELD[cap].id}
                    inputMode="numeric"
                    value={shown(cap)}
                    onChange={(e) => setTyped((prev) => ({ ...prev, [cap]: e.target.value }))}
                    aria-describedby="firm-capacity-hint"
                  />
                </div>
              ))}
            </div>
            <p id="firm-capacity-hint" className="max-w-prose text-xs text-muted-foreground">
              {malformed ? t("capacityFieldInvalid") : t("capacityEditHint")}
            </p>
            <div>
              <Button type="button" size="sm" disabled={busy || malformed || !pending}
                onClick={() => { void submit(); }}>
                {busy ? t("capacitySaving") : t("capacitySave")}
              </Button>
            </div>
          </div>
        ) : null}

        {capacity !== null ? (
          <>
            <p className="max-w-prose text-xs text-muted-foreground">{t("capacitySourceNote")}</p>
            <p className="max-w-prose text-xs text-muted-foreground">{t("capacitySeatsNote")}</p>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
