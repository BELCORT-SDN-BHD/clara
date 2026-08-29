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
 *  never by hand-constructing the Maps, which would let readPackView rot untested. */
const viewOf = (lines, candidates) =>
  pack.readPackView({ digest: "d".repeat(64), lines, candidates });

const line = (id, cents) => ({ line_id: id, amount_cents: cents });
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
    [bank.propose_identifier_promotion, { counterparty_id: uuid(), identifier_kind: "tin", identifier_value: "v", times_seen: 1, rationale: "r" }, "identifier_value", PROSE],
    [bank.propose_identifier_promotion, { counterparty_id: uuid(), identifier_kind: "tin", identifier_value: "v", times_seen: 1, rationale: "r" }, "rationale", PROSE],
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

test("G1B-ALLOC-4 readPackView reads only what the DATABASE returned, and fails closed on a pack with no digest", async () => {
  // The reader is the seam between "what the DB said" and "what a write may derive", so its
  // failure mode matters as much as its success one: a reply with no digest is not a pack, and
  // returning an empty view rather than null would leave the write gate open with nothing behind
  // it (the same absence-as-evidence shape M4 was).
  assert.equal(pack.readPackView({ lines: [], candidates: [] }), null, "no digest, no pack");
  assert.equal(pack.readPackView(null), null);
  assert.equal(pack.readPackView({ digest: "" }), null, "a blank digest is not a digest");

  // A pack whose arrays are missing entirely is still a pack — it just offers nothing, which is
  // exactly what an account with no unmatched lines looks like.
  const empty = pack.readPackView({ digest: "a".repeat(64) });
  assert.equal(empty.lineCents.size, 0);
  assert.equal(empty.entryCaps.size, 0);

  // UPPERCASE IDS FROM A MODEL MUST STILL RESOLVE (S3's own lesson, one level down): the DB renders
  // every uuid lowercase, and two spellings of one id must not be two subjects.
  const id = randomUUID().toUpperCase();
  const v = viewOf([line(id.toLowerCase(), 500)], [cand(id.toLowerCase(), 500, 0)]);
  const out = pack.deriveMatchAllocation(v, [id], [id]);
  assert.equal(out.ok, true, "an uppercase spelling of a pack id still resolves");
  assert.equal(out.entries[0].matched_cents, 500);
});
