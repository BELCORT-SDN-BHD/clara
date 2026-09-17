// #784 — THE LEGACY CLIENT-KNOWLEDGE FACTS ARE READ THROUGH ONE EXPRESSION.
//
// Migration: 0209_knowledge_legacy_readers_converge.sql. Frontier-gated on that file's STABLE
// STEM (`knowledge_legacy_readers_converge$`), never on its number, so a slice-frontier leg
// pinned below it skips loudly and counted rather than reds.
//
// WHAT THIS BATTERY IS FOR. 0192 put the legacy union in ONE place —
// `clara._knowledge_legacy_rows(firm, client)` — and routed the human register
// (`clara.list_client_knowledge`) and the runtime pack (`clara.get_knowledge_pack`) through it,
// flagging every legacy row `authoritative: true`. Four sites in the estate never went through
// it and hand-wrote their own `clara.client_facts` read instead, so "what is this client's live
// legacy fact" had five answers that agreed only by coincidence. #784 repoints three of the four
// and leaves the fourth on its index probe for a measured write-path reason.
//
// The file proves BOTH halves of that, because either alone is a false green:
//
//   STRUCTURE (cells 1-3) — the three repointed bodies name the expression and no longer name
//   the table; the fourth still names the table AND the index its justification is about; and
//   all five functions kept their boundary (owner, SECURITY DEFINER, pinned search_path, exact
//   carried ACL — this migration grants and revokes nothing). Without these cells an agreeing
//   VALUE proves nothing: the five hand-written copies agreed before #784 too.
//
//   CONVERGENCE (cells 4-8, one per carried key) — for each of the five keys, the value the SITE
//   ACTS ON equals the `authoritative: true` legacy row that BOTH `clara.get_knowledge_pack` and
//   `clara.list_client_knowledge` emit for the same client and key; then a governed knowledge
//   record of THAT SAME KEY is captured through the real door and NOTHING moves — not the site,
//   not the register's legacy row, not the pack's. That second half is the no-shadow rule
//   (0192's, restated at the four sites #784 touches) and it is the cell that would catch a
//   repoint that accidentally routed a site through the knowledge records.
//
// THE FIFTH KEY IS OBSERVED THROUGH BEHAVIOUR, NOT A RETURN VALUE. `customer_identity_policy` is
// read by a BEFORE trigger, so "the value the site acts on" is whether a customer counterparty
// carrying a registration number is REFUSED by name. Asserting the refusal token is the only
// honest way to read that site's answer, and it is asserted through the same
// `assertNameOnly` / `assertNotThisGuard` pair 0062's own battery uses, so a unique-index
// violation or an RLS denial cannot be mistaken for the guard firing.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, humanQuery, roleQuery, endPool, opk, ROLES,
} from "./rig-helpers.mjs";
import { knowledgeWorld } from "./knowledge-fixtures.mjs";
import {
  createCounterparty, recordFact, caught, assertNameOnly,
} from "./name-only-guard-fixtures.mjs";
import { markSkip, printSkipCount } from "./wave-a-helpers.mjs";

// ---------------------------------------------------------------------------------------------
// The #784 frontier gate — keyed on the migration's STABLE STEM.
// ---------------------------------------------------------------------------------------------
export const CONVERGE_STEM = "knowledge_legacy_readers_converge$";

let _ready = null;
async function convergeApplied() {
  if (_ready === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1", [CONVERGE_STEM]);
      _ready = r.rows[0].n > 0;
    } catch { _ready = false; }
  }
  return _ready;
}

async function gate(t) {
  if (await convergeApplied()) return false;
  markSkip();
  t.skip(`#784 legacy-reader convergence absent (no ${CONVERGE_STEM} migration applied)`);
  return true;
}

// ---------------------------------------------------------------------------------------------
// The world. One firm, one client, all FIVE carried keys recorded through the ONE legacy door
// (clara.record_client_fact at its 0055 signature) — never by an insert, so what the sites read
// is a fact that arrived the way a real one does.
// ---------------------------------------------------------------------------------------------
const FACTS = {
  entity_type: "sdn_bhd",
  msic: "46900",
  trade_nature: "goods_trading",
  banking_arrangement: "no_accounts",
  customer_identity_policy: "name_only",
};

let world = null;
let fy = null;

before(async () => {
  if (!(await convergeApplied())) return;
  world = await knowledgeWorld("c784");
  for (const [key, value] of Object.entries(FACTS)) {
    await recordFact(world.owner, { client: world.clientA, key, value, basis: "#784 convergence rig" });
  }
  // The close gate takes (client, fiscal_year) and reads the FY's bounds; a real row keeps the
  // cell about trade_nature rather than about a missing year.
  fy = (await rootQuery(
    `insert into clara.fiscal_years(firm_id, client_id, label, starts_on, ends_on, ordinal,
        fy_end_source, opened_by)
     values ($1,$2,$3,'2024-01-01','2024-12-31',1,'asserted',$4) returning id`,
    [world.firm, world.clientA, `c784_${randomUUID().slice(0, 8)}`, world.owner],
  )).rows[0].id;
});

