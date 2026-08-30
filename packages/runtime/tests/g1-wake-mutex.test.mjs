// 裁-44 R5 / FOLD-23 — THE TOOL MUTEX IS A BOUNDARY, and these are the two cells that hold it there.
//
// The defect the fifth review round found: FOLD-20(b)'s promise-chain mutex was applied AT EVERY
// CALL SITE, and on closePrep_v1 two of the twelve sites did not apply it. `begin_close` and
// `propose_close` called `write()` directly, so two write executors could overlap each other and
// the queued reads — both passing `guardWrite`, both minting a live task-bound credential, both
// mutating one record (`reads`, `acts`, `closeRunId`) inside the other's window. The bank lane's
// four sites were all correct and were one new verb away from the same defect.
//
// TWO CELLS, because the ruling has two halves:
//   G1B-E10-boundary       — the STRUCTURE, pinned BY IDENTITY on both lanes (review law 3: a
//                            source grep for "serial" reads a spelling; this reads the thing).
//   G1B-E10-close-parallel — the BEHAVIOUR, driven through the real wrappers on a rig: three real
//                            tools launched as genuine concurrent siblings behind a latch, and a
//                            cancel landing between the first gate and the queued sibling's.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID as uuid } from "node:crypto";
import * as rig from "./rig.mjs";
import { skip0138, plantQueuedClosePrepTask } from "./g1-wake-bodies.fixtures.mjs";

const { register } = await import("tsx/esm/api");
register();

const bankTools = await import("../workflows/bankAgent.v1.tools.ts");
const closeTools = await import("../workflows/closePrep.v1.tools.ts");
const closeReads = await import("../workflows/closePrep.v1.reads.ts");

test("G1B-E10-boundary 裁-44 R5 / FOLD-23 — every tool's execute IS the serialised wrapper, on BOTH lanes", async () => {
  // ENUMERATED FROM THE BUILT MAP, never from a list of names typed here: a thirteenth verb added
  // to either closure joins this gate by existing, which is the whole point of moving the mutex to
  // the boundary. A cell that named the tools one at a time would have the same defect the code had.
  const bank = bankTools.buildBankAgentTools(
    { taskId: uuid(), firmId: uuid(), clientId: uuid(), bankAccountId: uuid(), dueReason: null },
    "gpt-5.6-terra",
    bankTools.newBankRunRecord("cell"),
  );
  const close = closeTools.buildClosePrepTools({ taskId: uuid(), firmId: uuid(), clientId: uuid() }, "gpt-5.6-terra", closeTools.newCloseRunRecord());

  const bankNames = Object.keys(bank);
  assert.equal(bankNames.length, 4, `the bank lane exposes four verbs — got ${bankNames.join(", ")}`);
  for (const n of bankNames) {
    assert.equal(bankTools.isSerialisedExecute(bank[n].execute), true, `bank tool ${n}: its execute must BE the wrapped function`);
  }

  const closeNames = Object.keys(close);
  assert.equal(closeNames.length, 12, `the close lane exposes twelve verbs — got ${closeNames.length}: ${closeNames.join(", ")}`);
  for (const n of closeNames) {
    assert.equal(closeReads.isSerialisedCloseExecute(close[n].execute), true, `close tool ${n}: its execute must BE the wrapped function`);
  }
  // The two write verbs the review found bypassing the mutex, named explicitly as well — so the
  // regression has a tombstone even if the enumeration above is ever weakened.
  for (const n of ["begin_close", "propose_close"]) {
    assert.ok(closeNames.includes(n), `${n} must be in the built map`);
    assert.equal(closeReads.isSerialisedCloseExecute(close[n].execute), true, `${n} is the FOLD-23 defect itself — it must be serialised`);
  }

  // THE POSITIVE CONTROLS ON THE INSTRUMENT, without which the predicate could be `() => true`.
  const impostor = async () => ({ note: "this body mentions serial(() => write(...)) and is not it" });
  assert.equal(bankTools.isSerialisedExecute(impostor), false, "a hand-written execute that MENTIONS the mutex is not the mutex");
  assert.equal(closeReads.isSerialisedCloseExecute(impostor), false);
  assert.equal(bankTools.isSerialisedExecute(undefined), false);
  // AND THE TWO REGISTRIES ARE SEPARATE, which is what proves each predicate reads its OWN closure's
  // wrapper rather than "any wrapped function anywhere in the process".
  assert.equal(closeReads.isSerialisedCloseExecute(bank.get_bank_pack.execute), false, "the bank lane's wrapper is not in the close lane's registry");
  assert.equal(bankTools.isSerialisedExecute(close.list_fiscal_years.execute), false, "and the close lane's is not in the bank lane's");

  // THE BOUNDARY REFUSES WHAT IT CANNOT WRAP rather than passing it through unguarded — absence is
  // not evidence, so a tool with no execute is a build failure, not a silent exemption.
  assert.throws(() => bankTools.serialiseTools({ mystery: { description: "no execute" } }, (b) => b()), /no execute to serialise/);
  assert.throws(() => closeReads.serialiseCloseTools({ mystery: {} }, (b) => b()), /no execute to serialise/);

  // The queue itself still behaves: a REJECTED body must not break the chain for the next one.
  const serial = bankTools.newToolSerialiser();
  const log = [];
  const bad = serial(async () => {
    log.push("a");
    throw new Error("boom");
  });
  const good = serial(async () => {
    log.push("b");
    return "ok";
  });
  await assert.rejects(bad, /boom/);
  assert.equal(await good, "ok", "a rejection must not strand the queue behind it");
  assert.deepEqual(log, ["a", "b"], "and order survives the rejection");
});

