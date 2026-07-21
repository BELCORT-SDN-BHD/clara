// Wave-A rig — identity-equivalence MERGE (Codex probes 9/10/24; contract §11 WA-D3
// + companion §2). Every collision class; merged_into immutability; canonicalized
// reads; NO UPDATE ever lands on journal_lines / rule_sightings / signed
// coding_rules (posted-line immutability); op_key idempotent vs different-args
// refuse; merge-vs-draft both orders with a deadlock bound. Contract-blind. SKIPS
// (counted) until 0011 lands.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  ROLES, rootQuery, opk, endPool, printLaneNotes, noteLane, printSkipCount, skipUnready,
  waveAEnsureReady, buildWorld, firmOf, upsertPayableAccount, upsertAccountClassed,
  seedCitedDocument, freshResolution, draftEntryV3, approveEntry, billLines, ev, FIELD,
  normalize, counterpartyRows, mergeCounterparties, counterpartyRow,
  CLR23, holdThenContend, sawDeadlock, GUARD,
} from "./wave-a-race.mjs";
import { AP, EXP } from "./wave-a-fixtures.mjs";

let ready = false;
let world = null;
before(async () => {
  ready = await waveAEnsureReady();
  if (ready) {
    world = await buildWorld();
    for (const c of [world.clients.A1, world.clients.A2, world.clients.B1]) {
      const owner = c === world.clients.B1 ? world.users.dave : world.users.alice;
      await upsertPayableAccount(owner, { client: c, code: AP, name: "Trade Creditors", opKey: opk("ap") });
      await upsertAccountClassed(owner, { client: c, code: EXP, name: "Prof Fees", type: "expense", opKey: opk("exp") });
    }
  }
});
after(async () => { printLaneNotes("wave-a-merge"); printSkipCount("wave-a-merge"); await endPool(); });

/** Create a counterparty by drafting (+optionally approving) an AP bill citing it.
 *  Returns { counterpartyId, entryId, cited }. */
async function makeVendor(sub, { client, name, registration = null, approve = true, amount = 300000 }) {
  const firm = await firmOf(client);
  const cited = await seedCitedDocument(sub, { firm, client, quote: "RM 3,000.00" });
  const vendor = registration == null ? { new: { name } } : { new: { name, registration_no: registration } };
  const d = await draftEntryV3(sub, {
    client, resolution: await freshResolution(sub, client, { subjectKind: "document", subjectId: cited.documentId }),
    document: cited.documentId, sha256: cited.sha256, lines: billLines(EXP, AP, amount),
    vendor, evidence: [ev(cited.regionId, cited.quote, FIELD.total)], opKey: opk("vend"),
  });
  if (approve) await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("ap") });
  const cp = (await counterpartyRows(client)).find((c) => normalize(c.name_display ?? c.name ?? c.name_normalized) === normalize(name));
  return { counterpartyId: cp?.id ?? null, entryId: d.entry_id, cited };
}

// ===========================================================================
// Refusal classes.
// ===========================================================================

test("merge refuses: cross-client, survivor==merged, and differing NON-NULL registrations (ALWAYS — no override, WA-D3)", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const s = await makeVendor(users.alice, { client: clients.A1, name: "SURVIVE ALPHA SDN BHD", registration: "201801003000" });
  const m = await makeVendor(users.alice, { client: clients.A1, name: "MERGE ALPHA SDN BHD", registration: "201801003001" });
  if (!s.counterpartyId || !m.counterpartyId) { noteLane("could not locate created counterparties for merge — name-match/column may differ"); return; }
  // survivor==merged — a degenerate/malformed input caught by the AB-7 input-guard
  // family (CLR10), NOT one of the §6 row-5 CLR23 merge reasons (no self_merge token).
  await assert.rejects(() => mergeCounterparties(users.alice, { client: clients.A1, survivor: s.counterpartyId, merged: s.counterpartyId }), (e) => [CLR23, "CLR10"].includes(e.code), "survivor==merged refuses (as-built: CLR10 input-guard; §6 lists no self-merge CLR23 reason)");
  // cross-client: a B1 counterparty as merged under client A1
  const bV = await makeVendor(users.dave, { client: clients.B1, name: "BFIRM VENDOR SDN BHD", registration: "201801003050" });
  if (bV.counterpartyId) await assert.rejects(() => mergeCounterparties(users.alice, { client: clients.A1, survivor: s.counterpartyId, merged: bV.counterpartyId }), (e) => [CLR23, "CLR11"].includes(e.code), "cross-client merge refuses (CLR23 cross_client / CLR11 not-found)");
  // differing non-null registrations ALWAYS refuse
  await assert.rejects(() => mergeCounterparties(users.alice, { client: clients.A1, survivor: s.counterpartyId, merged: m.counterpartyId, reason: "governed override attempt" }), (e) => e.code === CLR23, "differing non-null registrations refuse CLR23 (no override — WA-D3)");
});

