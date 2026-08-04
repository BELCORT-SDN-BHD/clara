// 0041 Wave D-a — the ROUND-3.5 fix-ledger battery's shared readers (NOT a test
// file: the name does not end in `.test.mjs`, so `node --test` ignores it).
// Re-exports x41-round3-helpers (and through it x41-fa-world / x41-fa-fixtures)
// so a round-3.5 cell file imports ONE module — the x41-round3-helpers precedent.
//
// WHY A SEPARATE MODULE: every file in this family is at the repo's 500-line
// ceiling. Everything here is ADDITIVE — no existing helper is changed.
//
// CONTRACT-BLIND, same discipline as the rest of the battery: authored from
// docs/plan/wave-d-a-fa-design.md v2.1 + the adjudicated round-3.5 fix ledger
// (G1..G8) ONLY. This lane never reads 0041's SQL, the fix diffs, or the
// harvested live bodies — it reads the CATALOG at run time, which is what
// production itself is made of.

import assert from "node:assert/strict";
import { withActor, numKey, anyKey, rootQuery } from "./x41-round3-helpers.mjs";

export * from "./x41-round3-helpers.mjs";

// ---------------------------------------------------------------------------
// Planner readback — EXPLAIN as an assertion instrument (G7 · the q6 re-cut).
// ---------------------------------------------------------------------------

/** The planner's own answer for `sql`, as parsed EXPLAIN (FORMAT JSON). Root, in its
 *  own transaction so `set local` cannot leak to the next checkout of a pooled client. */
export async function explainPlan(sql, { noSeqScan = false } = {}) {
  return withActor({ transaction: true }, async (c) => {
    if (noSeqScan) await c.query("set local enable_seqscan = off");
    const r = await c.query(`explain (format json) ${sql}`);
    const plan = r.rows[0]["QUERY PLAN"];
    return typeof plan === "string" ? JSON.parse(plan) : plan;
  });
}

/** Every node of an EXPLAIN plan tree, flattened depth-first. */
export function flatPlan(plan) {
  const out = [];
  const walk = (n) => {
    if (!n || typeof n !== "object") return;
    out.push(n);
    for (const k of n.Plans ?? []) walk(k);
  };
  for (const root of Array.isArray(plan) ? plan : [plan]) walk(root?.Plan ?? root);
  return out;
}

export const nodeTypes = (planOrNodes) =>
  (Array.isArray(planOrNodes) && planOrNodes[0]?.["Node Type"] ? planOrNodes : flatPlan(planOrNodes))
    .map((n) => n["Node Type"] ?? "?");

// ---------------------------------------------------------------------------
// The issuer op-receipt binding predicate + its mutation kit (G7 · the q7a re-cut).
//
// THE LAW (round-3 STR minor): every issuer op-receipt lookup in the approve-time hook
// must re-derive the request hash INCLUDING the entry's own client — a firm-only match
// lets any op-receipt of the same firm authenticate a proposal for a DIFFERENT client of
// that firm. The predicate demands, inside EACH `clara.op_receipts` lookup, both the
// request-hash conjunct and the exact `'client', <alias>.client_id` fragment, quantified
// with `every()` — a body bound at one site and not the other is not bound. Windows are
// half-open [this lookup, the next) so one site's fragment can never satisfy another's.
// ---------------------------------------------------------------------------

export const OP_RECEIPT_LOOKUP = /from\s+clara\.op_receipts\b/gi;
export const HASH_CONJUNCT = /\band\s+[a-z_][a-z0-9_]*\.request_hash\b/i;
export const CLIENT_IN_HASH = /'client'\s*,\s*[a-z_][a-z0-9_]*\.client_id\b/i;
export const CLIENT_IN_HASH_G = /'client'\s*,\s*[a-z_][a-z0-9_]*\.client_id\s*,?\s*/gi;
const LOOKUP_WINDOW = 1500;

/** SQL line comments blanked to SPACES — offsets are preserved, so a comment can never
 *  supply a fragment the code itself lacks and every index still maps 1:1. */
export const decomment = (src) => String(src ?? "").replace(/--[^\n]*/g, (m) => " ".repeat(m.length));

/** [start,end) of each op-receipt lookup: this anchor to the next (capped). */
export function lookupSpans(body) {
  const at = [...body.matchAll(OP_RECEIPT_LOOKUP)].map((m) => m.index);
  return at.map((i, k) => [i, Math.min(at[k + 1] ?? body.length, i + LOOKUP_WINDOW)]);
}

/** THE PIN: ≥2 issuer lookups, and EVERY one re-derives a client-bound request hash. */
export function clientBoundIssuerLookups(body) {
  const spans = lookupSpans(body);
  if (spans.length < 2) return false;
  return spans.every(([a, b]) => {
    const wnd = body.slice(a, b);
    return HASH_CONJUNCT.test(wnd) && CLIENT_IN_HASH.test(wnd);
  });
}

