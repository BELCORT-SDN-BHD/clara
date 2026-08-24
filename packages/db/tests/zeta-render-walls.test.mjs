// Wave E lane ZETA — the DB walls found by independent review (codex B1/M1/M2/B5, round-2 blockers
// and the requeue door).
//
// A second test file rather than more cells in zeta-render-queue.test.mjs: that battery reached
// the repo's 500-line discipline, and these cells are a coherent group of their own — every one of
// them exists because a review found a wall missing or leaky, so they are worth reading together.
//
// PRESENCE GATE: CLARA_ALLOW_MISSING_WAVE_E_ZETA, the delta/epsilon shape verbatim. Final
// acceptance is a FOCUSED run with the variable UNSET, accounting for zero skips.

import assert from "node:assert/strict";
import { after, test } from "node:test";

import { endPool, humanQuery, rootQuery } from "./epsilon-fixtures.mjs";
import { artifactRows } from "./epsilon-world.mjs";
import { asOwner, asRuntime, driftWording, sealArtifact, sealedRun, sealedStatutoryRun, skipUnlessZeta } from "./zeta-fixtures.mjs";

after(async () => { await endPool(); });

test("zeta: the fix round's four DB walls (codex B1/M1/M2/B5)", async (t) => {
  if (await skipUnlessZeta(t)) return;
  const { world, eps } = await sealedRun("walls");
  // ISOLATION IS sealedRun's NOW: since F-A5 PR-1 the SEAL enqueues this run's pre_sign job, so a
  // park HERE would swallow the very job this case needs (zeta-fixtures.mjs, sealedRun).
  const job = (await asOwner("select clara.enqueue_render_job($1, 'pre_sign') r", [eps.runId])).rows[0].r;
  const id = job.render_job_id;

  // B1 — a CRASH-ONLY job (workers dying before they can report) must stop being claimed at its
  // cap, and must then be PARKED as failed rather than left in limbo. Simulated by driving the
  // row to its cap in the expired-running shape a dead worker leaves behind.
  await asOwner(`update clara.render_jobs set state='running', claimed_by='dead', claimed_at=now(),
      lease_expires_at=now()-interval '1 minute', attempts=max_attempts where id=$1`, [id]);
  assert.equal((await asRuntime("select clara.claim_render_job('after-cap') j")).rows[0].j, null,
    "a job at its attempt cap must not be claimable — otherwise every cycle starts another paid machine");
  const swept = (await asRuntime("select clara.reap_exhausted_render_jobs() r")).rows[0].r;
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

  // B5 — the seven-year drill has an EXECUTABLE door, and it touches the ledger not at all. The
  // fixture SEALS AN ARTIFACT rather than hoping one exists: this assertion used to sit inside
  // `if (arts.length > 0)`, and because sealedRun() seals a dataset and never an artifact, the
  // condition was always false — the cell passed for years' worth of runs without executing a
  // single line of the thing it claimed to cover.
  // Its own run, because this cell has already driven THIS run's pre_sign job to a terminal
  // failure — and enqueue now refuses to resurrect that request, which is the point of the
  // requeue door and is asserted in its own cell below.
  const { eps: b5 } = await sealedRun("walls-b5");
  const sealed = await sealArtifact(b5, "walls-sealer");
  const arts = await artifactRows(b5.runId);
  assert.equal(arts.length, 1, "the fixture must have sealed exactly one artifact to replay");
  const before = (await rootQuery("select count(*)::int n from clara.render_jobs")).rows[0].n;
  const replay = (await humanQuery(world.users.alice,
    "select clara.replay_render_inputs($1) r", [sealed.artifactId])).rows[0].r;
  assert.equal(replay.expected_sha256, sealed.sha256);
  assert.ok(replay.sealed_manifest, "the drill replays the artifact's OWN sealed manifest");
  assert.equal(replay.replay_of_artifact_id, sealed.artifactId);
  assert.equal((await rootQuery("select count(*)::int n from clara.render_jobs")).rows[0].n, before,
    "a replay enqueues nothing — the drill must never be mistakable for a production render");
});

