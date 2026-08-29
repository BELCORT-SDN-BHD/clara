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
  assert.equal(out.freeformRequired, true, "POSITIVE CONTROL: the same assert DOES throw when a genuinely eager DSN is missing");
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

// =====================================================================================
// I · THE REPLY CLASSIFIERS, pinned against the SHAPES THE MIGRATIONS ACTUALLY RETURN.
//     Both were WRONG in an earlier draft and neither test nor typecheck could see it —
//     they are pure shape agreements with a jsonb blob, so the pin is the only instrument.
// =====================================================================================

test("G1B-I1 the close classifier reads status='acted' — the shape 0138's own cores return", { skip: skip0138 }, async () => {
  const reads = await import("../workflows/closePrep.v1.reads.ts");
  const mk = () => reads.newCloseRunRecord();

  // THE SHAPES, read out of the migration source rather than invented, so this cell fails if the
  // DB's own vocabulary ever moves: _agent_begin_close_core returns {status:'acted',receipt_id,
  // result} on success and {status:'refused',receipt_id,rung_vector} on refusal.
  const src = await rig.rootQuery(
    "select prosrc from pg_proc where oid = 'clara._agent_begin_close_core(jsonb,uuid,text,jsonb,text)'::regprocedure",
  );
  const body = String(src.rows[0].prosrc);
  assert.match(body, /'status',\s*'acted'/, "the LIVE body must still return status='acted' on the acted path");
  assert.match(body, /'status',\s*'refused'/, "and status='refused' on the refused path");
  assert.doesNotMatch(body, /'outcome',\s*'admitted'/, "the bank lane's 'admitted' vocabulary must NOT appear here");

  let rec = mk();
  reads.countIfAdmitted(rec, { status: "acted", receipt_id: randomUUID(), result: { close_run_id: randomUUID() } });
  assert.equal(rec.acts, 1, "an acted reply counts");
  rec = mk();
  reads.countIfAdmitted(rec, { status: "refused", rung_vector: [{ rung: "B3" }] });
  reads.countIfAdmitted(rec, { error: "refused (CLR03): …" });
  reads.countIfAdmitted(rec, null);
  reads.countIfAdmitted(rec, { outcome: "admitted" }); // the WRONG vocabulary must count nothing
  assert.equal(rec.acts, 0, "nothing else counts — and the bank lane's own key counts nothing here");
});

test("G1B-I2 the bank classifier's closed world of three reply shapes", { skip }, async () => {
  const tools = await import("../workflows/bankAgent.v1.tools.ts");
  const ctx = { taskId: randomUUID(), firmId: randomUUID(), clientId: randomUUID(), bankAccountId: randomUUID(), dueReason: null };
  const rec = tools.newBankRunRecord();
  rec.digest = "deadbeef";
  const built = tools.buildBankAgentTools(ctx, "m", rec);
  assert.ok(built, "the tool set builds");

  // The bank cores return the DELEGATE's own result on success (0121:6027, `return v_res`) — no
  // uniform 'admitted' key exists to test, which is why the classifier enumerates the closed
  // world instead. Pin that the LIVE core still has no such key, so a future recut that adds one
  // makes this cell fail rather than silently leaving the classifier weaker than it could be.
  const src = await rig.rootQuery(
    "select prosrc from pg_proc where oid = 'clara._agent_match_bank_line_core(uuid,jsonb,jsonb,jsonb,boolean,text,jsonb,text,text)'::regprocedure",
  );
  const body = String(src.rows[0].prosrc);
  assert.match(body, /'status'\s*,\s*'refused'/, "a refusal still says status='refused'");
  assert.match(body, /return v_res;/, "and a success still returns the delegate's own result verbatim");
});

