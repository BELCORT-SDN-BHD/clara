// 裁-19 PR-1 — shared rig fixtures for the counterparty-merge read-layer battery.
// NOT a test file: the name does not end in `.test.mjs`, so `node --test` ignores it (the
// x38-match-fixtures.mjs / f-a1-statements-fixtures.mjs precedent), done here to keep
// counterparty-merge-pr-1.test.mjs under the repo's 500-line gate.
//
// Everything synthetic is built THROUGH audited writers (the gate record's §4 method note:
// "drive the doors, don't set the columns"). The only root reads are READBACKS.
//
// MONEY DISCIPLINE (the T8 lesson, PR #397 F6/F7): every amount in this battery is a
// DISTINCT, NON-ROUND cent value, and no two parties or two items ever share one. A fixture
// where four cells can be satisfied by the same number proves nothing.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, humanQuery, namedCall, opk, getPool,
  a21EnsureReady, buildWorld, firmOf, grantConsent,
  upsertAccountClassed, upsertPayableAccount, draftEntryV3, approveEntry,
} from "./a21-helpers.mjs";
import {
  EXPN as X38_EXPN, REVN as X38_REVN,
  hasBankMatching, caught, manualRes, birthCounterparty, openItemsOf,
} from "./x38-match-fixtures.mjs";

export { caught, birthCounterparty };

// Suite-scoped COA codes — grepped clean against every other battery's family.
export const AR_CTL = "379-CM1"; // receivable control
export const AP_CTL = "479-CM1"; // payable control (so the AP close gate RESOLVES, and ties at 0)
export const REV = "689-CM1";    // revenue

/** The read-layer substrate probe: the base rig plus the subledger/bank chain every fixture
 *  below drives through. The CARRIER's own probe is separate (cmCarrierReady) so the M2/M3/M9
 *  read cells RUN — and RED — on a database that has not applied this PR's migration, which
 *  is the whole point of a defect cell. */
export async function cmBaseReady() {
  const base = await a21EnsureReady();
  return Boolean(base.base && base.has16 && (await hasBankMatching()));
}

/** Structural, never a version string: the migration number is claimed at MERGE time. */
export async function cmCarrierReady() {
  const r = await rootQuery("select to_regclass('clara.counterparty_merges') is not null as ok");
  return r.rows[0].ok;
}

export async function cmBuildWorld() {
  const world = await buildWorld();
  for (const [key, sub] of [["A1", "alice"], ["A2", "alice"], ["B1", "dave"], ["S1", "erin"]]) {
    const client = world.clients[key];
    const who = world.users[sub];
    await upsertAccountClassed(who, { client, code: AR_CTL, name: "Trade Debtors (cm1)", type: "asset", accountClass: "receivable", opKey: opk("cm1-ar") });
    // The AP control exists so clara._control_tie_core('ap') RESOLVES (and ties at zero) rather
    // than returning 'unknown'/control_not_resolvable. Without it, cm.20's close refuses on the
    // AP gate — which sorts BEFORE ar_control_tie — and the cell would pin the wrong refusal.
    await upsertPayableAccount(who, { client, code: AP_CTL, name: "Trade Creditors (cm1)", opKey: opk("cm1-ap") });
    await upsertAccountClassed(who, { client, code: REV, name: "Revenue (cm1)", type: "income", opKey: opk("cm1-rev") });
    // birthCounterparty codes its two legs to the x38 toolkit's own accounts.
    await upsertAccountClassed(who, { client, code: X38_EXPN, name: "Ordinary expense (x38 toolkit)", type: "expense", opKey: opk("cm1-x38exp") });
    await upsertAccountClassed(who, { client, code: X38_REVN, name: "Revenue (x38 toolkit)", type: "income", opKey: opk("cm1-x38rev") });
    await grantConsent(who, { firm: await firmOf(client), client }).catch(() => {});
  }
  return world;
}

/** A fresh CUSTOMER, born at APPROVE through the ordinary draft path. */
export async function customer(sub, client, tag) {
  return birthCounterparty(sub, { client, name: `CM1 ${tag} ${randomUUID().slice(0, 6)}`.toUpperCase(), kind: "customer" });
}

/** The same, but carrying a registration number — the only way to reach the merge's
 *  registration_conflict refusal, which compares two NON-NULL registrations. */
export async function customerWithReg(sub, client, tag, registration) {
  const name = `CM1 ${tag} ${randomUUID().slice(0, 6)}`.toUpperCase();
  const d = await draftEntryV3(sub, {
    client, resolution: await manualRes(sub, client), memo: `cm1 reg birth ${tag}`,
    lines: [
      { account_code: X38_EXPN, debit_cents: 100, credit_cents: 0, description: "birth-dr" },
      { account_code: X38_REVN, debit_cents: 0, credit_cents: 100, description: "birth-cr" },
    ],
    vendor: { new: { name, registration_no: registration }, kind: "customer" }, opKey: opk("cm1-regbirth"),
  });
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("cm1-regbirtha") });
  const want = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const r = await rootQuery("select id::text as id from clara.counterparties where client_id=$1 and name_normalized=$2", [client, want]);
  assert.ok(r.rows[0]?.id, "the registration-bearing customer was born (mandatory setup)");
  return r.rows[0].id;
}

/** One AR open item on `cp`, dated `postingDate`: Dr AR control / Cr revenue, approved.
 *  Returns { entry, item, cents }. The item's `item_date` is the entry's posting date, which
 *  is what makes the aging-bucket cells drivable without touching a column. */
