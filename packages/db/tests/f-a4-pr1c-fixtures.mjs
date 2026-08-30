// F-A4 PR-1c -- the close-domain agent limb battery's shared fixture CORE (NOT a test file: the
// name does not end in `.test.mjs`, so `node --test` ignores it). Split out of
// f-a4-pr1c-close-agent-limb.test.mjs purely to keep both files under the repo's 500-line
// convention (the x56-fixtures / f-a3-pr1b-wake-fixtures precedent).
//
// CONTRACT-BLIND: every readiness probe below reads the LIVE CATALOG (pg_proc / pg_constraint /
// clara.wake_fn_allowlist), never the migration's own SQL text and never a migration NUMBER --
// numbers are claimed at merge, so a number gate would break the moment this train is renumbered.

import { createHash, randomUUID } from "node:crypto";
import {
  rootQuery, opk, waveAEnsureReady, buildWorld, firmOf, draftEntryV3, freshResolution,
} from "./wave-a-fixtures.mjs";
import { wakeQuery, ROLES } from "./rig-helpers.mjs";
import { has0056, cleanCloseableFY } from "./x56-fixtures.mjs";

/** The twelve wrappers this PR ships. The design ruled THIRTEEN; wrapper 12
 *  (wake_establish_prepayment_schedule) is PARKED on two measured blockers named in the
 *  migration's header, so it is listed here as a deliberate ABSENCE rather than dropped from
 *  memory (law 31's dead-member discipline applied to a roster). */
export const WRAPPERS = [
  "wake_list_fiscal_years", "wake_get_close_plan", "wake_get_close_readiness", "wake_verify_close",
  "wake_snapshot_state", "wake_dry_run_close_readiness", "wake_open_fiscal_year", "wake_begin_close",
  "wake_abandon_close", "wake_propose_close", "wake_run_depreciation_catchup", "wake_mint_month_snapshot",
];
export const PARKED_WRAPPER = "wake_establish_prepayment_schedule";

export const RATIONALE = "f-a4-pr1c battery: unattended close-prep judgement";
export const MODEL = { name: "claude-opus-5", version: "2026-08-27" };

/** Frontier probe: has PR-1c landed? Read from a CATALOG object only this PR creates, by exact
 *  signature (law 3: a bare name is a projection of the thing, a regprocedure IS the thing). */
export async function hasPR1C() {
  const r = await rootQuery(
    `select (to_regprocedure('clara.wake_begin_close(uuid,text,jsonb,text)') is not null) as fn,
            (to_regclass('clara.close_proposals') is not null) as tbl,
            (to_regclass('clara.agent_act_receipts') is not null) as rcpt,
            (to_regclass('clara.close_prep_holds') is not null) as hold`);
  const x = r.rows[0];
  return Boolean(x.fn && x.tbl && x.rcpt && x.hold);
}

export async function caught(fn) {
  try { await fn(); return null; } catch (e) { return e; }
}

/** THE DERIVED OP KEY (design D-25 / Annex A.1): sha256(wake_task_id ‖ ':' ‖ verb ‖ ':' ‖
 *  subject_id), hex. Recomputed HERE in the test harness from the same three inputs the wrapper
 *  recomputes it from -- if the two derivations ever disagree, every cell in the battery fails
 *  loudly at Tier A rather than one cell failing subtly. */
export function derivedOpKey(task, verb, subject) {
  return createHash("sha256").update(`${task}:${verb}:${subject}`, "utf8").digest("hex");
}

/** A clocked close_prep agent task + a TASK-BOUND credential, exactly the pair the leader belt
 *  will mint in PR-2. The task insert goes through clara.agent_tasks' own BEFORE trigger (the
 *  close_prep arm PR-1b installed), so a shape this rig accepts is a shape the trigger accepts. */
