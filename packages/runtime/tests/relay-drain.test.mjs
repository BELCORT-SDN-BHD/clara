// Slice-3 relay — draining behaviour: (e) bootstrap, (d) NOTIFY hygiene, and the
// (X1) fairness/anti-starvation guarantee. Contract:
// docs/plan/completed/slice3-event-spine-contract.md §2.9.

import { test } from "node:test";
import assert from "node:assert/strict";

import { runRelayCycle, makeClient } from "../lib/relay.mjs";
import * as fx from "./relay-fixtures.mjs";
import { skip, drainInProcess, assertExactlyOnce, sleep } from "./relay-testkit.mjs";

// ===========================================================================
// (e) BOOTSTRAP — a brand-new firm (no checkpoint) with > one batch fully drains
// ===========================================================================

test("(e) bootstrap: brand-new firm, multi-batch, drains to checkpoint == head", { skip }, async () => {
  const { firm, owner, client } = await fx.buildFirm("boot");
  await fx.pumpDocuments(owner, client, 8, "boot"); // >> one batch of 3
  assert.equal(await fx.checkpointSeq(firm), null, "no checkpoint row before the first drain");

  await drainInProcess(firm, { batchSize: 3 });
  await assertExactlyOnce(firm, 8);
});

// ===========================================================================
// (X1) FAIRNESS — a continuously-busy firm must not starve another
// ===========================================================================

test("(X1) fairness: a continuously-replenished firm does not starve another", { skip }, async () => {
  const A = await fx.buildFirm("starveA");
  const B = await fx.buildFirm("starveB");
  await fx.pumpDocuments(B.owner, B.client, 18, "B"); // ~20 events ⇒ needs >1 round-robin cycle
  const bHead = await fx.headSeq(B.firm);

  let bDoneCycle = -1;
  const MAX_CYCLES = 4;
  for (let cyc = 0; cyc < MAX_CYCLES; cyc++) {
    await fx.pumpDocuments(A.owner, A.client, 15, `A-${cyc}`); // replenish A EVERY cycle
    await fx.asRuntime((c) =>
      runRelayCycle(c, { onlyFirm: [A.firm, B.firm], batchSize: 3, maxBatchesPerFirm: 4 }),
    );
    if ((await fx.checkpointSeq(B.firm)) === bHead) {
      bDoneCycle = cyc;
      break;
    }
  }

  assert.ok(bDoneCycle >= 0 && bDoneCycle <= 2, `B drained within a bounded #cycles despite busy A (got ${bDoneCycle})`);
  assert.ok(
    (await fx.checkpointSeq(A.firm)) < (await fx.headSeq(A.firm)),
    "A still carries a backlog (it was capped per cycle — it did NOT monopolize the relay)",
  );
  await assertExactlyOnce(B.firm, 18);
});

// ===========================================================================
// (d) NOTIFY hygiene — a listener sees EMPTY payloads only, even cross-role
// ===========================================================================

test("(d) NOTIFY hygiene: clara_events payloads are always empty (N1)", { skip }, async () => {
  const { owner, client } = await fx.buildFirm("notify");

  const listener = makeClient();
  await listener.connect();
  const payloads = [];
  try {
    // A WAKE-role session (N1's cross-role concern) still receives only empty bytes.
    await listener.query("set role clara_wake_proactive");
    listener.on("notification", (msg) => payloads.push(msg.payload));
    await listener.query("listen clara_events");

    await fx.pumpDocuments(owner, client, 5, "notify"); // each commit ⇒ NOTIFY ''
    await listener.query("select 1"); // flush pending notifications
    await sleep(200);
    await listener.query("select 1");

    assert.ok(payloads.length >= 1, `received at least one notification (got ${payloads.length})`);
    for (const p of payloads) assert.equal(p, "", "NOTIFY payload carries ZERO information bytes");
  } finally {
    await listener.end().catch(() => {});
  }
});