after(async () => {
  printSkipCount("knowledge-legacy-readers-converge");
  await endPool();
});

function cell(name, fn) {
  test(name, async (t) => {
    if (await gate(t)) return;
    await fn(t);
  });
}

// ---------------------------------------------------------------------------------------------
// The three answers a carried key has, and the ONE they must all be.
// ---------------------------------------------------------------------------------------------
const bodyOf = (sig) =>
  rootQuery("select p.prosrc as src from pg_proc p where p.oid = $1::regprocedure", [sig])
    .then((r) => r.rows[0].src);

/** The legacy row the shared expression itself emits — the definition of "the one in force". */
async function expressionValue(key) {
  const r = await rootQuery(
    `select kr as row from jsonb_array_elements(clara._knowledge_legacy_rows($1,$2)) kr
      where kr->>'knowledge_key' = $3`, [world.firm, world.clientA, key]);
  assert.equal(r.rows.length, 1, `the expression emits exactly one live row for ${key}`);
  return r.rows[0].row;
}

/** The HUMAN register's answer (clara.list_client_knowledge, clara_authenticated). */
async function registerValue(key) {
  const pack = (await humanQuery(world.owner,
    "select clara.list_client_knowledge(p_client => $1) as r", [world.clientA])).rows[0].r;
  return oneLegacyRow(pack, key, "list_client_knowledge");
}

/** The RUNTIME pack's answer (clara.get_knowledge_pack, clara_runtime, firm NAMED). */
async function packValue(key) {
  const pack = (await roleQuery(ROLES.runtime,
    `select clara.get_knowledge_pack(p_client => $1, p_purpose => $2, p_firm => $3) as r`,
    [world.clientA, "wiki_coding", world.firm])).rows[0].r;
  return oneLegacyRow(pack, key, "get_knowledge_pack");
}

function oneLegacyRow(pack, key, label) {
  const rows = pack.records.filter(
    (r) => r.knowledge_key === key && r.source_kind === "legacy_client_fact");
  assert.equal(rows.length, 1, `${label} emits exactly one legacy row for ${key}`);
  assert.equal(rows[0].authoritative, true,
    `${label}'s legacy ${key} row is flagged authoritative — it is the one the estate acts on`);
  return rows[0];
}

/** All three reads agree, and each is the scalar the site is expected to act on. */
async function assertOneAnswer(key, expected, label) {
  const e = await expressionValue(key);
  const reg = await registerValue(key);
  const pk = await packValue(key);
  assert.equal(e.value, expected, `${label}: the shared expression's ${key}`);
  assert.equal(reg.value, expected, `${label}: clara.list_client_knowledge's ${key}`);
  assert.equal(pk.value, expected, `${label}: clara.get_knowledge_pack's ${key}`);
  assert.equal(reg.authoritative, true);
  assert.equal(pk.authoritative, true);
  return expected;
}

/** Capture a GOVERNED knowledge record of the same key with a DIFFERENT value, through the real
 *  door. Returns the receipt. The point of every cell that calls this is that NOTHING moves. */
function captureShadow(key, value) {
  return humanQuery(world.owner,
    `select clara.capture_knowledge(p_knowledge_key => $1, p_value => $2::jsonb, p_basis => $3,
       p_op_key => $4, p_scope_kind => 'client', p_client => $5, p_source_kind => 'user_statement',
       p_applies_when => '{}'::jsonb, p_effective_from => null, p_effective_to => null,
       p_source => '{}'::jsonb) as r`,
    [key, JSON.stringify(value), "#784 shadow attempt", opk("c784"), world.clientA],
  ).then((r) => r.rows[0].r);
}

// =============================================================================================
// STRUCTURE — the repoint is real, the exception is deliberate, the boundary did not move.
// =============================================================================================

cell("c784.01 the three repointed bodies read the SHARED expression and no longer read clara.client_facts", async () => {
  for (const sig of [
    "clara.get_context_pack(uuid,text)",
    "clara._close_gate_closing_stock(uuid,uuid)",
    "clara._bank_registry_ledger_state(uuid,date)",
  ]) {
    const src = await bodyOf(sig);
    assert.ok(src.includes("clara._knowledge_legacy_rows"),
      `${sig} must obtain its legacy value through clara._knowledge_legacy_rows`);
    assert.ok(!src.includes("clara.client_facts"),
      `${sig} must no longer read clara.client_facts directly`);
    // …and the firm it passes is the CLIENT'S OWN, derived from clara.clients — never a session
    // firm. A session firm would turn a cross-firm read from "refuses" into "silently empty".
    assert.ok(src.includes("clara.clients"),
      `${sig} must derive the client's own firm from clara.clients`);
  }
  const ctx = await bodyOf("clara.get_context_pack(uuid,text)");
  assert.ok(ctx.includes("clara._knowledge_legacy_rows(cl.firm_id, cl.id)"),
    "get_context_pack passes the client row's own firm_id");
});

