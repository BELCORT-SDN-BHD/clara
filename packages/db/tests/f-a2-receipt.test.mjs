// F-A2 PR-1 — Annex C.6: ACTING IDENTITY AND THE RECEIPT. C.7 (N1/T3) and C.7b (the receipt
// write contract) are f-a2-receipt-2.test.mjs.
//
// CONTRACT-BLIND, frontier-gated on `f_a2_posting_core$`.
//
// THE ONE IDEA BEHIND EVERY CELL HERE: the receipt records what the DB SAW and what the DB
// KNOWS IT DOES NOT KNOW. On the unattended lane there is no directing human — `autodraft` is
// client-bound and director-less BY CONSTRUCTION (finding 7: `mint_wake_credential` forbids
// `on_behalf_of` on that kind) — so `maker_active_at_approval` is NULL there, never `false`.
// A `false` would be an INFERENCE dressed as an observation, which is the law-68 defect in its
// accounting clothes. The `on_behalf_of` pair-cell exists for the same reason: it proves the
// NULL is structural rather than a bug, by showing the SAME column carrying a value on the
// lane where a director really exists.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, endPool, buildWorld, printLaneNotes, printSkipCount, noteLane,
  booksVersion, opk, entryRow, hasColumn, truncateGuardError, withTxnOrNull,
  postingCoreReady, gateCore, wakePostEntry, agentPostable, agentDraft, ensureChart,
  witnessedFiling, interactiveCred, postReceiptRow, postReceiptCount, entryEvents,
  supplierLines, bodyOfName, MODEL, RATIONALE, APPROVAL_ARM_AGENT, RECEIPT_WAKE_KINDS,
  EVENT_POSTED, AGENT_USER_ID, admitsAll, assertVectorShape, autodraftCred,
} from "./f-a2-post-world.mjs";

let world = null;
before(async () => { if (await postingCoreReady()) world = await buildWorld(); });
after(async () => {
  printLaneNotes("f-a2-receipt");
  printSkipCount("f-a2-receipt");
  await endPool();
});

const A1 = () => world.clients.A1;
const A2 = () => world.clients.A2;
const OWNER = () => world.users.alice;
const BOB = () => world.users.bob;

/** Post a clean agent draft and hand back both the wire receipt and the durable row. */
async function postedPair(client, over = {}) {
  const p = await agentPostable(OWNER(), { client, ...over });
  const wire = await wakePostEntry(p.cred, p.args);
  return { p, wire, row: await postReceiptRow(p.args.entry) };
}

// ===========================================================================
// C.6 — what the receipt carries.
// ===========================================================================

test("f-a2.c6.carries the receipt carries actor + wake kind + model + rationale + verdict + vector", async (t) => {
  if (await gateCore(t)) return;
  const { p, wire, row } = await postedPair(A1());
  assert.equal(wire?.posted, true, `c6.carries: the control post landed (${JSON.stringify(wire?.refusal)})`);
  assert.ok(row, "c6.carries: a durable entry_post_receipts row exists");
  assert.equal(row.acting_actor, AGENT_USER_ID, "c6.carries: acting_actor is the one global agent identity (0002:334-335)");
  assert.ok(RECEIPT_WAKE_KINDS.includes(row.via_wake_kind),
    `c6.carries: via_wake_kind is one of ${RECEIPT_WAKE_KINDS.join("/")} — and NEVER 'interactive_client', which is minted for wake_open_question alone (got ${row.via_wake_kind})`);
  assert.equal(row.via_wake_kind, "autodraft", "c6.carries: …'autodraft' on the unattended lane");
  for (const k of ["provider", "model", "version"]) {
    assert.ok(String(row.model_snapshot?.[k] ?? "").trim().length > 0,
      `c6.carries: model_snapshot.${k} is non-blank — the wall recording WHICH model posted (R-3)`);
  }
  assert.equal(row.model_snapshot.model, MODEL.model, "c6.carries: …and it is the model the caller actually named");
  assert.equal(row.rationale, RATIONALE, "c6.carries: the rationale is stored verbatim");
  assertVectorShape(assert, row.gate_verdicts?.rung_vector, "c6.carries");
  assert.ok(admitsAll(row.gate_verdicts.rung_vector), "c6.carries: …and it admits at every rung");
  assert.ok(row.gate_verdicts?.verdict ?? wire.verdict,
    "c6.carries: the verdict block — what the DB SAW, not what the model claimed (the law-27(2) instrument)");
  assert.equal(row.entry_id, p.args.entry, "c6.carries: keyed to the entry");
  assert.ok(String(row.op_key ?? "").length > 0, "c6.carries: and it names the op key it was written under");
});

