// F-A8 (Wave-F Track A) — the internet lane, PR-1: THE POSTURE BATTERY.
// Annex C cells C.10a-e plus Annex E's DDL posture and Annex G.1's zero-CoR prediction.
//
// WHAT THIS FILE IS FOR, AND WHAT IT DELIBERATELY IS NOT. This is the STRUCTURAL half of
// F-A8's battery: grants, RLS, definer hygiene, the allowlist roster, the freeze registry
// and the receipt shim. It asserts nothing about what the Tier-1 verbs DO — the behavioural
// cells (the ladder, the derivation, the owner door, supersede) live in their own files, so
// a design re-cut moves those and leaves this one standing.
//
// THE MANIFEST IS THE ONLY THING THAT CHANGES. Everything below iterates the four consts at
// the top. Adding an object to F-A8 means adding a name there; it does not mean writing a
// cell. That is deliberate: an enumeration a human maintains beside the assertions is an
// enumeration that rots, and the whole point of C.10 is that the closed worlds F-A8 extends
// are extended DELIBERATELY.
//
// EVERY CENSUS HERE CARRIES ITS ADVERSARIAL TWIN. A sweep asserted only in its passing
// direction has never been shown to work (Annex C, discipline 2). The twins live in
// f-a8-fixtures.mjs and were each confirmed on a 0102 rig to flip their census RED and back
// to GREEN on cleanup, BEFORE this PR added anything.
//
// SKIPS ARE NAMED AND COUNTED, never a silent return. Two are legitimate here: the whole
// file is dormant until F-A8's migration is applied, and the receipt-shim cell is dormant
// until F-A7/PR-1pi's typed stub exists.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { ROLES, rootQuery, endPool } from "./rig-helpers.mjs";
import {
  grantMatrixFailures, definerHygieneFailures, governedRlsFailures,
} from "./rig-meta.mjs";
import {
  f_a8Ready, tablePosture, fnPosture, executeMatrix, allowlistSnapshot,
  withThrowawayGrantedFn, withThrowawayUnpinnedDefiner, withThrowawayUnforcedTable,
  APP_ROLES,
} from "./f-a8-fixtures.mjs";

// ---------------------------------------------------------------------------
// THE MANIFEST — the only part of this file a design change touches.
// ---------------------------------------------------------------------------

/** Every new base table F-A8 PR-1 installs. Annex E's posture is asserted on each. */
const TABLES = [
  "tier1_endpoints", "fx_rates", "web_attempts", "web_attempt_events",
  "fetch_artifacts", "policy_fact_spans", "policy_drafts", "policy_approval_cards",
];

/** Every new GRANTED verb, as `[signature, theOneRoleThatMayCallIt]`. */
const VERBS = [
  ["clara.wake_submit_policy_draft(text,jsonb,jsonb,text,text)", ROLES.wakeProactive],
  ["clara.decide_policy_draft(uuid,text,text,text,uuid)", ROLES.authenticated],
  ["clara.override_policy_draft(uuid,text,text)", ROLES.authenticated],
  ["clara.record_fetch_artifact(uuid,uuid,text,text,jsonb,int,int,text,text,bigint,text,jsonb,timestamptz,int,text,text,text,text,timestamptz,text)", ROLES.runtime],
  ["clara.record_web_attempt_event(uuid,smallint,text,uuid,text,text,jsonb,text,jsonb)", ROLES.runtime],
];

/** Every new UNGRANTED core, by signature. Each must be callable by NO app role. */
const CORES = [
  "clara.evaluate_policy_source_value_v1(text,uuid,jsonb)",
  "clara._policy_sources_agree(text,jsonb)",
  "clara._policy_value_plausible(text,numeric)",
  "clara._mint_policy_approval_card_core(uuid)",
  "clara._policy_draft_submit_core(text,uuid,uuid,text,text,jsonb,jsonb,text)",
  "clara._policy_draft_commit_core(uuid,uuid,text)",
];

/** Every `wake_fn_allowlist` pair F-A8 PR-1 adds, as `[wake_kind, function_name]`. */
const ALLOWLIST_PAIRS = [["proactive", "wake_submit_policy_draft"]];

/** The pre-existing roster row F-A8 must not disturb (`0002` seed, live at the frontier). */
const ROSTER_INCUMBENT = ["proactive", "wake_record_notification"];

/** F-A7/PR-1pi's typed stub for this item. Present from train position 2 onward. */
const RECEIPT_SHIM = "clara._agent_receipt_src_f_a8";

/** The manifest is populated when F-A8's DDL lands; until then every cell says so. */
const MANIFEST_POPULATED = TABLES.length > 0 && VERBS.length > 0;

let ready = false;

before(async () => {
  ready = MANIFEST_POPULATED && (await f_a8Ready("table", `clara.${TABLES[0]}`));
});

