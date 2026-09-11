// The durable-Work runtime lane, under test.
//
// TWO CLASSES OF CELL, and the second is the one this module exists for:
//   1. THE PATH ARITHMETIC, asserted on the exact string sent. `lib/clara/
//      api.test.ts` pins the chat lane's for the same reason: `/api/runtime` +
//      `/api/work/journal` would arrive at the runtime as `/api/api/work/journal`
//      and 404 there, silently, with nothing else in the suite to catch it.
//   2. THE CLASSIFICATION TABLE. Every status the runtime can answer maps to
//      exactly one typed outcome, and `lost` is kept apart from `unavailable` —
//      one means "no answer was observed, the work may exist", the other means
//      "the server said it is not accepting". The composer behaves differently
//      on each, so a cell that folded them together would be testing the wrong
//      contract.

import assert from "node:assert/strict";
import { test } from "node:test";

import { cancelWork, probeWork, retryWork, submitJournalWork, takeOverWork, type JournalBasisWire } from "./api";
import type { SessionTokenAccessor } from "@/lib/session";

const auth: SessionTokenAccessor = { getAccessToken: async () => "tok" };
const noSession: SessionTokenAccessor = { getAccessToken: async () => null };

const BASIS: JournalBasisWire = {
  postingDate: "2026-09-01",
  memo: "Office rent",
  currency: "MYR",
  lines: [
    { accountCode: "6100", debitCents: 120_000, creditCents: 0 },
    { accountCode: "1100", debitCents: 0, creditCents: 120_000 },
  ],
};

type Seen = { url: string; init: RequestInit | undefined };

