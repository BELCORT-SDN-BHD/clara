// #1046 — THE TWO PRE-SESSION RATE-WALL EVIDENCE TABLES GAIN A RETENTION SWEEP.
// `clara.invite_preview_attempts` (0309) and `clara.confirmation_attempts` (0163) are both
// append-only, and neither has ever been swept, so each grows forever even though its own wall
// only ever reads the trailing 15-minute window. Migration: 0348_rate_wall_attempts_retention.sql.
// Frontier-gated on its own STABLE STEM (`rate_wall_attempts_retention$`), never its number —
// numbers are claimed at merge (packages/db/README.md) — the `firm_setup_committed_tin_backfill$`
// idiom.
//
// THE SEAMS.
//   `clara.prune_invite_preview_attempts(timestamptz,int)` and
//   `clara.prune_confirmation_attempts(timestamptz,int)` — the two verbs 0348 mints, each the
//   only way to prune a table whose append-only trigger raises unconditionally for every role
//   including the table's owner (0309:170-177). Both are driven directly, under
//   `set role clara_runtime` — the one principal either is granted to.
//   `clara.preview_invite_by_token` (0309) and `clara.claim_confirmation_attempt` (0163) — the two
//   wall doors, driven for real to prove a mid-window sweep changes neither wall's own count.
//
// WHAT IS UNDER TEST, one cell per acceptance criterion of #1046:
//   AC1 — p1046.invite_preview.prune_removes_past_margin_keeps_window_row
//         p1046.confirmation.prune_removes_past_margin_keeps_window_row
//   AC2 — p1046.wall.invite_preview_count_unaffected_by_mid_window_sweep
//         p1046.wall.confirmation_count_unaffected_by_mid_window_sweep
//   the floor the AC2 guarantee rests on, driven rather than asserted from the body text —
//         p1046.invite_preview.floor_refuses_in_window_threshold
//         p1046.confirmation.floor_refuses_in_window_threshold
//   the ACL the "clara_runtime only" posture rests on, driven rather than read from pg_proc —
//         p1046.invite_preview.only_clara_runtime_may_execute
//         p1046.confirmation.only_clara_runtime_may_execute
//
// ROLE DISCIPLINE: every verb call runs through `roleQuery('clara_runtime', ...)` — the real
// least-privilege lane the runtime's own reconciler uses (packages/runtime/lib/reconciler.mjs).
// The wall doors are driven through their own real principals (`clara_invite_preview`,
// `clara_auth_wall`), the `invite-preview-public.test.mjs` / `c5-auth-wall-db.test.mjs`
// precedent. World is planted through the ROOT connection when a row's exact `attempted_at` must
// be backdated (there is no door that backdates an attempt; the only way to reach that shape is a
// direct insert, the `firm-setup-committed-tin-backfill.test.mjs` precedent for "the only way to
// reach a shape today's doors cannot produce").

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { assertRaises, endPool, rootQuery, roleQuery, PG } from "./rig-helpers.mjs";

const STEM = "rate_wall_attempts_retention$";

let ready = false;
let executed = 0;
const EXPECTED_CELLS = 8;

/** True iff a migration whose version matches the stem is recorded applied. Catalog-probed
 *  against `clara.schema_migrations`, never inferred from a file listing. */
async function laneReady() {
  const r = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ $1", [STEM]);
  return r.rows[0].n > 0;
}

before(async () => { ready = await laneReady(); });
after(async () => {
  if (ready) assert.equal(executed, EXPECTED_CELLS, `expected ${EXPECTED_CELLS} cells to run, ${executed} did`);
  await endPool();
});

/** A FOCUSED run (just this file, no gate preload) FAILS LOUDLY when the migration is missing. */
function gate(t) {
  if (ready) return false;
  if (process.env.CLARA_ALLOW_MISSING_RATE_WALL_ATTEMPTS_RETENTION === "1") {
    console.warn(`SKIP rate-wall-attempts-retention: no ${STEM} migration applied (explicit pre-integration run).`);
    t.skip("rate-wall-attempts-retention lane absent -- explicit pre-integration run");
    return true;
  }
  assert.fail(
    "the #1046 rate-wall attempts retention lane is required for a focused run: apply 0348_rate_wall_attempts_retention.sql");
}

function cell(name, fn) {
  test(name, async (t) => {
    if (gate(t)) return;
    executed += 1;
    await fn(t);
  });
}

// ---------------------------------------------------------------------------------------------
// SMALL HELPERS -- fresh per call, the invite-preview-public.test.mjs precedent (a fixed literal
// would let one cell's budget collide with another's inside the same 15-minute window over an
// unprunable table).
// ---------------------------------------------------------------------------------------------
const originDigest = () => randomBytes(32);
const probeToken = () => randomBytes(32).toString("hex");

