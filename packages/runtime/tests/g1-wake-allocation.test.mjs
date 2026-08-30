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

// 裁-44 R4 split the pure half three ways for the 500-line budget — the record and the parser
// (pack), the identifier matcher (identity), and the allocation (alloc). The cells address ONE
// surface, so the three namespaces are merged rather than every call site being rewritten to
// guess which module a function lives in today.
const pack = {
  ...(await import("../workflows/bankAgent.v1.pack.ts")),
  ...(await import("../workflows/bankAgent.v1.identity.ts")),
  ...(await import("../workflows/bankAgent.v1.alloc.ts")),
};
const tools = await import("../workflows/bankAgent.v1.tools.ts");

// Codex r6 LOW (G1 PR-2b, #437's own review ladder): "a production MATCH_ALLOCATION_REASONS
// roster compared by G1B-ALLOC-8". No such exported constant exists in the shipping source —
// `reason: "<token>"` is a plain string literal at each refusal's own `return`
// (bankAgent.v1.alloc.ts) — so the roster this cell compares against is DERIVED from that
// shipping source text, the FOLD-19 idiom verbatim ("G1B-I3's corpus is now DERIVED from the
// directory rather than typed out, so a new closure member joins the gate by existing"). A
// hand-typed array here is exactly the allowlist class FOLD-19 closed for I3: a ninth refusal
// reason added to deriveMatchAllocation tomorrow would silently NOT be swept unless this array
// grew with it, and the sweep's own "not covered" assertion (below) is what makes that
// omission loud instead of silent.
async function productionAllocationReasons() {
  const src = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../workflows/bankAgent.v1.alloc.ts", import.meta.url), "utf8"),
  );
  const found = new Set();
  for (const m of src.matchAll(/reason:\s*"([a-z_]+)"/g)) found.add(m[1]);
  return found;
}

/** Build a pack view the way the DB's own reply would produce one, through the SHIPPING reader —
 *  never by hand-constructing the Maps, which would let readPackView rot untested. Throws on a
 *  parse failure so a fixture that stopped being valid cannot quietly become an empty pack. */