cell("c784.02 the counterparty write-path guard DELIBERATELY keeps its direct index probe", async () => {
  const src = await bodyOf("clara._tf_counterparty_name_only_guard()");
  assert.ok(src.includes("clara.client_facts"),
    "the guard keeps its direct read — ARCHITECTURE §5.A records the measured write-path reason");
  assert.ok(src.includes("uq_client_fact_live"),
    "…on the live-row index the justification is about (one probe, not a per-client aggregate)");
  assert.ok(!src.includes("_knowledge_legacy_rows"),
    "…and is not silently repointed, which would leave the recorded justification describing a cost nobody pays");
});

cell("c784.03 all five functions keep owner, SECURITY DEFINER, pinned search_path and their CARRIED ACL", async () => {
  const expected = {
    "clara.get_context_pack(uuid,text)":
      "clara_fn_owner=X/clara_fn_owner|clara_authenticated=X/clara_fn_owner|clara_agent_ro=X/clara_fn_owner",
    "clara._close_gate_closing_stock(uuid,uuid)": "clara_fn_owner=X/clara_fn_owner",
    "clara._bank_registry_ledger_state(uuid,date)": "clara_fn_owner=X/clara_fn_owner",
    "clara._tf_counterparty_name_only_guard()": "clara_fn_owner=X/clara_fn_owner",
    "clara._knowledge_legacy_rows(uuid,uuid)": "clara_fn_owner=X/clara_fn_owner",
  };
  for (const [sig, acl] of Object.entries(expected)) {
    const r = await rootQuery(
      `select pg_get_userbyid(p.proowner) as owner, p.prosecdef as secdef,
              array_to_string(p.proconfig,'|') as config,
              array_to_string(coalesce(p.proacl,'{}'::aclitem[]),'|') as acl
         from pg_proc p where p.oid = $1::regprocedure`, [sig]);
    assert.equal(r.rows.length, 1, `${sig} resolves`);
    const row = r.rows[0];
    assert.equal(row.owner, "clara_fn_owner", `${sig} owner`);
    assert.equal(row.secdef, true, `${sig} SECURITY DEFINER`);
    assert.ok((row.config ?? "").includes("search_path=clara, pg_temp"), `${sig} pinned search_path`);
    assert.equal(row.acl, acl, `${sig} ACL is the CARRIED one — 0209 grants and revokes nothing`);
  }
});

// =============================================================================================
// CONVERGENCE — one cell per carried key: the site's answer IS the authoritative legacy row,
// and a governed knowledge record of the same key moves nothing.
// =============================================================================================

cell("c784.04 entity_type + msic — clara.get_context_pack acts on the authoritative legacy row, and a knowledge record does not shadow it", async () => {
  const readPack = async () => {
    const r = await humanQuery(world.owner,
      "select clara.get_context_pack(p_client => $1, p_purpose => $2) as r",
      [world.clientA, "wiki_coding"]);
    return r.rows[0].r.client;
  };
  for (const key of ["entity_type", "msic"]) await assertOneAnswer(key, FACTS[key], "before");
  const before = await readPack();
  assert.equal(before.entity_type, FACTS.entity_type);
  assert.equal(before.msic, FACTS.msic);

  await captureShadow("entity_type", "partnership");
  await captureShadow("msic", "99999");

  for (const key of ["entity_type", "msic"]) await assertOneAnswer(key, FACTS[key], "after");
  const after = await readPack();
  assert.equal(after.entity_type, FACTS.entity_type,
    "a governed knowledge record does not shadow the legacy entity_type the context pack acts on");
  assert.equal(after.msic, FACTS.msic,
    "…nor the legacy msic");
});

