"use client";

// #654 — THE FIRM KNOWLEDGE REGISTER (`/settings/knowledge`, journeys C13 + D2).
//
// WHAT THIS SURFACE IS FOR, and why the client register could not be it: a firm
// default is not a fact about any one client, so it has no client page to live on,
// and the shipped C13 register FILTERS a shadowed firm row out in SQL
// (0192:1355-1363). Before this page a firm-wide rule was invisible everywhere it
// was not currently winning. This is the firm-altitude view of the same governed
// record: the rule, whose act it was, who overrides it, and what is still running
// on it.
//
// THE FOUR FACES (#654 AC5), each from a DIFFERENT fact — the ladder
// `knowledge-panel.tsx` already draws, kept identical so the two registers read as
// one product:
//   successful empty   — the read SUCCEEDED and this firm has promoted nothing.
//   no results         — the read returned rules and the KIND filter hid them all.
//                        Its own state, keeping the filter and offering to clear it.
//   failed / denied    — `DataState`'s ErrorMessage, which distinguishes signed out
//                        / forbidden / not found / failed by the error's typed kind,
//                        never by its message text.
//   populated          — the rules, each with its authority, exceptions and Work.
//
// AND THE FIFTH THING THIS PAGE OWES, which is not a face but a sentence: promotion,
// correction and withdrawal do NOT re-run affected work. `docs/PRD.md:123` defers
// that engine to #658/#663 with human review as the accepted interim, so the page
// SAYS SO and then makes the review possible — the clients holding an exception and
// the non-terminal Work citing the key, both named, both linked.
//
// ROWS REUSE `knowledge-shared.tsx` VERBATIM. A trust badge that means one thing on
// a client record and another here would be two products.

import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataState, ErrorMessage } from "@/components/firm/data-state";
import { EmptyState, StateBanner } from "@/components/common/state";
import { useAsyncRead, type AsyncReadState } from "@/lib/firm/use-async-read";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { businessDateTime } from "@/lib/business-date";
import { knowledgeRecordHref, workDetailHref } from "@/lib/navigation/tree";
import { loadCallerContext } from "@/lib/firm/caller-context";
import { capabilityScopeFromRows } from "@/lib/firm/capabilities";
import {
  loadFirmKnowledge,
  type FirmKnowledgeEnvelope,
  type FirmKnowledgeRow,
} from "@/lib/registers/knowledge";
import { FirmKnowledgeActs } from "./knowledge-firm-acts";
import {
  KnowledgeApplicability,
  KnowledgeBadges,
  knowledgeValueText,
} from "./knowledge-shared";

const KINDS = ["assertion", "extracted_fact", "preference", "policy"] as const;
const ALL = "all";

export function KnowledgeFirmPanel() {
  const t = useTranslations("FirmKnowledge");
  // THE KIND VOCABULARY IS ONE VOCABULARY. `ClientKnowledge.kind.*` is what
  // `knowledge-shared.tsx`'s badges already render, so the filter reads from the
  // same block rather than minting a second spelling of "Preference" that could
  // drift from the badge two lines below it.
  const tKind = useTranslations("ClientKnowledge");
  const [kind, setKind] = useState<string>(ALL);
  const firm = useAsyncRead(() => loadFirmKnowledge({ session: sessionTokenAccessor }));
  // ONE caller-context read for the whole register, not one per rule: the floor
  // `clara._knowledge_floor(key, 'firm')` puts on Correct and Withdraw is the same
  // admin floor for every key (#603 Q22), so the answer does not vary by row.
  const scope = useAsyncRead(() => loadCallerContext(sessionTokenAccessor));
  const rank = capabilityScopeFromRows(scope.data)?.role_rank ?? null;
  const scopeResolved = !(scope.loading && scope.data === null);

  const all = firm.data?.records ?? [];
  const shown = kind === ALL ? all : all.filter((row) => row.kind === kind);
  // FILTERED-TO-NOTHING IS NOT EMPTY. `isEmpty` is about the READ; a filter that
  // hides everything gets its own state below, with the filter intact.
  const readIsEmpty = all.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground" id="firm-knowledge-filter-label">
            {t("filterLabel")}
          </span>
          <Select value={kind} onValueChange={(v) => setKind(v ?? ALL)}>
            <SelectTrigger aria-label={t("filterLabel")}>
              <SelectValue
                placeholder={t("filterAll")}
                items={[
                  { value: ALL, label: t("filterAll") },
                  ...KINDS.map((k) => ({ value: k, label: tKind(`kind.${k}` as "kind.assertion") })),
                ]}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("filterAll")}</SelectItem>
              {KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {tKind(`kind.${k}` as "kind.assertion")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {firm.data ? (
          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            <span>{t("versionLabel", { version: String(firm.data.knowledge_version ?? 0) })}</span>
            {/* The firm's LEGAL date, from the database — never the browser's clock. */}
            <span>{t("asOf", { date: firm.data.as_of })}</span>
          </div>
        ) : null}
      </div>

      {/* PRD:123's accepted interim, said out loud rather than implied by absence. */}
      <StateBanner tone="info" className="text-xs">
        {t("reviewNote")}
      </StateBanner>

      {/* THE STANDING REFUSAL LIVES OUTSIDE THE DIALOGS, so it survives one closing
          and the re-read that always follows (doors.ts's law) — and the register
          itself is NOT blanked by it. `loading`/`error` are gated on "nothing is
          known yet" for the reason knowledge-detail.tsx records at its own
          DataState: `act()` re-reads after every write, so a plain `firm.loading`
          unmounted this whole subtree on a REFUSAL, taking the open dialog and the
          sentence the human had just typed with it. */}
      {firm.data !== null && firm.error ? <ErrorMessage error={firm.error} /> : null}

      <DataState
        loading={firm.loading && firm.data === null}
        error={firm.data === null ? firm.error : null}
        isEmpty={readIsEmpty}
        emptyMessage={t("empty")}
      >
        {shown.length === 0 ? (
          <EmptyState>
            <span className="flex flex-col items-start gap-2">
              <span>{t("emptyFiltered")}</span>
              <Button variant="outline" size="xs" onClick={() => setKind(ALL)}>
                {t("clearFilter")}
              </Button>
            </span>
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-3">
            {shown.map((row) => (
              <FirmKnowledgeCard
                key={row.revision_id}
                row={row}
                asOf={firm.data?.as_of ?? ""}
                rank={rank}
                scopeResolved={scopeResolved}
                read={firm}
              />
            ))}
          </ul>
        )}
      </DataState>
    </div>
  );
}

