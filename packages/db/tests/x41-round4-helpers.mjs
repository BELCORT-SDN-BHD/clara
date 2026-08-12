// 0041 Wave D-a — the ROUND-4 battery's shared readers (NOT a test file: the name
// does not end in `.test.mjs`, so `node --test` ignores it). Re-exports
// x41-round35-helpers (and through it x41-round3-helpers / x41-fa-world /
// x41-fa-fixtures) so a round-4 cell file imports ONE module — the round-3 and
// round-3.5 precedent.
//
// WHY A SEPARATE MODULE: every file in this family sits at the repo's 500-line
// ceiling. Everything here is ADDITIVE — no existing helper is changed.
//
// CONTRACT-BLIND, same discipline as the rest of the battery: authored from
// docs/plan/completed/wave-d-a-fa-design.md v2.1 and the adjudicated round-4 fold ONLY.
// This lane never reads 0041's SQL, the fix diffs, or the harvested live bodies.
//
// THE ARITHMETIC IS ASSERTED AGNOSTICALLY. Which lineage row owns a calendar month
// that a revision straddles is the register's business, not a cell's: the sen law
// below derives each row's rate from that ROW's own particulars (§3.1 straight-line
// monthly = floor((cost − residual) / life)) times the months its ledger ranges
// actually cover, and the coverage law demands every month be charged EXACTLY once
// across the lineage. Together they catch a lost month and a double charge without
// pinning a split the design never fixed.

import assert from "node:assert/strict";
import {
  rootQuery, opk, idOf, ACCUM, COST, anyKey,
  approveEntry, runManual, faRegisterTie, entryRowOf, faRow, liveRanges, lineageIdsOf,
  tieAccts, tieSumBy,
} from "./x41-round35-helpers.mjs";

export * from "./x41-round35-helpers.mjs";

/** Every entry of a client carrying a disposal proposal — a REFUSED disposal must mint
 *  none (the round-3 F6 law: no un-approvable poison draft, in either direction). */
export const disposalEntries = async (client) =>
  (await rootQuery(
    "select id, status from clara.journal_entries where client_id=$1 and flags ? 'fa_disposal' order by created_at",
    [client],
  )).rows;

/** Every 'YYYY-MM' a [start,end] charge range touches, oldest first. Ranges may
 *  legitimately span months (the annual arm, and every stub), so a month-grain
 *  assertion must read the range, not assume one row per month. */
export function monthsOfRange(r) {
  const [ys, ms] = String(r.start).split("-").map(Number);
  const [ye, me] = String(r.end).split("-").map(Number);
  const out = [];
  for (let t = ys * 12 + (ms - 1); t <= ye * 12 + (me - 1); t++) {
    const y = Math.floor(t / 12);
    out.push(`${y}-${String(t - y * 12 + 1).padStart(2, "0")}`);
  }
  return out;
}

/** One asset's live charge picture: {asset, ranges, months, amount, entries}. */
export async function chargePicture(id) {
  const ranges = await liveRanges(id);
  return {
    asset: id,
    ranges,
    months: ranges.flatMap(monthsOfRange),
    amount: ranges.reduce((n, r) => n + r.amount, 0),
    entries: new Set(ranges.map((r) => r.entry)),
  };
}

/** The whole lineage's live charge picture, one element per register row. */
export async function lineagePicture(client, root) {
  const out = [];
  for (const id of await lineageIdsOf(client, root)) out.push(await chargePicture(id));
  return out;
}

/** THE COVERAGE LAW: every calendar month in `expected` is charged somewhere in the
 *  lineage, and NO month is charged twice across it (month grain, no daily pro-rata —
 *  a month belongs to exactly one register row, whichever one the split gives it to). */
export function assertCoversOnce(pic, expected, label) {
  const all = pic.flatMap((a) => a.months);
  assert.deepEqual([...new Set(all)].sort(), [...expected].sort(),
    `${label}: the lineage's live charges cover exactly the months ${expected.join(", ")} (got ${[...new Set(all)].sort().join(", ") || "(none)"})`);
  assert.equal(all.length, new Set(all).size,
    `${label}: NO calendar month is charged twice across the lineage — a month the ancestor owes and the successor also charges is a double charge wearing a stub's costume (got ${all.sort().join(", ")})`);
}

/** THE SEN LAW, per register row and derived from that row's OWN particulars. No
 *  fixture in this battery runs near life end, so the final-month absorption never
 *  applies and the rate is flat across every month the row carries. */
export async function assertSenExact(pic, label) {
  for (const a of pic) {
    if (a.months.length === 0) continue;
    const row = await faRow(a.asset);
    const monthly = Math.floor((Number(row.cost_cents) - Number(row.residual_cents ?? 0)) / Number(row.useful_life_months));
    assert.equal(a.amount, a.months.length * monthly,
      `${label}: register row ${a.asset} (cost ${row.cost_cents}, life ${row.useful_life_months}) is charged ${a.months.length} month(s) × ${monthly} to the sen — got ${a.amount}`);
  }
}

