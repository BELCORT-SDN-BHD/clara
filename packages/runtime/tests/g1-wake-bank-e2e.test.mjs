// Gate G1's BANK lane — the end-to-end cell g1-wake-bodies.test.mjs's own E2E section proves
// exists for closePrep (G1B-E2a) but never for bankAgent_v1. Before this file, NO cell in this
// PR called a bank verb through the real wrapper stack at all — and that absence is exactly what
// let four jsonb-SHAPE defects between bankAgent.v1.tools.ts and the database (0121/0129) ship
// green: a wrong p_model shape, a wrong op-key derivation, a read counted as a write, a stale
// digest binding. None of those is visible to typecheck (it cannot see inside a SQL string),
// freeze-lint (it hashes bytes), or the arity gate (it counts arguments) — only a call that
// actually REACHES the verb can find them. This file is that call.
//
// Its fixtures live in g1-wake-bank-fixtures.mjs (split when 裁-44 added four more end-to-end
// cells needing the same books); the 裁-44 fold cells themselves are g1-wake-bank-fold.test.mjs.
//
// WHAT THIS PROVES, AND WHAT IT DELIBERATELY DOES NOT (same discipline as G1B-E2a's own header):
// it proves the SHAPE CONTRACT between bankAgent.v1.tools.ts and the DB — that a real call, with
// a real minted bank_agent credential on a real clara_wake_bank connection, reaches
// clara.wake_get_bank_pack and clara.wake_match_bank_line and is ADMITTED, not refused for a
// shape reason. It does NOT drive the model loop — no LLM is called; the tools' `.execute` is
// invoked directly, the same idiom G1B-E2a already established for the close lane. The DB's own
// rung-ladder ARITHMETIC is proven exhaustively in packages/db/tests; this file never re-derives
// that logic, it only proves the runtime's tool layer can reach it and read its verdict correctly.
//
// Gated on `skip` alone (Gate G1's wake_engine_sources presence) — the bank_matching purpose,
// 0129's task-scoped digest binding, and the fourteen-row bank_agent wake_fn_allowlist are all
// far earlier in the chain than G1 itself, so a rig where `skip` is false always has them too.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as rig from "./rig.mjs";
import { skip, plantHeldWakeTask } from "./g1-wake-bodies.fixtures.mjs";
import { BANK_COA, buildApprovedEntries, buildBankAccount, buildBankPrereqs, injectBankPools } from "./g1-wake-bank-fixtures.mjs";

// No `after()` hook in this file: importing g1-wake-bodies.fixtures.mjs already registers one
// (it calls rig.endPool() unconditionally) — a second one would just be a harmless no-op call
// to an already-ended pool, so it is omitted rather than duplicated.

const { register } = await import("tsx/esm/api");
register();

