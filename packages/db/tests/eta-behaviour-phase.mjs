// Wave E lane eta (E-c) — the BEHAVIOURAL half of the contract. A module, not a test file:
// tests/eta-contract.test.mjs imports it (only *.test.mjs is collected).
//
// WHY THIS EXISTS. The catalog half of this battery proves POSTURE — who may execute what, which
// allowlist rows exist, what a function body says. Not one of those cells ever invokes the surface
// it contracts, and the things this lane most depends on are invisible to every catalog instrument:
//
//   1. ARGUMENT ORDER ACROSS TWO CONVENTIONS. Epsilon's _draft_report_spec_core takes
//      (p_actor, p_firm, ...); eta's own three cores take (p_firm, p_actor, ...). Both leading
//      parameters are uuid, so a transposition inside clara.wake_draft_report_spec type-checks,
//      resolves through to_regprocedure, applies cleanly and satisfies every posture assertion in
//      the catalog half — while writing the FIRM id into drafted_by and the AGENT id into firm_id.
//      The only way to see it is to invoke the wrapper and read the row it wrote. That is cell 1.
//   2. THE OP KEY. Its whole purpose is that a replayed WDK step re-executes the tool call without
//      minting a second draft. A signature proves a text argument exists; only calling twice
//      proves one durable effect.
//   3. THE REFUSAL BRANCHES. Save-mints-a-draft-never-an-approval, the deferred render preview,
//      the blank op key, the never-defaulted effective date, the cross-firm wall, the missing
//      credential. Each is a branch, and a branch that is never taken is not evidence.
//
// The cells read the DATABASE's own rows (report_spec_versions, metric_definition_versions,
// audit_log) rather than trusting the receipt the function returned — the receipt is part of what
// is under test, and a wrapper that mis-binds identity can still return a well-formed one.
//
// FIXTURE WEIGHT, IN TWO TIERS — AND THE ORDERING CONSEQUENCE OF THE SECOND, STATED RATHER THAN
// DISCOVERED. Most cells build only what a spec draft structurally requires: a house style and a
// published management template. They touch no evaluator and mint no cell.
//
// The COMPOSE cells cannot be that cheap, because a preview EVALUATES. They need books, a month
// period, a pinned metric-input snapshot, published account sets, and delta's evaluator DEPLOYED —
// a one-way ceremony this phase performs only if it has not already happened — and they therefore
// MINT a composition cell. That was not avoidable: the whole point of those cells is that a
// transposed (p_firm, p_actor) pair in the compose wrapper is invisible until the thing actually
// runs.
//
// The consequence is an ordering constraint, and it is epsilon's existing one rather than a new
// class: delta's contract asserts a pristine clara.metric_cells and an UNDEPLOYED evaluator as its
// own preconditions, so delta's battery must run BEFORE this one on a shared database. The package
// sweep satisfies that by filename order (delta-* < epsilon-* < eta-*), and the focused eta drill
// owns its own database, where nothing else runs at all.

import {
  assert, randomUUID, rootQuery, withActor, ROLES, opk, firmIdOf,
  measure, metricAst, caught, errorDetail,
  freshActiveClient, setupCloseCoa, createStandardSets, plainEntry, mintMonthSnapshot,
  reportingPeriodRows, mintMetricInput, pastMonthStart, BANK1, REVN,
} from "./epsilon-fixtures.mjs";
import { publishHouseStyle, publishTemplate, layoutAst } from "./epsilon-fixtures.mjs";
import { mintWake } from "./rig-fixtures.mjs";

/** The agent principal every wake wrapper attributes to (0002_foundation.sql: an immutable SQL
 *  constant). Pinned here rather than read from clara.agent_user_id(), so the expectation is not
 *  derived from the same function the wrapper used to produce the value under test. */
const AGENT_USER_ID = "00000000-0000-4000-8000-000000c1a7a0";

/** Invoke one statement exactly as the runtime does: role clara_wake_interactive, with
 *  clara.wake_secret set TXN-LOCAL inside an explicit transaction. */
