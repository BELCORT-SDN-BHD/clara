// #1090 / #1092 — THE TWO GROUNDS THE DERIVATION RANKS BUT COULD NOT BE FED: the statements that
// read them and the mappings that shape them.
//
// WHY THIS IS A SEPARATE MODULE, and why it was not one at first. `deriveFaParticularsProposal`
// (`./fa-particulars-proposal.ts`, #933) already ranks a `client_knowledge` note above a retired
// account policy above the account's completed siblings; what neither ground had was a way in.
// #1090 catalogued the knowledge key (migration 0345) and #1092 opened the read (0346), and both
// first landed their statement and mapper INSIDE the deriver's own file. That file is frozen AND
// deploy-locked on `main` — `frozen-workflows.json` carries
// `packages/runtime/lib/fa-particulars-proposal.ts` with `deployed: true` and the sha this lane
// was cut at — which this lane could not see, because the entry was minted by the cut phase AFTER
// the lane branched (its own manifest has no such entry). Appending to a deploy-locked body is the
// one thing the freeze exists to stop, so the additions live here instead and the deriver's file
// stays byte-identical to `main`. Measured, not assumed: 2026-09-25 fix round.
//
// NOTHING HERE REACHES FOR A POOL. Each statement is an exported constant with ONE home, driven
// under a real `clara_agent_ro` wake credential by the db batteries
// (`packages/db/tests/depreciation-policy-knowledge.test.mjs`,
// `packages/db/tests/fa-retired-policy-agent-read.test.mjs`); each mapper is pure and is driven
// with them. The STEP that runs them is the successor workflow's own, and the contract for it is
// in `docs/plan/active/riders-2026-09-20/reports/waveS-lane05-fix.md`.

import { type FaMethod } from "./fixed-asset-acquisition.js";
import {
  type FaProposalKnowledgeNote,
  type FaProposalRetiredPolicy,
} from "./fa-particulars-proposal.js";

// =========================================================================================
// #1090 — THE `client_knowledge` GROUND, FED. Migration 0345 catalogues the `depreciation_policy`
// knowledge key `deriveFaParticularsProposal` already ranks and tests; this is the ONE mapping
// its brief still owes: `clara.knowledge_records` rows for that key -> `FaProposalKnowledgeNote[]`.
//
// THE STEP THAT RUNS THE READ IS NOT HERE, on purpose, for the SAME reason the deriver's own
// header gives for the rest of the family: "the reads that gather its facts are the successor
// workflow's own step". That step (`loadFaProposalInputsStepV6` or its successor) is absent from THIS branch and
// lives inside a frozen-workflow closure this ticket must never create or edit — see the successor
// contract in `docs/plan/active/riders-2026-09-20/reports/waveS-lane05-fix.md`, which names the
// exact call site, argument order and the three comments on `main` it makes false.
//
// THE STATEMENT ITSELF IS AN EXPORTED CONSTANT, NOT A COMMENT (fix round, 2026-09-25). It was
// prose here until the adversarial lens (ADV-L05-02) drove the prose version against a real
// database and grounded a 2026 proposal on a note whose effective window closed in 2024. A
// statement nothing executes is a statement nothing can falsify; this one has ONE home, and the db
// battery drives THIS string under a real `clara_agent_ro` wake credential.
//
// SCOPING: a client-wide note is captured with `applies_when = {}` (`assetAccount: null` here); an
// account-scoped note is captured with `applies_when = {"asset_account_code": "<code>"}` — the
// convention migration 0345's own catalog description states. `speaksFor` (in the deriver) already treats
// `assetAccount: null` as an account like any other, so this mapper does no ranking of its own.
//
// TOLERANT BY CONSTRUCTION, never thrown on: the catalog validates `depreciation_policy` no more
// strictly than "an object" (`shape_only`), so a captured `value` missing a field, carrying the
// wrong type, or naming a method `congruent()` does not recognise is not this mapper's business to
// refuse — `congruent()` already drops a driver set it cannot use, the same rule an incongruent
// SIBLING already lives by (see `fromSiblings` in the deriver). A field this mapper cannot read maps to
// `null` (or, for `label`, the empty string) rather than raising, so one malformed knowledge row
// among several cannot take a well-formed one down with it.

