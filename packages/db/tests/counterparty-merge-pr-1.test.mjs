// 裁-19 PR-1 — the counterparty-merge CANONICALISING READ LAYER, the clara.counterparty_merges
// carrier, and M9. Design of record: docs/plan/active/counterparty-merge-design.md §3.1/§3.3/
// §3.4 · mechanics counterparty-merge-annexes.md A.1/A.2/B.2/C · gate record
// counterparty-merge-gate-record.md · ruling mohe-grill-rulings-2026-08-28.md §裁-24.
//
// WHAT THIS BATTERY DOES **NOT** COVER, said once here rather than implied by absence:
// 裁-24's re-home WRITE door (an appended pair under the survivor carrying the ORIGINAL
// item_date) is NOT in PR-1 — clara._subledger_classify_entry canonicalises on every ladder,
// so after a merge the two parties ARE one canonical group and clara._tf_subledger_item_belt
// refuses the minted row. Cell cm.11 pins both belts BYTE-UNCHANGED so this battery cannot be
// mistaken for evidence about a door that is not here. The migration header carries the full
// measurement and the owner question.
//
// TWO GATES, ON PURPOSE. The M2/M3/M9 defect cells gate ONLY on the subledger substrate, so on
// a database WITHOUT this PR's migration they RUN AND RED — that is the discriminating proof a
// defect cell exists to give. The carrier cells gate on clara.counterparty_merges and, absent
// it, FAIL unless CLARA_ALLOW_MISSING_CPMERGE=1 declares the pre-PR shape: a cell that only
// ever skips is a false green.
//
// THE MUTANT TABLE — one per wall, each recorded with the table/body it attacks:
//   W1  clara.open_items              · UPDATE counterparty_id as SUPERUSER   -> CLR08   (cm.9)
//   W2  clara.counterparty_merges     · DELETE a merge record                 -> CLR08   (cm.13)
//   W3  clara.counterparty_merges     · edit `reason` (a non-reversal column) -> CLR08   (cm.13)
//   W4  clara.counterparty_merges     · a SECOND reversal stamp               -> CLR08   (cm.13)
//   W5  clara.counterparty_merges     · a second LIVE row for one merged_id   -> 23505   (cm.16)
//   W6  clara.counterparty_merges     · unmerged_at without unmerged_by       -> 23514   (cm.16)
//   W7  clara.counterparty_merges     · survivor_id = merged_id               -> 23514   (cm.16)
//   W8  clara.counterparty_merges     · a party of ANOTHER client (triple FK) -> 23503   (cm.16)
//   W9  clara.counterparty_merges     · firm B reads firm A's rows            -> 0 rows  (cm.12)
//   W10 clara.counterparty_merges     · clara_authenticated INSERT            -> 42501   (cm.12)
//   W11 clara._canonical_counterparty · a >8-deep merge chain, through ar_aging -> CLR23 (cm.6)
//   W12 clara.merge_counterparties    · re-merging an already-merged party    -> CLR23   (cm.15)
//   W13 clara.merge_counterparties    · all SIX pre-existing refusals, by NAME (cm.19) — D-05's
//       "the same six refusals" is a claim about behaviour, so it is DRIVEN, never grepped.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, humanQuery, endPool, reasonOf, draftEntryV3 } from "./a21-helpers.mjs";
import { manualRes } from "./x38-match-fixtures.mjs";
import {
  cmBaseReady, cmCarrierReady, cmBuildWorld, customer, customerWithReg, arItem, mergeCp,
  arAging, custStatement, listOpenItems, arTie, carrierRows, counterpartyRow,
  recordedPartyMap, bodySha, agingRow, caught, birthCounterparty, AR_CTL, REV,
} from "./counterparty-merge-pr-1-fixtures.mjs";

const AS_OF = "2034-12-31";
let base = false;
let carrier = false;
let world = null;

before(async () => {
  base = await cmBaseReady();
  carrier = await cmCarrierReady();
  if (base) world = await cmBuildWorld();
});
after(async () => { await endPool(); });

/** The substrate gate: a pre-subledger database has no doors to drive at all. */
function needBase(t) {
  if (base) return false;
  t.skip("the 0037-0040 subledger/bank substrate is absent — no door to drive");
  return true;
}
/** The carrier gate — FAIL-CLOSED unless the pre-PR shape is DECLARED. */
function needCarrier(t) {
  if (needBase(t)) return true;
  if (carrier) return false;
  if (process.env.CLARA_ALLOW_MISSING_CPMERGE === "1") {
    t.skip("clara.counterparty_merges absent and the pre-PR shape is DECLARED (CLARA_ALLOW_MISSING_CPMERGE=1)");
    return true;
  }
  assert.fail("clara.counterparty_merges is absent and nothing declared a pre-PR database — set CLARA_ALLOW_MISSING_CPMERGE=1 only when that is deliberate");
  return true;
}