function asWake(secret, sql, args) {
  return withActor({ role: ROLES.wakeInteractive, wakeSecret: secret, transaction: true }, (c) =>
    c.query(sql, args).then((r) => r.rows[0]?.r ?? null),
  );
}

const DRAFT_SPEC_SQL = `select clara.wake_draft_report_spec($1::uuid, $2::text, $3::text, $4::uuid,
  $5::text, $6::jsonb, $7::jsonb, $8::jsonb, $9::date, $10::text) as r`;

const SAVE_DRAFT_SQL = `select clara.wake_save_metric_definition_draft($1::uuid, $2::text, $3::text,
  $4::text, $5::text, $6::smallint, $7::jsonb, $8::boolean, $9::date, $10::date, $11::text) as r`;

const PREVIEW_SQL = "select clara.wake_request_report_preview($1::uuid, $2::text) as r";

const COMPOSE_SQL = `select clara.wake_compose_metric_preview($1::uuid, $2::jsonb, $3::uuid[],
  $4::uuid, $5::text) as r`;

/** Delta's evaluator versions are BORN undeployed and a ONE-WAY ceremony flips them; the composition
 *  preview cannot evaluate without it. Performed here only if it has not been, so this battery runs
 *  on its own pristine database as well as after delta's — epsilon-contract.test.mjs's idiom.
 *
 *  ONE ROW IS EXCLUDED, on epsilon-contract.test.mjs's terms and for its reason: F-A5 PR-1's
 *  clara.evaluate_fs_pack_agent v1 owns its own deploy ceremony (design §3.2 / F5-D28), and this
 *  file runs before F-A5's battery, whose gate cell must be able to observe the refusal. Nothing
 *  in this lane evaluates through that closure, so excluding it costs this battery nothing. The
 *  exclusion's WIDTH is asserted in epsilon-contract.test.mjs, once, rather than in both places. */
const CEREMONY_EXCLUDED = "evaluate_fs_pack_agent";

async function ensureEvaluatorDeployed() {
  const pending = (await rootQuery(
    "select count(*)::int n from clara.evaluator_versions where not deployed and evaluator_name <> $1",
    [CEREMONY_EXCLUDED])).rows[0].n;
  if (pending === 0) return;
  await withActor({ transaction: true }, (db) =>
    db.query("update clara.evaluator_versions set deployed=true where not deployed and evaluator_name <> $1",
      [CEREMONY_EXCLUDED]));
}

// Fixed literals, never a derived date. This lane's doctrine is that an effective date is an
// accounting fact the caller states; a test that computed one from the clock would model the very
// defect epsilon's CI caught and that the explicit argument exists to prevent.
const EFFECTIVE_FROM = "2026-02-01";
const APPLIES_FROM = "2026-01-01";

