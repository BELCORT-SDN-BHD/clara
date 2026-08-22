// F-A2 PR-1 — THE LADDER, part 1: Annex C.1 (the wrapper) and C.2 (Tier A).
// Parts 2 and 3 are f-a2-ladder-2.test.mjs (C.3, Tier B) and f-a2-ladder-3.test.mjs (C.4/C.5,
// Tiers C and D); the split is the repo's 500-line file ceiling, not a seam in the manifest.
//
// CONTRACT-BLIND. Authored from `docs/plan/active/f-a2-agentic-posting-design.md` §3.1/§3.2/
// §3.3 plus Annex C's manifest and Annex E's vocabulary, in parallel with — and without sight
// of — the lane authoring PR-1's migrations. Every string asserted below is Annex E's, and a
// divergence when the surface lands is a finding on one side or the other.
//
// EVERY CELL IS FRONTIER-GATED on the applied STEM of PR-1's core file (`f_a2_posting_core$`),
// never on a migration NUMBER — numbers are claimed at merge, and `db-slice-frontiers` runs
// this package against databases pinned at 0042-0045 where none of this exists. A gated cell
// SKIPS there; it never reds a leg with a message about a function that was not born yet
// (the B.3 lesson).
//
// TIER A RAISES, TIER B RETURNS. The contract line that shapes half these assertions: Tier A
// is `RAISE (CLR*)` — the transaction dies and NOTHING is durable — while Tier B COMMITS a
// typed non-post receipt. So a Tier-A cell asserts an exception AND the absence of any receipt
// row; a Tier-B cell asserts a returned jsonb verdict. A cell that only asserted "it did not
// post" would pass on either, which is exactly the confusion the tier boundary exists to
// remove.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  ROLES, rootQuery, endPool, buildWorld, printLaneNotes, printSkipCount, noteLane,
  booksVersion, opk, approveEntry, reviseEntry, withdrawDraft, entryRow,
  holdThenContend, mintWake5, postingCoreReady, retireDocumentFiling,
  draftEntryV3, freshResolution, ev, factsRegion,
  gateCore, wakePostEntry, postReceiptCount, postReceiptRow, opReceiptText,
  agentPostable, agentDraft, autodraftCred, proactiveCred, ensureChart, witnessedFiling,
  supplierLines, MODEL, RATIONALE, APPROVAL_ARM_AGENT, admitsAll, assertVectorShape,
  bodyOf, AGENT_USER_ID,
} from "./f-a2-post-world.mjs";

let world = null;

// The world is built ONLY when the surface exists. On a pre-F-A2 frontier every cell skips, and
// building a synthetic firm graph there would spend a minute of CI proving nothing.
before(async () => {
  if (await postingCoreReady()) world = await buildWorld();
});
after(async () => {
  printLaneNotes("f-a2-ladder");
  printSkipCount("f-a2-ladder");
  await endPool();
});

const A1 = () => world.clients.A1;
const OWNER = () => world.users.alice;

/**
 * A Tier-A refusal: an EXCEPTION carrying a CLR code, and nothing durable behind it.
 * `code` may be a single expected code (where the design names one) or null, where the design
 * says only "Tier A raises" — in that case the cell asserts the SHAPE (a CLR* raise, no
 * receipt) rather than inventing a code the contract does not state. Asserting a guessed code
 * would make the cell fail for a reason the design never claimed.
 */
async function assertTierARaise(fn, { code = null, entry = null, label }) {
  let err = null;
  try { await fn(); } catch (e) { err = e; }
  assert.ok(err, `${label}: Tier A RAISES — the call must not return a receipt`);
  assert.ok(/^CLR\d\d$/.test(err.code ?? ""),
    `${label}: the raise carries a CLR errcode (got ${err.code ?? "(none)"} — ${err.message})`);
  if (code) assert.equal(err.code, code, `${label}: the design names ${code} for this rung (got ${err.code}: ${err.message})`);
  if (entry) {
    assert.equal(await postReceiptCount(entry), 0,
      `${label}: a Tier-A raise leaves ZERO entry_post_receipts rows (C.7b) — the whole transaction is gone`);
    assert.equal((await entryRow(entry))?.status, "draft", `${label}: the entry is still a draft`);
  }
  return err;
}

