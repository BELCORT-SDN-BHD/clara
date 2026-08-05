// 0042 Wave D-b — the `bank_rule_suggested` PRODUCER:
// `clara.accept_bank_rule_suggestion` (design §5 / WD-R13 / WDB-G13). 0040
// shipped the sighting carve-out INERT ON PURPOSE, ahead of its producer; this
// is the producer, and these cells are the proof the guard was waiting for.
// PART 1: the happy path, the dedup law, accept-time validation, the sighting
// carve-out, the revise refusal and the autopost law. PART 2 — the arm-(3)
// approve-time staleness axes — is `x42-producer-stale.test.mjs`.
//
// CONTRACT-BLIND — see `x42-af2.test.mjs`'s header for the lane law and
// `x42-af2-helpers.mjs`'s header for the interface-assumption register (IA-4 is
// this file's signature pin).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, opk, reasonOf, endPool, printLaneNotes, printSkipCount, noteLane, ROLES,
} from "./a21-helpers.mjs";
import { holdThenContend } from "./rig-docs-race.mjs";
import {
  af2SubstrateReady, skipAf2, refusesWithCode, caught,
  acceptBankRuleSuggestion, proposeRule, signRule, reviseEntry, exceptLine,
  T, CLR10,
  BANKCOA, CODEACC, EXPN,
  af2World, freshAf2Client, freshBankAccount, nextPeriod, signedCodingRule, plainAt,
  entryRowOf, entryLinesOf, entriesWithFlag, ruleRow, ruleSightingCount, codingRuleCount,
  enterStatement, matchBankLine, birthCounterparty, approveEntry,
  reverseEntry, draftEntryV3, manualRes, lineGroupStatus,
} from "./x42-af2-world.mjs";

let live = false;
let world = null;

before(async () => {
  live = await af2SubstrateReady();
  if (!live) {
    noteLane("0037/0038/0040 bank substrate absent — the x42 PRODUCER battery is dormant");
    return;
  }
  world = await af2World();
});

after(async () => {
  printLaneNotes("x42-producer");
  printSkipCount("x42-producer");
  await endPool();
});

/** The suggested draft of a line, read back by its flag (ABI §B). */
async function suggestedEntriesOf(client) {
  return entriesWithFlag(client, "bank_rule_suggested");
}

// ===========================================================================
// x42.prod-19 — THE HAPPY PATH. A SIGNED kind='coding' rule + an unmatched,
// un-excepted line on a live statement → ONE draft, stamped
// `flags.bank_rule_suggested = {rule_id, line_id}`. The stamp is BOTH the chip
// the surface renders and the discriminant 0040's sighting carve-out already
// tests for — the producer's whole contract is that the stamp is present and
// exactly two keys wide.
// ===========================================================================
test("x42.prod-19 accept_bank_rule_suggestion drafts ONE entry stamped flags.bank_rule_suggested = {rule_id, line_id} and returns {entry_id}", async (t) => {
  if (skipAf2(t, live)) return;
  const client = await freshAf2Client("prod");
  const w = await signedCodingRule({ client, owner: world.users.alice, proposer: world.users.bob });
  const line = w.lines[0];

  const receipt = await acceptBankRuleSuggestion(world.users.bob, {
    client, line: line.id, rule: w.rule, opKey: opk("x42-prod-accept"),
  });
  assert.ok(receipt && receipt.entry_id,
    `the producer's envelope is {entry_id} (ABI §A) — got ${JSON.stringify(receipt)}`);

  const ent = await entryRowOf(receipt.entry_id);
  assert.equal(ent.status, "draft", "the suggestion produces a DRAFT — approval stays a human act");
  const stamp = ent.flags?.bank_rule_suggested;
  assert.ok(stamp, `the draft carries flags.bank_rule_suggested (got ${JSON.stringify(ent.flags)})`);
  assert.deepEqual(Object.keys(stamp).sort(), ["line_id", "rule_id"],
    `…with EXACTLY the ABI §B key pair (got ${Object.keys(stamp).join(",")})`);
  assert.equal(stamp.rule_id, w.rule, "…naming the signed rule it came from");
  assert.equal(stamp.line_id, line.id, "…and the statement line it explains");

  const legs = await entryLinesOf(receipt.entry_id);
  const codes = legs.map((l) => l.account_code).sort();
  assert.ok(codes.includes(BANKCOA), `the derived legs touch the line's own bank account (got ${codes.join(",")})`);
  assert.ok(codes.includes(CODEACC), `…and the rule's proposed coding account (got ${codes.join(",")})`);
  const magnitude = Math.abs(w.amountCents);
  assert.equal(legs.reduce((s, l) => s + Number(l.debit_cents), 0), magnitude,
    "the draft is derived at the LINE's own magnitude, to the sen");
  assert.equal(legs.reduce((s, l) => s + Number(l.credit_cents), 0), magnitude, "…and it balances");
  const bankLeg = legs.find((l) => l.account_code === BANKCOA);
  assert.equal(Number(bankLeg.credit_cents), magnitude,
    "a DEBIT-direction line (money out) credits the bank — the sign is derived, never guessed");

  assert.equal((await suggestedEntriesOf(client)).length, 1, "exactly ONE suggestion entry exists for this client");
  assert.equal((await lineGroupStatus(line.id)).length, 0,
    "accepting a suggestion does NOT match the line — the draft is a proposal, not a booking");
});

