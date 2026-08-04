// 0042 Wave D-b — AF-2 PART 2: the HIGH-STAKES PARK and its immediate life
// (design §4 / WDB-G9). The declared resolution rides the WCA-R7 pending group;
// the bookkeeper+ flip executes it. Cells: the ancillary refusals + the park
// itself, the `pending_resolution` CHECK, the exceptions-surface badge, the
// parked-line direct-resolve guard, the parked-CANCEL drill, and the FLIP
// (declarant-resolved, stale-declaration refusal, flipper floor).
//
// CONTRACT-BLIND — see `x42-af2.test.mjs`'s header for the lane law and
// `x42-af2-helpers.mjs`'s header for the interface-assumption register.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, opk, reasonOf, endPool, printLaneNotes, printSkipCount, noteLane,
  HIGH_STAKES_CENTS, entryStatusOf,
} from "./a21-helpers.mjs";
import {
  af2SubstrateReady, skipAf2, refuses, refusesWithCode, caught,
  resolveAndBookBankLine, resolveException,
  T, CLR10,
  BANKCOA, AR1, REVN, CHARGEX, ADJX,
  af2World, freshAf2Client, bankLine, openException, stampedItem, parkHighStakes,
  assertEnvelope, assertUntouched, assertDeclarationShape, parkedDeclarationOf,
  parkedBadgeFor, parkedBadgeKey, RESOLUTION_COLUMNS,
  entryCountOf, exceptionRow, groupsOfLine,
  assertGroupTies, lineGroupStatus, matchRow, matchIdOf, birthCounterparty,
  unmatchBankMatch, completePendingMatch, approveEntry, entryRowOf,
} from "./x42-af2-world.mjs";

let live = false;
let world = null;

before(async () => {
  live = await af2SubstrateReady();
  if (!live) {
    noteLane("0037/0038/0040 bank substrate absent — the x42 AF-2 PARK battery is dormant");
    return;
  }
  world = await af2World();
});

after(async () => {
  printLaneNotes("x42-af2-park");
  printSkipCount("x42-af2-park");
  await endPool();
});