/** Two duplicate customers with DISTINCT non-round balances, on a fresh pair. */
async function duplicatePair(sub, client, { survivorCents, mergedCents, survivorDate, mergedDate }) {
  const survivor = await customer(sub, client, "SURV");
  const merged = await customer(sub, client, "DUPE");
  const sItem = await arItem(sub, { client, cp: survivor, cents: survivorCents, postingDate: survivorDate });
  const mItem = await arItem(sub, { client, cp: merged, cents: mergedCents, postingDate: mergedDate });
  return { survivor, merged, sItem, mItem };
}

// ===========================================================================
// THE THREE READ RECUTS — M2, M3, M9. These cells RED on a pre-PR database.
// ===========================================================================

test("cm.1 (M2) after a merge ar_aging shows ONE counterparty row, at the EXACT summed cents; the merged party is not its own row", async (t) => {
  if (needBase(t)) return;
  const sub = world.users.alice, client = world.clients.A1;
  const p = await duplicatePair(sub, client, {
    survivorCents: 731_17, mergedCents: 419_83, survivorDate: "2034-12-20", mergedDate: "2034-06-11",
  });
  await mergeCp(sub, { client, survivor: p.survivor, merged: p.merged });

  const aging = await arAging(sub, { client, asOf: AS_OF });
  const sRow = agingRow(aging, p.survivor);
  assert.ok(sRow, "cm.1: the survivor has an aging row");
  assert.equal(agingRow(aging, p.merged), null, "cm.1: the merged party is NOT its own aging row any more (finding M2)");
  assert.equal(Number(sRow.total_cents), 731_17 + 419_83, "cm.1: the survivor's total is the EXACT sum of both parties' outstanding, to the cent");
  assert.equal(sRow.items.length, 2, "cm.1: both items are listed under the survivor");
  // The merged party's 2034-06-11 item is >90 days before 2034-12-31; the survivor's
  // 2034-12-20 one is 11 days old. Distinct buckets prove the fold did not re-date anything.
  assert.equal(Number(sRow.d91_plus_cents), 419_83, "cm.1: the folded item keeps its OWN age — it lands in 91+, not in current");
  assert.equal(Number(sRow.current_cents), 731_17, "cm.1: the survivor's own recent item stays current");
});

test("cm.2 (OQ-2/D-03) every folded aging item carries recorded_counterparty_id, and the party carries resolution", async (t) => {
  if (needBase(t)) return;
  const sub = world.users.alice, client = world.clients.A1;
  const p = await duplicatePair(sub, client, {
    survivorCents: 512_29, mergedCents: 348_61, survivorDate: "2034-12-01", mergedDate: "2034-12-02",
  });
  await mergeCp(sub, { client, survivor: p.survivor, merged: p.merged });
  const sRow = agingRow(await arAging(sub, { client, asOf: AS_OF }), p.survivor);
  const byItem = Object.fromEntries(sRow.items.map((i) => [i.item_id, i.recorded_counterparty_id]));
  assert.equal(byItem[p.sItem.item], p.survivor, "cm.2: the survivor's own item was RECORDED under the survivor");
  assert.equal(byItem[p.mItem.item], p.merged, "cm.2: the folded item still says which name the invoice was raised under (OQ-2) — the audit trail the fold must not erase");
  assert.equal(sRow.resolution, "canonical", "cm.2: a resolvable party is tagged canonical");
});

test("cm.3 (M3) after a merge BOTH statements return the union, at the exact closing balance, each row naming the party it was raised under", async (t) => {
  if (needBase(t)) return;
  const sub = world.users.alice, client = world.clients.A1;
  const p = await duplicatePair(sub, client, {
    survivorCents: 903_41, mergedCents: 216_07, survivorDate: "2034-03-04", mergedDate: "2034-03-05",
  });
  await mergeCp(sub, { client, survivor: p.survivor, merged: p.merged });

  const viaSurvivor = await custStatement(sub, { client, cp: p.survivor, from: "2034-01-01", to: AS_OF });
  const viaMerged = await custStatement(sub, { client, cp: p.merged, from: "2034-01-01", to: AS_OF });
  for (const [label, st] of [["survivor", viaSurvivor], ["merged", viaMerged]]) {
    const items = (st.rows ?? []).filter((r) => r.row_type === "item").map((r) => r.item_id);
    assert.ok(items.includes(p.sItem.item), `cm.3 (${label}): the survivor's item is in the statement`);
    assert.ok(items.includes(p.mItem.item), `cm.3 (${label}): the MERGED party's item is in the statement — pre-fix it was in NEITHER (M3 is an absence, not a divergence)`);
    assert.equal(Number(st.closing_balance_cents), 903_41 + 216_07, `cm.3 (${label}): the closing balance is the exact union, to the cent`);
    assert.equal(st.counterparty_id, p.survivor, `cm.3 (${label}): the statement is keyed on the CANONICAL party`);
  }
  const recorded = Object.fromEntries((viaSurvivor.rows ?? []).filter((r) => r.row_type === "item").map((r) => [r.item_id, r.recorded_counterparty_id]));
  assert.equal(recorded[p.mItem.item], p.merged, "cm.3: each statement row names which party it was RAISED under (OQ-2)");
  assert.equal(recorded[p.sItem.item], p.survivor, "cm.3: and the survivor's own row names the survivor");
});

