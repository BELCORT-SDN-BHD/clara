// Wave D-b — S1 wire client for recurring/reversing adjustment templates
// (design `wave-d-b-design.md` §2, rulings WDB-G1..G4/G13/G14; the builder ABI
// `wave-d-b-design-abi.md` §A/§B/§C/§D.1-3/§F). HUMAN lane only (PostgREST as
// clara_authenticated) — governance never transits the runtime (AGENTS.md); no
// figure is computed here, the DB owns every cents value. Every writer carries
// a FRESH op_key per call (the /assets `opKey()` idiom — the DB is idempotent
// on firm,fn,op_key; never reuse one across retries or mint one at module load).
// Row types + mappers live in ../close/adjustments/adjustmentModel.ts (the agingApi.ts/
// agingModel.ts split precedent). Relocated from ../rules/ by F-A2 PR-3, which retires
// /rules whole except this family (design §5 step 5).
//
// READ NAMES — RESOLVED (as-built ladder round 2, 2026-08-03). Every WRITE verb
// name + arg name below is copied LITERALLY from the ABI §A. The THREE reads
// this file needs beyond `adjustment_run_due` (§A's one pinned read) — a
// template LIST and a run GETTER/LIST — were NOT named anywhere in the design or
// the ABI, so this file was written against a DOCUMENTED ASSUMPTION and asked the
// DB lane to confirm or correct it. Nobody did, and the panel therefore took a
// PostgREST 404 on every load: templates=null, and sign / retire / run-manual
// unreachable, while design §2.8 requires that panel.
//
// The assumption is now the as-built: migration 0045 §S2.8 ships
//   list_adjustment_templates(p_client) -> {client_id, templates[], live_count,
//                                           draft_blocked_count}
//   list_adjustment_runs(p_client)      -> {client_id, runs[]}
//   get_adjustment_run(p_run)           -> {run: {...}}
// viewer-floored, firm-scoped, ONE jsonb object each — the D-a
// `list_fixed_assets`/`get_fixed_asset` + `list_depreciation_runs`/
// `get_depreciation_run` quartet transposed one family over. A template row
// names itself `template_id` (one spelling for one identity: the same key
// `adjustment_run_due`'s `blocked[]` and every write receipt use); a RUN row
// keeps `id` + `template_id`, exactly as `get_depreciation_run` reports its own.
// Every mapper stays DEFENSIVE (a key rename degrades a field, never crashes)
// and every read degrades through the ordinary PgrestError surface, keeping
// assetsApi.ts's dashboard-deploys-before-the-migration-merges posture.

import { rpc } from "./wire";
import {
  toListAdjustmentTemplatesRead, toAdjustmentRunDue, toAdjustmentRunRow, toListAdjustmentRunsRead,
  type ListAdjustmentTemplatesRead, type AdjustmentTemplateLine, type AdjustmentCadence,
  type AdjustmentRunDue, type AdjustmentRunRow, type AdjustmentRunMode, type ListAdjustmentRunsRead,
} from "../close/adjustments/adjustmentModel";

const opKey = () => crypto.randomUUID();

