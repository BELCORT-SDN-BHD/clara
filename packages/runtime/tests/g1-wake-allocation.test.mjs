// 裁-44 / FOLD-1 — THE CONSTRAINT-2 CELLS for bankAgent_v1's match allocation.
//
// WHAT THIS FILE IS ABOUT, in one sentence: no numeral the MODEL produced may reach
// clara.bank_match_entry_members, and the way this lane keeps that promise is that the tool schema
// has no place to put one.
//
// THE DEFECT IT CLOSES, measured against 0121 rather than reasoned about. The match verb's rung
// ladder checks the AGGREGATE tie (`v_line_cents <> v_entry_cents + v_adj_cents`, :5897), each
// entry's OWN remaining capacity (:5955-5967), and single-entry ambiguity against the aggregate
// (:5911-5918). A 10,000-cent line split 4,999 + 5,001 across two entries that each have spare
// capacity passes ALL THREE, and the delegate persists the submitted values verbatim. That is a
// model-generated numeral in a client's books.
//
// These cells are PURE — no rig, no pool, no credential, no model. The end-to-end proof that the
// derived amounts are actually ADMITTED by the database is G1B-BANK-E3 in g1-wake-bank-e2e.test.mjs;
// what lives here is the judgement itself, driven directly across every branch it has.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const { register } = await import("tsx/esm/api");
register();

const pack = await import("../workflows/bankAgent.v1.pack.ts");
const tools = await import("../workflows/bankAgent.v1.tools.ts");
const closeTools = await import("../workflows/closePrep.v1.tools.ts");
const closePrompt = await import("../workflows/closePrep.v1.prompt.ts");

/** Build a pack view the way the DB's own reply would produce one, through the SHIPPING reader —
 *  never by hand-constructing the Maps, which would let readPackView rot untested. Throws on a
 *  parse failure so a fixture that stopped being valid cannot quietly become an empty pack. */
const viewOf = (lines, candidates) => {
  const parsed = pack.readPackView({ digest: "d".repeat(64), lines, candidates });
  assert.equal(parsed.ok, true, `fixture pack must parse — ${parsed.reason ?? ""} ${parsed.detail ?? ""}`);
  return parsed.view;
};

const line = (id, cents, description = "line text") => ({ line_id: id, amount_cents: cents, description });
const cand = (id, dr, cr) => ({ entry_id: id, debit_remaining_cents: dr, credit_remaining_cents: cr });

test("G1B-ALLOC-1 the match tool's schema has NO PLACE FOR AN AMOUNT — the 4,999+5,001 split is inexpressible", async () => {
  // THE HEADLINE, and it is a structural claim rather than a behavioural one on purpose: a rule
  // the model is told to follow is a suggestion; a field that does not exist is a wall. Driven
  // through the SHIPPING tool set's own schema, not through a copy of it.
  const built = tools.buildBankAgentTools(
    { taskId: randomUUID(), firmId: randomUUID(), clientId: randomUUID(), bankAccountId: randomUUID(), dueReason: null },
    "gpt-5.6-terra",
    pack.newBankRunRecord("cell"),
  );
  const schema = built.match_bank_line.inputSchema;
  const lineId = randomUUID();
  const entryId = randomUUID();

  const withAmount = schema.safeParse({
    lines: [lineId],
    entries: [{ entry_id: entryId, matched_cents: 5001 }],
    rationale: "the shape that used to be accepted",
  });
  assert.equal(withAmount.success, false, "the OLD shape — an entry object carrying matched_cents — must no longer parse at all");

  const bareIds = schema.safeParse({ lines: [lineId], entries: [entryId], rationale: "the shape this lane now speaks" });
  assert.equal(bareIds.success, true, `bare entry ids must parse — got ${JSON.stringify(bareIds.error?.issues)?.slice(0, 300)}`);

  // The positive control on the instrument: safeParse is genuinely evaluating this schema and not
  // simply refusing everything.
  assert.equal(schema.safeParse({ lines: [], entries: [entryId], rationale: "x" }).success, false, "an empty line list is still refused");
});