// ===========================================================================
// C.1 — THE WRAPPER.
// ===========================================================================

test("f-a2.c1.1 no credential at all -> CLR03, before the wrapper reads anything else", async (t) => {
  if (await gateCore(t)) return;
  const p = await agentPostable(OWNER(), { client: A1() });
  await assertTierARaise(() => wakePostEntry(null, { ...p.args, secret: null }),
    { code: "CLR03", entry: p.args.entry, label: "c1.1 credential-less post" });
});

test("f-a2.c1.2 a wake kind carrying NO allowlist row -> CLR03, and the cell makes the CALL", async (t) => {
  if (await gateCore(t)) return;
  const p = await agentPostable(OWNER(), { client: A1() });
  const proactive = await proactiveCred(A1());
  // v4's cell read the allowlist roster, which proves the ROW is absent — not that the DOOR is
  // shut. Re-cut at the gate: make the call, be refused. The roster read below is a SECOND,
  // corroborating assertion, never the primary evidence (review law 2).
  await assertTierARaise(() => wakePostEntry(proactive, p.args),
    { code: "CLR03", entry: p.args.entry, label: "c1.2 proactive-kind post" });
  const rows = await rootQuery(
    "select wake_kind from clara.wake_fn_allowlist where coalesce(fn_name, function_name)='wake_post_entry' order by wake_kind");
  assert.ok(!rows.rows.some((r) => r.wake_kind === "proactive"),
    "c1.2 corroboration: 'proactive' holds no wake_post_entry allowlist row");
});

test("f-a2.c1.3 the refused proactive attempt leaves NOTHING behind — no receipt, no status move, no event", async (t) => {
  if (await gateCore(t)) return;
  const p = await agentPostable(OWNER(), { client: A1() });
  const before = (await entryRow(p.args.entry))?.revision_token;
  const proactive = await proactiveCred(A1());
  await assertTierARaise(() => wakePostEntry(proactive, p.args),
    { code: "CLR03", entry: p.args.entry, label: "c1.3 proactive attempt" });
  const row = await entryRow(p.args.entry);
  assert.equal(row?.revision_token, before, "c1.3: the revision token did not rotate — the raise rolled the whole attempt back");
  const ev = await rootQuery(
    "select count(*)::int as n from clara.domain_events where event_type in ('entry.posted','entry.post_refused') and subject_id=$1",
    [p.args.entry]);
  assert.equal(ev.rows[0].n, 0, "c1.3: a Tier-A raise emits neither entry.posted nor entry.post_refused");
});

test("f-a2.c1.4 a blank op key -> CLR10 carrying the typed detail", async (t) => {
  if (await gateCore(t)) return;
  const p = await agentPostable(OWNER(), { client: A1() });
  const err = await assertTierARaise(() => wakePostEntry(p.cred, { ...p.args, opKey: "   " }),
    { code: "CLR10", entry: p.args.entry, label: "c1.4 blank op key" });
  assert.ok(/reason/.test(err.detail ?? ""),
    `c1.4: the CLR10 carries a typed DETAIL discriminant (0078:150-152's op-key discipline), got ${JSON.stringify(err.detail)}`);
});

test("f-a2.c1.5 a blank rationale refuses — the agent never picks an authoritative input", async (t) => {
  if (await gateCore(t)) return;
  const p = await agentPostable(OWNER(), { client: A1() });
  await assertTierARaise(() => wakePostEntry(p.cred, { ...p.args, rationale: "   " }),
    { code: "CLR10", entry: p.args.entry, label: "c1.5 blank rationale" });
});