// ===========================================================================
// x42.af2-8 — HIGH STAKES: THE PARK (WDB-G9). At or above the threshold the
// composite books the SETTLEMENT LEG ONLY and parks the owner's declaration on
// the WCA-R7 pending group. Every ancillary — a hand-draft, difference
// adjustments, an advance payload, a bank charge — is refused BY NAME, because
// none of them is a thing the checker can re-derive at the flip.
// ===========================================================================
test("x42.af2-8 high-stakes park: every ancillary refuses pending_branch_ancillary_unsupported, and the settlement leg parks the declaration beside the group", async (t) => {
  if (skipAf2(t, live)) return;
  const client = await freshAf2Client("park");
  const sub = world.users.alice;
  const cp = await birthCounterparty(sub, { client, name: `X42 PARKCO ${Date.now().toString(36)}`, kind: "customer" });
  const { line, period } = await bankLine(sub, { client, amountCents: HIGH_STAKES_CENTS, description: "x42 large deposit" });
  const inv = await stampedItem(sub, {
    client, domain: "ar", cp, cpKind: "customer", cents: HIGH_STAKES_CENTS, control: AR1,
    postingDate: period.mid, checker: world.users.bob,
  });
  const ex = await openException(sub, { client, line: line.id, reason: "x42 park: a large unidentified deposit" });
  const allocations = [{ item_id: inv.item, amount_cents: HIGH_STAKES_CENTS }];
  const before = await entryCountOf(client);

  // p_draft and p_allocations are MUTUALLY EXCLUSIVE at argument time on both
  // branches — two bookings for one statement line — so the hand-draft ancillary
  // is probed WITHOUT p_allocations, which is the only way the design's
  // high-stakes wall is the one the call actually meets. The draft is stated at
  // the LINE's own (high-stakes) amount, because "the settlement leg ONLY"
  // (design §4 / WDB-G9) is a statement about a HIGH-STAKES act: a small
  // hand-draft on a large line is refused for failing to tie, which is a
  // different law and would prove nothing here.
  const ancillaries = [
    ["p_draft", {
      draft: {
        posting_date: period.mid, memo: "x42 park ancillary",
        lines: [
          { account_code: BANKCOA, debit_cents: HIGH_STAKES_CENTS, credit_cents: 0, description: "dr" },
          { account_code: REVN, debit_cents: 0, credit_cents: HIGH_STAKES_CENTS, description: "cr" },
        ],
      },
    }, { withAllocations: false }],
    ["p_adjustments", { adjustments: [{ account_code: ADJX, amount_cents: -1_000, memo: "x42 park ancillary" }] }],
    ["p_charge_cents + p_charge_account", { chargeCents: 1_000, chargeAccount: CHARGEX }],
  ];
  for (const [label, extra, opts] of ancillaries) {
    await refusesWithCode(
      () => resolveAndBookBankLine(sub, {
        client, exception: ex, disposition: "matched_booking", note: `x42 park ancillary ${label}`,
        ...(opts?.withAllocations === false ? {} : { allocations }), ...extra,
        opKey: opk("x42-park-anc"),
      }),
      CLR10, T.pendingAncillary,
      `x42.af2-8 the park refuses ${label}`,
    );
    await assertUntouched(client, { exception: ex, line: line.id, entryCountBefore: before },
      `x42.af2-8 after the ${label} refusal`);
  }

  // p_advance_applications is the FOURTH design-§4 ancillary, and it is refused
  // on this branch too — but by a STRICTLY EARLIER, more specific wall: the
  // payload names `line_no` positions inside `p_draft.lines` (ABI §A), so naming
  // it against an open-item settlement is refused `booking_request_invalid`
  // (axis advance_payload_without_draft) at argument time, on both branches. The
  // design's park token is still what a caller who names it WITH a high-stakes
  // hand-draft meets — that path is the p_draft probe above. Asserted here as
  // the named refusal it actually is, so the wall is covered rather than assumed.
  const advErr = await caught(() => resolveAndBookBankLine(sub, {
    client, exception: ex, disposition: "matched_booking", note: "x42 park ancillary p_advance_applications",
    allocations, advanceApplications: { kind: "claim", reason: "x42 park ancillary", allocations: [] },
    opKey: opk("x42-park-anc"),
  }));
  assert.ok(advErr, "a staff-advance payload on the settlement leg must be refused");
  assert.equal(advErr.code, CLR10, `…as a CLR10 refusal (got ${advErr.code} — ${advErr.message})`);
  assert.equal(reasonOf(advErr), "booking_request_invalid",
    `…named by its own token (got '${reasonOf(advErr) ?? "(none)"}' — ${advErr.message})`);
  assert.ok(`${advErr.detail ?? ""}`.includes("advance_payload_without_draft"),
    `…on the advance_payload_without_draft axis (got detail=${advErr.detail ?? "(none)"})`);
  await assertUntouched(client, { exception: ex, line: line.id, entryCountBefore: before },
    "x42.af2-8 after the p_advance_applications refusal");

  const note = "x42 park: this is the ABC deposit, book it against their invoice";
  const receipt = await resolveAndBookBankLine(sub, {
    client, exception: ex, disposition: "matched_booking", note, allocations, opKey: opk("x42-park"),
  });
  assertEnvelope(receipt, { exception: ex, branch: "pending" }, "x42.af2-8 park");
  const match = matchIdOf(receipt);
  const decl = await parkedDeclarationOf(match);
  assert.equal(decl.status, "pending", "at high stakes the group is the WCA-R7 PENDING reservation");
  assertDeclarationShape(decl, { exception: ex, disposition: "matched_booking", note, declaredBy: sub },
    "x42.af2-8 the parked declaration");
  assert.equal((await lineGroupStatus(line.id))[0], "pending",
    "the line is owned the moment the owner acts — no unmatched interval opens");
  const exRow = await exceptionRow(ex);
  assert.equal(exRow.status, "open",
    "the exception is STILL OPEN: the declaration RIDES the group; the bookkeeper's flip executes it (WDB-G9)");
  assert.equal(exRow.resolution_disposition, null, "…and it carries no resolution stamps yet");
  assert.equal(await entryStatusOf(receipt.entry_id), "draft",
    "the settlement itself is a draft awaiting its checker");
});

