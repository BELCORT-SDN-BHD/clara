// Wave-A rig — duplicate-bill serialization (Codex probe 11; contract §4 +
// companion §14). approve_entry takes a deterministic advisory lock on
// (client, counterparty, invoice_id) BEFORE the duplicate EXISTS check, so two
// concurrent approvals of EXACT duplicates (both orders, including one via
// approve_routine_entry) can no longer both commit — at most one approved-unreversed
// bill key survives. Contract-blind. SKIPS (counted) until 0011 lands.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  ROLES, rootQuery, opk, endPool, printLaneNotes, noteLane, printSkipCount, skipUnready,
  waveAEnsureReady, buildWorld, firmOf, upsertPayableAccount, upsertAccountClassed,
  seedCitedDocument, freshResolution, draftEntryV3, approveEntry, billLines, ev, FIELD,
  enqueueInvoiceFacts, invoiceFactsTask, claimTask, persistInvoiceFacts, factField,
  mintInteractive, wakeBillDraft, grantConsent, concurrentTwoSession, sawDeadlock, GUARD, ROUTINE_CENTS,
} from "./wave-a-race.mjs";
import { AP, EXP } from "./wave-a-fixtures.mjs";

let ready = false;
let world = null;
before(async () => {
  ready = await waveAEnsureReady();
  if (ready) {
    world = await buildWorld();
    for (const c of [world.clients.A1, world.clients.A2]) {
      await upsertPayableAccount(world.users.alice, { client: c, code: AP, name: "Trade Creditors", opKey: opk("ap") });
      await upsertAccountClassed(world.users.alice, { client: c, code: EXP, name: "Prof Fees", type: "expense", opKey: opk("exp") });
      await grantConsent(world.users.alice, { firm: await firmOf(c), client: c }).catch(() => {});
    }
  }
});
after(async () => { printLaneNotes("wave-a-dupbill"); printSkipCount("wave-a-dupbill"); await endPool(); });

/** A human AP draft on a fresh cited doc whose facts carry a GIVEN invoice_id, all
 *  citing the same vendor registration (so both resolve to one counterparty).
 *  Returns { entry_id, revision_token }. */
async function dupDraft(sub, { client, reg, invoiceId, name = "DUPCO SDN BHD", amount = ROUTINE_CENTS }) {
  const firm = await firmOf(client);
  // 0016 (P3): classify-first gate — kind-stamped at seed so invoice_facts engages directly.
  const cited = await seedCitedDocument(sub, { firm, client, quote: "RM 500.00", kind: "invoice" });
  await enqueueInvoiceFacts(cited.documentId);
  const task = await invoiceFactsTask(cited.documentId);
  await claimTask(task.id, { egressApproved: true }).catch(() => {});
  await persistInvoiceFacts(task.id, [
    factField(FIELD.total, `RM ${(amount / 100).toFixed(2)}`), factField(FIELD.currency, "MYR"),
    factField(FIELD.vendorName, name), factField(FIELD.invoiceId, invoiceId),
  ]).catch((e) => noteLane(`persist facts (dup) raised ${e.code}`));
  // A WAKE SUPPLIER_BILL draft (the dup-bill gate applies only to supplier_bill coding,
  // per the s6 W2 pattern) resolving to the PRE-BIRTHED counterparty by the SAME
  // registration (registration_match, no birth) → both approvals race on the
  // (client,counterparty,invoice_id) dup-bill lock (CLR21), not the birth-race (CLR23).
  const cred = await mintInteractive(firm);
  return wakeBillDraft(sub, cred, { client, cited, amount, vendorName: name, registration: reg, opKey: opk("dupcite") });
}

/** Pre-birth ONE shared counterparty (draft+approve a first bill), return its id. */
async function birthCounterparty(sub, { client, name, reg }) {
  const firm = await firmOf(client);
  const cited = await seedCitedDocument(sub, { firm, client, quote: "RM 500.00" });
  const d = await draftEntryV3(sub, {
    client, resolution: await freshResolution(sub, client, { subjectKind: "document", subjectId: cited.documentId }),
    document: cited.documentId, sha256: cited.sha256, lines: billLines(EXP, AP, ROUTINE_CENTS),
    vendor: { new: { name, registration_no: reg } }, evidence: [ev(cited.regionId, cited.quote, FIELD.total)], opKey: opk("birthcite"),
  });
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("birthap") });
  const r = await rootQuery("select id from clara.counterparties where client_id=$1 and registration_no=$2 and merged_into is null order by created_at desc limit 1", [client, reg]);
  return r.rows[0]?.id ?? null;
}