/** Cut every `and <alias>.request_hash = …` conjunct, balanced to the enclosing
 *  predicate's own close-paren — the exact NO-REHASH (firm-only) mutant. */
export function cutRequestHashConjuncts(body) {
  let out = body;
  for (;;) {
    const m = HASH_CONJUNCT.exec(out);
    if (!m) return out;
    let i = m.index + m[0].length;
    let depth = 0;
    while (i < out.length) {
      const ch = out[i];
      if (ch === "(") depth += 1;
      else if (ch === ")") {
        if (depth === 0) break;
        depth -= 1;
      }
      i += 1;
    }
    out = out.slice(0, m.index) + out.slice(i);
  }
}

/** The ROUND-3 pin, kept only to RECORD its vacuity against the same mutants. */
export function round3Pin(body) {
  const at = [...body.matchAll(/op_key\s*=/g)].map((m) => m.index);
  return at.length > 0 && at.some((i) => /client_id/.test(body.slice(Math.max(0, i - 700), i + 300)));
}

// ---------------------------------------------------------------------------
// FY arithmetic over the DB anchor — the FY BEFORE the last ended one (G1's
// next-FY entitlement shape needs two consecutive CLOSED financial years).
// ---------------------------------------------------------------------------

/** The financial year immediately BEFORE `fy` (a lastEndedFy() shape), same FYE. */
export function fyBefore(fy) {
  const shift = (d) => {
    const [y, m, dd] = String(d).split("-");
    return `${Number(y) - 1}-${m}-${dd}`;
  };
  return {
    open: shift(fy.open),
    close: shift(fy.close),
    openY: fy.openY - 1,
    openM: fy.openM,
    closeY: fy.closeY - 1,
    closeM: fy.closeM,
  };
}

// ---------------------------------------------------------------------------
// THE x41-FAMILY-SCOPED fa_register_tie sweep (G7 shape (c)) — the PRODUCTION
// INSTRUMENT (clara.fa_register_tie itself, per-client, exactly as a WD-R14
// pre-flight would run it), driven once per register-bearing client OF THIS WAVE'S
// OWN FIXTURE FAMILY under that client's own most-senior active firm member.
//
// [task #62 / WDB-R2, round-7] SCOPED, NOT WHOLE-DATABASE. It used to loop over
// EVERY `clara.clients` row with no predicate at all — provable only on a database
// this suite owns in full, which CI's shared-database model (`pnpm -r --if-present
// test` against one Postgres) never is. Measured offender: x42-reservation-authority
// / x42-reservation-role plant RAW, deliberately-unbacked `clara.fixed_assets` rows
// (x42-ra-helpers.mjs's `plantRow`/`plantAssetWithGl`/`plantDisposed`) on their own
// `x42v_...` clients to exercise the RESERVATION AUTHORITY predicate in isolation —
// by design, never through the acquisition/disposal writers, so they have no GL
// counterpart and were never meant to answer to a REGISTER-vs-GL tie at all. Run the
// x42 battery before this file on one shared database and its `200-V42` (FACOST)
// fixtures surface here as unexplained reds no accounting act could ever clear, and
// one of them (x42.ra1's raw `superseded` plant, which never runs the K6 hand-off
// writer G3 stamps) also feeds x41.s5's global orphan census below.
//
// THE SCOPE: every client this wave's OWN two client-minting paths
// (`freshFaClient` / `kSeededFaClient`, both x41-fa-world.mjs — the ONLY
// `createClient()` call sites under the `x41_` name, grep-verified against every
// other call site in packages/db/tests) name `x41_<label>_<tag>`; `ALLOWED_RED`'s
// own `/^x41_r3_/` entry already relies on this being the WHOLE x41 family, not just
// this file, so the scope below matches that existing assumption rather than
// narrowing it further. WITHIN that scope the claim stays exactly what it was:
// unexplained differences are EMPTY. `X41_FAMILY_NAME_RE` is the ONE place the law
// lives, so the sweep and its own pin (x41.s4z, x41-round35-tie.test.mjs) read the
// identical predicate and cannot drift apart (WDB-R2).
// ---------------------------------------------------------------------------

export const X41_FAMILY_NAME_RE = "^x41_";

/** Every register-bearing client OF THE x41 FAMILY's tie at `asOf`, as
 *  {client, client_name, tie, err}. A DO body is a string literal, so no bind
 *  parameter can reach inside it — `asOf` is therefore shape-asserted to a bare ISO
 *  date, and the name predicate is a repo-controlled constant (never caller input),
 *  before either is inlined. */
