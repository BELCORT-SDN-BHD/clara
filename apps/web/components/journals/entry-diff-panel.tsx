"use client";

// T6 (port-wave plan §4/§5) — "the diff IS the decision": the DOCUMENT-vs-
// ENTRY field comparison (clara.get_doc_entry_diff) and the entry's own
// REVISION HISTORY (clara.get_entry_diff), read-only, own hydration cycle
// (lib/journals/diff-reads.ts). Callers MUST `key` this by `entryId`
// (lib/parts/hooks.ts's consumer contract — see DocumentDetail's own
// precedent) since it is mounted per-entry inside an expanded draft row.

import { useHydratedPart } from "@/lib/parts/hooks";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { getDocEntryDiff, getEntryDiff } from "@/lib/journals/diff-reads";
import { useTranslations } from "next-intl";
import { LoadingState, StateBanner } from "@/components/common/state";
import { SectionHeader } from "@/components/common/section-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FormattedDateTime } from "./formatted-date";
import type { DocEntryDiffResult, EntryDiffResult } from "@/lib/journals/types";

type Bundle = { entryDiff: EntryDiffResult; docDiff: DocEntryDiffResult | null };

export function EntryDiffPanel({ entryId, clientId }: { entryId: string; clientId: string }) {
  const t = useTranslations("DraftsDocumentGovernance.entryDiff");
  const { data, loading, err, clr } = useHydratedPart<Bundle>(sessionTokenAccessor, async (session) => {
    const [entryDiff, docDiff] = await Promise.all([
      getEntryDiff(entryId, clientId, { session }),
      getDocEntryDiff(entryId, clientId, { session }),
    ]);
    return { entryDiff, docDiff };
  });

  if (loading && !data) return <LoadingState>{t("loading")}</LoadingState>;
  if (!data) {
    return err ? <StateBanner tone="error" code={clr ? clr.code : undefined}>{err}</StateBanner> : null;
  }

  return <EntryDiffContent entryDiff={data.entryDiff} docDiff={data.docDiff} />;
}

/** The pure, fixed-prop presentational body — split out from the self-
 *  fetching wrapper above so an a11y scan can mount it directly with fixture
 *  data, the SAME pattern documents-a11y.test.tsx already uses for
 *  DocumentMetadata/DocumentEvidence/DocumentEntries (fixed props, no fetch
 *  mock needed) rather than driving the parent's own hydration cycle. */
export function EntryDiffContent({ entryDiff, docDiff }: { entryDiff: EntryDiffResult; docDiff: DocEntryDiffResult | null }) {
  return (
    <div className="flex flex-col gap-4 border-t border-border pt-2">
      <DocDiffSection docDiff={docDiff} />
      <RevisionsSection entryDiff={entryDiff} />
    </div>
  );
}