/**
 * THE READ, VERBATIM. `$1` is the client and `$2` the calendar day the proposal is being made for
 * (`null` means today in MYT). It runs under the SAME OBO read credential v4's own register read
 * mints (`clara_agent_ro`, RLS `p_knowledge_records_agent`, `firm_id = clara.wake_firm()` —
 * 0192:611-612, unmodified), with the client additionally pinned in the WHERE clause exactly as v4
 * pins the asset's own client.
 *
 * WHY THE EFFECTIVE WINDOW IS IN THE STATEMENT (fix round, ADV-L05-02, 2026-09-25). A knowledge
 * record carries `effective_from` / `effective_to`, and `state` does NOT move when a window simply
 * closes: nothing superseded the record, so an expired note is still `state = 'live'`. Measured on
 * a live database: a note captured for 2024 only was returned by the window-less form and grounded
 * a 2026 proposal under this module's own PRESENT-TENSE sentence ("This client's record states
 * …"), which is a stale authority speaking as a current one. The two terms below are the SAME
 * expression `clara.retrieve_knowledge` computes `in_effect` from
 * (`packages/db/migrations/0230_knowledge_retrieval.sql:361-362`: `(effective_from is null or
 * effective_from <= v_as_of) and (effective_to is null or effective_to >= v_as_of)`), so the
 * estate has ONE window rule and not two.
 *
 * THIS CONSUMER DROPS WHERE `clara.retrieve_knowledge` MARKS, and that difference is deliberate.
 * That door hands a MODEL a marked record on purpose ("silently dropping it is how a run reasons
 * without a fact that applies — or, worse, applies one that has expired"): a model can read
 * `in_effect: false` and say so. This ground feeds `deriveFaParticularsProposal`, which is
 * deterministic and has no vocabulary for an expired note — every note it is handed speaks in the
 * present tense — so an out-of-window row must never reach it.
 *
 * WHY NOT `clara.retrieve_knowledge` ITSELF, which already windows, states a purpose and writes
 * the `clara.record_work_knowledge_read` receipt `clara.work_knowledge_drift` depends on: it is
 * out of this credential's reach. Measured, not assumed — `has_function_privilege` answers false
 * for `clara_agent_ro` on both that door and the receipt, and true for `clara_runtime`, a
 * different credential behind a different wall (db battery cell `dk.09`). The successor step
 * therefore reads the relation directly and leaves NO drift receipt, which the successor contract
 * states in those words so a reader does not assume one exists.
 *
 * WHY THE MYT DAY IS INLINE rather than `clara._book_today()`: that function is ungranted
 * (`proacl` is `{clara_fn_owner=X/clara_fn_owner}`, measured), so this credential cannot call it.
 * The expression is the one `clara.retrieve_knowledge` uses for the same default.
 *
 * `state = 'live'` NEEDS NO `superseded_at is null` BESIDE IT: the relation's own CHECK
 * `ck_knowledge_records_state` makes `superseded_at is null` equivalent to
 * `state in ('live','withdrawn')`, and `withdrawn` is excluded by name.
 */
export const FA_DEPRECIATION_POLICY_KNOWLEDGE_SQL = `select r.id, r.applies_when, r.value
  from clara.knowledge_records r
 where r.client_id = $1::uuid
   and r.knowledge_key = 'depreciation_policy'
   and r.state = 'live'
   and (r.effective_from is null
        or r.effective_from <= coalesce($2::date, (now() at time zone 'Asia/Kuala_Lumpur')::date))
   and (r.effective_to is null
        or r.effective_to >= coalesce($2::date, (now() at time zone 'Asia/Kuala_Lumpur')::date))
 order by r.recorded_at`;

