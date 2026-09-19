// F-A2 PR-1 — the AGENTIC POSTING battery's GATES, VOCABULARY and VERB (NOT a test file: the
// name does not end in `.test.mjs`, so `node --test` ignores it). The world-building half is
// `f-a2-post-world.mjs`, which re-exports this module so a battery imports ONE leaf; the split
// is the repo's 500-line file ceiling, and the seam is "instruments vs fixtures" — the same
// seam `x42-s5-helpers.mjs` names in its own header.
//
// CONTRACT-BLIND, and that is the whole point. Every constant, every call shape and every
// fixture here is derived from `docs/plan/active/f-a2-agentic-posting-design.md` §3 and its
// annexes (Annex C the cell manifest, Annex E the vocabulary and receipt shape, Annex F the
// `posted` chain, Annex I B4's formulas) — NEVER from the sibling lane's migration source,
// which is being authored in parallel and which no cell in this battery has read. When the
// migrations land, a divergence between them and this module is a real FINDING on one side or
// the other, and which side is wrong is decided at integration, not here.
//
// THE WIRE CONTRACT THIS MODULE ENCODES (design §3.1, §3.2, Annex E.0/E.1):
//
//   clara.wake_post_entry(p_entry, p_expected_revision, p_client, p_books_version,
//                         p_rationale, p_model, p_op_key) returns jsonb
//     granted to clara_wake_interactive and NOTHING else; allowlist rows per posting wake
//     kind; raises only, carries NO DML.
//
//   the returned receipt (Annex E.0):
//     { entry_id, posted, status, refusal: {tier, reason}|null, rung_vector: {B1..B15},
//       post_receipt_id, verdict: {corroborated, extraction_id, total_cents,
//                                  total_fact_hash, type_code} }
//
// THE FRONTIER GATES, and why every cell that touches the new surface carries one. The
// `db-slice-frontiers` matrix runs this package against databases pinned at EARLIER frontiers
// (d-b0..b3 stop at 0042-0045), and the estate's own B.3 lesson is that an unconditional
// assertion about a not-yet-born object reds those legs while saying nothing about the thing
// under test. So the gates key on the migration's STABLE STEM, never its number — numbers are
// claimed at MERGE (standing law), and a `like '0103_%'` gate would silently stop gating the
// moment the file is renumbered. Three stems, because PR-1 ships THREE files in ONE D1 window
// (design §5 step 2) and each is separately provable:
//
//   f_a2_posting_core$    the ladder, the receipt table, T3's recuts, the 8th body
//   f_a2_posting_grants$  the granted wrapper, its single grant, the allowlist rows, the census
//   f_a2_posted_chain$    Annex F's five layers, inert until PR-2 emits `posted`
//
// The gates are INDEPENDENT rather than one combined DRIFT throw (the f-a2-fixtures idiom):
// three numbered files apply in three separate transactions, so a mid-window read is a real
// state a `deploy-onto-existing` check can observe, and a battery that threw there would be
// reporting a runner artefact as a build defect. A cell states which surface it needs.

import {
  ROLES, rootQuery, roleQuery, wakeQuery, opk, markSkip,
} from "./f-a2-fixtures.mjs";

export * from "./f-a2-fixtures.mjs";
// `rig-txn.mjs` is NOT in the f-a2-fixtures re-export chain, and two of its instruments are
// load-bearing here: `truncateGuardError` (never assert an append-only guard with a bare
// TRUNCATE — the assertion would observe a lock race instead of the guard) and `withTxn`.
export { truncateGuardError, withTxn } from "./rig-txn.mjs";

// ===========================================================================
// 1 · The frontier gates.
// ===========================================================================

/** The three PR-1 migration STEMS (design §5 step 2), plus PR-1b's. Stems, never numbers. */
export const F_A2_STEMS = {
  core: "f_a2_posting_core$",
  grants: "f_a2_posting_grants$",
  chain: "f_a2_posted_chain$",
  /** PR-1b — the `get_context_pack` fifth splice, a read body with no D1 window. */
  pack: "f_a2_pack_splice$",
  /** PR-2's GM-10 — the withdrawal re-admit door. Its own migration file, applied on top of
   *  (never inside) `core`, so a DB that has `core` but not this file must SKIP the two GM-10
   *  cells rather than hard-fail on a function that does not exist yet (a numbered-only
   *  control DB proved this: `gateCore` alone let those cells reach the call). */
  readmit: "f_a2_gm10_withdrawal_readmit$",
};

/** True iff a migration whose version matches `stem` is recorded applied. Catalog-probed
 *  against `clara.schema_migrations`, never inferred from a file listing: the frontier legs
 *  run against databases whose repo checkout is irrelevant to what is applied. */
export async function appliedStem(stem) {
  try {
    const r = await rootQuery(
      "select count(*)::int as n from clara.schema_migrations where version ~ $1", [stem]);
    return r.rows[0].n > 0;
  } catch {
    return false;
  }
}

const _cache = new Map();
async function once(key, fn) {
  if (!_cache.has(key)) _cache.set(key, await fn());
  return _cache.get(key);
}