test("cm.4 (A-3, the inverted twin) with NO merge in play the recut is a NO-OP: one party, one row, its own items only", async (t) => {
  if (needBase(t)) return;
  const sub = world.users.alice, client = world.clients.A2;
  const lone = await customer(sub, client, "LONE");
  const other = await customer(sub, client, "OTHER");
  const a = await arItem(sub, { client, cp: lone, cents: 655_13, postingDate: "2034-09-09" });
  await arItem(sub, { client, cp: other, cents: 128_77, postingDate: "2034-09-10" });

  const aging = await arAging(sub, { client, asOf: AS_OF });
  const row = agingRow(aging, lone);
  assert.equal(Number(row.total_cents), 655_13, "cm.4: an unmerged party's total is its own, unchanged");
  assert.equal(row.items.length, 1, "cm.4: and only its own item");
  assert.equal(row.items[0].recorded_counterparty_id, lone, "cm.4: recorded == canonical when nothing was merged");
  assert.ok(agingRow(aging, other), "cm.4: the other party is still its OWN row — the recut folds nothing that was not merged");
  const st = await custStatement(sub, { client, cp: lone, from: "2034-01-01", to: AS_OF });
  assert.deepEqual((st.rows ?? []).filter((r) => r.row_type === "item").map((r) => r.item_id), [a.item],
    "cm.4: the statement carries exactly the party's own item");
});

test("cm.5 (A-4/A-5, P4) the aging TOTALS object and the control tie are BYTE-IDENTICAL across a merge", async (t) => {
  if (needBase(t)) return;
  const sub = world.users.alice, client = world.clients.A1;
  const p = await duplicatePair(sub, client, {
    survivorCents: 447_19, mergedCents: 233_71, survivorDate: "2034-05-06", mergedDate: "2034-05-07",
  });
  const totalsBefore = JSON.stringify((await arAging(sub, { client, asOf: AS_OF })).totals);
  const tieBefore = JSON.stringify(await arTie({ client, asOf: AS_OF }));
  await mergeCp(sub, { client, survivor: p.survivor, merged: p.merged });
  const totalsAfter = JSON.stringify((await arAging(sub, { client, asOf: AS_OF })).totals);
  const tieAfter = JSON.stringify(await arTie({ client, asOf: AS_OF }));

  assert.equal(totalsAfter, totalsBefore, "cm.5: regrouping a sum does not move it — the aging totals object is byte-identical");
  assert.equal(tieAfter, tieBefore, "cm.5: and ar_control_tie is byte-identical, so no signed attestation is invalidated (P4)");
  assert.equal(JSON.parse(tieAfter).state, "tie", "cm.5: the tie is a TIE, not a mismatch — a fixture that never tied would prove nothing");
  assert.equal(Number(JSON.parse(tieAfter).diff_cents), 0, "cm.5: diff_cents is exactly 0 after the merge");
});

test("cm.6 (D-02, W11) a merge chain deeper than the resolver's bound RAISES out of ar_aging rather than returning a short answer", async (t) => {
  if (needBase(t)) return;
  // Its own client: a raising aging read would poison every later cell that shares one.
  const sub = world.users.dave, client = world.clients.B1;
  const chain = [];
  for (let i = 0; i < 10; i += 1) chain.push(await customer(sub, client, `CHAIN${i}`));
  const head = await arItem(sub, { client, cp: chain[0], cents: 100_00 + 37 + chain.length, postingDate: "2034-08-08" });
  assert.ok(head.item, "cm.6 mandatory setup: the head of the chain carries a real open item");
  for (let i = 0; i < 9; i += 1) {
    await mergeCp(sub, { client, survivor: chain[i + 1], merged: chain[i], reason: `cm1 chain hop ${i}` });
  }
  const err = await caught(() => arAging(sub, { client, asOf: AS_OF }));
  assert.ok(err, "cm.6: ar_aging REFUSES over a broken merge chain");
  assert.equal(err.code, "CLR23", "cm.6: with the resolver's own CLR23 — a data emergency is not hidden behind a short report");
});

test("cm.7 (M9, A-7 positive control) list_open_items_by_counterparty returns a NON-EMPTY list for a party with outstanding items and NO merge anywhere", async (t) => {
  if (needBase(t)) return;
  const sub = world.users.alice, client = world.clients.A2;
  const cp = await customer(sub, client, "M9POS");
  const it = await arItem(sub, { client, cp, cents: 274_53, postingDate: "2034-07-07" });
  const out = await listOpenItems(sub, { client, domain: "ar", cp });
  assert.ok(Array.isArray(out), "cm.7: the door returns an array");
  assert.equal(out.length, 1, "cm.7 (M9): the door returns the party's ONE outstanding item — pre-fix it passed the FIRM id where a CLIENT id is expected and returned [] for every party, always");
  assert.equal(out[0].id, it.item, "cm.7: and it is that party's own item");
  assert.equal(Number(out[0].outstanding_cents), 274_53, "cm.7: at the exact cents");
});