export async function tieSweep(asOf) {
  assert.match(String(asOf), /^\d{4}-\d{2}-\d{2}$/,
    `the whole-DB sweep as-of must be a bare ISO date (got '${asOf}')`);
  return withActor({ transaction: true }, async (c) => {
    await c.query(
      "create temp table x41_sweep(client uuid, client_name text, tie jsonb, err text) on commit drop",
    );
    await c.query(`do $x41$
      declare cl record; v_sub uuid; v_tie jsonb;
      begin
        for cl in select c.id, c.firm_id, c.name from clara.clients c
                  where c.name ~ '${X41_FAMILY_NAME_RE}'
                    and (exists (select 1 from clara.fixed_assets f where f.client_id = c.id)
                      or exists (select 1 from clara.fa_account_profiles p where p.client_id = c.id))
        loop
          select m.user_id into v_sub from clara.firm_memberships m
            where m.firm_id = cl.firm_id and m.status = 'active'
            order by clara.role_rank(m.role) desc limit 1;
          if v_sub is null then continue; end if;
          perform set_config('request.jwt.claims',
            json_build_object('sub', v_sub, 'role', 'authenticated')::text, true);
          begin
            v_tie := clara.fa_register_tie(cl.id, date '${asOf}');
            insert into x41_sweep values (cl.id, cl.name, v_tie, null);
          exception when others then
            insert into x41_sweep values (cl.id, cl.name, null, sqlerrm);
          end;
        end loop;
      end $x41$;`);
    return (await c.query("select client, client_name, tie, err from x41_sweep")).rows;
  });
}

/** The tie sweep flattened to per-account rows, with the explained residue derived
 *  BY MEANING (the key-discovery rule) rather than by a pinned column spelling. */
export function sweepAccountRows(rows) {
  const out = [];
  for (const r of rows) {
    for (const a of r.tie?.accounts ?? []) {
      const cost = numKey(a, /^cost_diff/) ?? { key: null, value: 0 };
      const accum = numKey(a, /^accum_diff/) ?? { key: null, value: 0 };
      const preCost = numKey(a, /^gl_(pre|before).*cost/) ?? numKey(a, /(pre|before).*enrol.*cost/) ?? { value: 0 };
      const preAccum = numKey(a, /^gl_(pre|before).*accum/) ?? numKey(a, /(pre|before).*enrol.*accum/) ?? { value: 0 };
      out.push({
        client: r.client,
        clientName: r.client_name ?? "",
        account: a.asset_account ?? a.account_code ?? "?",
        costDiff: cost.value,
        accumDiff: accum.value,
        preCost: preCost.value,
        preAccum: preAccum.value,
        keys: Object.keys(a),
        raw: a,
      });
      assert.ok(cost.key && accum.key,
        `every tie account row carries a cost/accum difference figure (got keys: ${Object.keys(a).join(", ")})`);
    }
  }
  return out;
}

/** RED = a non-zero difference on either side. EXPLAINED = the difference is exactly
 *  offset by the pre-enrolment movement column, i.e. register + pre-watermark = GL. */
export const isRed = (r) => r.costDiff !== 0 || r.accumDiff !== 0;
export const isExplained = (r) => r.costDiff + r.preCost === 0 && r.accumDiff + r.preAccum === 0;

// ---------------------------------------------------------------------------
// THE A6 CORRECTION WINDOW, DETECTED STRUCTURALLY — never by fixture name.
//
// `reverse_entry` dates its mirror on the CURRENT business date, while the REGISTER act it
// drives (unwind, or restore-to-active) lands at approve with no date of its own. So at any
// as-of between the reversed original's posting date and its mirror's, the GL still carries
// the original while the register has already moved — a legitimate, self-closing
// disagreement (design record A6), not a defect. The round-3.5 fold's G1 re-route made this
// class VISIBLE on the disposal side where the effective-dated read used to mask it.
//
// This is a CLASS test, not an exception list: it asks the data whether such a window is
// genuinely open on that client's own FA accounts at that as-of. A client with no
// later-dated mirror can never be excused by it, and every window closes on its own by the
// mirror's posting date — which is why the sweep also measures at an as-of past them all.
// ---------------------------------------------------------------------------

/** `client|account` keys whose GL, AT `asOf`, still carries an approved entry that an
 *  approved but LATER-dated reversal mirror will undo. */
export async function openReversalWindows(asOf) {
  assert.match(String(asOf), /^\d{4}-\d{2}-\d{2}$/,
    `the A6 window probe's as-of must be a bare ISO date (got '${asOf}')`);
  const r = await rootQuery(
    `select distinct e.client_id::text as client, l.account_code as account
       from clara.journal_entries m
       join clara.journal_entries e on e.id = m.reversal_of
       join clara.journal_lines l on l.entry_id = e.id
      where m.status = 'approved' and e.status = 'approved'
        and m.posting_date > $1::date and e.posting_date <= $1::date`,
    [asOf],
  );
  return new Set(r.rows.map((x) => `${x.client}|${x.account}`));
}

/** True when THIS tie row's own cost or accumulated account sits inside an open A6 window. */
export function inReversalWindow(row, windows) {
  const accum = anyKey(row.raw, /accum.*account/)?.value;
  return windows.has(`${row.client}|${row.account}`)
    || (accum ? windows.has(`${row.client}|${accum}`) : false);
}
