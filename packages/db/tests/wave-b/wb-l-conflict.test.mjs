// GATE L — the CONFLICTING-EVIDENCE-PAIR closure (labelled SYNTHETIC, rig-only · ADR-048).
//
// WHAT THE GATE ACTUALLY CLAIMS, taken from the receipts and not from a paraphrase:
//   contract-draft-v0.2 §4: "Gate L (lint): a seeded contradiction/stale claim surfaces on
//   schedule to the owner; caps enforced visibly."
//   gate-p-and-l-evidence-2026-07-26.md: "a genuinely conflicting pair of REAL sources
//   surfaces as a lint finding on schedule."
//   vision-alignment-audit-2026-07-27.md: "Contradictions become lint findings for a human
//   (Gate L's machinery); never auto-resolved."
//
// WHY IT WAS DEFERRED, and why this file is allowed to exist. ADR-046 deferred the conflict
// half because the only real candidate AGREES: Bee Creative's YA2024 closing net position and
// its YA2025 `CAPITAL — BALANCE B/F` are both (65,747.97), to the sen. That is a corroboration,
// not a conflict, and manufacturing a disagreement in LIVE knowledge would be fabrication —
// contract-draft-v0.2 §A11 says so in as many words ("never a fabricated source planted in live
// knowledge"). The same paragraph sanctions the other half of the answer: "Destructive/
// fault-injection variants run in the rig." This file is that rig variant, and the owner ruled
// it in as a labelled synthetic closure (ADR-048). NOTHING here touches live data.
//
// THE MECHANISM, pinned by probe before a line of this was written (0017's belt, the typed
// contradiction detector): two CURRENTLY-PUBLISHED pages of one client carrying citations with
// the SAME `detail.subject_key` and a DIFFERENT `detail.value` open a `contradiction` finding —
// severity critical, dedupe_key over the ordered page pair, and a detail that records BOTH
// values. The shape of that detail is the whole gate: the system records that two sources
// disagree and what each of them says. It never picks one, and it never edits either page.
//
// The conflicting pair here is DOCUMENT-backed on both sides (source_kind='document', two
// distinct filed documents), because "two evidence sources disagree on a figure" is the claim
// under test — a pair of human notes would prove something weaker. The values mirror the real
// Bee Creative corroboration one sen apart, so the control case below is the true corpus
// reading and the conflict case is that reading minus one sen.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  CLR, CLR32, rootQuery, opk, assertRaises, endPool, printLaneNotes,
  fail0017, wbEnsureReady, detailReason,
  buildWaveBWorld, createClient, filedDocument, publishWikiPage, citationRows, pageRow,
  runClientLint, runLintAll, getLintFinding, resolveLintFinding,
  findingRows, openFinding, findingEventRows, latestLintRun,
  listReviewQueue, humanPersona, collectRowKind, notificationsMatching,
} from "./wb-fixtures.mjs";
import { maxSeq } from "../rig-events-helpers.mjs";

let live = false;
let w = null;

/** The subject two sources are allowed to disagree about. */
const SUBJECT = "capital:balance_bf";
/** The real Bee Creative figure, in sen — the corroborated value both YA sets state. */
const AGREED = "6574797";
/** The same figure one sen light: the smallest disagreement that is still a disagreement. */
const CONFLICTING = "6574796";

/** One document-backed citation asserting `value` for SUBJECT. */
const cite = (documentId, value, sourceAt = "2026-01-01T00:00:00Z") => [{
  source_kind: "document",
  document_id: documentId,
  detail: { subject_key: SUBJECT, value, source_at: sourceAt },
}];

/** Publish one page whose sole citation is a filed document stating `value`. */
async function statedBy(client, slug, title, value, sourceAt) {
  const doc = await filedDocument(w.users.alice, { firm: w.firms.A, client, kind: "management_account" });
  const r = await publishWikiPage({
    client, firm: w.firms.A, slug, title,
    content: `# ${title}\n${SUBJECT} = ${value}`,
    citations: cite(doc.documentId, value, sourceAt),
  });
  return { doc, publish: r, page: (await pageRow(client, slug)).id };
}