// ===========================================================================
// x42.prod-20 — THE DEDUP LAW (design §5): at most ONE `bank_rule_suggested`
// entry per line across `status IN ('draft','approved') AND reversed_by IS
// NULL`. Two assisted clicks must never become two postings of one bank line.
// Four probes: the outstanding DRAFT blocks; the APPROVED-but-unmatched entry
// blocks; two CONCURRENT accepts serialise so exactly one wins; and once the
// first entry is REVERSED the line is free again.
// ===========================================================================
test("x42.prod-20 dedup: an outstanding draft blocks, an approved-but-unmatched suggestion blocks, concurrent accepts serialise, and a reversal frees the line", async (t) => {
  if (skipAf2(t, live)) return;
  const client = await freshAf2Client("dedup");
  const w = await signedCodingRule({ client, owner: world.users.alice, proposer: world.users.bob });
  const [lineA, lineB] = w.lines;

  const first = await acceptBankRuleSuggestion(world.users.bob, {
    client, line: lineA.id, rule: w.rule, opKey: opk("x42-dedup-1"),
  });
  await refusesWithCode(
    () => acceptBankRuleSuggestion(world.users.bob, {
      client, line: lineA.id, rule: w.rule, opKey: opk("x42-dedup-2"),
    }),
    CLR10, T.suggestionOutstanding,
    "x42.prod-20 a second accept while the first draft is outstanding",
  );

  // APPROVED-BUT-UNMATCHED still blocks: the entry exists, the line is still
  // unexplained on the statement, and a second draft would double-post it.
  const draft = await entryRowOf(first.entry_id);
  await approveEntry(world.users.alice, {
    entry: first.entry_id, expectedRevision: draft.revision_token, opKey: opk("x42-dedup-approve"),
  });
  assert.equal((await entryRowOf(first.entry_id)).status, "approved", "mandatory setup: the suggestion is approved");
  assert.equal((await lineGroupStatus(lineA.id)).length, 0, "…and its line is still unmatched");
  await refusesWithCode(
    () => acceptBankRuleSuggestion(world.users.bob, {
      client, line: lineA.id, rule: w.rule, opKey: opk("x42-dedup-3"),
    }),
    CLR10, T.suggestionOutstanding,
    "x42.prod-20 a second accept against an APPROVED but unmatched suggestion",
  );

  // CONCURRENT: side A holds the line's row lock uncommitted; side B must BLOCK
  // (proven by pg_blocking_pids, the X7 law) and then lose against A's committed
  // state — the row-locked precheck and the partial unique agree.
  const race = await holdThenContend({
    a: {
      role: ROLES.authenticated, jwtSub: world.users.bob,
      run: (c) => c.query(
        "select clara.accept_bank_rule_suggestion(p_client => $1, p_line => $2, p_rule => $3, p_op_key => $4) as r",
        [client, lineB.id, w.rule, opk("x42-race-a")],
      ),
    },
    b: {
      role: ROLES.authenticated, jwtSub: world.users.grace,
      run: (c) => c.query(
        "select clara.accept_bank_rule_suggestion(p_client => $1, p_line => $2, p_rule => $3, p_op_key => $4) as r",
        [client, lineB.id, w.rule, opk("x42-race-b")],
      ),
    },
  });
  assert.ok(race.provedBlocked, "the second concurrent accept genuinely BLOCKED on the first (pg_blocking_pids)");
  assert.equal(race.a.ok, true, `the first accept committed (got ${JSON.stringify(race.a)})`);
  assert.equal(race.b.ok, false, `the racing accept LOST (got ${JSON.stringify(race.b)})`);
  const raceRows = (await suggestedEntriesOf(client)).filter((e) => e.flags.bank_rule_suggested.line_id === lineB.id);
  assert.equal(raceRows.length, 1, `exactly ONE suggestion survives the race (got ${raceRows.length})`);
  noteLane(`x42.prod-20: the racing accept lost with code=${race.b.code} — ${race.b.message}`);

  // REVERSED frees the line: the dedup predicate is scoped `reversed_by IS NULL`.
  const rev = await reverseEntry(world.users.alice, {
    entry: first.entry_id, reason: "x42 dedup: the coding was wrong after all", opKey: opk("x42-dedup-rev"),
  });
  const mirror = rev?.reversal_entry_id ?? rev?.reversal_id ?? rev?.entry_id
    ?? (await rootQuery("select id from clara.journal_entries where reversal_of=$1", [first.entry_id])).rows[0]?.id;
  assert.ok(mirror, `reverse_entry minted a mirror (got ${JSON.stringify(rev)})`);
  const mirrorRow = await entryRowOf(mirror);
  if (mirrorRow.status === "draft") {
    await approveEntry(world.users.bob, {
      entry: mirror, expectedRevision: mirrorRow.revision_token, opKey: opk("x42-dedup-revapr"),
    });
  }
  assert.ok((await entryRowOf(first.entry_id)).reversed_by, "mandatory setup: the first suggestion is reversed");
  const fresh = await acceptBankRuleSuggestion(world.users.bob, {
    client, line: lineA.id, rule: w.rule, opKey: opk("x42-dedup-4"),
  });
  assert.ok(fresh?.entry_id, "once the first entry is REVERSED a fresh accept succeeds — the line is free again");
});