test("cm.8 (A-8) post-fix the door answers the same union for the merged party and the survivor, and the c.firm spelling is gone", async (t) => {
  if (needBase(t)) return;
  const sub = world.users.alice, client = world.clients.A1;
  const p = await duplicatePair(sub, client, {
    survivorCents: 811_23, mergedCents: 155_91, survivorDate: "2034-04-01", mergedDate: "2034-04-02",
  });
  await mergeCp(sub, { client, survivor: p.survivor, merged: p.merged });
  const viaS = (await listOpenItems(sub, { client, domain: "ar", cp: p.survivor })).map((i) => i.id).sort();
  const viaM = (await listOpenItems(sub, { client, domain: "ar", cp: p.merged })).map((i) => i.id).sort();
  assert.deepEqual(viaS, [p.sItem.item, p.mItem.item].sort(), "cm.8: the survivor's candidate list is the union of both parties' items");
  assert.deepEqual(viaM, viaS, "cm.8: and asking under the merged party's id returns the same union");
  const src = await rootQuery(
    "select pg_get_functiondef('clara.list_open_items_by_counterparty(uuid,text,uuid)'::regprocedure) as d");
  assert.equal(src.rows[0].d.includes("_canonical_counterparty(c.firm"), false,
    "cm.8: the M9 firm-for-client spelling appears ZERO times in the LIVE body — the drift guard against its reintroduction");
});

// ===========================================================================
// THE WALLS THIS PR DOES NOT MOVE.
// ===========================================================================

test("cm.9 (A-9, W1) the append-only wall still refuses an open_items UPDATE after the migration — as SUPERUSER", async (t) => {
  if (needBase(t)) return;
  const sub = world.users.alice, client = world.clients.A2;
  const cp = await customer(sub, client, "WALL");
  const other = await customer(sub, client, "WALL2");
  const it = await arItem(sub, { client, cp, cents: 391_47, postingDate: "2034-02-02" });
  const err = await caught(() => rootQuery("update clara.open_items set counterparty_id=$1 where id=$2", [other, it.item]));
  assert.ok(err, "cm.9: the UPDATE is refused");
  assert.equal(err.code, "CLR08", "cm.9: by _tf_append_only itself, CLR08 — constraint 14's wall is untouched by this PR");
  const still = await rootQuery("select counterparty_id::text as cp from clara.open_items where id=$1", [it.item]);
  assert.equal(still.rows[0].cp, cp, "cm.9: and the row is unmoved");
});

test("cm.10 (A-10) the _canonical_counterparty caller census now includes _aging_core, and the instrument DISCRIMINATES", async (t) => {
  if (needBase(t)) return;
  const r = await rootQuery(
    `select count(*)::int as n,
            bool_or(p.proname='_aging_core') as has_aging,
            bool_or(p.proname='_control_tie_core') as has_tie
       from pg_proc p join pg_namespace nn on nn.oid=p.pronamespace
      where nn.nspname='clara' and p.prosrc like '%_canonical_counterparty%'`);
  assert.equal(r.rows[0].has_aging, true, "cm.10: _aging_core is a caller — its ABSENCE was finding M2");
  assert.equal(r.rows[0].has_tie, false, "cm.10 (the instrument's positive control): _control_tie_core is NOT a caller, so the census discriminates rather than matching everything");
  assert.ok(r.rows[0].n >= 34, `cm.10: the census carries at least the pinned 33 + _aging_core (got ${r.rows[0].n})`);

  // THE CENSUS ABOVE IS A RAW prosrc MATCH and would count a body whose only mention of the
  // resolver sits in a COMMENT. Each recut body therefore also carries a CALL-SHAPED marker
  // count against a COMMENT-STRIPPED copy, at its own expected arity.
  const stripped = await rootQuery(
    `select sig, (length(code) - length(replace(code, 'clara._canonical_counterparty(', '')))
                 / length('clara._canonical_counterparty(') as calls
       from (select sig, regexp_replace(regexp_replace(pg_get_functiondef(sig::regprocedure), '/\\*.*?\\*/', '', 'gs'), '--[^\\n]*', '', 'g') as code
               from unnest(array['clara._aging_core(uuid,uuid,text,date)',
                                 'clara._statement_core(uuid,uuid,text,uuid,date,date)',
                                 'clara.list_open_items_by_counterparty(uuid,text,uuid)']) as sig) z`);
  const calls = Object.fromEntries(stripped.rows.map((x) => [x.sig, Number(x.calls)]));
  assert.deepEqual(calls, {
    "clara._aging_core(uuid,uuid,text,date)": 2,
    "clara._statement_core(uuid,uuid,text,uuid,date,date)": 5,
    "clara.list_open_items_by_counterparty(uuid,text,uuid)": 2,
  }, "cm.10 (F4): each recut body CALLS the resolver its own number of times IN CODE — the raw census cannot be satisfied by a comment");

  // THE NEGATIVE CONTROL — the mutant this guard exists for. Take the live _aging_core, delete
  // every real CALL and leave a COMMENT that names the resolver: the raw census still counts it
  // a member (it can say only YES), and the comment-stripped instrument correctly says ZERO.
  const mutant = await rootQuery(
    `with live as (select pg_get_functiondef('clara._aging_core(uuid,uuid,text,date)'::regprocedure) as d),
          m as (select '-- clara._canonical_counterparty( lives on in this comment only' || E'\\n'
                       || replace(d, 'clara._canonical_counterparty(', 'clara._NOT_THE_RESOLVER(') as d from live)
     select (position('_canonical_counterparty' in d) > 0) as raw_says_member,
            (length(regexp_replace(regexp_replace(d, '/\\*.*?\\*/', '', 'gs'), '--[^\\n]*', '', 'g'))
             - length(replace(regexp_replace(regexp_replace(d, '/\\*.*?\\*/', '', 'gs'), '--[^\\n]*', '', 'g'), 'clara._canonical_counterparty(', '')))
             / length('clara._canonical_counterparty(') as code_calls
       from m`);
  assert.equal(mutant.rows[0].raw_says_member, true, "cm.10 negative control: the RAW census still calls the comment-only mutant a member — it cannot discriminate");
  assert.equal(Number(mutant.rows[0].code_calls), 0, "cm.10 negative control: the comment-stripped instrument says ZERO on the same mutant — it CAN say no, which is what makes the guard above evidence");
});