test("G1B-I3 EVERY DB call in both tool sets matches its function's LIVE declared arity", { skip: skip0138 }, async () => {
  // THE HIGHEST-VALUE MECHANICAL CHECK IN THIS FILE. Sixteen hand-written parameter lists across
  // two frozen tool sets, every one of them a chance to drop or transpose an argument — and an
  // arity slip is not a crash a reviewer would see: it is a wrong write, or a refusal blamed on
  // the wrong thing. Typecheck cannot see inside a SQL string, and no behavioural cell reaches
  // most of these verbs (they need real books to act on).
  //
  // THE INSTRUMENT IS THE CATALOG, NOT THE MIGRATION SOURCE (review law 3: the migration text is
  // a projection of the function; pg_proc IS the function). A verb whose name resolves to more
  // than one overload fails here too — an ambiguous call is not a checked call.
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const dir = fileURLToPath(new URL("../workflows/", import.meta.url));
  const files = ["bankAgent.v1.tools.ts", "closePrep.v1.reads.ts", "closePrep.v1.tools.ts"];

  const calls = [];
  for (const f of files) {
    const src = readFileSync(dir + f, "utf8");
    for (const m of src.matchAll(/select\s+clara\.(\w+)\(([^)]*)\)\s+as\s+\w+/g)) {
      const placeholders = new Set([...m[2].matchAll(/\$(\d+)/g)].map((x) => Number(x[1])));
      calls.push({ file: f, name: m[1], max: Math.max(...placeholders), distinct: placeholders.size });
    }
  }
  // 4 bank + 12 close = 16. Pinned as a COUNT so a future call that silently stops matching the
  // regex (a reformat, a renamed alias) is caught here rather than skipped in silence.
  assert.equal(calls.length, 16, `expected 16 DB calls across the two tool sets, saw ${calls.length}`);

  for (const c of calls) {
    const r = await rig.rootQuery(
      `select pg_get_function_identity_arguments(p.oid) as ident, p.pronargs
         from pg_proc p where p.pronamespace='clara'::regnamespace and p.proname=$1`,
      [c.name],
    );
    assert.equal(r.rows.length, 1, `clara.${c.name} (${c.file}) must resolve to EXACTLY one catalog entry, saw ${r.rows.length}`);
    const declared = Number(r.rows[0].pronargs);
    assert.equal(c.max, declared, `clara.${c.name} (${c.file}): highest placeholder $${c.max} but the verb declares ${declared} args — [${r.rows[0].ident}]`);
    assert.equal(c.distinct, declared, `clara.${c.name} (${c.file}): ${c.distinct} distinct placeholders but the verb declares ${declared} — a repeated or skipped $n`);
  }
});

test("G1B-H1 a bank WRITE before any pack read is refused locally, by name, and never reaches the database", { skip }, async () => {
  const tools = await import("../workflows/bankAgent.v1.tools.ts");
  const rec = tools.newBankRunRecord();
  assert.equal(rec.digest, null, "a fresh record — and a WDK REPLAY rebuilds exactly this, which is why it fails closed");
  const ctx = { taskId: randomUUID(), firmId: randomUUID(), clientId: randomUUID(), bankAccountId: randomUUID(), dueReason: null };
  const built = tools.buildBankAgentTools(ctx, rig.DEFAULT_MODEL, rec);
  for (const name of ["match_bank_line", "propose_line_exception", "propose_identifier_promotion"]) {
    const args =
      name === "match_bank_line"
        ? { lines: [randomUUID()], entries: [randomUUID()], rationale: "r" }
        : name === "propose_line_exception"
          ? { line_id: randomUUID(), kind: "bank_charge", reason: "r", rationale: "r" }
          : { counterparty_id: randomUUID(), identifier_kind: "ref", identifier_value: "X", times_seen: 2, rationale: "r" };
    const res = await built[name].execute(args);
    assert.match(String(res.error), /get_bank_pack first/, `${name} must refuse before any pack read`);
  }
  // NEGATIVE CONTROL so the guard is not vacuous: with a digest recorded, the guard no longer
  // fires — the call proceeds to the database (and fails there, on a fabricated client id,
  // which is the DB's refusal to make, not this guard's).
  rec.digest = "deadbeef";
  const proceeded = await built.propose_line_exception.execute({ line_id: randomUUID(), kind: "k", reason: "r", rationale: "r" });
  assert.doesNotMatch(String(proceeded.error ?? ""), /get_bank_pack first/, "with a digest the local guard stands aside");
});
