"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { DataTableCard } from "@/components/common/data-table-card";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { extractionStatusKey, filingBasisKey, isEInvoice } from "@/lib/documents/copy";
import type { FiledDocumentEntry } from "@/lib/documents/loaders";
import { EmptyState } from "@/components/common/state";
import { cn } from "@/lib/utils";

/**
 * The filed-documents list — this client's active filings, newest first
 * (loaders.ts's `loadFiledDocuments`). Every column names a REAL DB-owned state
 * (extraction_status, basis) — never a fabricated summary.
 */
export function FiledDocumentList({
  entries, selectedId, onSelect,
}: {
  entries: FiledDocumentEntry[];
  selectedId: string | null;
  onSelect: (documentId: string) => void;
}) {
  const t = useTranslations("ClientDocuments");

  if (entries.length === 0) {
    return <EmptyState>{t("filedEmpty")}</EmptyState>;
  }

  return (
    <DataTableCard>
      <TableHeader>
        <TableRow>
          <TableHead>{t("colFile")}</TableHead>
          <TableHead>{t("colStatus")}</TableHead>
          <TableHead>{t("colFiled")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map(({ filing, document }) => (
          <TableRow
            key={filing.id}
            role="button"
            tabIndex={0}
            aria-selected={selectedId === document.id}
            onClick={() => onSelect(document.id)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect(document.id); }}
            className={cn("cursor-pointer", selectedId === document.id && "bg-muted")}
          >
            <TableCell className="max-w-64 truncate font-medium text-foreground">
              {document.original_filename ?? document.id}
            </TableCell>
            <TableCell className="text-muted-foreground">
              <span className="flex flex-wrap items-center gap-1">
                {t(extractionStatusKey(document.extraction_status))}
                {document.legal_hold && <Badge variant="destructive">{t("legalHold")}</Badge>}
                {isEInvoice(document) && <Badge variant="outline">{t("eInvoiceBadge")}</Badge>}
              </span>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {new Date(filing.filed_at).toLocaleDateString()} · {t(filingBasisKey(filing.basis))}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </DataTableCard>
  );
}