test("f-a2.c1.6 a p_model missing a REQUIRED key refuses — the wall that records WHICH model posted", async (t) => {
  if (await gateCore(t)) return;
  const p = await agentPostable(OWNER(), { client: A1() });
  // R-3's lesson made executable: the model conjunct is the wall recording which model posted,
  // and a silently-true conjunct there is the defect this design keeps refusing elsewhere. So
  // each of the three keys is dropped INDEPENDENTLY — a cell that dropped only one would pass
  // against a CHECK that validated only that one.
  for (const drop of ["provider", "model", "version"]) {
    const model = { ...MODEL };
    delete model[drop];
    await assertTierARaise(() => wakePostEntry(p.cred, { ...p.args, model }),
      { code: "CLR10", entry: p.args.entry, label: `c1.6 model missing '${drop}'` });
    const blank = { ...MODEL, [drop]: "  " };
    await assertTierARaise(() => wakePostEntry(p.cred, { ...p.args, model: blank }),
      { code: "CLR10", entry: p.args.entry, label: `c1.6 model with blank '${drop}'` });
  }
});

test("f-a2.c1.7 a null books_version refuses", async (t) => {
  if (await gateCore(t)) return;
  const p = await agentPostable(OWNER(), { client: A1() });
  await assertTierARaise(() => wakePostEntry(p.cred, { ...p.args, booksVersion: null }),
    { code: "CLR10", entry: p.args.entry, label: "c1.7 null books_version" });
});

test("f-a2.c1.8 the wrapper carries NO DML — a catalog cell over its live body", async (t) => {
  if (await gateCore(t)) return;
  const src = await bodyOf("clara.wake_post_entry(uuid,text,uuid,bigint,text,jsonb,text)");
  assert.ok(src, "c1.8: the wrapper resolves at the pinned signature (design §3.1)");
  // Comments stripped before the scan — a DML token inside a `-- …` line is prose, and a census
  // that flagged it would train the next author to write worse comments.
  const bare = src.replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
  const dml = /\b(insert\s+into|update\s+clara\.|delete\s+from|merge\s+into|truncate)\b/i;
  assert.ok(!dml.test(bare),
    `c1.8: the wrapper raises only and carries NO DML (design §3.1); found ${JSON.stringify(bare.match(dml)?.[0])}`);
  assert.ok(/_agent_post_entry_core/.test(bare),
    "c1.8: …and it delegates to the ungranted core, which is where the ladder and the receipt live");
});

test("f-a2.c1.9 a replay returns the stored receipt BYTE-identically", async (t) => {
  if (await gateCore(t)) return;
  const p = await agentPostable(OWNER(), { client: A1() });
  const key = `f-a2-replay:${randomUUID().slice(0, 12)}`;
  const first = await wakePostEntry(p.cred, { ...p.args, opKey: key });
  const stored = await opReceiptText(p.cited.firm, key);
  const second = await wakePostEntry(p.cred, { ...p.args, opKey: key });
  assert.equal(JSON.stringify(second), JSON.stringify(first),
    "c1.9: the replay returns the FIRST call's receipt, byte-identically");
  assert.equal(stored, JSON.stringify(first) === "null" ? null : stored,
    "c1.9: …and the same bytes are the durable op_receipts.result");
  assert.ok(stored, "c1.9: the op receipt row exists — reserve-before-effect");
});

test("f-a2.c1.10 a NEW op key re-attempts after a refusal, and gets a FRESH verdict", async (t) => {
  if (await gateCore(t)) return;
  // Refuse on a term the caller can fix, then re-attempt under a new key. The point is that a
  // refusal is not terminal for the entry — only for that op key.
  const p = await agentPostable(OWNER(), { client: A1(), corroborated: false });
  const k1 = `f-a2-attempt-1:${randomUUID().slice(0, 8)}`;
  const k2 = `f-a2-attempt-2:${randomUUID().slice(0, 8)}`;
  const r1 = await wakePostEntry(p.cred, { ...p.args, opKey: k1 });
  assert.equal(r1?.posted, false, "c1.10: the first attempt refuses");
  const r2 = await wakePostEntry(p.cred, { ...p.args, opKey: k2 });
  assert.equal(r2?.posted, false, "c1.10: the re-attempt is evaluated afresh, and refuses on the same unfixed term");
  assert.ok(await opReceiptText(p.cited.firm, k2),
    "c1.10: the re-attempt COMMITTED its own op receipt — a Tier-B refusal is durable, not a rollback");
});

// ===========================================================================
// C.2 — TIER A.
// ===========================================================================

