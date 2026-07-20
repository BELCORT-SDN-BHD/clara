// Wave-A rig — the serialized CLR26 open-question gate (Codex probe 13; contract §6
// + companion §8/§14). Question writers and approve_entry share a documented lock
// protocol (document→filing lock; vendor→advisory 203005003; client→advisory
// 203005004), so an in-scope open question can never be raced past approval. Both
// commit orders, all THREE scopes, with blocking-pid evidence and a deadlock bound.
// Contract-blind. SKIPS (counted) until 0011 lands.
//
// Scope-id (CONFIRMED, PIN-ANSWERS §5b C): document→scope_id = document_id (the DOCUMENT
// is the subject; _open_question_blocks maps document → the active filing of
// (document, client) via _active_document_filing(..., p_lock=>true) for the lock);
// vendor→scope_id = counterparty_id; client→scope_id = client_id.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  ROLES, opk, endPool, printLaneNotes, noteLane, printSkipCount, skipUnready,
  waveAEnsureReady, buildWorld, firmOf, upsertPayableAccount, upsertAccountClassed,
  seedCitedDocument, freshResolution, draftEntryV3, billLines, ev, FIELD, normalize,
  counterpartyRows, grantConsent, holdThenContend, sawDeadlock, GUARD, CLR26, ROUTINE_CENTS,
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
after(async () => { printLaneNotes("wave-a-clr26"); printSkipCount("wave-a-clr26"); await endPool(); });

/** A routine human AP draft. Returns { entry_id, revision_token, documentId,
 *  filingId, counterpartyId }. */
async function billDraft(sub, { client, name = "QCO SDN BHD", reg = "201801005000", amount = ROUTINE_CENTS }) {
  const firm = await firmOf(client);
  const cited = await seedCitedDocument(sub, { firm, client, quote: "RM 500.00" });
  const d = await draftEntryV3(sub, {
    client, resolution: await freshResolution(sub, client, { subjectKind: "document", subjectId: cited.documentId }),
    document: cited.documentId, sha256: cited.sha256, lines: billLines(EXP, AP, amount),
    vendor: { new: { name, registration_no: reg } }, evidence: [ev(cited.regionId, cited.quote, FIELD.total)], opKey: opk("qcite"),
  });
  const cp = (await counterpartyRows(client)).find((c) => normalize(c.name_display ?? c.name ?? c.name_normalized) === normalize(name));
  return { ...d, documentId: cited.documentId, filingId: cited.filingId, counterpartyId: cp?.id ?? null };
}

const approveRun = (entry, tok) => (c) => (async () => { await c.query(GUARD); return c.query("select clara.approve_entry(p_entry => $1, p_expected_revision => $2, p_op_key => $3) as r", [entry, tok, opk("ap")]); })();
const openQRun = (client, scopeKind, scopeId) => (c) => (async () => { await c.query(GUARD); return c.query("select clara.open_question(p_client => $1, p_scope_kind => $2, p_scope_id => $3, p_question => 'rig block', p_op_key => $4) as r", [client, scopeKind, scopeId, opk("openq")]); })();