function FirmKnowledgeCard({
  row,
  asOf,
  rank,
  scopeResolved,
  read,
}: {
  row: FirmKnowledgeRow;
  asOf: string;
  rank: number | null;
  scopeResolved: boolean;
  read: AsyncReadState<FirmKnowledgeEnvelope>;
}) {
  const t = useTranslations("FirmKnowledge");
  return (
    <li className="enter-content flex flex-col gap-3 rounded-lg border border-border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium text-card-foreground">{row.knowledge_key}</span>
        {row.key_description ? (
          <span className="text-xs text-muted-foreground">{row.key_description}</span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-card-foreground">{knowledgeValueText(row.value)}</span>
        <KnowledgeBadges record={row} />
      </div>
      {row.in_effect_today === false ? (
        <p className="text-xs text-muted-foreground">{t("notInEffect", { date: asOf })}</p>
      ) : null}
      <KnowledgeApplicability record={row} />
      {row.firm_defaultable_reason ? (
        <p className="text-xs text-muted-foreground">
          {t("whyEligible", { reason: row.firm_defaultable_reason })}
        </p>
      ) : null}

      <section className="flex flex-col gap-1">
        <h3 className="text-xs font-medium text-card-foreground">{t("authorityHeading")}</h3>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <dt>{t("authorityPromoter")}</dt>
          <dd>
            {row.authority.promoter_name ?? row.authority.promoter}
            {" · "}
            {businessDateTime(row.authority.recorded_at)}
          </dd>
          <dt>{t("authorityRequiredRole")}</dt>
          <dd>{row.authority.required_role ?? "—"}</dd>
          {/* #912 — TWO FACTS, NOT ONE. The role the act ran under is what a later
              dispute turns on; the role the promoter holds today is a different
              question, and a rule recorded before Clara kept the first says so
              rather than borrowing the second. */}
          <dt>{t("authorityRoleAtAct")}</dt>
          <dd>{row.authority.promoter_role_at_act ?? t("authorityRoleAtActUnknown")}</dd>
          <dt>{t("authorityRoleNow")}</dt>
          <dd>{row.authority.promoter_role_now ?? t("authorityRoleUnknown")}</dd>
          <dt>{t("authorityReason")}</dt>
          <dd>{row.authority.reason}</dd>
        </dl>
        {/* A REVOKED PROMOTER IS A FACT ABOUT THE RULE, not about the person: the
            record still stands, and hiding that would be the opposite of review. */}
        {row.authority.promoter_active ? null : (
          <StateBanner tone="warning" className="text-xs">
            {t("authorityRevoked")}
          </StateBanner>
        )}
      </section>

      <section className="flex flex-col gap-1">
        <h3 className="text-xs font-medium text-card-foreground">{t("exceptionsHeading")}</h3>
        {row.exception_count === 0 ? (
          <p className="text-xs text-muted-foreground">{t("exceptionsNone")}</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              {row.exception_count === 1
                ? t("exceptionsOne")
                : t("exceptionsMany", { count: row.exception_count })}
            </p>
            <ul className="flex flex-col gap-1 text-xs">
              {row.exceptions.map((exception) => (
                <li key={exception.record_id} className="flex flex-wrap items-baseline gap-2">
                  <Link
                    className="underline underline-offset-4"
                    href={knowledgeRecordHref(exception.client_id, exception.record_id)}
                  >
                    {exception.client_name ?? exception.client_id}
                  </Link>
                  <span className="text-muted-foreground">
                    {t("exceptionValue", { value: knowledgeValueText(exception.value) })}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="flex flex-col gap-1">
        <h3 className="text-xs font-medium text-card-foreground">{t("liveWorkHeading")}</h3>
        {row.live_work.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("liveWorkNone")}</p>
        ) : (
          <ul className="flex flex-col gap-1 text-xs">
            {row.live_work.map((work) => (
              <li key={work.work_id}>
                {work.client_id ? (
                  <Link
                    className="underline underline-offset-4"
                    href={workDetailHref(work.client_id, work.work_id)}
                  >
                    {t("liveWorkRow", { purpose: work.purpose, status: work.status })}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">
                    {t("liveWorkRow", { purpose: work.purpose, status: work.status })}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* #654 fix round 1 — the two governed acts a firm rule can still receive.
          Withheld below the admin floor with a sentence rather than a blank, and
          absent altogether on a revision the doors would refuse (`correctable`). */}
      <FirmKnowledgeActs row={row} rank={rank} scopeResolved={scopeResolved} read={read} />
    </li>
  );
}
