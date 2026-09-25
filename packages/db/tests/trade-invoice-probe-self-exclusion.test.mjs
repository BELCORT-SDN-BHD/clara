// #1135 (cut-phase fix round) — A RECORDING IS NOT ITS OWN LOOK-ALIKE.
//
// `chatTurn_v22` records a trade invoice in three steps: probe, then (if the person said go
// ahead) the acknowledgement, then the admission. The admission door is idempotent on its intent
// key, so a RETRIED tool call is meant to answer the same invoice again. The probe runs first, and
// until 0323 it had no way to tell the caller's own earlier attempt from somebody else's document:
// it returned the invoice that attempt had already admitted, and the tool asked the person whether
// to record a duplicate of their own recording.
//
// WHAT THIS FILE PROVES, against real doors on a disposable rig:
//   §1  THE SELF-MATCH, REPRODUCED against the FOUR-argument probe — the cell that would have
//       reddened before 0323, kept so the fix cannot be quietly undone.
//   §2  THE FIVE-ARGUMENT TWIN excludes the caller's own recording and NOTHING else: a genuine
//       look-alike from the same vendor is still reported, and a key nobody recorded under, a
//       blank key and a null key all answer exactly what the four-argument door answers.
//   §3  THE WHOLE RETRY, driven: probe → ack → admit, then the IDENTICAL call again. The second
//       admission REPLAYS (one invoice, not two) and the acknowledgement ledger holds exactly ONE
//       row for that key — which is ADV-C1-03, resolved as a consequence of §2 rather than by
//       touching the acknowledgement door (0275's own ADV-1007-1 ruling keeps a second ack under
//       one key for DIFFERENT figures, and that cell stays green).
//   §4  THE TENANCY WALL: the key is not a tenancy boundary and is never trusted as one.
//
// FRONTIER-GATED on 0323's stable STEM, never on its number.
// NEVER LIVE: this file drives writes and runs only against a disposable rig.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  buildWorkWorld, freshWorkClient, endPool, rootQuery, roleQuery, namedCall,
  ensureTiChart, vendor, billParticulars, billBasis, admitTradeInvoiceWork,
  probeTradeInvoiceDuplicatesFor, recordTradeInvoiceDuplicateAck, TI_KIND,
} from "./trade-invoice-fixtures.mjs";
import { ROLES } from "./rig-helpers.mjs";
import { printLaneNotes } from "./wave-a-helpers.mjs";

const STEM = "trade_invoice_probe_self_exclusion$";
const EXPECTED_CELLS = 4;

let live = false;
let world = null;
let executed = 0;

before(async () => {
  const r = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ $1", [STEM]);
  live = r.rows[0].n > 0;
  if (live) {
    // WHOLLY PRESENT OR WHOLLY ABSENT: a half-applied 0323 is a defect, not a narrower boundary.
    const fns = await rootQuery(
      `select count(*)::int as n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
        where ns.nspname = 'clara'
          and p.oid::regprocedure::text = any($1::text[])`,
      [["clara._trade_invoice_probe_core(uuid,text,jsonb,text)",
        "clara.probe_trade_invoice_duplicates_for(uuid,uuid,text,jsonb,text)"]]);
    if (fns.rows[0].n !== 2) {
      assert.fail(`0323 ledger row present but only ${fns.rows[0].n}/2 of its siblings exist — half-applied migration`);
    }
    world = await buildWorkWorld();
  }
});
after(async () => {
  printLaneNotes("trade-invoice-probe-self-exclusion");
  if (live) assert.equal(executed, EXPECTED_CELLS, `expected ${EXPECTED_CELLS} cells to run, ${executed} did`);
  await endPool();
});

function gate(t) {
  if (live) return false;
  if (process.env.CLARA_ALLOW_MISSING_TRADE_INVOICE_PROBE_SELF_EXCLUSION === "1") {
    console.warn("SKIP trade-invoice-probe-self-exclusion: 0323 is not applied (explicit pre-integration run).");
    t.skip("trade-invoice probe self-exclusion absent -- explicit pre-integration run");
    return true;
  }
  assert.fail(
    "trade-invoice-probe-self-exclusion is required for a focused run: apply "
    + "0323_trade_invoice_probe_self_exclusion.sql",
  );
  return true;
}

const cell = (name, fn) => test(name, async (t) => { if (gate(t)) return; executed += 1; await fn(t); });

const ALICE = () => world.users.alice;
const DAVE = () => world.users.dave;

async function tiClient(tag) {
  const client = await freshWorkClient(ALICE(), tag);
  await ensureTiChart(ALICE(), client, tag);
  return client;
}

/** The five-argument twin 0323 added. The four-argument one is `probeTradeInvoiceDuplicatesFor`. */
async function probeCarryingKey({ client, author, kind = TI_KIND.bill, particulars, intentKey, role = ROLES.runtime }) {
  const r = await roleQuery(role, namedCall("probe_trade_invoice_duplicates_for", [
    { name: "p_client", cast: "uuid" }, { name: "p_author", cast: "uuid" },
    { name: "p_kind", cast: "text" }, { name: "p_particulars", cast: "jsonb" },
    { name: "p_intent_key", cast: "text" },
  ]), [client, author, kind, JSON.stringify(particulars), intentKey]);
  return r.rows[0].result;
}