test("G1B-ALLOC-2 the allocation is DERIVED from the pack — one entry settles up to its capacity, several settle in full", async () => {
  const l = randomUUID();
  const e1 = randomUUID();
  const e2 = randomUUID();

  // (a) SINGLE ENTRY, capacity larger than the line: the line settles in FULL and the entry is
  // partly consumed. min(line, capacity) — the ruling's own rule.
  const spare = viewOf([line(l, 10000)], [cand(e1, 25000, 0)]);
  const a = pack.deriveMatchAllocation(spare, [l], [e1]);
  assert.equal(a.ok, true);
  assert.deepEqual(a.entries, [{ entry_id: e1, matched_cents: 10000 }], "the line's own amount, taken from the pack");

  // (b) SINGLE ENTRY, capacity SMALLER than the line: the derived amount is the capacity, which
  // cannot tie — and that verdict belongs to the DATABASE (tie_nonzero), not to this function.
  const short = viewOf([line(l, 10000)], [cand(e1, 7000, 0)]);
  const b = pack.deriveMatchAllocation(short, [l], [e1]);
  assert.equal(b.ok, true, "still derived, still sent — the DB is the court for a tie");
  assert.deepEqual(b.entries, [{ entry_id: e1, matched_cents: 7000 }]);

  // (c) TWO ENTRIES whose FULL capacities add up to the line: admitted, each at its own capacity.
  const pair = viewOf([line(l, 10000)], [cand(e1, 4000, 0), cand(e2, 6000, 0)]);
  const c = pack.deriveMatchAllocation(pair, [l], [e1, e2]);
  assert.equal(c.ok, true);
  assert.deepEqual(
    c.entries.slice().sort((x, y) => x.entry_id.localeCompare(y.entry_id)),
    [{ entry_id: e1, matched_cents: 4000 }, { entry_id: e2, matched_cents: 6000 }].sort((x, y) => x.entry_id.localeCompare(y.entry_id)),
    "every selected entry contributes its FULL remaining capacity",
  );

  // (d) THE ATTACK ITSELF. Two entries with spare capacity against one 10,000 line: under the old
  // schema the model chose 4,999 + 5,001 and every rung passed. There is now no split to choose,
  // and the full capacities do not tie, so the tool refuses LOCALLY and sends nothing.
  const spareBoth = viewOf([line(l, 10000)], [cand(e1, 25000, 0), cand(e2, 25000, 0)]);
  const d = pack.deriveMatchAllocation(spareBoth, [l], [e1, e2]);
  assert.equal(d.ok, false, "a multi-entry set that does not add up is refused before the database sees it");
  assert.equal(d.reason, "entries_do_not_tie");
  assert.match(d.detail, /propose an exception/, "and the model is pointed at the door a human answers");

  // (e) NEGATIVE LINES take CREDIT capacity, and the sign convention is the estate's: matched_cents
  // is the signed effect on the BANK account.
  const outflow = viewOf([line(l, -8000)], [cand(e1, 0, 8000)]);
  const e = pack.deriveMatchAllocation(outflow, [l], [e1]);
  assert.equal(e.ok, true);
  assert.deepEqual(e.entries, [{ entry_id: e1, matched_cents: -8000 }], "money out settles against credit capacity, negative");
  // The same entry against an INFLOW has zero debit capacity, so it is refused rather than sent
  // with a zero amount (which 0121:1940 refuses as entries_malformed anyway).
  const wrongSide = viewOf([line(l, 8000)], [cand(e1, 0, 8000)]);
  assert.equal(pack.deriveMatchAllocation(wrongSide, [l], [e1]).reason, "entry_has_no_capacity");
});