test("f-a2.c2.A2 an entry outside your firm -> CLR11, with no existence oracle", async (t) => {
  if (await gateCore(t)) return;
  const p = await agentPostable(OWNER(), { client: A1() });
  const foreign = await mintWake5({ kind: "autodraft", firm: world.firms.B, onBehalfOf: null, client: world.clients.B1 });
  await assertTierARaise(() => wakePostEntry(foreign, { ...p.args, client: world.clients.B1 }),
    { code: "CLR11", entry: p.args.entry, label: "c2.A2 cross-firm post" });
});

test("f-a2.c2.A4 an entry whose status is not 'draft' refuses at Tier A", async (t) => {
  if (await gateCore(t)) return;
  const p = await agentPostable(OWNER(), { client: A1() });
  await approveEntry(OWNER(), { entry: p.args.entry, expectedRevision: p.args.expectedRevision, opKey: opk("c2A4") });
  await assertTierARaise(() => wakePostEntry(p.cred, p.args), { label: "c2.A4 already-approved entry" });
  assert.equal(await postReceiptCount(p.args.entry), 0,
    "c2.A4: the HUMAN approval wrote no post receipt — the trigger is inert on that lane (C.5)");
});

test("f-a2.c2.A5 a stale revision_token -> CLR06", async (t) => {
  if (await gateCore(t)) return;
  const p = await agentPostable(OWNER(), { client: A1() });
  await assertTierARaise(() => wakePostEntry(p.cred, { ...p.args, expectedRevision: randomUUID() }),
    { code: "CLR06", entry: p.args.entry, label: "c2.A5 stale token" });
});

test("f-a2.c2.A6 a filing that MOVED under the draft -> CLR02", async (t) => {
  if (await gateCore(t)) return;
  const p = await agentPostable(OWNER(), { client: A1() });
  const filing = await rootQuery(
    "select id, revision_token from clara.document_filings where id=$1", [p.cited.filingId]);
  await retireDocumentFiling(OWNER(), {
    filing: p.cited.filingId, reason: "c2.A6 move the filing under the draft",
    expectedRevision: filing.rows[0]?.revision_token, opKey: opk("c2A6"),
  });
  await assertTierARaise(() => wakePostEntry(p.cred, p.args),
    { code: "CLR02", entry: p.args.entry, label: "c2.A6 filing moved" });
});

test("f-a2.c2.A7 a stale books_version -> CLR12 (assert_books_current)", async (t) => {
  if (await gateCore(t)) return;
  const p = await agentPostable(OWNER(), { client: A1() });
  await assertTierARaise(() => wakePostEntry(p.cred, { ...p.args, booksVersion: 0 }),
    { code: "CLR12", entry: p.args.entry, label: "c2.A7 stale books_version" });
});

test("f-a2.c2.A8a a HUMAN's draft refuses at A8 — maker_actor is not the agent", async (t) => {
  if (await gateCore(t)) return;
  await ensureChart(OWNER(), A1());
  const cited = await witnessedFiling(OWNER(), { client: A1(), gross: 500000 });
  const region = await factsRegion(cited.documentId, "invoice.total");
  const d = await draftEntryV3(OWNER(), {
    client: A1(), resolution: await freshResolution(OWNER(), A1(), { subjectKind: "document", subjectId: cited.documentId }),
    document: cited.documentId, sha256: cited.sha256, lines: supplierLines(500000),
    vendor: { new: { name: "HUMAN DRAFT SDN BHD" } },
    evidence: [ev(region?.id ?? cited.regionId, region?.text_content ?? cited.quote, "invoice.total")],
    opKey: opk("c2A8a"),
  });
  const cred = await autodraftCred(A1());
  const bv = await booksVersion(A1());
  await assertTierARaise(() => wakePostEntry(cred, {
    entry: d.entry_id, expectedRevision: d.revision_token, client: A1(), booksVersion: bv,
  }), { entry: d.entry_id, label: "c2.A8a human-drafted entry" });
});