/** Swaps `fetch`, records what was sent, restores unconditionally. */
async function withFetch(
  impl: (url: string, init?: RequestInit) => Promise<Response> | Response,
  run: (seen: Seen[]) => Promise<void>,
): Promise<void> {
  const original = globalThis.fetch;
  const seen: Seen[] = [];
  globalThis.fetch = (async (u: unknown, init?: RequestInit) => {
    seen.push({ url: String(u), init });
    return impl(String(u), init);
  }) as typeof fetch;
  try {
    await run(seen);
  } finally {
    globalThis.fetch = original;
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const ACCEPTED = {
  work_id: "work-1",
  task_id: "task-1",
  logical_op_id: "work:work-1:journal_entry:1",
  status: "queued",
  replayed: false,
};

test("submit posts to the SAME-ORIGIN proxy path, with the runtime's own /api prefix REPLACED", async () => {
  await withFetch(
    () => json(ACCEPTED, 202),
    async (seen) => {
      await submitJournalWork(auth, { clientId: "c1", intentKey: "i1", basis: BASIS });
      assert.equal(seen[0]!.url, "/api/runtime/work/journal");
      assert.equal(seen[0]!.init?.method, "POST");
      assert.equal((seen[0]!.init?.headers as Record<string, string>).authorization, "Bearer tok");
      assert.deepEqual(JSON.parse(String(seen[0]!.init?.body)), {
        clientId: "c1",
        intentKey: "i1",
        basis: BASIS,
      });
      // `redirect: "manual"` is load-bearing: followed, the auth gate's 307 to
      // /login becomes a 200 text/html page this module would try to parse.
      assert.equal(seen[0]!.init?.redirect, "manual");
      assert.equal(seen[0]!.init?.cache, "no-store");
    },
  );
});

test("202 is ACCEPTED, and `replayed` is carried through rather than flattened", async () => {
  await withFetch(
    () => json({ ...ACCEPTED, replayed: true }, 202),
    async () => {
      const result = await submitJournalWork(auth, { clientId: "c1", intentKey: "i1", basis: BASIS });
      assert.deepEqual(result, {
        kind: "accepted",
        workId: "work-1",
        taskId: "task-1",
        logicalOpId: "work:work-1:journal_entry:1",
        status: "queued",
        replayed: true,
      });
    },
  );
});

test("400 carries the DB's own typed detail — field and reason, unre-worded", async () => {
  await withFetch(
    () => json({ error: "invalid_basis", field: "lines[1].debit_cents", reason: "invalid_basis" }, 400),
    async () => {
      assert.deepEqual(await submitJournalWork(auth, { clientId: "c1", intentKey: "i1", basis: BASIS }), {
        kind: "invalid_basis",
        field: "lines[1].debit_cents",
        reason: "invalid_basis",
      });
    },
  );
});

test("409 is a CONFLICT and carries the existing work id only when the body has one", async () => {
  await withFetch(
    () => json({ error: "intent_payload_conflict", work_id: "work-9" }, 409),
    async () => {
      assert.deepEqual(await submitJournalWork(auth, { clientId: "c1", intentKey: "i1", basis: BASIS }), {
        kind: "conflict",
        workId: "work-9",
      });
    },
  );
  await withFetch(
    () => json({ error: "intent_payload_conflict" }, 409),
    async () => {
      assert.deepEqual(await submitJournalWork(auth, { clientId: "c1", intentKey: "i1", basis: BASIS }), {
        kind: "conflict",
        workId: null,
      });
    },
  );
});

test("401 and 403 are DENIED; 404 is NOT FOUND; 503 and 500 are UNAVAILABLE", async () => {
  for (const status of [401, 403]) {
    await withFetch(
      () => json({ error: "forbidden" }, status),
      async () => {
        assert.equal((await submitJournalWork(auth, { clientId: "c1", intentKey: "i1", basis: BASIS })).kind, "denied");
      },
    );
  }
  await withFetch(
    () => json({ error: "not_found" }, 404),
    async () => {
      assert.equal((await submitJournalWork(auth, { clientId: "c1", intentKey: "i1", basis: BASIS })).kind, "not_found");
    },
  );
  await withFetch(
    () => json({ error: "shutting_down" }, 503),
    async () => {
      const result = await submitJournalWork(auth, { clientId: "c1", intentKey: "i1", basis: BASIS });
      assert.equal(result.kind, "unavailable");
      assert.equal(result.kind === "unavailable" ? result.message : null, "shutting_down");
    },
  );
  await withFetch(
    () => json({}, 500),
    async () => {
      assert.equal((await submitJournalWork(auth, { clientId: "c1", intentKey: "i1", basis: BASIS })).kind, "unavailable");
    },
  );
});

test("A NETWORK FAILURE IS `lost`, NOT `unavailable` — the work may already exist", async () => {
  await withFetch(
    () => { throw new Error("socket hang up"); },
    async () => {
      const result = await submitJournalWork(auth, { clientId: "c1", intentKey: "i1", basis: BASIS });
      assert.equal(result.kind, "lost");
      assert.equal(result.kind === "lost" ? result.message : null, "socket hang up");
    },
  );
});

test("a 202 that names no work is LOST too — an acknowledgement we cannot act on", async () => {
  // The safe direction: the caller re-sends the same intent key, and the
  // database answers with the row it already has rather than a second one.
  await withFetch(
    () => json({ status: "queued" }, 202),
    async () => {
      assert.equal((await submitJournalWork(auth, { clientId: "c1", intentKey: "i1", basis: BASIS })).kind, "lost");
    },
  );
});

test("an opaque redirect (the auth gate's 307) is DENIED — never lost, because nothing was sent onward", async () => {
  await withFetch(
    () => {
      // THE BROWSER'S SHAPE, NOT A RESPONSE YOU CAN BUILD — the same fixture
      // lib/clara/api.test.ts uses, and for the same reason: `status: 0` is
      // outside undici's legal constructor range and `type` has no setter, so
      // both are defined onto the instance.
      const res = new Response(null, { status: 204 });
      Object.defineProperty(res, "type", { value: "opaqueredirect" });
      Object.defineProperty(res, "status", { value: 0 });
      Object.defineProperty(res, "ok", { value: false });
      return res;
    },
    async () => {
      assert.equal((await submitJournalWork(auth, { clientId: "c1", intentKey: "i1", basis: BASIS })).kind, "denied");
    },
  );
});

test("no session means NO REQUEST IS EVER MADE", async () => {
  await withFetch(
    () => { throw new Error("must not be called"); },
    async (seen) => {
      assert.equal((await submitJournalWork(noSession, { clientId: "c1", intentKey: "i1", basis: BASIS })).kind, "denied");
      assert.equal((await retryWork(noSession, { workId: "w1", opKey: "o1" })).kind, "denied");
      assert.equal((await probeWork(noSession, "w1")).kind, "denied");
      assert.deepEqual(seen, []);
    },
  );
});

test("retry posts the op key to the work's own path, and 409 reports the CURRENT status", async () => {
  await withFetch(
    () => json(ACCEPTED, 202),
    async (seen) => {
      const result = await retryWork(auth, { workId: "work 1/x", opKey: "op-1" });
      assert.equal(seen[0]!.url, "/api/runtime/work/work%201%2Fx/retry", "the id is percent-encoded");
      assert.deepEqual(JSON.parse(String(seen[0]!.init?.body)), { opKey: "op-1" });
      assert.equal(result.kind, "accepted");
    },
  );
  await withFetch(
    () => json({ error: "not_retryable", status: "running" }, 409),
    async () => {
      assert.deepEqual(await retryWork(auth, { workId: "w1", opKey: "op-1" }), {
        kind: "not_retryable",
        status: "running",
      });
    },
  );
});

test("the probe reads the runtime's own view, and never reports a run id", async () => {
  await withFetch(
    () => json({ work: { id: "work-1", status: "running" }, task: { id: "task-1", status: "running", error_code: null, workflow_run_id: true } }, 200),
    async (seen) => {
      const result = await probeWork(auth, "work-1");
      assert.equal(seen[0]!.url, "/api/runtime/work/work-1");
      assert.deepEqual(result, {
        kind: "found",
        workId: "work-1",
        status: "running",
        taskStatus: "running",
        taskErrorCode: null,
      });
      // The runtime answers `workflow_run_id` as a BOOLEAN presence flag, never
      // the id. Nothing in the returned shape can carry one.
      assert.equal("runId" in result, false);
    },
  );
  await withFetch(
    () => json({ error: "not_found" }, 404),
    async () => {
      assert.equal((await probeWork(auth, "nope")).kind, "not_found");
    },
  );
});

// ===========================================================================
// #630 — CANCEL WORK, and TAKE RESPONSIBILITY.
//
// THE CLASSIFICATION TABLE IS THE POINT, again, and here it carries one extra
// burden: a 200 from the cancel door is FOUR different true things, and the one
// that must never be misread is `already_completed` — the operation won the
// race, an entry exists, and a surface that reported "cancelled" over it would
// be telling a person their books say something they do not.
// ===========================================================================

test("cancel posts to the proxy path with the caller's op key", async () => {
  await withFetch(
    () => json({ work_id: "w1", task_id: "t1", status: "stopping", cancelled: true, replayed: false }, 200),
    async (seen) => {
      await cancelWork(auth, { workId: "w 1", opKey: "k1" });
      assert.equal(seen[0]!.url, "/api/runtime/work/w%201/cancel", "the work id is encoded, and /api is REPLACED");
      assert.equal(JSON.parse(String(seen[0]!.init?.body)).opKey, "k1");
      assert.equal((seen[0]!.init?.headers as Record<string, string>).authorization, "Bearer tok");
    },
  );
});

test("cancel: stopping is NOT a terminal, and the answer says so", async () => {
  await withFetch(
    () => json({ work_id: "w1", task_id: "t1", status: "stopping", cancelled: true, cancelled_by: "u1", cancelled_at: "2026-09-11T00:00:00Z", replayed: false }, 200),
    async () => {
      const out = await cancelWork(auth, { workId: "w1", opKey: "k" });
      assert.equal(out.kind, "answered");
      if (out.kind !== "answered") return;
      assert.equal(out.status, "stopping");
      assert.equal(out.cancelled, true);
      assert.equal(out.reason, null, "an acting cancel carries no `already_*` reason");
      assert.equal(out.cancelledBy, "u1");
    },
  );
});

test("cancel: already_completed carries the effect that WON, so the surface can link to it", async () => {
  await withFetch(
    () => json({
      work_id: "w1", task_id: "t1", status: "completed", cancelled: false,
      reason: "already_completed", receipt_id: "r1", entry_id: "e1", replayed: false,
    }, 200),
    async () => {
      const out = await cancelWork(auth, { workId: "w1", opKey: "k" });
      assert.equal(out.kind, "answered");
      if (out.kind !== "answered") return;
      assert.equal(out.cancelled, false, "nothing was cancelled — the operation committed first");
      assert.equal(out.reason, "already_completed");
      assert.equal(out.entryId, "e1");
      assert.equal(out.receiptId, "r1");
      assert.equal(out.status, "completed");
    },
  );
});

test("cancel: already_terminal is not an error", async () => {
  await withFetch(
    () => json({ work_id: "w1", task_id: null, status: "refused", cancelled: false, reason: "already_terminal", replayed: false }, 200),
    async () => {
      const out = await cancelWork(auth, { workId: "w1", opKey: "k" });
      assert.equal(out.kind, "answered");
      if (out.kind !== "answered") return;
      assert.equal(out.reason, "already_terminal");
      assert.equal(out.status, "refused");
    },
  );
});

test("cancel: every refusal status maps to exactly one typed outcome", async () => {
  const cases: Array<[number, unknown, string]> = [
    [401, {}, "denied"],
    [403, {}, "denied"],
    [404, { error: "not_found" }, "not_found"],
    [409, { error: "work_cancelled", status: "stopping" }, "conflict"],
    [400, { error: "invalid_basis", reason: "invalid_op_key" }, "invalid"],
    [503, { error: "shutting_down" }, "unavailable"],
  ];
  for (const [status, body, kind] of cases) {
    await withFetch(
      () => json(body, status),
      async () => {
        const out = await cancelWork(auth, { workId: "w1", opKey: "k" });
        assert.equal(out.kind, kind, `HTTP ${status} classifies as ${kind}`);
      },
    );
  }
});

test("cancel: no session is denied before anything is sent; a transport failure is LOST, never unavailable", async () => {
  await withFetch(
    () => {
      throw new Error("should not be called");
    },
    async (seen) => {
      assert.equal((await cancelWork(noSession, { workId: "w1", opKey: "k" })).kind, "denied");
      assert.equal(seen.length, 0, "nothing was sent");
    },
  );
  await withFetch(
    () => Promise.reject(new Error("socket hang up")),
    async () => {
      const out = await cancelWork(auth, { workId: "w1", opKey: "k" });
      assert.equal(out.kind, "lost", "no answer was OBSERVED — the cancel may or may not have run");
    },
  );
});

test("take-over sends the digest slot on every call, and 202 names both humans", async () => {
  await withFetch(
    () => json({
      work_id: "w1", task_id: "t2", logical_op_id: "op", status: "queued", replayed: false,
      responsible: "u2", previous_responsible: "u1", initiated_by: "u1", taken_over: true,
    }, 202),
    async (seen) => {
      const out = await takeOverWork(auth, { workId: "w1", opKey: "k" });
      assert.equal(seen[0]!.url, "/api/runtime/work/w1/take-over");
      assert.deepEqual(JSON.parse(String(seen[0]!.init?.body)), { opKey: "k", basisDigest: null },
        "the slot is always present — the DATABASE decides whether a digest is required");
      assert.equal(out.kind, "accepted");
      if (out.kind !== "accepted") return;
      assert.equal(out.responsible, "u2");
      assert.equal(out.initiatedBy, "u1", "who ASKED is preserved");
      assert.equal(out.takenOver, true);
      assert.equal(out.taskId, "t2", "a NEW run of the SAME logical identity");
    },
  );
});

test("take-over: the basis gate is its OWN outcome, carrying the digest to confirm", async () => {
  await withFetch(
    () => json({ error: "basis_confirmation_required", basis_digest: "a".repeat(64), basis_origin: "clara_interpreted" }, 400),
    async () => {
      const out = await takeOverWork(auth, { workId: "w1", opKey: "k" });
      assert.equal(out.kind, "confirm_basis");
      if (out.kind !== "confirm_basis") return;
      assert.equal(out.basisDigest, "a".repeat(64), "the digest is what the resubmit must carry back");
      assert.equal(out.basisOrigin, "clara_interpreted");
    },
  );
  // …and a plain 400 is still an ordinary invalid, not a confirm step.
  await withFetch(
    () => json({ error: "invalid_basis", reason: "invalid_op_key" }, 400),
    async () => {
      assert.equal((await takeOverWork(auth, { workId: "w1", opKey: "k" })).kind, "invalid");
    },
  );
});

test("take-over: 409 is not_takeable with the status that made it so", async () => {
  await withFetch(
    () => json({ error: "not_takeable", status: "running" }, 409),
    async () => {
      const out = await takeOverWork(auth, { workId: "w1", opKey: "k" });
      assert.equal(out.kind, "not_takeable");
      if (out.kind !== "not_takeable") return;
      assert.equal(out.status, "running");
    },
  );
});

// ===========================================================================================
// #630 fix round 3 — THE TRANSIENT IS ITS OWN ANSWER, on both doors.
//
// `workRoutes.ts` answers `409 {error:'transient', reason:'serialization'}` for a 40P01/40001 the
// database broke, and its comment claims "the surface says 'that did not go through — try again'".
// Collapsing it into `conflict`/`not_takeable` made the surface say the opposite: that the database
// refused the request in the state it found, and that the Work's own row is the explanation — of a
// statement that never ran, against a row that did not move.
// ===========================================================================================

test("a 409 TRANSIENT is not a state conflict — on the cancel door", async () => {
  await withFetch(
    () => json({ error: "transient", reason: "serialization" }, 409),
    async () => {
      assert.deepEqual(await cancelWork(auth, { workId: "w1", opKey: "k" }), { kind: "transient" });
    },
  );
  // …and an ordinary 409 is still a conflict, carrying the row's own status.
  await withFetch(
    () => json({ error: "work_cancelled", status: "stopping" }, 409),
    async () => {
      const out = await cancelWork(auth, { workId: "w1", opKey: "k" });
      assert.equal(out.kind, "conflict");
      assert.equal(out.kind === "conflict" ? out.status : null, "stopping");
    },
  );
});

test("a 409 TRANSIENT is not `not_takeable` — on the take-over door", async () => {
  await withFetch(
    () => json({ error: "transient", reason: "serialization" }, 409),
    async () => {
      assert.deepEqual(await takeOverWork(auth, { workId: "w1", opKey: "k" }), { kind: "transient" });
    },
  );
});
