// 0042 Wave D-b — the PRODUCER, PART 3: ACCOUNT-ROLE ELIGIBILITY (design §2.1's
// shared reservation census, applied to the §5 producer). As-built ladder round 2.
//
// WHY THESE CELLS EXIST — THE PHANTOM STAFF ADVANCE. `accept_bank_rule_suggestion`
// validated the rule's proposed account against the CHART (active, this client's,
// non-control, never the bank account itself) and stopped there. It never asked the
// REGISTERS. So a signed coding rule pointed at an ENROLLED STAFF-ADVANCE account,
// accepted on a money-OUT line, derives a DEBIT on that account — and a debit on an
// enrolled advance code is precisely the soft-birth door of the advance hook. The
// entry approves clean, the register grows a row, and
// `clara.staff_advance_statement` then says a NAMED PERSON OWES THE FIRM MONEY THEY
// NEVER RECEIVED. Nothing catches it: the GL and the register agree to the sen, so
// `clara.staff_advance_tie` ties. The sibling producer for adjustment TEMPLATE lines
// has carried this exact test since §2.1; this door did not.
//
// TWO DOORS, ONE BODY. The accept verb asks at ARGUMENT time (CLR10,
// `suggestion_line_ineligible`); `_adj_on_approve` arm (3) re-asks at APPROVE time
// (CLR39 `suggestion_stale`, axis `line_eligibility`), because an account can be
// enrolled in the window between the two. Both read
// `clara._adj_line_eligibility_breach` over `clara._acct_role_reserved`, and NEITHER
// touches the shared derivation — the byte-equality arm (3) depends on is untouched.
//
// CONTRACT-BLIND — see `x42-af2.test.mjs`'s header for the lane law and
// `x42-af2-helpers.mjs`'s header for the interface-assumption register.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  opk, reasonOf, endPool, printLaneNotes, printSkipCount, noteLane, entryStatusOf,
} from "./a21-helpers.mjs";
import {
  af2SubstrateReady, skipAf2, refusesWithCode, caught,
  acceptBankRuleSuggestion, enrolStaffAdvanceAccount, withdrawDraft,
  CLR10, CLR39, T,
  ADVCODE, CODEACC,
  af2World, freshAf2Client, signedCodingRule,
  entryRowOf, entryLinesOf, entriesWithFlag, advanceRowsOf, approveEntry,
} from "./x42-af2-world.mjs";

let live = false;
let world = null;

/** The two tokens this file pins. Neither is in the ABI §F table yet — that is a
 *  documentation delta the close owes, and it is recorded as a lane note rather
 *  than softened into a message-text match. */
const T_INELIGIBLE = "suggestion_line_ineligible";
const AXIS_ELIGIBILITY = "line_eligibility";

before(async () => {
  live = await af2SubstrateReady();
  if (!live) {
    noteLane("0037/0038/0040 bank substrate absent — the x42 PRODUCER role-eligibility battery is dormant");
    return;
  }
  world = await af2World();
});

after(async () => {
  printLaneNotes("x42-producer-role");
  printSkipCount("x42-producer-role");
  await endPool();
});