test("cm.11 (D-01) the merge moves NO row, and every body PR-1 swore it does not touch is byte-unchanged", async (t) => {
  if (needBase(t)) return;
  const sub = world.users.alice, client = world.clients.A1;
  const p = await duplicatePair(sub, client, {
    survivorCents: 604_59, mergedCents: 187_31, survivorDate: "2034-10-10", mergedDate: "2034-01-15",
  });
  const before = await recordedPartyMap(client);
  const shasBefore = {};
  const witnesses = [
    "clara._tf_subledger_item_belt()", "clara._tf_subledger_entry_belt()", "clara._tf_append_only()",
    "clara._subledger_classify_entry(uuid)", "clara._subledger_outstanding(uuid)",
    "clara._metric_input_dataset_v1(uuid,uuid,uuid[])", "clara._canonical_counterparty(uuid,uuid)",
  ];
  for (const w of witnesses) shasBefore[w] = await bodySha(w);
  await mergeCp(sub, { client, survivor: p.survivor, merged: p.merged });

  assert.deepEqual(await recordedPartyMap(client), before,
    "cm.11: PR-1 physically re-homes NOTHING — every open_items row keeps the party it was recorded under, which is why a FROZEN fiscal year is untouched by construction and folds on READ only");
  for (const w of witnesses) {
    assert.equal(await bodySha(w), shasBefore[w], `cm.11: ${w} is byte-unchanged`);
  }
  const m = await counterpartyRow(p.merged);
  assert.ok(m, "cm.11: the merged identity row still EXISTS (retired, never deleted — PRD invariant 8)");
  assert.equal(m.merged_into, p.survivor, "cm.11: and it points at its survivor");
  assert.notEqual(m.retired_at, null, "cm.11: and is retired");
});

// ===========================================================================
// THE CARRIER — clara.counterparty_merges.
// ===========================================================================

test("cm.12 (S-1, W9/W10) the carrier is forced-RLS, firm-scoped read-only for humans, and invisible across firms", async (t) => {
  if (needCarrier(t)) return;
  const flags = await rootQuery(
    "select relrowsecurity as rls, relforcerowsecurity as forced from pg_class where oid='clara.counterparty_merges'::regclass");
  assert.equal(flags.rows[0].rls, true, "cm.12: RLS enabled");
  assert.equal(flags.rows[0].forced, true, "cm.12: and FORCED — the owner is bound too");

  const sub = world.users.alice, client = world.clients.A1;
  const p = await duplicatePair(sub, client, {
    survivorCents: 199_43, mergedCents: 762_11, survivorDate: "2034-06-01", mergedDate: "2034-06-02",
  });
  await mergeCp(sub, { client, survivor: p.survivor, merged: p.merged });
  const mine = await humanQuery(sub, "select count(*)::int as n from clara.counterparty_merges where client_id=$1", [client]);
  assert.ok(Number(mine.rows[0].n) >= 1, "cm.12: a bookkeeper of the OWNING firm reads the record");
  const theirs = await humanQuery(world.users.dave, "select count(*)::int as n from clara.counterparty_merges where client_id=$1", [client]);
  assert.equal(Number(theirs.rows[0].n), 0, "cm.12 (W9): a member of ANOTHER firm reads ZERO rows — the firm scope is the policy, not a filter the caller chose");

  const err = await caught(() => humanQuery(world.users.dave,
    "insert into clara.counterparty_merges(firm_id,client_id,survivor_id,merged_id,reason,merged_by,op_key) values ($1,$1,$1,$1,'x',$1,'y')", [client]));
  assert.ok(err, "cm.12 (W10): clara_authenticated cannot INSERT into the carrier");
  assert.equal(err.code, "42501", "cm.12 (W10): refused as a privilege error — the grant is SELECT only");
});