test("G1B-ALLOC-3 裁-44 FOLD-4 — nothing outside the pack THIS run read can be named", async () => {
  const l = randomUUID();
  const e1 = randomUUID();
  const view = viewOf([line(l, 10000)], [cand(e1, 10000, 0)]);

  // A LINE FROM ANOTHER ACCOUNT. 0129's digest binding is task+client-scoped, never account-scoped
  // (:1048), so two accounts under one client share a client and a line from account B would ride
  // account A's digest straight through. The pack's own line set is account-scoped (0121:5725).
  const foreignLine = pack.deriveMatchAllocation(view, [randomUUID()], [e1]);
  assert.equal(foreignLine.ok, false);
  assert.equal(foreignLine.reason, "line_not_in_pack");

  // AN ENTRY THE PACK NEVER OFFERED. Without this the tool would have no capacity to read and
  // would have to either guess or send nothing — absence is not evidence (review law 2).
  const foreignEntry = pack.deriveMatchAllocation(view, [l], [randomUUID()]);
  assert.equal(foreignEntry.ok, false);
  assert.equal(foreignEntry.reason, "entry_not_in_pack");

  // THE POSITIVE CONTROL: the same shapes with the pack's own ids are admitted, so the two
  // refusals above are the binding speaking and not a broken derivation.
  assert.equal(pack.deriveMatchAllocation(view, [l], [e1]).ok, true);

  // Degenerate inputs fail closed with their own tokens rather than falling through to a send.
  assert.equal(pack.deriveMatchAllocation(view, [], [e1]).reason, "no_lines");
  assert.equal(pack.deriveMatchAllocation(view, [l], []).reason, "no_entries");
  const zeroNet = viewOf([line(l, 0)], [cand(e1, 10000, 0)]);
  assert.equal(pack.deriveMatchAllocation(zeroNet, [l], [e1]).reason, "lines_net_to_zero");
});

