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
import { FormattedDate } from "./formatted-date";
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

  return (
    <div className="flex flex-col gap-4 border-t border-border pt-2">
      <DocDiffSection docDiff={data.docDiff} />
      <RevisionsSection entryDiff={data.entryDiff} />
    </div>
  );
}

function DocDiffSection({ docDiff }: { docDiff: DocEntryDiffResult | null }) {
  const t = useTranslations("DraftsDocumentGovernance.entryDiff");
  return (
    <section className="flex flex-col gap-1">
      <SectionHeader level={4}>{t("docDiffHeading")}</SectionHeader>
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

function RevisionsSection({ entryDiff }: { entryDiff: EntryDiffResult }) {
  const t = useTranslations("DraftsDocumentGovernance.entryDiff");
  if (entryDiff.revisions.length === 0) {
    return (
      <section className="flex flex-col gap-1">
        <SectionHeader level={4}>{t("revisionsHeading")}</SectionHeader>
        <p className="text-sm text-muted-foreground">{t("revisionsEmpty")}</p>
      </section>
    );
  }
  return (
    <section className="flex flex-col gap-2">
      <SectionHeader level={4}>{t("revisionsHeading")}</SectionHeader>
      <ul className="flex flex-col gap-2">
        {entryDiff.revisions.map((rev) => (
          <li key={rev.revision_no} className="rounded-md border border-border p-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-foreground">{t("revisionNo", { n: rev.revision_no })}</span>
              <span className="text-xs text-muted-foreground"><FormattedDate value={rev.created_at} /></span>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("revisionBy", { actor: rev.actor ?? t("revisionActorUnknown") })}
              {rev.reason ? ` — ${rev.reason}` : ""}
            </p>
            {rev.deltas_vs_prev.length > 0 && (
              <ul className="mt-1 flex flex-col gap-0.5">
                {rev.deltas_vs_prev.map((d, i) => (
                  <li key={`${rev.revision_no}-${d.field}-${i}`} className="text-xs text-foreground">
                    {d.field}: {String(d.before ?? "—")} → {String(d.after ?? "—")}
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