test("cm.13 (S-2, W2/W3/W4) the carrier admits EXACTLY one reversal stamp, and refuses everything else", async (t) => {
  if (needCarrier(t)) return;
  const sub = world.users.alice, client = world.clients.A2;
  const p = await duplicatePair(sub, client, {
    survivorCents: 587_09, mergedCents: 143_67, survivorDate: "2034-02-11", mergedDate: "2034-02-12",
  });
  await mergeCp(sub, { client, survivor: p.survivor, merged: p.merged });
  const row = (await carrierRows(client)).find((r) => r.merged_id === p.merged);
  assert.ok(row, "cm.13 mandatory setup: the merge wrote its carrier row");

  const del = await caught(() => rootQuery("delete from clara.counterparty_merges where id=$1", [row.id]));
  assert.equal(del?.code, "CLR08", "cm.13 (W2): a merge record is never deleted");
  const edit = await caught(() => rootQuery("update clara.counterparty_merges set reason='rewritten' where id=$1", [row.id]));
  assert.equal(edit?.code, "CLR08", "cm.13 (W3): a non-reversal column cannot be edited");
  const half = await caught(() => rootQuery("update clara.counterparty_merges set unmerged_at=now() where id=$1", [row.id]));
  assert.equal(half?.code, "CLR08", "cm.13: HALF a reversal stamp (a timestamp with no actor and no reason) is refused by the trigger, not silently taken");

  // THE ADMITTED DIRECTION — a wall that only ever refuses has not been proven to do anything.
  await rootQuery(
    "update clara.counterparty_merges set unmerged_at=now(), unmerged_by=merged_by, unmerge_reason='cm1 reversal' where id=$1", [row.id]);
  const after = (await carrierRows(client)).find((r) => r.id === row.id);
  assert.notEqual(after.unmerged_at, null, "cm.13: the lawful reversal stamp LANDS");
  const twice = await caught(() => rootQuery(
    "update clara.counterparty_merges set unmerged_at=now(), unmerged_by=merged_by, unmerge_reason='again' where id=$1", [row.id]));
  assert.equal(twice?.code, "CLR08", "cm.13 (W4): a SECOND reversal is refused — reverse-twice is a refusal, never a second reversal");
});

test("cm.14 (M12) the carrier records the alias this merge created — and records NULL when the alias was already there", async (t) => {
  if (needCarrier(t)) return;
  const sub = world.users.alice, client = world.clients.A2;

  const fresh = await duplicatePair(sub, client, {
    survivorCents: 322_81, mergedCents: 471_29, survivorDate: "2034-03-21", mergedDate: "2034-03-22",
  });
  await mergeCp(sub, { client, survivor: fresh.survivor, merged: fresh.merged });
  const freshRow = (await carrierRows(client)).find((r) => r.merged_id === fresh.merged);
  assert.notEqual(freshRow.alias_id, null, "cm.14: when the merge CREATES the former-name alias, its id is recorded");
  const owns = await rootQuery("select counterparty_id::text as cp, origin from clara.counterparty_aliases where id=$1", [freshRow.alias_id]);
  assert.equal(owns.rows[0].cp, fresh.survivor, "cm.14: and the recorded alias is the one that landed on the SURVIVOR");
  assert.equal(owns.rows[0].origin, "former_name", "cm.14: with the former_name origin the merge writes");

  // THE NULL HALF — and an honest note about its instrument. `uq_counterparty_aliases_live_name`
  // is unique on (client_id, alias_normalized) CLIENT-WIDE, so the merge's `on conflict do
  // nothing` fires whenever any live alias in the client already spells the merged party's
  // name. That state is NOT reachable through the shipped doors: add_counterparty_alias
  // refuses "alias collides with a canonical counterparty name" while the merged party is
  // live, and rename_counterparty refuses any name colliding with another party's live alias.
  // FINDING, recorded rather than papered over: the branch M12 names is DEFENSIVE, not a
  // reachable product state today. Proving a defensive branch needs the state seeded, which is
  // what this does — and it is a SEEDED STATE, never evidence about a door.
  const dup = await duplicatePair(sub, client, {
    survivorCents: 260_37, mergedCents: 538_93, survivorDate: "2034-03-23", mergedDate: "2034-03-24",
  });
  const m = await counterpartyRow(dup.merged);
  await rootQuery(
    `insert into clara.counterparty_aliases(firm_id,client_id,counterparty_id,alias_normalized,alias_display,origin,created_by)
     select c.firm_id, c.client_id, $1, $2, $3, 'former_name', c.created_by from clara.counterparties c where c.id=$1`,
    [dup.survivor, m.name_normalized, m.name]);
  await mergeCp(sub, { client, survivor: dup.survivor, merged: dup.merged });
  const dupRow = (await carrierRows(client)).find((r) => r.merged_id === dup.merged);
  assert.equal(dupRow.alias_id, null,
    "cm.14 (M12): when `on conflict do nothing` fires the alias is NOT this merge's to retire, and the carrier says so with NULL rather than guessing");
});