before(async () => {
  live = await wbEnsureReady();
  if (!live) return;
  w = await buildWaveBWorld();
});
after(async () => { printLaneNotes("wb-l-conflict"); await endPool(); });

// ---------------------------------------------------------------------------
// The gate's own claim.
// ---------------------------------------------------------------------------

test("GATE L: two documents stating DIFFERENT values for one subject open a critical contradiction", async () => {
  fail0017(live);
  const a = await statedBy(w.clients.A1, "gl-ya2024", "YA2024 closing", AGREED);
  const b = await statedBy(w.clients.A1, "gl-ya2025", "YA2025 opening", CONFLICTING);
  w._pair = { a, b };

  await runClientLint({ client: w.clients.A1 });
  const f = await openFinding(w.clients.A1, "contradiction");
  assert.ok(f, "the conflicting pair surfaced as a lint finding");
  assert.equal(f.severity, "critical", "a disagreement about a figure is critical, not advisory");

  // The identity is the PAGE PAIR, order-independent — so the same conflict seen from either
  // side is one episode, not two.
  const [lo, hi] = [a.page, b.page].sort();
  assert.equal(f.dedupe_key, `contradiction:${lo}:${hi}`, "dedupe over the ordered page pair");

  // THE POINT OF THE GATE: the finding records BOTH readings and the subject they disagree
  // about. It does not carry a winner, a delta, or a correction.
  assert.equal(f.detail.subject_key, SUBJECT);
  const values = [f.detail.value_a, f.detail.value_b].map(String).sort();
  assert.deepEqual(values, [CONFLICTING, AGREED].sort(),
    "both sources' values are recorded verbatim — neither is dropped");
  assert.deepEqual([f.detail.page_a, f.detail.page_b].sort(), [lo, hi],
    "both pages are named so a human can open either");
  w._f = f;
});

test("GATE L CONTROL: two documents AGREEING to the sen open NOTHING — corroboration is not conflict", async () => {
  fail0017(live);
  // This is the REAL corpus reading (ADR-046): Bee Creative's YA2024 closing and YA2025
  // BALANCE B/F both state 65,747.97. If agreement tripped the detector, the live deferral
  // would have been a false alarm and every corroborated client would drown in findings.
  const client = w.clients.A2;
  await statedBy(client, "gl-agree-2024", "YA2024 closing", AGREED);
  await statedBy(client, "gl-agree-2025", "YA2025 opening", AGREED);

  await runClientLint({ client });
  assert.equal(await openFinding(client, "contradiction"), null,
    "identical values across two independent documents are a corroboration, not a contradiction");
});

test("GATE L: the conflict is SURFACED, never auto-resolved — both pages stand untouched", async () => {
  fail0017(live);
  const { a, b } = w._pair;
  // Neither page was edited, retired, superseded, or reconciled by the belt. No `??` fallback
  // on the version id: a defensive default here would turn this into a tautology the day the
  // publish receipt changes shape, which is exactly when it needs to fail.
  for (const [source, slug] of [[a, "gl-ya2024"], [b, "gl-ya2025"]]) {
    const row = await pageRow(w.clients.A1, slug);
    assert.equal(row.state, "active", `${slug} is still active`);
    assert.ok(source.publish.version_id, `${slug} published a version id to compare against`);
    assert.equal(row.current_version_id, source.publish.version_id,
      `${slug} still points at the version it published`);
  }
  // And each citation still states its OWN value — the belt read them, it did not rewrite them.
  const av = (await citationRows(a.publish.version_id))[0];
  const bv = (await citationRows(b.publish.version_id))[0];
  assert.equal(av.detail.value, AGREED, "source A keeps its reading");
  assert.equal(bv.detail.value, CONFLICTING, "source B keeps its reading");
  assert.equal(av.detail.subject_key, bv.detail.subject_key, "they genuinely address ONE subject");
});

// ---------------------------------------------------------------------------
// "on schedule to the owner" — the surfacing half of the clause.
// ---------------------------------------------------------------------------