test("f-a2.c2.A8b an AGENT draft a human REVISED refuses AT A8 — the cell that must fail with the second conjunct removed", async (t) => {
  if (await gateCore(t)) return;
  const p = await agentPostable(OWNER(), { client: A1() });
  // A PLAIN RENUMBERING: revise_entry sets last_human_editor and rotates the token, but writes
  // only `duplicate_override` into flags — so B6 CANNOT see it. That is the whole finding
  // (C-1): without A8's second conjunct the agent posts a human's numbers unattended, and the
  // rung that is supposed to catch overrides is blind to this one.
  const revised = await reviseEntry(OWNER(), {
    entry: p.args.entry, lines: supplierLines(499900), expectedRevision: p.args.expectedRevision,
    duplicateOverride: true, opKey: opk("c2A8b"),
  });
  const row = await entryRow(p.args.entry);
  assert.ok(row?.last_human_editor, "c2.A8b precondition: revise_entry stamped last_human_editor");
  assert.ok(!("amount_override" in (row?.flags ?? {})),
    "c2.A8b precondition: the plain renumbering wrote NO amount_override — B6 is blind to it, which is why A8 must catch it");
  await assertTierARaise(() => wakePostEntry(p.cred, {
    ...p.args, expectedRevision: revised?.revision_token ?? row.revision_token,
  }), { entry: p.args.entry, label: "c2.A8b human-revised agent draft" });
});

test("f-a2.c2.A8-exit1 OQ-4 exit 1 — the revised draft POSTS through the HUMAN lane, under human identity", async (t) => {
  if (await gateCore(t)) return;
  const p = await agentPostable(OWNER(), { client: A1() });
  const revised = await reviseEntry(OWNER(), {
    entry: p.args.entry, lines: supplierLines(499900), expectedRevision: p.args.expectedRevision,
    duplicateOverride: true, opKey: opk("c2exit1r"),
  });
  const tok = revised?.revision_token ?? (await entryRow(p.args.entry)).revision_token;
  await approveEntry(OWNER(), { entry: p.args.entry, expectedRevision: tok, opKey: opk("c2exit1a") });
  const row = await entryRow(p.args.entry);
  assert.equal(row?.status, "approved", "c2.exit1: the ordinary approve_entry path is byte-untouched by this design");
  assert.notEqual(row?.checker_actor, AGENT_USER_ID, "c2.exit1: …and the approval is recorded under HUMAN identity");
  assert.equal(await postReceiptCount(p.args.entry), 0, "c2.exit1: a human approval writes no post receipt");
});

test("f-a2.c2.A8-exit2 OQ-4 exit 2 — after the human draft is WITHDRAWN the agent re-derives and posts her own, under agent identity", async (t) => {
  if (await gateCore(t)) return;
  const p = await agentPostable(OWNER(), { client: A1() });
  const revised = await reviseEntry(OWNER(), {
    entry: p.args.entry, lines: supplierLines(499900), expectedRevision: p.args.expectedRevision,
    duplicateOverride: true, opKey: opk("c2exit2r"),
  });
  const tok = revised?.revision_token ?? (await entryRow(p.args.entry)).revision_token;
  // The DOUBLE-CODING WALL is load-bearing: she cannot draft a competing entry against the same
  // filing while the human's is live, so exit 2 becomes available only once it is withdrawn.
  await withdrawDraft(OWNER(), { entry: p.args.entry, reason: "c2.exit2 make room for the re-derivation", expectedRevision: tok, opKey: opk("c2exit2w") });
  const own = await agentDraft(OWNER(), p.cred, {
    client: A1(), cited: p.cited, codingKind: "supplier_bill", lines: supplierLines(500000),
    opKey: `f-a2-rederive:${randomUUID().slice(0, 8)}`,
  });
  const receipt = await wakePostEntry(p.cred, {
    entry: own.entry_id, expectedRevision: own.revision_token, client: A1(), booksVersion: await booksVersion(A1()),
    rationale: "re-derived after the human's suggestion of RM4,999.00, which I weighed and did not adopt: the witness pair reads RM5,000.00",
  });
  assert.equal(receipt?.posted, true, `c2.exit2: her OWN untouched derivation posts (${JSON.stringify(receipt?.refusal)})`);
  const rc = await postReceiptRow(own.entry_id);
  assert.equal(rc?.acting_actor, AGENT_USER_ID, "c2.exit2: …under AGENT identity");
  assert.equal(rc?.approval_arm, APPROVAL_ARM_AGENT, "c2.exit2: …on the agent arm, participating in no maker/checker");
  assert.match(rc?.rationale ?? "", /weighed/, "c2.exit2: …with a rationale citing the human suggestion she weighed (law 73 context input, not instruction)");
  // The re-ADMISSION door (a fresh sweep read after withdrawal) is GM-10's PR-2 obligation and
  // is NOT proven here — C.14 carries that cell. This cell proves only that the POST half of
  // exit 2 is lawful once a draft exists.
  noteLane("c2.exit2 proves the POST half of OQ-4 exit 2; the re-admission door after withdrawal is GM-10's PR-2 obligation (C.14)");
});

