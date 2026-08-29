// Gate G1's BANK lane — the end-to-end cell g1-wake-bodies.test.mjs's own E2E section proves
// exists for closePrep (G1B-E2a) but never for bankAgent_v1. Before this file, NO cell in this
// PR called a bank verb through the real wrapper stack at all — and that absence is exactly what
// let four jsonb-SHAPE defects between bankAgent.v1.tools.ts and the database (0121/0129) ship
// green: a wrong p_model shape, a wrong op-key derivation, a read counted as a write, a stale
// digest binding. None of those is visible to typecheck (it cannot see inside a SQL string),
// freeze-lint (it hashes bytes), or the arity gate (it counts arguments) — only a call that
// actually REACHES the verb can find them. This file is that call.
//
// Split out of g1-wake-bodies.test.mjs (same rationale as its own fixtures-file split: keep each
// file under the repo's 500-line budget) rather than added to it, because the fixture this cell
// needs — a full COA + bank account + statement + approved journal entry — is a different SHAPE
// of setup than the lifecycle cells' bare wake-task plants, and belongs on its own.
//
// WHAT THIS PROVES, AND WHAT IT DELIBERATELY DOES NOT (same discipline as G1B-E2a's own header):
// it proves the SHAPE CONTRACT between bankAgent.v1.tools.ts and the DB — that a real call, with
// a real minted bank_agent credential on a real clara_wake_bank connection, reaches
// clara.wake_get_bank_pack and clara.wake_match_bank_line and is ADMITTED, not refused for a
// shape reason. It does NOT drive the model loop — no LLM is called; the tools' `.execute` is
// invoked directly, the same idiom G1B-E2a already established for the close lane. The DB's own
// rung-ladder ARITHMETIC (tie_nonzero, capacity_exhausted, same_amount_ambiguous, ...) is proven
// exhaustively in packages/db/tests — this file never re-derives that logic, it only proves the
// runtime's tool layer can reach it and read its verdict correctly.
//
// Gated on `skip` alone (Gate G1's wake_engine_sources presence) — the bank_matching purpose,
// 0129's task-scoped digest binding, and the fourteen-row bank_agent wake_fn_allowlist are all
// far earlier in the chain than G1 itself, so a rig where `skip` is false always has them too.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import * as rig from "./rig.mjs";
import { skip, plantHeldWakeTask } from "./g1-wake-bodies.fixtures.mjs";

// No `after()` hook in this file: importing g1-wake-bodies.fixtures.mjs already registers one
// (it calls rig.endPool() unconditionally) — a second one would just be a harmless no-op call
// to an already-ended pool, so it is omitted rather than duplicated.

const { register } = await import("tsx/esm/api");
register();

const sha256hex = (seed) => createHash("sha256").update(String(seed)).digest("hex");

// A fresh, unique COA pair per process run (the codes themselves don't need to be unique across
// runs — the CLIENT they're scoped to is always fresh, from rig.buildFirm — but distinct human
// names make a failed assertion's dump legible).
const BANK_COA = "1060";
const INCOME_COA = "4000";
const BANK_CODE = "MBB"; // clara.bank_institutions — Maybank, seeded and active on every rig.

// Every date below sits inside one fiscal window, entry/line dates <= the statement's period_end
// (D) — the period_exception_unacknowledged rung (0121:5991-6001) fails closed on a posting date
// AFTER period_end, and the tool hardcodes p_ack_period_exceptions=false, so there is no waiver
// available from this lane. Fixed literals, not the DB's clock: draft_entry carries no fiscal-
// year gate (verified by reading _draft_entry_core — no `fiscal_year` reference in its body), so
// unlike reconcile-fa.test.mjs's MYT-derived windows, a fixed past date is safe here.
const PERIOD_START = "2024-06-01";
const PERIOD_END = "2024-06-30"; // the statement's D
const LINE_DATE = "2024-06-15"; // <= D for every line and the journal entry alike