test("GATE L: the SCHEDULED sweep DISCOVERS a conflict nobody pointed it at", async () => {
  fail0017(live);
  // "surfaces ON SCHEDULE" is the load-bearing half of the clause, so this client's conflict is
  // never handed to a per-client call: the only thing that ever runs against it is the sweep.
  const fresh = await createClient(w.users.alice, { name: `${w.prefix}_L_sweep`, opKey: opk("cli") });
  await statedBy(fresh, "gl-sweep-a", "Source A", AGREED);
  await statedBy(fresh, "gl-sweep-b", "Source B", CONFLICTING);
  assert.equal((await findingRows(fresh)).length, 0, "nothing has looked at this client yet");

  const r = await runLintAll();
  assert.ok(r, "the scheduled sweep returns a receipt");
  assert.ok(await latestLintRun(), "and writes an append-only lint_runs row");

  const f = await openFinding(fresh, "contradiction");
  assert.ok(f, "the sweep reached a client it was never told about and opened the finding");
  assert.equal(f.severity, "critical");
});

test("GATE L: ONE open episode per pair — repeated passes neither duplicate nor re-event", async () => {
  fail0017(live);
  const seq0 = await maxSeq(w.firms.A);
  await runClientLint({ client: w.clients.A1 });
  await runClientLint({ client: w.clients.A1 });
  const open = (await findingRows(w.clients.A1))
    .filter((f) => f.finding_kind === "contradiction" && f.state === "open");
  assert.equal(open.length, 1, "one open episode for the pair");
  assert.equal(await maxSeq(w.firms.A), seq0,
    "an unchanged still-true condition is not a transition — no new event");
});

test("GATE L: the owner is notified EXACTLY ONCE, and the queue ranks it needs-you", async () => {
  fail0017(live);
  await runClientLint({ client: w.clients.A1 });
  const notes = await notificationsMatching(w._f.id);
  assert.equal(notes.length, 1, `one notification per episode (got ${notes.length})`);

  const q = await listReviewQueue(humanPersona(w.users.alice), {});
  const mine = collectRowKind(q, "lint_finding").find((r) => r.finding_id === w._f.id);
  assert.ok(mine, "the contradiction rides row_kind='lint_finding' into the review queue");
  assert.ok(mine.section === "needs_you" || Number(mine.section_rank) === 1,
    `critical → needs_you / rank 1 (got section=${mine.section} rank=${mine.section_rank})`);
});

// ---------------------------------------------------------------------------
// Adjudication — the human act the gate exists to route to.
// ---------------------------------------------------------------------------

test("GATE L: the card hydrates, and only a bookkeeper+ with a TYPED conclusion may resolve", async () => {
  fail0017(live);
  const card = await getLintFinding(w.users.alice, { finding: w._f.id });
  assert.ok(card, "the finding hydrates into a real card, not an unknown-kind placeholder");

  const bad = await assertRaises(CLR32, () => resolveLintFinding(w.users.bob, {
    finding: w._f.id, conclusion: "looks fine to me",
  }), "an untyped conclusion");
  if (detailReason(bad)) assert.equal(detailReason(bad), "bad_conclusion");
  await assertRaises(CLR.authz, () => resolveLintFinding(w.users.carol, {
    finding: w._f.id, conclusion: "accepted_revision",
  }), "a viewer resolving a contradiction");

  await resolveLintFinding(w.users.bob, {
    finding: w._f.id, conclusion: "accepted_revision",
    note: "YA2025 restates the prior year deliberately; the one-sen delta is a known rounding correction",
  });
  const f = (await findingRows(w.clients.A1)).find((x) => x.id === w._f.id);
  assert.equal(f.state, "resolved");
  assert.ok(f.resolved_by && f.resolved_at && f.resolved_conclusion, "resolution is all-or-nothing");
  assert.ok((await findingEventRows(w._f.id)).some((e) => e.event_kind === "resolved"),
    "the resolution is on the event trail");
});

test("GATE L: resolving does not RESOLVE the conflict — a re-run opens a new episode citing the prior", async () => {
  fail0017(live);
  // The documents still disagree. A human's conclusion closes the EPISODE, not the fact, and
  // the belt says so again rather than staying quiet because someone once clicked resolve.
  await runClientLint({ client: w.clients.A1 });
  const again = await openFinding(w.clients.A1, "contradiction");
  assert.ok(again, "the still-true condition opens a fresh episode");
  assert.notEqual(again.id, w._f.id, "a NEW row, not a reopen");
  assert.equal(again.prior_finding_id, w._f.id, "the recheck link back to the resolved episode");
});