// ===========================================================================
// x42.af2-9 — THE `pending_resolution` CHECK. A declaration is a PENDING-only
// object: a live (or unmatched) group may never carry one. The CHECK is the
// declarative half of that law, and it is probed the only way it can be — at
// the table, because no audited verb can even attempt the breach.
// ===========================================================================
test("x42.af2-9 pending_resolution is admissible ONLY while the group is pending (the table CHECK)", async (t) => {
  if (skipAf2(t, live)) return;
  const client = await freshAf2Client("check");
  const sub = world.users.alice;
  const { line, period } = await bankLine(sub, { client, amountCents: 20_000, description: "x42 check probe" });
  const ex = await openException(sub, { client, line: line.id, reason: "x42 CHECK probe" });
  const receipt = await resolveAndBookBankLine(sub, {
    client, exception: ex, disposition: "matched_booking", note: "x42 CHECK probe booking",
    draft: {
      posting_date: period.mid, memo: "x42 check probe",
      lines: [
        { account_code: BANKCOA, debit_cents: 20_000, credit_cents: 0, description: "dr" },
        { account_code: REVN, debit_cents: 0, credit_cents: 20_000, description: "cr" },
      ],
    },
    opKey: opk("x42-check"),
  });
  const match = matchIdOf(receipt);
  assert.equal((await matchRow(match)).status, "live", "mandatory setup: the group is LIVE");

  // ROOT, deliberately: no audited verb can write a declaration onto a live
  // group, which is exactly why the CHECK — not a verb guard — is the law here.
  const err = await caught(() => rootQuery(
    `update clara.bank_matches set pending_resolution = jsonb_build_object(
        'exception_id', $2::uuid, 'disposition', 'matched_booking', 'note', 'forged',
        'declared_by', $3::uuid, 'declared_at', now())
      where id = $1`,
    [match, ex, sub],
  ));
  assert.ok(err, "a declaration on a LIVE group must be refused by the table itself");
  assert.equal(err.code, "23514", `…as a CHECK violation (got ${err.code} — ${err.message})`);
});

// ===========================================================================
// x42.af2-10 — THE EXCEPTIONS SURFACE BADGES A PARKED RESOLUTION (design §4).
// A human looking at the exception must be able to tell "still open, nobody has
// touched it" apart from "an owner has declared its resolution and a checker is
// holding the money" — the difference is a whole professional judgement.
// ===========================================================================
test("x42.af2-10 the exceptions surface badges 'resolution parked' for an exception whose declaration rides a pending group", async (t) => {
  if (skipAf2(t, live)) return;
  const client = await freshAf2Client("badge");
  const sub = world.users.alice;
  const parked = await parkHighStakes({
    client, owner: sub, checker: world.users.bob,
    note: "x42 badge: declared, awaiting the checker", description: "x42 badge deposit",
  });

  const found = await parkedBadgeFor(sub, { client, statement: parked.statement, exception: parked.exception });
  assert.ok(found.source,
    "the parked exception is rendered by a live read RPC (list_bank_line_exceptions, or the reconciliation preview's exceptions[])");
  noteLane(`x42.af2-10: the parked exception is rendered by ${found.source}`);
  const key = parkedBadgeKey(found.row);
  assert.ok(key, `…and that row BADGES the parked resolution (got keys ${Object.keys(found.row).join(",")})`);
  noteLane(`x42.af2-10: the parked badge rides the '${key}' datum`);

  // THE CONTROL. An ordinary OPEN exception on another line of the same client
  // must NOT badge parked — a badge that fires on everything says nothing.
  const plain = await bankLine(sub, { client, amountCents: 15_000, description: "x42 badge control" });
  const exPlain = await openException(sub, { client, line: plain.line.id, reason: "x42 badge: ordinary open" });
  const control = await parkedBadgeFor(sub, { client, statement: plain.statement, exception: exPlain });
  if (control.source) {
    assert.equal(parkedBadgeKey(control.row), null,
      "an ordinary OPEN exception carries NO parked badge — the badge discriminates");
  } else {
    noteLane("x42.af2-10: the ordinary control exception is rendered by no read RPC — the discrimination half is UNASSERTED (finding)");
  }
});

// ===========================================================================
// x42.af2-11 — THE ACCIDENTAL-GUARD CELL (design §4). A direct
// `resolve_bank_line_exception` on a PARKED line is still refused
// `disposition_unbooked` by the inherited 0040 belt: the parked group is
// PENDING, and a pending reservation is not a booking. The seven-site admission
// widened the belt for the composite's own act, never for the direct verb.
// ===========================================================================
test("x42.af2-11 a direct resolve on a PARKED line still refuses disposition_unbooked (the 0040 belt, inherited)", async (t) => {
  if (skipAf2(t, live)) return;
  const client = await freshAf2Client("parkedresolve");
  const sub = world.users.alice;
  const parked = await parkHighStakes({
    client, owner: sub, checker: world.users.bob,
    note: "x42 parked-resolve: declared", description: "x42 parked-resolve deposit",
  });

  await refuses(
    () => resolveException(sub, {
      client, exception: parked.exception, disposition: "matched_booking",
      note: "x42 parked-resolve: trying to close it by hand while the money is still reserved",
      opKey: opk("x42-pr-direct"),
    }),
    T.dispositionUnbooked,
    "x42.af2-11 a direct resolve while the booking is only RESERVED",
  );
  assert.equal((await exceptionRow(parked.exception)).status, "open",
    "the exception survives the refused direct resolve");
  assert.equal((await parkedDeclarationOf(parked.match)).resolutionExceptionId, parked.exception,
    "…and the declaration still rides the group");
});