test("cm.15 (S-5, W12) the receipt carries merge_id, a replayed op_key writes no second row, and a re-merge still refuses", async (t) => {
  if (needCarrier(t)) return;
  const sub = world.users.alice, client = world.clients.A2;
  const p = await duplicatePair(sub, client, {
    survivorCents: 706_61, mergedCents: 294_13, survivorDate: "2034-05-15", mergedDate: "2034-05-16",
  });
  const key = `cm1-replay-${p.merged}`;
  const first = await mergeCp(sub, { client, survivor: p.survivor, merged: p.merged, opKey: key });
  assert.ok(first.merge_id, "cm.15: the receipt returns merge_id — PR-2 keys the un-merge on the merge ROW, not on the party");
  const rows1 = (await carrierRows(client)).filter((r) => r.merged_id === p.merged);
  assert.equal(rows1.length, 1, "cm.15: exactly ONE carrier row");
  assert.equal(rows1[0].id, first.merge_id, "cm.15: and the receipt names it");
  assert.equal(rows1[0].reissued_rule_id, null, "cm.15: no vendor_account rule existed, so none was reissued — recorded as NULL, not omitted");

  const replay = await mergeCp(sub, { client, survivor: p.survivor, merged: p.merged, opKey: key });
  assert.equal(replay.merge_id, first.merge_id, "cm.15: the same op_key replays the STORED outcome");
  assert.equal((await carrierRows(client)).filter((r) => r.merged_id === p.merged).length, 1,
    "cm.15: and writes no second carrier row");

  const again = await caught(() => mergeCp(sub, { client, survivor: p.survivor, merged: p.merged }));
  assert.equal(again?.code, "CLR23", "cm.15 (W12): a fresh op_key against an already-merged party is still refused");
  assert.equal(reasonOf(again), "target_retired", "cm.15: by the pre-existing guard, unchanged by the carrier splice (D-05)");
});

test("cm.16 (W5/W6/W7/W8) the carrier's four declarative walls each refuse, by their own error class", async (t) => {
  if (needCarrier(t)) return;
  const sub = world.users.alice, client = world.clients.A1, foreign = world.clients.A2;
  const p = await duplicatePair(sub, client, {
    survivorCents: 483_77, mergedCents: 615_29, survivorDate: "2034-08-21", mergedDate: "2034-08-22",
  });
  await mergeCp(sub, { client, survivor: p.survivor, merged: p.merged });
  const row = (await carrierRows(client)).find((r) => r.merged_id === p.merged);
  const dupLive = await caught(() => rootQuery(
    `insert into clara.counterparty_merges(firm_id,client_id,survivor_id,merged_id,reason,merged_by,op_key)
     values ($1,$2,$3,$4,'cm1 mutant',$5,'cm1-duplive')`,
    [row.firm_id, row.client_id, row.survivor_id, row.merged_id, row.merged_by]));
  assert.equal(dupLive?.code, "23505", "cm.16 (W5): a party can be LIVE-merged at most once — the partial unique index refuses the second");
  const trio = await caught(() => rootQuery(
    `insert into clara.counterparty_merges(firm_id,client_id,survivor_id,merged_id,reason,merged_by,op_key,unmerged_at)
     values ($1,$2,$3,$4,'cm1 mutant',$5,'cm1-trio',now())`,
    [row.firm_id, row.client_id, row.survivor_id, row.merged_id, row.merged_by]));
  assert.equal(trio?.code, "23514", "cm.16 (W6): a reversal stamp without its actor is refused by the trio CHECK");
  const self = await caught(() => rootQuery(
    `insert into clara.counterparty_merges(firm_id,client_id,survivor_id,merged_id,reason,merged_by,op_key)
     values ($1,$2,$3,$3,'cm1 mutant',$4,'cm1-self')`,
    [row.firm_id, row.client_id, row.survivor_id, row.merged_by]));
  assert.equal(self?.code, "23514", "cm.16 (W7): a party cannot be merged into itself");
  const foreignCp = await customer(sub, foreign, "FOREIGN");
  const cross = await caught(() => rootQuery(
    `insert into clara.counterparty_merges(firm_id,client_id,survivor_id,merged_id,reason,merged_by,op_key)
     values ($1,$2,$3,$4,'cm1 mutant',$5,'cm1-cross')`,
    [row.firm_id, row.client_id, row.survivor_id, foreignCp, row.merged_by]));
  assert.equal(cross?.code, "23503", "cm.16 (W8): the triple-key FK refuses a party belonging to another client — the tenancy wall is structural, not the writer's care");
});