// ===========================================================================
// x42.prod-21 — ACCEPT-TIME VALIDATION (design §5). The producer is a
// bookkeeper-floor door onto a SIGNED authority; every precondition that makes
// the authority real is checked before a draft is written. ABI §F pins no token
// for these, so each refusal's observed reason is RECORDED rather than guessed.
// ===========================================================================
test("x42.prod-21 accept refuses: an unsigned rule, a match_settle rule, another client's rule, an already-matched line and an excepted line", async (t) => {
  if (skipAf2(t, live)) return;
  const client = await freshAf2Client("prodval");
  const other = await freshAf2Client("prodval-other");
  const w = await signedCodingRule({ client, owner: world.users.alice, proposer: world.users.bob });
  // Probes (1) and (2) each need a statement of their own, and a statement needs
  // a bank account. 0038 §4.1 binds AT MOST ONE ACTIVE bank account per chart
  // account per client (`coa_account_already_bank`, 0038:2705-2709) and the x42
  // chart carries exactly one BANKCOA — which `client` already spent on the
  // signed rule's statement. So each probe gets its own CLIENT rather than a
  // second bank account on this one; the axis under test (the rule's status,
  // then its kind) is untouched, since rule and line still share one client in
  // both. `client` itself keeps arms (3)/(4)/(5), which reuse w.lines.
  const unsignedClient = await freshAf2Client("prodval-unsigned");
  const msClient = await freshAf2Client("prodval-ms");

  // (1) UNSIGNED — proposed, never signed.
  const unsignedStmt = await (async () => {
    const bankAccount = await freshBankAccount(world.users.alice, unsignedClient);
    const p = nextPeriod();
    return enterStatement(world.users.alice, {
      client: unsignedClient, bankAccount, periodStart: p.start, periodEnd: p.end,
      opening: 0, keepPeriod: true,
      specs: Array.from({ length: 3 }, (_, i) => ({
        amountCents: -13_000, entryDate: p.mid, description: `SYABAS WATER BILL ${i + 1}`,
      })),
    });
  })();
  const unsigned = (await proposeRule(world.users.bob, {
    client: unsignedClient, kind: "coding",
    pattern: { tokens: ["syabas", "water"], direction: "debit" },
    proposal: { account_code: CODEACC, narration_template: "SYABAS WATER BILL" },
  })).rule_id;
  assert.equal((await ruleRow(unsigned)).status, "proposed", "mandatory setup: the rule is UNSIGNED");
  const e1 = await caught(() => acceptBankRuleSuggestion(world.users.bob, {
    client: unsignedClient, line: unsignedStmt.lines[0].id, rule: unsigned, opKey: opk("x42-val-1"),
  }));
  assert.ok(e1, "an UNSIGNED rule may not be accepted — an unsigned rule is nobody's authority");
  noteLane(`x42.prod-21 unsigned rule: code=${e1.code} reason=${reasonOf(e1) ?? "(none)"}`);

  // (2) WRONG KIND — a signed match_settle rule is not a coding suggestion.
  const cp = await birthCounterparty(world.users.alice, {
    client: msClient, name: `X42 MSCO ${Date.now().toString(36)}`, kind: "customer",
  });
  const msBank = await freshBankAccount(world.users.alice, msClient);
  const msP = nextPeriod();
  const msStmt = await enterStatement(world.users.alice, {
    client: msClient, bankAccount: msBank, periodStart: msP.start, periodEnd: msP.end,
    opening: 0, keepPeriod: true,
    specs: Array.from({ length: 3 }, (_, i) => ({
      amountCents: 21_000, entryDate: msP.mid, description: `IBG TRANSFER INBOUND ${i + 1}`,
    })),
  });
  const ms = (await proposeRule(world.users.bob, {
    client: msClient, kind: "match_settle",
    pattern: { tokens: ["ibg", "transfer"], direction: "credit" },
    proposal: { domain: "ar", counterparty_id: cp },
  })).rule_id;
  await signRule(world.users.alice, { rule: ms });
  const e2 = await caught(() => acceptBankRuleSuggestion(world.users.bob, {
    client: msClient, line: msStmt.lines[0].id, rule: ms, opKey: opk("x42-val-2"),
  }));
  assert.ok(e2, "only a kind='coding' rule breeds a suggested DRAFT (WDB-G13)");
  noteLane(`x42.prod-21 match_settle rule: code=${e2.code} reason=${reasonOf(e2) ?? "(none)"}`);

  // (3) WRONG CLIENT — the rule belongs to a different client of the same firm.
  const e3 = await caught(() => acceptBankRuleSuggestion(world.users.bob, {
    client: other, line: w.lines[2].id, rule: w.rule, opKey: opk("x42-val-3"),
  }));
  assert.ok(e3, "a rule of one client can never be accepted onto another client's line");
  noteLane(`x42.prod-21 wrong client: code=${e3.code} reason=${reasonOf(e3) ?? "(none)"}`);

  // (4) THE LINE IS ALREADY MATCHED.
  const matchedLine = w.lines[1];
  const entry = await plainAt(world.users.alice, {
    client, debit: EXPN, credit: BANKCOA, cents: Math.abs(w.amountCents),
    postingDate: w.period.mid, memo: "x42 val: the line was already booked",
  });
  await matchBankLine(world.users.alice, {
    client, lines: [matchedLine.id], entries: [{ entry_id: entry, matched_cents: w.amountCents }],
    opKey: opk("x42-val-match"),
  });
  const e4 = await caught(() => acceptBankRuleSuggestion(world.users.bob, {
    client, line: matchedLine.id, rule: w.rule, opKey: opk("x42-val-4"),
  }));
  assert.ok(e4, "an already-matched line has nothing left to suggest");
  noteLane(`x42.prod-21 matched line: code=${e4.code} reason=${reasonOf(e4) ?? "(none)"}`);

  // (5) THE LINE IS UNDER AN OPEN EXCEPTION.
  const exceptedLine = w.lines[2];
  await exceptLine(world.users.alice, {
    client, line: exceptedLine.id, kind: "disputed", reason: "x42 val: this charge is disputed",
  });
  const e5 = await caught(() => acceptBankRuleSuggestion(world.users.bob, {
    client, line: exceptedLine.id, rule: w.rule, opKey: opk("x42-val-5"),
  }));
  assert.ok(e5, "an open-excepted line is an owner's live dispute, not a coding suggestion");
  noteLane(`x42.prod-21 excepted line: code=${e5.code} reason=${reasonOf(e5) ?? "(none)"}`);

  for (const c of [client, other, unsignedClient, msClient]) {
    assert.equal((await suggestedEntriesOf(c)).length, 0,
      "not one of the five refused calls wrote a draft, on ANY of the clients they touched");
  }
});