export async function mintClosePrepSession(firm, client) {
  const t = await rootQuery(
    `insert into clara.agent_tasks(firm_id, client_id, kind, status, model_snapshot)
       values ($1, $2, 'close_prep', 'queued', $3) returning id`,
    [firm, client, JSON.stringify(MODEL)]);
  const task = t.rows[0].id;
  // The engine claims a direct-queue task before the workflow's first step mints its credential.
  // Keep the fixture on that production order: the exact minter's generic live-task wall now
  // refuses a merely queued task, just as it refuses a terminal one.
  await rootQuery("update clara.agent_tasks set status='running' where id=$1", [task]);
  const c = await rootQuery(
    "select * from clara.mint_wake_credential_for_task($1,$2,$3,$4,'00:30:00'::interval)",
    ["close_prep", firm, client, task]);
  return { task, credentialId: c.rows[0].credential_id, secret: c.rows[0].secret };
}

/** A credential with NO task binding (the legacy five-arg minter). Used to prove
 *  `wake_task_unbound`: no binding, no act. */
export async function mintUnboundClosePrep(firm, client) {
  const c = await rootQuery(
    "select * from clara.mint_wake_credential($1,$2,$3,'00:30:00'::interval,$4)",
    ["close_prep", firm, null, client]);
  return { credentialId: c.rows[0].credential_id, secret: c.rows[0].secret };
}

/** Call a wake wrapper through a REAL clara_wake_interactive session with the credential's
 *  secret bound txn-local -- the production path, so a missing grant or an argument-name
 *  mismatch is a finding here rather than something a direct core call would smooth over. */
export function callWake(secret, name, specs, params) {
  const sql = `select clara.${name}(${specs
    .map((s, i) => `${s.name} => $${i + 1}${s.cast ? `::${s.cast}` : ""}`)
    .join(", ")}) as r`;
  return wakeQuery(ROLES.wakeInteractive, secret, sql, params).then((r) => r.rows[0].r);
}

const TRIPLE = [{ name: "p_rationale" }, { name: "p_model", cast: "jsonb" }, { name: "p_op_key" }];

/** The four verbs the battery drives most, each with its subject kind pre-bound so a cell reads
 *  as one line. Every one derives its own op key from the session's task. */
export const VERBS = {
  dryRun: (s, { client, fy, rationale = RATIONALE, model = MODEL, opKey }) =>
    callWake(s.secret, "wake_dry_run_close_readiness",
      [{ name: "p_client", cast: "uuid" }, { name: "p_fy", cast: "uuid" }, ...TRIPLE],
      [client, fy, rationale, JSON.stringify(model),
        opKey ?? derivedOpKey(s.task, "wake_dry_run_close_readiness", fy)]),
  listFy: (s, { client, rationale = RATIONALE, model = MODEL, opKey }) =>
    callWake(s.secret, "wake_list_fiscal_years",
      [{ name: "p_client", cast: "uuid" }, ...TRIPLE],
      [client, rationale, JSON.stringify(model),
        opKey ?? derivedOpKey(s.task, "wake_list_fiscal_years", client)]),
  begin: (s, { fy, rationale = RATIONALE, model = MODEL, opKey }) =>
    callWake(s.secret, "wake_begin_close",
      [{ name: "p_fy", cast: "uuid" }, ...TRIPLE],
      [fy, rationale, JSON.stringify(model),
        opKey ?? derivedOpKey(s.task, "wake_begin_close", fy)]),
  abandon: (s, { run, reason = "f-a4-pr1c: rig abandon", rationale = RATIONALE, model = MODEL, opKey }) =>
    callWake(s.secret, "wake_abandon_close",
      [{ name: "p_close_run", cast: "uuid" }, { name: "p_reason" }, ...TRIPLE],
      [run, reason, rationale, JSON.stringify(model),
        opKey ?? derivedOpKey(s.task, "wake_abandon_close", run)]),
  propose: (s, { run, drafted, narrative = "f-a4-pr1c: the year is ready but for these items",
      rationale = RATIONALE, model = MODEL, opKey }) =>
    callWake(s.secret, "wake_propose_close",
      [{ name: "p_close_run", cast: "uuid" }, { name: "p_drafted", cast: "jsonb" },
        { name: "p_narrative" }, ...TRIPLE],
      [run, JSON.stringify(drafted), narrative, rationale, JSON.stringify(model),
        opKey ?? derivedOpKey(s.task, "wake_propose_close", run)]),
};