test("f-a2.c6.obo on_behalf_of is NULL on an autodraft post and NON-NULL on a chat post — the NULL is STRUCTURAL", async (t) => {
  if (await gateCore(t)) return;
  const unattended = await postedPair(A1());
  assert.equal(unattended.row?.on_behalf_of, null,
    "c6.obo: NULL on the unattended lane, because `mint_wake_credential` forbids a director on autodraft");

  await ensureChart(OWNER(), A2());
  const cited = await witnessedFiling(OWNER(), { client: A2(), gross: 520000 });
  const chat = await interactiveCred(A2(), BOB());
  const d = await agentDraft(OWNER(), chat, { client: A2(), cited, codingKind: "supplier_bill", lines: supplierLines(520000) });
  const wire = await wakePostEntry(chat, {
    entry: d.entry_id, expectedRevision: d.revision_token, client: A2(), booksVersion: await booksVersion(A2()),
  });
  // C3: FORCED. `noteLane` writes to stderr and node counts the cell PASSED, so a note plus an
  // early return is never a skip — it is a green recorded for the one outcome that leaves the
  // claim unproven.
  // The PAIR is the claim: a NULL obo on autodraft means nothing without a NON-NULL one beside
  // it, so "the paired half is unproven this run" was a green for exactly the run that proves
  // nothing.
  assert.equal(wire?.posted, true,
    `c6.obo: the chat-lane post LANDS — the non-NULL half is what makes the autodraft NULL structural (${JSON.stringify(wire?.refusal)})`);
  const row = await postReceiptRow(d.entry_id);
  assert.equal(row?.on_behalf_of, BOB(),
    "c6.obo: the SAME column carries the director on the lane where one exists — which is what proves the autodraft NULL is structural and not a dropped write");
  assert.equal(row.via_wake_kind, "interactive",
    "c6.obo: …and a chat post keeps the PLAIN kind (C.13's first cell)");
});

test("f-a2.c6.maker-null maker_active_at_approval is NULL on autodraft, NEVER false", async (t) => {
  if (await gateCore(t)) return;
  const { row } = await postedPair(A1());
  assert.equal(row?.maker_active_at_approval, null,
    `c6.maker-null: NULL where no director exists. A 'false' would be an INFERENCE dressed as an observation (got ${JSON.stringify(row?.maker_active_at_approval)})`);
  assert.notEqual(row?.maker_active_at_approval, false,
    "c6.maker-null: and specifically not false-by-inference (law 68)");
});

test("f-a2.c6.arm approval_arm is 'agent_unattended' and NO self_approval_attestation is written", async (t) => {
  if (await gateCore(t)) return;
  const { p, row } = await postedPair(A1());
  assert.equal(row?.approval_arm, APPROVAL_ARM_AGENT,
    "c6.arm: the agent takes its own arm and participates in maker/checker not at all");
  const entry = await entryRow(p.args.entry);
  if (await hasColumn("journal_entries", "self_approval_attestation")) {
    assert.equal(entry?.self_approval_attestation, null,
      "c6.arm: dressing an unattended post as a self-attestation would make that column assert a judgement NOBODY made");
  } else {
    noteLane("c6.arm: journal_entries carries no self_approval_attestation column on this frontier — the attestation lives elsewhere and the cell asserts the arm alone");
  }
  assert.notEqual(row.approval_arm, "self_attestation", "c6.arm: …and it is not the human self-attestation arm wearing a new name");
});