// ===========================================================================
// x42.af2-12 — THE PARKED-CANCEL DRILL (design §4, site 7). Cancelling the
// reservation withdraws the draft and CLEARS the declaration — but LEAVES
// `resolution_exception_id` intact, because the id is the record of which
// exception this group was ever about, and the exception itself is simply still
// OPEN, exactly as it was before the owner declared anything.
// ===========================================================================
test("x42.af2-12 parked cancel: the declaration is CLEARED, resolution_exception_id is left INTACT, the exception stays OPEN and the draft is withdrawn", async (t) => {
  if (skipAf2(t, live)) return;
  const client = await freshAf2Client("parkcancel");
  const sub = world.users.alice;
  const parked = await parkHighStakes({
    client, owner: sub, checker: world.users.bob,
    note: "x42 cancel: declared, then thought better of it", description: "x42 cancel deposit",
  });

  const cancel = await unmatchBankMatch(world.users.bob, {
    client, match: parked.match, reason: "x42 cancel: the deposit is not this customer's after all",
    opKey: opk("x42-parkcancel"),
  });
  assert.equal(cancel.status, "unmatched", "the reservation is cancelled");
  assert.equal(cancel.draft_withdrawn, true,
    "the anchored settlement draft is withdrawn in the SAME transaction (the C-b pair-closes law)");
  assert.equal(await entryStatusOf(parked.receipt.entry_id), "withdrawn", "…and the entry really is withdrawn");

  const after = await parkedDeclarationOf(parked.match);
  assert.equal(after.status, "unmatched", "the group is unmatched");
  assert.equal(after.pendingResolution, null,
    "the DECLARATION is cleared: a cancelled group must never carry a live account of an owner act");
  assert.equal(after.resolutionExceptionId, parked.exception,
    "…but resolution_exception_id is LEFT INTACT — the cancel leaves the id (design §4, site 7)");

  const exRow = await exceptionRow(parked.exception);
  assert.equal(exRow.status, "open", "the exception is STILL OPEN on the member line — nothing was ever resolved");
  for (const col of RESOLUTION_COLUMNS) {
    assert.equal(exRow[col], null, `…and carries no ${col} stamp`);
  }
  assert.equal((await lineGroupStatus(parked.line.id)).length, 0,
    "the line is released — it carries no pending or live group");
});

// ===========================================================================
// x42.af2-13 — THE FLIP (WDB-G9). `complete_pending_match` re-reads the parked
// exception FOR UPDATE and EXECUTES the declaration: the exception resolves with
// `resolved_by` = the DECLARANT (never the flipper — the owner made the
// judgement, the bookkeeper only released the reservation), the declaration is
// cleared in the flip UPDATE, and the flipper floor is bookkeeper+.
// ===========================================================================
test("x42.af2-13 the flip: a BOOKKEEPER completes the reservation, the exception resolves with resolved_by = the DECLARANT, and pending_resolution is cleared", async (t) => {
  if (skipAf2(t, live)) return;
  const client = await freshAf2Client("flip");
  const owner = world.users.alice;
  const parked = await parkHighStakes({
    client, owner, checker: world.users.bob,
    note: "x42 flip: this is the ABC deposit", description: "x42 flip deposit",
  });

  // The checker approves the settlement through the ORDINARY /queue verb — the
  // CLR05 law is untouched by AF-2 (the maker is the owner, the checker is bob).
  const draft = await entryRowOf(parked.receipt.entry_id);
  await approveEntry(world.users.bob, {
    entry: parked.receipt.entry_id, expectedRevision: draft.revision_token, opKey: opk("x42-flip-approve"),
  });

  const flipped = await completePendingMatch(world.users.bob, {
    client, match: parked.match, opKey: opk("x42-flip"),
  });
  assert.equal(flipped.status, "live", "pending -> live");
  await assertGroupTies(parked.match, "x42.af2-13 the flipped group");

  const after = await parkedDeclarationOf(parked.match);
  assert.equal(after.pendingResolution, null,
    "pending_resolution is cleared IN THE FLIP UPDATE — a live group never carries a stale declaration");
  assert.equal(after.resolutionExceptionId, parked.exception,
    "…while resolution_exception_id survives the flip: it is what the later reopen reads");

  const exRow = await exceptionRow(parked.exception);
  assert.equal(exRow.status, "resolved", "the flip EXECUTES the declaration — the exception resolves");
  assert.equal(exRow.resolution_disposition, "matched_booking", "…under the DECLARED disposition");
  assert.equal(exRow.resolution_note, parked.note, "…with the DECLARED note, verbatim");
  assert.equal(exRow.resolved_by, owner,
    "…and resolved_by is the DECLARANT (the owner), NOT the bookkeeper who flipped it (WDB-G9)");
  assert.notEqual(exRow.resolved_by, world.users.bob, "the flipper is not recorded as the resolver");
});