const viewOf = (lines, candidates, epoch = 0) => {
  const parsed = pack.readPackView({ digest: "d".repeat(64), lines, candidates }, epoch);
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

test("G1B-ALLOC-4 裁-44 R2 / FOLD-12 — a pack this parser cannot fully account for FAILS; it never becomes an authoritative empty one", async () => {
  // THE DEFECT THIS CELL USED TO BLESS. The earlier reader accepted `{digest}` as a pack with
  // empty arrays and turned a missing or malformed cents value into ZERO. Both are absence as
  // evidence (review law 2), and the consequence was worse than a wrong refusal: the run ARMED
  // itself on a corrupt reply, every write was refused for "not in the pack", and the task settled
  // `nothing_due` — a corrupt read reported as a quiet night. The cell asserted that behaviour.
  const D = "a".repeat(64);
  const id = randomUUID();
  const bad = (reply, reason, why = "") => {
    const r = pack.readPackView(reply, 0);
    assert.equal(r.ok, false, `must FAIL: ${reason} ${why} — got ${JSON.stringify(r).slice(0, 200)}`);
    assert.equal(r.reason, reason, `and by NAME, so the failure is diagnosable`);
    return r;
  };

  bad(null, "pack_not_object");
  bad("a string", "pack_not_object");
  bad({ lines: [], candidates: [] }, "digest_malformed");
  bad({ digest: "", lines: [], candidates: [] }, "digest_malformed");
  // 裁-44 R3 / FOLD-16 — THE DIGEST IS A SHA-256, NOT "any non-empty string". `{digest:"x"}` used
  // to be accepted, which made a one-character string authoritative evidence for a whole run —
  // and every write re-presents this value as p_inputs_digest.
  bad({ digest: "x", lines: [], candidates: [] }, "digest_malformed");
  bad({ digest: "a".repeat(63), lines: [], candidates: [] }, "digest_malformed");
  bad({ digest: D.toUpperCase(), lines: [], candidates: [] }, "digest_malformed", "the verb emits lowercase hex; an uppercase spelling is not what it computed");
  bad({ digest: "g".repeat(64), lines: [], candidates: [] }, "digest_malformed", "64 characters is not enough — they must be HEX");
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
  // 裁-44 R3 / FOLD-16 — AN ABSENT description KEY IS NOT A LAWFUL NULL. The column is nullable, so
  // an EXPLICIT null is a real state of the books; but the verb always emits the key
  // (0121:5719), so a reply missing it is not this verb's reply. Treating undefined as null let a
  // truncated payload arm the run with empty evidence — which is what FOLD-11's sighting count is
  // derived from.
  bad({ digest: D, lines: [{ line_id: id, amount_cents: 1 }], candidates: [] }, "line_description_absent");
  bad({ digest: D, lines: [], candidates: [{ entry_id: id }] }, "capacity_unrepresentable");
  bad({ digest: D, lines: [], candidates: [{ entry_id: id, debit_remaining_cents: 1 }] }, "capacity_unrepresentable");
  bad({ digest: D, lines: [], candidates: [{ entry_id: "x", debit_remaining_cents: 1, credit_remaining_cents: 0 }] }, "entry_id_malformed");

  // THE POSITIVE CONTROL, and it is the distinction the whole ruling turns on: an EXPLICITLY
  // EMPTY pack is a perfectly good pack — an account with nothing unmatched — and must parse.
  const empty = pack.readPackView({ digest: D, lines: [], candidates: [] }, 0);
  assert.equal(empty.ok, true, "explicit empty arrays are a REAL pack, not a malformed one");
  assert.equal(empty.view.lineCents.size, 0);
  assert.equal(empty.view.entryCaps.size, 0);

  // A NULL description is a real state of the books (bank_statement_lines.description is NULLABLE,
  // 0038:546) and becomes empty text rather than a failure.
  const nulled = pack.readPackView({ digest: D, lines: [{ line_id: id, amount_cents: 5, description: null }], candidates: [] }, 0);
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
  const r = pack.readPackView({ digest: D, lines: [{ line_id: id, amount_cents: CAP_BIG, description: "x" }], candidates: [] }, 0);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "line_cents_unrepresentable");
  const r2 = pack.readPackView({ digest: D, lines: [], candidates: [{ entry_id: id, debit_remaining_cents: CAP_BIG, credit_remaining_cents: 0 }] }, 0);
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
  assert.equal(pack.countIdentifierSightings(v, "MBB-514202-9"), 2, "canonicalised on both sides, counted over the pack's own lines");
  assert.equal(pack.countIdentifierSightings(v, "mbb-514202-9"), 2, "the model's spelling of the case does not change the count");
  assert.equal(pack.countIdentifierSightings(v, "mbb5142029"), 2, "nor does dropping the separators the statement prints (裁-44 R3 / FOLD-15)");
  assert.equal(pack.countIdentifierSightings(v, "88214"), 1);
  assert.equal(pack.countIdentifierSightings(v, "NOT-ON-THIS-STATEMENT"), 0, "and an identifier that appears nowhere counts ZERO — there is no floor of one");
  assert.equal(pack.countIdentifierSightings(v, "   "), 0, "a blank needle matches nothing rather than everything");

  // 裁-44 R3 / FOLD-15 — THE TOKEN BOUNDARY. Raw substring matching made a short needle an oracle:
  // "1" counted every line containing a 1 anywhere, so the model could not pick the NUMBER but
  // could pick an identifier that made the number whatever it liked. A token must match WHOLE.
  assert.equal(pack.countIdentifierSightings(v, "1"), 0, "a one-character needle matches no whole token");
  assert.equal(pack.countIdentifierSightings(v, "514202"), 0, "and a fragment of a longer run is not a sighting of it");
  assert.equal(pack.countIdentifierSightings(v, "8821"), 0, "nor is a prefix of one");
  const longer = viewOf([line(a, 100, "CHEQUE 8821499 UNRELATED"), line(b, 200, "CHEQUE 88214 REAL")], []);
  assert.equal(pack.countIdentifierSightings(longer, "88214"), 1, "a longer digit run that CONTAINS the identifier is not counted; the exact token is");

  // A line the DB reported with no description carries no text, so it can never contribute a
  // sighting — the conservative direction.
  const nulled = viewOf([{ line_id: a, amount_cents: 100, description: null }], []);
  assert.equal(pack.countIdentifierSightings(nulled, "anything"), 0);
  assert.ok(c, "the third fixture line is used by the token cases above");
});