// ===========================================================================
// x42.prod-23 — THE 0040 S5 SIGHTING CARVE-OUT, NOW WITH A PRODUCER. A
// suggestion-born approval accrues NO vendor-binding sighting: letting it would
// let a bank rule breed a `vendor_account` autopost proposal out of three
// assisted clicks — rules breeding from rules' own output (WA2-R9).
//
// The CONTROL is the point of the cell: the same counterparty and the same
// account, approved through an ORDINARY draft, MUST move the counter. Measuring
// only the carve-out would pass against a broken instrument.
// ===========================================================================
test("x42.prod-23 the sighting carve-out: an accepted suggestion accrues NO rule_sightings, while an ordinary approval on the same counterparty+account DOES", async (t) => {
  if (skipAf2(t, live)) return;
  const client = await freshAf2Client("carveout");
  const cp = await birthCounterparty(world.users.alice, {
    client, name: `X42 TNB ${Date.now().toString(36)}`, kind: "vendor",
  });
  const w = await signedCodingRule({
    client, owner: world.users.alice, proposer: world.users.bob, counterparty: cp,
  });

  const before = await ruleSightingCount(client);
  const rulesBefore = await codingRuleCount(client);
  const receipt = await acceptBankRuleSuggestion(world.users.bob, {
    client, line: w.lines[0].id, rule: w.rule, opKey: opk("x42-carve-accept"),
  });
  const draft = await entryRowOf(receipt.entry_id);
  await approveEntry(world.users.alice, {
    entry: receipt.entry_id, expectedRevision: draft.revision_token, opKey: opk("x42-carve-approve"),
  });
  assert.equal((await entryRowOf(receipt.entry_id)).status, "approved",
    "mandatory setup: the suggestion really was approved (only the ACCRUAL is withheld)");
  assert.equal(await ruleSightingCount(client), before,
    "the suggestion-born approval accrued ZERO sightings — the 0040 S5 carve-out fires");
  assert.equal(await codingRuleCount(client), rulesBefore,
    "…and no vendor_account coding rule was bred from it");

  const stampedLegs = await entryLinesOf(receipt.entry_id);
  if (!stampedLegs.some((l) => l.counterparty_id)) {
    noteLane("x42.prod-23: the suggested entry carries NO counterparty on any leg, so the carve-out is vacuous in this build — the accrual gate would have been closed by `v_counterparty is null` anyway (finding: the design's counterparty-bearing coding proposal does not reach the legs)");
  }

  // THE CONTROL, through the instrument production uses: an ORDINARY draft with
  // the same vendor and the same debit account MUST accrue.
  const d = await draftEntryV3(world.users.alice, {
    client, resolution: await manualRes(world.users.alice, client),
    memo: "x42 carve-out control: an ordinary coded bill", postingDate: w.period.mid,
    lines: [
      { account_code: CODEACC, debit_cents: 12_000, credit_cents: 0, description: "electricity" },
      { account_code: BANKCOA, debit_cents: 0, credit_cents: 12_000, description: "paid" },
    ],
    vendor: { existing_id: cp }, opKey: opk("x42-carve-ctrl"),
  });
  await approveEntry(world.users.bob, {
    entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("x42-carve-ctrla"),
  });
  assert.ok(await ruleSightingCount(client) > before,
    "THE CONTROL: an ordinary approval on the same counterparty+account DOES accrue a sighting — the counter is a live instrument");
});