/** One `clara.knowledge_records` row for the `depreciation_policy` key, exactly as the SQL above
 *  returns it — the raw shape a future step hands this mapper, with no reshaping in between. */
export type DepreciationPolicyKnowledgeRow = {
  id: string;
  applies_when: unknown;
  value: unknown;
};

function asPlainObject(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** `clara.knowledge_records` rows for `depreciation_policy` -> `FaProposalKnowledgeNote[]`, in
 *  the SAME order the rows arrived (this module ranks and de-duplicates nothing — `deriveFa
 *  ParticularsProposal`'s own `agreedOn`/`speaksFor` already do, over every note it is handed). */
export function mapDepreciationKnowledgeRows(
  rows: readonly DepreciationPolicyKnowledgeRow[],
): FaProposalKnowledgeNote[] {
  const notes: FaProposalKnowledgeNote[] = [];
  for (const row of rows) {
    const value = asPlainObject(row.value);
    if (value === null) continue; // shape_only still means "an object": anything else grounds nothing.
    const appliesWhen = asPlainObject(row.applies_when) ?? {};
    const rawAccount = appliesWhen.asset_account_code;
    const rawLabel = value.label;
    notes.push({
      recordId: typeof row.id === "string" ? row.id : null,
      assetAccount: typeof rawAccount === "string" && rawAccount !== "" ? rawAccount : null,
      label: typeof rawLabel === "string" ? rawLabel : "",
      method: typeof value.method === "string" ? (value.method as FaMethod | string) : null,
      usefulLifeMonths: typeof value.useful_life_months === "number" ? value.useful_life_months : null,
      rateBps: typeof value.rate_bps === "number" ? value.rate_bps : null,
    });
  }
  return notes;
}

// =========================================================================================
// #1092 — THE `retired_account_policy` GROUND, FED. Migration 0346 gives the runtime read
// credential (`clara_agent_ro`) a firm-scoped SELECT on `clara.fa_account_depreciation_policies`;
// this is the ONE mapping its brief still owes, and the statement that produces its input.
//
// THE READ IS A CONSTANT HERE, NOT A CALL, for the reason the deriver's own header gives: "the
// reads that gather its facts are the successor workflow's own step". That step
// (`loadFaProposalInputsStepV6`) is absent from THIS branch and lives inside a frozen-workflow
// closure. It EXISTS on `main` at `061a6992b` — `packages/runtime/workflows/claraWork.v6.impl.ts`,
// in `frozen-workflows.json` there and allocated to lane L8 by `SWEEP-PLAN.md`'s shared-files
// table — and its step (a) already selects the one argument this statement still needs. The
// successor contract in `docs/plan/active/riders-2026-09-20/reports/waveS-lane05-fix.md` names the
// call site, the argument order and the comment in that file this migration makes false. Keeping
// the SQL as an exported constant gives the statement ONE home — the db battery drives THIS string
// under a real `clara_agent_ro` wake credential rather than a copy of it — while the module still
// reaches for no pool and stays drivable without a database.

/**
 * THE READ, VERBATIM. `$1` is the client, `$2` the register row's own `asset_account_code`; it
 * returns AT MOST ONE row, and the caller runs it under the OBO read credential `readScoped`
 * already mints (`clara_agent_ro`), whose RLS policy `p_fadp_agent` (migration 0346) binds
 * `firm_id = clara.wake_firm()`. The client is pinned here as well, exactly as v4's register read
 * pins it, so a wake firm with two clients cannot widen it.
 *
 * WHY IT ASKS FOR "RETIRED, AND NOTHING LIVE ABOVE IT" RATHER THAN "THE NEWEST RETIRED".
 * `clara.set_fa_depreciation_policy` is VERSION-FORWARD: setting a policy again retires version N
 * and inserts a live version N+1 (0277 §D). So an account can hold a retired version 1 underneath a
 * LIVE version 2, and a register row that was already pending when version 2 landed still opens a
 * question. Grounding that question on version 1 would put a judgement the person has SINCE
 * REPLACED onto a form, under the deriver's own sentence claiming they signed it — the ground is
 * "the last thing a person said about this account", and while a live policy exists that is not the
 * retired one. The `not exists` clause is therefore load-bearing, and it is the reason migration
 * 0346's RLS policy is plain tenancy rather than "retired rows only": under a retired-only wall
 * this sub-select would see nothing and always pass, i.e. the guard would be vacuous under the very
 * credential that runs it. `packages/db/tests/fa-retired-policy-agent-read.test.mjs` (`fp.read`)
 * drives both arms and carries the control that shows the clause, not luck, suppresses the
 * superseded row.
 *
 * WHAT IT DELIBERATELY DOES NOT SELECT. `residual_cents` — the deriver reads no residual off any
 * ground (see its header); `reason`, `retired_reason`, `created_by`, `retired_by` — a proposal's
 * sentence names the VERSION, never a person or their words, and a column nothing reads is a column
 * a later reader must not start reading by accident.
 */
export const FA_RETIRED_ACCOUNT_POLICY_SQL = `select p.asset_account_code, p.version, p.method,
       p.useful_life_months, p.rate_bps
  from clara.fa_account_depreciation_policies p
 where p.client_id = $1::uuid
   and p.asset_account_code = $2
   and not p.active
   and not exists (select 1 from clara.fa_account_depreciation_policies q
                    where q.client_id = p.client_id
                      and q.asset_account_code = p.asset_account_code
                      and q.active)
 order by p.version desc
 limit 1`;

/** One `clara.fa_account_depreciation_policies` row, exactly as `FA_RETIRED_ACCOUNT_POLICY_SQL`
 *  returns it — the raw shape a future step hands the mapper, with no reshaping in between. */
export type RetiredAccountPolicyRow = {
  asset_account_code: unknown;
  version: unknown;
  method: unknown;
  useful_life_months: unknown;
  rate_bps: unknown;
};

/**
 * `clara.fa_account_depreciation_policies` -> `FaProposalRetiredPolicy`, or `null` where the row
 * cannot ground anything.
 *
 * TWO REASONS FOR `null`, and they are different in kind. NO ROW means the account has no retired
 * policy the read admits (see the guard in the SQL above) — the ordinary case, and the proposal
 * simply falls to the next ground. AN UNREADABLE `asset_account_code` means the row cannot be
 * SCOPED, and that is a harder refusal than the knowledge mapper's: `asset_account_code` is NOT
 * NULL on the relation (0277 §A), so unlike `FaProposalKnowledgeNote.assetAccount` a null here is
 * not a meaningful "about the client as a whole" statement. Mapping it to null anyway would hand
 * `speaksFor` a ground that speaks for every register row carrying NO account code — a policy for
 * account 1500 grounding an unclassified asset, under a reason naming an account it never came
 * from, which is the exact defect the deriver's own header records for the three grounds.
 *
 * EVERYTHING ELSE IS TOLERATED, not refused — the same rule an incongruent SIBLING already lives
 * by. A method the deriver does not recognise, or a missing life or rate, is `congruent()`'s
 * business to DROP downstream; refusing it here would move one shape gate into two places.
 */
export function mapRetiredAccountPolicyRow(
  row: RetiredAccountPolicyRow | null | undefined,
): FaProposalRetiredPolicy | null {
  if (row === null || row === undefined) return null;
  const account = row.asset_account_code;
  if (typeof account !== "string" || account === "") return null;
  return {
    assetAccount: account,
    version: typeof row.version === "number" ? row.version : null,
    method: typeof row.method === "string" ? (row.method as FaMethod | string) : null,
    usefulLifeMonths: typeof row.useful_life_months === "number" ? row.useful_life_months : null,
    rateBps: typeof row.rate_bps === "number" ? row.rate_bps : null,
  };
}
