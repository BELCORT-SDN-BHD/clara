// Wave-A 0012 fast-follows (owner-ratified 2026-07-21):
//   (A) client_egress_consents.evidence_document_id is OPTIONAL — grant_client_egress
//       accepts a null document (the owner-declaration path); scope_note stays required;
//       OWNER floor unchanged. A cited (non-null) document is still asserted real.
//   (B) _open_question_blocks excludes origin='rule_proposal' — a rule PROPOSAL is
//       advisory (WA-R9) and never gates an approval; every other origin still blocks.
// Requires 0012 applied — SKIPS (counted) when the marker is absent.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, opk, endPool, printLaneNotes, printSkipCount, skipUnready,
  waveAEnsureReady, buildWorld, firmOf, grantClientEgress, revokeClientEgress,
} from "./wave-a-fixtures.mjs";

let ready = false;      // wave-A 0011 surface present
let has0012 = false;    // 0012 relaxation present
let world = null;

before(async () => {
  ready = await waveAEnsureReady();
  if (ready) {
    world = await buildWorld();
    const n = await rootQuery(
      "select is_nullable from information_schema.columns where table_schema='clara' " +
      "and table_name='client_egress_consents' and column_name='evidence_document_id'");
    has0012 = n.rows[0]?.is_nullable === "YES";
  }
});
after(async () => { printLaneNotes("wave-a-0012"); printSkipCount("wave-a-0012"); await endPool(); });

function skip0012(t) {
  if (skipUnready(t, ready)) return true;
  if (!has0012) { t.skip("0012 not applied (evidence_document_id still NOT NULL)"); return true; }
  return false;
}

test("0012(A): grant_client_egress with a NULL evidence document succeeds (owner declaration); one live row, null evidence", async (t) => {
  if (skip0012(t)) return;
  const { users, clients } = world;
  await revokeClientEgress(users.alice, { client: clients.A1 }).catch(() => {}); // normalize
  const r = await grantClientEgress(users.alice, {
    client: clients.A1, evidenceDocument: null, scopeNote: "owner declaration — all clients consented (0012)",
  });
  assert.equal(r.status, "live", "a document-less grant goes live");
  const row = await rootQuery(
    "select evidence_document_id, scope_note from clara.client_egress_consents where client_id=$1 and revoked_at is null",
    [clients.A1]);
  assert.equal(row.rowCount, 1, "exactly one live consent row");
  assert.equal(row.rows[0].evidence_document_id, null, "the live row carries a NULL evidence document (owner-declaration path)");
  assert.ok((row.rows[0].scope_note ?? "").trim().length > 0, "scope_note is on record (the declaration)");
});

test("0012(A): scope_note is still REQUIRED (a blank declaration refuses CLR10)", async (t) => {
  if (skip0012(t)) return;
  const { users, clients } = world;
  await revokeClientEgress(users.alice, { client: clients.A2 }).catch(() => {});
  await assert.rejects(
    () => grantClientEgress(users.alice, { client: clients.A2, evidenceDocument: null, scopeNote: "   " }),
    (e) => e.code === "CLR10",
    "a blank scope_note refuses CLR10 even without a document");
});

test("0012(B): a rule_proposal open_question does NOT block; a manual one on the same client DOES", async (t) => {
  if (skip0012(t)) return;
  const { clients } = world;
  const firm = await firmOf(clients.A1);
  // Two client-scope questions inserted directly (append-only permits INSERT): one
  // rule_proposal (advisory), one manual (a genuine must-resolve). _open_question_blocks
  // is client-scope-inclusive regardless of filing, so a synthetic filing arg is fine.
  const mk = (origin) => rootQuery(
    "insert into clara.open_questions(firm_id,client_id,scope_kind,scope_id,origin,question_text,opener_kind,opened_by) " +
    "values($1,$2,'client',$2,$3,$4,'human',(select id from clara.users where is_agent=false limit 1)) returning id",
    [firm, clients.A1, origin, `0012 test ${origin} ${opk("q")}`]);
  const rp = (await mk("rule_proposal")).rows[0].id;
  const mn = (await mk("manual")).rows[0].id;
  const blocks = await rootQuery(
    "select question_id, scope_kind from clara._open_question_blocks($1, gen_random_uuid(), null)", [clients.A1]);
  const ids = blocks.rows.map((x) => x.question_id);
  assert.ok(!ids.includes(rp), "the rule_proposal question is EXCLUDED from the block (0012(B))");
  assert.ok(ids.includes(mn), "the manual question STILL blocks");
  // No cleanup: dismissing needs resolution fields (ck_open_questions_terminal) and the
  // update trigger, and this is the last test in the file — the DB is disposable.
});