const approveRun = (entry, tok) => (c) => (async () => { await c.query(GUARD); return c.query("select clara.approve_entry(p_entry => $1, p_expected_revision => $2, p_op_key => $3) as r", [entry, tok, opk("ap")]); })();
const routineRun = (entry, tok) => (c) => (async () => { await c.query(GUARD); return c.query("select clara.approve_routine_entry(p_entry => $1, p_expected_revision => $2, p_op_key => $3) as r", [entry, tok, opk("aproutine")]); })();

// ===========================================================================
// Concurrent exact-duplicate approvals — at most one commits (both orders).
// ===========================================================================

test("two concurrent approvals of EXACT duplicates (approve_entry || approve_entry) → at most ONE approved-unreversed; the loser refuses CLR21 duplicate_bill; no deadlock", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const inv = `INVDUP-${opk("i")}`, reg = "201801004000", nm = "DUPCO SDN BHD";
  const cp = await birthCounterparty(users.alice, { client: clients.A1, name: nm, reg });
  if (!cp) { noteLane("dupbill: shared counterparty not birthed"); return; }
  const d1 = await dupDraft(users.alice, { client: clients.A1, reg, invoiceId: inv, name: nm });
  const d2 = await dupDraft(users.alice, { client: clients.A1, reg, invoiceId: inv, name: nm });
  const out = await concurrentTwoSession({
    a: { role: ROLES.authenticated, jwtSub: users.alice, run: approveRun(d1.entry_id, d1.revision_token) },
    b: { role: ROLES.authenticated, jwtSub: users.bob, run: approveRun(d2.entry_id, d2.revision_token) },
  });
  assert.ok(!sawDeadlock(out), "concurrent duplicate approvals do not deadlock (advisory lock serializes)");
  const wins = [out.a, out.b].filter((s) => s.ok).length;
  assert.equal(wins, 1, `at most ONE duplicate approval commits (got ${wins}) — the (client,counterparty,invoice_id) lock closed the race`);
  const loser = [out.a, out.b].find((s) => !s.ok);
  assert.ok(loser && [ "CLR21" ].includes(loser.code), `the loser refuses CLR21 duplicate_bill (got ${loser?.code})`);
});

test("duplicate approvals via the BATCH path: approve_routine_entry || approve_entry on exact duplicates → still at most one commits; no deadlock", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const inv = `INVDUP-${opk("i")}`, reg = "201801004100", nm = "DUPCO2 SDN BHD";
  const cp = await birthCounterparty(users.alice, { client: clients.A2, name: nm, reg });
  if (!cp) { noteLane("dupbill batch: shared counterparty not birthed"); return; }
  const d1 = await dupDraft(users.alice, { client: clients.A2, reg, invoiceId: inv, name: nm });
  const d2 = await dupDraft(users.alice, { client: clients.A2, reg, invoiceId: inv, name: nm });
  const out = await concurrentTwoSession({
    a: { role: ROLES.authenticated, jwtSub: users.alice, run: routineRun(d1.entry_id, d1.revision_token) }, // batch path
    b: { role: ROLES.authenticated, jwtSub: users.bob, run: approveRun(d2.entry_id, d2.revision_token) }, // per-item path
  });
  assert.ok(!sawDeadlock(out), "batch || per-item duplicate approvals do not deadlock");
  const wins = [out.a, out.b].filter((s) => s.ok).length;
  assert.equal(wins, 1, "the same (client,counterparty,invoice_id) lock is shared by BOTH entry points — at most one commits");
  const loser = [out.a, out.b].find((s) => !s.ok);
  assert.ok(loser && loser.code === "CLR21", `the loser refuses CLR21 (got ${loser?.code})`);
});
