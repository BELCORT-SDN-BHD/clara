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

test("G1B-I2 the bank classifier's closed world of three reply shapes — DRIVEN, both directions", { skip }, async () => {
  const tools = await import("../workflows/bankAgent.v1.tools.ts");

  // AN EARLIER VERSION OF THIS CELL TESTED NOTHING IT WAS NAMED FOR (independent review, S7): it
  // built the tool set, asserted it was truthy, and then only grepped the prosrc. Deleting the
  // classifier's body entirely left it green. The fix is the shape I1 already had — DRIVE the
  // function, both directions — and the prosrc pin stays as the second leg, not the only one.
  const count = (reply) => {
    const rec = tools.newBankRunRecord();
    tools.countIfAdmitted(rec, reply);
    return rec.admitted;
  };
  // The three shapes, using the ACTUAL success payloads the cores return: match →
  // {match_id, status:'live'} (0121:2306); exception/promotion → {proposal_id, status:'open'}
  // (0121:5565, :5642).
  assert.equal(count({ match_id: randomUUID(), status: "live" }), 1, "a match result counts");
  assert.equal(count({ proposal_id: randomUUID(), status: "open", line_id: randomUUID() }), 1, "a proposal result counts");
  assert.equal(count({ digest: "abc", lines: [] }), 1, "a pack read with no status at all counts");
  assert.equal(count({ status: "refused", rung_vector: [{ rung: "M2" }] }), 0, "a DB refusal counts nothing");
  assert.equal(count({ error: "refused (CLR03): …" }), 0, "a caught throw counts nothing");
  assert.equal(count(null), 0, "and neither does nothing");

  // THE SECOND LEG: pin that the live cores still have no uniform admitted key, so a future recut
  // that ADDS one makes this cell fail rather than silently leaving the classifier weaker than it
  // could be. Scoped honestly — this reads ONE core, and the other three RAISE rather than
  // returning a refusal, so the closed world is generalised from this one plus that fact.
  const src = await rig.rootQuery(
    "select prosrc from pg_proc where oid = 'clara._agent_match_bank_line_core(uuid,jsonb,jsonb,jsonb,boolean,text,jsonb,text,text)'::regprocedure",
  );
  const body = String(src.rows[0].prosrc);
  assert.match(body, /'status'\s*,\s*'refused'/, "a refusal still says status='refused'");
  assert.match(body, /return v_res;/, "and a success still returns the delegate's own result verbatim");
  assert.doesNotMatch(body, /'outcome'\s*,\s*'admitted'/, "still no uniform admitted key in the reply");
});

