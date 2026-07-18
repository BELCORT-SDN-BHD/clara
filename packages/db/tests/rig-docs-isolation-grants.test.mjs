// Slice-5 rig — DOCUMENT PIPELINE part 10: ISOLATION + GRANT MATRIX (companion
// §3.10). Contract-blind, catalog-derived. Laws: cross-firm isolation on EVERY new
// table (read side RLS-scoped; write side is the no-existence-oracle CLR11); the
// §3.10 EXECUTE matrix (positive AND negative) with ZERO PUBLIC; approve/correction
// writers human-only; record_rule_resolution runtime-login-only; _seed_verified_
// document executable by NO app role; FORCE RLS on every new table; no orphan
// overloads; every contract-named fn present with its named params.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  CLR,
  PG,
  ROLES,
  assertRaises,
  humanQuery,
  roleQuery,
  rootQuery,
  ensureReady,
  docsReady,
  buildWorld,
  endPool,
  printLaneNotes,
  noteLane,
  freshResolution,
  seedVerifiedDocument,
  fileDocument,
  seedExtraction,
  seedRegion,
  seedAttempt,
  seedCandidate,
  addClientIdentifier,
  EXPECTED_NEW_TABLES,
  NO_HUMAN_BASE_GRANT,
} from "./rig-docs-fixtures.mjs";
import {
  S5_NEW_FNS,
  s5GrantAudit,
  s5RlsAudit,
  runtimeLoginExecuteAudit,
  overloadFailures,
  fnArgNames,
} from "./rig-docs-meta.mjs";

let ready = false;
let world = null;

before(async () => {
  await ensureReady();
  ready = await docsReady();
  if (ready) world = await buildWorld();
});
after(async () => {
  printLaneNotes("isolation-grants");
  await endPool();
});

function unready(t) {
  if (!ready) { t.skip("Slice-5 document pipeline not present — 0007 not yet applied"); return true; }
  return false;
}

async function firmOf(client) {
  return (await rootQuery("select firm_id from clara.clients where id = $1", [client])).rows[0].firm_id;
}

/** Seed one row in each human-readable new table for a firm; return the ids. */
async function seedFirmRows(owner, client) {
  const firm = await firmOf(client);
  const { documentId } = await seedVerifiedDocument({ firm });
  const filing = await fileDocument(owner, { document: documentId, client, resolution: await freshResolution(owner, client) });
  const extraction = await seedExtraction({ firm, document: documentId, versionN: 1 });
  const region = await seedRegion({ firm, extraction });
  const attempt = await seedAttempt({ firm, document: documentId, matcherVersion: 1 });
  const candidate = await seedCandidate({ firm, attempt, client, disposition: "open" });
  await addClientIdentifier(owner, { client, kind: "tin", value: `T${Date.now().toString(36)}` });
  const filingRow = (await rootQuery("select id from clara.document_filings where document_id=$1 limit 1", [documentId])).rows[0]?.id;
  return {
    firm, documentId,
    document_filings: filing ?? filingRow,
    document_extractions: extraction,
    document_regions: region,
    attribution_attempts: attempt,
    attribution_candidates: candidate,
  };
}

// ===========================================================================
// §3.10 — cross-firm READ isolation on the human-readable new tables (RLS-scoped).
// ===========================================================================

test("§3.10 cross-firm read isolation: a firm's human sees its OWN new-table rows and NONE of the sibling firm's", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const A = await seedFirmRows(users.alice, clients.A1);
  const B = await seedFirmRows(users.dave, clients.B1);

  const readable = ["document_filings", "document_extractions", "document_regions", "attribution_attempts", "attribution_candidates"];
  for (const tbl of readable) {
    if (!A[tbl] || !B[tbl]) { noteLane(`cross-firm read: no seeded row for ${tbl} — skipped that table`); continue; }
    const own = await humanQuery(users.alice, `select count(*)::int as n from clara.${tbl} where id=$1`, [A[tbl]]);
    assert.equal(own.rows[0].n, 1, `alice sees firm A's ${tbl} row`);
    const foreign = await humanQuery(users.alice, `select count(*)::int as n from clara.${tbl} where id=$1`, [B[tbl]]);
    assert.equal(foreign.rows[0].n, 0, `alice must NOT see firm B's ${tbl} row (RLS-scoped)`);
  }
});

