// Wave-A rig — GRANT matrix (§13), PUBLIC-zero-execute, one-overload hygiene, and
// the AB-3 engine_kind pin (probe 27): record_rule_resolution reads only
// ('ocr','structured_parse') AND keeps its login-direct EXECUTE grant. Contract-
// blind: companion §1/§13 + INTERFACE-PINS §1/§2/§6 — NEVER from 0011. Every test
// SKIPS (counted) until 0011 lands.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  ROLES, rootQuery, endPool, printLaneNotes, noteLane, printSkipCount, skipUnready,
  waveAEnsureReady, buildWorld, WA_GRANTS, WA_UNGRANTED_FNS,
  firmOf, recordRuleResolution, seedVerifiedDocument, seedExtraction, seedRegion, addClientIdentifier,
} from "./wave-a-fixtures.mjs";

let ready = false;
let world = null;
before(async () => {
  ready = await waveAEnsureReady();
  if (ready) world = await buildWorld();
});
after(async () => { printLaneNotes("wave-a-grants"); printSkipCount("wave-a-grants"); await endPool(); });

const ALL_ROLES = [ROLES.authenticated, ROLES.agentRo, ROLES.runtime, ROLES.wakeInteractive, ROLES.wakeProactive];
const roleName = (tok) => ROLES[tok];

// ===========================================================================
// §13 grant matrix — every new fn holds EXACTLY its lane grants (companion §13).
// ===========================================================================

test("§13 the new granted fns hold EXACTLY their lane grants; every other app role is denied", async (t) => {
  if (skipUnready(t, ready)) return;
  for (const [fn, tokens] of Object.entries(WA_GRANTS)) {
    const present = await rootQuery(
      "select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara' and p.proname=$1 limit 1", [fn]);
    if (!present.rowCount) { assert.fail(`clara.${fn} is ABSENT (PINS §2 / companion §13 names it — finding)`); }
    const want = new Set(tokens.map(roleName));
    for (const role of ALL_ROLES) {
      const ok = (await rootQuery(
        "select has_function_privilege($1, p.oid, 'execute') as ok from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara' and p.proname=$2 limit 1",
        [role, fn])).rows[0].ok;
      assert.equal(ok, want.has(role), `${role} EXECUTE clara.${fn}: expected ${want.has(role)}, got ${ok}`);
    }
  }
});

test("§13 the shared internal predicate _open_question_blocks is granted to NO app role", async (t) => {
  if (skipUnready(t, ready)) return;
  for (const fn of WA_UNGRANTED_FNS) {
    const present = await rootQuery("select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara' and p.proname=$1 limit 1", [fn]);
    if (!present.rowCount) { noteLane(`${fn} absent — the shared predicate name may differ (interface expectation)`); continue; }
    for (const role of ALL_ROLES) {
      const ok = (await rootQuery("select has_function_privilege($1, p.oid, 'execute') as ok from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara' and p.proname=$2 limit 1", [role, fn])).rows[0].ok;
      assert.equal(ok, false, `${role} must NOT execute internal helper clara.${fn}`);
    }
  }
});

// ===========================================================================
// PUBLIC-zero + one-overload hygiene (the migration-tail belt; C-1 law).
// ===========================================================================

test("C-1 PUBLIC has ZERO execute on every clara function (the migration-tail belt sweep)", async (t) => {
  if (skipUnready(t, ready)) return;
  // proacl IS NULL means owner-only (no PUBLIC) — only aclexplode grantee=0 is a real PUBLIC grant.
  const publicOffenders = await rootQuery(
    `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.proacl is not null
        and exists (select 1 from aclexplode(p.proacl) a where a.grantee=0 and a.privilege_type='EXECUTE')`);
  assert.equal(publicOffenders.rowCount, 0, `no clara fn carries a PUBLIC EXECUTE (offenders: ${publicOffenders.rows.map((x) => x.proname).join(", ")})`);
});

