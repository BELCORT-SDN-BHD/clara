// Gate G1's TWO WAKE BODIES — the WALLS half: the op-key derivation cross-checked against the
// database's own function, the law-71 containment measured BY CALLING the verbs, the bank pool's
// laziness measured in a real production-mode child process, and the tool set's one local guard.
//
// EVERY CELL HERE CARRIES ITS OWN POSITIVE CONTROL. A containment cell that only shows a refusal
// proves nothing about containment — it would pass just as happily against a role with no grants
// at all, or against a verb that does not exist. Each wall cell therefore also shows the door
// that must stay OPEN.
//
// The lifecycle half is g1-wake-bodies.test.mjs; shared fixtures are g1-wake-bodies.fixtures.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import * as rig from "./rig.mjs";
import { skip, skip0138 } from "./g1-wake-bodies.fixtures.mjs";

const { register } = await import("tsx/esm/api");
register();

const closeInfra = await import("../workflows/closePrep.v1.infra.ts");

// =====================================================================================
// E · THE OP-KEY DERIVATION, cross-checked against the DATABASE'S OWN FUNCTION.
//     closePrep.v1.infra.ts reimplements clara._close_expected_op_key in JS. That is only
//     safe because the DB re-derives and REFUSES a mismatch on every call — this cell is
//     the standing proof the two derivations actually agree.
// =====================================================================================

test("G1B-E1 closeOpKey reproduces clara._close_expected_op_key byte-for-byte", { skip: skip0138 }, async () => {
  const cases = [
    [randomUUID(), "wake_list_fiscal_years", randomUUID()],
    [randomUUID(), "wake_propose_close", randomUUID()],
    [randomUUID(), "wake_run_depreciation_catchup", randomUUID()],
  ];
  for (const [task, verb, subject] of cases) {
    const dbKey = await rig.asFnOwner((c) =>
      c.query("select clara._close_expected_op_key($1,$2,$3) as k", [task, verb, subject]).then((r) => r.rows[0].k),
    );
    assert.equal(closeInfra.closeOpKey(task, verb, subject), dbKey, `derivation must match for ${verb}`);
  }
  // A NEGATIVE control, so the equality above is not vacuous: a different subject must produce a
  // different key, or the cell would pass against a constant.
  const [t, v, s] = cases[0];
  assert.notEqual(closeInfra.closeOpKey(t, v, s), closeInfra.closeOpKey(t, v, randomUUID()));
  assert.equal(closeInfra.closeOpKey(t, v, s), createHash("sha256").update(`${t}:${v}:${s}`, "utf8").digest("hex"));
});

// =====================================================================================
// F · THE LAW-71 WALL. Measured BY CALLING, never by reading a grant table alone.
// =====================================================================================

test("G1B-F1 the close role cannot EXECUTE any law-71 verb — the refusal is the database's, not the tool set's", { skip: skip0138 }, async () => {
  const LAW71 = ["settle_close_proposal", "finalize_close", "attest_close_exception", "reopen_fiscal_year"];
  const live = await rig.rootQuery(
    `select p.proname, pg_get_function_identity_arguments(p.oid) as args,
            has_function_privilege('clara_wake_interactive', p.oid, 'EXECUTE') as wake_can,
            has_function_privilege('clara_authenticated', p.oid, 'EXECUTE') as human_can
       from pg_proc p
      where p.pronamespace='clara'::regnamespace and p.proname = any($1)`,
    [LAW71],
  );
  assert.equal(live.rows.length, LAW71.length, `all ${LAW71.length} law-71 verbs must exist to be walled — found ${live.rows.length}`);
  for (const row of live.rows) {
    assert.equal(row.wake_can, false, `${row.proname}: the wake role must hold NO execute`);
    assert.equal(row.human_can, true, `${row.proname}: the HUMAN door must stay open — otherwise this cell proves nothing`);
  }

  // THE MUTANT. The ACL census above is a derived read; this is the behavioural one. Call each
  // verb AS the close lane's own role and require a 42501 permission-denied. A CLR-coded
  // business refusal would NOT count: that would mean the role reached the body at all.
  await rig.withActor({ role: "clara_wake_interactive" }, async (c) => {
    for (const row of live.rows) {
      const arity = row.args.split(",").length;
      const placeholders = Array.from({ length: arity }, () => "null").join(",");
      let code = null;
      try {
        await c.query(`select clara.${row.proname}(${placeholders})`);
      } catch (e) {
        code = e.code;
      }
      assert.equal(code, "42501", `${row.proname} must refuse the wake role with permission-denied, got ${code ?? "NO ERROR AT ALL"}`);
    }
  });
});