test("zeta: the replay door is FIRM-SCOPED — another firm's caller reads exactly like an absent id", async (t) => {
  if (await skipUnlessZeta(t)) return;
  const { world, eps } = await sealedRun("scope");
  const sealed = await sealArtifact(eps, "scope-sealer");

  // POSITIVE FIRST: the owning firm's caller gets the artifact. Without this arm the refusals below
  // would also pass against a door that refuses everyone, which proves nothing about scoping.
  const mine = (await humanQuery(world.users.alice,
    "select clara.replay_render_inputs($1) r", [sealed.artifactId])).rows[0].r;
  assert.equal(mine.replay_of_artifact_id, sealed.artifactId);

  // A FOREIGN caller and an ABSENT id must be indistinguishable. The defect this closes was a
  // definer body with NO firm check: the owner policy on report_artifacts is `using (true)`, so the
  // door returned another firm's sealed manifest, digests and storage_key — which carries that
  // firm's uuid and the exact object path of their financial statements. An absent id raised while
  // a foreign one returned, so it was a positive cross-tenant existence oracle as well.
  const absent = "00000000-0000-4000-8000-00000000dead";
  const seen = [];
  for (const [sub, id] of [[world.users.dave, sealed.artifactId], [world.users.alice, absent]]) {
    await assert.rejects(
      humanQuery(sub, "select clara.replay_render_inputs($1) r", [id]),
      (e) => { seen.push(`${e.code}|${e.message}|${e.detail}`); return e.code === "CLR11"; },
    );
  }
  assert.equal(seen[0], seen[1],
    "a foreign artifact and an absent id must produce the IDENTICAL refusal, or the door tells a caller which ids exist");
});

test("zeta: the FENCE protects a slow worker — the reap is immediate, and the two are not the same wall", async (t) => {
  if (await skipUnlessZeta(t)) return;
  const { eps } = await sealedRun("slow-worker");
  // ISOLATION IS sealedRun's NOW: since F-A5 PR-1 the SEAL enqueues this run's pre_sign job, so a
  // park HERE would swallow the very job this case needs (zeta-fixtures.mjs, sealedRun).
  const job = (await asOwner("select clara.enqueue_render_job($1, 'pre_sign') r", [eps.runId])).rows[0].r;
  const id = job.render_job_id;

  // WHILE THE LEASE IS LIVE the fence says so — the positive arm, without which every assertion
  // below would also pass against a fence that always answered false.
  await asOwner(`update clara.render_jobs
      set state='running', claimed_by='slow', claimed_at=now(),
          lease_expires_at=now()+interval '5 minutes', attempts=max_attempts where id=$1`, [id]);
  assert.equal((await asRuntime("select clara.render_lease_alive($1, 'slow') a", [id])).rows[0].a, true);

  // A HEALTHY WORKER THAT RAN LONG: at its cap, lease expired a second ago, still rendering. THE
  // FENCE IS WHAT PROTECTS IT, and it protects it by telling it to STOP — its completion would be
  // refused for a dead lease anyway, so every further page is money spent on bytes nothing will
  // accept. A round-3 draft instead delayed the REAP by half a lease, trying to keep the row alive
  // for it; the panel showed that buys nothing (an at-cap row can never be re-claimed and a
  // post-expiry completion is refused regardless) while costing paid machines dispatched for
  // unclaimable jobs and a late terminal signal. So the reap is immediate again, and this cell
  // asserts the two walls do different jobs rather than the same one twice.
  await asOwner(`update clara.render_jobs
      set claimed_at=now()-interval '10 minutes', lease_expires_at=now()-interval '1 second'
    where id=$1`, [id]);
  assert.equal((await asRuntime("select clara.render_lease_alive($1, 'slow') a", [id])).rows[0].a, false,
    "the fence is strict liveness: past expiry the worker abandons rather than finishing work nothing will accept");

  // AND THE REAP TAKES IT IMMEDIATELY — no grace. It also names the run, so an operator can find
  // the report that will not exist until they act.
  const swept = (await asRuntime("select clara.reap_exhausted_render_jobs() r")).rows[0].r;
  assert.ok(Number(swept.reaped) >= 1, "an at-cap job with a dead lease is reaped on the first sweep");
  assert.ok((swept.reaped_run_ids ?? []).includes(eps.runId),
    "the sweep reports WHICH run was stranded — a bare count sends an operator hunting");
  assert.equal((await rootQuery("select state from clara.render_jobs where id=$1", [id])).rows[0].state,
    "failed");

  // AND THE DUE READ NEVER PROPOSED IT. A job nobody can claim must not start a paid machine, which
  // is true of any at-cap row whether or not the reap has reached it yet.
  const due = (await asRuntime("select clara.render_dispatch_begin(interval '0 seconds', 25) r")).rows[0].r;
  assert.ok(!(due.job_ids ?? []).includes(id), "an at-cap job is not dispatchable");

  // The fence keeps saying false on a reaped row, and says nothing to a worker that never held it:
  // another worker's job, a terminal job and an absent id are one plain `false`.
  assert.equal((await asRuntime("select clara.render_lease_alive($1, 'slow') a", [id])).rows[0].a, false);
  assert.equal((await asRuntime("select clara.render_lease_alive($1, 'someone-else') a", [id])).rows[0].a, false);
  assert.equal((await asRuntime(
    "select clara.render_lease_alive('00000000-0000-4000-8000-00000000dead', 'slow') a")).rows[0].a, false);
});