after(async () => { await endPool(); });

/** A NAMED, COUNTED skip — never `return` on its own, never a swallowed premise. */
function dormant(t) {
  if (!MANIFEST_POPULATED) {
    t.skip("F-A8 object manifest is not populated yet (design v3 pending) — cell dormant, not passing");
    return true;
  }
  if (!ready) {
    t.skip(`F-A8 PR-1 migration is not applied (clara.${TABLES[0]} absent) — cell dormant, not passing`);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// C.10e / Annex E — table posture on every new table
// ---------------------------------------------------------------------------

test("C.10e F-A8 tables: RLS + FORCE, exactly one clara_fn_owner policy, ZERO app-role grants", async (t) => {
  if (dormant(t)) return;
  for (const name of TABLES) {
    const p = await tablePosture(name);
    assert.equal(p.exists, true, `clara.${name} must exist`);
    assert.equal(p.rls, true, `clara.${name} must ENABLE row level security`);
    assert.equal(p.force, true, `clara.${name} must FORCE row level security`);
    assert.equal(p.owner, ROLES.fnOwner, `clara.${name} must be owned by ${ROLES.fnOwner}`);
    assert.deepEqual(p.policies.map((x) => x.roles).sort(), [`{${ROLES.fnOwner}}`],
      `clara.${name} must carry exactly one policy and it must be the ${ROLES.fnOwner} one — reads reach humans through the typed DEFINER readers, never a base-table SELECT grant`);
    assert.deepEqual(p.grants, [],
      `clara.${name} must carry ZERO direct app-role grants (saw ${p.grants.join(", ")})`);
    assert.ok(p.triggerFns.includes("_tf_no_truncate"),
      `clara.${name} must carry the no-truncate trigger (has: ${p.triggerFns.join(", ")})`);
  }
});

test("C.10e twin: the SAME governed-RLS sweep FAILS on an unforced table", async (t) => {
  if (dormant(t)) return;
  assert.deepEqual(await governedRlsFailures(), [], "precondition: the sweep is green before the twin");
  await withThrowawayUnforcedTable(async (name) => {
    const failures = await governedRlsFailures();
    assert.ok(failures.some((f) => f.includes(name)),
      `the governed-RLS sweep did not name the unforced table ${name} — it cannot say NO, so its YES above means nothing`);
  });
  assert.deepEqual(await governedRlsFailures(), [], "the sweep is green again once the twin is dropped");
});

// ---------------------------------------------------------------------------
// C.10a / C.10b / C.10c — grants, cores, definer hygiene
// ---------------------------------------------------------------------------

test("C.10a F-A8 verbs: each EXECUTE-able by exactly the ONE role that may call it", async (t) => {
  if (dormant(t)) return;
  for (const [sig, role] of VERBS) {
    const m = await executeMatrix(sig);
    for (const r of APP_ROLES) {
      assert.equal(m[r], r === role,
        `${sig}: ${r} EXECUTE expected ${r === role}, got ${m[r]} — the grant IS the authority here`);
    }
  }
});

test("C.10b F-A8 cores: reachable by NO app role, from any direction", async (t) => {
  if (dormant(t)) return;
  for (const sig of CORES) {
    const m = await executeMatrix(sig);
    const reachable = APP_ROLES.filter((r) => m[r]);
    assert.deepEqual(reachable, [],
      `${sig} is an ungranted core; ${reachable.join(", ")} can execute it — the wrapper/core seam has an alternate entrance`);
    const p = await fnPosture(sig);
    assert.equal(p.publicExec, false, `${sig}: PUBLIC still holds EXECUTE (the explicit REVOKE is missing)`);
  }
});

test("C.10c F-A8 bodies: SECURITY DEFINER, search_path pinned, owned by clara_fn_owner, no PUBLIC", async (t) => {
  if (dormant(t)) return;
  for (const sig of [...VERBS.map(([s]) => s), ...CORES]) {
    const p = await fnPosture(sig);
    assert.equal(p.exists, true, `${sig} must exist`);
    assert.equal(p.secdef, true, `${sig} must be SECURITY DEFINER`);
    assert.equal(p.searchPath, true, `${sig} must pin 'search_path=clara, pg_temp' (saw '${p.cfg}')`);
    assert.equal(p.owner, ROLES.fnOwner, `${sig} must be owned by ${ROLES.fnOwner}`);
    assert.equal(p.publicExec, false, `${sig} must not be PUBLIC-executable`);
  }
});

test("C.10a/c twins: the SAME T17 and definer sweeps FAIL on a planted violation", async (t) => {
  if (dormant(t)) return;
  assert.deepEqual(await grantMatrixFailures(), [], "precondition: T17 is green before the twin");
  await withThrowawayGrantedFn(ROLES.wakeProactive, async (sig) => {
    const failures = await grantMatrixFailures();
    assert.ok(failures.some((f) => f.includes(sig.replace("clara.", "").replace("()", ""))),
      `T17 did not name the planted grant on ${sig} — the roster edit this PR made would be decorative, not necessary`);
  });
  assert.deepEqual(await grantMatrixFailures(), [], "T17 is green again once the twin is dropped");

  assert.deepEqual(await definerHygieneFailures(), [], "precondition: definer hygiene is green before the twin");
  await withThrowawayUnpinnedDefiner(async (sig) => {
    const failures = await definerHygieneFailures();
    assert.ok(failures.some((f) => f.includes(sig.replace("clara.", "").replace("()", ""))),
      `the definer sweep did not name the unpinned body ${sig}`);
  });
  assert.deepEqual(await definerHygieneFailures(), [], "definer hygiene is green again once the twin is dropped");
});

// ---------------------------------------------------------------------------
// C.10d — the wake_fn_allowlist roster, asserted RELATIVELY
// ---------------------------------------------------------------------------
//
// NOT a total. In a long merge train other lanes add rows of their own ahead of this PR
// (F-A5/PR-2 adds an `interactive` row at an earlier train position), so an absolute count
// is a landmine that fires on merge order rather than on a defect. What IS asserted:
// F-A8's own pairs are present, the incumbent row is untouched, and the kind F-A8 claims is
// a CLOSED world containing exactly the incumbent plus F-A8's own.

test("C.10d roster: F-A8's pairs are present, the 0002 incumbent survives, and F-A8's kind is closed", async (t) => {
  if (dormant(t)) return;
  const snap = await allowlistSnapshot();
  assert.ok(snap.set.has(ROSTER_INCUMBENT.join("|")),
    `the pre-existing ${ROSTER_INCUMBENT.join("|")} row is GONE — the roster was re-seeded, not extended`);
  for (const [kind, fn] of ALLOWLIST_PAIRS) {
    assert.ok(snap.set.has(`${kind}|${fn}`), `allowlist row ${kind}|${fn} is missing`);
  }
  // The kinds F-A8 claims are closed worlds: exactly the incumbent plus F-A8's own pairs.
  // A kind F-A8 does NOT claim is left alone entirely — that is another lane's surface.
  const claimedKinds = new Set(ALLOWLIST_PAIRS.map(([k]) => k));
  for (const kind of claimedKinds) {
    const live = snap.rows.filter((r) => r.wake_kind === kind).map((r) => r.function_name).sort();
    const expected = [
      ...(ROSTER_INCUMBENT[0] === kind ? [ROSTER_INCUMBENT[1]] : []),
      ...ALLOWLIST_PAIRS.filter(([k]) => k === kind).map(([, f]) => f),
    ].sort();
    assert.deepEqual(live, expected,
      `the '${kind}' wake kind is a closed world: expected [${expected.join(", ")}], live [${live.join(", ")}]`);
  }
});

test("C.10d twin: the roster read can SEE a row that should not be there", async (t) => {
  if (dormant(t)) return;
  const before = await allowlistSnapshot();
  await rootQuery("insert into clara.wake_fn_allowlist(wake_kind, function_name) values ('proactive', '_l19_twin_not_a_verb')");
  try {
    const after = await allowlistSnapshot();
    assert.equal(after.count, before.count + 1, "the roster read did not see the planted row");
    assert.ok(after.set.has("proactive|_l19_twin_not_a_verb"), "the roster read did not see the planted pair");
  } finally {
    await rootQuery("delete from clara.wake_fn_allowlist where function_name = '_l19_twin_not_a_verb'");
  }
  const restored = await allowlistSnapshot();
  assert.equal(restored.count, before.count, "the twin did not clean up after itself");
});

// ---------------------------------------------------------------------------
// The F-A7 D-6 receipt surface — dormant until pi's typed stub exists
// ---------------------------------------------------------------------------

test("D-6 receipt shim: F-A8's per-item projection resolves and is readable", async (t) => {
  if (dormant(t)) return;
  const present = await rootQuery("select to_regclass($1) is not null as ok", [RECEIPT_SHIM]);
  if (!present.rows[0].ok) {
    t.skip(`F-A7/PR-1pi is not merged (${RECEIPT_SHIM} absent) — cell dormant, not passing`);
    return;
  }
  const r = await rootQuery(`select * from ${RECEIPT_SHIM} limit 0`);
  assert.ok(r.fields.length > 0, `${RECEIPT_SHIM} projects no columns`);
  assert.ok(r.fields.some((f) => f.name === "receipt_kind"),
    `${RECEIPT_SHIM} must carry the receipt_kind discriminator (has: ${r.fields.map((f) => f.name).join(", ")})`);
});