// ===========================================================================
// x42.prod-26 — THE ACCEPT DOOR. A signed coding rule whose proposal names an
// ENROLLED STAFF-ADVANCE account is refused at accept time, BY NAME, before any
// draft exists; a rule naming an ordinary expense account on the very same
// client, in the very same transaction-order, still accepts. Both halves are
// mandatory: a guard that refuses everything proves nothing.
// ===========================================================================
test("x42.prod-26 accept refuses a rule proposing an ENROLLED staff-advance account (suggestion_line_ineligible) while an ordinary account still accepts", async (t) => {
  if (skipAf2(t, live)) return;
  const client = await freshAf2Client("prodrole");
  const owner = world.users.alice;

  // The rules are proposed and signed BEFORE the enrolment, deliberately: the
  // defect's own shape is "a rule that was lawful when it was signed, pointed at
  // an account somebody later enrolled". Nothing about the rule is wrong.
  const bad = await signedCodingRule({
    client, owner, proposer: world.users.bob, accountCode: ADVCODE,
    tokens: ["petty", "advance"], narration: "PETTY ADVANCE TRANSFER",
  });
  const good = await signedCodingRule({
    client, owner, proposer: world.users.bob, accountCode: CODEACC,
    tokens: ["tnb", "electricity"], narration: "TNB ELECTRICITY BILL",
  });
  await enrolStaffAdvanceAccount(world.users.hana, {
    client, accountCode: ADVCODE, personLabel: "x42 Aminah",
  });

  // The money-OUT arm is the dangerous one: the derived DEBIT leg lands on the
  // enrolled code, which is the advance hook's soft-birth door.
  assert.ok(bad.amountCents < 0, "mandatory setup: the rule's lines are money OUT of the bank");
  const err = await refusesWithCode(
    () => acceptBankRuleSuggestion(world.users.bob, {
      client, line: bad.lines[0].id, rule: bad.rule, opKey: opk("x42-role-bad"),
    }),
    CLR10, T_INELIGIBLE,
    "x42.prod-26 accepting a suggestion whose account an advance enrolment owns",
  );
  const detail = `${err.detail ?? ""}`;
  assert.ok(detail.includes("account_reserved"),
    `…on the shared census's own axis (got detail=${detail || "(none)"})`);
  assert.ok(detail.includes("staff_advance"),
    `…naming WHICH register owns the code (got detail=${detail || "(none)"})`);
  assert.equal((await entriesWithFlag(client, "bank_rule_suggested")).length, 0,
    "the refusal precedes the draft: no suggestion entry was minted at all");
  assert.equal((await advanceRowsOf(client)).length, 0,
    "…and no staff advance was born — the phantom never exists");

  // THE POSITIVE CONTROL, on the same client and the same enrolment: an ordinary
  // expense account is untouched by the new door, accepts, approves, and still
  // births nothing in the advance register.
  const ok = await acceptBankRuleSuggestion(world.users.bob, {
    client, line: good.lines[0].id, rule: good.rule, opKey: opk("x42-role-good"),
  });
  assert.ok(ok?.entry_id, `an ordinary coding suggestion still accepts (got ${JSON.stringify(ok)})`);
  // The second rule gets its own bank account (one active bank account per chart
  // code — the 0037 partial-unique law the fixture works around), so the bank leg
  // is asserted by ROLE rather than by the suite's first bank code.
  const legs = await entryLinesOf(ok.entry_id);
  const codes = legs.map((l) => l.account_code);
  assert.equal(codes.length, 2, `…deriving exactly two legs (got ${codes.join(",")})`);
  assert.ok(codes.includes(CODEACC), `…one of them the rule's ordinary account (got ${codes.join(",")})`);
  assert.ok(!codes.includes(ADVCODE), `…and NEITHER of them the enrolled advance code (got ${codes.join(",")})`);
  const ent = await entryRowOf(ok.entry_id);
  await approveEntry(owner, {
    entry: ok.entry_id, expectedRevision: ent.revision_token, opKey: opk("x42-role-good-apr"),
  });
  assert.equal(await entryStatusOf(ok.entry_id), "approved",
    "…and it approves through arm (3) unchanged — the new axis does not refuse lawful traffic");
  assert.equal((await advanceRowsOf(client)).length, 0,
    "the approved ordinary suggestion births no advance either");
});