// Gated on needBase, NOT needCarrier: the event type and its taxonomy row are carrier-INDEPENDENT
// (they are catalog vocabulary), so on a pre-PR database this cell must RED rather than skip —
// otherwise the one cell that proves OQ-7 landed can never say NO.
test("cm.17 (OQ-7) counterparty.unmerged is registered and routed context_update; counterparty.merged still routes ignore", async (t) => {
  if (needBase(t)) return;
  const r = await rootQuery(
    `select (select client_scoped from clara.event_types where name='counterparty.unmerged') as scoped,
            (select tt.decision from clara.trigger_taxonomy tt join clara.taxonomy_active ta on ta.version=tt.version
              where tt.event_type='counterparty.unmerged') as unmerged,
            (select tt.decision from clara.trigger_taxonomy tt join clara.taxonomy_active ta on ta.version=tt.version
              where tt.event_type='counterparty.merged') as merged,
            (select count(*)::int from clara.event_types et where et.name not like 'rig.%'
               and not exists (select 1 from clara.trigger_taxonomy tt
                               where tt.version=(select version from clara.taxonomy_active) and tt.event_type=et.name)) as unrouted`);
  const g = r.rows[0];
  assert.equal(g.scoped, true, "cm.17: counterparty.unmerged is a CLIENT-scoped event type");
  assert.equal(g.unmerged, "context_update", "cm.17 (OQ-7): an un-merge resurrects an identity Clara resolves against, so her context learns immediately");
  assert.equal(g.merged, "ignore", "cm.17: and counterparty.merged is UNMOVED at ignore — this PR widened nothing it was not asked to");
  assert.equal(g.unrouted, 0, "cm.17: every event type stays routed at the active taxonomy version");
});

test("cm.18 the AR control account the whole battery ties against is a real receivable control", async (t) => {
  if (needBase(t)) return;
  const r = await rootQuery(
    "select account_class, is_active from clara.coa_accounts where client_id=$1 and account_code=$2",
    [world.clients.A1, AR_CTL]);
  assert.equal(r.rows[0]?.account_class, "receivable",
    "cm.18 (the tie's own positive control): cm.5 would be vacuous if the fixture's control account were not the one ar_control_tie resolves");
  assert.equal(r.rows[0]?.is_active, true, "cm.18: and it is active, so control_not_resolvable never masks a real mismatch");
});

test("cm.19 (D-05) all SIX of merge_counterparties' refusals survive the carrier splice, each by NAME", async (t) => {
  if (needBase(t)) return;
  const sub = world.users.alice, client = world.clients.A1, other = world.clients.A2;
  const s = await customer(sub, client, "REF-S");
  const m = await customer(sub, client, "REF-M");

  const noKey = await caught(() => mergeCp(sub, { client, survivor: s, merged: m, opKey: " " }));
  assert.equal(noKey?.code, "CLR10", "cm.19/1: an absent op_key is refused CLR10");
  const self = await caught(() => mergeCp(sub, { client, survivor: s, merged: s }));
  assert.equal(self?.code, "CLR10", "cm.19/2: a counterparty cannot merge into itself");

  const foreign = await customer(sub, other, "REF-X");
  const cross = await caught(() => mergeCp(sub, { client, survivor: s, merged: foreign }));
  assert.equal(reasonOf(cross), "cross_client", "cm.19/3: cross_client");

  const vendor = await birthCounterparty(sub, { client, name: `CM1 REF-V ${Math.random().toString(36).slice(2, 8)}`.toUpperCase(), kind: "vendor" });
  const kind = await caught(() => mergeCp(sub, { client, survivor: s, merged: vendor }));
  assert.equal(reasonOf(kind), "cross_kind_merge", "cm.19/4: cross_kind_merge");

  const r1 = await customerWithReg(sub, client, "REF-R1", "201801003000");
  const r2 = await customerWithReg(sub, client, "REF-R2", "201801003001");
  const reg = await caught(() => mergeCp(sub, { client, survivor: r1, merged: r2 }));
  assert.equal(reasonOf(reg), "registration_conflict", "cm.19/5: registration_conflict");

  await draftEntryV3(sub, {
    client, resolution: await manualRes(sub, client), memo: "cm1 open draft citing the merged party",
    lines: [{ account_code: AR_CTL, debit_cents: 812_39, credit_cents: 0, description: "dr" },
            { account_code: REV, debit_cents: 0, credit_cents: 812_39, description: "cr" }],
    vendor: { existing_id: m, kind: "customer" }, opKey: `cm1-draft-${Math.random()}`,
  });
  const draft = await caught(() => mergeCp(sub, { client, survivor: s, merged: m }));
  assert.equal(reasonOf(draft), "open_draft_blocks", "cm.19/6: open_draft_blocks — the guard the un-merge's U6 will mirror");
});