export const postingCoreReady = () => once("core", () => appliedStem(F_A2_STEMS.core));
export const postingGrantsReady = () => once("grants", () => appliedStem(F_A2_STEMS.grants));
export const postedChainReady = () => once("chain", () => appliedStem(F_A2_STEMS.chain));
export const packSpliceReady = () => once("pack", () => appliedStem(F_A2_STEMS.pack));
export const readmitReady = () => once("readmit", () => appliedStem(F_A2_STEMS.readmit));

/** PR-2's runtime lane is a TypeScript deliverable with no DB stem of its own. A cell that
 *  needs it is skip-guarded on the named reason rather than on a probe that cannot exist —
 *  absence is not evidence (review law 2), so the guard says WHY it skipped and never lets a
 *  PR-2-dependent claim read as proven at PR-1. */
export const PR2_PENDING = "PR-2 (autoDraft_v9 / classifySettleReceipt / the re-admit door) has not shipped";
export const PR1B_PENDING = "PR-1b (the get_context_pack fifth splice) has not shipped";
export const CHAT_PARITY_PENDING = "the chat-parity follow-on PR (GB-3 / §D.2c) has not shipped";
export const PR3_PENDING = "PR-3 (cutover + retirement) has not shipped";

/** A skip that stays COUNTED (the wave-a2 markSkip idiom) and names the missing surface. */
export function skipHere(t, why) {
  markSkip();
  t.skip(why);
  return true;
}

/** `if (await gateCore(t)) return;` — the house per-cell frontier gate. */
export async function gateCore(t) {
  return (await postingCoreReady())
    ? false : skipHere(t, `F-A2 PR-1 posting core absent (no ${F_A2_STEMS.core} migration applied)`);
}
export async function gateGrants(t) {
  return (await postingGrantsReady())
    ? false : skipHere(t, `F-A2 PR-1 posting grants absent (no ${F_A2_STEMS.grants} migration applied)`);
}
export async function gateChain(t) {
  return (await postedChainReady())
    ? false : skipHere(t, `F-A2 PR-1 posted chain absent (no ${F_A2_STEMS.chain} migration applied)`);
}
export async function gatePack(t) {
  return (await packSpliceReady()) ? false : skipHere(t, PR1B_PENDING);
}
export async function gateReadmit(t) {
  return (await readmitReady())
    ? false : skipHere(t, `F-A2 PR-2 GM-10 readmit door absent (no ${F_A2_STEMS.readmit} migration applied)`);
}

// ===========================================================================
// 2 · Annex E — the closed vocabulary. Every assertion in this battery uses THESE strings.
// ===========================================================================

/** The THIRTEEN Tier-B rungs, in ladder order. B12/B13 were CUT at the gate (GM-3) and their
 *  numbers are RETIRED, NEVER REUSED — a vector carrying either is a finding, and
 *  `assertVectorShape` says so rather than ignoring the key. */
export const TIER_B_RUNGS = ["B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B9", "B10", "B11", "B14", "B15"];
export const TIER_B_RETIRED_RUNGS = ["B12", "B13"];

/** rung → token (design §3.2's table; the tokens are Annex E.2's Tier-B set). */
export const RUNG_TOKEN = {
  B1: "settlement_kind_human",
  B2: "not_corroborated",
  B3: "anchor_unbound",
  B4: "anchor_untied",
  B5: "amount_conflict",
  B6: "human_override_present",
  B7: "unverified_evidence",
  B8: "facts_moved",
  B9: "open_question_blocks",
  B10: "supplier_leg_shape",
  B11: "sales_leg_shape",
  B14: "generic_control_leg",
  B15: "generic_on_directional_document",
};
/** C6-rider: B15 carries a SECOND Annex E.2 reason. `generic_on_directional_document` says the
 *  document has a direction; `generic_registration_untestable` says it STATES an identity this
 *  client cannot check. Different findings, different remedies (record the other identifier), so
 *  different reasons — and both are Tier-B members. */
export const B15_UNTESTABLE = "generic_registration_untestable";
export const TIER_B_TOKENS = [...TIER_B_RUNGS.map((r) => RUNG_TOKEN[r]), B15_UNTESTABLE];

/** Tier-D vocabulary (Annex E.2) — recorded in `last_refusal`, NEVER a receipt. The six left
 *  Tier B when B12/B13 were cut on correctness grounds. */
export const TIER_D_TOKENS = [
  "fa_belt_unregistered_movement", "fa_cost_adjustment_deferred", "fa_k_gl_balance_on_enrolled",
  "advance_mirror_unregistered", "advance_movement_unregistered", "advance_application_missing",
];
/** …and the two DECLARED-UNREACHABLE ones (law 31): opening entries are refused CLR31
 *  K-family-only, and a reversal is not an agent draft under A8. Declared, not cell-forced. */
export const TIER_D_DECLARED_UNREACHABLE = ["advance_mirror_unregistered", "advance_application_missing"];
/** B13's token stays SPLIT BY AXIS (M-5) and the split survives the move to Tier D: the mirror
 *  case carries `'axis':'unregistered_mirror'` in its own detail, the general case does not. */
export const ADV_MIRROR_AXIS = "unregistered_mirror";

