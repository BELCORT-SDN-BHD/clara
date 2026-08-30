"use client";

// The chatTurn_v16 READ-ONLY rich cards (P6-2, ruling Q8): `agent_receipt` and
// `freeform_result`. The two v16 kinds that carry a governed ACT door live in
// ./V16ActCards.tsx — that split is the reviewability seam, not filing: those
// two hold this bump's only judgement logic (a gate, a refusal branch), which
// review law 1 says gets read on its own. The shared shell both files build on
// is ./PartCardShell.tsx.
//
// WHAT MAKES THESE "RICH" AND THE v14 FOUR NOT. The v14 cards render exactly
// what the wire carries and stop, because no read function is keyed on a post
// receipt, an op_key or a pack digest — there is nothing to hydrate them from.
// Every v16 kind DOES name a live read (P6-1's declarer names each one), so all
// four obey hydrate-never-trust in full (contract §3.2): the part carries
// IDENTIFIERS ONLY, and the card re-derives authoritative state from a pinned DB
// read on mount through the shared `useHydratedPart`.
//
// THREE RULES THIS BUMP'S CARDS HOLD THEMSELVES TO — each one a thing a card
// could get wrong in a way no type would catch:
//
//  1. NO FIGURE THIS UI COMPUTED (hard constraint 2). Every numeral rendered
//     comes out of a TYPED DB COLUMN and is printed as the DB handed it over —
//     `row_count`, `byte_count`, `duration_ms` below; the five sweep counters in
//     ./SweepReceiptCard.tsx. Nothing is summed, reconciled, averaged or
//     percentaged, and no card formats a numeral that came out of a
//     model-authored payload.
//
//  2. AN OPEN `Record<string, unknown>` IS NEVER WALKED. `verdict` on a receipt,
//     `rung_vector`/`model_snapshot` on a freeform read, `bound_digests` on a
//     proposal, `candidates` on a firm question: each is caller- or model-shaped
//     jsonb with no schema the DB commits to, and a value of unknown shape has
//     NO honest rendering (V14ReceiptCards.tsx's own words: "`[object Object]`
//     is not one"). This is also the seam where rule 1 is actually ENFORCED
//     rather than merely intended — a numeral hiding inside one of those
//     payloads is model-authored by construction, so not walking them is what
//     guarantees no model-authored numeral is ever formatted as a number.
//     `v16-cards.test.tsx` mutates a numeral into each one and asserts it never
//     reaches the screen. DB-stored PROSE is the deliberate other side of that
//     line — see `AgentProse` in ./PartCardShell.tsx for why.
//
//  3. NEVER A BROKEN LINK, AND NEVER AN INVENTED ONE. Each card links only where
//     the row it just READ proves a destination exists — the same "no client id
//     on the wire means no link at all" discipline EntryPostedCard documents.

import { useTranslations } from "next-intl";

import { Badge } from "./PartBadge";
import { PartSummaryCard } from "./PartSummaryCard";
import { AgentProse, FactRows, HydrateState, MalformedPart, TokenList, usableId } from "./PartCardShell";
import { businessDateTime } from "@/lib/business-date";
import { useHydratedPart } from "@/lib/parts/hooks";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { getAgentReceipt, type AgentReceiptRow } from "@/lib/firm/reads";
import { getFreeformRead } from "@/lib/reports/api";
import type { FreeformReadLogRow } from "@/lib/reports/types";
import type { AgentReceiptPart, FreeformResultPart } from "@/lib/parts/types";

// --- agent_receipt -----------------------------------------------------------

