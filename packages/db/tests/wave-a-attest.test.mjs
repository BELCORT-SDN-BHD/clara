// Wave-A rig — WA-D5 attestation + routine-batch (Codex probe 14; contract §4 WA-R7
// + WA-D5 + companion §13). (1) An agent-made high-stakes draft (last_human_editor
// NULL — the probe-P6 case INVERTED) refuses approval without an attestation (CLR05
// attestation_required) and approves WITH one. (2) approve_routine_entry structurally
// refuses EVERY is_high_stakes row (CLR05 routine_refuses_high_stakes), independent
// of any UI selection — forged calls are refused at the DB. (3) A routine batch is
// per-row isolated: one refusal poisons nothing. Contract-blind. SKIPS (counted).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, opk, endPool, printLaneNotes, noteLane, printSkipCount, skipUnready,
  waveAEnsureReady, buildWorld, firmOf, upsertPayableAccount, upsertAccountClassed,
  seedCitedDocument, freshResolution, draftEntryV3, billLines, ev, FIELD, mintInteractive,
  wakeBillDraft, approveEntry, approveRoutineEntry, grantConsent, entryStatus,
  HIGH_STAKES_CENTS, ROUTINE_CENTS, WREASON, reasonOf,
} from "./wave-a-fixtures.mjs";
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
after(async () => { printLaneNotes("wave-a-attest"); printSkipCount("wave-a-attest"); await endPool(); });

/** An agent-made (wake) HIGH-STAKES draft: last_human_editor NULL, amount above the
 *  high-stakes floor. Returns { entry_id, revision_token }. */
async function agentHighStakesDraft(client, { amount = HIGH_STAKES_CENTS + 500000 } = {}) {
  const firm = await firmOf(client);
  // F-A2 PR-1 (D11): the coded agent draft below needs a readable direction; state the supplier.
  const cited = await seedCitedDocument(world.users.alice, { firm, client, quote: "RM 15,000.00", direction: "purchase" });
  const cred = await mintInteractive(firm);
  return wakeBillDraft(world.users.alice, cred, { client, cited, amount, vendorName: "HIGHSTAKESCO SDN BHD", registration: "201801006000" });
}
/** A routine human AP draft (below the high-stakes floor). */
async function routineDraft(sub, { client, name = "ROUTINECO SDN BHD", reg = "201801006100", amount = ROUTINE_CENTS }) {
  const firm = await firmOf(client);
  const cited = await seedCitedDocument(sub, { firm, client, quote: "RM 500.00" });
  return draftEntryV3(sub, {
    client, resolution: await freshResolution(sub, client, { subjectKind: "document", subjectId: cited.documentId }),
    document: cited.documentId, sha256: cited.sha256, lines: billLines(EXP, AP, amount),
    vendor: { new: { name, registration_no: reg } }, evidence: [ev(cited.regionId, cited.quote, FIELD.total)], opKey: opk("routcite"),
  });
}
async function isHighStakes(entry) {
  const r = await rootQuery("select clara.is_high_stakes($1) as h", [entry]);
  return r.rows[0].h;
}

// ===========================================================================
// WA-D5 — the inverted P6: an agent high-stakes draft needs an attestation.
// ===========================================================================

test("WA-D5 an agent-made high-stakes draft (last_human_editor NULL) REFUSES approval without attestation (CLR05 attestation_required) — the probe-P6 hole closed", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const d = await agentHighStakesDraft(clients.A1);
  const hs = await isHighStakes(d.entry_id);
  if (!hs) { noteLane(`WA-D5: the fixture draft is not is_high_stakes (amount below threshold?) — gate unverified`); return; }
  // Without attestation → CLR05 attestation_required.
  const err = await approveEntry(users.bob, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("ap") }).then(() => null, (e) => e);
  assert.ok(err && err.code === "CLR05", `an agent high-stakes draft refuses approval WITHOUT attestation (got ${err?.code})`);
  if (err) { const rr = reasonOf(err); if (rr) assert.equal(rr, WREASON.attestationRequired, "the CLR05 reason discriminant is attestation_required"); }
  // WITH a non-blank attestation → approved (single bookkeeper, no distinct-checker needed for the agent branch).
  const ok = await approveEntry(users.bob, { entry: d.entry_id, expectedRevision: d.revision_token, attestation: "I have reviewed this high-stakes agent draft.", opKey: opk("ap2") }).catch((e) => ({ error: e.code }));
  assert.ok(!ok?.error, `WITH an attestation the agent high-stakes draft approves (got ${JSON.stringify(ok)})`);
  assert.equal(await entryStatus(d.entry_id), "approved", "the attested high-stakes agent draft is approved");
});