/** Tier C — `(errcode, reason)` PAIRS ONLY (design §3.2's table). No wildcards, no
 *  errcode-only members; the set may only GROW and an unlisted pair propagates as a task
 *  failure. */
export const TIER_C_PAIRS = [
  ["CLR25", "currency_unsupported"],
  ["CLR25", "corroboration_contradicted"],
  ["CLR23", "counterparty_landscape_moved"],
  ["CLR23", "registration_conflict"],
  ["CLR23", "counterparty_birth_race"],
  ["CLR10", "customer_identity_name_only"],
  ["CLR21", "duplicate_bill"],
  ["CLR21", "duplicate_sales"],
  ["CLR19", "write_into_closed_period"],
];

/** Explicitly NOT members, each with its recorded ground (Annex E.2). A cell asserts the
 *  EXCLUSION rather than leaving it an absence — law 31 forbids listing a wall that can never
 *  be asked, and law 2 forbids treating an absence as evidence. */
export const TIER_C_EXCLUDED = [
  ["CLR10", "settlement_not_autopostable", "dead on this lane — B1 is the live wall"],
  ["CLR10", "already_reversed", "left the pair set at the gate — A8 admits only an untouched agent draft in `draft` status"],
  ["CLR26", "open_question_race", "unreachable by Tier A's lock ordering (GM-7); named only as that fold's fallback"],
];

/** The three-valued rung vector (law 68). The third value exists so an absent input can never
 *  read as a pass — `pass` there is the ARM-0 defect. */
export const VERDICT_VALUES = ["pass", "fail", "not_evaluable"];

export const APPROVAL_ARM_AGENT = "agent_unattended";
/** `via_wake_kind` admits these two ONLY — not `interactive_client`, which per R-1 is minted
 *  solely for `wake_open_question` and never carries a post (Annex E.1). */
export const RECEIPT_WAKE_KINDS = ["autodraft", "interactive"];
export const EVENT_POSTED = "entry.posted";
export const EVENT_POST_REFUSED = "entry.post_refused";

/** The three new post-path verbs `WB_AUTHORITY_FNS` gains (design §3.6 / §D.4, C.11). */
export const F_A2_POST_VERBS = ["wake_post_entry", "_agent_post_entry_core", "_tf_assert_agent_post_receipt"];

/** The `posted` outcome as Annex F spells it, and the five values the CHECK holds today. */
export const OUTCOME_POSTED = "posted";
export const SWEEP_OUTCOMES_PRE_F_A2 = ["drafted", "skipped_lane", "refused_budget", "refused_attempts", "noop_existing"];

// ===========================================================================
// 3 · The M-4 CONSUMER CONTRACT, as executable code.
//
// Design §3.2, stated as a design law: **no consumer may test `vector[r] = 'fail'`.** Every
// consumer tests for `'pass'` and treats everything else — `fail`, `not_evaluable`, an unknown
// future value, a MISSING KEY — as non-admitting, since testing for `fail` lets a rung added
// later silently admit. This battery is a consumer, so it obeys its own law: no assertion in it
// ever compares a vector slot to `'fail'`, and the doctored-vector cell exists to prove that a
// consumer written the other way would break.
// ===========================================================================

/** The ONLY admitted-read in this battery. Anything that is not exactly `'pass'` — including a
 *  missing key and an unknown value — is non-admitting. */
export const admits = (vector, rung) =>
  !!vector && Object.prototype.hasOwnProperty.call(vector, rung) && vector[rung] === "pass";

/** Every rung admits ⇒ an empty failing-rung vector ⇒ the only thing that posts. */
export const admitsAll = (vector) => TIER_B_RUNGS.every((r) => admits(vector, r));

/** The rungs that did NOT admit, for a message a human can act on. */
export const nonAdmitting = (vector) => TIER_B_RUNGS.filter((r) => !admits(vector, r));

/** Assert the vector is COMPLETE and three-valued: every one of the thirteen rungs present with
 *  a value from the closed set, neither retired number reused, and no rung silently omitted
 *  (an omitted rung is exactly the shape a `fail`-testing consumer would admit). */
export function assertVectorShape(assert, vector, label) {
  assert.ok(vector && typeof vector === "object", `${label}: the receipt carries a rung_vector object`);
  for (const r of TIER_B_RUNGS) {
    assert.ok(Object.prototype.hasOwnProperty.call(vector, r),
      `${label}: rung ${r} is present — all thirteen rungs are EVALUATED, always (design §3.2)`);
    assert.ok(VERDICT_VALUES.includes(vector[r]),
      `${label}: rung ${r} carries one of ${VERDICT_VALUES.join("/")} (got ${JSON.stringify(vector[r])}) — law 68's three-valued vector`);
  }
  for (const r of TIER_B_RETIRED_RUNGS) {
    assert.ok(!Object.prototype.hasOwnProperty.call(vector, r),
      `${label}: retired rung ${r} does NOT appear — B12/B13 were cut at the gate (GM-3), their numbers never reused`);
  }
}

/** The LOOSE form, for a fixture that unavoidably breaks more than one rung: assert the post
 *  did not happen, that `rung` does not admit, and that the refusal is a Tier-B verdict naming
 *  SOME rung's token. Used where forcing one rung in isolation is impossible without doctoring
 *  the entry — a cell that claimed isolation it did not have would be the stronger lie. */