test("G1B-I3 EVERY DB call matches its function's LIVE declared arity AND argument names, in order", { skip: skip0138 }, async () => {
  // THE HIGHEST-VALUE MECHANICAL CHECK IN THIS FILE. Sixteen hand-written parameter lists across
  // two frozen tool sets, every one of them a chance to drop or transpose an argument — and an
  // arity slip is not a crash a reviewer would see: it is a wrong write, or a refusal blamed on
  // the wrong thing. Typecheck cannot see inside a SQL string, and no behavioural cell reaches
  // most of these verbs (they need real books to act on).
  //
  // THE INSTRUMENT IS THE CATALOG, NOT THE MIGRATION SOURCE (review law 3: the migration text is
  // a projection of the function; pg_proc IS the function). A verb whose name resolves to more
  // than one overload fails here too — an ambiguous call is not a checked call.
  //
  // WHAT THIS GATE CAN AND CANNOT SEE, said plainly so it is never mistaken for a shape review.
  // It now covers TWO classes: arity (the outer envelope) and ORDER — the latter only because
  // every call is written in named notation, which is what makes a transposition expressible as a
  // wrong NAME rather than an invisible wrong position.
  //
  // IT STILL CANNOT SEE a wrong jsonb SUB-SHAPE inside a correctly-named argument, which is where
  // every shape defect this PR found actually lived: a uuid array where objects were needed, an
  // object where a non-empty array was needed, a model identity with the wrong two keys. Perfect
  // arity, perfect names, wrong contents. Only a call that reaches the verb catches that class —
  // cell G1B-E2a is that instrument, and it is why it exists.
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const dir = fileURLToPath(new URL("../workflows/", import.meta.url));
  const files = ["bankAgent.v1.tools.ts", "closePrep.v1.reads.ts", "closePrep.v1.tools.ts"];

  const calls = [];
  for (const f of files) {
    const src = readFileSync(dir + f, "utf8");
    // The argument span is matched with a BALANCED-PAREN walk rather than [^)]*, which would stop
    // at the first close-paren and silently TRUNCATE a call containing a nested one (a future
    // `coalesce($1,$2)`) — under-counting its placeholders while still satisfying the count pin.
    for (const m of src.matchAll(/select\s+clara\.(\w+)\(/g)) {
      let depth = 1;
      let i = m.index + m[0].length;
      for (; i < src.length && depth > 0; i++) {
        if (src[i] === "(") depth++;
        else if (src[i] === ")") depth--;
      }
      assert.equal(depth, 0, `unbalanced parentheses in a clara.${m[1]} call in ${f}`);
      const span = src.slice(m.index + m[0].length, i - 1);
      const placeholders = new Set([...span.matchAll(/\$(\d+)/g)].map((x) => Number(x[1])));
      const names = [...span.matchAll(/(\w+)\s*=>/g)].map((x) => x[1]);
      calls.push({ file: f, name: m[1], span, max: Math.max(...placeholders), distinct: placeholders.size, names });
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

    // AND NOW THE ORDER GATE, which is what named notation buys and arity alone never could.
    // Every argument must be written `p_name => $n`, and the names must be the catalog's own, IN
    // ORDER. That closes the four transposition cases the database cannot see for itself — the
    // adjacent free-form prose pairs (p_narrative/p_rationale, p_reason/p_rationale,
    // p_label/p_rationale, and the bank rationale/op_key tail) whose swap SUCCEEDS and writes each
    // value into the other's column with no error anywhere.
    const catalogNames = r.rows[0].ident.split(",").map((s) => s.trim().split(/\s+/)[0]);
    assert.equal(
      c.names.length,
      declared,
      `clara.${c.name} (${c.file}): must use NAMED argument notation for every argument (p_x => $n) — saw ${c.names.length} of ${declared}. Positional notation lets two same-typed arguments be silently transposed.`,
    );
    assert.deepEqual(
      c.names,
      catalogNames,
      `clara.${c.name} (${c.file}): argument names must match the catalog IN ORDER.\n  call:    ${c.names.join(", ")}\n  catalog: ${catalogNames.join(", ")}`,
    );
  }
});

test("G1B-I7 a fault that never reached the database is OURS, not the model's", { skip: skip0138 }, async () => {
  // S9 (independent review): every zero-read run used to settle error_code='model_error', but the
  // causes landing there are not all the model — pools not injected, a credential mint failure, a
  // driver fault, and assertTailBinding's throw, which is a CODE DEFECT IN A FROZEN BODY being
  // recorded on a durable audit field as the model's fault. Since that guard fires on a static
  // property, ONE drifted call site would have settled EVERY close task 'model_error' until
  // somebody noticed. error_code is the first field a dead-letter triage reads.
  const reads = await import("../workflows/closePrep.v1.reads.ts");

  // A CLR-coded refusal IS the database judging the request — not our fault, not counted.
  const dbVerdict = reads.newCloseRunRecord();
  for (const code of ["CLR03", "CLR04", "CLR10", "CLR11"]) {
    const e = Object.assign(new Error("refused"), { code });
    reads.closeRefusal(dbVerdict, e);
  }
  assert.equal(dbVerdict.infraFaults, 0, "four real DB verdicts are not infrastructure faults");

  // Everything else never reached the database, whatever it carries.
  const ours = reads.newCloseRunRecord();
  reads.closeRefusal(ours, new Error("runtime pools not injected (globalThis.__claraPools)"));
  reads.closeRefusal(ours, new Error("wake_abandon_close: SQL binds 5 distinct placeholders ... drifted apart"));
  reads.closeRefusal(ours, Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }));
  reads.closeRefusal(ours, "a bare string, not an Error at all");
  assert.equal(ours.infraFaults, 4, "a pools failure, the tail guard, a driver fault and a non-Error are all OURS");

  // THE ORACLE-SAFETY PROPERTY MUST SURVIVE THE CHANGE: a CLR refusal's message must still be
  // identical across the four codes' families, so it cannot become an existence oracle.
  const m03 = reads.closeRefusal(reads.newCloseRunRecord(), Object.assign(new Error("x"), { code: "CLR03" })).error;
  const m11 = reads.closeRefusal(reads.newCloseRunRecord(), Object.assign(new Error("totally different"), { code: "CLR11" })).error;
  assert.equal(m03.replace("CLR03", "X"), m11.replace("CLR11", "X"), "the refusal text must not vary with the underlying message");
});

