// 0042 Wave D-b — the PRODUCER, PART 2: `_adj_on_approve` ARM (3), the
// approve-time re-validation of a `bank_rule_suggested` draft (design §2.6 arm
// (3) + §5; ABI §F: CLR39 `suggestion_stale`).
//
// WHY THE ARM EXISTS. A suggestion is derived once, at accept time, from a
// signed rule and a live line — and then it SITS in /queue until a human looks
// at it. Everything it was derived from can move in that window: the rule can be
// retired, the line can be matched or disputed by somebody else, the statement
// can be voided, the legs can be edited underneath it. Approving a derivation
// whose premises are gone is exactly the "assisted click that posts a lie" the
// whole D-b producer is guarded against. Each axis gets its OWN cell, because a
// single combined cell would go green on whichever axis fires first.
//
// CONTRACT-BLIND — see `x42-af2.test.mjs`'s header for the lane law and
// `x42-af2-helpers.mjs`'s header for the interface-assumption register.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, opk, endPool, printLaneNotes, printSkipCount, noteLane,
} from "./a21-helpers.mjs";
import {
  af2SubstrateReady, skipAf2, refusesWithCode, caught,
  acceptBankRuleSuggestion, retireRule, exceptLine,
  T, CLR39,
  BANKCOA, EXPN, CODEACC,
  af2World, freshAf2Client, signedCodingRule, plainAt,
  entryRowOf, entryLinesOf, ruleRow, statementRow,
  matchBankLine, voidBankStatement, approveEntry, lineGroupStatus,
} from "./x42-af2-world.mjs";

let live = false;
let world = null;

/** F-A3 PR-3 (Annex I) drops clara.accept_bank_rule_suggestion whole -- and with it the only
 *  lawful way to mint a NEW `bank_rule_suggested`-flagged draft, which is what every cell in
 *  this file needs to construct its fixture (arm (3)'s re-validation is only reachable through
 *  an accepted suggestion). `db-slice-frontiers` still runs this file at the D-b2/D-b3
 *  frontiers (test-list-d-b2.txt/-d-b3.txt), where the producer is exactly as designed and this
 *  battery must stay green. REVERSE/upper gate, the x42-s5-helpers.mjs `pr3Landed` precedent:
 *  skip loudly once the producer is retired on the frontier this rig runs against, never fail.
 *  (Arm (3)'s CODE itself is NOT retired -- it still re-validates any PRE-EXISTING draft; this
 *  file's claim is specifically about constructing a NEW one, which the drop makes impossible.) */
async function producerRetired() {
  return (await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ $1",
    ["^[0-9]{4}_f_a3_pr3_retirement_parity_doors$"])).rows[0].n === 1;
}

before(async () => {
  live = await af2SubstrateReady();
  if (!live) {
    noteLane("0037/0038/0040 bank substrate absent — the x42 PRODUCER staleness battery is dormant");
    return;
  }
  if (await producerRetired()) {
    live = false;
    noteLane("F-A3 PR-3 retires clara.accept_bank_rule_suggestion whole (Annex I) — the x42 PRODUCER staleness battery is dormant on this frontier; db-slice-frontiers still proves it green at D-b2/D-b3 (0041_asm..0045)");
    return;
  }
  world = await af2World();
});

after(async () => {
  printLaneNotes("x42-producer-stale");
  printSkipCount("x42-producer-stale");
  await endPool();
});

/** A signed coding rule + ONE accepted suggestion, ready to be made stale.
 *  Returns the rule world plus { entry, token, line }. */
async function acceptedSuggestion(label) {
  const client = await freshAf2Client(label);
  const w = await signedCodingRule({ client, owner: world.users.alice, proposer: world.users.bob });
  const line = w.lines[0];
  const receipt = await acceptBankRuleSuggestion(world.users.bob, {
    client, line: line.id, rule: w.rule, opKey: opk(`x42-stale-${label}`),
  });
  const ent = await entryRowOf(receipt.entry_id);
  assert.equal(ent.status, "draft", `${label} mandatory setup: the suggestion is an outstanding DRAFT`);
  return { client, w, line, entry: receipt.entry_id, token: ent.revision_token };
}