/** The asset a stub_charges element names — by MEANING, so a spelling divergence is a
 *  finding rather than a silently vacuous assertion. */
export function stubAssetOf(s) {
  const hit = anyKey(s ?? {}, /^asset(_id)?$/) ?? anyKey(s ?? {}, /asset/);
  assert.ok(hit?.value,
    `every stub_charges element names its own asset — the wire shape is PER-ASSET (got keys: ${Object.keys(s ?? {}).join(", ")})`);
  return hit.value;
}

/** THE WIRE-SHAPE PIN: `flags.fa_disposal.stub_charges` names EXACTLY the lineage rows
 *  the disposal entry actually charged, and nothing outside the lineage. */
export async function assertStubIsPerAsset(pic, entryId, lineage, label) {
  const e = await entryRowOf(entryId);
  const stub = e.flags?.fa_disposal?.stub_charges;
  assert.ok(Array.isArray(stub), `${label}: the disposal entry carries the fa_disposal proposal's stub_charges array`);
  const named = [...new Set(stub.map(stubAssetOf))].sort();
  for (const id of named) {
    assert.ok(lineage.includes(id), `${label}: every stub charge belongs to the disposed row's OWN lineage (${id} does not)`);
  }
  const rode = pic.filter((a) => a.entries.has(entryId)).map((a) => a.asset).sort();
  assert.deepEqual(named, rode,
    `${label}: stub_charges names exactly the register rows the stub charged — the wire shape and the ledger must be the same per-asset fact (wire: ${named.join(", ") || "(none)"} · ledger: ${rode.join(", ") || "(none)"})`);
  return { stub, named };
}

/** Run a period through the HUMAN verb a refusal's remedy names, settling a draft. */
export async function runManualAndSettle(sub, checker, { client, periodStart, periodEnd }) {
  const receipt = await runManual(sub, { client, periodStart, periodEnd, opKey: opk("x41t3rem") });
  if (receipt?.status === "noop") return { receipt, entryId: null, mode: "noop" };
  const entryId = idOf(receipt, "entry_id", "id");
  assert.ok(entryId, `a non-noop manual run names its entry (got ${JSON.stringify(receipt)})`);
  const e = await entryRowOf(entryId);
  if (e.status === "draft") {
    await approveEntry(checker, { entry: entryId, expectedRevision: e.revision_token, opKey: opk("x41t3remapr") });
  }
  return { receipt, entryId, mode: receipt.status };
}

/** The period a `period_earlier_unmet` refusal names — read from the DETAIL json, and
 *  failing that from the message text (a refusal that names no period is unfollowable
 *  by construction, which is the whole point of the fold). */
export function namedPeriod(err) {
  const blob = `${err?.detail ?? ""} ${err?.message ?? ""} ${err?.hint ?? ""}`;
  const s = /"?period_start"?\s*[:=]\s*"?(\d{4}-\d{2}-\d{2})/.exec(blob)?.[1] ?? null;
  const e = /"?period_end"?\s*[:=]\s*"?(\d{4}-\d{2}-\d{2})/.exec(blob)?.[1] ?? null;
  return s && e ? { start: s, end: e } : null;
}

/** The GL accumulated account read in BOTH directions (the x41.s2 idiom): after a total
 *  disposal the account nets to zero, so a net-vs-charges comparison would pass
 *  vacuously on an empty register. */
export async function accumMovement(client) {
  const r = (await rootQuery(
    `select coalesce(sum(l.credit_cents), 0)::bigint as credited,
            coalesce(sum(l.debit_cents), 0)::bigint as relieved
       from clara.journal_lines l join clara.journal_entries e on e.id = l.entry_id
      where l.client_id = $1 and l.account_code = $2 and e.status = 'approved'`,
    [client, ACCUM],
  )).rows[0];
  return { credited: Number(r.credited), relieved: Number(r.relieved) };
}

/** fa_register_tie GREEN, with the two difference figures read exactly. */
export async function assertTieGreen(sub, client, asOf, label) {
  const tie = await faRegisterTie(sub, client, asOf);
  const rows = tieAccts(tie, COST);
  assert.ok(rows.length >= 1, `${label}: the enrolled cost account appears in the tie at ${asOf}`);
  assert.equal(tieSumBy(rows, /^cost_diff/, "the tie cost difference"), 0, `${label}: cost difference EXACTLY zero at ${asOf}`);
  assert.equal(tieSumBy(rows, /^accum_diff/, "the tie accumulated difference"), 0,
    `${label}: accumulated difference EXACTLY zero at ${asOf} — a stub charge posted to the GL with no register row behind it is exactly what the extension must not do`);
  assert.equal(tie.tie, true, `${label}: fa_register_tie is GREEN at ${asOf} (got ${JSON.stringify(tie.accounts ?? tie)})`);
}