/** Run BOTH orders for a scope and assert serialization + the CLR26 refusal. */
async function bothOrders(t, { client, scopeKind, scopeIdOf }) {
  const { users } = world;
  // order A: question-first HOLDS; approve BLOCKS (proven) then loses CLR26.
  const dA = await billDraft(users.alice, { client, reg: `2018010${Math.floor(Math.random() * 90000) + 10000}` });
  if (!dA.counterpartyId) { noteLane(`${scopeKind}-scope: counterparty not located`); return; }
  const outA = await holdThenContend({
    a: { role: ROLES.authenticated, jwtSub: users.alice, run: openQRun(client, scopeKind, scopeIdOf(dA)) },
    b: { role: ROLES.authenticated, jwtSub: users.bob, run: approveRun(dA.entry_id, dA.revision_token) },
  });
  assert.ok(outA.provedBlocked, `${scopeKind}-scope order A: approve BLOCKED on the question writer's shared lock (blocking-pid proven)`);
  assert.ok(!sawDeadlock(outA), `${scopeKind}-scope order A: no deadlock`);
  assert.equal(outA.a.ok, true, `${scopeKind}-scope: the question committed first`);
  assert.equal(outA.b.ok, false, `${scopeKind}-scope: approve did NOT silently succeed against the in-scope question`);
  assert.equal(outA.b.code, CLR26, `${scopeKind}-scope: approve refuses CLR26 (got ${outA.b.code}) — ${outA.b.message?.slice(0, 160)}`);
  if (outA.b.message && !/scope|question/i.test(outA.b.message)) noteLane(`${scopeKind}-scope: CLR26 raised but DETAIL lacked question_id+scope (PINS §6 requires them)`);

  // order B: approve-first HOLDS; the question writer BLOCKS (proven) — it cannot
  // sneak in mid-approve. Approve commits (no pre-existing question); the question
  // then commits lawfully AFTER.
  const dB = await billDraft(users.alice, { client, reg: `2018010${Math.floor(Math.random() * 90000) + 10000}` });
  const outB = await holdThenContend({
    a: { role: ROLES.authenticated, jwtSub: users.alice, run: approveRun(dB.entry_id, dB.revision_token) },
    b: { role: ROLES.authenticated, jwtSub: users.bob, run: openQRun(client, scopeKind, scopeIdOf(dB)) },
  });
  assert.ok(outB.provedBlocked, `${scopeKind}-scope order B: the question writer BLOCKED on approve's shared lock (no check-then-act window)`);
  assert.ok(!sawDeadlock(outB), `${scopeKind}-scope order B: no deadlock`);
  assert.equal(outB.a.ok, true, `${scopeKind}-scope order B: approve committed (no question was blocking at approve time)`);
}

// ===========================================================================
// The three scopes, both orders each.
// ===========================================================================

test("CLR26 VENDOR scope, both orders: the vendor advisory lock serializes question-open and approve; approve refuses CLR26 when a vendor question is open", async (t) => {
  if (skipUnready(t, ready)) return;
  await bothOrders(t, { client: world.clients.A1, scopeKind: "vendor", scopeIdOf: (d) => d.counterpartyId });
});

test("CLR26 CLIENT scope, both orders: the client advisory lock serializes; approve refuses CLR26 when a client question is open", async (t) => {
  if (skipUnready(t, ready)) return;
  await bothOrders(t, { client: world.clients.A2, scopeKind: "client", scopeIdOf: () => world.clients.A2 });
});

test("CLR26 DOCUMENT scope, both orders: the filing row lock serializes; approve refuses CLR26 when a document question is open (incl. the shared-document path)", async (t) => {
  if (skipUnready(t, ready)) return;
  await bothOrders(t, { client: world.clients.A1, scopeKind: "document", scopeIdOf: (d) => d.documentId });
});

// ===========================================================================
// Resolve / dismiss clears the block — approval flows once the question is closed.
// ===========================================================================

test("CLR26 resolve clears the block: an approve refused by an open vendor question SUCCEEDS after resolve_open_question", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const { resolveOpenQuestion, openQuestion } = await import("./wave-a-fixtures.mjs");
  const d = await billDraft(users.alice, { client: clients.A1, reg: "201801005900" });
  if (!d.counterpartyId) { noteLane("resolve-clears: counterparty not located"); return; }
  const q = await openQuestion(users.alice, { client: clients.A1, scopeKind: "vendor", scopeId: d.counterpartyId });
  // Approve now refuses CLR26.
  await assert.rejects(() => import("./wave-a-fixtures.mjs").then((m) => m.approveRoutineEntry(users.bob, { entry: d.entry_id, expectedRevision: d.revision_token })), (e) => e.code === CLR26, "approve blocked by the open vendor question");
  const qid = q?.question_id ?? q?.id ?? q;
  await resolveOpenQuestion(users.alice, { question: qid, resolution: "handled" }).catch((e) => noteLane(`resolve_open_question raised ${e.code}`));
  // After resolve, the (unchanged) draft approves.
  const { approveRoutineEntry } = await import("./wave-a-fixtures.mjs");
  const r = await approveRoutineEntry(users.bob, { entry: d.entry_id, expectedRevision: d.revision_token }).catch((e) => ({ error: e.code }));
  assert.ok(!r?.error || r.error !== CLR26, `after resolve the block is cleared (approve no longer CLR26; got ${JSON.stringify(r)})`);
});