// ===========================================================================
// x42.prod-24 — `revise_entry` REFUSES A PROPOSAL-BEARING DRAFT (ABI §B). The
// function rewrites lines wholesale and knows nothing about flags, so an edited
// suggestion would reach arm (3) with legs that contradict the rule it names.
// Withdraw and re-accept is the sanctioned path.
// ===========================================================================
test("x42.prod-24 revise_entry on a bank_rule_suggested draft refuses proposal_not_revisable", async (t) => {
  if (skipAf2(t, live)) return;
  const client = await freshAf2Client("revise");
  const w = await signedCodingRule({ client, owner: world.users.alice, proposer: world.users.bob });
  const receipt = await acceptBankRuleSuggestion(world.users.bob, {
    client, line: w.lines[0].id, rule: w.rule, opKey: opk("x42-revise-accept"),
  });
  const ent = await entryRowOf(receipt.entry_id);

  await refusesWithCode(
    () => reviseEntry(world.users.bob, {
      entry: receipt.entry_id, expectedRevision: ent.revision_token,
      lines: [
        { account_code: EXPN, debit_cents: 1_000, credit_cents: 0, description: "tamper" },
        { account_code: BANKCOA, debit_cents: 0, credit_cents: 1_000, description: "tamper" },
      ],
      opKey: opk("x42-revise"),
    }),
    CLR10, T.proposalNotRevisable,
    "x42.prod-24 revising a suggestion-bearing draft",
  );
  const after = await entryLinesOf(receipt.entry_id);
  assert.ok(after.some((l) => l.account_code === CODEACC),
    "the refused revise left the derived legs exactly as the rule produced them");
});