test("G1B-ALLOC-8 裁-44 R3 / FOLD-18 — an aggregate this process cannot carry is refused, and a write reply hands the model no cents", async () => {
  // FOLD-10 gated the LEAVES. A sum of safe integers is not itself guaranteed safe: enough large
  // lines add past 2^53 and the total starts rounding — the same defect one level up. The
  // aggregation is BigInt and the result is checked.
  const l1 = randomUUID();
  const l2 = randomUUID();
  const e1 = randomUUID();
  const e2 = randomUUID();
  const HALF = Number("4503599627370496"); // 2^52 — safe on its own, unsafe when doubled.
  const over = viewOf([line(l1, HALF), line(l2, HALF)], [cand(e1, HALF, 0), cand(e2, HALF, 0)]);
  const agg = pack.deriveMatchAllocation(over, [l1, l2], [e1]);
  assert.equal(agg.ok, false, "two safe line amounts whose SUM is unsafe must be refused");
  assert.equal(agg.reason, "aggregate_unrepresentable");
  assert.match(agg.detail, /smaller groups/, "and the model is told what to do instead");

  // The positive control on the same shape: just under the boundary still derives.
  const under = viewOf([line(l1, HALF - 1), line(l2, HALF - 1)], [cand(e1, HALF - 1, 0), cand(e2, HALF - 1, 0)]);
  const okAgg = pack.deriveMatchAllocation(under, [l1, l2], [e1, e2]);
  assert.equal(okAgg.ok, true, `just under the boundary is ordinary arithmetic — ${JSON.stringify(okAgg).slice(0, 160)}`);
  assert.equal(okAgg.lineCents, 2 * (HALF - 1));
  assert.equal(pack.isSafeBig(BigInt(Number.MAX_SAFE_INTEGER)), true);
  assert.equal(pack.isSafeBig(BigInt(Number.MAX_SAFE_INTEGER) + 1n), false);

  // THE REPLY SHAPE. An admitted match used to hand back line_cents / entry_cents /
  // adjustment_cents — the books' own arithmetic, as text the model can quote and reason from.
  // A write reply says WHETHER it landed and WHICH row it made; nothing else.
  const matchId = randomUUID();
  const projected = tools.projectReply("match", {
    status: "live", match_id: matchId, line_cents: 10000, entry_cents: 10000, adjustment_cents: 0, adjustment_entry_ids: [],
  });
  assert.deepEqual(projected, { status: "live", match_id: matchId }, "status and id only");
  const propId = randomUUID();
  assert.deepEqual(
    tools.projectReply("exception", { status: "open", proposal_id: propId, line_id: l1, times_seen: 3 }),
    { status: "open", proposal_id: propId, line_id: l1 },
    "a proposal keeps its subject and drops everything else",
  );

  // A REFUSAL PASSES THROUGH UNCHANGED — rung_vector is pass/fail tokens and carries no cent, and
  // it is what makes a refusal actionable. Projecting it away would be a regression.
  const refusal = { status: "refused", rung_vector: { tie_nonzero: "fail" } };
  assert.deepEqual(tools.projectReply("match", refusal), refusal);
  assert.deepEqual(tools.projectReply("match", null), null);

  // 裁-44 R4 / FOLD-22(b) — AND NO *LOCAL* REFUSAL CARRIES A CENTS VALUE EITHER. The PR claimed
  // "rung names, not amounts" while `entries_do_not_tie` interpolated BOTH totals into the text
  // handed back to the model. Every reason this function can produce is swept, so the claim is
  // machine-checked rather than asserted in prose.
  const l1b = randomUUID();
  const l2b = randomUUID();
  const e1b = randomUUID();
  const e2b = randomUUID();
  // 裁-44 R5 (LOW) — EVERY CASE NOW NAMES THE REASON IT EXPECTS, and the sweep compares the EXACT
  // SET rather than a floor. `seen.size >= 5` let any case regress into a reason another case had
  // already produced without failing: six staged shapes could collapse onto four reasons and the
  // sweep would still say it had covered them. The two the previous round left unstaged —
  // `no_lines` and `no_entries` — are staged here too, and their unreachability from the MODEL is
  // pinned separately below rather than assumed from the schema's shape.
  const cases = [
    ["entries_do_not_tie", viewOf([line(l1b, 10000)], [cand(e1b, 25000, 0), cand(e2b, 25000, 0)]), [l1b], [e1b, e2b]],
    ["entry_has_no_capacity", viewOf([line(l1b, 10000)], [cand(e1b, 0, 5000)]), [l1b], [e1b]],
    ["lines_net_to_zero", viewOf([line(l1b, 0)], [cand(e1b, 5000, 0)]), [l1b], [e1b]],
    ["line_not_in_pack", viewOf([line(l1b, 100)], [cand(e1b, 100, 0)]), [randomUUID()], [e1b]],
    ["entry_not_in_pack", viewOf([line(l1b, 100)], [cand(e1b, 100, 0)]), [l1b], [randomUUID()]],
    ["aggregate_unrepresentable", viewOf([line(l1b, HALF), line(l2b, HALF)], [cand(e1b, HALF, 0)]), [l1b, l2b], [e1b]],
    ["no_lines", viewOf([line(l1b, 100)], [cand(e1b, 100, 0)]), [], [e1b]],
    ["no_entries", viewOf([line(l1b, 100)], [cand(e1b, 100, 0)]), [l1b], []],
  ];
  // IDs ARE STRIPPED BEFORE THE CHECK, and that distinction is the point rather than a dodge: an
  // entry id is WHICH ROW, an amount is HOW MUCH. The first is what makes a refusal actionable and
  // carries no arithmetic; the second is the books' own figure being read back to the model. A
  // uuid contains digit runs, so a naive digit sweep would forbid the ids too.
  const stripIds = (s) => s.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>");
  const seen = new Set();
  for (const [expected, view, ls, es] of cases) {
    const out = pack.deriveMatchAllocation(view, ls, es);
    assert.equal(out.ok, false, "each of these must refuse, or the sweep below is vacuous");
    assert.equal(out.reason, expected, `this shape must refuse for ${expected}, not ${out.reason} — a case that drifts onto another case's reason leaves a branch unswept`);
    seen.add(out.reason);
    assert.doesNotMatch(
      stripIds(out.detail),
      /\d/,
      `refusal "${out.reason}" must carry no amount — got: ${out.detail}`,
    );
  }
  // THE EXACT SET, not a floor: every reason this function can produce is here, and nothing else is.
  // The ninth branch — the CAPACITY-side `aggregate_unrepresentable` — shares this token and has its
  // own cell (G1B-ALLOC-8b), which is why the set has eight members and not nine.
  const EXPECTED = ["aggregate_unrepresentable", "entries_do_not_tie", "entry_has_no_capacity", "entry_not_in_pack",
    "line_not_in_pack", "lines_net_to_zero", "no_entries", "no_lines"];
  assert.deepEqual(
    [...seen].sort(),
    EXPECTED,
    "the sweep must cover every refusal reason deriveMatchAllocation can produce, exactly",
  );
  // Codex r6 LOW — the SAME set, compared against the PRODUCTION roster derived from the
  // shipping source rather than against this test's own hand-typed EXPECTED array, so a reason
  // added to bankAgent.v1.alloc.ts without a matching staged case here fails LOUD (the sweep is
  // no longer complete) instead of silently under-covering.
  const production = await productionAllocationReasons();
  assert.deepEqual(
    [...production].sort(),
    EXPECTED,
    "the PRODUCTION roster (every distinct reason: token in the shipping source) must equal " +
      "this sweep's own EXPECTED set — a reason added to bankAgent.v1.alloc.ts without a " +
      "matching staged case here must fail this assertion, not silently go unswept",
  );

  // AND THE TWO THAT NO MODEL CAN REACH ARE PINNED AS SUCH, through the SHIPPING schema rather than
  // by reading the source: `no_lines`/`no_entries` are defence-in-depth for a caller inside this
  // closure, not refusals the model can ever be shown. Stated as a measurement so that widening the
  // schema later makes this cell speak.
  const built = tools.buildBankAgentTools(
    { taskId: randomUUID(), firmId: randomUUID(), clientId: randomUUID(), bankAccountId: randomUUID(), dueReason: null },
    "gpt-5.6-terra",
    pack.newBankRunRecord("cell"),
  );
  const schema = built.match_bank_line.inputSchema;
  assert.equal(schema.safeParse({ lines: [], entries: [e1b], rationale: "x" }).success, false, "an empty line list never reaches the derivation");
  assert.equal(schema.safeParse({ lines: [l1b], entries: [], rationale: "x" }).success, false, "nor an empty entry list");
  assert.equal(schema.safeParse({ lines: [l1b], entries: [e1b], rationale: "x" }).success, true, "the positive control: the schema is genuinely evaluating these");
});

test("G1B-ALLOC-8b 裁-44 R4 (LOW) — the CAPACITY aggregation is guarded too, not just the line total", async () => {
  // ALLOC-8 drove the LINE sum. There are two BigInt aggregations in this function and only one
  // was under test; a guard nothing exercises is a guard nobody will notice losing.
  const l = randomUUID();
  const e1 = randomUUID();
  const e2 = randomUUID();
  const HUGE = Number("9007199254740000"); // safe alone; two of them are not
  // The LINE total is small, so the line-side guard cannot be what fires — it has to be the
  // capacity sum, which is only reached on the MULTI-entry path.
  const v = viewOf([line(l, 10)], [cand(e1, HUGE, 0), cand(e2, HUGE, 0)]);
  const out = pack.deriveMatchAllocation(v, [l], [e1, e2]);
  assert.equal(out.ok, false);
  assert.equal(out.reason, "aggregate_unrepresentable", "the CAPACITY sum's own guard, reached with a tiny line total");
  assert.match(out.detail, /capacity/, "and it names which aggregate it was");
  assert.doesNotMatch(out.detail, /\b\d{3,}\b/, "without quoting the number back at the model");
});