test("G1B-PROSE-1 裁-44 FOLD-7 — every prose field the model writes is CAPPED, and a fiscal-year label is a name rather than an essay", async () => {
  // THE FINDING: model prose reaches durable columns with only a non-blank guard. The receipt
  // rationale on both lanes IS capped by the database (0121:4375, 0138:362, both `length(...)
  // <= 4000`), but clara.bank_agent_proposals.rationale (0121:4425), the proposal payload's reason
  // and identifier value, clara.close_proposals.narrative and .drafted[].text, and
  // clara.close_runs.end_reason all take whatever they are given. clara.fiscal_years.label is the
  // sharpest of them (0056:236, display-only, non-blank) because every human surface renders it
  // inline. These are not new numeric-book paths, but they permit persistent injected content —
  // and for an abandonment, the prose ACCOMPANIES a state-changing act.
  //
  // The cap is the client-side half this PR can ship without a migration; the DB-side CHECKs and a
  // structured abandonment-code roster are booked as G1 PR-2 / the 裁-44 DB pass.
  const uuid = () => randomUUID();
  const bank = tools.buildBankAgentTools(
    { taskId: uuid(), firmId: uuid(), clientId: uuid(), bankAccountId: uuid(), dueReason: null },
    "gpt-5.6-terra",
    pack.newBankRunRecord("cell"),
  );
  const close = closeTools.buildClosePrepTools({ taskId: uuid(), firmId: uuid(), clientId: uuid() }, "gpt-5.6-terra", closeTools.newCloseRunRecord());

  const PROSE = tools.BANK_PROSE_MAX;
  assert.equal(PROSE, closePrompt.CLOSE_PROSE_MAX, "both lanes carry the SAME house limit — one number, stated once per closure");
  assert.equal(PROSE, 4000, "and it is the database's own number where one exists (0121:4375 / 0138:362)");
  const LABEL = closePrompt.CLOSE_FY_LABEL_MAX;

  const drafted = [{ check_key: "unposted_entries", item_key: "je-1", text: "attested" }];
  const cases = [
    [bank.get_bank_pack, { rationale: "r" }, "rationale", PROSE],
    [bank.match_bank_line, { lines: [uuid()], entries: [uuid()], rationale: "r" }, "rationale", PROSE],
    [bank.propose_line_exception, { line_id: uuid(), kind: "bank_error", reason: "r", rationale: "r" }, "reason", PROSE],
    [bank.propose_line_exception, { line_id: uuid(), kind: "bank_error", reason: "r", rationale: "r" }, "rationale", PROSE],
    [bank.propose_identifier_promotion, { counterparty_id: uuid(), identifier_kind: "tin", identifier_value: "v", rationale: "r" }, "identifier_value", PROSE],
    // 裁-44 R2 / FOLD-11 — this rationale's cap is the house cap MINUS the budget reserved for
    // the derived-sightings note the tool appends, so the composed string can never exceed the
    // database's own 4000. Asserted at its real value rather than the shared one.
    [bank.propose_identifier_promotion, { counterparty_id: uuid(), identifier_kind: "tin", identifier_value: "v", rationale: "r" }, "rationale", PROSE - 64],
    [close.list_fiscal_years, { rationale: "r" }, "rationale", PROSE],
    [close.get_close_plan, { fiscal_year_id: uuid(), rationale: "r" }, "rationale", PROSE],
    [close.begin_close, { fiscal_year_id: uuid(), rationale: "r" }, "rationale", PROSE],
    [close.abandon_close, { close_run_id: uuid(), reason: "r", rationale: "r" }, "reason", PROSE],
    [close.propose_close, { close_run_id: uuid(), drafted, narrative: "n", rationale: "r" }, "narrative", PROSE],
    [close.open_fiscal_year, { label: "FY2026", starts_on: "2026-01-01", rationale: "r" }, "label", LABEL],
    [close.open_fiscal_year, { label: "FY2026", starts_on: "2026-01-01", rationale: "r" }, "rationale", PROSE],
    [close.run_depreciation_catchup, { through: "2026-01-31", rationale: "r" }, "rationale", PROSE],
    [close.mint_month_snapshot, { month_start: "2026-01-01", rationale: "r" }, "rationale", PROSE],
  ];

  for (const [tool, base, field, max] of cases) {
    // AT the cap parses; ONE over does not. Both directions, because a cell that only proved the
    // refusal would pass just as happily against a schema that refused everything.
    const at = tool.inputSchema.safeParse({ ...base, [field]: "x".repeat(max) });
    assert.equal(at.success, true, `${field} at ${max} must parse — ${JSON.stringify(at.error?.issues)?.slice(0, 200)}`);
    const over = tool.inputSchema.safeParse({ ...base, [field]: "x".repeat(max + 1) });
    assert.equal(over.success, false, `${field} at ${max + 1} must be REFUSED — it reaches a durable column with no length guard of its own`);
  }

  // THE FY LABEL IS THE ONE WORTH ASSERTING SEPARATELY: it is capped an order of magnitude tighter
  // than prose, because it is a NAME. A 4,000-character label would parse under the house limit.
  assert.equal(LABEL, 120);
  assert.equal(close.open_fiscal_year.inputSchema.safeParse({ label: "x".repeat(PROSE), starts_on: "2026-01-01", rationale: "r" }).success, false,
    "a prose-length label is refused — the label cap is not merely the house cap by another name");

  // The drafted[] elements carry their own caps: the two KEYS are identifiers echoed back from
  // get_close_readiness, the attestation TEXT is prose.
  const longKey = [{ check_key: "x".repeat(LABEL + 1), item_key: "je-1", text: "t" }];
  const longText = [{ check_key: "k", item_key: "je-1", text: "x".repeat(PROSE + 1) }];
  const proposeBase = { close_run_id: uuid(), narrative: "n", rationale: "r" };
  assert.equal(close.propose_close.inputSchema.safeParse({ ...proposeBase, drafted: longKey }).success, false, "an over-long check_key is refused");
  assert.equal(close.propose_close.inputSchema.safeParse({ ...proposeBase, drafted: longText }).success, false, "and so is an over-long attestation");
  assert.equal(close.propose_close.inputSchema.safeParse({ ...proposeBase, drafted }).success, true, "the positive control: a real attestation still parses");
});