export function assertNonAdmitting(assert, receipt, rung, label) {
  assert.equal(receipt?.posted, false, `${label}: the post did not happen`);
  assert.ok(!admits(receipt?.rung_vector, rung),
    `${label}: rung ${rung} does not admit (got ${JSON.stringify(receipt?.rung_vector?.[rung])})`);
  assert.equal(receipt?.refusal?.tier, "B", `${label}: a Tier-B admission verdict, not a raise`);
  assert.ok(TIER_B_TOKENS.includes(receipt?.refusal?.reason),
    `${label}: the refusal names an Annex E Tier-B token (got ${JSON.stringify(receipt?.refusal?.reason)}); non-admitting rungs were ${nonAdmitting(receipt?.rung_vector).join(",")}`);
}

/** Assert `rung` did not admit AND the refusal names its Annex E token — the consumer-side
 *  shape every negative Tier-B cell in this battery uses. */
export function assertRefusedAt(assert, receipt, rung, label) {
  assert.equal(receipt?.posted, false, `${label}: the post did not happen`);
  assert.ok(!admits(receipt?.rung_vector, rung),
    `${label}: rung ${rung} does not admit (got ${JSON.stringify(receipt?.rung_vector?.[rung])})`);
  assert.equal(receipt?.refusal?.tier, "B", `${label}: a Tier-B admission verdict, not a raise`);
  assert.equal(receipt?.refusal?.reason, RUNG_TOKEN[rung],
    `${label}: the refusal names Annex E's token '${RUNG_TOKEN[rung]}' for rung ${rung}`);
}

// ===========================================================================
// 4 · The verb, and the readbacks.
// ===========================================================================

/** A complete, well-formed model snapshot (Annex E.1's three required keys). */
export const MODEL = { provider: "anthropic", model: "claude-opus-5", version: "2026-08-01" };
export const RATIONALE = "rig: the witness pair corroborates the printed total and every ladder rung admits";

/**
 * clara.wake_post_entry called by its PINNED name and parameter names (design §3.1). A 42883 or
 * a parameter-name divergence when the surface IS applied is a FINDING surfaced by the calling
 * cell, never smoothed over here.
 *
 * `model` and `rationale` default to the well-formed shapes so a negative cell breaks exactly
 * ONE term. Passing `secret: null` makes the call with NO credential at all — the wrapper opens
 * with `wake_context()` and must refuse CLR03 before it reads anything else.
 */
export async function wakePostEntry(cred, {
  entry, expectedRevision, client, booksVersion: bv,
  rationale = RATIONALE, model = MODEL, opKey = null,
  role = ROLES.wakeInteractive, secret = undefined,
} = {}) {
  // EVERY ARGUMENT IS CAST, and `p_expected_revision` is the one that matters. The estate's
  // revision tokens are UUID everywhere — `journal_entries.revision_token` is
  // `gen_random_uuid()` (`0016:4909-4913`), `approve_entry` and `_approve_entry_core` both
  // declare `p_expected_revision uuid` — so a bare `$2` (which the driver sends as unknown and
  // the planner resolves to text) misses the function by SIGNATURE and comes back 42883
  // "function does not exist". That reads like an absent verb and is really a wrong call.
  const sql =
    "select clara.wake_post_entry(p_entry => $1::uuid, p_expected_revision => $2::uuid, "
    + "p_client => $3::uuid, p_books_version => $4::bigint, p_rationale => $5::text, "
    + "p_model => $6::jsonb, p_op_key => $7::text) as r";
  const params = [
    entry, expectedRevision, client, bv,
    rationale,
    model === null ? null : JSON.stringify(model),
    opKey ?? opk("post"),
  ];
  const sec = secret !== undefined ? secret : cred?.secret ?? null;
  if (sec === null) {
    const r = await roleQuery(role, sql, params);
    return r.rows[0].r;
  }
  const r = await wakeQuery(role, sec, sql, params);
  return r.rows[0].r;
}

/**
 * Run `fn(client)` inside an explicit transaction on a DEDICATED pooled client and COMMIT it.
 *
 * IT COMMITS ON SUCCESS — the doc comment used to say "ALWAYS roll back", which is the opposite
 * of what the body does, and callers depend on the commit: `doctorLines`, `doctorFlags` and the
 * period/fiscal-year fixtures all expect their writes to be there afterwards. A reader who
 * believed the comment would build a fixture whose setup silently vanished.
 *
 * Returns `{ value }` on success or `{ error }` on the first raise — including a raise that only
 * happens at COMMIT, which is the entire point: a deferred constraint trigger fires there and
 * nowhere earlier, so a helper that swallowed the commit would make every Tier-D cell green for
 * the wrong reason. On any error the transaction is rolled back whole. The client is reset
 * (rollback → reset role → reset all) before it goes back to the pool, per the rig's own hygiene
 * rule — which is also why DDL doctored inside a FAILED window cannot leak.
 */