test("zeta: a RUNNING job can never carry a null lease — the reap's arithmetic cannot go fail-open", async (t) => {
  if (await skipUnlessZeta(t)) return;
  const { eps } = await sealedRun("lease-tie");
  // ISOLATION IS sealedRun's NOW: since F-A5 PR-1 the SEAL enqueues this run's pre_sign job, so a
  // park HERE would swallow the very job this case needs (zeta-fixtures.mjs, sealedRun).
  const job = (await asOwner("select clara.enqueue_render_job($1, 'pre_sign') r", [eps.runId])).rows[0].r;

  // The reap compares `lease_expires_at < now()`. A `running` row with a NULL lease would make that
  // comparison NULL — never true — so the row would never reap, never be claimable (its state is
  // not 'claimable') and never terminate: stranded by arithmetic rather than by decision. The CHECK
  // is what makes that state unrepresentable, and this cell is its positive proof.
  await assert.rejects(
    asOwner(`update clara.render_jobs set state='running', claimed_by=null, claimed_at=null,
        lease_expires_at=null where id=$1`, [job.render_job_id]),
    (e) => e.code === "23514" && /ck_rj_lease_paired/.test(e.message ?? ""),
    "a running row without a lease must be refused by the constraint, not merely avoided by convention",
  );
});

test("zeta: one terminal job in a dispatch batch does not cost the others their receipt", async (t) => {
  if (await skipUnlessZeta(t)) return;
  // TWO runs claimable at once, so only the FIRST seal parks: `park: false` on the second, or its
  // park would swallow the job the first seal just enqueued (zeta-fixtures.mjs, sealedRun).
  const { eps: a } = await sealedRun("receipt-a");
  const { eps: b } = await sealedRun("receipt-b", { park: false });
  const j1 = (await asOwner("select clara.enqueue_render_job($1, 'pre_sign') r", [a.runId])).rows[0].r;
  const j2 = (await asOwner("select clara.enqueue_render_job($1, 'pre_sign') r", [b.runId])).rows[0].r;

  // j1 turns terminal inside the Fly round-trip window — the ordinary race: a second worker
  // finished it, or the sweep reaped it at its cap, while the leader was waiting on the API.
  await asOwner(`update clara.render_jobs set state='running', claimed_by='dead', claimed_at=now(),
      lease_expires_at=now()-interval '1 minute', attempts=max_attempts where id=$1`, [j1.render_job_id]);
  await asRuntime("select clara.reap_exhausted_render_jobs() r");
  assert.equal((await rootQuery("select state from clara.render_jobs where id=$1",
    [j1.render_job_id])).rows[0].state, "failed");

  // The receipt for the WHOLE batch is written after the call returns. Before the fix, the widened
  // terminal wall made this one statement raise CLR08 and roll back every row: four healthy jobs
  // lost "we could not start the renderer" because a fifth had finished. Now the terminal row is
  // skipped and the live ones are still told.
  const rec = (await asRuntime("select clara.render_dispatch_record($1::uuid[], false, $2::jsonb) r",
    [[j1.render_job_id, j2.render_job_id], JSON.stringify({ status: 402, detail: "no capacity" })])).rows[0].r;
  assert.equal(rec.recorded, 1, "the live job is told");
  assert.equal(rec.skipped, 1, "and the terminal one is reported as skipped rather than silently dropped");

  const live = (await rootQuery("select last_dispatch_ok, last_dispatch_error from clara.render_jobs where id=$1",
    [j2.render_job_id])).rows[0];
  assert.equal(live.last_dispatch_ok, false);
  assert.match(JSON.stringify(live.last_dispatch_error), /402/,
    "'we could not start the renderer' is the actionable fact — losing it for a whole batch is the defect this closes");
});