test("GATE L: a conflict on one client NEVER opens a finding on another", async () => {
  fail0017(live);
  const other = (await findingRows(w.clients.A2))
    .filter((f) => f.finding_kind === "contradiction");
  assert.equal(other.length, 0, "the A1 pair is invisible to A2 — findings are client-scoped");
});

// ---------------------------------------------------------------------------
// The clause's other named half: a STALE claim.
// ---------------------------------------------------------------------------

test("GATE L: a NEWER source for the same subject makes the older claim STALE", async () => {
  fail0017(live);
  // Same subject, same value, different source_at: nothing is contradicted, but the older page
  // is no longer the freshest statement of it. The gate names this case beside contradiction.
  const client = w.clients.A2;
  await statedBy(client, "gl-stale-old", "Old statement", AGREED, "2025-01-01T00:00:00Z");
  await statedBy(client, "gl-stale-new", "Newer statement", AGREED, "2026-06-30T00:00:00Z");

  await runClientLint({ client });
  const f = await openFinding(client, "stale_claim");
  assert.ok(f, "the superseded-by-freshness claim surfaced");
  assert.equal(f.detail.subject_key, SUBJECT);
  assert.ok(f.detail.newer_source_at > f.detail.source_at,
    `the finding names both timestamps (got ${JSON.stringify(f.detail)})`);
  // Still not auto-resolved: agreeing values must NOT also read as a contradiction.
  assert.equal(await openFinding(client, "contradiction"), null,
    "a stale claim is not a contradiction — the values agree");
});

test("GATE L: the comparison is TYPE-STRICT — `6574797` and \"6574797\" read as a disagreement", async () => {
  fail0017(live);
  // Measured, not assumed (probed before this cell was written). The detector compares the raw
  // JSONB `detail.value` with `is distinct from`, so a number and a string carrying the same
  // digits are two different claims and open a contradiction.
  //
  // This OVER-reports: both sources do state the same figure. It is pinned here rather than
  // filed as a defect because the alternative is worse — deciding that two differently-typed
  // values "mean the same number" is a coercion, and this codebase refuses rather than coerces
  // (over-reporting costs an interruption; under-reporting hides a real conflict).
  //
  // THE OPERATIONAL CONSEQUENCE, which is the reason to pin it: any producer writing citations
  // must record `detail.value` in ONE canonical form per subject_key. Two producers that agree
  // on the figure but disagree on the encoding will manufacture findings forever.
  const client = await createClient(w.users.alice, { name: `${w.prefix}_L_typed`, opKey: opk("cli") });
  await statedBy(client, "gl-type-str", "String-encoded", AGREED);         // "6574797"
  await statedBy(client, "gl-type-num", "Number-encoded", Number(AGREED)); // 6574797

  await runClientLint({ client });
  const f = await openFinding(client, "contradiction");
  assert.ok(f, "a type difference is a difference — the detector does not normalize");
  assert.deepEqual(
    [f.detail.value_a, f.detail.value_b].map((v) => typeof v).sort(),
    ["number", "string"],
    "and the finding records each source's encoding verbatim",
  );
});

test("META: the L taxonomy names BOTH kinds this gate's clause depends on", async () => {
  fail0017(live);
  const kinds = await rootQuery(
    `select pg_get_constraintdef(c.oid) as def from pg_constraint c
      join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
      where n.nspname='clara' and t.relname='lint_findings' and c.contype='c'
        and pg_get_constraintdef(c.oid) like '%finding_kind%'`);
  const def = kinds.rows.map((r) => r.def).join(" ");
  for (const kind of ["contradiction", "stale_claim"]) {
    assert.ok(def.includes(kind), `the taxonomy names '${kind}'`);
  }
  // The belt's runtime-GROUP-only grant is pinned by wb-l-lint's META cell; not re-asserted
  // here, because a second weaker copy of an existing guarantee is worse than none.
});