export async function withTxnOrNull(fn) {
  const { getPool } = await import("./rig-helpers.mjs");
  const c = await getPool().connect();
  try {
    await c.query("begin");
    const value = await fn(c);
    await c.query("commit");
    return { value };
  } catch (error) {
    return { error };
  } finally {
    await c.query("rollback").catch(() => {});
    await c.query("reset role").catch(() => {});
    await c.query("reset all").catch(() => {});
    c.release();
  }
}

/**
 * Merge `flags` onto a DRAFT entry as root, and hand back the new token.
 *
 * B6 is the reason this exists. Every LAWFUL override arrives through `revise_entry`, which also
 * stamps `last_human_editor` — and A8 refuses on that BEFORE the ladder reaches B6, so a
 * revise-built fixture proves A8 twice and B6 never. Doctoring puts the override on an
 * otherwise-untouched agent draft, which is the only shape that isolates the rung. The draft
 * writer will not do it either: `p_flags` is not a passthrough, and the core computes
 * `amount_exception` itself from the leg divergence (`0009:1361-1367`).
 */
export async function doctorFlags(entry, flags) {
  const out = await withTxnOrNull((c) => c.query(
    "update clara.journal_entries set flags = coalesce(flags,'{}'::jsonb) || $2::jsonb where id=$1",
    [entry, JSON.stringify(flags)]));
  if (out.error) return { ok: false, code: out.error.code, message: out.error.message };
  const r = await rootQuery("select flags, revision_token from clara.journal_entries where id=$1", [entry]);
  return { ok: true, flags: r.rows[0]?.flags, revisionToken: r.rows[0]?.revision_token };
}

/** The post receipt row for an entry (root readback; no role holds DML on it). */
export async function postReceiptRow(entry) {
  const r = await rootQuery(
    "select to_jsonb(x) as row from clara.entry_post_receipts x where x.entry_id=$1", [entry]);
  return r.rows[0]?.row ?? null;
}
export async function postReceiptCount(entry) {
  const r = await rootQuery(
    "select count(*)::int as n from clara.entry_post_receipts where entry_id=$1", [entry]);
  return r.rows[0].n;
}

/** The op receipt a Tier-B refusal COMMITS — the vector's first durable home (M-3). */
export async function opReceiptResult(firm, opKey, fn = "wake_post_entry") {
  const r = await rootQuery(
    "select result from clara.op_receipts where firm_id=$1 and fn=$2 and op_key=$3", [firm, fn, opKey]);
  return r.rows[0]?.result ?? null;
}
/** …and its exact BYTES, for the replay cell (the 0023:357 exact-diff idiom). */
export async function opReceiptText(firm, opKey, fn = "wake_post_entry") {
  const r = await rootQuery(
    "select result::text as t from clara.op_receipts where firm_id=$1 and fn=$2 and op_key=$3", [firm, fn, opKey]);
  return r.rows[0]?.t ?? null;
}

/** The domain events an entry's post emitted, oldest first. */
export async function entryEvents(entry, types = [EVENT_POSTED, EVENT_POST_REFUSED]) {
  const r = await rootQuery(
    `select to_jsonb(d) as row from clara.domain_events d
      where d.event_type = any($2) and (d.entry_id = $1 or d.payload->>'entry_id' = $1::text)
      order by d.seq`, [entry, types]);
  return r.rows.map((x) => x.row);
}

/** `clara.autodraft_attempts.last_refusal` — where a Tier-D abort's `(errcode, reason)` lands.
 *
 *  THE RELATION IS MEASURED, NOT REMEMBERED. This helper read `clara.agent_tasks.last_refusal`.
 *  The TABLE is real; the COLUMN is not — so the read raised 42703 (undefined_column), not the
 *  42P01 an absent relation would have given. The distinction matters, and getting it wrong here
 *  once is the reason it is spelled out: "the name resolves" is not "the thing I want is there",
 *  which is review law 3 arriving one level down from where it is usually quoted. The only cell
 *  that called this returned early before ever reaching the read, so nothing ever said so either
 *  way. `last_refusal` lives on `clara.autodraft_attempts` — one row per attempt, keyed by task —
 *  and that is the catalog's own answer (information_schema over both candidates, not a guess at
 *  a plausible name). */
export async function lastRefusalOf(task) {
  const r = await rootQuery(
    `select last_refusal from clara.autodraft_attempts
      where task_id=$1 order by created_at desc nulls last, id desc limit 1`, [task]);
  return r.rows[0]?.last_refusal ?? null;
}

/** Annex F's layers 1/3/5 are read here. */
export async function sweepItemRow(run, filing) {
  const r = await rootQuery(
    "select to_jsonb(i) as row from clara.sweep_run_items i where i.run_id=$1 and i.filing_id=$2", [run, filing]);
  return r.rows[0]?.row ?? null;
}
export async function sweepRunRow(run) {
  const r = await rootQuery("select to_jsonb(s) as row from clara.sweep_runs s where s.id=$1", [run]);
  return r.rows[0]?.row ?? null;
}

// ===========================================================================
// 5 · §D.1's tier census — the pg_trigger REPLAY (C.5's first cell).
//
// Deferrability is a `pg_trigger` FACT, not a list anyone should write from memory: two
// independent readers already got it wrong FROM SOURCE (v1 placed two non-deferred triggers in
// Tier D; the review's corrected list was short by five — P1). So the cell reads the catalog and
// compares it against the pinned table in BOTH directions — a missing row and an extra row are
// each a finding.
// ===========================================================================