test("G1B-I6 the close helper refuses a call site whose tail numbering has drifted", { skip: skip0138 }, async () => {
  // NAMED NOTATION CLOSED THE *NAME* HALF, NOT THE *VALUE* HALF (independent review). On the close
  // lane the placeholder-to-value mapping is split across two files: each call site supplies
  // $1..$n, and callCloseVerb appends the tail three. Every site's tail numbers therefore encode
  // an assumption about that append order. Add an argument to an argsBefore array without bumping
  // the tail and the rationale lands in the new parameter's slot — same-typed, non-blank, silent.
  // assertTailBinding bounds that drift class; this cell proves it is not decorative.
  const reads = await import("../workflows/closePrep.v1.reads.ts");
  const GOOD = "select clara.wake_abandon_close(p_close_run => $1, p_reason => $2, p_rationale => $3, p_model => $4::jsonb, p_op_key => $5) as r";

  // POSITIVE CONTROL FIRST: the real, shipping SQL for this verb must pass at its real value
  // count. Without this, every negative below could be passing because the guard rejects
  // everything.
  assert.doesNotThrow(() => reads.assertTailBinding("wake_abandon_close", GOOD, 5));

  // DRIFT: a sixth value with the tail left at $3-$5. This is the exact edit the guard exists for.
  assert.throws(() => reads.assertTailBinding("wake_abandon_close", GOOD, 6), /drifted apart/);
  // The mirror: a site that renumbered the tail but did not add the value.
  const RENUMBERED = "select clara.wake_abandon_close(p_close_run => $1, p_reason => $2, p_new => $3, p_rationale => $4, p_model => $5::jsonb, p_op_key => $6) as r";
  assert.throws(() => reads.assertTailBinding("wake_abandon_close", RENUMBERED, 5), /drifted apart/);
  assert.doesNotThrow(() => reads.assertTailBinding("wake_abandon_close", RENUMBERED, 6));

  // TAIL BOUND TO THE WRONG PLACEHOLDERS at a correct count — the transposition shape itself,
  // caught by NAME rather than by arithmetic.
  const SWAPPED = "select clara.wake_abandon_close(p_close_run => $1, p_reason => $2, p_rationale => $4, p_model => $3::jsonb, p_op_key => $5) as r";
  assert.throws(() => reads.assertTailBinding("wake_abandon_close", SWAPPED, 5), /p_rationale => \$3/);
});