test("G1B-ALLOC-4 裁-44 R2 / FOLD-12 — a pack this parser cannot fully account for FAILS; it never becomes an authoritative empty one", async () => {
  // THE DEFECT THIS CELL USED TO BLESS. The earlier reader accepted `{digest}` as a pack with
  // empty arrays and turned a missing or malformed cents value into ZERO. Both are absence as
  // evidence (review law 2), and the consequence was worse than a wrong refusal: the run ARMED
  // itself on a corrupt reply, every write was refused for "not in the pack", and the task settled
  // `nothing_due` — a corrupt read reported as a quiet night. The cell asserted that behaviour.
  const D = "a".repeat(64);
  const id = randomUUID();
  const bad = (reply, reason) => {
    const r = pack.readPackView(reply);
    assert.equal(r.ok, false, `must FAIL: ${reason} — got ${JSON.stringify(r).slice(0, 200)}`);
    assert.equal(r.reason, reason, `and by NAME, so the failure is diagnosable`);
    return r;
  };

  bad(null, "pack_not_object");
  bad("a string", "pack_not_object");
  bad({ lines: [], candidates: [] }, "no_digest");
  bad({ digest: "", lines: [], candidates: [] }, "no_digest");
  // DIGEST-ONLY is the shape the old reader called an empty pack. It is a reply missing both of
  // the arrays the verb ALWAYS builds (coalesce(jsonb_agg(...), '[]'), 0121:5715/:5736), so it is
  // not this verb's reply at all.
  bad({ digest: D }, "lines_not_array");
  bad({ digest: D, lines: [] }, "candidates_not_array");
  bad({ digest: D, lines: {}, candidates: [] }, "lines_not_array");

  // A MALFORMED *LINE* AMOUNT, specifically — the sharper half. A zeroed capacity only refuses a
  // write; a zeroed LINE amount silently CHANGES a multi-line allocation's total, so the
  // derivation would tie against a number the books never carried.
  bad({ digest: D, lines: [{ line_id: id }], candidates: [] }, "line_cents_unrepresentable");
  bad({ digest: D, lines: [{ line_id: id, amount_cents: null }], candidates: [] }, "line_cents_unrepresentable");
  bad({ digest: D, lines: [{ line_id: id, amount_cents: "1 000" }], candidates: [] }, "line_cents_unrepresentable");
  bad({ digest: D, lines: [{ line_id: id, amount_cents: 10.5 }], candidates: [] }, "line_cents_unrepresentable");
  bad({ digest: D, lines: [{ line_id: "not-a-uuid", amount_cents: 1 }], candidates: [] }, "line_id_malformed");
  bad({ digest: D, lines: [{ line_id: id, amount_cents: 1, description: 42 }], candidates: [] }, "line_description_malformed");
  bad({ digest: D, lines: [], candidates: [{ entry_id: id }] }, "capacity_unrepresentable");
  bad({ digest: D, lines: [], candidates: [{ entry_id: id, debit_remaining_cents: 1 }] }, "capacity_unrepresentable");
  bad({ digest: D, lines: [], candidates: [{ entry_id: "x", debit_remaining_cents: 1, credit_remaining_cents: 0 }] }, "entry_id_malformed");

  // THE POSITIVE CONTROL, and it is the distinction the whole ruling turns on: an EXPLICITLY
  // EMPTY pack is a perfectly good pack — an account with nothing unmatched — and must parse.
  const empty = pack.readPackView({ digest: D, lines: [], candidates: [] });
  assert.equal(empty.ok, true, "explicit empty arrays are a REAL pack, not a malformed one");
  assert.equal(empty.view.lineCents.size, 0);
  assert.equal(empty.view.entryCaps.size, 0);

  // A NULL description is a real state of the books (bank_statement_lines.description is NULLABLE,
  // 0038:546) and becomes empty text rather than a failure.
  const nulled = pack.readPackView({ digest: D, lines: [{ line_id: id, amount_cents: 5, description: null }], candidates: [] });
  assert.equal(nulled.ok, true, "a line with no printed narrative is lawful");
  assert.equal(nulled.view.lineText.get(id), "", "and carries no text to match an identifier against");

  // UPPERCASE IDS FROM A MODEL MUST STILL RESOLVE (S3's own lesson, one level down): the DB renders
  // every uuid lowercase, and two spellings of one id must not be two subjects.
  const upper = randomUUID().toUpperCase();
  const v = viewOf([line(upper.toLowerCase(), 500)], [cand(upper.toLowerCase(), 500, 0)]);
  const out = pack.deriveMatchAllocation(v, [upper], [upper]);
  assert.equal(out.ok, true, "an uppercase spelling of a pack id still resolves");
  assert.equal(out.entries[0].matched_cents, 500);
});