test("§3.10 the NO-base-grant tables reject a human SELECT entirely (masked; a view is the only surface)", async (t) => {
  if (unready(t)) return;
  for (const tbl of NO_HUMAN_BASE_GRANT) {
    await assertRaises(PG.insufficientPrivilege, () => roleQuery(ROLES.authenticated, `select count(*) from clara.${tbl}`), `human SELECT on ${tbl} base table`);
  }
});

test("§3.10 cross-firm WRITE is the no-existence-oracle CLR11: a foreign document/filing is indistinguishable from a nonexistent one", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const B = await seedFirmRows(users.dave, clients.B1);
  // alice (firm A) filing/legal-hold against firm B's document → CLR11 (not a leak, not a distinct error).
  await assertRaises(CLR.notFound, () => fileDocument(users.alice, { document: B.documentId, client: clients.A1, resolution: freshResolution(users.alice, clients.A1) }), "alice files firm B's document");
});

// ===========================================================================
// §3.10 — the EXECUTE matrix, overloads, FORCE RLS, login surface, signatures.
// ===========================================================================

test("§3.10 EXECUTE matrix (catalog-derived): the contract-known grants hold; ZERO PUBLIC; contract-silent grants are observations", async (t) => {
  if (unready(t)) return;
  const { hard, observations } = await s5GrantAudit();
  for (const o of observations) noteLane(`grant observation (contract-silent fn): ${o}`);
  assert.deepEqual(hard, [], `the §3.10 EXECUTE matrix holds:\n${hard.join("\n")}`);
});

test("§3.10 runtime-login surface: record_rule_resolution is runtime-login-only; human-only writers hold no agent/runtime/login grant; _seed_verified_document reachable by NO app role", async (t) => {
  if (unready(t)) return;
  const { problems, observations } = await runtimeLoginExecuteAudit();
  for (const o of observations) noteLane(`login-surface observation: ${o}`);
  assert.deepEqual(problems, [], `the runtime-login / human-only / seed-helper audit holds:\n${problems.join("\n")}`);
});

test("§3 FORCE-RLS sweep: every new table exists RLS-forced; any unlisted new table is flagged", async (t) => {
  if (unready(t)) return;
  const { problems, observations } = await s5RlsAudit();
  for (const o of observations) noteLane(`RLS observation: ${o}`);
  assert.deepEqual(problems, [], `the FORCE-RLS sweep holds:\n${problems.join("\n")}`);
});

test("§3 no orphan overloads; every contract-named fn exists with its named params", async (t) => {
  if (unready(t)) return;
  const dupes = await overloadFailures();
  assert.deepEqual(dupes, [], `no clara proname carries two overloads: ${dupes.join("; ")}`);
  for (const [name, spec] of Object.entries(S5_NEW_FNS)) {
    const overloads = await fnArgNames(name);
    assert.ok(overloads, `clara.${name} exists (contract names it)`);
    assert.equal(overloads.length, 1, `exactly one overload of clara.${name}`);
    if (spec.params) {
      for (const p of spec.params) assert.ok(overloads[0].includes(p), `clara.${name} carries the contract-named param ${p} (has: ${overloads[0].join(", ")})`);
    } else {
      noteLane(`clara.${name} as-built params: (${overloads[0].join(", ")}) — the contract does not state them (interface expectation)`);
    }
  }
});

test("§3 every EXPECTED_NEW_TABLE is present (the isolation/RLS sweeps depend on the exact set)", async (t) => {
  if (unready(t)) return;
  const present = new Set((await rootQuery("select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='clara' and relkind='r'")).rows.map((x) => x.relname));
  const missing = EXPECTED_NEW_TABLES.filter((tbl) => !present.has(tbl));
  assert.deepEqual(missing, [], `no expected new table is missing (got missing: ${missing.join(", ")})`);
});