/** Mint a verified `clara.documents` row (+ optional filing) via the same superuser-only
 *  `_seed_verified_document` the db package's own rig fixtures use (packages/db/tests/
 *  rig-docs-fixtures.mjs `seedVerifiedDocument`) — called directly here since a runtime test
 *  cannot import a sibling package's test helpers. Returns the function's own receipt verbatim
 *  ({document_id, filing_id, resolution_id}); filing_id is null when client is null. */
async function seedVerifiedDoc(firm, client, sha, ownerSub) {
  const storagePath = `firms/${firm}/docs/${sha}.pdf`;
  const r = await rig.rootQuery(
    "select clara._seed_verified_document($1,$2,$3,$4,$5,$6,$7,$8) as r",
    [firm, client, sha, "g1-bank-e2e.pdf", "application/pdf", 2048, storagePath, ownerSub],
  );
  return r.rows[0].r;
}

/**
 * Build the whole "books" clara._agent_match_bank_line_core's own rung ladder (0121:5874-6001)
 * needs to ADMIT a real match — every step below is commented with WHICH rung it exists to
 * satisfy, because a slipped fixture fact here fails a rung whose name looks nothing like its
 * actual cause (measured, not guessed — see the sign-convention note at the journal lines below).
 *
 * TWO statement lines are planted, not one. Line 1 is the one the successful match ties; line 2
 * exists ONLY for the negative-control cell later in the test, and it CANNOT reuse line 1 — see
 * that cell's own comment for why (bankOpKey derives a write's op_key from the SORTED LINE SET
 * alone, never from the entries/amounts proposed against it, so two match attempts against the
 * SAME line collide on one op_key regardless of what they propose; a refused attempt's receipt
 * subject is the line id, an admitted one's is the match id, and clara._agent_bank_receipt's own
 * replay-identity check (0121:4992-5007) raises CLR10 op_key_identity_mismatch — a REAL DB
 * behaviour, not a test bug — the instant those two subjects collide under one op_key. A fresh
 * line sidesteps it entirely and keeps the negative control's own rung failure legible).
 */
