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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataState } from "@/components/firm/data-state";
import { EmptyState, StateBanner } from "@/components/common/state";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { knowledgeRecordHref } from "@/lib/navigation/tree";
import { businessToday } from "@/lib/business-date";
import { loadClientKnowledge, type KnowledgeRecordRow } from "@/lib/registers/knowledge";
import {
  KnowledgeApplicability,
  KnowledgeBadges,
  KnowledgeProvenance,
  KnowledgeSourceBlock,
  knowledgeValueText,
} from "./knowledge-shared";
import { KnowledgeExceptionPair } from "./knowledge-exception";

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

/** Is this record in effect on `asOf`? The two window ends come from fields
 *  `clara.list_client_knowledge` ALREADY returns (`_knowledge_row_json`, 0192:1013-1036), so the
 *  mark needs no new door, no recut and no human grant on any pack (#783). An open end means
 *  "no bound that way", never "unknown". */
export function isInEffectOn(
  record: { effective_from: string | null; effective_to: string | null },
  asOf: string,
): boolean {
  if (record.effective_from !== null && record.effective_from > asOf) return false;
  if (record.effective_to !== null && record.effective_to < asOf) return false;
  return true;
}

export function KnowledgePanel({ clientId }: { clientId: string }) {
  const t = useTranslations("ClientKnowledge");
  const tk = useTranslations("WorkKnowledge");
  const asOf = businessToday();
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
            {" · "}
            {/* #658 — A VERSION WITH NO AS-OF IS HALF AN ANSWER. `knowledge_version` says which
                revision of this client's knowledge you are looking at; `as_of` says which CALENDAR
                DAY the in-effect marks below were computed for. Both are needed to read a row that
                says "not in effect": not in effect WHEN? The date is Kuala Lumpur's, through the
                one business-date law (lib/business-date.ts), never the browser's raw clock — the
                same rule clara.get_knowledge_applicability follows server-side (0220:816). */}
            <span data-testid="knowledge-as-of">{tk("asOfLabel", { date: asOf })}</span>
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
              <KnowledgeGroup key={key} clientId={clientId} knowledgeKey={key} rows={rows} asOf={asOf} />
            ))}
          </ul>
        )}
      </DataState>
    </div>
  );
}

function KnowledgeGroup({ clientId, knowledgeKey, rows, asOf }: {
  clientId: string;
  knowledgeKey: string;
  rows: KnowledgeRecordRow[];
  asOf: string;
}) {
  const t = useTranslations("ClientKnowledge");
  const live = rows.filter((r) => r.state === "live");
  // THE CONFLICT FACE. Two live GOVERNED records of one key contradict each other
  // unless a reader can tell which applies — and 0192 guarantees they differ in
  // exactly that (`uq_knowledge_live` is over the applicability digest). So the
  // surface shows BOTH, says they conflict, and picks neither.
  //
  // A LEGACY `client_facts` ROW BESIDE A KNOWLEDGE RECORD IS NOT THAT. It is never
  // shadowed (0192's decision 1: the rest of Clara still READS clara.client_facts
  // for all five carried keys), and it is not an undecided pair either — the legacy
  // row is the one in force, and `KnowledgeRow`'s `authoritative` banner says so.
  // Calling that a conflict would tell the reader nothing decides it when
  // something does.
  const conflicted = live.filter((r) => r.editable).length > 1;

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
      {/* #654 — THE FIRM-RULE / CLIENT-EXCEPTION PAIR, and it is the OPPOSITE of the
          conflict banner above it. A conflict means two live CLIENT rows and nothing
          decides between them; a pair means the database HAS decided, per
          applicability, and names the firm rule this client's own record overrides
          (0192:1355-1363 filters that firm row out of this very read, which is why a
          second read has to say so). Mounted only where a live GOVERNED client row
          exists: a key this client has never recorded has nothing to override, and a
          legacy client_fact is never shadowed at all (decision 1). */}
      {live.some((r) => r.editable && r.scope_kind === "client") ? (
        <KnowledgeExceptionPair clientId={clientId} knowledgeKey={knowledgeKey} />
      ) : null}
      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <KnowledgeRow key={row.revision_id} clientId={clientId} row={row} asOf={asOf} />
        ))}
      </ul>
    </li>
  );
}

function KnowledgeRow({ clientId, row, asOf }: {
  clientId: string;
  row: KnowledgeRecordRow;
  asOf: string;
}) {
  const t = useTranslations("ClientKnowledge");
  const tk = useTranslations("WorkKnowledge");
  const inEffect = isInEffectOn(row, asOf);
  return (
    <li className="flex flex-col gap-2 border-t border-border pt-2 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-card-foreground">{knowledgeValueText(row.value)}</span>
        <KnowledgeBadges record={row} />
        {/* #658 — NOT IN EFFECT IS NOT WITHDRAWN, and the two must not read alike. A withdrawn
            record was RETIRED by a person and carries a reason; this one is live, governs its own
            period, and simply does not cover the day this view is for. It carries a WORD — never a
            colour alone (appendix D #7) — and a title that says what the word means, so a reader
            who cannot see the tone still reads "not in effect on <date>". */}
        {!inEffect && row.state !== "withdrawn" ? (
          <Badge variant="secondary" title={tk("notInEffectHint")} data-testid="knowledge-not-in-effect">
            {tk("notInEffect", { date: asOf })}
          </Badge>
        ) : null}
        {row.state === "withdrawn" ? (
          <span className="text-xs text-muted-foreground">{t("withdrawnNotice")}</span>
        ) : null}
      </div>
      <KnowledgeApplicability record={row} />
      <KnowledgeProvenance record={row} />
      <KnowledgeSourceBlock clientId={clientId} source={row.source} sourceKind={row.source_kind} />
      {row.authoritative ? (
        // THE LEGACY ROW IS THE ONE IN FORCE. clara.get_context_pack (0055:765), the closing-stock
        // close gate (0056:1283), the name-only guard (0062:226) and the bank-registry ledger
        // (0121:4797) all still read clara.client_facts, and 0192 does not dual-write — so a
        // legacy row is never shadowed by a newer knowledge record and the surface has to say
        // which of the two Clara actually acts on.
        <StateBanner tone="warning" title={t("authoritativeTitle")}>
          {t("authoritativeBody")}
        </StateBanner>
      ) : null}
      {row.editable ? (
        <Link
          className="w-fit text-xs underline underline-offset-4"
          href={knowledgeRecordHref(clientId, row.record_id)}
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