test("f-a2.c6.human-arms the human lane's THREE CLR05 arms are byte-untouched", async (t) => {
  if (await gateCore(t)) return;
  // The 8th body recuts `_approve_entry_core`. What must NOT move is the maker/checker family:
  // arm 1 demands an attestation the DB does not validate, `distinct_checker` is unreachable for
  // an agent (eligible_checker_count's `u.is_agent = false`), and `self_attestation` is the solo
  // firm's live-proven door. All three are asserted by their own reason tokens.
  // BY NAME. The live core is FIVE-arity — `(p_ctx jsonb, p_entry uuid, p_expected_revision
  // uuid, p_attestation text, p_op_key text)` — and a cell that guessed four got a NULL body and
  // reported "did not resolve" when the TEST was what was wrong.
  const { src, args } = await bodyOfName("_approve_entry_core");
  assert.ok(src, "c6.human-arms: the shared approve core resolves");
  noteLane(`c6.human-arms: live approve core = clara._approve_entry_core(${args})`);
  for (const reason of ["attestation_required", "distinct_checker", "self_attestation"]) {
    assert.ok(src.includes(`"reason":"${reason}"`),
      `c6.human-arms: the CLR05 arm '${reason}' survives the 8th body verbatim`);
  }
  assert.ok(src.includes(APPROVAL_ARM_AGENT),
    "c6.human-arms: …and the agent arm is a FOURTH arm added beside them, not a rewrite of one");
});

test("f-a2.c6.oq6 an is_year_end AND a tax_affecting entry BOTH post unattended", async (t) => {
  if (await gateCore(t)) return;
  // OQ-6's ruling made behaviour, so it gets a cell rather than an assumption. Both flags make
  // an entry `is_high_stakes` (0004:74); the agent lane posts them anyway, on the ground that
  // both carry mandatory downstream human checkpoints while the amount case has none.
  for (const flag of ["is_year_end", "tax_affecting"]) {
    const p = await agentPostable(OWNER(), { client: A1(), amount: 1500000, flags: { [flag]: true } });
    const row = await entryRow(p.args.entry);
    assert.equal(row?.[flag], true, `c6.oq6 precondition: the draft really carries ${flag}`);
    const wire = await wakePostEntry(p.cred, p.args);
    assert.equal(wire?.posted, true,
      `c6.oq6 ${flag}: it POSTS unattended at any amount — no category gate ON THE AGENT LANE (${JSON.stringify(wire?.refusal)})`);
    assert.equal((await postReceiptRow(p.args.entry))?.approval_arm, APPROVAL_ARM_AGENT,
      `c6.oq6 ${flag}: on the agent arm`);
  }
  noteLane("c6.oq6: the HUMAN lane's distinct-checker gate on the same categories STANDS unchanged (F33) — this cell says nothing about it, deliberately");
});