test("G1B-E10-close-parallel 裁-44 R5 / FOLD-23 — real concurrent siblings run one at a time, and a cancel stops the queued one", { skip: skip0138 }, async () => {
  const w = await rig.buildFirm("g1be10");
  const taskId = await plantQueuedClosePrepTask({ firm: w.firm, client: w.client });
  await rig.rootQuery("update clara.agent_tasks set status='running' where id=$1", [taskId]);

  // ONE SHARED BRACKET AROUND EVERY POOL CALL THIS CLOSURE MAKES. `enter:<verb>`/`exit:<verb>` is
  // both the interleave proof and the order proof: serialised, the log is strict pairs in launch
  // order; unserialised, two `enter:` lines appear before the first `exit:`.
  const log = [];
  let inFlight = 0;
  let maxInFlight = 0;
  let mints = 0;
  let statusReads = 0;
  let onStatusRead = null;
  let releaseLatch;
  let latch = new Promise((r) => {
    releaseLatch = r;
  });

  const enter = (label) => {
    log.push(`enter:${label}`);
    inFlight += 1;
    if (inFlight > maxInFlight) maxInFlight = inFlight;
  };
  const exit = (label) => {
    inFlight -= 1;
    log.push(`exit:${label}`);
  };

  const previous = globalThis.__claraPools;
  globalThis.__claraPools = {
    // The write gate's own status read (readCloseTaskStatus). It is inside the tool body, so it is
    // inside the bracket too — and it is where the cancel half plants its flip.
    withRuntime: async (fn) => {
      await latch;
      enter("gate");
      try {
        return await rig.asRuntime((c) => fn(c));
      } finally {
        exit("gate");
        statusReads += 1;
        if (onStatusRead) await onStatusRead(statusReads);
      }
    },
    mintWakeCredentialForTask: async (kind, firmId, clientId, agentTaskId, ttl) => {
      mints += 1;
      return rig.asRuntime(async (c) => {
        const r = await c.query("select credential_id, secret from clara.mint_wake_credential_for_task($1,$2,$3,$4,$5::interval)", [
          kind, firmId, clientId, agentTaskId, ttl,
        ]);
        return { secret: String(r.rows[0].secret) };
      });
    },
    withWriteWakeScoped: async (secret, fn) => {
      await latch;
      return rig.withActor({ role: "clara_wake_interactive" }, async (c) => {
        await c.query("begin");
        await c.query("select set_config('clara.wake_secret', $1, true)", [secret]);
        let label = "unknown";
        const probe = {
          query: (sql, vals) => {
            const m = /clara\.(wake_[a-z_]+)/.exec(String(sql));
            if (m && label === "unknown") {
              label = m[1];
              enter(label);
            }
            return c.query(sql, vals);
          },
        };
        try {
          const out = await fn(probe);
          await c.query("commit");
          return out;
        } catch (e) {
          await c.query("rollback").catch(() => {});
          throw e;
        } finally {
          if (label !== "unknown") exit(label);
        }
      });
    },
  };

  try {
    // ---- PART ONE: three REAL tools as genuine concurrent siblings -----------------------------
    const rec = closeTools.newCloseRunRecord();
    const built = closeTools.buildClosePrepTools({ taskId, firmId: w.firm, clientId: w.client }, rig.DEFAULT_MODEL, rec);

    // Issued together, then the latch is released — so every body that COULD start has started
    // before any of them is allowed to touch the database. Without the latch a fast first call can
    // finish before the second is issued, and the cell would pass against no mutex at all.
    const pRead = built.list_fiscal_years.execute({ rationale: "the nightly close-prep pass begins by listing the years" });
    const pBegin = built.begin_close.execute({ fiscal_year_id: uuid(), rationale: "the first write, launched as a sibling" });
    const pPropose = built.propose_close.execute({
      close_run_id: uuid(),
      drafted: [{ check_key: "g1b_e10", item_key: "__gate__", text: "an attestation this run will never get to make" }],
      narrative: "the second write, launched as a sibling",
      rationale: "the second write, launched as a sibling",
    });
    releaseLatch();
    const [readOut, beginOut, proposeOut] = await Promise.all([pRead, pBegin, pPropose]);

    // THE ASSERTION THE WHOLE RULING IS ABOUT.
    assert.equal(maxInFlight, 1, `at most ONE tool body may be in flight — got ${maxInFlight}; log: ${log.join(" ")}`);
    // Strict enter/exit pairing, which is the same fact stated so a failure prints WHERE it broke.
    for (let i = 0; i < log.length; i += 2) {
      assert.equal(log[i].startsWith("enter:"), true, `log position ${i} must open a body — ${log.join(" ")}`);
      assert.equal(log[i + 1], `exit:${log[i].slice("enter:".length)}`, `body ${log[i]} must close before the next opens — ${log.join(" ")}`);
    }
    // DETERMINISTIC ORDER: the verbs reach the database in the order the model called them.
    const verbs = log.filter((e) => e.startsWith("enter:wake_")).map((e) => e.slice("enter:".length));
    assert.deepEqual(
      verbs,
      ["wake_list_fiscal_years", "wake_begin_close", "wake_propose_close"],
      `the three verbs must reach the DB in launch order — got ${verbs.join(", ")}`,
    );

    // The read is a real admitted read; the two writes are real calls the DATABASE refused (their
    // subjects do not exist), which is what makes them REAL rather than staged: each one minted a
    // credential, opened a wake session and was judged.
    assert.equal(readOut?.status, "acted", `the read must be admitted — got ${JSON.stringify(readOut)?.slice(0, 300)}`);
    assert.equal(rec.reads, 1);
    assert.ok(beginOut?.error, "an unknown fiscal year is refused, by the database");
    assert.ok(proposeOut?.error, "and so is an unknown close run");
    assert.equal(rec.writeAttempts, 2, "both writes were ATTEMPTED — the gate ran twice");
    assert.equal(mints, 3, "and all three tools minted their own task-bound credential");

    // ---- PART TWO: a cancel landing between the first gate and the queued sibling's -------------
    const before = await rig.rootQuery("select count(*)::int as n from clara.agent_act_receipts where client_id=$1", [w.client]);
    const rec2 = closeTools.newCloseRunRecord();
    const built2 = closeTools.buildClosePrepTools({ taskId, firmId: w.firm, clientId: w.client }, rig.DEFAULT_MODEL, rec2);
    const mintsBefore = mints;
    statusReads = 0;
    latch = Promise.resolve();
    // THE FLIP LANDS AFTER THE FIRST WRITE'S GATE HAS ALREADY READ 'running'. The first write
    // therefore proceeds; the second is still QUEUED behind the mutex, and its own gate — which
    // only runs because the mutex made it run later — re-reads and finds the cancel.
    onStatusRead = async (n) => {
      if (n === 1) await rig.rootQuery("update clara.agent_tasks set status='cancel_requested' where id=$1", [taskId]);
    };
    const qBegin = built2.begin_close.execute({ fiscal_year_id: uuid(), rationale: "the write that got through the gate first" });
    const qPropose = built2.propose_close.execute({
      close_run_id: uuid(),
      drafted: [{ check_key: "g1b_e10", item_key: "__gate__", text: "the queued sibling's attestation" }],
      narrative: "the queued sibling",
      rationale: "the queued sibling",
    });
    const [, queued] = await Promise.all([qBegin, qPropose]);
    onStatusRead = null;

    assert.match(
      String(queued?.error),
      /no longer running \(cancel_requested\)/,
      `the queued sibling must refuse LOCALLY on the re-read — got ${JSON.stringify(queued)?.slice(0, 300)}`,
    );
    assert.equal(rec2.cancelledAs, "cancel_requested", "and the record remembers what it SAW, not what it inferred");
    assert.equal(mints - mintsBefore, 1, "exactly ONE credential was minted — the first write's; the queued sibling minted none");
    const after = await rig.rootQuery("select count(*)::int as n from clara.agent_act_receipts where client_id=$1", [w.client]);
    assert.equal(after.rows[0].n, before.rows[0].n, "and no receipt was written on either side of the cancel");

    // THE SETTLE FOLLOWS THE CANCEL, not the refusals.
    const closeImpl = await import("../workflows/closePrep.v1.impl.ts");
    const outcome = closeImpl.classifyCloseOutcome(rec2, "");
    assert.equal(outcome.kind, "cancelled");
    assert.equal(outcome.observed, "cancel_requested");
  } finally {
    globalThis.__claraPools = previous;
  }
});
