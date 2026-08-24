// F-A3 PR-1b -- TWO CLOSED-LIST WALLS, PROVEN AS INSTRUMENTS. Not claims -- conductor's rulings,
// this lane's session, both asking for the same thing: a reviewer-runnable proof, not a comment.
//
// f31tc.a -- the Tier-C CLOSED-LIST AUDIT ("consider committing that derivation as a comment or
// fixture next to the converter so the reviewer inherits the instrument, not just the claim").
// Re-derives, LIVE off the catalog, the exhaustive set of every (errcode, reason) pair the
// thirteen Tier-C-eligible delegates can actually raise, and reports which ones
// `_agent_bank_tier_c_reason` converts vs re-raises. NOT a pass/fail assertion on the SIZE of
// either set: B.4's closed list is a deliberate WALL -- most of the ~139 live pairs are EXPECTED
// to re-raise. The one real assertion is the wall's own shape: every pair the converter DOES
// accept must be reachable in the live catalog, and the M11 addition
// (`stale_waiver_duplicate_risk`) must be among them.
//
// f31tc.b -- the DRAWER-2 ARM-4 DECLARATION WALL, both polarities ("RULING: ... add to YOUR
// battery the differential pair proving the flip is a wall: an UNDECLARED zero-registry client
// FAILS the gate (no_registered_account), the same client WITH the declaration PASSES"). Proves
// `_close_gate_bank_items`'s arm 4 (TA-P14, ratified 2026-08-22) is a genuine wall, not a
// one-directional accident: undeclared refuses, declared through the GOVERNED door
// (record_client_fact) admits -- for a client with NO bank-class COA movement at all, the exact
// shape `x56-fixtures.mjs`'s `setupCloseCoa` now declares for every close-lifecycle fixture.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rootQuery, humanQuery, endPool, printLaneNotes, printSkipCount, noteLane, markSkip, a21EnsureReady } from "./a21-helpers.mjs";
import { hasBankMatching } from "./x38-match-fixtures.mjs";

let ready = false;

before(async () => {
  const r = await a21EnsureReady();
  ready = Boolean(r.base && r.has16 && (await hasBankMatching()));
  if (!ready) { noteLane("bank matching surface absent -- tier-c audit dormant"); return; }
  const fn = await rootQuery(
    `select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='clara' and p.proname='_agent_bank_tier_c_reason' limit 1`);
  ready = fn.rowCount === 1;
});
after(async () => { printLaneNotes("f-a3-pr1b-tier-c-audit"); printSkipCount("f-a3-pr1b-tier-c-audit"); await endPool(); });

const DELEGATES = [
  "_match_bank_line_core(jsonb,uuid,jsonb,jsonb,jsonb,boolean,text)",
  "_settle_from_bank_line_core(jsonb,uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,text,uuid)",
  "_complete_bank_reconciliation_core(jsonb,uuid,uuid[],text)",
  "_void_bank_reconciliation_core(jsonb,uuid,text,text)",
  "_unmatch_bank_match_core(jsonb,uuid,uuid,text,text)",
  "_void_bank_statement_core(jsonb,uuid,uuid,text,text)",
  "_resolve_bank_line_exception_core(jsonb,uuid,text,text,uuid,text)",
  "_resolve_and_book_bank_line_core(jsonb,uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,bigint,text,text,text,boolean)",
  "_add_bank_account_core(jsonb,uuid,text,text,text,text,uuid,text)",
  "_upsert_account_core(jsonb,uuid,text,text,text,text,text,text)",
  "_bank_match_adjustment_entry(jsonb,uuid,text,text,bigint,date,text,jsonb,text,text)",
  "_allocate_receipt_core(jsonb,uuid,uuid,date,text,text,bigint,jsonb,text,bigint,text,text,text)",
  "_allocate_payment_core(jsonb,uuid,uuid,date,text,text,bigint,jsonb,text,bigint,text,text,text)",
];

