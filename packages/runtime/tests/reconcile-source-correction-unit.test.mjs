// #1030 — THE SOURCE-CORRECTION RE-DERIVATION BELT, at its own seam.
//
// The belt is what makes "the Work runtime re-reads the corrected document" a DURABLE act rather
// than a hope. The retirement puts the parked task into `cancel_requested` and the control
// listener then ABORTS that engine run, so the retired run cannot be the lane that re-derives:
// it is not guaranteed to be resumed at all. A backlog read plus an exactly-once settlement is
// what survives a crash between the two.
//
// SEAMS, and there are exactly three: the leader's connection (`client.query`), the per-item
// runtime transaction factory (`withRuntime`), and the pure derivation the belt imports. Both
// database seams are INJECTED here, so every cell below is about the belt's own decisions — what
// it admits, what it declines, what it counts and what it contains — and not about Postgres.
//
// The db half of this contract is `packages/db/tests/work-source-correction-rederivation.test.mjs`,
// which drives the three real doors; the two files do not overlap and neither substitutes for the
// other.

import { test } from "node:test";
import assert from "node:assert/strict";

const { register } = await import("tsx/esm/api");
register();

const { reconcileWorkSourceCorrections, REDERIVE_MODEL_ID } =
  await import("../lib/reconciler-work-source-correction.mjs");

const KEY_A = "source_corrected:11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222";
const KEY_B = "source_corrected:33333333-3333-4333-8333-333333333333:44444444-4444-4444-8444-444444444444";
const CLIENT = "55555555-5555-4555-8555-555555555555";
const ACTOR = "66666666-6666-4666-8666-666666666666";

function brief(opKey, {
  priorCents = 64000, liveCents = 99900, fieldPath = "invoice.total", monetary = true,
} = {}) {
  // A non-monetary field carries TEXT and no cents, which is exactly how the database hands it
  // back: `jsonb_strip_nulls` drops `cents` for a region with no `monetary_cents`.
  const prior = monetary ? { text: "prior", cents: String(priorCents) } : { text: "ACME SDN BHD" };
  const live = monetary ? { text: "live", cents: String(liveCents) } : { text: "Acme Sdn Bhd" };
  return {
    op_key: opKey,
    client_id: CLIENT,
    corrected_by: ACTOR,
    field_path: fieldPath,
    prior_value: prior,
    new_value: live,
    live_facts: { [fieldPath]: live },
    retired_work_id: "77777777-7777-4777-8777-777777777777",
    retired_source_refs: [{ kind: "document", document_id: "88888888-8888-4888-8888-888888888888" }],
    retired_basis: {
      posting_date: "2026-03-05", memo: "Office rent", currency: "MYR",
      lines: [
        { account_code: "6000", debit_cents: priorCents, credit_cents: 0, description: "rent" },
        { account_code: "1010", debit_cents: 0, credit_cents: priorCents, description: "bank" },
      ],
    },
  };
}

/** The leader's connection, faked at the one call the belt makes on it. */
function fakeClient({ present = true, backlog = [], probeThrows = false, backlogThrows = false }) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      if (/to_regprocedure/.test(sql)) {
        if (probeThrows) throw new Error("connection lost mid-probe");
        return { rows: [{ ok: present }] };
      }
      if (/source_correction_rederivations/.test(sql)) {
        if (backlogThrows) throw new Error("the worklist itself failed");
        return { rows: [{ result: backlog }] };
      }
      throw new Error(`unexpected leader query: ${sql}`);
    },
  };
}

/** The per-item runtime transaction, faked at the two doors the belt calls inside it. */
function fakeRuntime({ admitThrows = null, settleThrows = null } = {}) {
  const admitted = []; const settled = [];
  const withRuntime = async (fn) => fn({
    async query(sql, params) {
      if (/admit_journal_work/.test(sql)) {
        if (admitThrows) throw Object.assign(new Error(admitThrows), { code: "CLR10" });
        admitted.push(params);
        return { rows: [{ r: { work_id: `work-for-${params[2]}`, task_id: "t", replayed: false } }] };
      }
      if (/settle_source_corrected_rederivation/.test(sql)) {
        if (settleThrows) throw Object.assign(new Error(settleThrows), { code: "CLR10" });
        settled.push(params);
        return { rows: [{ r: { claimed: params[1] !== null, replayed: false } }] };
      }
      throw new Error(`unexpected runtime query: ${sql}`);
    },
  });
  return { withRuntime, admitted, settled };
}

test("1030.belt: an image that predates 0321 boots DORMANT and costs one catalog read", async () => {
  const client = fakeClient({ present: false });
  const out = await reconcileWorkSourceCorrections(client, { withRuntime: async () => {} });
  assert.deepEqual(out, {
    sourceCorrectionOk: true, sourceCorrectionDormant: true,
    sourceCorrectionAdmitted: 0, sourceCorrectionDeclined: 0,
  });
  assert.equal(client.calls.length, 1, "…and it does not reach for the backlog it cannot read");
});

test("1030.belt: a probe that THROWS is not dormant — 'absent' and 'unreadable' must not say the same thing", async () => {
  const out = await reconcileWorkSourceCorrections(fakeClient({ probeThrows: true }), {});
  assert.equal(out.sourceCorrectionOk, false, "the belt reports its own failure");
  assert.equal(out.sourceCorrectionDormant, false,
    "…and NOT that the surface is absent, on the strength of a read that never landed");
});