cell("c784.05 trade_nature — clara._close_gate_closing_stock acts on the authoritative legacy row, unshadowed", async () => {
  const gateAnswer = async () => (await rootQuery(
    "select clara._close_gate_closing_stock($1,$2) as r", [world.clientA, fy])).rows[0].r;
  await assertOneAnswer("trade_nature", FACTS.trade_nature, "before");
  const before = await gateAnswer();
  assert.equal(before.trade_nature, FACTS.trade_nature);
  // The gate's own answer is unchanged in SHAPE too — a moved key set would move every
  // attestation's measured_digest, which 0209 must not do.
  assert.equal(before.state, "fail", "a goods trader with no closing-stock marker still fails");
  assert.ok(!Object.prototype.hasOwnProperty.call(before, "no_producer_verb"),
    "0194's drop of the missing-instrument confession is untouched");

  await captureShadow("trade_nature", "services");

  await assertOneAnswer("trade_nature", FACTS.trade_nature, "after");
  const after = await gateAnswer();
  assert.deepEqual(after, before,
    "a governed knowledge record of trade_nature changes nothing the close gate measures");
});

cell("c784.06 banking_arrangement — clara._bank_registry_ledger_state acts on the authoritative legacy row, unshadowed", async () => {
  const ledger = async () => (await rootQuery(
    "select clara._bank_registry_ledger_state($1, current_date) as r", [world.clientA])).rows[0].r;
  await assertOneAnswer("banking_arrangement", FACTS.banking_arrangement, "before");
  const before = await ledger();
  assert.equal(before.reason, "declared_no_accounts",
    "the declared fact is READ (law 68: absence of registered accounts is not evidence)");
  assert.equal(before.state, "clear");

  await captureShadow("banking_arrangement", "has_accounts");

  await assertOneAnswer("banking_arrangement", FACTS.banking_arrangement, "after");
  assert.deepEqual(await ledger(), before,
    "a governed knowledge record of banking_arrangement does not flip the ledger state");
});

cell("c784.07 customer_identity_policy — the name-only guard acts on the authoritative legacy row, unshadowed", async () => {
  const probe = async (label) => {
    const err = await caught(() => createCounterparty(world.owner, {
      client: world.clientA, kind: "customer", name: `c784 ${label} ${randomUUID().slice(0, 8)}`,
      registration: `C784${randomUUID().slice(0, 6).toUpperCase()}`,
    }));
    // By SQLSTATE *and* by the guard's own reason token — a unique-index violation, an RLS
    // denial or the 0011 mutation wall all FAIL this, which is what makes the cell evidence.
    assertNameOnly(err, label);
  };
  await assertOneAnswer("customer_identity_policy", FACTS.customer_identity_policy, "before");
  await probe("before");

  await captureShadow("customer_identity_policy", "unrestricted");

  await assertOneAnswer("customer_identity_policy", FACTS.customer_identity_policy, "after");
  await probe("after");
});

cell("c784.08 the legacy door is still the ONLY thing that moves a carried key — for all five at once", async () => {
  // Move every carried key through clara.record_client_fact and watch all four sites follow.
  // This is the converse of cells 4-7: there, a knowledge write moved nothing; here, the legacy
  // door moves everything, which is what "the legacy row is the one in force" means.
  await recordFact(world.owner, { client: world.clientB, key: "trade_nature", value: "services",
    basis: "#784 converse rig" });
  await recordFact(world.owner, { client: world.clientB, key: "banking_arrangement",
    value: "has_accounts", basis: "#784 converse rig" });

  const bFy = (await rootQuery(
    `insert into clara.fiscal_years(firm_id, client_id, label, starts_on, ends_on, ordinal,
        fy_end_source, opened_by)
     values ($1,$2,$3,'2024-01-01','2024-12-31',1,'asserted',$4) returning id`,
    [world.firm, world.clientB, `c784b_${randomUUID().slice(0, 8)}`, world.owner],
  )).rows[0].id;

  const gateB = (await rootQuery(
    "select clara._close_gate_closing_stock($1,$2) as r", [world.clientB, bFy])).rows[0].r;
  assert.equal(gateB.trade_nature, "services");
  assert.equal(gateB.state, "pass", "a services trader passes the closing-stock gate");

  const ledgerB = (await rootQuery(
    "select clara._bank_registry_ledger_state($1, current_date) as r", [world.clientB])).rows[0].r;
  assert.equal(ledgerB.reason, "bank_registry_contradicted");
  assert.equal(ledgerB.state, "gap");

  // …and the register and the pack say the same, for the same client, through the same expression.
  const reg = (await humanQuery(world.owner,
    "select clara.list_client_knowledge(p_client => $1) as r", [world.clientB])).rows[0].r;
  const pk = (await roleQuery(ROLES.runtime,
    "select clara.get_knowledge_pack(p_client => $1, p_purpose => $2, p_firm => $3) as r",
    [world.clientB, "wiki_coding", world.firm])).rows[0].r;
  for (const [pack, label] of [[reg, "list_client_knowledge"], [pk, "get_knowledge_pack"]]) {
    assert.equal(oneLegacyRow(pack, "trade_nature", label).value, "services");
    assert.equal(oneLegacyRow(pack, "banking_arrangement", label).value, "has_accounts");
  }
});