async function buildBankBooks(w) {
  // §1 — the bank COA account. _assert_bank_coa_candidate (0121) demands active + asset-typed +
  // account_class IS NULL (non-control); upsert_account's default account_class is NULL.
  await rig.humanQuery(w.owner, "select clara.upsert_account(p_client=>$1,p_code=>$2,p_name=>$3,p_type=>$4,p_op_key=>$5) as r",
    [w.client, BANK_COA, "Maybank Current (g1 bank e2e)", "asset", rig.opk("g1be-bcoa")]);
  // The balancing leg for the journal entry — any active income account. income, not expense:
  // the sign convention below needs a CREDIT leg opposite the bank DEBIT.
  await rig.humanQuery(w.owner, "select clara.upsert_account(p_client=>$1,p_code=>$2,p_name=>$3,p_type=>$4,p_op_key=>$5) as r",
    [w.client, INCOME_COA, "Consulting Revenue (g1 bank e2e)", "income", rig.opk("g1be-icoa")]);

  // §2 — the bank_accounts row + is_bank_account flip, through the ONE audited writer
  // (clara.add_bank_account -> _add_bank_account_core), which also sets coa_accounts
  // .is_bank_account=true in the same transaction (0121, "sets is_bank_account in-txn").
  const acctNumber = `108${randomUUID().slice(0, 8).replace(/[a-f]/g, "1")}`;
  const bankRes = (await rig.humanQuery(w.owner,
    `select clara.add_bank_account(p_client=>$1,p_coa_account_code=>$2,p_bank_code=>$3,
       p_account_number=>$4,p_bank_name_display=>$5,p_op_key=>$6) as r`,
    [w.client, BANK_COA, BANK_CODE, acctNumber, "Maybank Current (g1 bank e2e)", rig.opk("g1be-bank")],
  )).rows[0].r;
  const bankAccountId = bankRes.bank_account_id;

  // §3 — THE GATE THAT BITES FIRST: _agent_bank_tier_a runs on EVERY bank verb, including the
  // pack read, and refuses CLR10 purpose_unconsented without a live bank_matching consent +
  // activation pair. The consent needs a REAL clara.documents row for its evidence_document_id
  // (NOT NULL, FK'd) — an UNFILED one (client null) is enough, since the FK is only
  // (evidence_document_id, firm_id), never through a filing.
  const evidenceSha = sha256hex(randomUUID());
  const evidence = await seedVerifiedDoc(w.firm, null, evidenceSha, w.owner);
  const consent = await rig.rootQuery(
    `insert into clara.client_egress_purpose_consents(firm_id, client_id, purpose, scope_note, evidence_document_id, granted_by)
       values ($1,$2,'bank_matching','g1 bank e2e rig consent — inserted raw, deliberately, mirroring
         packages/db/tests/f-a3-pr1b-wake-verbs.test.mjs''s own before() hook',$3,$4) returning id`,
    [w.firm, w.client, evidence.document_id, w.owner],
  );
  await rig.rootQuery(
    `insert into clara.client_egress_purpose_activations(firm_id, client_id, purpose, consent_id, activated_by)
       values ($1,$2,'bank_matching',$3,$4)`,
    [w.firm, w.client, consent.rows[0].id, w.owner],
  );
  // No clara.bank_agency_holds row is planted — its absence IS the "not on hold" state
  // _agent_bank_tier_a reads (coalesce(v_held,false)).

  // §4 — the statement's OWN evidence document, this one FILED to the client (client non-null),
  // which is what buys bank_statements.filing_id a real (id, firm_id, client_id, document_id)
  // row in clara.document_filings to reference. A DIFFERENT sha256 than the consent evidence
  // doc — _seed_verified_document upserts on (firm_id, sha256), so reusing one digest would
  // silently collapse both documents into one row and lose the unfiled/filed distinction.
  const stmtSha = sha256hex(randomUUID());
  const stmtDoc = await seedVerifiedDoc(w.firm, w.client, stmtSha, w.owner);

  // §5/§6 — the bank_statements row AND both lines, in ONE statement (db-tests.md's own rule:
  // "a pooled query() outside an explicit begin is its own transaction"). MEASURED, not assumed:
  // t_bank_statements_belt (0038:2450-2452) is `deferrable initially deferred` — it re-derives
  // line_count from the ACTUAL bank_statement_lines rows at transaction end and raises CLR10
  // "declares N line(s) but carries M" on a mismatch. Three separate rootQuery calls each commit
  // their own one-statement transaction, so the belt would fire right after the bank_statements
  // insert alone, see zero lines yet, and refuse — a single CTE-chained statement is what keeps
  // all three inserts (and the deferred check) inside one transaction, as the rule prescribes.
  //
  // status='live' (statement_not_corroborated), period_end=D (period_exception_unacknowledged),
  // source_doc_sha256/facts_hash derived from the SAME §4 document. TWO lines: line 1 (+10000
  // cents, money IN) is what the successful match ties; line 2 (+5000 cents) is reserved for the
  // negative-control cell — see this function's own header for why it needs its own line.
  const built = await rig.rootQuery(
    `with stmt as (
       insert into clara.bank_statements(firm_id, client_id, bank_account_id, document_id,
           source_doc_sha256, filing_id, facts_hash, period_start, period_end, statement_date,
           opening_cents, closing_cents, line_count, status, ingest_mode)
         values ($1,$2,$3,$4,$5,$6,decode($5,'hex'),$7::date,$8::date,$8::date,0,15000,2,'live','structured')
         returning id
     ), l1 as (
       insert into clara.bank_statement_lines(firm_id, client_id, statement_id, bank_account_id, line_no, entry_date, amount_cents, description)
         select $1,$2,stmt.id,$3,1,$9::date,10000,'g1 bank e2e — the line the successful match ties' from stmt
         returning id
     ), l2 as (
       insert into clara.bank_statement_lines(firm_id, client_id, statement_id, bank_account_id, line_no, entry_date, amount_cents, description)
         select $1,$2,stmt.id,$3,2,$9::date,5000,'g1 bank e2e — reserved for the negative-control cell' from stmt
         returning id
     )
     select stmt.id as statement_id, l1.id as line1_id, l2.id as line2_id from stmt, l1, l2`,
    [w.firm, w.client, bankAccountId, stmtDoc.document_id, stmtSha, stmtDoc.filing_id, PERIOD_START, PERIOD_END, LINE_DATE],
  );
  const { line1_id: line1Id, line2_id: line2Id } = built.rows[0];

  // §7 — ONE approved journal entry, through the real audited writers (draft_entry + approve_entry
  // — never a hand-written journal_entries/journal_lines row; the estate's own EXECUTE-only grant
  // shape on those tables would refuse a raw insert as anything but clara_fn_owner anyway).
  // draft_entry needs a client_resolutions row; a bare 'manual' one (subject_id null) is the
  // exact shape reconcile-fa.test.mjs's own seedResolution plants for the same purpose.
  const resolution = await rig.rootQuery(
    `insert into clara.client_resolutions(firm_id,client_id,subject_kind,subject_id,confidence,method,evidence,resolved_by)
       values($1,$2,'manual',null,1.0,'human','{}'::jsonb,null) returning id`,
    [w.firm, w.client],
  );
  // SIGN CONVENTION, stated once and load-bearing: matched_cents is the signed effect on the BANK
  // account. Line 1 is a POSITIVE line (money in), which pairs with a DEBIT on the bank COA — so
  // the successful match below proposes matched_cents=+10000, and this entry must carry that
  // debit for tie_nonzero and capacity_exhausted to both read 'pass'. Getting this backwards
  // fails tie_nonzero, NOT capacity_exhausted — a confusing rung to debug blind, so it is stated
  // here rather than discovered later.
  const lines = [
    { account_code: BANK_COA, debit_cents: 10000, credit_cents: 0, description: "g1 bank e2e inflow" },
    { account_code: INCOME_COA, debit_cents: 0, credit_cents: 10000, description: "g1 bank e2e revenue" },
  ];
  const draft = (await rig.humanQuery(w.owner,
    `select clara.draft_entry(p_client=>$1,p_resolution=>$2,p_posting_date=>$3::date,p_memo=>$4,
       p_lines=>$5::jsonb,p_op_key=>$6) as r`,
    [w.client, resolution.rows[0].id, LINE_DATE, "g1 bank e2e revenue receipt", JSON.stringify(lines), rig.opk("g1be-draft")],
  )).rows[0].r;
  // Deliberately BELOW any firm's high-stakes threshold (RM100, not RM10,000+), so the
  // single-owner rig firm can lawfully self-check its own draft — the same posture
  // reconcile-fa.test.mjs's own buyAsset documents for the identical reason.
  await rig.humanQuery(w.owner, "select clara.approve_entry(p_entry=>$1,p_expected_revision=>$2,p_op_key=>$3) as r",
    [draft.entry_id, draft.revision_token, rig.opk("g1be-appr")]);

  return { bankAccountId, line1Id, line2Id, entryId: draft.entry_id };
}