export async function jeTriggerCensus(relation = "clara.journal_entries") {
  const r = await rootQuery(
    `select tgname, tgdeferrable, tginitdeferred
       from pg_trigger where tgrelid = $1::regclass and not tgisinternal
      order by tgname`, [relation]);
  return r.rows.map((x) => ({ tgname: x.tgname, deferrable: x.tgdeferrable, initdeferred: x.tginitdeferred }));
}

/**
 * §D.1's prediction, PINNED — and CONFIRMED BY RIG REPLAY at the pre-F-A2 frontier (migrations
 * 0001-0102, throwaway `postgres:17`, 2026-08-22) rather than read off migration source. The
 * annex's own standing caveat is that source reading is defeated by base+dynamic splices and by
 * uppercase `pg_get_functiondef` round-trips, and deferrability is precisely the class it names
 * as a catalog fact.
 *
 * WHAT THE REPLAY FOUND: SIXTEEN triggers, and every one matched the design's prediction on both
 * booleans — the eleven deferred constraint triggers §D.1 lists, plus `t_period_wall` and
 * `t_je_immutable` NON-deferred (which is what makes them Tier C and catchable), plus the three
 * non-refusal-bearing plain triggers. So §D.1's table is now MEASURED rather than predicted, and
 * P1's "the corrected list was short by five" is closed. `tier` below is the DESIGN's
 * disposition, carried so a future corrected row reports which tier it lands in rather than only
 * that a boolean moved.
 */
export const D1_TRIGGER_PREDICTION = [
  { tgname: "t_je_adv_movement_belt", deferrable: true, initdeferred: true, tier: "D pure — B13 CUT (GM-3)" },
  { tgname: "t_je_balance", deferrable: true, initdeferred: true, tier: "D" },
  { tgname: "t_je_bank_match_reversal_belt", deferrable: true, initdeferred: true, tier: "D — not reachable draft→approved" },
  { tgname: "t_je_bank_pending_orphan_belt", deferrable: true, initdeferred: true, tier: "D — unreachable in F-A2; F-A3 obligation (M-2)" },
  { tgname: "t_je_customer_receipt_shape", deferrable: true, initdeferred: true, tier: "D — unreachable, B1 refuses the kind" },
  { tgname: "t_je_fa_movement_belt", deferrable: true, initdeferred: true, tier: "D pure — B12 CUT (GM-3)" },
  { tgname: "t_je_immutable", deferrable: false, initdeferred: false, tier: "C — CLR08 propagates, never converted" },
  { tgname: "t_je_no_truncate", deferrable: false, initdeferred: false, tier: "— not refusal-bearing" },
  { tgname: "t_je_provenance", deferrable: true, initdeferred: true, tier: "D" },
  { tgname: "t_je_sales_invoice_shape", deferrable: true, initdeferred: true, tier: "D + B11 pre-check on the PROJECTED state" },
  { tgname: "t_je_stamp", deferrable: false, initdeferred: false, tier: "— not refusal-bearing" },
  { tgname: "t_je_subledger_belt", deferrable: true, initdeferred: true, tier: "D + B14 shape refusal" },
  { tgname: "t_je_supplier_bill_shape", deferrable: true, initdeferred: true, tier: "D + B10 pre-check on the PROJECTED state" },
  { tgname: "t_je_supplier_payment_shape", deferrable: true, initdeferred: true, tier: "D — unreachable, B1 refuses the kind" },
  { tgname: "t_period_wall", deferrable: false, initdeferred: false, tier: "C — (CLR19, write_into_closed_period)" },
  { tgname: "t_snapshot_staleness", deferrable: false, initdeferred: false, tier: "— not refusal-bearing" },
];

/** The ONE trigger F-A2's core adds to `journal_entries` (design §3.3.2 / Annex E.3) — a
 *  deferred constraint trigger on the draft→approved transition, ARM-0 first. */
export const F_A2_NEW_JE_TRIGGER = {
  tgname: "t_je_agent_post_receipt", deferrable: true, initdeferred: true, tier: "D — the structural receipt wall",
};

/**
 * #634 [0182] — the ONE trigger the journal-evidence lane adds to `journal_entries`.
 *
 * A PLAIN trigger, not a constraint one, and that is its whole tier: it RAISES NOTHING. It fires
 * AFTER UPDATE OF `reversed_by` when the column moves null -> non-null, and its entire body
 * stamps `clara.entry_evidence_links.released_at = now()` for that entry — which is what frees
 * the document so the CORRECTED entry may cite it (LAW 6: reverse, then re-post). There is no
 * refusal path to file under a tier, and nothing about the posting ladder changes: an entry with
 * no evidence link sees a zero-row UPDATE.
 */
export const JOURNAL_EVIDENCE_JE_TRIGGER = {
  tgname: "t_entry_evidence_release", deferrable: false, initdeferred: false,
  tier: "— not refusal-bearing (it stamps entry_evidence_links.released_at and raises nothing)",
};