const idsOf = (probe) => (probe.matches ?? []).map((m) => m.invoice_id).sort();

// ---------------------------------------------------------------------------------------------
// §1 + §2 — the self-match, and what the narrowing does and does not remove
// ---------------------------------------------------------------------------------------------

cell("p1135.probe.self_match a recording IS its own look-alike to the four-argument door, and is NOT to the five-argument one", async () => {
  const client = await tiClient("selfx1");
  const cp = await vendor(ALICE(), { client });
  const reference = `SELFX-${randomUUID().slice(0, 8)}`;
  const particulars = billParticulars({ counterparty: cp, reference });
  const intentKey = `ti-selfx-${randomUUID()}`;

  // NOTHING YET. The vacuity control: a probe that matched nothing for the wrong reason would make
  // every assertion below true by accident.
  const before = await probeCarryingKey({ client, author: ALICE(), particulars, intentKey });
  assert.equal(before.match_count, 0, "the client holds no look-alike before the recording");

  const admitted = await admitTradeInvoiceWork({
    client, author: ALICE(), kind: TI_KIND.bill, particulars, basis: billBasis(), intentKey,
  });

  // §1 — THE DOOR chatTurn_v21 CALLS still sees the recording as a duplicate of itself. This is
  // the measurement ADV-C1-01 made, kept as a cell so the fix cannot be quietly undone.
  const unnarrowed = await probeTradeInvoiceDuplicatesFor({ client, author: ALICE(), particulars });
  assert.equal(unnarrowed.match_count, 1, "the four-argument door self-matches — 0275's own behaviour");
  assert.deepEqual(idsOf(unnarrowed), [admitted.invoice_id]);

  // §2 — THE DOOR chatTurn_v22 CALLS does not.
  const narrowed = await probeCarryingKey({ client, author: ALICE(), particulars, intentKey });
  assert.equal(narrowed.match_count, 0, "a recording is not its own look-alike");
  assert.deepEqual(narrowed.matches, []);
  // …and every other field of the answer is untouched: the narrowing removes matches, not meaning.
  assert.equal(narrowed.counterparty_id, unnarrowed.counterparty_id);
  assert.equal(narrowed.reference_key, unnarrowed.reference_key);
  assert.equal(narrowed.total_cents, unnarrowed.total_cents);
});

cell("p1135.probe.narrows_only_its_own a genuine look-alike is STILL reported, and an unrelated key narrows nothing", async () => {
  const client = await tiClient("selfx2");
  const cp = await vendor(ALICE(), { client });
  const reference = `SELFX-${randomUUID().slice(0, 8)}`;
  const particulars = billParticulars({ counterparty: cp, reference });

  // SOMEBODY ELSE'S EARLIER BILL, from the same vendor, carrying the same document number: the
  // exact thing the probe exists to warn about.
  const earlier = await admitTradeInvoiceWork({
    client, author: ALICE(), kind: TI_KIND.bill, particulars, basis: billBasis(),
    intentKey: `ti-selfx-earlier-${randomUUID()}`,
  });
  // …and THIS recording, under its own key.
  const mine = `ti-selfx-mine-${randomUUID()}`;
  const admitted = await admitTradeInvoiceWork({
    client, author: ALICE(), kind: TI_KIND.bill, particulars, basis: billBasis(), intentKey: mine,
  });

  const narrowed = await probeCarryingKey({ client, author: ALICE(), particulars, intentKey: mine });
  assert.equal(narrowed.match_count, 1, "the warning survives: only the caller's OWN recording is removed");
  assert.deepEqual(idsOf(narrowed), [earlier.invoice_id]);

  // A KEY NOBODY RECORDED UNDER, A BLANK KEY AND A NULL KEY all answer the four-argument answer.
  const unnarrowed = await probeTradeInvoiceDuplicatesFor({ client, author: ALICE(), particulars });
  assert.deepEqual(idsOf(unnarrowed), [earlier.invoice_id, admitted.invoice_id].sort());
  for (const key of [`ti-nobody-${randomUUID()}`, "   ", null]) {
    const p = await probeCarryingKey({ client, author: ALICE(), particulars, intentKey: key });
    assert.deepEqual(idsOf(p), idsOf(unnarrowed), `key ${JSON.stringify(key)} must narrow nothing`);
    assert.equal(p.match_count, unnarrowed.match_count);
  }
});

// ---------------------------------------------------------------------------------------------
// §3 — the whole retry, driven through the three doors in the order the tool calls them
// ---------------------------------------------------------------------------------------------

