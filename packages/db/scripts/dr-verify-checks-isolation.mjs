// dr-verify-checks-isolation — §4.11, the ABSOLUTE function-level transaction-isolation
// pin battery. Split into its own module for the same reason dr-verify-checks.mjs was split
// out of dr-verify.mjs: the file-size cap.
//
// WHY THIS EXISTS (CB-AE2E-004). clara.approve_opening_seed and
// clara.approve_opening_correction each raise CLR31 {"reason":"not_serializable"} unless the
// transaction is SERIALIZABLE (0017:3834-3836, 0017:4172-4174). PostgREST supplies that
// isolation from the function's own proconfig `default_transaction_isolation`. Without the
// pin, EVERY opening-seed and opening-correction approval refuses in the browser — and three
// separate instruments all miss it:
//
//   1. THE RIG IS STRUCTURALLY BLIND. packages/db/tests/wave-b/wb-fixtures.mjs's asHumanTxn
//      issues `begin isolation level serializable` at the SESSION level, so the in-body
//      assert is satisfied without the proconfig ever being consulted. The rig passes
//      identically on a database where the pin was never applied.
//   2. §4.6's FUNCTION-DEFINITION CHECK IS RELATIVE. proconfig rides a source-vs-target
//      diff. If the LIVE SOURCE also lacks the pin, the two sides AGREE and the check reads
//      PASS — a missing pin on both is invisible to a comparison.
//   3. /ready DOES NOT PROBE IT at all.
//
// So this cell is deliberately ABSOLUTE and TARGET-ONLY: it asks what the target IS, never
// whether it matches a source. It NEVER SKIPS — a skip would reproduce the exact blind spot
// the cell exists to close, a check that goes quiet on the shape it is hunting.
//
// It FAILS on every negative path but ONE: a missing function, an unreadable catalog, a lost
// search_path pin, and an absent pin on a target whose chain HAS taken the pin migration are
// all failures. The single exception is the VINTAGE arm — an absent pin on a target whose
// chain PREDATES that migration, where the ceremony was the only path and a throwaway has
// never run one. That records INFO rather than FAIL, and only outside a live drill: under
// CLARA_DR_STRICT=1 it fails like everything else. The succession gate below is where that
// branch is made, and checkCanary keys its own vintage-dependent probe the same way.
//
// The subject list is a single exported const so a third serializable-pinned body added
// later is a one-line addition rather than a forgotten one.

/**
 * Bodies whose in-body assert requires SERIALIZABLE and which therefore need the
 * function-level proconfig pin to work through PostgREST.
 *
 * EXACT SIGNATURES, never bare names (law 3: spelling is not identity — an overload of a
 * pinned name is a DIFFERENT function and would otherwise inherit a guarantee nobody gave
 * it). `to_regprocedure` resolves these, and a signature that does not resolve is a FAIL.
 */
export const SERIALIZABLE_PINNED_PROCS = [
  "clara.approve_opening_seed(uuid,uuid,text,jsonb,text,text)",
  "clara.approve_opening_correction(uuid,jsonb,text,text)",
];

/** The proconfig entry PostgREST reads when it opens the RPC transaction. */
export const ISOLATION_PIN_SETTING = "default_transaction_isolation=serializable";