/** The invite-preview door, driven as the one principal that may call it. */
async function previewByToken(token, digest) {
  const r = await roleQuery(
    "clara_invite_preview",
    "select clara.preview_invite_by_token(p_token => $1, p_origin_digest => $2) as result",
    [token, digest],
  );
  return r.rows[0].result;
}

/** The confirmation-attempt door, driven as the one principal that may call it. */
async function claimConfirmationAttempt(emailDigest, originDig) {
  const r = await roleQuery(
    "clara_auth_wall",
    "select clara.claim_confirmation_attempt($1,$2) as result",
    [emailDigest, originDig],
  );
  return r.rows[0].result;
}

// ---------------------------------------------------------------------------------------------
// AC1 -- rows inside the window are never removed; rows past the margin are.
// ---------------------------------------------------------------------------------------------

cell("p1046.invite_preview.prune_removes_past_margin_keeps_window_row", async () => {
  const staleDigest = originDigest();
  const freshDigest = originDigest();
  const staleToken = probeToken();
  const freshToken = probeToken();
  // Planted directly through root: no door backdates `attempted_at`, so a direct insert is the
  // only way to reach "a row past the retention margin" without waiting an hour in real time.
  const stale = await rootQuery(
    "insert into clara.invite_preview_attempts (token_hash, origin_digest, attempted_at) " +
    "values (sha256(decode($1,'hex')), $2, now() - interval '2 hours') returning id",
    [staleToken, staleDigest],
  );
  const fresh = await rootQuery(
    "insert into clara.invite_preview_attempts (token_hash, origin_digest, attempted_at) " +
    "values (sha256(decode($1,'hex')), $2, now() - interval '5 minutes') returning id",
    [freshToken, freshDigest],
  );
  const staleId = stale.rows[0].id;
  const freshId = fresh.rows[0].id;

  const before = await rootQuery(
    "select count(*)::int as n from clara.invite_preview_attempts where id in ($1,$2)",
    [staleId, freshId],
  );
  assert.equal(before.rows[0].n, 2, "both planted rows exist before the sweep");

  const swept = await roleQuery(
    "clara_runtime",
    "select clara.prune_invite_preview_attempts(now() - interval '60 minutes', 10000) as out",
    [],
  );
  assert.ok(swept.rows[0].out.attempts_deleted >= 1, "the sweep deleted at least the stale row");

  const staleGone = await rootQuery("select count(*)::int as n from clara.invite_preview_attempts where id=$1", [staleId]);
  assert.equal(staleGone.rows[0].n, 0, "the 2-hour-old row is gone");
  const freshKept = await rootQuery("select count(*)::int as n from clara.invite_preview_attempts where id=$1", [freshId]);
  assert.equal(freshKept.rows[0].n, 1, "the 5-minute-old row, inside the window, survives");
});

cell("p1046.confirmation.prune_removes_past_margin_keeps_window_row", async () => {
  const staleEmail = originDigest();
  const staleOrigin = originDigest();
  const freshEmail = originDigest();
  const freshOrigin = originDigest();
  const stale = await rootQuery(
    "insert into clara.confirmation_attempts (email_digest, origin_digest, attempted_at) " +
    "values ($1,$2, now() - interval '2 hours') returning id",
    [staleEmail, staleOrigin],
  );
  const fresh = await rootQuery(
    "insert into clara.confirmation_attempts (email_digest, origin_digest, attempted_at) " +
    "values ($1,$2, now() - interval '5 minutes') returning id",
    [freshEmail, freshOrigin],
  );
  const staleId = stale.rows[0].id;
  const freshId = fresh.rows[0].id;

  const swept = await roleQuery(
    "clara_runtime",
    "select clara.prune_confirmation_attempts(now() - interval '60 minutes', 10000) as out",
    [],
  );
  assert.ok(swept.rows[0].out.attempts_deleted >= 1, "the sweep deleted at least the stale row");

  const staleGone = await rootQuery("select count(*)::int as n from clara.confirmation_attempts where id=$1", [staleId]);
  assert.equal(staleGone.rows[0].n, 0, "the 2-hour-old row is gone");
  const freshKept = await rootQuery("select count(*)::int as n from clara.confirmation_attempts where id=$1", [freshId]);
  assert.equal(freshKept.rows[0].n, 1, "the 5-minute-old row, inside the window, survives");
});

// ---------------------------------------------------------------------------------------------
// The floor the AC2 guarantee rests on: a threshold inside the wall's own window is refused
// rather than honoured, driven directly rather than read off the function body.
// ---------------------------------------------------------------------------------------------