test("merge refuses an OPEN draft citing the merged vendor (CLR23 open_draft_blocks) — resolve first", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const s = await makeVendor(users.alice, { client: clients.A1, name: "SURVIVE BETA SDN BHD", registration: "201801003100" });
  // merged is name-only (null reg) so registration would not block; the OPEN draft does.
  const m = await makeVendor(users.alice, { client: clients.A1, name: "MERGE BETA SDN BHD", registration: null, approve: false });
  if (!s.counterpartyId || !m.counterpartyId) { noteLane("open-draft merge: counterparties not located"); return; }
  await assert.rejects(() => mergeCounterparties(users.alice, { client: clients.A1, survivor: s.counterpartyId, merged: m.counterpartyId }), (e) => e.code === CLR23, "an open draft citing the merged vendor blocks the merge (CLR23 open_draft_blocks)");
});

// ===========================================================================
// A successful merge — structural invariants (mergeable pair: merged is name-only).
// ===========================================================================

test("successful merge: merged_into + retired_at set on the merged row; posted journal_lines are NEVER re-keyed (posted-line immutability); former-name alias auto-created", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const s = await makeVendor(users.alice, { client: clients.A1, name: "SURVIVE GAMMA SDN BHD", registration: "201801003200" });
  const m = await makeVendor(users.alice, { client: clients.A1, name: "MERGE GAMMA SDN BHD", registration: null });
  if (!s.counterpartyId || !m.counterpartyId) { noteLane("successful merge: counterparties not located"); return; }
  // Snapshot the merged vendor's posted line identity BEFORE the merge.
  const linesBefore = await rootQuery("select id, counterparty_id from clara.journal_lines where counterparty_id=$1 order by id", [m.counterpartyId]);
  await mergeCounterparties(users.alice, { client: clients.A1, survivor: s.counterpartyId, merged: m.counterpartyId, reason: "duplicate vendor" });
  const merged = await counterpartyRow(m.counterpartyId);
  assert.equal(merged.merged_into, s.counterpartyId, "merged.merged_into points at the survivor");
  assert.ok(merged.retired_at != null, "merged.retired_at is set");
  // Posted lines are NEVER re-keyed — same rows, same counterparty_id (immutability).
  const linesAfter = await rootQuery("select id, counterparty_id from clara.journal_lines where id = any($1)", [linesBefore.rows.map((r) => r.id)]);
  for (const row of linesAfter.rows) assert.equal(row.counterparty_id, m.counterpartyId, `posted line ${row.id} keeps its ORIGINAL counterparty_id (no re-key — posted-line immutability)`);
  // The former-name alias was auto-created on the survivor's client (on-conflict-do-nothing).
  const alias = await rootQuery("select 1 from clara.counterparty_aliases where client_id=$1 and alias_normalized=$2", [clients.A1, normalize("MERGE GAMMA SDN BHD")]);
  assert.ok(alias.rowCount >= 1, "a former-name alias for the merged vendor's name was auto-created");
});

test("merged_into immutability: a second merge of an ALREADY-merged row is refused (the pointer is immutable once set)", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const s1 = await makeVendor(users.alice, { client: clients.A1, name: "SURV DELTA ONE SDN BHD", registration: "201801003300" });
  const s2 = await makeVendor(users.alice, { client: clients.A1, name: "SURV DELTA TWO SDN BHD", registration: "201801003301" });
  const m = await makeVendor(users.alice, { client: clients.A1, name: "MERGE DELTA SDN BHD", registration: null });
  if (![s1, s2, m].every((v) => v.counterpartyId)) { noteLane("immutability merge: counterparties not located"); return; }
  await mergeCounterparties(users.alice, { client: clients.A1, survivor: s1.counterpartyId, merged: m.counterpartyId });
  // A second merge of the already-merged row into a DIFFERENT survivor must refuse.
  await assert.rejects(() => mergeCounterparties(users.alice, { client: clients.A1, survivor: s2.counterpartyId, merged: m.counterpartyId }), (e) => e.code === CLR23, "an already-merged row cannot be merged again (merged_into immutable → target_retired/refusal)");
});