test("f-a2.c2.A9 a closing_transfer entry refuses -> CLR03", async (t) => {
  if (await gateCore(t)) return;
  const p = await agentPostable(OWNER(), { client: A1() });
  await rootQuery("update clara.journal_entries set entry_kind='closing_transfer' where id=$1", [p.args.entry])
    .catch((e) => noteLane(`c2.A9: could not stamp closing_transfer (${e.code}: ${e.message}) — the immutability guard may forbid the doctoring, in which case the cell's premise moves`));
  await assertTierARaise(() => wakePostEntry(p.cred, p.args),
    { code: "CLR03", entry: p.args.entry, label: "c2.A9 closing_transfer" });
});

test("f-a2.c2.lock the row lock precedes every ladder read — two concurrent posts of one entry, exactly one wins", async (t) => {
  if (await gateCore(t)) return;
  const p = await agentPostable(OWNER(), { client: A1() });
  const sql =
    "select clara.wake_post_entry(p_entry => $1, p_expected_revision => $2, p_client => $3, "
    + "p_books_version => $4::bigint, p_rationale => $5, p_model => $6::jsonb, p_op_key => $7) as r";
  const side = (key) => ({
    role: ROLES.wakeInteractive, wakeSecret: p.cred.secret,
    run: (c) => c.query(sql, [p.args.entry, p.args.expectedRevision, A1(), p.args.booksVersion,
      RATIONALE, JSON.stringify(MODEL), key]).then((r) => r.rows[0].r),
  });
  const out = await holdThenContend({ a: side(opk("c2lockA")), b: side(opk("c2lockB")) });
  assert.ok(out.provedBlocked,
    "c2.lock: the second session BLOCKED on the first — proven via pg_blocking_pids, never a sleep. An unblocked pair means the FOR UPDATE does not precede the ladder reads");
  const posted = [out.a, out.b].filter((s) => s?.ok && s.receipt?.posted === true);
  assert.equal(posted.length, 1, `c2.lock: exactly ONE of the two posts (a=${JSON.stringify(out.a)}, b=${JSON.stringify(out.b)})`);
  assert.equal(await postReceiptCount(p.args.entry), 1,
    "c2.lock: …and exactly one entry_post_receipts row exists — unique(entry_id) plus the lock, not one or the other");
});

test("f-a2.c2.positive the control: an untouched agent draft on a corroborated document POSTS, with an all-pass vector", async (t) => {
  if (await gateCore(t)) return;
  const p = await agentPostable(OWNER(), { client: A1() });
  const receipt = await wakePostEntry(p.cred, p.args);
  assert.equal(receipt?.posted, true,
    `c2.positive: the ladder admits a clean agent draft — if THIS refuses, every negative cell above is green for the wrong reason (${JSON.stringify(receipt?.refusal)})`);
  assertVectorShape(assert, receipt?.rung_vector, "c2.positive");
  assert.ok(admitsAll(receipt.rung_vector),
    `c2.positive: an EMPTY failing-rung vector is the only thing that posts (non-admitting: ${JSON.stringify(receipt.rung_vector)})`);
  assert.equal((await entryRow(p.args.entry))?.status, "approved", "c2.positive: the entry really moved to approved");
});