test("G1B-BANK-E2 a REAL bank_agent wake credential calling the REAL wrapper stack matches a line and is ADMITTED — the shape contract, end to end", { skip }, async () => {
  const w = await rig.buildFirm("g1bebank");
  await buildBankPrereqs(w);
  // TWO LINES AND TWO ENTRIES. Line 1 (10,000, money in) is the one the successful match ties
  // against entry 1 (10,000 of debit capacity). Line 2 (5,000) and entry 2 (3,000) are the
  // NEGATIVE CONTROL's own pair, and both are fresh — see that cell's own comment for why reusing
  // line 1 or entry 1 would fail for a different reason than the one it names.
  // 裁-44 R3 / FOLD-15 — the promotion cell below needs a REAL account-shaped identifier printed
  // on the statement. The default descriptions ("g1 bank line 1") are prose, and prose is now
  // correctly refused for kind `bank_account`: it clears no digit floor. That refusal is the fix
  // working, so the fixture prints an account number instead of the cell weakening the rule.
  const acct = await buildBankAccount(w, [10000, 5000], "a", BANK_COA, [
    "TRANSFER FROM 8899-041722 ACME SDN BHD",
    "STANDING ORDER 8899-041722 MONTHLY",
  ]);
  const entries = await buildApprovedEntries(w, [10000, 3000]);
  const [line1Id, line2Id] = acct.lineIds;
  const [entry1, entry2] = entries;

  // The wake task both tool calls below share ONE taskId, on purpose: bankOpKey embeds it at
  // field 2 of every op_key this lane mints, and clara._agent_verify_inputs_digest (0129) reads
  // that SAME field back via split_part(op_key,':',2) to bind a write's inputs_digest to the
  // CURRENT TASK's own prior pack read — a second taskId here would make every write below
  // refuse CLR10 inputs_digest_unverified for a reason that has nothing to do with the fixture.
  const { taskId } = await plantHeldWakeTask({ owner: w.owner, client: w.client, payload: {} });
  await rig.rootQuery("update clara.agent_tasks set status='running' where id=$1", [taskId]);

  const previous = injectBankPools();
  try {
    const tools = await import("../workflows/bankAgent.v1.tools.ts");
    const rec = tools.newBankRunRecord("e2-attempt-1");
    const ctx = { taskId, firmId: w.firm, clientId: w.client, bankAccountId: acct.bankAccountId, dueReason: null };
    const built = tools.buildBankAgentTools(ctx, rig.DEFAULT_MODEL, rec);

    // --- the first pack read ------------------------------------------------------------------
    const pack1 = await built.get_bank_pack.execute({ rationale: "the nightly bank pass is reading this account's live pack" });
    tools.beginModelStep(rec); // FOLD-20(c): the model has now SEEN this pack
    assert.equal(pack1.error, undefined, `the pack read must not refuse — got ${JSON.stringify(pack1)?.slice(0, 400)}`);
    assert.match(pack1.digest, /^[0-9a-f]{64}$/, "the digest the DB actually computed and returned, never one this test computes itself");
    // THE POSITIVE CONTROL (review law 2): without this, a fixture the verb literally cannot SEE
    // (wrong client, wrong bank account, filtered out by a predicate this file got wrong) would
    // still hand back SOME digest, and the match below would then fail for a misattributed
    // reason — "the DB judged the match" and "the pack was empty" look identical from a bare
    // digest-shape check alone.
    assert.ok(pack1.lines?.some((l) => l.line_id === line1Id), "the pack's own unmatched lines must contain the line this test is about to match");
    assert.ok(pack1.candidates?.some((c) => c.entry_id === entry1), "the pack's own candidates must contain the approved entry this test is about to tie against it");
    // 裁-44 / FOLD-1 — and the CAPACITIES the tool derives its amounts from are the DB's own
    // arithmetic, present on the reply. Without this the derivation could be reading undefined and
    // this cell would still be green on a coincidence.
    const cand1 = pack1.candidates.find((c) => c.entry_id === entry1);
    assert.equal(Number(cand1.debit_remaining_cents), 10000, "the pack reports entry 1's full debit capacity — this is the number the tool sends");

    // --- the successful match ------------------------------------------------------------------
    // NO AMOUNT IS PASSED. The tool derives matched_cents from the pack (裁-44 / FOLD-1); the
    // model's only input is which line and which entry.
    const match = await built.match_bank_line.execute({
      lines: [line1Id],
      entries: [entry1],
      rationale: "ties the g1 bank e2e inflow line to the approved revenue entry — amounts tie exactly",
    });
    assert.equal(match?.status, "live", `the match must be ADMITTED (status='live') — got ${JSON.stringify(match)?.slice(0, 400)}. A refusal here is a SHAPE disagreement with the DB, exactly the class of defect this file exists to catch.`);
    assert.ok(match.match_id, "and it must name the match it created");
    assert.equal(rec.admitted, 1, "the ONLY end-to-end proof the bank classifier's admitted-count actually works — countIfAdmitted must have counted this reply, not the pack read");

    // THE DERIVED AMOUNT IS WHAT LANDED. Read back off the durable row rather than inferred from
    // "the match was admitted" — a derivation that quietly sent the wrong number would still be
    // admitted whenever the wrong number happened to tie.
    const member = await rig.rootQuery(
      `select em.matched_cents from clara.bank_match_entry_members em
        where em.match_id = $1 and em.entry_id = $2`,
      [match.match_id, entry1],
    );
    assert.equal(member.rowCount, 1, "one member row for the one entry named");
    assert.equal(Number(member.rows[0].matched_cents), 10000, "and it carries the PACK's number — hard constraint 2, measured on disk");

    const receipt = await rig.rootQuery(
      "select id from clara.bank_agent_receipts where client_id=$1 and act_kind='match' and outcome='admitted'",
      [w.client],
    );
    // clara_runtime cannot read this table (SELECT is granted to clara_authenticated and
    // clara_fn_owner only, measured on the rig) — go through root, as the task brief names.
    assert.equal(receipt.rowCount, 1, "the DB's own receipt, the authoritative record a human audit reads — this is what 'admitted' actually MEANS on disk");

    // --- the negative control, ISOLATED to ONE rung ---------------------------------------------
    // 裁-44 fixed this cell's own wrong-reason defect. It used to reuse the entry the successful
    // match had just exhausted, so its off-by-one attempt failed BOTH tie_nonzero AND
    // capacity_exhausted while asserting only the former — a refusal for the wrong reason would
    // have passed. Under FOLD-1 an off-by-one is no longer expressible at all, so the isolation is
    // built differently and better: line 2 is 5,000 and entry 2 has 3,000 of FRESH capacity, so
    // the DERIVED amount is 3,000 — which cannot tie 5,000 (tie_nonzero FAILS) while sitting
    // exactly at that entry's own cap (capacity_exhausted PASSES). Both are asserted, so the cell
    // proves WHICH rung spoke rather than merely that something refused.
    const negative = await built.match_bank_line.execute({
      lines: [line2Id],
      entries: [entry2],
      rationale: "deliberately under-capacity — this must prove the DB's own tie check, not this test's arithmetic",
    });
    assert.equal(negative?.status, "refused", `an under-capacity match must be REFUSED — got ${JSON.stringify(negative)?.slice(0, 400)}`);
    assert.equal(negative?.rung_vector?.tie_nonzero, "fail", "the SPECIFIC rung that must fail");
    assert.equal(negative?.rung_vector?.capacity_exhausted, "pass", "and the one that must NOT — this is the isolation the old cell did not have");
    assert.equal(rec.refusals, 1, "裁-44 / FOLD-3: a returned DB refusal is COUNTED, which is what stops a night of them settling green");

    // --- S8 regression: acting MOVES the pack digest, and a re-read after acting must still work ---
    // The one cell that would ever catch this. bankOpKey's own header documents the exact hazard: a
    // CONSTANT pack op-key would make this second read collide with the first pack_read receipt
    // under clara._agent_bank_receipt's replay-identity check — and it would collide ONLY here,
    // because the digest has genuinely moved (line 1 dropped out of the unmatched set, entry 1
    // dropped out of the candidates once its capacity hit zero).
    const pack2 = await built.get_bank_pack.execute({ rationale: "confirming the pack after acting — the digest must have moved" });
    tools.beginModelStep(rec); // FOLD-20(c): the model has now SEEN this pack
    assert.equal(pack2.error, undefined, `the SECOND pack read must not refuse — got ${JSON.stringify(pack2)?.slice(0, 400)}. A refusal here specifically is the op-key-constancy regression.`);
    assert.match(pack2.digest, /^[0-9a-f]{64}$/);
    assert.notEqual(pack2.digest, pack1.digest, "the pack genuinely changed (line 1 matched, entry 1's capacity exhausted) — a stale digest here would mean this read never actually re-ran the query");

    // --- THE TWO VERBS NO CELL HAD EVER DRIVEN --------------------------------------------------
    // wake_propose_bank_line_exception and wake_propose_bank_identifier_promotion were gate-checked
    // by G1B-I3 for arity and argument NAMES only — and I3 cannot see a shape, which is the entire
    // lesson of M3 and M6. What had genuinely never executed on either is the
    // `p_evidence_document => $4::uuid` null cast, their digest binding, and their reply shapes.
    const exception = await built.propose_line_exception.execute({
      line_id: line2Id,
      kind: "bank_error",
      reason: "the bank's own line duplicates a charge it has since corrected",
      rationale: "no candidate entry can tie this line and the description names a reversal — a human decides",
    });
    assert.equal(exception?.status, "open", `the exception proposal must be ADMITTED — got ${JSON.stringify(exception)?.slice(0, 400)}`);
    assert.ok(exception.proposal_id, "and it names the proposal a human will settle");
    assert.equal(exception.line_id, line2Id, "bound to the line it is about");

    // Through the estate's OWN audited writer (clara.create_counterparty), never a raw insert —
    // the same discipline the books above are built with.
    const counterparty = (await rig.humanQuery(w.owner,
      "select clara.create_counterparty(p_client=>$1,p_kind=>$2,p_name=>$3,p_registration_no=>$4,p_tin=>$5,p_op_key=>$6) as r",
      [w.client, "vendor", "G1 bank e2e counterparty", null, null, rig.opk("g1be-cp")],
    )).rows[0].r;
    const counterpartyId = counterparty.counterparty_id ?? counterparty.id;
    assert.ok(counterpartyId, `the audited writer must name the counterparty it created — got ${JSON.stringify(counterparty)?.slice(0, 200)}`);
    // 裁-44 R2 / FOLD-11 — NO COUNT IS PASSED. The identifier is one the fixture actually prints
    // on its lines, so the tool's derived count is non-zero and the proposal is admitted;
    // G1B-BANK-E8 owns the count's own assertions. Written WITHOUT the separator the statement
    // prints, which is 裁-44 R3 / FOLD-15's canonicalisation earning its keep in passing.
    const promotion = await built.propose_identifier_promotion.execute({
      counterparty_id: counterpartyId,
      identifier_kind: "bank_account",
      identifier_value: "8899041722",
      rationale: "this printed account number appears against this supplier on the statement's own lines",
    });
    assert.equal(promotion?.status, "open", `the promotion proposal must be ADMITTED — got ${JSON.stringify(promotion)?.slice(0, 400)}`);
    assert.ok(promotion.proposal_id);
    assert.equal(promotion.counterparty_id, counterpartyId);

    assert.equal(rec.admitted, 3, "all three ADMITTING verbs this lane exposes have now been driven end to end, and the classifier counted each");
  } finally {
    globalThis.__claraPools = previous;
  }
});