export async function registerBehaviourPhase(t, world) {
  const owner = world.users.alice;
  const client = world.clients.A1;
  const firm = await firmIdOf(client);
  assert.equal(firm, world.firms.A, "the fixture client really sits in firm A");

  // The one structural prerequisite of a spec draft: a published template version to draft against.
  const style = await publishHouseStyle(owner, { styleKey: `eta-style-${randomUUID().slice(0, 8)}` });
  const layout = layoutAst(["management_summary"]);
  const template = await publishTemplate(owner, {
    templateKey: `eta-tpl-${randomUUID().slice(0, 8)}`, reportClass: "management",
    claimCapability: "no_claim", houseStyleVersionId: style.house_style_version_id, layout,
  });

  const obo = world.users.bob; // the human this wake acts on behalf of
  const cred = await mintWake({ kind: "interactive", firm, onBehalfOf: obo });
  assert.ok(cred.secret, "the rig minted an interactive wake credential");

  const specKey = `eta-spec-${randomUUID().slice(0, 8)}`;
  // parameters mirrors epsilon's own working fixture: the layout's protected placeholders must be
  // bound to supplied literals, so an empty object is not a safe default here.
  const specArgs = [
    client, specKey, "Eta wake-drafted spec", template.report_template_version_id, "en",
    JSON.stringify({ currency: "MYR" }), "{}", JSON.stringify(layout), EFFECTIVE_FROM,
  ];
  const specOpKey = `eta-draft-${randomUUID()}`;

  // CELL 1 — the transposition measurement. Invoke the ONE wrapper that crosses into epsilon's
  // opposite (p_actor, p_firm) convention, then read identity off the row and the audit entry.
  await t.test("wake_draft_report_spec binds actor and firm to the right columns", async () => {
    const receipt = await asWake(cred.secret, DRAFT_SPEC_SQL, [...specArgs, specOpKey]);
    assert.ok(receipt?.report_spec_version_id,
      `the wrapper returned a spec version (${JSON.stringify(receipt)})`);

    const row = (await rootQuery(
      "select firm_id, client_id, drafted_by from clara.report_spec_versions where id=$1",
      [receipt.report_spec_version_id],
    )).rows[0];
    assert.ok(row, "the spec version row persisted");
    // The two assertions a transposed (actor, firm) pair would fail, and that nothing else would.
    assert.equal(row.drafted_by, AGENT_USER_ID, "drafted_by is the AGENT principal, not the firm id");
    assert.equal(row.firm_id, firm, "firm_id is the credential's FIRM, not the agent id");
    assert.equal(row.client_id, client, "the spec is bound to the requested client");

    const audit = (await rootQuery(
      `select actor, on_behalf_of, via_wake_kind from clara.audit_log
        where fn='draft_report_spec' and firm_id=$1 order by at desc limit 1`, [firm],
    )).rows[0];
    assert.ok(audit, "the draft wrote an audit row");
    assert.equal(audit.actor, AGENT_USER_ID, "the audit actor is the agent");
    assert.equal(audit.on_behalf_of, obo, "the audit records the human the wake acted for");
    assert.equal(audit.via_wake_kind, "interactive",
      "the audit distinguishes an agent-drafted spec from a human-drafted one");
  });

  // CELL 2 — replay. A re-executed WDK step must not mint a second draft.
  await t.test("the same op key replays one durable effect, never a second draft", async () => {
    const again = await asWake(cred.secret, DRAFT_SPEC_SQL, [...specArgs, specOpKey]);
    const rows = (await rootQuery(
      `select v.id from clara.report_spec_versions v join clara.report_specs s on s.id=v.report_spec_id
        where s.spec_key=$1 and s.client_id=$2`, [specKey, client],
    )).rows;
    assert.equal(rows.length, 1, "one spec version exists after two identical calls");
    assert.equal(again?.report_spec_version_id, rows[0].id, "the replay returns the FIRST call's receipt");
  });

  // CELL 3 — the two arguments this lane refuses to invent (ADR-0070 ruling 6).
  await t.test("a blank op key and a null effective date are each refused by name", async () => {
    const blank = await caught(() => asWake(cred.secret, DRAFT_SPEC_SQL, [...specArgs, "   "]));
    assert.equal(blank?.code, "CLR10", `blank op key refused (${blank?.code} ${blank?.message})`);
    assert.equal(errorDetail(blank).class, "op_key", "the refusal names op_key as the offending class");

    const noDate = [...specArgs];
    noDate[8] = null; // p_effective_from
    const undated = await caught(() =>
      asWake(cred.secret, DRAFT_SPEC_SQL, [...noDate, `eta-nodate-${randomUUID()}`]));
    assert.equal(undated?.code, "CLR10", `null effective_from refused (${undated?.code} ${undated?.message})`);
    assert.equal(errorDetail(undated).class, "effective_from",
      "the refusal names the date rather than defaulting it to today");
  });

  // CELL 4 — saving a composition mints a DRAFT and can never mint an approval (E-R5).
  await t.test("save_metric_definition_draft mints state=draft and no approved version", async () => {
    const key = `eta_metric_${randomUUID().slice(0, 8)}`;
    const ast = metricAst({ root: measure({ set: "revenue" }), unit: "money" });
    const receipt = await asWake(cred.secret, SAVE_DRAFT_SQL, [
      client, key, "Eta wake-saved draft", ast.unit, ast.temporality, ast.result_scale,
      JSON.stringify(ast), false, APPLIES_FROM, null, `eta-save-${randomUUID()}`,
    ]);
    assert.ok(receipt?.definition_version_id,
      `the wrapper returned a definition version (${JSON.stringify(receipt)})`);

    const row = (await rootQuery(
      `select state, firm_id, proposed_by, approval_evidence, proposal_evidence
         from clara.metric_definition_versions where id=$1`, [receipt.definition_version_id],
    )).rows[0];
    assert.ok(row, "the definition version row persisted");
    assert.equal(row.state, "draft", "the ROW is a draft — read, not inferred from the receipt");
    assert.equal(row.proposed_by, AGENT_USER_ID,
      "the agent is the recorded proposer, which is what makes the approval segregation bite later");
    assert.equal(row.firm_id, firm, "the draft is bound to the credential's firm");
    assert.equal(row.proposal_evidence?.wake_kind, "interactive", "the evidence records the wake lane");
    assert.equal(row.proposal_evidence?.on_behalf_of, obo, "the evidence records the human behind it");
    assert.equal(row.approval_evidence?.kind, "not_applicable", "no approval evidence is fabricated");

    const nonDraft = (await rootQuery(
      `select count(*)::int n from clara.metric_definition_versions v
         join clara.metric_definitions d on d.id=v.definition_id
        where d.definition_key=$1 and v.state <> 'draft'`, [key],
    )).rows[0].n;
    assert.equal(nonDraft, 0, "nothing reachable from this lane produced a non-draft version");
  });

  // CELL 5 — the deferred render preview, invoked on a REAL spec version, refusing by name with
  // the payload the model is instructed to read back to the human.
  await t.test("request_report_preview refuses report_preview_deferred on a real spec", async () => {
    const spec = (await rootQuery(
      `select v.id from clara.report_spec_versions v join clara.report_specs s on s.id=v.report_spec_id
        where s.spec_key=$1 and s.client_id=$2`, [specKey, client],
    )).rows[0];
    assert.ok(spec, "cell 1's spec version is available to preview");

    const refusal = await caught(() =>
      asWake(cred.secret, PREVIEW_SQL, [spec.id, `eta-preview-${randomUUID()}`]));
    assert.equal(refusal?.code, "CLR10", `the preview refused (${refusal?.code} ${refusal?.message})`);
    const d = errorDetail(refusal);
    assert.equal(d.reason, "report_preview_deferred", "it refuses by NAME, not on something incidental");
    assert.equal(d.requested_kind, "draft_watermarked",
      "the render kind stays a watermarked draft even inside the refusal");
    assert.deepEqual(d.blocked_on,
      ["clara.open_report_run", "clara.evaluate_fs_pack_v1", "clara.seal_report_dataset"],
      "the payload names the three human-bound verbs the chain is blocked on");
    assert.ok(typeof d.fix === "string" && d.fix.length > 0, "the refusal carries a fix the model can act on");
  });

  // CELL 6 — the cross-firm wall, MEASURED. The wrapper takes its firm from the credential, so the
  // attack shape is a credential for one firm naming another firm's client. This cell is what turns
  // "a mis-bound firm would fail closed" from a reading of the code into an observation.
  await t.test("a wake credential cannot reach another firm's client", async () => {
    const otherFirm = world.firms.B;
    assert.notEqual(otherFirm, firm, "the rig world really does hold a second firm");
    const foreign = await mintWake({ kind: "interactive", firm: otherFirm, onBehalfOf: null });

    const refusal = await caught(() =>
      asWake(foreign.secret, DRAFT_SPEC_SQL, [...specArgs, `eta-crossfirm-${randomUUID()}`]));
    assert.equal(refusal?.code, "CLR11",
      `a foreign-firm credential is refused (${refusal?.code} ${refusal?.message})`);

    const leaked = (await rootQuery(
      "select count(*)::int n from clara.report_spec_versions where client_id=$1 and firm_id=$2",
      [client, otherFirm],
    )).rows[0].n;
    assert.equal(leaked, 0, "and it wrote nothing across the tenant boundary");
  });

  // CELL 7 — no credential at all. Every wrapper opens with wake_context() and refuses CLR03 before
  // any argument is examined; without this cell the whole allowlist belt could be decorative.
  await t.test("without a wake credential every wrapper refuses CLR03", async () => {
    for (const [label, sql, args] of [
      ["wake_draft_report_spec", DRAFT_SPEC_SQL, [...specArgs, `eta-nocred-${randomUUID()}`]],
      ["wake_request_report_preview", PREVIEW_SQL, [randomUUID(), `eta-nocred-${randomUUID()}`]],
      ["wake_save_metric_definition_draft", SAVE_DRAFT_SQL, [
        client, `eta_nocred_${randomUUID().slice(0, 8)}`, "no credential", "money", "flow", 4,
        JSON.stringify(metricAst({ root: measure({ set: "revenue" }), unit: "money" })),
        false, APPLIES_FROM, null, opk("eta-nocred"),
      ]],
      ["wake_compose_metric_preview", COMPOSE_SQL, [
        client, JSON.stringify(metricAst({ root: measure({ set: "revenue" }), unit: "money" })),
        [randomUUID()], randomUUID(), opk("eta-nocred"),
      ]],
    ]) {
      const refusal = await caught(() =>
        withActor({ role: ROLES.wakeInteractive, transaction: true }, (c) => c.query(sql, args)));
      assert.equal(refusal?.code, "CLR03", `${label} refuses without a credential (${refusal?.code})`);
    }
  });

  // ---------------------------------------------------------------------------------------------
  // COMPOSE. Its own fixture, because a preview EVALUATES: it needs books, a month period, a pinned
  // input snapshot, published account sets and the deployed evaluator. The cells above deliberately
  // avoid all of that; compose cannot.
  // ---------------------------------------------------------------------------------------------
  await ensureEvaluatorDeployed();
  const cClient = await freshActiveClient(owner, `eta-c-${randomUUID().slice(0, 6)}`);
  await setupCloseCoa(owner, cClient);
  await createStandardSets(owner, cClient);
  const monthStart = await pastMonthStart(3);
  await plainEntry(owner, {
    client: cClient, debit: BANK1, credit: REVN, cents: 100_000,
    postingDate: `${monthStart.slice(0, 8)}10`, memo: `eta compose ${randomUUID().slice(0, 8)}`,
  });
  const gamma = await mintMonthSnapshot(owner, { client: cClient, monthStart, opKey: opk("eta-month") });
  const cPeriod = (await reportingPeriodRows(cClient, "month")).find((r) => r.id === gamma.reporting_period_id);
  assert.ok(cPeriod, "the minted month resolves to a live reporting-period row");
  const { snapshotId } = await mintMetricInput(owner, { client: cClient, periodIds: [cPeriod.id] });
  const cAst = metricAst({ root: measure({ set: "revenue" }), unit: "money" });

  // CELL 8 — compose end to end. This is the transposition measurement for compose's OWN
  // (p_firm, p_actor) pair, which every cell above leaves untested: the two are adjacent uuids, so
  // swapping them type-checks and passes the catalog half exactly as it does for draft_report_spec.
  // The cell row carries no actor column, so the binding is read off the AUDIT row the core wrote.
  await t.test("wake_compose_metric_preview mints a definitionless cell and binds identity", async () => {
    const receipt = await asWake(cred.secret, COMPOSE_SQL,
      [cClient, JSON.stringify(cAst), [cPeriod.id], snapshotId, `eta-compose-${randomUUID()}`]);
    assert.ok(receipt?.cell_id, `the wrapper returned a cell (${JSON.stringify(receipt)})`);
    assert.equal(receipt.preview, true, "the receipt says preview");
    assert.equal(receipt.definition_version_id, null, "a preview carries no definition version");
    assert.equal(receipt.statutory_eligible, false, "and is barred from a statutory pack");

    const row = (await rootQuery(
      `select firm_id, client_id, definition_version_id, displayed_text, cell_status,
              inputs->>'schema' as schema from clara.metric_cells where id=$1`, [receipt.cell_id],
    )).rows[0];
    assert.ok(row, "the metric cell persisted");
    assert.equal(row.firm_id, firm, "the cell is bound to the credential's firm");
    assert.equal(row.client_id, cClient, "and to the requested client");
    assert.equal(row.definition_version_id, null, "the ROW is definitionless, not just the receipt");
    assert.equal(row.schema, "clara.metric-composition-inputs/v1", "it is a composition cell");
    // The DB computed the figure and the wall re-derived it; the model quotes displayed_text and
    // never does arithmetic (PRD §6). We assert it EXISTS and matches the receipt — never its value.
    assert.equal(row.displayed_text, receipt.displayed_text, "the receipt quotes the row's own figure");
    if (row.cell_status === "ok") {
      assert.ok(typeof row.displayed_text === "string" && row.displayed_text.length > 0,
        "an ok cell carries the database's own displayed text");
    }

    const audit = (await rootQuery(
      `select actor, on_behalf_of, via_wake_kind from clara.audit_log
        where fn='wake_compose_metric_preview' and firm_id=$1 order by at desc limit 1`, [firm],
    )).rows[0];
    assert.ok(audit, "the preview wrote an audit row");
    assert.equal(audit.actor, AGENT_USER_ID, "the audit actor is the AGENT, not the firm id");
    assert.equal(audit.on_behalf_of, obo, "the audit records the human the wake acted for");
    assert.equal(audit.via_wake_kind, "interactive", "and the lane it came through");
  });

  // CELL 9 — compose's blank op key. Every writing wrapper refuses one; before this, only
  // draft_report_spec did, and compose passed blanks straight into _reserve_op.
  await t.test("wake_compose_metric_preview refuses a blank op key", async () => {
    const blank = await caught(() => asWake(cred.secret, COMPOSE_SQL,
      [cClient, JSON.stringify(cAst), [cPeriod.id], snapshotId, "  "]));
    assert.equal(blank?.code, "CLR10", `blank op key refused (${blank?.code} ${blank?.message})`);
    assert.equal(errorDetail(blank).class, "op_key", "the refusal names op_key as the offending class");
  });

  // CELL 10 — the same blank-key floor on the save wrapper, for the same reason.
  await t.test("wake_save_metric_definition_draft refuses a blank op key", async () => {
    const blank = await caught(() => asWake(cred.secret, SAVE_DRAFT_SQL, [
      client, `eta_blank_${randomUUID().slice(0, 8)}`, "blank key", cAst.unit, cAst.temporality,
      cAst.result_scale, JSON.stringify(cAst), false, APPLIES_FROM, null, "",
    ]));
    assert.equal(blank?.code, "CLR10", `blank op key refused (${blank?.code} ${blank?.message})`);
    assert.equal(errorDetail(blank).class, "op_key", "the refusal names op_key as the offending class");
  });

  // CELL 11 — and the fourth wrapper, which is the one whose blank-key floor is easiest to argue
  // away: its core refuses every call today regardless, so the key looks decorative. It is not. The
  // floor has to be in place BEFORE the OBO evaluator core lands and turns this into a real writer,
  // because at that moment a wrapper that had been quietly accepting blanks starts minting a render
  // per replayed step. The cell covers the whitespace form, not just the empty string — a key of
  // spaces is blank in every sense that matters to an idempotency key.
  await t.test("wake_request_report_preview refuses a blank op key", async () => {
    const blank = await caught(() => asWake(cred.secret, PREVIEW_SQL, [randomUUID(), "   "]));
    assert.equal(blank?.code, "CLR10", `blank op key refused (${blank?.code} ${blank?.message})`);
    assert.equal(errorDetail(blank).class, "op_key", "the refusal names op_key as the offending class");
    // And it refuses on the KEY, before the spec id is ever looked up — the uuid above names no
    // spec, so a CLR11 'not found' here would mean the floor sits after the lookup instead of before.
    assert.notEqual(blank?.code, "CLR11", "the key floor precedes the spec lookup");
  });
}
