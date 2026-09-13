"use client";

// The client Knowledge register — C13's list half (#644, migration
// 0192_client_knowledge_records.sql).
//
// WHAT CHANGED, AND WHY THE OLD PANEL COULD NOT STAY. The previous version read
// `clara.client_facts` directly and grouped it by `fact_key`: five global keys,
// one flat shape, no kind, no scope, no trust, no applicability, and no way to
// correct anything. #644 asks for a register that distinguishes a user
// assertion from an extracted fact, a preference and a policy; that shows whose
// statement it is and how far it is verified; that shows what it applies to and
// when; and that offers a correction and a withdrawal. That is a different
// surface, not a bigger version of the old one.
//
// ONE REGISTER, TWO SOURCES. `clara.list_client_knowledge` UNIONs the legacy
// `client_facts` rows in with `source_kind='legacy_client_fact'` and
// `editable:false` — so a firm that recorded facts before 0192 sees them here,
// beside the new records, with no control the database has no door for.
//
// THE FOUR FACES this surface owes (#644 AC5), each from a DIFFERENT fact:
//   successful empty   — the read SUCCEEDED and returned no records. `DataState`'s
//                        EmptyState, never a caught error mapped to [].
//   no results         — the read returned records and the CATEGORY FILTER hid
//                        them all. Its own state, keeping the filter and offering
//                        to clear it (appendix C: "No results preserves the
//                        user's query/filter and offers Clear filters").
//   contradictory      — TWO live records of one key with different applicability.
//                        Both are rendered, under a conflict alert; the surface
//                        never picks one.
//   failed read        — `DataState`'s ErrorMessage, which distinguishes signed
//                        out / forbidden / not found / failed by the error's
//                        typed kind, never by its message text.
// The fifth — an inaccessible SOURCE — belongs to the row, and lives in
// `KnowledgeSourceBlock` (knowledge-shared.tsx).

import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataState } from "@/components/firm/data-state";
import { EmptyState, StateBanner } from "@/components/common/state";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { loadClientKnowledge, type KnowledgeRecordRow } from "@/lib/registers/knowledge";
import {
  KnowledgeApplicability,
  KnowledgeBadges,
  KnowledgeProvenance,
  KnowledgeSourceBlock,
  knowledgeValueText,
} from "./knowledge-shared";

const KINDS = ["assertion", "extracted_fact", "preference", "policy"] as const;
const ALL = "all";

/** Group by key so a contradiction (two LIVE rows of one key, differing only in
 *  applicability — `uq_knowledge_live` makes an identical pair impossible) is a
 *  property of the group rather than something the reader must spot. */
function groupByKey(rows: KnowledgeRecordRow[]): [string, KnowledgeRecordRow[]][] {
  const groups = new Map<string, KnowledgeRecordRow[]>();
  for (const row of rows) {
    const list = groups.get(row.knowledge_key) ?? [];
    list.push(row);
    groups.set(row.knowledge_key, list);
  }
  return [...groups.entries()];
}

export function KnowledgePanel({ clientId }: { clientId: string }) {
  const t = useTranslations("ClientKnowledge");
  const [kind, setKind] = useState<string>(ALL);
  const knowledge = useAsyncRead(() => loadClientKnowledge(clientId, { session: sessionTokenAccessor }));

  const all = knowledge.data?.records ?? [];
  const shown = kind === ALL ? all : all.filter((r) => r.kind === kind);
  const groups = groupByKey(shown);
  // FILTERED-TO-NOTHING IS NOT EMPTY. `isEmpty` is about the READ; a filter that
  // hides everything gets its own state below, with the filter intact.
  const readIsEmpty = all.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground" id="knowledge-filter-label">{t("filterLabel")}</span>
          <Select value={kind} onValueChange={(v) => setKind(v ?? ALL)}>
            <SelectTrigger aria-label={t("filterLabel")}><SelectValue placeholder={t("filterAll")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("filterAll")}</SelectItem>
              {KINDS.map((k) => (
                <SelectItem key={k} value={k}>{t(`kind.${k}` as "kind.assertion")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {knowledge.data ? (
          <p className="text-xs text-muted-foreground">
            {t("versionLabel", { version: String(knowledge.data.knowledge_version ?? 0) })}
          </p>
        ) : null}
      </div>

      <DataState
        loading={knowledge.loading}
        error={knowledge.error}
        isEmpty={readIsEmpty}
        emptyMessage={t("empty")}
      >
        {groups.length === 0 ? (
          <EmptyState>
            <span className="flex flex-col items-start gap-2">
              <span>{t("emptyFiltered")}</span>
              <Button variant="outline" size="xs" onClick={() => setKind(ALL)}>{t("clearFilter")}</Button>
            </span>
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-3">
            {groups.map(([key, rows]) => (
              <KnowledgeGroup key={key} clientId={clientId} knowledgeKey={key} rows={rows} />
            ))}
          </ul>
        )}
      </DataState>
    </div>
  );
}

function KnowledgeGroup({ clientId, knowledgeKey, rows }: {
  clientId: string;
  knowledgeKey: string;
  rows: KnowledgeRecordRow[];
}) {
  const t = useTranslations("ClientKnowledge");
  const live = rows.filter((r) => r.state === "live");
  // THE CONFLICT FACE. Two live records of one key contradict each other unless a
  // reader can tell which applies — and 0192 guarantees they differ in exactly
  // that (`uq_knowledge_live` is over the applicability digest). So the surface
  // shows BOTH, says they conflict, and picks neither.
  const conflicted = live.length > 1;

  return (
    <li className="enter-content flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium text-card-foreground">{knowledgeKey}</span>
        {rows[0]?.key_description ? (
          <span className="text-xs text-muted-foreground">{rows[0].key_description}</span>
        ) : null}
      </div>
      {conflicted ? (
        <StateBanner tone="warning" title={t("conflictTitle")}>
          {t("conflictBody", { count: live.length, key: knowledgeKey })}
        </StateBanner>
      ) : null}
      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <KnowledgeRow key={row.revision_id} clientId={clientId} row={row} />
        ))}
      </ul>
    </li>
  );
}

function KnowledgeRow({ clientId, row }: { clientId: string; row: KnowledgeRecordRow }) {
  const t = useTranslations("ClientKnowledge");
  return (
    <li className="flex flex-col gap-2 border-t border-border pt-2 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-card-foreground">{knowledgeValueText(row.value)}</span>
        <KnowledgeBadges record={row} />
        {row.state === "withdrawn" ? (
          <span className="text-xs text-muted-foreground">{t("withdrawnNotice")}</span>
        ) : null}
      </div>
      <KnowledgeApplicability record={row} />
      <KnowledgeProvenance record={row} />
      <KnowledgeSourceBlock clientId={clientId} source={row.source} sourceKind={row.source_kind} />
      {row.editable ? (
        <Link
          className="w-fit text-xs underline underline-offset-4"
          href={`/clients/${clientId}/knowledge/${row.record_id}`}
        >
          {t("openRecord")}
        </Link>
      ) : (
        // A LEGACY fact has no correction door (0055 supersedes by recording a new
        // value through its own admin door), so this surface offers no detail
        // route for it and says why rather than rendering a dead link.
        <span className="text-xs text-muted-foreground">{t("legacyNote")}</span>
      )}
    </li>
  );
}