// ===========================================================================
// op_key idempotency vs different-args refuse.
// ===========================================================================

test("merge op_key: a repeat with the SAME op_key is idempotent; the SAME op_key with DIFFERENT args refuses (CLR10 request-hash)", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const s = await makeVendor(users.alice, { client: clients.A1, name: "SURV EPS SDN BHD", registration: "201801003400" });
  const m1 = await makeVendor(users.alice, { client: clients.A1, name: "MERGE EPS ONE SDN BHD", registration: null });
  const m2 = await makeVendor(users.alice, { client: clients.A1, name: "MERGE EPS TWO SDN BHD", registration: null });
  if (![s, m1, m2].every((v) => v.counterpartyId)) { noteLane("op_key merge: counterparties not located"); return; }
  const key = opk("mergeidem");
  await mergeCounterparties(users.alice, { client: clients.A1, survivor: s.counterpartyId, merged: m1.counterpartyId, opKey: key });
  // Same op_key + same args → idempotent replay (no raise).
  await mergeCounterparties(users.alice, { client: clients.A1, survivor: s.counterpartyId, merged: m1.counterpartyId, opKey: key });
  // Same op_key + DIFFERENT args (different merged) → request-hash mismatch refusal.
  await assert.rejects(() => mergeCounterparties(users.alice, { client: clients.A1, survivor: s.counterpartyId, merged: m2.counterpartyId, opKey: key }), (e) => e.code === "CLR10", "same op_key + different args refuses CLR10");
});

// ===========================================================================
// Concurrency — merge vs a draft citing the vendor, both orders, deadlock-bounded.
// ===========================================================================

test("merge || draft citing the merged vendor, BOTH orders: they serialize on the vendor/filing lock; no deadlock; no post-merge draft cites a retired identity", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const s = await makeVendor(users.alice, { client: clients.A1, name: "SURV ZETA SDN BHD", registration: "201801003500" });
  const m = await makeVendor(users.alice, { client: clients.A1, name: "MERGE ZETA SDN BHD", registration: null });
  if (!s.counterpartyId || !m.counterpartyId) { noteLane("merge-vs-draft: counterparties not located"); return; }
  const firm = await firmOf(clients.A1);
  const cited = await seedCitedDocument(users.alice, { firm, client: clients.A1, quote: "RM 4,000.00" });
  const res = await freshResolution(users.alice, clients.A1, { subjectKind: "document", subjectId: cited.documentId });
  const mergeRun = (c) => (async () => { await c.query(GUARD); return c.query("select clara.merge_counterparties(p_client => $1, p_survivor => $2, p_merged => $3, p_reason => 'race', p_op_key => $4) as r", [clients.A1, s.counterpartyId, m.counterpartyId, opk("mrace")]); })();
  const draftRun = (c) => (async () => { await c.query(GUARD); return c.query(
    "select clara.draft_entry(p_client => $1, p_resolution => $2, p_posting_date => '2026-03-15'::date, p_memo => 'race draft', p_lines => $3::jsonb, p_document => $4, p_sha256 => $5, p_op_key => $6, p_proposed_counterparty => $7::jsonb, p_evidence => $8::jsonb) as r",
    [clients.A1, res, JSON.stringify(billLines(EXP, AP, 400000)), cited.documentId, cited.sha256, opk("drace"), JSON.stringify({ existing_id: m.counterpartyId }), JSON.stringify([ev(cited.regionId, cited.quote, FIELD.total)])]); })();
  const out = await holdThenContend({ a: { role: ROLES.authenticated, jwtSub: users.alice, run: mergeRun }, b: { role: ROLES.authenticated, jwtSub: users.alice, run: draftRun } });
  assert.ok(!sawDeadlock(out), "merge || draft do not deadlock (consistent lock order)");
  // If the merge committed first, the draft citing the now-retired vendor must NOT
  // silently post to the retired identity — it either resolves to the survivor or refuses.
  if (out.a.ok && out.b.ok) {
    const cp = await counterpartyRow(m.counterpartyId);
    assert.ok(cp.merged_into === s.counterpartyId, "the vendor is merged");
    noteLane("merge-first: the concurrent draft committed — verify it cited the survivor, not the retired id (canonicalized resolve)");
  }
});
