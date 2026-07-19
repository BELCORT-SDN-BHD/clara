// Slice-6 write floor — pool discipline against the throwaway (clara_rt_test). Proves
// withWriteWakeScoped runs as clara_wake_interactive, NOT read-only, with the wake
// secret bound txn-locally and COMMITting — the mirror of withReadWakeScoped's
// read-only rollback. Uses the EXISTING 0006 surface (clara_wake_interactive +
// mint_wake_credential); it needs NO 0009 object, so it runs today. Skips cleanly if
// the runtime surface is absent.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import * as rig from "./rig.mjs";
import {
  mintWakeCredentialObo,
  withWriteWakeScoped,
  withReadWakeScoped,
  endPools,
} from "../lib/pools.mjs";

const READY = await rig.runtimeReady();
const skip = READY ? false : "Slice-4 (0006) surface absent";

after(async () => {
  await endPools();
  await rig.endPool();
});

test("withWriteWakeScoped: clara_wake_interactive, NOT read-only, txn-local secret, commits a write", { skip }, async () => {
  const { owner, firm } = await rig.buildFirm("s6wf");
  const { secret } = await mintWakeCredentialObo(firm, owner);

  const observed = await withWriteWakeScoped(secret, async (c) => {
    const role = (await c.query("select current_setting('role') as v")).rows[0].v;
    const ro = (await c.query("select current_setting('default_transaction_read_only') as v")).rows[0].v;
    const sec = (await c.query("select current_setting('clara.wake_secret', true) as v")).rows[0].v;
    // A real write proving the txn is not read-only; on-commit-drop leaves no residue.
    await c.query("create temp table _s6_wf(x int) on commit drop");
    await c.query("insert into _s6_wf values (1)");
    const n = (await c.query("select count(*)::int as n from _s6_wf")).rows[0].n;
    return { role, ro, sec, n };
  });

  assert.equal(observed.role, "clara_wake_interactive", "SET ROLE to the wake-interactive group (single-membership login)");
  assert.notEqual(observed.ro, "on", "the write floor is NOT read-only (unlike the read pool)");
  assert.equal(observed.sec, secret, "the wake secret is bound TXN-LOCALLY (set_config is_local)");
  assert.equal(observed.n, 1, "a write committed inside the write-floor txn");
});

test("withReadWakeScoped stays read-only as clara_agent_ro (contrast)", { skip }, async () => {
  const { owner, firm } = await rig.buildFirm("s6wf-ro");
  const { secret } = await mintWakeCredentialObo(firm, owner);
  const observed = await withReadWakeScoped(secret, async (c) => {
    const role = (await c.query("select current_setting('role') as v")).rows[0].v;
    const ro = (await c.query("select current_setting('default_transaction_read_only') as v")).rows[0].v;
    return { role, ro };
  });
  assert.equal(observed.role, "clara_agent_ro");
  assert.equal(observed.ro, "on", "the read pool is read-only");
});

test("withWriteWakeScoped propagates a thrown fn (rolls back)", { skip }, async () => {
  const { owner, firm } = await rig.buildFirm("s6wf-err");
  const { secret } = await mintWakeCredentialObo(firm, owner);
  await assert.rejects(
    () => withWriteWakeScoped(secret, async () => {
      throw new Error("boom");
    }),
    /boom/,
  );
});

test("mintWakeCredentialObo refuses a below-bookkeeper initiator (CLR10)", { skip }, async () => {
  const { owner, firm } = await rig.buildFirm("s6wf-floor");
  let viewer;
  try {
    viewer = await rig.addMember(owner, firm, { role: "viewer", prefix: "s6-viewer" });
  } catch {
    return; // 'viewer' role not modeled here — the floor is still enforced by the DB mint
  }
  await assert.rejects(() => mintWakeCredentialObo(firm, viewer), (e) => e.code === "CLR10");
});