/** ONE agent act's receipt, hydrated from `clara.agent_receipts_visible` by the
 *  PAIR `(receipt_kind, receipt_id)` — see `getAgentReceipt`'s own doc comment
 *  for why a single-column filter would be wrong rather than merely loose.
 *
 *  THERE IS NO ACT, AND THAT IS STRUCTURAL: a receipt records what happened, and
 *  nothing settles it. So this card has no gate, no busy state and no refusal
 *  branch of its own — only the read's.
 *
 *  THE LINK GOES TO THE WORKBENCH THAT OWNS THE OBJECT, NEVER TO A BYTE
 *  DOWNLOAD — F-A5b PR-3 has not built one (fe-train-plan-2026-08-30 §4), so a
 *  "download the evidence" affordance here would be a control for a door that
 *  does not exist. `client_id` is nullable ON PURPOSE (the view's ordinal 4:
 *  "NULL where the act is structurally client-less — a pre-attribution filing, a
 *  firm-narrow read"), so the destination is chosen from what the ROW proves: a
 *  client-scoped receipt links to that client's workspace, a firm-altitude one
 *  to the firm activity feed, which is the surface built over this very view
 *  (app/(firm)/activity/page.tsx).
 *
 *  IT DELIBERATELY DOES NOT MAP `receipt_kind` TO A PER-LANE WORKBENCH. That
 *  world is an open TABLE later migrations insert into — `clara.
 *  agent_receipt_surfaces` held seven rows at 0103 and reads NINE at frontier
 *  0155 — so a kind→route map would fabricate a destination for every kind
 *  minted after this file was written. That is the same drift `receipt_kind:
 *  string` exists to absorb, arriving as a broken link instead of an
 *  unrenderable card. */
export function AgentReceiptCard({ part }: { part: AgentReceiptPart }) {
  const t = useTranslations("Clara.parts.agentReceipt");
  const tc = useTranslations("Clara.parts.common");
  const addressable = usableId(part.receipt_kind) && usableId(part.receipt_id);
  // The ENVELOPE, not the row — see HydrateState's caller contract: a loader
  // that resolved to `null` itself would be indistinguishable from one that has
  // not resolved yet, and the card would spin forever on a row RLS will never
  // admit.
  const state = useHydratedPart<{ row: AgentReceiptRow | null }>(addressable ? sessionTokenAccessor : null, async (s) => ({
    row: await getAgentReceipt(s, part.receipt_kind, part.receipt_id),
  }));

  if (!addressable) return <MalformedPart kind="agent_receipt" fields={["receipt_kind", "receipt_id"]} />;
  const row = state.data?.row ?? null;
  if (row !== null && row.client_id !== part.client_id) {
    return <MalformedPart kind="agent_receipt" fields={["receipt_kind", "receipt_id", "client_id"]} />;
  }

  return (
    <PartSummaryCard
      title={t("title")}
      rows={[
        [t("kindLabel"), part.receipt_kind],
        [t("receiptLabel"), part.receipt_id],
      ]}
      note={t("note")}
      link={
        row
          ? usableId(row.client_id)
            ? { href: `/clients/${encodeURIComponent(row.client_id)}`, label: t("linkClient") }
            : { href: "/activity", label: t("linkFirm") }
          : null
      }
    >
      <HydrateState state={state} hasRow={row !== null} />
      {row ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{row.scope}</Badge>
            <span className="text-xs text-muted-foreground">{businessDateTime(row.occurred_at)}</span>
          </div>
          <FactRows
            rows={[
              [t("actorLabel"), row.acting_actor],
              [t("onBehalfLabel"), row.on_behalf_of],
              [t("wakeKindLabel"), row.via_wake_kind],
              [t("subjectLabel"), row.subject_id],
              // Two typed text columns joined for display only — never a version
              // string this card composed out of anything else.
              [t("modelLabel"), row.model ? `${row.model}${row.model_version ? ` ${row.model_version}` : ""}` : null],
              [t("clientLabel"), row.client_id ?? tc("firmAltitude")],
            ]}
          />
          <AgentProse label={t("rationaleLabel")} text={row.rationale} />
          <TokenList label={t("failingRungsLabel")} tokens={row.failing_rungs ?? []} tone="warning" />
          {/* `verdict` is deliberately absent — header rule 2. */}
        </div>
      ) : null}
    </PartSummaryCard>
  );
}

// --- freeform_result ---------------------------------------------------------

