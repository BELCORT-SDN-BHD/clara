"use client";

// THE JOURNAL-ENTRY STATE LEGEND (CB-AE2E-021 part D).
//
// The defect it closes: the tab said "Posted" and every row inside it said
// "Approved" for the same DB fact, and nothing on screen ever said the two
// were one state. `approved` is the DB's word — the status domain is a closed
// three-value CHECK, `status in ('draft','approved','withdrawn')`
// (packages/db/migrations/0007_document_pipeline.sql:1012-1014, replacing
// 0003:105's two-value original); there is no 'posted' status anywhere in the
// catalog. "Posted" is the accountant's word and is now the ONE label for that
// state (messages/en.json JournalsWorkbench.status.approved). The DB value is
// untouched: entry-status-badge.tsx keys on the status VALUE and only picks a
// label, so nothing about this is a re-spelling of a stored fact.
//
// EVERY REAL STATUS IS LISTED, from that CHECK and nothing else — this
// component enumerates the DOMAIN, not the statuses that happen to be on
// screen, so a reader learns the whole machine rather than the part of it
// their current filter admits.
//
// The transitions are each provable: draft -> approved is approve_entry /
// approve_routine_entry; draft -> withdrawn is withdraw_draft (reason
// required); approved -> a NEW mirror entry is reverse_entry, with the
// original gaining `reversed_by` and nothing ever deleted (LAW 6, the note
// posted-panel.tsx has carried since P3). The RBAC line is 裁-187/ADR-0078:
// bookkeeper and above approve and post any amount, own drafts included, and
// the receipt — not a wall — is what makes it accountable afterwards.

import { useTranslations } from "next-intl";

import { ENTRY_STATUS_DOMAIN } from "@/lib/journals/entries-table";
import { EntryStatusBadge } from "@/components/journals/entry-status-badge";

export function JournalStatusLegend() {
  const t = useTranslations("JournalsWorkbench.legend");
  return (
    <details className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
      {/* No ring class: a bare <summary> takes the GLOBAL `:focus-visible`
          outline (app/globals.css), which is the documented net for anything
          that is not a primitive — the same treatment the product's other
          <details> disclosure already has (components/firm/firm-question-row.tsx:88).
          The shadcn ring is the idiom for BUTTONS; adding a thirteenth carrier
          for a disclosure triangle would be drift, not consistency. */}
      <summary className="cursor-pointer text-muted-foreground">{t("summary")}</summary>
      <ul className="mt-2 flex flex-col gap-1.5">
        {ENTRY_STATUS_DOMAIN.map((status) => (
          <li key={status} className="flex flex-wrap items-baseline gap-2">
            <EntryStatusBadge status={status} />
            <span className="text-muted-foreground">{t(status)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">{t("rbac")}</p>
    </details>
  );
}