// ===========================================================================
// x42.af2-13b — THE STALE-DECLARATION WALL. The flip re-reads the exception FOR
// UPDATE and re-checks the declaration it is about to execute: a declaration
// that no longer describes the exception it names is refused
// `pending_resolution_stale` rather than executed. No audited verb can mutate a
// declaration — that is the point — so the mutation is FORCED at the table (the
// x37/x40 forge precedent), which is precisely the shape the wall exists for.
// ===========================================================================
test("x42.af2-13b the flip refuses a STALE / mutated declaration with pending_resolution_stale, and leaves the reservation pending", async (t) => {
  if (skipAf2(t, live)) return;
  const client = await freshAf2Client("stale");
  const owner = world.users.alice;
  const parked = await parkHighStakes({
    client, owner, checker: world.users.bob,
    note: "x42 stale: the original declaration", description: "x42 stale deposit",
  });
  const draft = await entryRowOf(parked.receipt.entry_id);
  await approveEntry(world.users.bob, {
    entry: parked.receipt.entry_id, expectedRevision: draft.revision_token, opKey: opk("x42-stale-approve"),
  });

  // FORCED STATE (root): re-point the declaration at an exception it does not
  // describe. Every lawful writer of pending_resolution writes it once, in the
  // creating transaction, so this state is unreachable through the verbs.
  const other = await bankLine(owner, { client, amountCents: 11_000, description: "x42 stale decoy" });
  const decoy = await openException(owner, { client, line: other.line.id, reason: "x42 stale decoy exception" });
  await rootQuery(
    "update clara.bank_matches set pending_resolution = jsonb_set(pending_resolution, '{exception_id}', to_jsonb($2::text)) where id = $1",
    [parked.match, decoy],
  );

  await refusesWithCode(
    () => completePendingMatch(world.users.bob, { client, match: parked.match, opKey: opk("x42-stale-flip") }),
    CLR10, T.pendingResolutionStale,
    "x42.af2-13b the flip refuses a declaration that no longer describes its exception",
  );
  assert.equal((await matchRow(parked.match)).status, "pending",
    "the refused flip leaves the reservation PENDING — nothing half-executed");
  assert.equal((await exceptionRow(parked.exception)).status, "open",
    "…and the originally-declared exception is still open");
  assert.equal((await exceptionRow(decoy)).status, "open",
    "…and the decoy exception was never touched either");
});

// ===========================================================================
// x42.af2-13c — THE FLIPPER FLOOR IS bookkeeper+ (WDB-G9). The owner declares;
// anyone from bookkeeper up may execute. A VIEWER may not.
// ===========================================================================
test("x42.af2-13c the flipper floor is bookkeeper+: a viewer is refused, a second bookkeeper (grace) may flip", async (t) => {
  if (skipAf2(t, live)) return;
  const client = await freshAf2Client("flipfloor");
  const owner = world.users.alice;
  const parked = await parkHighStakes({
    client, owner, checker: world.users.bob,
    note: "x42 flip floor: declared", description: "x42 flip-floor deposit",
  });
  const draft = await entryRowOf(parked.receipt.entry_id);
  await approveEntry(world.users.bob, {
    entry: parked.receipt.entry_id, expectedRevision: draft.revision_token, opKey: opk("x42-ff-approve"),
  });

  const denied = await caught(() => completePendingMatch(world.users.carol, {
    client, match: parked.match, opKey: opk("x42-ff-viewer"),
  }));
  assert.ok(denied, "a VIEWER must not be able to execute an owner's declared resolution");
  assert.equal(denied.code, "CLR04", `…refused at the role floor (got ${denied.code} — ${denied.message})`);
  assert.equal((await matchRow(parked.match)).status, "pending", "the reservation survives the refused flip");

  const flipped = await completePendingMatch(world.users.grace, {
    client, match: parked.match, opKey: opk("x42-ff-grace"),
  });
  assert.equal(flipped.status, "live", "a bookkeeper who is neither the declarant nor the approver may flip");
  assert.equal((await exceptionRow(parked.exception)).resolved_by, owner,
    "…and the resolution is still attributed to the DECLARANT");
  assert.equal((await groupsOfLine(parked.line.id)).length, 1, "the line rides exactly one group throughout");
});