cell("p1135.retry.one_recording a RETRIED identical recording replays one invoice and leaves ONE acknowledgement row", async () => {
  const client = await tiClient("selfx3");
  const cp = await vendor(ALICE(), { client });
  const reference = `SELFX-${randomUUID().slice(0, 8)}`;
  const particulars = billParticulars({ counterparty: cp, reference });

  // THE LOOK-ALIKE THE PERSON IS GENUINELY WARNED ABOUT.
  const earlier = await admitTradeInvoiceWork({
    client, author: ALICE(), kind: TI_KIND.bill, particulars, basis: billBasis(),
    intentKey: `ti-selfx-earlier-${randomUUID()}`,
  });

  // THE RECORDING, exactly as the tool drives it: probe, acknowledgement, admission — one key.
  const intentKey = `ti-selfx-retry-${randomUUID()}`;
  const probe1 = await probeCarryingKey({ client, author: ALICE(), particulars, intentKey });
  assert.equal(probe1.match_count, 1, "the person is warned about the earlier bill");
  const ack1 = await recordTradeInvoiceDuplicateAck({
    client, author: ALICE(), intentKey, kind: TI_KIND.bill, particulars,
    shown: idsOf(probe1),
  });
  const admit1 = await admitTradeInvoiceWork({
    client, author: ALICE(), kind: TI_KIND.bill, particulars, basis: billBasis(), intentKey,
  });
  assert.equal(admit1.replayed, false);

  // THE RETRY. The same task, the same input, therefore the same key — which is what a model
  // segment that is retried produces, and what the lane's own report records happening
  // (`runModelSegmentStepV22` failed after 3 retries on a second turn in one session).
  const probe2 = await probeCarryingKey({ client, author: ALICE(), particulars, intentKey });
  assert.equal(probe2.match_count, 1, "the retry is shown the SAME earlier bill, never its own");
  assert.deepEqual(idsOf(probe2), [earlier.invoice_id]);
  const ack2 = await recordTradeInvoiceDuplicateAck({
    client, author: ALICE(), intentKey, kind: TI_KIND.bill, particulars,
    shown: idsOf(probe2),
  });
  const admit2 = await admitTradeInvoiceWork({
    client, author: ALICE(), kind: TI_KIND.bill, particulars, basis: billBasis(), intentKey,
  });

  // ONE INVOICE. This is the harm ADV-C1-01 measured: before the fix the retry carried a different
  // key and a SECOND invoice landed with the same reference, document date and total.
  assert.equal(admit2.replayed, true, "the admission door replays the recording it already made");
  assert.equal(admit2.invoice_id, admit1.invoice_id);
  const invoices = await rootQuery(
    "select count(*)::int as n from clara.trade_invoices where client_id = $1 and reference = $2",
    [client, particulars.reference]);
  assert.equal(invoices.rows[0].n, 2, "the earlier bill and this one — never three");

  // ONE ACKNOWLEDGEMENT. ADV-C1-03: before the fix the retry's `shown[]` named the invoice that
  // acknowledgement authorises, which changed the digest and minted a SECOND warning record
  // asserting the preparer had been shown their own recording.
  assert.equal(ack2.ack_id, ack1.ack_id, "the retry replays the acknowledgement it already wrote");
  assert.equal(ack2.replayed, true);
  const acks = await rootQuery(
    "select count(*)::int as n, min(jsonb_array_length(shown))::int as shown_n"
    + " from clara.trade_invoice_duplicate_acks where client_id = $1 and intent_key = $2",
    [client, intentKey]);
  assert.equal(acks.rows[0].n, 1, "one recording, one warning record");
  assert.equal(acks.rows[0].shown_n, 1);
  const shown = await rootQuery(
    "select shown from clara.trade_invoice_duplicate_acks where client_id = $1 and intent_key = $2",
    [client, intentKey]);
  assert.deepEqual(shown.rows[0].shown.map((s) => s.invoice_id), [earlier.invoice_id],
    "the warning names the EARLIER bill, never the invoice it authorises");
});

// ---------------------------------------------------------------------------------------------
// §4 — the key is not a tenancy boundary and is never trusted as one
// ---------------------------------------------------------------------------------------------

cell("p1135.probe.key_is_not_tenancy another firm's actor is refused before the narrowing is ever reached", async () => {
  const client = await tiClient("selfx4");
  const cp = await vendor(ALICE(), { client });
  const particulars = billParticulars({ counterparty: cp, reference: `SELFX-${randomUUID().slice(0, 8)}` });
  const intentKey = `ti-selfx-tenancy-${randomUUID()}`;
  await admitTradeInvoiceWork({
    client, author: ALICE(), kind: TI_KIND.bill, particulars, basis: billBasis(), intentKey,
  });

  // DAVE OWNS FIRM B AND IS NO MEMBER OF FIRM A. The authority preamble is the four-argument
  // twin's own (`clara._trade_invoice_actor_firm`), reached before anything is narrowed, so a
  // stranger holding a key learns nothing — not even that the key exists.
  let raised = null;
  try {
    await probeCarryingKey({ client, author: DAVE(), particulars, intentKey });
  } catch (err) { raised = err; }
  assert.ok(raised, "a stranger's probe is refused");
  assert.match(String(raised.message), /not a member|client not found|not found/i);
});