test("G1B-F2 the POSITIVE control — the close role DOES hold execute on the twelve wrappers it is meant to reach", { skip: skip0138 }, async () => {
  // Without this, F1 would pass just as happily against a role with no grants whatsoever, which
  // would prove containment by accident rather than by design.
  const TWELVE = [
    "wake_list_fiscal_years", "wake_get_close_plan", "wake_get_close_readiness", "wake_verify_close",
    "wake_snapshot_state", "wake_dry_run_close_readiness", "wake_open_fiscal_year", "wake_begin_close",
    "wake_abandon_close", "wake_propose_close", "wake_run_depreciation_catchup", "wake_mint_month_snapshot",
  ];
  const r = await rig.rootQuery(
    `select p.proname, has_function_privilege('clara_wake_interactive', p.oid, 'EXECUTE') as can
       from pg_proc p where p.pronamespace='clara'::regnamespace and p.proname = any($1)`,
    [TWELVE],
  );
  assert.equal(r.rows.length, 12, `all twelve 0138 wrappers must be present — found ${r.rows.length}`);
  for (const row of r.rows) assert.equal(row.can, true, `${row.proname}: the close lane must REACH its own wrapper`);
});

test("G1B-F3 the bank role reaches its four verbs and no law-71 verb", { skip }, async () => {
  const FOUR = ["wake_get_bank_pack", "wake_match_bank_line", "wake_propose_bank_line_exception", "wake_propose_bank_identifier_promotion"];
  const r = await rig.rootQuery(
    `select p.proname, has_function_privilege('clara_wake_bank', p.oid, 'EXECUTE') as can
       from pg_proc p where p.pronamespace='clara'::regnamespace and p.proname = any($1)`,
    [FOUR],
  );
  assert.equal(r.rows.length, 4, "the four bank verbs this closure calls must all exist");
  for (const row of r.rows) assert.equal(row.can, true, `${row.proname}: the bank lane must reach its own verb`);
  const walled = await rig.rootQuery(
    `select count(*)::int as n from pg_proc p
      where p.pronamespace='clara'::regnamespace
        and p.proname = any(array['settle_close_proposal','finalize_close','attest_close_exception','reopen_fiscal_year'])
        and has_function_privilege('clara_wake_bank', p.oid, 'EXECUTE')`,
  );
  assert.equal(walled.rows[0].n, 0, "the bank lane reaches NO law-71 close verb either");
});

// =====================================================================================
// G · MUST G — the bank pool is LAZY. The world must BOOT with no CLARA_BANK_DATABASE_URL,
//     because the ceremony that mints it is itself gated on G1 merging first. Run in a real
//     child process with RELAY_TEST_MODE genuinely unset — see the probe's own header for
//     why a same-process cell could not answer this question.
// =====================================================================================