function s(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function rec(v: unknown): Record<string, unknown> {
  return (v ?? {}) as Record<string, unknown>;
}
// ---------------------------------------------------------------------------
// Reads.
// ---------------------------------------------------------------------------

export async function listAdjustmentTemplates(token: string, clientId: string): Promise<ListAdjustmentTemplatesRead> {
  const out = await rpc("list_adjustment_templates", { p_client: clientId }, token);
  return toListAdjustmentTemplatesRead(out);
}

export async function adjustmentRunDue(token: string, clientId: string): Promise<AdjustmentRunDue> {
  const out = await rpc("adjustment_run_due", { p_client: clientId }, token);
  return toAdjustmentRunDue(out);
}

export type GetAdjustmentRunRead = { run: AdjustmentRunRow | null; available: boolean };

export async function getAdjustmentRun(token: string, runId: string): Promise<GetAdjustmentRunRead> {
  const out = await rpc("get_adjustment_run", { p_run: runId }, token);
  const o = rec(out);
  const available = typeof out === "object" && out !== null && "run" in o;
  return { run: available && o.run ? toAdjustmentRunRow(o.run) : null, available };
}

export async function listAdjustmentRuns(token: string, clientId: string): Promise<ListAdjustmentRunsRead> {
  const out = await rpc("list_adjustment_runs", { p_client: clientId }, token);
  return toListAdjustmentRunsRead(out);
}

// ---------------------------------------------------------------------------
// Governed writers — EXACT verb + arg names from ABI §A. No local role
// gating anywhere below — the DB's role/CLR refusal is the enforcement (the
// /assets `exceptBankLine` precedent restated: "this UI does not gate on a
// local role guess").
// ---------------------------------------------------------------------------

/** [round 10] `warnings` is ADVISORY and always present (possibly empty): the DB admits the
 *  proposal either way. It carries three axes — `colliding_live_sibling` (a live template of
 *  this client whose shape contains or is contained by this one, with the periods it already
 *  carries), `implausible_start_date`, and [round 11] `replaced_period_overlap` (the RETIRED
 *  generation this proposal declares as its predecessor still carries standing charges in
 *  periods this template would book — the one term with NO shape requirement, so it survives
 *  the re-code onto distinct codes that both older axes miss). Dropping it here is what makes
 *  the DB's warning unrenderable, which is the seam dbSeamCensus exists to keep honest.
 *  `AdjustmentTemplatePanel` renders every axis; adding a FOURTH needs only a label in
 *  `proposeWarningAxisLabel`, because the DB's `message` is what reaches the pixel. */
export type AdjustmentTemplateWarning = {
  axis: string; message: string;
  template_id?: string; name?: string; status?: string; containment?: string;
  colliding_elements?: string[]; standing_charges?: number;
  first_period?: string | null; last_period?: string | null;
  start_date?: string; plausible_from?: string;
};
export type AdjustmentTemplateReceipt = { template_id: string; status: string; content_hash?: string; warnings: AdjustmentTemplateWarning[] };

/** The advisory array off a propose OR a sign receipt — ONE parser, because [round-12] the
 *  DB now answers both with the same shape and two readers of one shape drift. Tolerant by
 *  design and never a throw: an unrenderable warning must not refuse an ADMITTED act. The key
 *  is always present in the DB's own payload, and an envelope minted before it degrades to
 *  "nothing to say" rather than crashing the caller. */
function receiptWarnings(o: Record<string, unknown>): AdjustmentTemplateWarning[] {
  return Array.isArray(o.warnings)
    ? o.warnings.filter((w): w is Record<string, unknown> => !!w && typeof w === "object")
        .map((w) => ({ axis: s(w.axis) ?? "unknown", message: s(w.message) ?? "", ...(w as object) }) as AdjustmentTemplateWarning)
    : [];
}

/** propose_adjustment_template(...) → bookkeeper+ (ABI §A).
 *
 *  [round-11 XP2, W1 finding 3 / Codex r11 finding 2] `replaces` is the DECLARATION of a
 *  predecessor — the verb's tenth arg, `p_replaces`. Before this fix NO caller sent it, and
 *  `_adj_template_json` projected no `replaces_template_id`, so the entire P1 lineage build
 *  (the period prohibition, `replaced_generations`, the predecessor-candidate grammar) was
 *  reachable only from a hand-crafted PostgREST call: measured, a dashboard-shaped propose
 *  always left the column NULL.
 *
 *  The arg is sent ONLY when a predecessor is declared, and that is deliberate rather than
 *  tidy. PostgREST resolves an overload by the SET of keys posted, so a body that always
 *  carried `p_replaces` would 404 every propose against a database where the tenth arg is
 *  not yet deployed — this dashboard ships ahead of its migrations by house posture
 *  (assetsApi.ts). Omitting the key reproduces the pre-fix call byte for byte, and the DB's
 *  own `default null` supplies the same value the omitted key would have. */
export async function proposeAdjustmentTemplate(
  token: string,
  args: {
    clientId: string; name: string; cadence: AdjustmentCadence; startDate: string; endDate: string | null;
    autoReverse: boolean; lines: AdjustmentTemplateLine[]; memoTemplate: string;
    replaces?: string | null;
  },
): Promise<AdjustmentTemplateReceipt> {
  const out = await rpc(
    "propose_adjustment_template",
    {
      p_client: args.clientId, p_name: args.name, p_cadence: args.cadence,
      p_start_date: args.startDate, p_end_date: args.endDate, p_auto_reverse: args.autoReverse,
      p_lines: args.lines, p_memo_template: args.memoTemplate, p_op_key: opKey(),
      ...(args.replaces ? { p_replaces: args.replaces } : {}),
    },
    token,
  );
  const o = rec(out);
  return { template_id: s(o.template_id) ?? "", status: s(o.status) ?? "proposed", content_hash: s(o.content_hash) ?? undefined, warnings: receiptWarnings(o) };
}

/** sign_adjustment_template(p_client, p_template, p_op_key) → admin+ (ABI §A);
 *  revalidates cadence + start_date + end_date against the CURRENT FYE
 *  (`template_fy_stale` — design §2.2, ABI §F).
 *
 *  [round-12] IT NOW ANSWERS WITH A RECEIPT, and the receipt carries `warnings`. The DB
 *  re-asks the period-overlap advisory at SIGN because a propose-time snapshot can be
 *  honestly empty and the same pair be a doubling by the time an admin signs — sign is
 *  the act that makes a template able to post, and it is the last human moment before
 *  money can move. This wrapper used to return `void`, which is exactly how a DB advisory
 *  reaches zero pixels; the shape is propose's, so one parser serves both. */
export async function signAdjustmentTemplate(token: string, clientId: string, templateId: string): Promise<AdjustmentTemplateReceipt> {
  const out = await rpc("sign_adjustment_template", { p_client: clientId, p_template: templateId, p_op_key: opKey() }, token);
  const o = rec(out);
  return { template_id: s(o.template_id) ?? templateId, status: s(o.status) ?? "live", warnings: receiptWarnings(o) };
}

/** retire_adjustment_template(p_client, p_template, p_reason, p_op_key) →
 *  admin+; refuses `occurrence_draft_outstanding` while an occurrence draft is
 *  outstanding (design §2.2, ABI §F). */
export async function retireAdjustmentTemplate(token: string, clientId: string, templateId: string, reason: string): Promise<void> {
  await rpc("retire_adjustment_template", { p_client: clientId, p_template: templateId, p_reason: reason, p_op_key: opKey() }, token);
}

export type AdjustmentRunResult = {
  status: "posted" | "drafted" | string;
  entry_id: string | null;
  run_id: string | null;
  reversal_entry_id: string | null;
  mode: AdjustmentRunMode;
};

function toAdjustmentRunResult(raw: unknown): AdjustmentRunResult {
  const o = rec(raw);
  return {
    status: s(o.status) ?? "drafted",
    entry_id: s(o.entry_id),
    run_id: s(o.run_id),
    reversal_entry_id: s(o.reversal_entry_id),
    mode: s(o.mode) ?? "draft",
  };
}

/** run_adjustment_manual(...) → bookkeeper+ (ABI §A). `run_adjustment_
 *  occurrence` is the OTHER twin — `clara_runtime`-only, machine-side (the
 *  reconciler); this UI only ever calls the human path. */
export async function runAdjustmentManual(
  token: string, clientId: string, templateId: string, periodStart: string, periodEnd: string,
): Promise<AdjustmentRunResult> {
  const out = await rpc(
    "run_adjustment_manual",
    { p_client: clientId, p_template: templateId, p_period_start: periodStart, p_period_end: periodEnd, p_op_key: opKey() },
    token,
  );
  return toAdjustmentRunResult(out);
}

export type PairReversalResult = {
  pair_id: string;
  status: "completed" | "pending" | "cancelled" | string;
  occurrence_correction_id?: string | null;
  mirror_correction_id?: string | null;
};

function toPairReversalResult(raw: unknown): PairReversalResult {
  const o = rec(raw);
  return {
    pair_id: s(o.pair_id) ?? "",
    status: s(o.status) ?? "pending",
    occurrence_correction_id: s(o.occurrence_correction_id),
    mirror_correction_id: s(o.mirror_correction_id),
  };
}

/** reverse_adjustment_pair(...) → bookkeeper+ (ABI §A/§2.4); low-stakes
 *  completes in one transaction, high-stakes parks both corrections as
 *  drafts pending `approve_pair_reversal`. */
export async function reverseAdjustmentPair(
  token: string, clientId: string, occurrenceEntryId: string, reason: string,
): Promise<PairReversalResult> {
  const out = await rpc(
    "reverse_adjustment_pair",
    { p_client: clientId, p_occurrence: occurrenceEntryId, p_reason: reason, p_op_key: opKey() },
    token,
  );
  return toPairReversalResult(out);
}

/** approve_pair_reversal(...) → bookkeeper+ (ABI §A); the distinct-checker
 *  atomic flip for a high-stakes pair correction. */
export async function approvePairReversal(
  token: string, clientId: string, pairId: string, attestation: string | null = null,
): Promise<PairReversalResult> {
  const out = await rpc(
    "approve_pair_reversal",
    { p_client: clientId, p_pair: pairId, p_op_key: opKey(), p_attestation: attestation },
    token,
  );
  return toPairReversalResult(out);
}

/** cancel_pair_reversal(...) → bookkeeper+, non-blank reason (ABI §A); a
 *  cancelled receipt never resets the template's ramp clock (design §2.4). */
export async function cancelPairReversal(token: string, clientId: string, pairId: string, reason: string): Promise<PairReversalResult> {
  const out = await rpc(
    "cancel_pair_reversal",
    { p_client: clientId, p_pair: pairId, p_reason: reason, p_op_key: opKey() },
    token,
  );
  return toPairReversalResult(out);
}