test("C-1 every new public writer holds EXACTLY ONE overload (unqualified call never throws 42725)", async (t) => {
  if (skipUnready(t, ready)) return;
  const fns = [
    ...Object.keys(WA_GRANTS),
    "wake_open_question", "wake_client",
    // recreated (C-1) writers whose arity changed:
    "mint_wake_credential", "wake_context", "_resolve_counterparty",
  ];
  // AMENDMENT 0046 (§7-A, skeleton §2d): settle_autodraft_task carries a ratified SECOND
  // arity (p_workflow_run_id text), which is how the run-identity gap 0036:927-933 named
  // gets closed. The hazard this cell guards — an unqualified call throwing 42725 — cannot
  // arise here, because the new arity has NO defaulted parameters: a 5-argument call
  // resolves only to the 5-arity and a 6-argument call only to the new one. 0046's tail
  // arm (3) measures pronargdefaults to keep that true.
  // BIMODAL, and the reason is the same one the S5.25 clock roster carries: `db-slice-frontiers`
  // runs this battery against databases pinned at EARLIER frontiers, where the 6-arity does not
  // exist yet. An unconditional `2` fails every one of those legs while saying nothing about
  // overload safety. Gated on the migration ledger, the expectation stays exact in BOTH
  // directions — one overload before 0046, exactly two after, never "one or two".
  const has0046 = (await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version like '0046_%'")).rows[0].n === 1;
  const RATIFIED_OVERLOADS = has0046 ? { settle_autodraft_task: 2 } : {};
  for (const fn of fns) {
    const r = await rootQuery("select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara' and p.proname=$1", [fn]);
    if (r.rows[0].n === 0) { noteLane(`${fn} absent when counting overloads — name/arity may differ (interface expectation)`); continue; }
    const expected = RATIFIED_OVERLOADS[fn] ?? 1;
    assert.equal(r.rows[0].n, expected, `clara.${fn} has exactly ${expected} overload(s) (got ${r.rows[0].n})`);
  }
});

// ===========================================================================
// AB-3 pin (probe 27) — record_rule_resolution reads only ('ocr','structured_parse'),
// and its login-direct EXECUTE grant to clara_runtime_login is preserved.
// ===========================================================================

test("AB-3 record_rule_resolution keeps its login-direct EXECUTE grant to clara_runtime_login (companion §1)", async (t) => {
  if (skipUnready(t, ready)) return;
  const acl = (await rootQuery("select p.proacl::text as acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara' and p.proname='record_rule_resolution'")).rows[0]?.acl ?? "";
  assert.ok(/clara_runtime_login=X/.test(acl), `record_rule_resolution retains the login-direct EXECUTE grant (acl: ${acl})`);
  // The clara_runtime_login LOGIN role may EXECUTE it (via the group is fine too).
  const ok = (await rootQuery("select has_function_privilege('clara_runtime_login', 'clara.record_rule_resolution(uuid,text)', 'execute') as ok")).rows[0]?.ok;
  assert.equal(ok, true, "clara_runtime_login may EXECUTE record_rule_resolution (lane-1 role dance preserved)");
});

// The identifier CTE joins document_regions on field_path matching the identifier
// pattern (kind='tin' → field_path like '%tin%'); a NON-matching field_path (a plain
// vendor-name path) never joins the CTE, so a poison planted there passes PINNED and
// UNPINNED alike (vacuous — it proves the like-pattern, not the pin). This pair
// therefore plants the identifier on a field_path that DOES match the tin pattern,
// normalizing to a REAL seeded client_identifiers value, and pairs it with a LIVENESS
// TWIN under an ocr extraction — so a non-resolving poison can only be the engine_kind
// pin, not a dead join. (No vendor-name region is planted anywhere below.)
async function ruleResolutionsFor(firm, client) {
  return (await rootQuery("select count(*)::int n from clara.client_resolutions where firm_id=$1 and method='rule' and client_id=$2", [firm, client])).rows[0].n;
}

test("AB-3 the engine_kind pin PROVEN (not the like-pattern): an invoice_facts region carrying a REAL client identifier is INVISIBLE to record_rule_resolution, while the IDENTICAL region under an ocr extraction DOES resolve (liveness twin)", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  // A UNIQUE hard identifier for A1 (unique → a hit resolves unambiguously, not abstain).
  const tin = `C${randomUUID().slice(0, 10)}`;
  await addClientIdentifier(users.alice, { client: clients.A1, kind: "tin", value: tin });

  // LIVENESS TWIN — the SAME identifier region under an OCR extraction MUST resolve A1
  // (proves the identifier join is live AND 'invoice.vendor_tin' matches the pattern).
  const twin = await seedVerifiedDocument({ firm });
  const twinEx = await seedExtraction({ firm, document: twin.documentId, engineKind: "ocr", status: "done" });
  await seedRegion({ firm, extraction: twinEx, fieldPath: "invoice.vendor_tin", textContent: tin, engineConfidence: 0.99 });
  const beforeTwin = await ruleResolutionsFor(firm, clients.A1);
  await recordRuleResolution({ document: twin.documentId }).catch((e) => noteLane(`twin record_rule_resolution raised ${e.code}: ${e.message}`));
  assert.ok((await ruleResolutionsFor(firm, clients.A1)) > beforeTwin, "the OCR twin RESOLVES A1 — the identifier join + field_path pattern are LIVE (so a non-resolving poison isolates the engine_kind pin)");

  // POISON — the IDENTICAL identifier region under an invoice_facts extraction must
  // NOT resolve (the AB-3 pin joins only ('ocr','structured_parse')). If the pin were
  // absent this WOULD resolve, since it resolved as OCR above — so this catches a
  // missing/broken pin, unlike the old vacuous field_path.
  const poison = await seedVerifiedDocument({ firm });
  const poisonEx = await seedExtraction({ firm, document: poison.documentId, engineId: "azure-di:prebuilt-invoice:2024-11-30", engineKind: "invoice_facts", status: "done" });
  await seedRegion({ firm, extraction: poisonEx, fieldPath: "invoice.vendor_tin", textContent: tin, engineConfidence: 0.99 });
  const beforePoison = await ruleResolutionsFor(firm, clients.A1);
  await recordRuleResolution({ document: poison.documentId }).catch((e) => noteLane(`poison record_rule_resolution raised ${e.code}: ${e.message}`));
  assert.equal(await ruleResolutionsFor(firm, clients.A1), beforePoison, "the invoice_facts region does NOT resolve A1 — only the engine_kind pin excludes it (the identical region resolved as OCR above)");
});