test("f31tc.a the closed-list audit: live (errcode,reason) pairs vs what the converter accepts", async (t) => {
  if (!ready) { markSkip(); t.skip("tier-c audit dormant"); return; }
  const rows = await rootQuery(
    `with fns as (select unnest($1::text[]) as sig),
       src as (select f.sig, p.prosrc from fns f join pg_proc p on p.oid = ('clara.' || f.sig)::regprocedure),
       chunks as (select sig, unnest(regexp_split_to_array(prosrc, 'raise exception')) as chunk from src),
       picked as (
         select sig,
           (regexp_match(chunk, $$errcode\\s*=\\s*'(CLR\\d+)'$$))[1] as errcode,
           coalesce((regexp_match(chunk, $$'reason'\\s*,\\s*'([a-z_]+)'$$))[1],
                     (regexp_match(chunk, $$"reason"\\s*:\\s*"([a-z_]+)"$$))[1]) as reason
         from chunks)
     select distinct errcode, reason from picked where errcode is not null and reason is not null
     order by 1,2`,
    [DELEGATES]);
  assert.ok(rows.rowCount > 0, "the live extraction finds at least one typed pair (the instrument itself works)");
  let converts = 0; let reraises = 0; let m11Found = false;
  for (const { errcode, reason } of rows.rows) {
    const r = await rootQuery("select clara._agent_bank_tier_c_reason($1,$2,$3) as r",
      ["x", errcode, JSON.stringify({ reason })]);
    if (r.rows[0].r === reason) { converts++; if (reason === "stale_waiver_duplicate_risk") m11Found = true; }
    else reraises++;
  }
  assert.ok(m11Found, "the M11 addition (stale_waiver_duplicate_risk) is live AND converts");
  // M2 (opus consolidated round): this audit's own header said it is "NOT a pass/fail assertion
  // on the SIZE of either set" -- true, but it asserted NOTHING about the re-raise side at all,
  // which made it descriptive only (a noteLane, never a wall). At least one of the live pairs
  // this file's own extraction finds must actually re-raise, or the closed-list property this
  // audit exists to prove has never been checked by the audit itself.
  assert.ok(reraises > 0,
    `f31tc.a: the live extraction must find at least one re-raising (errcode,reason) pair, proving the closed list is a real wall, not just narrower prose (converts=${converts}, reraises=${reraises})`);
  noteLane(`f31tc.a: ${rows.rowCount} distinct live (errcode,reason) pairs across ${DELEGATES.length} delegates -- ${converts} convert (B.4's closed list + the two PR-1b additions), ${reraises} re-raise (everything else, by design -- the wall)`);
});

test("f31tc.b the drawer-2 arm-4 declaration wall, both polarities: undeclared refuses, declared (through the governed door) admits", async (t) => {
  if (!ready) { markSkip(); t.skip("tier-c audit dormant"); return; }
  const firm = (await rootQuery("select id from clara.firms limit 1")).rows[0].id;
  const owner = (await rootQuery(
    `select user_id from clara.firm_memberships where firm_id=$1 and status='active'
       and clara.role_rank(role) >= clara.role_rank('owner') limit 1`, [firm])).rows[0]?.user_id;
  // The name is uniqued per invocation, not a fixed literal: clients carries
  // uq_clients_firm_name (firm_id, name), and this cell has genuinely been run twice against
  // the same undropped database in this lane's own session (once standalone, once inside the
  // full estate sweep) -- a fixed literal collides on the second run with a real 23505, not a
  // bank-domain finding.
  const clientId = randomUUID();
  const client = (await rootQuery(
    `insert into clara.clients(id, firm_id, name, status) values ($1, $2, $3, 'active') returning id`,
    [clientId, firm, `F31TC Bank-less Client ${clientId}`])).rows[0].id;
  const fy = (await rootQuery(
    `insert into clara.fiscal_years(id, firm_id, client_id, label, starts_on, ends_on, ordinal, status, fy_end_source, opened_by)
       values (gen_random_uuid(), $1, $2, 'FY2026', '2026-01-01','2026-12-31', 1, 'open', 'default_1231', $3) returning id`,
    [firm, client, owner])).rows[0].id;
  // POLARITY 1 -- undeclared. A client with ZERO bank-class COA movement at all (unlike
  // f31b.q's flagged-but-unregistered scenario) still refuses -- the zero-registry case reads
  // not_evaluable, and arm 4 treats that as fail (law 68: absence is not evidence of "no
  // accounts", only of "unknown").
  const before = await rootQuery("select clara._close_gate_bank_items($1,$2) as r", [client, fy]);
  assert.equal(before.rows[0].r.state, "fail", "undeclared, zero bank-class movement: the gate still refuses");
  assert.equal(before.rows[0].r.no_registered_account, true, "named no_registered_account (registry_state not_evaluable)");
  // POLARITY 2 -- declared, through the GOVERNED door (clara.record_client_fact), never a
  // direct table write -- the same call x56-fixtures.mjs's setupCloseCoa now makes for every
  // close-lifecycle fixture.
  await humanQuery(owner,
    `select clara.record_client_fact(p_client => $1, p_fact_key => 'banking_arrangement',
       p_fact_value => '"no_accounts"'::jsonb, p_basis => $2, p_basis_kind => 'owner_instruction',
       p_source_document_id => null, p_op_key => $3)`,
    [client, "f31tc.b rig: a genuinely bank-less client, declared", `f31tc-b-${client}`]);
  const after = await rootQuery("select clara._close_gate_bank_items($1,$2) as r", [client, fy]);
  assert.equal(after.rows[0].r.state, "pass", "declared no_accounts: the SAME client now passes");
  assert.equal(after.rows[0].r.no_registered_account, false, "no_registered_account clears once declared");
});