function DocDiffSection({ docDiff }: { docDiff: DocEntryDiffResult | null }) {
  const t = useTranslations("DraftsDocumentGovernance.entryDiff");
  return (
    <section className="flex flex-col gap-1">
      <SectionHeader level={2}>{t("docDiffHeading")}</SectionHeader>
      {docDiff === null ? (
        <p className="text-sm text-muted-foreground">{t("noSourceDocument")}</p>
      ) : docDiff.fields.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("docDiffEmpty")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("field")}</TableHead>
              <TableHead>{t("docValue")}</TableHead>
              <TableHead>{t("entryValue")}</TableHead>
              <TableHead className="text-right">{t("deltaCents")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {docDiff.fields.map((f) => (
              <TableRow key={f.field}>
                <TableCell>{f.field}</TableCell>
                <TableCell className={f.no_region ? "text-muted-foreground" : undefined}>
                  {f.no_region ? t("noRegion") : (f.doc_value ?? "—")}
                </TableCell>
                <TableCell>{f.entry_value ?? "—"}</TableCell>
                <TableCell className="text-right">
                  {f.delta_cents === null ? "—" : (f.delta_cents / 100).toFixed(2)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

/**
 * ONE side of a revision delta, rendered honestly.
 *
 * `EntryDiffDelta.before`/`.after` are `unknown` — the DB builds them from a
 * revision's own header snapshot (clara.get_entry_diff, live body
 * 0011_daily_loop.sql:3652-3657), so a scalar field yields a scalar and a
 * jsonb field yields an object. The previous cut did `String(d.before ?? "—")`,
 * which renders every object as the literal `[object Object]`. That was
 * reachable in production, not theoretical: `journal_entries.flags` is
 * `jsonb NOT NULL default '{}'` with a `jsonb_typeof(flags) = 'object'` CHECK
 * (0009_coding_floor.sql:851-852) — so it is ALWAYS an object, the `?? "—"`
 * guard could never fire for it, and every `flags` delta printed
 * `[object Object] → [object Object]`, the one shape that tells a reviewer
 * nothing at all about what changed.
 *
 * Scalars pass through. `null`/`undefined` become the product's own "none".
 * An object or array becomes a `<details>` disclosure over the pretty-printed
 * JSON — the idiom components/firm/firm-question-row.tsx:88-91 already uses
 * for an opaque agent-authored payload, so a reader meets ONE shape for
 * "structured value you may open", not two.
 */
function DeltaValue({ value }: { value: unknown }) {
  const t = useTranslations("DraftsDocumentGovernance.entryDiff");
  if (value === null || value === undefined) return <span className="text-muted-foreground">{t("valueNone")}</span>;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return <>{String(value)}</>;
  }
  const kind = Array.isArray(value) ? "array" : typeof value;
  return (
    <details className="inline-block align-top">
      {/* Bare <summary>: the global `:focus-visible` outline, matching
          components/firm/firm-question-row.tsx:88's identical disclosure. */}
      <summary className="cursor-pointer text-muted-foreground">{t("valueDetails", { kind })}</summary>
      <pre className="mt-1 max-w-full overflow-x-auto rounded-md bg-muted p-2 wrap-anywhere whitespace-pre-wrap">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

function RevisionsSection({ entryDiff }: { entryDiff: EntryDiffResult }) {
  const t = useTranslations("DraftsDocumentGovernance.entryDiff");
  if (entryDiff.revisions.length === 0) {
    return (
      <section className="flex flex-col gap-1">
        <SectionHeader level={2}>{t("revisionsHeading")}</SectionHeader>
        <p className="text-sm text-muted-foreground">{t("revisionsEmpty")}</p>
      </section>
    );
  }
  return (
    <section className="flex flex-col gap-2">
      <SectionHeader level={2}>{t("revisionsHeading")}</SectionHeader>
      <ul className="flex flex-col gap-2">
        {entryDiff.revisions.map((rev) => (
          <li key={rev.revision_no} className="rounded-md border border-border p-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-foreground">{t("revisionNo", { n: rev.revision_no })}</span>
              {/* `journal_entry_revisions.created_at` is an INSTANT, not a
                  calendar date — two revisions made the same afternoon read as
                  the same day under <FormattedDate>, which is the surface a
                  reader uses to tell them apart. Same class as the H-32
                  expiry, same fix. */}
              <span className="text-xs text-muted-foreground"><FormattedDateTime value={rev.created_at} /></span>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("revisionBy", { actor: rev.actor ?? t("revisionActorUnknown") })}
              {rev.reason ? ` — ${rev.reason}` : ""}
            </p>
            {rev.deltas_vs_prev.length > 0 && (
              <ul className="mt-1 flex flex-col gap-0.5">
                {rev.deltas_vs_prev.map((d, i) => (
                  <li key={`${rev.revision_no}-${d.field}-${i}`} className="text-xs text-foreground">
                    {d.field}: <DeltaValue value={d.before} /> → <DeltaValue value={d.after} />
                    {d.delta_cents !== null ? ` (${d.delta_cents >= 0 ? "+" : ""}${(d.delta_cents / 100).toFixed(2)})` : ""}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