test("G1B-I4 NEITHER body can write a receipt — every receipt is the verb's own in-txn act", { skip: skip0138 }, async () => {
  // THE HONEST SHAPE OF "settled with the expected receipts". These two bodies write ZERO
  // receipts themselves: bank_agent_receipts is written inside _agent_bank_receipt and
  // agent_act_receipts inside _agent_close_receipt, both in the SAME transaction as their DML,
  // and the DB's own batteries prove those fire. What is THIS lane's to prove is the other half
  // — that the bodies cannot fabricate or skip one — and that is measured two ways.
  const { readFileSync, readdirSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const dir = fileURLToPath(new URL("../workflows/", import.meta.url));

  // (1) STRUCTURAL: no member of either frozen closure contains an INSERT/UPDATE/DELETE against a
  // receipt table. A body that could write one could write a receipt for an act it never took.
  const members = readdirSync(dir).filter((f) => /^(bankAgent|closePrep)\.v1/.test(f));
  assert.ok(members.length >= 13, `expected both closures present, saw ${members.length}`);
  for (const f of members) {
    const src = readFileSync(dir + f, "utf8");
    // Comments legitimately NAME the tables; only a SQL write against one is the defect.
    const writes = src.match(/(insert\s+into|update|delete\s+from)\s+clara\.(bank_agent_receipts|agent_act_receipts)/gi);
    assert.equal(writes, null, `${f} must never write a receipt table directly, found: ${writes}`);
  }

  // (2) THE PRIVILEGE WALL — has_table_privilege, NOT information_schema.table_privileges.
  // The distinction was an independent review's finding and it is real: table_privileges reports
  // grants made to a role NAME. It resolves neither role INHERITANCE (a grant to a parent role
  // these three are members of lands under the PARENT's name) nor PUBLIC (which lands under
  // grantee='PUBLIC'). Either would return zero rows and pass a cell whose subject could still
  // write. has_table_privilege answers the question actually being asked — "can this role do
  // this?" — and resolves both in one call. Same derived-vs-behavioural discipline G1B-F1 uses
  // one screen up.
  const ROLES = ["clara_runtime", "clara_wake_bank", "clara_wake_interactive"];
  const TABLES = ["clara.bank_agent_receipts", "clara.agent_act_receipts"];
  for (const role of ROLES) {
    for (const table of TABLES) {
      const p = await rig.rootQuery(
        `select has_table_privilege($1,$2,'INSERT') as ins,
                has_table_privilege($1,$2,'UPDATE') as upd,
                has_table_privilege($1,$2,'DELETE') as del`,
        [role, table],
      );
      const { ins, upd, del } = p.rows[0];
      assert.equal(ins, false, `${role} must not INSERT ${table}`);
      assert.equal(upd, false, `${role} must not UPDATE ${table}`);
      assert.equal(del, false, `${role} must not DELETE ${table}`);
    }
  }

  // POSITIVE CONTROL on the instrument itself: has_table_privilege is not simply answering false
  // to everything (a wrong role name would throw, but a wrong TABLE name would too — what this
  // guards is the reader concluding "false everywhere" means "the query works"). The owner CAN
  // write these tables, and clara_authenticated CAN read them.
  const control = await rig.rootQuery(
    `select has_table_privilege('clara_fn_owner','clara.agent_act_receipts','INSERT') as owner_ins,
            has_table_privilege('clara_authenticated','clara.agent_act_receipts','SELECT') as human_sel`,
  );
  assert.equal(control.rows[0].owner_ins, true, "the owner CAN write — so 'false' above is a real answer, not a broken query");
  assert.equal(control.rows[0].human_sel, true, "and the human read door stays open");

  // (3) THE STRUCTURAL GUARANTEE, which does not depend on any grant census staying empty: both
  // tables carry forced RLS, so even a granted INSERT from a lane role is refused by policy.
  const rls = await rig.rootQuery(
    `select c.relname, c.relrowsecurity, c.relforcerowsecurity
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname='clara' and c.relname in ('bank_agent_receipts','agent_act_receipts')`,
  );
  assert.equal(rls.rows.length, 2, "both receipt tables must exist");
  for (const row of rls.rows) {
    assert.equal(row.relrowsecurity, true, `${row.relname}: RLS enabled`);
    assert.equal(row.relforcerowsecurity, true, `${row.relname}: RLS FORCED — the owner is not exempt either`);
  }
});

test("G1B-H1 a bank WRITE before any pack read is refused locally, by name, and never reaches the database", { skip }, async () => {
  const tools = await import("../workflows/bankAgent.v1.tools.ts");
  const rec = tools.newBankRunRecord();
  assert.equal(rec.digest, null, "a fresh record — and a WDK REPLAY rebuilds exactly this, which is why it fails closed");
  const ctx = { taskId: randomUUID(), firmId: randomUUID(), clientId: randomUUID(), bankAccountId: randomUUID(), dueReason: null };
  const built = tools.buildBankAgentTools(ctx, rig.DEFAULT_MODEL, rec);
  // EVERY FIXTURE VALUE BELOW IS LEGAL AGAINST THE DB's OWN ROSTERS, deliberately. An earlier
  // version used "bank_charge" and "ref" — both ILLEGAL (0121:5546, :5618) — and nothing ever
  // reded, which was itself the evidence that no cell reached a verb. A guard cell must fail for
  // the reason it names, so its inputs must be valid in every OTHER respect.
  for (const name of ["match_bank_line", "propose_line_exception", "propose_identifier_promotion"]) {
    const args =
      name === "match_bank_line"
        ? { lines: [randomUUID()], entries: [{ entry_id: randomUUID(), matched_cents: 1000 }], rationale: "r" }
        : name === "propose_line_exception"
          ? { line_id: randomUUID(), kind: "bank_error", reason: "r", rationale: "r" }
          : { counterparty_id: randomUUID(), identifier_kind: "tin", identifier_value: "X", times_seen: 2, rationale: "r" };
    const res = await built[name].execute(args);
    assert.match(String(res.error), /get_bank_pack first/, `${name} must refuse before any pack read`);
  }

  // THE NEGATIVE CONTROL, and its earlier version was FALSE — an independent review caught it.
  // It claimed the call "proceeds to the database" and fails there on a fabricated client id. It
  // did not: with no pools injected, `pools()` throws "runtime pools not injected" the moment
  // bankScoped is reached, so the assertion passed on a message about POOLS and the cell would
  // have been identical had bankScoped not existed at all. What it can honestly show is exactly
  // one step further than the guard: the LOCAL guard stood aside and the call reached the pool
  // layer. So that is what it now asserts — by NAME, not by the absence of the other message.
  rec.digest = "deadbeef";
  const proceeded = await built.propose_line_exception.execute({ line_id: randomUUID(), kind: "disputed", reason: "r", rationale: "r" });
  const msg = String(proceeded.error ?? "");
  assert.doesNotMatch(msg, /get_bank_pack first/, "with a digest the local guard stands aside");
  assert.match(msg, /runtime pools not injected/, "and the call reaches the pool layer — the next thing after the guard, named rather than inferred");
});