test("G1B-BANK-E2 a REAL bank_agent wake credential calling the REAL wrapper stack matches a line and is ADMITTED — the shape contract, end to end", { skip }, async () => {
  const w = await rig.buildFirm("g1bebank");
  const books = await buildBankBooks(w);

  // The wake task both tool calls below share ONE taskId, on purpose: bankOpKey embeds it at
  // field 2 of every op_key this lane mints, and clara._agent_verify_inputs_digest (0129) reads
  // that SAME field back via split_part(op_key,':',2) to bind a write's inputs_digest to the
  // CURRENT TASK's own prior pack read — a second taskId here would make every write below
  // refuse CLR10 inputs_digest_unverified for a reason that has nothing to do with the fixture.
  const { taskId } = await plantHeldWakeTask({ owner: w.owner, client: w.client, payload: {} });
  await rig.rootQuery("update clara.agent_tasks set status='running' where id=$1", [taskId]);

  // The pools the frozen bankAgent_v1 closure reaches through globalThis (bankAgent.v1.infra.ts
  // `pools()`), shaped exactly like G1B-E2a's own injection but for the BANK pool: role
  // clara_wake_bank (not clara_wake_interactive), and mintBankAgentCredential calling
  // clara.mint_wake_credential('bank_agent', firm, null, ttl, client) — the FIRM+CLIENT-scoped
  // mint bank_agent actually uses (unlike close_prep's TASK-scoped mint_wake_credential_for_task;
  // 0129's task binding for THIS lane rides the op_key text alone, not the credential itself).
  const previous = globalThis.__claraPools;
  globalThis.__claraPools = {
    withRuntime: (fn) => rig.asRuntime((c) => fn(c)),
    mintBankAgentCredential: async (firmId, clientId, ttl) =>
      rig.asRuntime(async (c) => {
        const r = await c.query(
          "select credential_id, secret from clara.mint_wake_credential($1,$2,$3,$4::interval,$5)",
          ["bank_agent", firmId, null, ttl, clientId],
        );
        return { secret: String(r.rows[0].secret) };
      }),
    // The wake secret is bound TXN-LOCALLY exactly as pools.mjs's own withBankWakeScoped does —
    // set_config(..., true) inside one transaction, COMMITted (not rolled back — get_bank_pack
    // itself writes a pack_read receipt, so even the "read" tool needs a connection that keeps
    // its work). A stub that skipped the SET ROLE clara_wake_bank would make the whole cell
    // VACUOUS — every wrapper's wake_context() would see no wake credential AT ALL, and every
    // call below would refuse CLR03 for a reason unrelated to anything this file exists to prove.
    withBankWakeScoped: (secret, fn) =>
      rig.withActor({ role: "clara_wake_bank" }, async (c) => {
        await c.query("begin");
        await c.query("select set_config('clara.wake_secret', $1, true)", [secret]);
        try {
          const out = await fn(c);
          await c.query("commit");
          return out;
        } catch (e) {
          await c.query("rollback").catch(() => {});
          throw e;
        }
      }),
  };

  try {
    const tools = await import("../workflows/bankAgent.v1.tools.ts");
    const rec = tools.newBankRunRecord();
    const ctx = { taskId, firmId: w.firm, clientId: w.client, bankAccountId: books.bankAccountId, dueReason: null };
    const built = tools.buildBankAgentTools(ctx, rig.DEFAULT_MODEL, rec);

    // --- the first pack read ------------------------------------------------------------------
    const pack1 = await built.get_bank_pack.execute({ rationale: "the nightly bank pass is reading this account's live pack" });
    assert.equal(pack1.error, undefined, `the pack read must not refuse — got ${JSON.stringify(pack1)?.slice(0, 400)}`);
    assert.match(pack1.digest, /^[0-9a-f]{64}$/, "the digest the DB actually computed and returned, never one this test computes itself");
    // THE POSITIVE CONTROL (review law 2): without this, a fixture the verb literally cannot SEE
    // (wrong client, wrong bank account, filtered out by a predicate this file got wrong) would
    // still hand back SOME digest, and the match below would then fail for a misattributed
    // reason — "the DB judged the match" and "the pack was empty" look identical from a bare
    // digest-shape check alone.
    assert.ok(pack1.lines?.some((l) => l.line_id === books.line1Id), "the pack's own unmatched lines must contain the line this test is about to match");
    assert.ok(pack1.candidates?.some((c) => c.entry_id === books.entryId), "the pack's own candidates must contain the approved entry this test is about to tie against it");

    // --- the successful match ------------------------------------------------------------------
    const match = await built.match_bank_line.execute({
      lines: [books.line1Id],
      entries: [{ entry_id: books.entryId, matched_cents: 10000 }],
      rationale: "ties the g1 bank e2e inflow line to the approved revenue entry — amounts tie exactly",
    });
    assert.equal(match?.status, "live", `the match must be ADMITTED (status='live') — got ${JSON.stringify(match)?.slice(0, 400)}. A refusal here is a SHAPE disagreement with the DB, exactly the class of defect this file exists to catch.`);
    assert.ok(match.match_id, "and it must name the match it created");
    assert.equal(rec.admitted, 1, "the ONLY end-to-end proof the bank classifier's admitted-count actually works — countIfAdmitted must have counted this reply, not the pack read");

    const receipt = await rig.rootQuery(
      "select id from clara.bank_agent_receipts where client_id=$1 and act_kind='match' and outcome='admitted'",
      [w.client],
    );
    // clara_runtime cannot read this table (SELECT is granted to clara_authenticated and
    // clara_fn_owner only, measured on the rig) — go through root, as the task brief names.
    assert.equal(receipt.rowCount, 1, "the DB's own receipt, the authoritative record a human audit reads — this is what 'admitted' actually MEANS on disk");

    // --- the negative control -------------------------------------------------------------------
    // matched_cents off by one from line 2's own amount (5000 -> proposed 5001). Line 2, never
    // line 1 again — see buildBankBooks' own header for why reusing line 1's op_key here would
    // raise a DB-level op_key_identity_mismatch instead of a clean tie_nonzero refusal.
    const negative = await built.match_bank_line.execute({
      lines: [books.line2Id],
      entries: [{ entry_id: books.entryId, matched_cents: 5001 }],
      rationale: "deliberately off-by-one — this must prove the DB's own tie check, not this test's arithmetic",
    });
    assert.equal(negative?.status, "refused", `an off-by-one match must be REFUSED — got ${JSON.stringify(negative)?.slice(0, 400)}`);
    assert.equal(negative?.rung_vector?.tie_nonzero, "fail", "the SPECIFIC rung that must fail — a refusal for the wrong reason (e.g. capacity_exhausted) would prove the wrong thing");

    // --- S8 regression: acting MOVES the pack digest, and a re-read after acting must still work ---
    // The one cell that would ever catch this. bankOpKey's own header (bankAgent.v1.infra.ts)
    // documents the exact hazard: a CONSTANT pack op-key would make this second read collide
    // with the first pack_read receipt under clara._agent_bank_receipt's replay-identity check —
    // and it would collide ONLY here, because the digest has genuinely moved (line 1 dropped out
    // of the unmatched set, entry 1 dropped out of the candidates once its capacity hit zero),
    // which is exactly the shape that turns a constant-key bug into a live CLR10
    // op_key_identity_mismatch instead of a silent no-op. The real code counts pack reads
    // (rec.packReads), so this must simply succeed — this cell exists to keep it that way.
    const pack2 = await built.get_bank_pack.execute({ rationale: "confirming the pack after acting — the digest must have moved" });
    assert.equal(pack2.error, undefined, `the SECOND pack read must not refuse — got ${JSON.stringify(pack2)?.slice(0, 400)}. A refusal here specifically is the op-key-constancy regression.`);
    assert.match(pack2.digest, /^[0-9a-f]{64}$/);
    assert.notEqual(pack2.digest, pack1.digest, "the pack genuinely changed (line 1 matched, entry 1's capacity exhausted) — a stale digest here would mean this read never actually re-ran the query");
  } finally {
    globalThis.__claraPools = previous;
  }
});