// ---------------------------------------------------------------------------
// §4.11 function-level transaction-isolation pins (TARGET, ABSOLUTE — FAIL, never SKIP).
// ---------------------------------------------------------------------------
export async function checkIsolationPins(ctx) {
  const { tgt, STRICT, record } = ctx;

  // THE SUCCESSION GATE (.claude/rules/db-tests.md). This cell asserts a state that a target
  // acquires in one of two ways: the forward migration that carries the pin, or the manual
  // ceremony. A target whose CHAIN predates that migration can only have it from the ceremony
  // — and a throwaway CI database has never run one, so an unconditional FAIL there would be
  // reporting a difference of vintage as a defect.
  //
  // The witness is the migration's STABLE STEM in clara.schema_migrations, never its number
  // (numbers are claimed at merge) and never a filename. Present → the pin is MANDATORY and
  // its absence is drift, asserted absolutely below. Absent → the target predates the
  // migration, and the verdict splits on STRICT: a live drill (CLARA_DR_STRICT=1) still FAILS,
  // because a real estate must carry the pin however it got it; an ordinary run records INFO
  // naming why, which is the same shape checkCanary uses for its own vintage-dependent probe.
  let chainCarriesPin = false;
  try {
    chainCarriesPin = (await tgt.query(
      "select count(*)::int n from clara.schema_migrations where version ~ 'opening_approval_isolation_pin$'"
    )).rows[0].n > 0;
  } catch (e) {
    record("4.11", "opening-approval isolation-pin succession witness", "FAIL",
      `could not read clara.schema_migrations on the target: ${e.message}`);
    return;
  }
  const name = "opening-approval serializable proconfig pin (target, absolute)";
  let rows;
  try {
    // The subquery form, not an inner join: a join would DROP a signature that does not
    // resolve, the row count would still look plausible, and a missing function would read
    // as "nothing to check". Each subject must come back, resolved or not.
    rows = (await tgt.query(
      `select s as sig,
              (to_regprocedure(s) is not null) as resolves,
              coalesce((select coalesce(p.proconfig::text, '')
                          from pg_proc p where p.oid = to_regprocedure(s)), '') as cfg
         from unnest($1::text[]) s
        order by 1`,
      [SERIALIZABLE_PINNED_PROCS],
    )).rows;
  } catch (e) {
    // An unreadable catalog is a FAIL, not a SKIP. We did not see the pin, and the absence
    // of a reading is not evidence that the pin is there.
    record("4.11", name, "FAIL", `could not read pg_proc on the target: ${e.message}`);
    return;
  }

  const missing = rows.filter((r) => !r.resolves).map((r) => r.sig);
  const unpinned = rows
    .filter((r) => r.resolves && !r.cfg.includes(ISOLATION_PIN_SETTING))
    .map((r) => r.sig);
  const pinned = rows.filter((r) => r.resolves && r.cfg.includes(ISOLATION_PIN_SETTING));

  if (rows.length !== SERIALIZABLE_PINNED_PROCS.length) {
    record("4.11", name, "FAIL",
      `the probe returned ${rows.length} row(s) for ${SERIALIZABLE_PINNED_PROCS.length} subject(s) — the census is not total`);
    return;
  }
  if (missing.length > 0) {
    record("4.11", name, "FAIL",
      `signature(s) do not resolve on the target: ${missing.join(", ")} — the approval door is absent, not merely unpinned`);
    return;
  }
  if (unpinned.length > 0) {
    const detail = `${unpinned.length} of ${rows.length} lack ${ISOLATION_PIN_SETTING}: ${unpinned.join(", ")}`
      + " — every opening approval through PostgREST will refuse CLR31 not_serializable on this target."
      + " Remedy: apply the forward migration that carries the pin, or"
      + " packages/db/deploy/wave-b-0017-ceremony.sql Part A.";
    if (chainCarriesPin) {
      record("4.11", name, "FAIL", `${detail} The chain HAS taken the pin migration, so this is drift.`);
    } else if (STRICT) {
      record("4.11", name, "FAIL",
        `${detail} The chain predates the pin migration, so the ceremony was the only path — and in a live drill it must have been walked.`);
    } else {
      record("4.11", name, "INFO",
        `${detail} The target's chain PREDATES the pin migration (no opening_approval_isolation_pin row in clara.schema_migrations) and the ceremony is the only other path, so this is a vintage difference rather than drift. Re-run with CLARA_DR_STRICT=1 to make it a failure.`);
    }
    return;
  }
  record("4.11", name, "PASS",
    `${pinned.length} of ${pinned.length} carry the pin: ${pinned.map((r) => r.sig).join(", ")}`);

  // The search_path pin on the same bodies is a SEPARATE guarantee that an ALTER FUNCTION ...
  // SET can plausibly disturb, so it is measured rather than assumed. Same fail-closed shape.
  const noPath = rows.filter((r) => !r.cfg.includes("search_path")).map((r) => r.sig);
  record("4.11", "opening-approval search_path pin survives beside the isolation pin (target)",
    noPath.length === 0 ? "PASS" : "FAIL",
    noPath.length === 0
      ? "both bodies still carry a search_path entry alongside the isolation pin"
      : `search_path entry missing on: ${noPath.join(", ")} — a definer body without it resolves names it should not`);
}