/** Approving MUST refuse CLR39 `suggestion_stale`, and the draft must survive. */
async function assertStale({ client, entry, token }, label) {
  await refusesWithCode(
    () => approveEntry(world.users.alice, { entry, expectedRevision: token, opKey: opk("x42-stale-apr") }),
    CLR39, T.suggestionStale,
    label,
  );
  const after = await entryRowOf(entry);
  assert.equal(after.status, "draft",
    `${label}: the refused approval leaves the suggestion a DRAFT (withdraw and re-accept is the path)`);
  assert.equal(after.approved_at ?? null, null, `${label}: …with no approval stamp`);
  void client;
}

// ===========================================================================
// x42.stale-22a — THE RULE IS NO LONGER SIGNED. A retired rule is a withdrawn
// authority; a draft derived from it is a derivation nobody stands behind.
// ===========================================================================
test("x42.stale-22a arm (3): a rule RETIRED while the suggestion sat in the queue refuses suggestion_stale at approve", async (t) => {
  if (skipAf2(t, live)) return;
  const s = await acceptedSuggestion("stale-unsigned");
  await retireRule(world.users.alice, {
    rule: s.w.rule, reason: "x42 stale: this pattern turned out to be too broad", opKey: opk("x42-stale-retire"),
  });
  assert.equal((await ruleRow(s.w.rule)).status, "retired", "mandatory setup: the rule is retired");
  await assertStale(s, "x42.stale-22a approving a suggestion whose rule is no longer signed");
});

// ===========================================================================
// x42.stale-22b — THE LINE WAS MATCHED IN THE MEANTIME. Somebody else explained
// the line properly; approving the suggestion now would post it a second time.
// ===========================================================================
test("x42.stale-22b arm (3): a line MATCHED while the suggestion sat in the queue refuses suggestion_stale at approve", async (t) => {
  if (skipAf2(t, live)) return;
  const s = await acceptedSuggestion("stale-matched");
  const magnitude = Math.abs(s.w.amountCents);
  const entry = await plainAt(world.users.alice, {
    client: s.client, debit: EXPN, credit: BANKCOA, cents: magnitude,
    postingDate: s.w.period.mid, memo: "x42 stale: a colleague booked the line properly",
  });
  await matchBankLine(world.users.alice, {
    client: s.client, lines: [s.line.id], entries: [{ entry_id: entry, matched_cents: s.w.amountCents }],
    opKey: opk("x42-stale-match"),
  });
  assert.equal((await lineGroupStatus(s.line.id))[0], "live", "mandatory setup: the line is now live-matched");
  await assertStale(s, "x42.stale-22b approving a suggestion whose line has been matched");
});

// ===========================================================================
// x42.stale-22c — THE LINE WAS EXCEPTED IN THE MEANTIME. An owner has opened a
// dispute on the very line a bookkeeper's suggestion proposes to code away.
// ===========================================================================
test("x42.stale-22c arm (3): a line EXCEPTED while the suggestion sat in the queue refuses suggestion_stale at approve", async (t) => {
  if (skipAf2(t, live)) return;
  const s = await acceptedSuggestion("stale-excepted");
  await exceptLine(world.users.alice, {
    client: s.client, line: s.line.id, kind: "disputed",
    reason: "x42 stale: the owner disputes this charge with the bank",
  });
  await assertStale(s, "x42.stale-22c approving a suggestion whose line is now under an open exception");
});

// ===========================================================================
// x42.stale-22d — THE STATEMENT IS NO LONGER LIVE. A voided statement's lines
// describe a document that has been withdrawn; nothing derived from them may
// reach the books.
// ===========================================================================
test("x42.stale-22d arm (3): a statement VOIDED while the suggestion sat in the queue refuses suggestion_stale at approve", async (t) => {
  if (skipAf2(t, live)) return;
  const s = await acceptedSuggestion("stale-void");
  await voidBankStatement(world.users.alice, {
    client: s.client, statement: s.w.statement,
    reason: "x42 stale: the bank re-issued this statement", opKey: opk("x42-stale-void"),
  });
  assert.notEqual((await statementRow(s.w.statement)).status, "live", "mandatory setup: the statement is voided");
  await assertStale(s, "x42.stale-22d approving a suggestion whose statement is no longer live");
});