// ===========================================================================
// x42.prod-27 — ARM (3), THE SIXTH AXIS. The enrolment lands AFTER the accept,
// while the suggestion sits in /queue — the window the accept door structurally
// cannot see. The approval must refuse `suggestion_stale` on axis
// `line_eligibility`, the register must stay empty, and the remedy the refusal
// NAMES ("withdraw the draft") must actually work: a refusal whose named remedy
// is itself refused is the walled-corridor class this ladder has already ruled a
// defect twice.
// ===========================================================================
test("x42.prod-27 arm (3): an account ENROLLED after the accept refuses suggestion_stale (axis line_eligibility) at approve, no advance is born, and the named remedy works", async (t) => {
  if (skipAf2(t, live)) return;
  const client = await freshAf2Client("prodrole2");
  const owner = world.users.alice;
  const w = await signedCodingRule({
    client, owner, proposer: world.users.bob, accountCode: ADVCODE,
    tokens: ["petty", "advance"], narration: "PETTY ADVANCE TRANSFER",
  });

  // Accepted while the account is still an ordinary asset code — this half MUST
  // succeed, or the cell would be proving the accept door instead of arm (3).
  const receipt = await acceptBankRuleSuggestion(world.users.bob, {
    client, line: w.lines[0].id, rule: w.rule, opKey: opk("x42-role2-accept"),
  });
  const ent = await entryRowOf(receipt.entry_id);
  assert.equal(ent.status, "draft", "mandatory setup: the suggestion is an outstanding DRAFT");
  const legs = await entryLinesOf(receipt.entry_id);
  const advLeg = legs.find((l) => l.account_code === ADVCODE);
  assert.ok(advLeg && Number(advLeg.debit_cents) > 0,
    "…whose DEBIT leg sits on the account about to be enrolled (the soft-birth door)");

  await enrolStaffAdvanceAccount(world.users.hana, {
    client, accountCode: ADVCODE, personLabel: "x42 Aminah",
  });

  const err = await refusesWithCode(
    () => approveEntry(owner, {
      entry: receipt.entry_id, expectedRevision: ent.revision_token, opKey: opk("x42-role2-apr"),
    }),
    CLR39, T.suggestionStale,
    "x42.prod-27 approving a suggestion whose account was enrolled underneath it",
  );
  const detail = `${err.detail ?? ""}`;
  assert.ok(detail.includes(AXIS_ELIGIBILITY),
    `…on the '${AXIS_ELIGIBILITY}' axis (got detail=${detail || "(none)"})`);
  assert.ok(detail.includes("account_reserved"),
    `…carrying the shared census's finer eligibility_axis (got detail=${detail || "(none)"})`);

  assert.equal(await entryStatusOf(receipt.entry_id), "draft",
    "the refused approval leaves the suggestion a DRAFT — nothing half-posted");
  assert.equal((await advanceRowsOf(client)).length, 0,
    "THE MONEY ASSERTION: no staff advance was soft-birthed, so no named person owes anything");

  // THE NAMED REMEDY, EXERCISED. The message says "withdraw the draft"; it works,
  // and the line is free for a corrected rule afterwards.
  const stillDraft = await entryRowOf(receipt.entry_id);
  const withdrawn = await withdrawDraft(owner, {
    entry: receipt.entry_id, reason: "x42 role: the account is a staff-advance control now",
    expectedRevision: stillDraft.revision_token, opKey: opk("x42-role2-wd"),
  });
  assert.ok(withdrawn, "the named remedy (withdraw_draft) is reachable for a suggestion draft");
  assert.equal(await entryStatusOf(receipt.entry_id), "withdrawn",
    "…and it really withdraws it — the corridor is not walled");

  // And the door now refuses a fresh accept on the same line by name, so the
  // human is told the same thing at both altitudes rather than looping.
  const again = await caught(() => acceptBankRuleSuggestion(world.users.bob, {
    client, line: w.lines[0].id, rule: w.rule, opKey: opk("x42-role2-again"),
  }));
  assert.ok(again, "a re-accept of the same rule is refused now that the account is enrolled");
  assert.equal(reasonOf(again), T_INELIGIBLE,
    `…by the accept door's own token (got '${reasonOf(again) ?? "(none)"}' — ${again.message})`);
});