// ===========================================================================
// x42.prod-25 — THE AUTOPOST LAW (ADR-049/050, WB-R2). A suggestion is a
// HAND-DRAFT class object: it is never autopost-eligible, no matter how signed
// its rule is. The approve is a human act, and the entry carries no
// rule-checked stamp — which is also what keeps 0040's H2 carve-out honest.
// ===========================================================================
test("x42.prod-25 a suggested entry NEVER autoposts: it lands as a draft, carries no checked_via_rule_id, and only a human approve moves it", async (t) => {
  if (skipAf2(t, live)) return;
  const client = await freshAf2Client("autopost");
  const w = await signedCodingRule({ client, owner: world.users.alice, proposer: world.users.bob });
  const receipt = await acceptBankRuleSuggestion(world.users.bob, {
    client, line: w.lines[0].id, rule: w.rule, opKey: opk("x42-auto-accept"),
  });

  const ent = await entryRowOf(receipt.entry_id);
  assert.equal(ent.status, "draft", "the accept never posts — the entry is a DRAFT the moment it is born");
  assert.equal(ent.checked_via_rule_id ?? null, null,
    "…and it carries NO checked_via_rule_id: a bank coding rule is not an autopost authority");
  assert.equal(ent.approved_at ?? null, null, "…nor an approval stamp");
  assert.equal(ent.reversal_of ?? null, null, "…and it is not a reversal mirror");

  // A human — and a DISTINCT human, since the maker is the bookkeeper who
  // accepted — is the only thing that moves it.
  await approveEntry(world.users.alice, {
    entry: receipt.entry_id, expectedRevision: ent.revision_token, opKey: opk("x42-auto-approve"),
  });
  const posted = await entryRowOf(receipt.entry_id);
  assert.equal(posted.status, "approved", "a human approve is what posts it");
  assert.equal(posted.checked_via_rule_id ?? null, null,
    "…and even then the entry never claims a rule as its checker");
  // `checker_actor` is the column journal_entries actually carries for the
  // approving human (there is no `approved_by`; the maker/checker pair is
  // maker_actor + checker_actor, the CLR05 shape). Reading a column that does
  // not exist returned undefined, which is a vacuous pass, not a proof.
  assert.equal(posted.checker_actor, world.users.alice,
    "…and the approval is attributed to the HUMAN checker, never to the rule");
  assert.notEqual(posted.checker_actor, posted.maker_actor,
    "the maker (the bookkeeper who accepted) is not the checker — CLR05 is untouched by the producer");
  assert.equal((await suggestedEntriesOf(client)).length, 1,
    "the client carries exactly one suggestion entry throughout");
});