/** ONE audited freeform read — the receipt of a SELECT the model composed and
 *  the DATABASE ran. Hydrates `clara.freeform_read_log` by primary key.
 *
 *  THERE IS NO ACT AND NO "SEE ALL". `clara.list_freeform_reads` does not exist
 *  anywhere in the estate (measured at zero hits across 155 migrations), so this
 *  card renders the one receipt it was handed and offers no history link it
 *  cannot honour.
 *
 *  THE RESULT ROWS ARE NOT HERE, AND THEY ARE NOWHERE DURABLE. What IS durable
 *  is the audit trail — the SQL, the stated purpose, the compiled scope, the row
 *  and byte counts, the outcome. `row_count`, `byte_count` and `duration_ms` are
 *  typed DB columns, rendered exactly as the DB wrote them (header rule 1); the
 *  rows the query returned stay where the transcript already carries them, in
 *  the `tool_result` part of the same turn.
 *
 *  THE LINK IS CONDITIONAL ON THE ROW PROVING ONE. `client_scope` is a `uuid[]`,
 *  and 0131's own CHECK forces it NULL whenever `scope = 'firm'`. A link is
 *  offered only when the receipt names EXACTLY ONE client: with two, picking
 *  either would be inventing a destination; with none there is no client page to
 *  point at. */
export function FreeformResultCard({ part }: { part: FreeformResultPart }) {
  const t = useTranslations("Clara.parts.freeformResult");
  const addressable = usableId(part.read_id);
  // The ENVELOPE, not the row — see HydrateState's caller contract.
  const state = useHydratedPart<{ row: FreeformReadLogRow | null }>(addressable ? sessionTokenAccessor : null, async (s) => ({
    row: await getFreeformRead(part.read_id, { session: s }),
  }));

  if (!addressable) return <MalformedPart kind="freeform_result" fields={["read_id"]} />;
  const row = state.data?.row ?? null;
  const soleClient = row && row.scope === "client" && row.client_scope?.length === 1 ? row.client_scope[0] : null;

  return (
    <PartSummaryCard
      title={t("title")}
      rows={[[t("readLabel"), part.read_id]]}
      note={t("note")}
      link={soleClient ? { href: `/clients/${encodeURIComponent(soleClient)}/reports`, label: t("link") } : null}
    >
      <HydrateState state={state} hasRow={row !== null} />
      {row ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={row.outcome === "ok" ? "info" : row.outcome ? "warning" : "neutral"}>
              {row.outcome ?? t("outcomePending")}
            </Badge>
            <Badge tone="neutral">{row.scope}</Badge>
            <span className="text-xs text-muted-foreground">{businessDateTime(row.at)}</span>
          </div>
          <AgentProse label={t("purposeLabel")} text={row.purpose} />
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">{t("queryLabel")}</span>
            {/* The SQL the DATABASE actually ran, verbatim from its typed column. */}
            <pre className="wrap-anywhere overflow-x-auto rounded-md border border-border bg-muted p-2 text-xs whitespace-pre-wrap text-card-foreground">
              {row.query_text}
            </pre>
          </div>
          <FactRows
            rows={[
              [t("wakeKindLabel"), row.via_wake_kind],
              [t("actorLabel"), row.acting_actor],
              [t("refusalLabel"), row.refusal_reason],
              // DB-OWNED FIGURES, from typed columns, printed as handed over.
              // `String(...)` and nothing else — no locale formatting, no unit
              // conversion, no arithmetic (header rule 1).
              [t("rowCountLabel"), row.row_count === null ? null : String(row.row_count)],
              [t("byteCountLabel"), row.byte_count === null ? null : String(row.byte_count)],
              [t("durationLabel"), row.duration_ms === null ? null : String(row.duration_ms)],
            ]}
          />
          <TokenList label={t("relationsLabel")} tokens={row.relations_read ?? []} />
          {/* `rung_vector` and `model_snapshot` are deliberately absent — header
              rule 2. Both are open jsonb the model's own lane shaped. */}
        </div>
      ) : null}
    </PartSummaryCard>
  );
}