test("f-a2.c6.channels _audit AND entry.posted both carry obo and wake kind — the 0037:2102/:2111 regression cell", async (t) => {
  if (await gateCore(t)) return;
  // The three dropped identity channels: `_approve_entry_core` hard-codes NULL for on_behalf_of
  // and via_wake_kind in `_audit` and passes an EMPTY payload to `_append_event`, while
  // `_draft_entry_core` passes both through. The 8th body reads them from p_ctx.
  await ensureChart(OWNER(), A2());
  const cited = await witnessedFiling(OWNER(), { client: A2(), gross: 530000 });
  const chat = await interactiveCred(A2(), BOB());
  const d = await agentDraft(OWNER(), chat, { client: A2(), cited, codingKind: "supplier_bill", lines: supplierLines(530000) });
  const wire = await wakePostEntry(chat, {
    entry: d.entry_id, expectedRevision: d.revision_token, client: A2(), booksVersion: await booksVersion(A2()),
  });
  // C3: FORCED. "The cell declines to assert" is a pass recorded for the one outcome in which
  // the three identity channels go unmeasured.
  assert.equal(wire?.posted, true,
    `c6.channels: the chat post LANDS, so the three identity channels can be read at all (${JSON.stringify(wire?.refusal)})`);
  // `audit_log` keys on `entry_id` and names the verb in `fn` — there is no `subject_id` and
  // no `action` column. Measured, not assumed.
  const audit = await rootQuery(
    `select to_jsonb(a) as row from clara.audit_log a
      where a.entry_id=$1 order by a.at desc limit 5`, [d.entry_id]);
  const approveRow = audit.rows.map((x) => x.row).find((x) => /approve|post/i.test(x.fn ?? ""));
  assert.ok(approveRow, "c6.channels: the post wrote an audit row");
  assert.equal(approveRow.on_behalf_of, BOB(), "c6.channels: _audit carries the director — channel 1 re-opened");
  assert.equal(approveRow.via_wake_kind, "interactive", "c6.channels: …and the wake kind — channel 2");
  const events = await entryEvents(d.entry_id, [EVENT_POSTED]);
  assert.equal(events.length, 1, "c6.channels: exactly one entry.posted event");
  assert.equal(events[0].on_behalf_of ?? events[0].payload?.on_behalf_of, BOB(),
    "c6.channels: entry.posted carries the director — channel 3");
  assert.ok(events[0].payload?.post_receipt_id, "c6.channels: …and the event names the post_receipt_id");
});

test("f-a2.c6.birth-identity counterparty.created carries obo + wake kind — E.3's THIRD channel, on the emitter between the other two", async (t) => {
  if (await gateCore(t)) return;
  // THE CHANNEL THE FIRST CUT MISSED. E.3 names three dropped identity channels; the splice
  // trued `_audit` and `entry.approved` and left the counterparty-birth emitter — ONE statement
  // between them, in the same agent transaction — hard-coding `null,null`. So the one event that
  // says a NEW PARTY entered this client's books was the one event that could not say which lane
  // put it there. Both arms are asserted, because the NULL half is what makes the non-NULL half
  // structural rather than incidental (the same pairing c6.obo uses for the receipt).
  const born = async (cred, client, name) => {
    const cited = await witnessedFiling(OWNER(), { client, gross: 560000, vendorName: name });
    const d = await agentDraft(OWNER(), cred, {
      client, cited, codingKind: "supplier_bill", lines: supplierLines(560000),
      vendor: { new: { name } },
    });
    const r = await wakePostEntry(cred, {
      entry: d.entry_id, expectedRevision: d.revision_token, client, booksVersion: await booksVersion(client),
    });
    return { r, cited };
  };
  // The event relation is `clara.domain_events`, ordered by `seq` -- read from the catalog the
  // battery's own `entryEvents` helper reads, never guessed.
  const evt = async (client, since) => (await rootQuery(
    `select to_jsonb(d) as row from clara.domain_events d
      where d.client_id=$1 and d.event_type='counterparty.created' and d.seq > $2
      order by d.seq desc limit 1`, [client, since])).rows[0]?.row ?? null;
  const high = async (client) => (await rootQuery(
    "select coalesce(max(seq),0)::bigint as v from clara.domain_events where client_id=$1", [client])).rows[0].v;

  // (a) AUTODRAFT — obo is structurally NULL there, and the wake kind must still be stated.
  const markA = await high(A1());
  const auto = await born(await autodraftCred(A1()), A1(), `C6 BIRTH AUTO ${Date.now().toString(36)} SDN BHD`);
  assert.equal(auto.r?.posted, true, `c6.birth-identity: mandatory setup — the autodraft post lands (${JSON.stringify(auto.r?.refusal)})`);
  const ea = await evt(A1(), markA);
  assert.ok(ea, "c6.birth-identity: the autodraft post BIRTHED a counterparty and emitted counterparty.created");
  assert.equal(ea.on_behalf_of, null,
    "c6.birth-identity: on_behalf_of is NULL on the autodraft lane — structural, exactly as it is on the receipt");
  assert.equal(ea.via_wake_kind, "autodraft",
    `c6.birth-identity: …and the wake kind IS stated, which is the half a hard-coded null,null could never produce (got ${JSON.stringify(ea.via_wake_kind)})`);

  // (b) CHAT — the director is named. Without this arm the NULL above proves nothing.
  const markB = await high(A2());
  const chat = await born(await interactiveCred(A2(), BOB()), A2(), `C6 BIRTH CHAT ${Date.now().toString(36)} SDN BHD`);
  assert.equal(chat.r?.posted, true, `c6.birth-identity: mandatory setup — the chat post lands (${JSON.stringify(chat.r?.refusal)})`);
  const eb = await evt(A2(), markB);
  assert.ok(eb, "c6.birth-identity: the chat post birthed a counterparty too");
  assert.equal(eb.on_behalf_of, BOB(), "c6.birth-identity: …and names the DIRECTOR — E.3 channel 3, on the birth emitter");
  assert.equal(eb.via_wake_kind, "interactive", "c6.birth-identity: …with the plain chat wake kind");
});

