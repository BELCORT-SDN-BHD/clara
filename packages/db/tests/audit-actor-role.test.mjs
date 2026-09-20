// #912 — THE ROLE THE ACTOR HELD AT THE INSTANT OF A GOVERNED ACT.
// Migration: 0243_audit_actor_role.sql. Every cell gates on the LIVE CATALOG, never on the
// migration number (knowledge-fixtures.mjs `auditActorRoleCohortApplied`), the 0240/0241/0242
// idiom this lane has already used three times.
//
// THE SHAPE THE OWNER RULED (issue #912, ruling comment 2026-09-18): the AUDIT-ROW shape, not a
// membership-history relation. `clara._audit` -- the ONE writer of `clara.audit_log` -- resolves
// the actor's role at write time; `clara.audit_log` carries it; `clara.list_firm_knowledge`'s
// promotion block cites it beside the promoter's CURRENT role; a row written before the column
// existed reads as unknown, and NOTHING is back-dated.
//
// THE SEAMS. Every cell addresses a PUBLIC interface:
//   · a governed door (`clara.capture_knowledge`) -> the committed `clara.audit_log` row it
//     leaves behind, read back with `rootQuery` (the rig's "READ BACK a table" idiom, never as
//     the caller of the act);
//   · `clara.list_firm_knowledge()` -- the firm register read -- through `humanQuery` at the
//     least privilege that should succeed;
//   · the catalog itself, for the census #912's ruling asks for ("every governed door inherits
//     the column with NO per-door change").
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { endPool, humanQuery, opk, rootQuery } from "./rig-fixtures.mjs";
import { auditActorRoleCohortApplied, knowledgeWorld } from "./knowledge-fixtures.mjs";

const EXPECTED_CELLS = 1;
let live = false;
let executed = 0;

before(async () => { live = await auditActorRoleCohortApplied(); });
after(async () => {
  if (live) assert.equal(executed, EXPECTED_CELLS, `expected ${EXPECTED_CELLS} cells to run, ${executed} did`);
  await endPool();
});

function gate(t) {
  if (live) return false;
  if (process.env.CLARA_ALLOW_MISSING_AUDIT_ACTOR_ROLE_0243 === "1") {
    console.warn("SKIP audit-actor-role: the 0243 cohort is not applied (explicit pre-integration run).");
    t.skip("audit actor-role cohort absent -- explicit pre-integration run");
    return true;
  }
  assert.fail("the 0243 audit actor-role cohort is required for a focused run: apply 0243_audit_actor_role.sql");
}

function cell(name, fn) {
  test(name, async (t) => {
    if (gate(t)) return;
    executed += 1;
    await fn(t);
  });
}

// --------------------------------------------------------------------------------------------
// Door wrapper. Named args, the same shape knowledge-firm-defaults.test.mjs uses so the two
// batteries cannot drift into two dialects.
// --------------------------------------------------------------------------------------------
const CAPTURE = `select clara.capture_knowledge(
  p_knowledge_key => $1, p_value => $2::jsonb, p_basis => $3, p_op_key => $4,
  p_scope_kind => $5, p_client => $6, p_source_kind => $7) as r`;

function capture(sub, o) {
  return humanQuery(sub, CAPTURE, [
    o.key, JSON.stringify(o.value), o.basis ?? "rig basis", o.opKey ?? opk("p912"),
    o.scope ?? "client", o.client ?? null, o.sourceKind ?? "user_statement",
  ]).then((r) => r.rows[0].r);
}

/** The committed audit row a door left behind, READ BACK (never the caller of the act). */
function auditRowOf(firm, fn, actor) {
  return rootQuery(
    `select actor, actor_role, args ->> 'revision_id' as revision_id
       from clara.audit_log where firm_id = $1 and fn = $2 and actor = $3
      order by id desc limit 1`, [firm, fn, actor]).then((r) => r.rows[0]);
}

// =============================================================================================
// SEAM 1 — THE GOVERNED ACT'S OWN AUDIT ROW.
// =============================================================================================

cell("ar.01 a governed act records the role its actor held at write time -- the ACTOR's role, not a constant", async () => {
  const w = await knowledgeWorld("p912a1");

  // Two people at two DIFFERENT ranks walk through the SAME door. Expected values come from the
  // roster knowledgeWorld minted (an independent source of truth), never from re-reading what
  // clara._audit computed.
  await capture(w.bookkeeper, { key: "default_currency", client: w.clientA, value: "USD",
    basis: "the client invoices in dollars" });
  await capture(w.admin, { key: "default_currency", client: w.clientB, value: "SGD",
    basis: "the client invoices in Singapore dollars" });

  const byBookkeeper = await auditRowOf(w.firm, "capture_knowledge", w.bookkeeper);
  const byAdmin = await auditRowOf(w.firm, "capture_knowledge", w.admin);
  assert.equal(byBookkeeper.actor_role, "bookkeeper",
    "the act a bookkeeper committed must carry the bookkeeper rank it was committed under");
  assert.equal(byAdmin.actor_role, "admin",
    "the SAME door, walked by an admin, must carry admin -- the column is the actor's role, not the door's floor");
});