// ===========================================================================
// approve_routine_entry structurally refuses is_high_stakes — forged calls fail.
// ===========================================================================

test("approve_routine_entry REFUSES an is_high_stakes row (CLR05 routine_refuses_high_stakes) — DB-enforced independent of any UI selection (forge the call)", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  // A human-made high-stakes draft (last_human_editor set) — still refused by the routine path.
  const firm = await firmOf(clients.A2);
  const cited = await seedCitedDocument(users.alice, { firm, client: clients.A2, quote: "RM 20,000.00", direction: "purchase" });
  const d = await draftEntryV3(users.alice, {
    client: clients.A2, resolution: await freshResolution(users.alice, clients.A2, { subjectKind: "document", subjectId: cited.documentId }),
    document: cited.documentId, sha256: cited.sha256, lines: billLines(EXP, AP, HIGH_STAKES_CENTS + 1000000),
    vendor: { new: { name: "FORGECO SDN BHD", registration_no: "201801006200" } }, evidence: [ev(cited.regionId, cited.quote, FIELD.total)], opKey: opk("forgecite"),
  });
  if (!(await isHighStakes(d.entry_id))) { noteLane("routine-refuse: draft not high-stakes — gate unverified"); return; }
  const err = await approveRoutineEntry(users.bob, { entry: d.entry_id, expectedRevision: d.revision_token }).then(() => null, (e) => e);
  assert.ok(err && err.code === "CLR05", `approve_routine_entry refuses the high-stakes row (got ${err?.code}) — the forged batch call is refused at the DB`);
  const rr = err && reasonOf(err); if (rr) assert.equal(rr, WREASON.routineRefusesHighStakes, "the CLR05 reason discriminant is routine_refuses_high_stakes");
  assert.equal(await entryStatus(d.entry_id), "draft", "the high-stakes row stays a draft (never batch-approved)");
});

// ===========================================================================
// Routine batch isolation — one refusal poisons nothing (N individual calls).
// ===========================================================================

test("routine batch isolation: a mixed set (routine rows + one high-stakes) — the routine rows approve, the high-stakes refuses CLR05, and one refusal poisons nothing", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const routine = [];
  for (let i = 0; i < 3; i++) routine.push(await routineDraft(users.alice, { client: clients.A1, name: `BATCHCO ${i} SDN BHD`, reg: `20180100640${i}` }));
  const highStakes = await agentHighStakesDraft(clients.A1, { amount: HIGH_STAKES_CENTS + 700000 });
  // The batch fires N INDEPENDENT approve_routine_entry calls, each with its own
  // op_key + the row's own revision token. Collect per-row outcomes.
  const outcomes = [];
  for (const d of routine) outcomes.push(await approveRoutineEntry(users.bob, { entry: d.entry_id, expectedRevision: d.revision_token }).then(() => "ok", (e) => e.code));
  outcomes.push(await approveRoutineEntry(users.bob, { entry: highStakes.entry_id, expectedRevision: highStakes.revision_token }).then(() => "ok", (e) => e.code));
  // The three routine rows approved; the high-stakes refused CLR05 — no cross-poison.
  const approved = [];
  for (const d of routine) approved.push(await entryStatus(d.entry_id));
  assert.ok(approved.every((s) => s === "approved"), `every routine row approved independently (statuses ${JSON.stringify(approved)})`);
  assert.equal(outcomes[outcomes.length - 1], "CLR05", `the high-stakes row refused CLR05 without poisoning the batch (outcomes ${JSON.stringify(outcomes)})`);
  assert.equal(await entryStatus(highStakes.entry_id), "draft", "the high-stakes row stays a draft");
});