// ===========================================================================
// x42.stale-22e — THE PREDICATE NO LONGER MATCHES. The design lists this as its
// own axis, and this cell MEASURES why it cannot be reached from the outside:
// both of its inputs are immutable by construction.
//   * `bank_statement_lines` is APPEND-ONLY (0038): a line's description,
//     direction and amount can never change after entry.
//   * `bank_rules` is frozen outside its proposed→signed→retired transitions
//     (0040): `pattern` can never change on a live rule.
// So the only way the pair (line, pattern) can stop matching is for one side to
// leave the predicate's own universe — which is the LIVE-statement scope the
// sighting predicate carries, i.e. exactly axis (d) above. The axis is therefore
// closed STRUCTURALLY, and this cell pins both walls so a future widening of
// either table re-opens it loudly instead of silently.
// ===========================================================================
test("x42.stale-22e arm (3): the predicate axis is closed STRUCTURALLY — the line is append-only and the rule's pattern is frozen", async (t) => {
  if (skipAf2(t, live)) return;
  const s = await acceptedSuggestion("stale-predicate");

  const lineEdit = await caught(() => rootQuery(
    "update clara.bank_statement_lines set description = $2 where id = $1",
    [s.line.id, "SOMETHING ENTIRELY DIFFERENT"],
  ));
  assert.ok(lineEdit, "a statement line's description can never be edited — the line is APPEND-ONLY (0038)");
  assert.equal(lineEdit.code, "CLR08", `…refused as an immutability breach (got ${lineEdit.code} — ${lineEdit.message})`);

  const ruleEdit = await caught(() => rootQuery(
    "update clara.bank_rules set pattern = $2::jsonb where id = $1",
    [s.w.rule, JSON.stringify({ tokens: ["something", "else"], direction: "credit" })],
  ));
  assert.ok(ruleEdit, "a signed rule's pattern can never be edited — signed content is frozen (0040)");
  assert.equal(ruleEdit.code, "CLR08", `…refused as an immutability breach (got ${ruleEdit.code} — ${ruleEdit.message})`);

  noteLane("x42.stale-22e: the 'predicate no longer matches' axis is unreachable through any door — bank_statement_lines is append-only and bank_rules.pattern is frozen, so the only live way for the pair to stop matching is the statement leaving the live scope (axis 22d)");

  // The suggestion is still perfectly approvable: nothing actually went stale.
  const receipt = await approveEntry(world.users.alice, {
    entry: s.entry, expectedRevision: s.token, opKey: opk("x42-stale-pred-apr"),
  });
  assert.ok(receipt, "…and with every premise intact the suggestion approves normally (the red-proof of the four axes above)");
  assert.equal((await entryRowOf(s.entry)).status, "approved", "the control approval really posted");
});

// ===========================================================================
// x42.stale-22f — THE LEGS NO LONGER EQUAL THE DERIVATION. The arm re-derives
// the entry from the rule and compares: a draft whose legs have been moved
// underneath it is not the rule's output any more, whatever its flag says.
//
// FORCED STATE, and why: `revise_entry` refuses a proposal-bearing draft by name
// (x42.prod-24), which is precisely what makes this the LAST door — so the legs
// are moved at the table (draft lines are mutable to the fn owner by
// construction: that is how revise_entry works at all).
// ===========================================================================
test("x42.stale-22f arm (3): legs that no longer equal the derivation refuse suggestion_stale at approve", async (t) => {
  if (skipAf2(t, live)) return;
  const s = await acceptedSuggestion("stale-legs");
  const before = await entryLinesOf(s.entry);
  const codingLeg = before.find((l) => l.account_code === CODEACC);
  assert.ok(codingLeg, `mandatory setup: the derived draft carries a leg on ${CODEACC}`);

  await rootQuery(
    "update clara.journal_lines set account_code = $2 where id = $1", [codingLeg.id, EXPN]);
  const moved = await entryLinesOf(s.entry);
  assert.ok(moved.some((l) => l.account_code === EXPN),
    "mandatory setup: the coding leg has been moved to a different account");
  assert.equal(moved.reduce((n, l) => n + Number(l.debit_cents) - Number(l.credit_cents), 0), 0,
    "…and the draft still BALANCES, so only the derivation check can catch this");

  // A line write rotates the draft's revision token (0003's t_jl_rotate_token),
  // so the approve is driven from the CURRENT token — otherwise the cell would
  // measure CLR06 staleness rather than arm (3)'s.
  const fresh = await entryRowOf(s.entry);
  await assertStale({ client: s.client, entry: s.entry, token: fresh.revision_token },
    "x42.stale-22f approving a suggestion whose legs no longer equal the rule's derivation");
  const after = await entryLinesOf(s.entry);
  assert.ok(after.some((l) => l.account_code === EXPN),
    "the refused approval changed nothing — the tampered draft is still there for a human to withdraw");
});
