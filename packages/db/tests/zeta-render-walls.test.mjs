// Wave E lane ZETA — the fix round's DB walls (codex B1 / M1 / M2 / B5).
//
// A second test file rather than more cells in zeta-render-queue.test.mjs: that battery reached
// the repo's 500-line discipline, and these four cells are a coherent group of their own — every
// one of them exists because an independent review found the wall missing or leaky, so they are
// worth reading together.
//
// PRESENCE GATE: CLARA_ALLOW_MISSING_WAVE_E_ZETA, the delta/epsilon shape verbatim. Final
// acceptance is a FOCUSED run with the variable UNSET, accounting for zero skips.

import assert from "node:assert/strict";
import { after, test } from "node:test";

import { endPool, rootQuery } from "./epsilon-fixtures.mjs";
import { artifactRows } from "./epsilon-world.mjs";
import { asOwner, asRuntime, parkQueue, sealedRun, skipUnlessZeta } from "./zeta-fixtures.mjs";

after(async () => { await endPool(); });

test("zeta: the fix round's four DB walls (codex B1/M1/M2/B5)", async (t) => {
  if (await skipUnlessZeta(t)) return;
  const { eps } = await sealedRun("walls");
  await parkQueue();
  const job = (await asOwner("select clara.enqueue_render_job($1, 'pre_sign') r", [eps.runId])).rows[0].r;
  const id = job.render_job_id;

  // B1 — a CRASH-ONLY job (workers dying before they can report) must stop being claimed at its
  // cap, and must then be PARKED as failed rather than left in limbo. Simulated by driving the
  // row to its cap in the expired-running shape a dead worker leaves behind.
  await asOwner(`update clara.render_jobs set state='running', claimed_by='dead', claimed_at=now(),
      lease_expires_at=now()-interval '1 minute', attempts=max_attempts where id=$1`, [id]);
  assert.equal((await asRuntime("select clara.claim_render_job('after-cap') j")).rows[0].j, null,
    "a job at its attempt cap must not be claimable — otherwise every cycle starts another paid machine");
  const swept = (await asRuntime("select clara.render_dispatch_begin(interval '0 seconds', 5) r")).rows[0].r;
  assert.ok(Number(swept.reaped) >= 1, "the leader sweep must reap it");
  const reaped = (await rootQuery("select state, last_error from clara.render_jobs where id=$1", [id])).rows[0];
  assert.equal(reaped.state, "failed", "a crash-only job ends as a ROW SAYING WHY, not as silence");
  assert.match(JSON.stringify(reaped.last_error), /failed_at_cap_without_report/);

  // M2 — a terminal job is immutable WHOLE, not merely un-reopenable: rewriting its artifact
  // attribution or its evidence must refuse even though the state value never moves.
  await assert.rejects(
    asOwner("update clara.render_jobs set last_error='{}'::jsonb where id=$1", [id]),
    (e) => e.code === "CLR08" && /render_job_terminal/.test(e.detail ?? ""),
    "attribution that can be rewritten after the fact is not attribution",
  );

  // M1 — the failure path must require a LIVE lease, not just the right name: identity alone is
  // stale authority once the job has been taken away.
  const j2 = (await asOwner("select clara.enqueue_render_job($1, 'draft_watermarked') r", [eps.runId])).rows[0].r;
  await asRuntime("select clara.claim_render_job('slow-worker') j");
  await asOwner("update clara.render_jobs set lease_expires_at = now() - interval '1 second' where id=$1",
    [j2.render_job_id]);
  await assert.rejects(
    asRuntime("select clara.fail_render_job($1,'slow-worker',$2::jsonb)",
      [j2.render_job_id, JSON.stringify({ reason: "stale" })]),
    (e) => e.code === "CLR43" && /render_lease_not_held/.test(e.detail ?? ""),
  );

  // B5 — the seven-year drill has an EXECUTABLE door, and it touches the ledger not at all.
  const arts = await artifactRows(eps.runId);
  if (arts.length > 0) {
    const replay = (await rootQuery("select clara.replay_render_inputs($1) r", [arts[0].id])).rows[0].r;
    assert.equal(replay.expected_sha256, arts[0].sha256);
    assert.ok(replay.sealed_manifest, "the drill replays the artifact's OWN sealed manifest");
  }
});