test("G1B-G1 assertProductionPoolConfig does NOT require the bank DSN; getBankPool still fails closed at first use", async () => {
  const { execFileSync } = await import("node:child_process");
  const line = execFileSync(process.execPath, [new URL("./g1-lazy-bank-pool.probe.mjs", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")], {
    encoding: "utf8",
    env: {
      ...process.env,
      RELAY_TEST_MODE: "",
      CLARA_RUNTIME_DATABASE_URL: "postgres://u:p@127.0.0.1:1/x",
      CLARA_READ_DATABASE_URL: "postgres://u:p@127.0.0.1:1/x",
      CLARA_WRITE_DATABASE_URL: "postgres://u:p@127.0.0.1:1/x",
      CLARA_FREEFORM_DATABASE_URL: "postgres://u:p@127.0.0.1:1/x",
      CLARA_BANK_DATABASE_URL: "",
    },
  });
  const out = JSON.parse(line.trim().split("\n").pop());
  assert.equal(out.assertThrew, false, `the boot assert must not demand the bank DSN (got: ${out.assertMessage ?? ""})`);
  assert.equal(out.eagerDsnStillRequired, true, "POSITIVE CONTROL: the same assert DOES throw when a genuinely eager DSN (the WRITE one) is missing");
  assert.equal(out.bankPoolThrew, true, "getBankPool must fail CLOSED — never a shared-identity fallback");
  assert.match(
    String(out.bankPoolMessage),
    /CLARA_BANK_DATABASE_URL/,
    "and the failure must NAME the missing DSN, so the first bank task dead-letters with a readable reason",
  );
});

// =====================================================================================
// H · THE TOOL SET'S OWN LOCAL GUARD. Not a wall — the DB owns every wall — but the
//     difference between a readable refusal and a CLR code nobody can act on.
// =====================================================================================

test("G1B-H1 a bank WRITE before any pack read is refused locally, by name, and never reaches the database", { skip }, async () => {
  const tools = await import("../workflows/bankAgent.v1.tools.ts");
  const rec = tools.newBankRunRecord("g1b-h1");
  assert.equal(rec.pack, null, "a fresh record — and a WDK REPLAY rebuilds exactly this, which is why it fails closed");
  const lineId = randomUUID();
  const entryId = randomUUID();
  const ctx = { taskId: randomUUID(), firmId: randomUUID(), clientId: randomUUID(), bankAccountId: randomUUID(), dueReason: null };
  const built = tools.buildBankAgentTools(ctx, rig.DEFAULT_MODEL, rec);
  // EVERY FIXTURE VALUE BELOW IS LEGAL AGAINST THE DB's OWN ROSTERS, deliberately. An earlier
  // version used "bank_charge" and "ref" — both ILLEGAL (0121:5546, :5618) — and nothing ever
  // reded, which was itself the evidence that no cell reached a verb. A guard cell must fail for
  // the reason it names, so its inputs must be valid in every OTHER respect.
  for (const name of ["match_bank_line", "propose_line_exception", "propose_identifier_promotion"]) {
    const args =
      name === "match_bank_line"
        ? { lines: [lineId], entries: [entryId], rationale: "r" }
        : name === "propose_line_exception"
          ? { line_id: lineId, kind: "bank_error", reason: "r", rationale: "r" }
          : { counterparty_id: randomUUID(), identifier_kind: "tin", identifier_value: "X", times_seen: 2, rationale: "r" };
    const res = await built[name].execute(args);
    assert.match(String(res.error), /get_bank_pack first/, `${name} must refuse before any pack read`);
  }
  // 裁-44 / FOLD-3 — the three refusals above are COUNTED as attempted-and-refused writes, which
  // is what makes a night of nothing but these settle failed rather than nothing_due.
  assert.equal(rec.writeAttempts, 3, "each blocked write is still an ATTEMPT");
  assert.equal(rec.refusals, 3, "and each is a refusal");
  assert.equal(rec.infraFaults, 0, "a guard refusal is the model's, never ours");

  // THE NEGATIVE CONTROL, and its earlier version was FALSE — an independent review caught it.
  // It claimed the call "proceeds to the database" and fails there on a fabricated client id. It
  // did not: with no pools injected, `pools()` throws the moment the call reaches the pool layer,
  // so the assertion passed on a message about POOLS and the cell would have been identical had
  // bankScoped not existed at all. What it can honestly show is exactly one step further than the
  // guard: the LOCAL pack guard stood aside and the call reached the pool layer.
  //
  // 裁-44 MOVED WHICH POOL IT REACHES FIRST, and that is itself the thing worth pinning. The write
  // gate now re-reads this run's own task status through the RUNTIME pool BEFORE any credential is
  // minted (FOLD-2), so an uninjected-pools run fails there — with a REDACTED message (FIND-9),
  // because a driver message is no use to a model and this refusal is oracle-safe by contract.
  // The raw cause goes to the runtime log instead.
  rec.pack = { digest: "d".repeat(64), lineCents: new Map([[lineId, 10000]]), entryCaps: new Map([[entryId, { dr: 10000, cr: 0 }]]) };
  rec.digest = rec.pack.digest;
  const proceeded = await built.propose_line_exception.execute({ line_id: lineId, kind: "disputed", reason: "r", rationale: "r" });
  const msg = String(proceeded.error ?? "");
  assert.doesNotMatch(msg, /get_bank_pack first/, "with a pack on the record the local pack guard stands aside");
  assert.match(msg, /could not confirm its own task is still live/, "and the call reaches the FOLD-2 status re-read — the next thing after the guard, named rather than inferred");
  assert.doesNotMatch(msg, /__claraPools|globalThis|pg|ECONNREFUSED/, "FIND-9: no driver or wiring detail is handed to the model");
  assert.equal(rec.infraFaults, 1, "and an unreachable database is OURS, so the run settles 'internal' rather than blaming the model");
});

test("G1B-H2 the PRODUCTION withBankWakeScoped really does SET ROLE clara_wake_bank and bind the secret txn-locally", { skip }, async () => {
  // WHAT THIS CLOSES, named because an independent review named it: every end-to-end bank cell in
  // this battery injects its own withBankWakeScoped stub through globalThis, and that stub sets the
  // role itself. So the SHIPPING helper — lib/pools.mjs's own `set role clara_wake_bank`, which
  // RELAY_TEST_MODE does NOT bypass (setupSql issues it unconditionally) — was proven by no cell at
  // all. This drives it directly.
  //
  // IT IS CHEAP BECAUSE OF loginConfig's OWN TEST BRANCH, not because of a bypass: with no
  // CLARA_BANK_DATABASE_URL set, the bank pool connects with the base env identity and then issues
  // the SAME setup SQL production issues. What is unproven here is only the DSN, which is the
  // ceremony's own subject and has its own cell (G1B-G1).
  const pools = await import("../lib/pools.mjs");
  const w = await rig.buildFirm("g1bh2");
  const minted = await rig.asRuntime((c) =>
    c.query("select secret from clara.mint_wake_credential($1,$2,$3,$4::interval,$5)", ["bank_agent", w.firm, null, "5 minutes", w.client]),
  );
  const secret = String(minted.rows[0].secret);
  try {
    const seen = await pools.withBankWakeScoped(secret, async (c) => {
      // clara.wake_context() is deliberately NOT reachable from this role (measured here: it
      // raises "permission denied for function wake_context"), so the credential's own resolution
      // is proven by the e2e cells' verb calls, not from inside this connection. What IS provable
      // here — and is what this cell exists for — is the role the helper actually set and the
      // scope of the binding it made.
      const r = await c.query(
        `select current_role::text as role,
                current_setting('clara.wake_secret', true) = $1 as secret_bound,
                has_function_privilege('clara.wake_get_bank_pack(uuid,uuid,text,jsonb,text)', 'EXECUTE') as reaches_its_verb`,
        [secret],
      );
      return r.rows[0];
    });
    assert.equal(seen.role, "clara_wake_bank", "the production helper's own SET ROLE — the one no other cell reaches");
    assert.equal(seen.secret_bound, true, "and the secret is bound txn-locally (compared IN SQL, never returned or printed)");
    assert.equal(seen.reaches_its_verb, true, "and the role it reached is the one that actually holds the lane's grants — not merely a role by that name");

    // THE ANTI-LEAK HALF, which is the property that actually matters on a POOLED connection: a
    // second run's checkout must see its OWN secret, never the previous run's. Driven with a
    // genuinely different credential rather than by reasoning about GUC lifetimes — the comparison
    // happens in SQL, so neither secret is ever returned to this process or printed.
    const second = await rig.asRuntime((c) =>
      c.query("select secret from clara.mint_wake_credential($1,$2,$3,$4::interval,$5)", ["bank_agent", w.firm, null, "5 minutes", w.client]),
    );
    const secret2 = String(second.rows[0].secret);
    assert.notEqual(secret2, secret, "two mints, two secrets — otherwise the check below is vacuous");
    const isolated = await pools.withBankWakeScoped(secret2, async (c) => {
      const r = await c.query(
        "select current_setting('clara.wake_secret', true) = $1 as is_mine, current_setting('clara.wake_secret', true) = $2 as is_previous",
        [secret2, secret],
      );
      return r.rows[0];
    });
    assert.equal(isolated.is_mine, true, "the second checkout carries its OWN secret");
    assert.equal(isolated.is_previous, false, "and never the previous run's — a pooled connection does not leak a credential forward");
  } finally {
    // This is the only cell in this battery that opens lib/pools.mjs's own pools; close them or
    // the test process never exits. rig.* uses its own separate pool and is unaffected.
    await pools.endPools();
  }
});