/**
 * #718 [0197] — the TWO triggers the document-coding lane's evidence-link lookback adds to
 * `journal_entries`, one per event (a BEFORE INSERT trigger's WHEN clause may not reference OLD,
 * so the INSERT and UPDATE conditions cannot be one trigger).
 *
 * TIER C, and the census is the place that says so. Both are PLAIN, NON-DEFERRED BEFORE ROW
 * triggers, which is deliberate and is exactly what puts them in Tier C beside `t_period_wall`
 * and `t_je_immutable`: the refusal (CLR13 `source_already_posted`, when a LIVE
 * `clara.entry_evidence_links` row already names the entry's document) fires INSIDE the
 * statement, so an exception block can catch and convert it, and it is raised while the wall
 * holds its `clara.documents` row lock — which is the serialization point #718 exists to add.
 * A deferred constraint trigger would fire at COMMIT, outside any subtransaction AND after the
 * lock window that makes the two-session race resolve, so it would be both uncatchable and
 * unserialized.
 *
 * They sort AFTER `t_je_immutable` and `t_period_wall` on purpose (PostgreSQL fires same-timing
 * row triggers in NAME order), so every refusal those two already own keeps its exact spelling.
 */
export const CODING_LINK_JE_TRIGGERS = [
  {
    tgname: "t_source_binding_wall_ins", deferrable: false, initdeferred: false,
    tier: "C — (CLR13, source_already_posted); catchable, and it holds the document lock while it asks",
  },
  {
    tgname: "t_source_binding_wall_upd", deferrable: false, initdeferred: false,
    tier: "C — (CLR13, source_already_posted); the draft→approved arm the coding lane actually takes",
  },
];

/**
 * #639 [0216] — the ONE trigger the fixed-asset acquisition lane adds to `journal_entries`.
 *
 * TIER D, and it is a DEFERRED CONSTRAINT trigger for the reason DECISIONS §1.4 gives: the Work
 * lane never calls `clara._subledger_on_approve`, so the acquisition birth had to be made
 * lane-agnostic without a sixth recut of the posting core. It performs `clara._fa_on_approve`
 * arm 4's insert with arm 4's own `on conflict (acquisition_line_id) do nothing`, so on the four
 * lanes that already birth it writes nothing.
 *
 * IT RAISES NOTHING OF ITS OWN — measured on the live body (no `raise exception` anywhere in
 * `clara._tf_fa_acquisition_birth`), so it carries no Tier-D token. It is still TIER D and not
 * "not refusal-bearing", because it is a CONSTRAINT trigger: any abort it does produce (a
 * constraint violation on the row it inserts) arrives at COMMIT, outside every exception block,
 * which is exactly the Tier-D property this file's header defines.
 */
export const FA_ACQUISITION_JE_TRIGGER = {
  tgname: "t_je_fa_acquisition_birth", deferrable: true, initdeferred: true,
  tier: "D — the lane-agnostic acquisition birth; raises no token of its own, aborts only through a constraint at COMMIT",
};

/**
 * #638 [0221] — the TWO triggers the staff-expense-claim lane adds to `journal_entries`, and they
 * sit in DIFFERENT tiers, which is why they are pinned separately rather than as a pair.
 *
 * `t_je_adv_claim_application_birth` is the advance half of the same DECISIONS §1.4 ruling: a
 * DEFERRED CONSTRAINT trigger that mints the `clara.staff_advance_applications` row the Work lane
 * would otherwise never get. Unlike #639's, it is GENUINELY REFUSAL-BEARING — measured on the live
 * body: CLR40 `advance_allocation_mismatch` and CLR39 `advance_over_application`. Both are raised
 * at COMMIT, so both are Tier-D ABORTS, never convertible refusals.
 *
 * NEITHER REASON IS ADDED TO `TIER_D_TOKENS`, deliberately. That set is pinned at exactly six by
 * `f-a2-ladder-3.test.mjs` (`c3.D-vocab`) and its membership rule is "the belt tokens that left
 * Tier B when B12/B13 were cut" — a BELT vocabulary, not a roster of every deferred trigger's
 * reasons. Widening it to carry a subledger-registration reason would change what that cell
 * asserts. Named here instead, and left as a follow-up for whoever decides whether the F-A2 ladder
 * should own a commit-time vocabulary beyond the belts.
 *
 * `t_je_staff_expense_claim_reversed` is a PLAIN, NON-deferred AFTER UPDATE trigger, in the same
 * class as `t_entry_evidence_release` above: its whole body appends a `reversed` row to
 * `clara.staff_expense_claim_status` with `on conflict (claim_id, state) do nothing` and raises
 * nothing, so there is no refusal path to file under a tier.
 */
export const STAFF_EXPENSE_CLAIM_JE_TRIGGERS = [
  {
    tgname: "t_je_adv_claim_application_birth", deferrable: true, initdeferred: true,
    tier: "D — the lane-agnostic advance-application birth (CLR40 advance_allocation_mismatch, CLR39 advance_over_application), both raised at COMMIT",
  },
  {
    tgname: "t_je_staff_expense_claim_reversed", deferrable: false, initdeferred: false,
    tier: "— not refusal-bearing (it appends the claim's `reversed` status row and raises nothing)",
  },
];