test("zeta: a terminally failed job has a lawful successor, and only through the audited door", async (t) => {
  if (await skipUnlessZeta(t)) return;
  const { world, eps } = await sealedRun("requeue");
  // ISOLATION IS sealedRun's NOW: since F-A5 PR-1 the SEAL enqueues this run's pre_sign job, so a
  // park HERE would swallow the very job this case needs (zeta-fixtures.mjs, sealedRun).
  const job = (await asOwner("select clara.enqueue_render_job($1, 'pre_sign') r", [eps.runId])).rows[0].r;
  const id = job.render_job_id;

  // A live job cannot be requeued — that would put two workers on one pinned request.
  await assert.rejects(
    humanQuery(world.users.alice, "select clara.requeue_render_job($1,'too early')", [id]),
    (e) => e.code === "CLR43" && /render_job_not_failed/.test(e.detail ?? ""),
  );

  // Drive it to the crash-only terminal shape, exactly as the reap leaves it.
  await asOwner(`update clara.render_jobs set state='running', claimed_by='dead', claimed_at=now(),
      lease_expires_at=now()-interval '1 minute', attempts=max_attempts where id=$1`, [id]);
  await asRuntime("select clara.reap_exhausted_render_jobs() r");
  assert.equal((await rootQuery("select state from clara.render_jobs where id=$1", [id])).rows[0].state,
    "failed");

  // THE STRANDING, DEMONSTRATED: re-enqueue cannot rescue it. Before the successor door existed
  // this was the end of the road — the run's statutory PDF was unproducible except by migration.
  await assert.rejects(
    asOwner("select clara.enqueue_render_job($1, 'pre_sign')", [eps.runId]),
    (e) => e.code === "CLR43" && /render_job_failed_terminally/.test(e.detail ?? ""),
  );

  // A reason is required, and then the successor is minted.
  await assert.rejects(
    humanQuery(world.users.alice, "select clara.requeue_render_job($1,'   ')", [id]),
    (e) => e.code === "CLR43" && /requeue_reason_required/.test(e.detail ?? ""),
  );
  const re = (await humanQuery(world.users.alice, "select clara.requeue_render_job($1, $2) r",
    [id, "fly capacity incident 2026-08-15"])).rows[0].r;
  assert.equal(re.supersedes_render_job_id, id);
  assert.equal(re.state, "claimable");
  assert.notEqual(re.render_job_id, id, "a successor is a NEW row; the failed one is history");

  const rows = (await rootQuery(
    `select id, state, supersedes_render_job_id, requeue_reason, manifest_sha256, request_manifest
       from clara.render_jobs where report_run_id = $1 order by enqueued_at`, [eps.runId])).rows;
  const pred = rows.find((r) => r.id === id);
  const succ = rows.find((r) => r.id === re.render_job_id);
  assert.equal(pred.state, "failed", "the predecessor stays exactly as it was — the wall is not weakened");
  assert.equal(succ.requeue_reason, "fly capacity incident 2026-08-15");

  // THE MANIFEST IS RE-DERIVED, and the digests are BOTH reported. Nothing upstream moved in this
  // fixture, so the fresh digest equals the predecessor's and manifest_changed is false — but the
  // successor's manifest is today's derivation either way. A verbatim copy would be refused at
  // completion by epsilon's seal, which re-derives every pin: statutory_wording is append-only, so
  // one later verified row moves the aggregate and a copied manifest becomes permanently
  // unsealable. Round 2 shipped the copy; round 3 corrected it.
  assert.equal(re.superseded_manifest_sha256, pred.manifest_sha256,
    "the predecessor's digest travels with the successor, so drift is readable rather than silent");
  assert.equal(succ.manifest_sha256, re.manifest_sha256);
  assert.equal(re.manifest_changed, false, "nothing upstream moved in this fixture");
  const fresh = (await asOwner("select clara.render_request_manifest_v1($1, 'pre_sign') m",
    [eps.runId])).rows[0].m;
  assert.deepEqual(succ.request_manifest, fresh,
    "the successor carries TODAY's pins — the same thing a fresh enqueue would build");

  // ONE successor, not a queue of them.
  await assert.rejects(
    humanQuery(world.users.alice, "select clara.requeue_render_job($1,'again')", [id]),
    (e) => e.code === "CLR43" && /render_job_already_requeued/.test(e.detail ?? ""),
  );

  // The act is AUDITED, with the operator as actor and the report's requester as on_behalf_of.
  const audit = (await rootQuery(
    `select actor, on_behalf_of, args from clara.audit_log
      where fn = 'requeue_render_job' and (args->>'render_job_id') = $1`, [re.render_job_id])).rows;
  assert.equal(audit.length, 1, "an operational act that mints paid work is a recorded act");
  assert.equal(audit[0].args.supersedes_render_job_id, id);
  assert.equal(audit[0].args.reason, "fly capacity incident 2026-08-15");
});

