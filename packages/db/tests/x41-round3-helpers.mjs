// 0041 Wave D-a — the ROUND-3 fix-ledger battery's shared readers (NOT a test
// file: the name does not end in `.test.mjs`, so `node --test` ignores it).
// Re-exports x41-fa-world so a round-3 cell file imports ONE module.
//
// WHY A SEPARATE MODULE: x41-fa-world.mjs is at the repo's 500-line file ceiling.
// Everything here is ADDITIVE — no existing helper is changed, no existing cell
// imports this file.
//
// CONTRACT-BLIND, same discipline as the rest of the battery (see the
// x41-fa-fixtures.mjs header): authored from docs/plan/wave-d-a-fa-design.md v2.1
// + the round-3 adjudicated fix ledger (F1..F10 + smalls) ONLY. This lane never
// reads 0041's SQL, the fix diffs, or the harvested live bodies.
//
// THE KEY-DISCOVERY RULE. The fix ledger prescribes behaviour on surfaces whose
// PAYLOAD KEY NAMES no contract ever pinned — the tie's new explained columns
// (F9) and the WD-R6 per-asset advisory. These readers find the key by MEANING,
// assert the VALUE exactly, and record the observed spelling as a lane note, so a
// naming divergence surfaces as a FINDING instead of either a false red or a
// silently-vacuous assertion. Where the ledger DOES pin a spelling (a refusal
// token, an axis), the pin is exact.

import assert from "node:assert/strict";
import { noteLane, refuses, faRows, liveRanges, dstr, daysIn } from "./x41-fa-world.mjs";

export * from "./x41-fa-world.mjs";

// ---------------------------------------------------------------------------
// Payload key discovery.
// ---------------------------------------------------------------------------

/** The first key of `obj` matching `re` whose value is numeric — {key, value} or null. */
export function numKey(obj, re) {
  for (const [k, v] of Object.entries(obj ?? {})) {
    if (!re.test(k)) continue;
    const n = Number(v);
    if (v !== null && v !== "" && Number.isFinite(n)) return { key: k, value: n };
  }
  return null;
}

/** The first key of `obj` matching `re`, whatever the value — {key, value} or null. */
export function anyKey(obj, re) {
  for (const [k, v] of Object.entries(obj ?? {})) if (re.test(k)) return { key: k, value: v };
  return null;
}

/** Every fa_register_tie account row for one asset account code. */
export const tieAccts = (tie, code) => (tie?.accounts ?? []).filter((a) => a.asset_account === code);

/** Σ the numeric field matching `re` over tie account rows — ASSERTING every row
 *  really carries it, so a renamed/absent column can never make a diff assertion
 *  vacuously green (the "measure with the instrument production uses" lesson). */
export function tieSumBy(rows, re, label) {
  assert.ok(rows.length > 0, `${label}: fa_register_tie returned at least one account row`);
  let total = 0;
  for (const r of rows) {
    const hit = numKey(r, re);
    assert.ok(hit, `${label}: the tie account row carries a ${re} figure (got keys: ${Object.keys(r).join(", ")})`);
    total += hit.value;
  }
  return total;
}

/** The asset rows of list_fixed_assets, however the RPC wraps them. */
export function assetRowsOf(payload) {
  return payload?.assets ?? payload?.rows ?? (Array.isArray(payload) ? payload : []);
}

/** The ASSET node of a get_fixed_asset payload (whether nested or at the top level). */
export const assetNodeOf = (payload) => payload?.asset ?? payload?.fixed_asset ?? payload ?? {};

/** The projected accumulated depreciation on a read-surface asset row (cents). */
export function accumOf(row, label = "the read surface") {
  const hit = numKey(row, /^accumulated(_depreciation)?_cents$/) ?? numKey(row, /accumulated.*cents/);
  assert.ok(hit,
    `${label}: the asset read projects an accumulated-depreciation figure (got keys: ${Object.keys(row ?? {}).join(", ")})`);
  return hit.value;
}

/** The WD-R6 per-asset uncharged-due advisory as a COUNT, whichever way it is projected. */
export function advisoryCountOf(row) {
  const arr = anyKey(row, /uncharged/);
  if (arr && Array.isArray(arr.value)) return arr.value.length;
  const n = numKey(row, /uncharged.*count/);
  return n ? n.value : null;
}

/** The advisory's month keys ('YYYY-MM' anywhere in the projected value). */
export function advisoryMonthsOf(row) {
  const arr = anyKey(row, /uncharged/);
  const blob = JSON.stringify(arr?.value ?? []);
  return [...new Set((blob.match(/\d{4}-\d{2}/g) ?? []).map((s) => s.slice(0, 7)))];
}

// ---------------------------------------------------------------------------
// Refusal shape.
// ---------------------------------------------------------------------------

/** The named `axis` discriminant out of a refusal's DETAIL json (the x41.g3 idiom). */
export const axisOf = (err) => /"axis"\s*:\s*"([a-z0-9_]+)"/.exec(String(err?.detail ?? ""))?.[1] ?? null;

/** fn() MUST refuse with `token`, and the refusal MUST name one of `axes`. */
export async function refusesAxis(fn, token, axes, label) {
  const err = await refuses(fn, token, label);
  const got = axisOf(err);
  const blob = `${err.message ?? ""} ${err.detail ?? ""} ${err.hint ?? ""}`;
  const hit = axes.find((a) => got === a || blob.includes(a));
  assert.ok(hit,
    `${label}: the refusal names one of axis ${axes.join(" / ")} (got axis='${got ?? "(none)"}' — ${err.message})`);
  if (axes.length > 1 || got !== axes[0]) noteLane(`${label}: refused on axis '${got ?? hit}'`);
  return err;
}

// ---------------------------------------------------------------------------
// Lineage + FY arithmetic (rebuilt INDEPENDENTLY here — never a DB helper).
// ---------------------------------------------------------------------------

/** Every register row id in one asset's supersede lineage, walking DOWNWARD from `root`. */
export async function lineageIdsOf(client, root) {
  const rows = await faRows(client);
  const ids = new Set([root]);
  for (let grew = true; grew;) {
    grew = false;
    for (const r of rows) {
      if (r.supersedes_asset_id && ids.has(r.supersedes_asset_id) && !ids.has(r.id)) { ids.add(r.id); grew = true; }
    }
  }
  return [...ids];
}

/** Every LIVE charge range across one asset's whole lineage, oldest first. */
export async function lineageLiveRanges(client, root) {
  const out = [];
  for (const id of await lineageIdsOf(client, root)) {
    out.push(...(await liveRanges(id)).map((r) => ({ ...r, asset: id })));
  }
  return out.sort((a, b) => (a.start < b.start ? -1 : 1));
}

export const sumRanges = (ranges) => ranges.reduce((n, r) => n + r.amount, 0);

/** The twelve calendar months of a lastEndedFy() window, oldest first. */
export function fyMonths(fy) {
  const out = [];
  for (let i = 0; i < 12; i++) {
    const t = fy.openY * 12 + (fy.openM - 1) + i;
    const y = Math.floor(t / 12);
    const m = t - y * 12 + 1;
    out.push({
      y, m, start: dstr(y, m, 1), end: dstr(y, m, daysIn(y, m)),
      key: `${y}-${String(m).padStart(2, "0")}`,
    });
  }
  return out;
}