test("f-a2.c6.unique unique(entry_id) — one receipt per entry, structurally", async (t) => {
  if (await gateCore(t)) return;
  const { p, row } = await postedPair(A1());
  assert.equal(await postReceiptCount(p.args.entry), 1, "c6.unique: exactly one row");
  const dup = await withTxnOrNull((c) => c.query(
    `insert into clara.entry_post_receipts(firm_id,client_id,entry_id,acting_actor,via_wake_kind,
        model_snapshot,rationale,gate_verdicts,approval_arm,op_key)
     values($1,$2,$3,$4,'autodraft',$5::jsonb,'c6.unique duplicate',$6::jsonb,$7,$8)`,
    [row.firm_id, row.client_id, p.args.entry, AGENT_USER_ID, JSON.stringify(MODEL),
      JSON.stringify(row.gate_verdicts), APPROVAL_ARM_AGENT, opk("c6dup")]));
  assert.ok(dup?.error, "c6.unique: a second row for the same entry is refused");
  assert.ok(["23505", "CLR08"].includes(dup.error.code),
    `c6.unique: …by the unique constraint or the append-only guard, never silently (got ${dup.error.code}: ${dup.error.message})`);
});

test("f-a2.c6.append-only the receipt table refuses UPDATE, DELETE and TRUNCATE", async (t) => {
  if (await gateCore(t)) return;
  const { p } = await postedPair(A1());
  const upd = await withTxnOrNull((c) => c.query(
    "update clara.entry_post_receipts set rationale='c6 rewrite' where entry_id=$1", [p.args.entry]));
  assert.ok(upd?.error && upd.error.code === "CLR08", `c6.append-only: UPDATE refuses CLR08 (got ${JSON.stringify(upd?.error?.code)})`);
  const del = await withTxnOrNull((c) => c.query(
    "delete from clara.entry_post_receipts where entry_id=$1", [p.args.entry]));
  assert.ok(del?.error && del.error.code === "CLR08", `c6.append-only: DELETE refuses CLR08 (got ${JSON.stringify(del?.error?.code)})`);
  // NEVER a bare TRUNCATE: it takes ACCESS EXCLUSIVE on the table AND every cascade dependent,
  // so with other writers live it can lose a deadlock (40P01) or a lock-wait race (55P03)
  // BEFORE reaching the BEFORE TRUNCATE guard — and the assertion would then observe the race
  // instead of the guard. `truncateGuardError` bounds the wait and retries until the guard
  // itself answers.
  const trunc = await truncateGuardError("truncate clara.entry_post_receipts");
  assert.ok(trunc, "c6.append-only: TRUNCATE raised — the guard answered, not a lock race");
  assert.equal(trunc.code, "CLR08", `c6.append-only: TRUNCATE refuses CLR08 (got ${trunc.code}: ${trunc.message})`);
  assert.equal(await postReceiptCount(p.args.entry), 1, "c6.append-only: the row survived all three attempts");
});