test("G1B-ALLOC-5 裁-44 R2 / FOLD-10 — a cents value this process cannot carry exactly is refused, not rounded", async () => {
  // CODEX'S OWN NUMBERS. A cap of 9007199254740993 becomes 9007199254740992 in JS; paired with a
  // cap of 5 against a line of 9007199254740997 the rounded arithmetic ties EXACTLY and so does
  // PostgreSQL's — but they are different sums. The evaluator would claim a multi-entry FULL
  // settlement while leaving the first entry one cent open, and every DB rung would pass.
  //
  // The loss happens inside JSON.parse, before any of this code runs, so the test is on the
  // RESULT: every integer JSON.parse rounds lands at or above 2^53, where Number.isSafeInteger is
  // false. Sound, even though it can never name the digit it lost.
  //
  // THE VALUES ARE BUILT WITH Number(), NOT WRITTEN AS LITERALS, and that is corroboration rather
  // than a workaround: eslint's own `no-loss-of-precision` REFUSES to let this file contain the
  // literal 9007199254740993 at all, for exactly the reason this cell exists. Number() on the
  // decimal string is the same rounding JSON.parse performs, which is the input under test.
  const CAP_BIG = Number("9007199254740993");
  const LINE_BIG = Number("9007199254740997");
  assert.equal(CAP_BIG, Number("9007199254740992"), "the value is ALREADY rounded before any assertion runs — this is the premise, asserted");
  assert.equal(pack.exactCents(CAP_BIG), null, "and the rounded value is not a safe integer, so it is refused");
  assert.equal(pack.exactCents("9007199254740993"), null, "the string form is refused too: Number() is just as lossy");
  assert.equal(pack.exactCents(LINE_BIG), null);
  assert.equal(pack.exactCents(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER, "the boundary itself is exact and admitted");
  assert.equal(pack.exactCents(Number.MAX_SAFE_INTEGER + 1), null, "one past it is not");
  assert.equal(pack.exactCents(-4000), -4000, "negatives are ordinary (a money-out line)");
  assert.equal(pack.exactCents("5"), 5);
  assert.equal(pack.exactCents("007"), null, "a spelling this closure cannot reproduce is refused");
  assert.equal(pack.exactCents(1.5), null);
  assert.equal(pack.exactCents(""), null);
  assert.equal(pack.exactCents(undefined), null);

  // AND THE PARSER REFUSES THE WHOLE PACK on one, rather than dropping the line — a pack with a
  // hole in it is not a smaller pack.
  const D = "b".repeat(64);
  const id = randomUUID();
  const r = pack.readPackView({ digest: D, lines: [{ line_id: id, amount_cents: CAP_BIG, description: "x" }], candidates: [] });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "line_cents_unrepresentable");
  const r2 = pack.readPackView({ digest: D, lines: [], candidates: [{ entry_id: id, debit_remaining_cents: CAP_BIG, credit_remaining_cents: 0 }] });
  assert.equal(r2.ok, false);
  assert.equal(r2.reason, "capacity_unrepresentable");
});

test("G1B-ALLOC-6 裁-44 R2 / FOLD-11 — the promotion count is COUNTED from the pack, and zero sightings is zero", async () => {
  // The pure half of FOLD-11; G1B-BANK-E8 drives the same rule through the real verb.
  const a = randomUUID();
  const b = randomUUID();
  const c = randomUUID();
  const v = viewOf(
    [
      line(a, 100, "TRANSFER FROM MBB-514202-9 ACME SDN BHD"),
      line(b, 200, "PAYMENT mbb-514202-9 recurring"),
      line(c, 300, "CHEQUE 88214"),
    ],
    [],
  );
  assert.equal(pack.countIdentifierSightings(v, "MBB-514202-9"), 2, "case-insensitive exact substring, counted over the pack's own lines");
  assert.equal(pack.countIdentifierSightings(v, "mbb-514202-9"), 2, "the model's spelling of the case does not change the count");
  assert.equal(pack.countIdentifierSightings(v, "88214"), 1);
  assert.equal(pack.countIdentifierSightings(v, "NOT-ON-THIS-STATEMENT"), 0, "and an identifier that appears nowhere counts ZERO — there is no floor of one");
  assert.equal(pack.countIdentifierSightings(v, "   "), 0, "a blank needle matches nothing rather than everything");

  // A line the DB reported with no description carries no text, so it can never contribute a
  // sighting — the conservative direction.
  const nulled = viewOf([{ line_id: a, amount_cents: 100, description: null }], []);
  assert.equal(pack.countIdentifierSightings(nulled, "anything"), 0);
});