/**
 * #655 [0225] — the ONE trigger the trade-invoice lane adds to `journal_entries`.
 *
 * TIER D, AND IT ABORTS — DECISIONS §6.3's ruling on `reports/integration-merge.md` §5.1. The
 * wave-2026-09-18 integrator found this trigger UNPINNED, which is the one state this census
 * refuses: an unpinned constraint trigger has no tier, so nobody has decided whether a failed
 * open-item birth aborts the posting or converts into a refusal. It ABORTS, because ARCHITECTURE
 * §5.A's transaction boundary says a confirmed invoice and its open item are ONE fact
 * (「确认一张发票需要相应总账与 open item」): a trade invoice whose open item cannot be born
 * never posts at all.
 *
 * IT IS GENUINELY REFUSAL-BEARING, like #638's advance birth and unlike #639's acquisition birth
 * — measured on the live body (`p655.birth.abort_is_atomic` asserts the abort end to end, and
 * `f-a2.c5.trade-invoice-birth` asserts the three reasons are still in the live body):
 * `counterparty_kind_mismatch`, `wrong_control_domain` and `invalid_total`, all under CLR10 and
 * all raised at COMMIT, outside every exception block. That is the Tier-D property this file's
 * header defines.
 *
 * THE THREE REASONS ARE **NOT** ADDED TO `TIER_D_TOKENS`, for the reason
 * `STAFF_EXPENSE_CLAIM_JE_TRIGGERS` gives verbatim: that set is the BELT vocabulary, pinned at
 * exactly six by `f-a2-ladder-3.test.mjs` (`c3.D-vocab`), and widening it to carry a
 * subledger-birth reason would change what that cell asserts. Named here instead, as #638's were.
 *
 * NO DOOR IN THE ESTATE REACHES THESE THREE RAISES TODAY, and that is stated rather than implied:
 * `clara._assert_trade_invoice_basis` refuses a wrong-kind party and a wrong-class control leg at
 * admission (0225:706-717, 0225:895-899), ties the control leg's signed amount to the stated total
 * (0225:739-741), `clara.record_journal_entry` re-asks the control-leg class at commit
 * (0225:1757-1772) behind a basis-digest wall that refuses any basis but the admitted one
 * (0225:1684-1689), and `clara.trade_invoices` / `clara.counterparties` are both append-only
 * after the fact. So the trigger is a BELT BEHIND CLOSED DOORS — which is exactly why its tier
 * has to be written down: the day a door is loosened, this is what happens, and it happens at
 * COMMIT.
 */
export const TRADE_INVOICE_JE_TRIGGER = {
  tgname: "t_je_open_item_birth", deferrable: true, initdeferred: true,
  tier: "D — the lane-agnostic open-item birth; ABORTS (CLR10 counterparty_kind_mismatch, wrong_control_domain, invalid_total), all raised at COMMIT, and a failed birth leaves no entry, no receipt and no posted status row",
};

/**
 * The pinned census for THIS database's frontier.
 *
 * FRONTIER-GATED, for the reason the 0042 clock roster's own header gives: `db-slice-frontiers`
 * runs this battery against databases pinned BELOW 0182, where `t_entry_evidence_release` does
 * not exist — and an unconditional pin would report it MISSING on every one of those legs, a
 * one-name diff that says nothing about trigger tiering. Keyed on the migration's STABLE STEM,
 * never its number.
 */
export async function jeTriggerPins() {
  const pins = [...D1_TRIGGER_PREDICTION, F_A2_NEW_JE_TRIGGER];
  const r = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ 'journal_work_evidence$'");
  if (r.rows[0].n > 0) pins.push(JOURNAL_EVIDENCE_JE_TRIGGER);
  // #718 [0197] — gated on ITS OWN stem for the same reason 0182's is gated on 0182's: a leg
  // pinned below this migration carries neither wall, and an unconditional pin would report both
  // MISSING there.
  const w = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ 'coding_lane_evidence_link$'");
  if (w.rows[0].n > 0) pins.push(...CODING_LINK_JE_TRIGGERS);
  // #718 END
  // #639 [0216] / #638 [0221] — the wave-2026-09-15 birth triggers, each gated on ITS OWN stem for
  // the same reason 0182's and 0197's are gated on theirs: `db-slice-frontiers` runs this battery
  // against databases pinned below these migrations, where the triggers do not exist, and an
  // unconditional pin would report them MISSING on every one of those legs.
  const fa = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ 'fixed_asset_acquisition$'");
  if (fa.rows[0].n > 0) pins.push(FA_ACQUISITION_JE_TRIGGER);
  const sec = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ 'staff_expense_claims$'");
  if (sec.rows[0].n > 0) pins.push(...STAFF_EXPENSE_CLAIM_JE_TRIGGERS);
  // wave-2026-09-15 END
  // #655 [0225] — wave 2026-09-18's own birth trigger, gated on ITS OWN stem for the same reason
  // every pin above is: `db-slice-frontiers` runs this battery against databases pinned below
  // 0225, where the trigger does not exist.
  const ti = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ 'trade_invoices$'");
  if (ti.rows[0].n > 0) pins.push(TRADE_INVOICE_JE_TRIGGER);
  // wave-2026-09-18 END
  return pins;
}