test("1030.belt: a re-derivable correction is admitted under the correction's OWN op key and then settled as a claim", async () => {
  const rt = fakeRuntime();
  const out = await reconcileWorkSourceCorrections(
    fakeClient({ backlog: [brief(KEY_A)] }), { withRuntime: rt.withRuntime });

  assert.equal(out.sourceCorrectionAdmitted, 1);
  assert.equal(out.sourceCorrectionDeclined, 0);

  assert.equal(rt.admitted.length, 1, "exactly one admission");
  const [clientId, author, intentKey, basisJson, origin, refsJson, model] = rt.admitted[0];
  assert.equal(clientId, CLIENT, "the retired Work's client");
  assert.equal(author, ACTOR, "…admitted for the person who made the correction, not for the lane");
  assert.equal(intentKey, KEY_A,
    "…under the correction's own op key, which is what makes the admission idempotent AND the "
    + "link provable");
  assert.equal(origin, "clara_interpreted",
    "…as a DERIVED basis, because that is what it is");
  assert.deepEqual(JSON.parse(refsJson),
    [{ kind: "document", document_id: "88888888-8888-4888-8888-888888888888" }],
    "…carrying the retired instruction's evidence unchanged");
  assert.equal(model, REDERIVE_MODEL_ID, "…naming what served it");
  // THE FIGURE, as a literal from the corrected document.
  const b = JSON.parse(basisJson);
  assert.deepEqual(b.lines.map((l) => [l.debit_cents, l.credit_cents]), [[99900, 0], [0, 99900]],
    "the admitted basis carries the CORRECTED reading and no line of the retired one");

  assert.deepEqual(rt.settled[0], [KEY_A, `work-for-${KEY_A}`, null],
    "…and the settlement claims the link for exactly that successor");
});

test("1030.belt: a correction nothing can be derived from is SETTLED as a decline, with the reason a person reads", async () => {
  const rt = fakeRuntime();
  const out = await reconcileWorkSourceCorrections(
    fakeClient({ backlog: [brief(KEY_A, { fieldPath: "invoice.vendor_name", monetary: false })] }),
    { withRuntime: rt.withRuntime });

  assert.equal(out.sourceCorrectionAdmitted, 0);
  assert.equal(out.sourceCorrectionDeclined, 1);
  assert.equal(rt.admitted.length, 0, "nothing is admitted");
  assert.equal(rt.settled.length, 1, "…and the correction is settled anyway");
  assert.equal(rt.settled[0][1], null, "…with no successor");
  assert.equal(rt.settled[0][2], "correction_not_monetary",
    "…and the decline reason, so the lane does not re-decide it every cycle");
});

test("1030.belt: one poisoned correction costs that correction and nothing else", async () => {
  // The admission raises for EVERY item in this fake, so the cell measures containment rather
  // than ordering: both items are attempted, both are counted failed, and the belt still says it
  // ran (`Ok: true`) — the assembly-level report is for a belt that could not contain itself.
  const rt = fakeRuntime({ admitThrows: "client is not active -- no new accounting work" });
  const logged = [];
  const out = await reconcileWorkSourceCorrections(
    fakeClient({ backlog: [brief(KEY_A), brief(KEY_B)] }),
    { withRuntime: rt.withRuntime, log: (m) => logged.push(m) });

  assert.equal(out.sourceCorrectionOk, true, "the belt itself did not fail");
  assert.equal(out.sourceCorrectionAdmitted, 0);
  assert.equal(out.sourceCorrectionFailed, 2, "both items are counted, by name");
  assert.equal(logged.length, 2, "…and each is logged, every cycle, never de-duplicated");
  assert.ok(logged[0].includes(KEY_A), "…naming the correction a reader can chase");
});

test("1030.belt: a worklist read that fails reports the belt failed, and admits nothing", async () => {
  const rt = fakeRuntime();
  const out = await reconcileWorkSourceCorrections(
    fakeClient({ backlogThrows: true }), { withRuntime: rt.withRuntime });
  assert.equal(out.sourceCorrectionOk, false);
  assert.equal(rt.admitted.length, 0);
  assert.equal(rt.settled.length, 0);
});

test("1030.belt: a settlement that fails after a successful admission leaves the admission standing, to be replayed", async () => {
  // This is the crash window the exactly-once settlement exists for. The belt must NOT try to
  // undo the admission: the successor is a real Work parked on a real question, and the next
  // sweep re-reads the same correction, re-admits it as a REPLAY and settles it.
  const rt = fakeRuntime({ settleThrows: "deadlock detected" });
  const out = await reconcileWorkSourceCorrections(
    fakeClient({ backlog: [brief(KEY_A)] }), { withRuntime: rt.withRuntime });
  assert.equal(out.sourceCorrectionOk, true);
  assert.equal(out.sourceCorrectionAdmitted, 0, "an unsettled admission is not counted as done");
  assert.equal(out.sourceCorrectionFailed, 1);
  assert.equal(rt.admitted.length, 1, "…and the admission itself is left exactly where it landed");
});