/** The receipt row a wake act minted, read straight off the table as root (there is no DML grant
 *  anywhere, so this is the only honest way to see one from a test). */
export async function receiptById(id) {
  const r = await rootQuery("select * from clara.agent_act_receipts where id = $1", [id]);
  return r.rows[0] ?? null;
}

export async function proposalRows(run) {
  const r = await rootQuery(
    "select * from clara.close_proposals where close_run_id = $1 order by created_at, id", [run]);
  return r.rows;
}

/** Every failing token on a refusal answer, flattened -- so a cell asserts the vocabulary rather
 *  than a vector's shape. */
export function tokens(answer) {
  return (answer?.rung_vector ?? []).map((v) => v.token).sort();
}

/** An UNAPPROVED draft dated inside the FY: the plainest way to make the drawer-2
 *  `unapproved_drafts_in_period` gate FAIL with the entry id as its outstanding item key, which
 *  is what gives wake_propose_close something to draft an attestation for. Written through the
 *  governed draft door, never a hand-built row. */
export async function inPeriodDraft(sub, opts) {
  return (await inPeriodDraftFull(sub, opts)).entry;
}

/** The same draft, with the revision token beside the id: clara.approve_entry is revision-gated,
 *  so a cell that means to APPROVE the draft afterwards needs the token the door will demand. */
export async function inPeriodDraftFull(sub, { client, postingDate, memo, debit, credit, cents }) {
  const d = await draftEntryV3(sub, {
    client,
    resolution: freshResolution(sub, client, { subjectKind: "manual", subjectId: null }),
    memo, postingDate,
    lines: [
      { account_code: debit, debit_cents: cents, credit_cents: 0, description: "dr" },
      { account_code: credit, debit_cents: 0, credit_cents: cents, description: "cr" },
    ],
    opKey: opk("fa4c-draft"),
  });
  // The revision token rides back beside the id: approve_entry is revision-gated, so a caller that
  // wants to APPROVE this draft later needs the token the door will demand.
  return { entry: d.entry_id, revision: d.revision_token };
}

export const uniq = () => randomUUID().slice(0, 8);

// ---------------------------------------------------------------------------
// Readiness + the scene, shared by BOTH battery files (the ladder/freeze/proposal half and the
// walls/census half). One definition, so the two files cannot drift about what "ready" means.
// ---------------------------------------------------------------------------

const state = { ready: false, has56: false, hasLimb: false };

export async function ensureLimb(noteLane) {
  state.ready = await waveAEnsureReady();
  if (!state.ready) { noteLane("0011 surface absent -- f-a4-pr1c battery skipped"); return state; }
  state.has56 = await has0056();
  if (!state.has56) { noteLane("0056 (close model) absent -- f-a4-pr1c battery skipped"); return state; }
  state.hasLimb = await hasPR1C();
  if (!state.hasLimb) noteLane("F-A4 PR-1c not applied -- f-a4-pr1c battery dormant");
  return state;
}

export function limbGate(t, markSkip) {
  if (!state.ready || !state.has56 || !state.hasLimb) {
    markSkip();
    t.skip("F-A4 PR-1c (the close agent limb) not applied -- this battery dormant");
    return true;
  }
  return false;
}

/** A fresh firm + a closeable PAST-DATED FY + a clocked close_prep session over it. Past-dated
 *  (2025) deliberately: clara.close_prep_due() only admits a year whose ends_on has passed on the
 *  BOOK clock, so a future-dated fixture would make the clock cells vacuous. */
export async function scene(tag, { startsOn = "2025-01-01" } = {}) {
  const w = await buildWorld();
  const alice = w.users.alice, bob = w.users.bob;
  const fx = await cleanCloseableFY(alice, { tag: `fa4c_${tag}_${uniq()}`, prepSub: bob, startsOn });
  const firm = await firmOf(fx.client);
  const s = await mintClosePrepSession(firm, fx.client);
  return { w, alice, bob, firm, ...fx, s };
}