test("zeta: when the pins have MOVED, the requeue re-derives, refuses silently drifting, and records both digests", async (t) => {
  if (await skipUnlessZeta(t)) return;
  const { world, eps, profileKey } = await sealedStatutoryRun("drift");
  // ISOLATION IS sealedRun's NOW: since F-A5 PR-1 the SEAL enqueues this run's pre_sign job, so a
  // park HERE would swallow the very job this case needs (zeta-fixtures.mjs, sealedRun).
  const job = (await asOwner("select clara.enqueue_render_job($1, 'pre_sign') r", [eps.runId])).rows[0].r;
  const id = job.render_job_id;
  await asOwner(`update clara.render_jobs set state='running', claimed_by='dead', claimed_at=now(),
      lease_expires_at=now()-interval '1 minute', attempts=max_attempts where id=$1`, [id]);
  await asRuntime("select clara.reap_exhausted_render_jobs() r");

  // MOVE AN UPSTREAM INPUT. Without this the cell cannot tell a re-derivation from a verbatim copy:
  // both produce the predecessor's digest when nothing has changed, which is exactly why the
  // round-3 version of this test passed against the code it was written to condemn.
  const { before, after } = await driftWording(eps, profileKey);
  assert.notEqual(JSON.stringify(before), JSON.stringify(after));

  // A DRIFTED ENQUEUE still refuses and still names the door — the refusal is keyed on the run and
  // kind, so a moved pin cannot route around it (the digest is no longer the same one).
  await assert.rejects(
    asOwner("select clara.enqueue_render_job($1, 'pre_sign')", [eps.runId]),
    (e) => e.code === "CLR43" && /render_job_failed_terminally/.test(e.detail ?? ""),
    "a drifted request for a terminally failed run+kind must still be refused by the machine path",
  );

  // AND THE REQUEUE REFUSES TO DRIFT SILENTLY: the operator is told, with both digests, BEFORE the
  // job exists — not in the return value of a job already minted.
  await assert.rejects(
    humanQuery(world.users.alice, "select clara.requeue_render_job($1, 'wording landed')", [id]),
    (e) => {
      const d = JSON.parse(e.detail ?? "{}");
      return e.code === "CLR43" && d.reason === "requeue_manifest_drifted"
        && typeof d.manifest_sha256 === "string" && typeof d.superseded_manifest_sha256 === "string"
        && d.manifest_sha256 !== d.superseded_manifest_sha256;
    },
    "drift must be consented to, and the refusal must carry both digests so consent is informed",
  );

  const re = (await humanQuery(world.users.alice,
    "select clara.requeue_render_job($1, $2, true) r", [id, "wording landed"])).rows[0].r;
  assert.equal(re.manifest_changed, true);
  assert.equal(re.drift_accepted, true);
  assert.notEqual(re.manifest_sha256, re.superseded_manifest_sha256);

  const succ = (await rootQuery("select manifest_sha256, request_manifest from clara.render_jobs where id=$1",
    [re.render_job_id])).rows[0];
  assert.deepEqual(succ.request_manifest, after,
    "the successor carries the pins as they are TODAY — a verbatim copy would be refused by the seal");
  assert.equal(succ.manifest_sha256, re.manifest_sha256);

  const audit = (await rootQuery(
    `select args from clara.audit_log where fn = 'requeue_render_job'
      and (args->>'render_job_id') = $1`, [re.render_job_id])).rows[0].args;
  assert.equal(audit.manifest_changed, true);
  assert.equal(audit.drift_accepted, true);
  assert.equal(audit.superseded_manifest_sha256, job.manifest_sha256,
    "the audit row carries BOTH digests, so 'the retry rendered a different document' is readable years later");

  // THE DOUBLE-REQUEUE ARM, RUN WHERE IT CAN ACTUALLY FAIL. Requeuing A again now that B is live
  // under a DIFFERENT digest is the exact walk the old digest-keyed read missed: it would have
  // found no live row carrying A's digest and minted a third job, leaving two live successors to
  // one failure with the partial index unable to object. The non-drifted version of this assertion
  // passes against both predicates and proves nothing.
  await assert.rejects(
    humanQuery(world.users.alice, "select clara.requeue_render_job($1, 'again', true)", [id]),
    (e) => e.code === "CLR43" && /render_job_already_requeued/.test(e.detail ?? ""),
    "one live successor per (run, kind) — whatever the successor's manifest hashed to",
  );
  assert.equal((await rootQuery(
    "select count(*)::int n from clara.render_jobs where report_run_id=$1 and kind='pre_sign' and state <> 'failed'",
    [eps.runId])).rows[0].n, 1, "exactly one live job for this request");
});
