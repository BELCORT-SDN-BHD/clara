"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common/state";
import type { JournalEntryRow } from "@/lib/documents/types";

/**
 * Journal entries citing this document (lib/documents/reads.ts's
 * `listEntriesForDocument` — a direct `journal_entries` read; no view or RPC
 * exposes "entries for a document" as a named surface, so this is the workbench's
 * own first-party read). Status/origin are DB-named, rendered verbatim; the UI
 * sums/computes nothing.
 */
export function DocumentEntries({ entries }: { entries: JournalEntryRow[] }) {
  const t = useTranslations("ClientDocuments");

  if (entries.length === 0) {
    return <EmptyState>{t("entriesEmpty")}</EmptyState>;
  }

  return (
    <ul className="flex flex-col gap-1">
      {entries.map((entry) => (
        <li key={entry.id} className="flex items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-2">
            <Badge variant={entry.status === "approved" ? "secondary" : "outline"}>{entry.status}</Badge>
            <span className="text-muted-foreground">{entry.posting_date}</span>
            {entry.memo ? <span className="truncate text-foreground">{entry.memo}</span> : null}
          </span>
          <span className="text-xs text-muted-foreground">
            {entry.origin}
            {entry.reversed_by ? ` · ${t("entryReversed")}` : ""}
            {entry.reversal_of ? ` · ${t("entryIsReversal")}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}