cell("p1046.invite_preview.floor_refuses_in_window_threshold", async () => {
  await assertRaises(
    "CLR10",
    () => roleQuery("clara_runtime", "select clara.prune_invite_preview_attempts(now(), 10000)", []),
    "prune_invite_preview_attempts(now(), ...)",
  );
});

cell("p1046.confirmation.floor_refuses_in_window_threshold", async () => {
  await assertRaises(
    "CLR10",
    () => roleQuery("clara_runtime", "select clara.prune_confirmation_attempts(now(), 10000)", []),
    "prune_confirmation_attempts(now(), ...)",
  );
});

// ---------------------------------------------------------------------------------------------
// The ACL: clara_runtime alone. Driven as clara_authenticated (a real, distinct least-privilege
// role every human-lane door in this estate already carries) and refused with the ordinary
// Postgres insufficient-privilege SQLSTATE, never CLR10 -- there is no Clara-level refusal for a
// call the catalog itself never let happen.
// ---------------------------------------------------------------------------------------------

cell("p1046.invite_preview.only_clara_runtime_may_execute", async () => {
  await assertRaises(
    PG.insufficientPrivilege,
    () => roleQuery("clara_authenticated", "select clara.prune_invite_preview_attempts(now() - interval '2 hours', 10000)", []),
    "prune_invite_preview_attempts as clara_authenticated",
  );
});

cell("p1046.confirmation.only_clara_runtime_may_execute", async () => {
  await assertRaises(
    PG.insufficientPrivilege,
    () => roleQuery("clara_authenticated", "select clara.prune_confirmation_attempts(now() - interval '2 hours', 10000)", []),
    "prune_confirmation_attempts as clara_authenticated",
  );
});

// ---------------------------------------------------------------------------------------------
// AC2 -- the wall's own count is unchanged by a sweep that runs mid-window. Five real calls
// through the real door reach the ceiling (0309/0163's own number); a sweep with a SAFE margin
// runs between the fifth and the sixth; the sixth is STILL correctly walled, which is only true
// if none of the five rows backing the count was removed.
// ---------------------------------------------------------------------------------------------

cell("p1046.wall.invite_preview_count_unaffected_by_mid_window_sweep", async () => {
  const token = probeToken();
  const digest = originDigest();
  for (let i = 0; i < 5; i += 1) {
    const r = await previewByToken(token, digest);
    assert.notEqual(r.outcome, "rate_limited", `call ${i + 1} of 5 must be admitted (token unknown, so not_previewable)`);
  }

  const before = await rootQuery("select count(*)::int as n from clara.invite_preview_attempts where origin_digest=$1", [digest]);
  assert.equal(before.rows[0].n, 5, "five rows back this key's count before the sweep");

  // A sweep with a 60-minute margin: safely outside the 15-minute window, so it must not touch
  // any of the five rows just written.
  await roleQuery("clara_runtime", "select clara.prune_invite_preview_attempts(now() - interval '60 minutes', 10000)", []);

  const after = await rootQuery("select count(*)::int as n from clara.invite_preview_attempts where origin_digest=$1", [digest]);
  assert.equal(after.rows[0].n, 5, "the sweep did not remove any of the five window rows");

  const sixth = await previewByToken(token, digest);
  assert.equal(sixth.outcome, "rate_limited", "the sixth call is still walled -- the sweep did not silently widen the budget");
});

cell("p1046.wall.confirmation_count_unaffected_by_mid_window_sweep", async () => {
  const emailDig = originDigest();
  const originDig = originDigest();
  for (let i = 0; i < 5; i += 1) {
    const r = await claimConfirmationAttempt(emailDig, originDig);
    assert.equal(r.allowed, true, `call ${i + 1} of 5 must be allowed`);
  }

  const before = await rootQuery("select count(*)::int as n from clara.confirmation_attempts where email_digest=$1", [emailDig]);
  assert.equal(before.rows[0].n, 5, "five rows back this key's count before the sweep (0163 inserts on every call, admitted or not)");

  await roleQuery("clara_runtime", "select clara.prune_confirmation_attempts(now() - interval '60 minutes', 10000)", []);

  const after = await rootQuery("select count(*)::int as n from clara.confirmation_attempts where email_digest=$1", [emailDig]);
  assert.equal(after.rows[0].n, 5, "the sweep did not remove any of the five window rows");

  const sixth = await claimConfirmationAttempt(emailDig, originDig);
  assert.equal(sixth.allowed, false, "the sixth call is still walled -- the sweep did not silently widen the budget");
});