export async function arItem(sub, { client, cp, cents, postingDate }) {
  const d = await draftEntryV3(sub, {
    client, resolution: await manualRes(sub, client), memo: `cm1 ar item ${cents}`, postingDate,
    lines: [
      { account_code: AR_CTL, debit_cents: cents, credit_cents: 0, description: "dr" },
      { account_code: REV, debit_cents: 0, credit_cents: cents, description: "cr" },
    ],
    vendor: { existing_id: cp, kind: "customer" }, opKey: opk("cm1-item"),
  });
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("cm1-itema") });
  const items = await openItemsOf(d.entry_id);
  assert.equal(items.length, 1, "an AR control entry mints exactly ONE open item (mandatory setup)");
  return { entry: d.entry_id, item: items[0].id, cents };
}

// ---------------------------------------------------------------------------
// The doors under test.
// ---------------------------------------------------------------------------

export async function mergeCp(sub, { client, survivor, merged, reason = "cm1 duplicate identity", opKey = null }) {
  const r = await humanQuery(sub, namedCall("merge_counterparties", [
    { name: "p_client" }, { name: "p_survivor" }, { name: "p_merged" },
    { name: "p_reason" }, { name: "p_op_key" },
  ]), [client, survivor, merged, reason, opKey ?? opk("cm1-merge")]);
  return r.rows[0].result;
}

export async function arAging(sub, { client, asOf }) {
  const r = await humanQuery(sub, "select clara.ar_aging(p_client => $1, p_as_of => $2::date, p_segment => null) as r", [client, asOf]);
  return r.rows[0].r;
}
export async function custStatement(sub, { client, cp, from, to }) {
  const r = await humanQuery(sub, "select clara.customer_statement(p_client => $1, p_counterparty => $2, p_from => $3::date, p_to => $4::date) as r", [client, cp, from, to]);
  return r.rows[0].r;
}
export async function listOpenItems(sub, { client, domain, cp }) {
  const r = await humanQuery(sub, "select clara.list_open_items_by_counterparty(p_client => $1, p_domain => $2, p_counterparty => $3) as r", [client, domain, cp]);
  return r.rows[0].r;
}
/** clara.ar_control_tie holds NO clara_authenticated EXECUTE grant (measured: its proacl is
 *  `{clara_fn_owner=X/clara_fn_owner}` alone) — it is reached in production through the close
 *  gate, not by a human RPC. So the P4 cell drives it as root, which is a READBACK of a
 *  DB-owned number, never a door being bypassed. */
/** The close-gate probe as the CLOSE actually reaches it: clara._measure_one_gate wraps every
 *  gate evaluation in its own `exception when others` and returns a TYPED result carrying the
 *  sqlstate. Root, because the gate machinery is owner-floored. */
export async function measureGate({ checkKey, client, fy }) {
  const r = await rootQuery("select clara._measure_one_gate($1, $2, $3) as r", [checkKey, client, fy]);
  return r.rows[0].r;
}

export async function arTie({ client, asOf }) {
  const r = await rootQuery("select clara.ar_control_tie($1, $2::date) as r", [client, asOf]);
  return r.rows[0].r;
}

// ---------------------------------------------------------------------------
// Readbacks (root — superuser bypasses RLS; fixtures and assertions only).
// ---------------------------------------------------------------------------

export async function carrierRows(client) {
  const r = await rootQuery("select to_jsonb(m) as row from clara.counterparty_merges m where m.client_id=$1 order by m.merged_at, m.id", [client]);
  return r.rows.map((x) => x.row);
}
export async function counterpartyRow(id) {
  const r = await rootQuery("select to_jsonb(c) as row from clara.counterparties c where c.id=$1", [id]);
  return r.rows[0]?.row ?? null;
}
/** Every open_items row of `client` as (id → counterparty_id). The D-01 read-layer proof
 *  compares this map before and after a merge: PR-1 physically moves NOTHING, so a frozen
 *  fiscal year's rows are untouched by construction and this map must be byte-identical. */
export async function recordedPartyMap(client) {
  const r = await rootQuery("select id::text as id, counterparty_id::text as cp from clara.open_items where client_id=$1 order by id", [client]);
  return Object.fromEntries(r.rows.map((x) => [x.id, x.cp]));
}
/** Run ONE statement inside a transaction that is ALWAYS rolled back, and return the error it
 *  raised (or null when it was admitted). A wall cell needs both directions, and the admitted
 *  direction must not leave a bogus row behind — clara.counterparty_merges refuses DELETE, so a
 *  probe that committed could never be cleaned up. */
export async function probeInTxn(sql, params) {
  const c = await getPool().connect();
  try {
    await c.query("begin");
    try {
      await c.query(sql, params);
      return null;
    } catch (e) {
      return e;
    } finally {
      await c.query("rollback").catch(() => {});
    }
  } finally {
    await c.query("reset all").catch(() => {});
    c.release();
  }
}

export async function bodySha(sig) {
  const r = await rootQuery(
    "select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as sha from pg_proc p where p.oid = $1::regprocedure", [sig]);
  return r.rows[0]?.sha ?? null;
}

/** The aging row for one canonical party, or null. */
export function agingRow(aging, partyId) {
  return (aging?.counterparties ?? []).find((c) => c.counterparty_id === partyId) ?? null;
}
export const sumCents = (rows, key) => rows.reduce((s, r) => s + Number(r[key] ?? 0), 0);
