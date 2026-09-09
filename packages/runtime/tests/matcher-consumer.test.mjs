// Slice-5 matcher — the CONSUMER layer: cycle processing (walk past non-matcher
// events, effects on extraction_completed), checkpoint independence from the
// router, bounded dead-letter + consumer-specific redrive (the router handler is
// never invoked), the registry seam, and the redrive CLI's --consumer dispatch.
// Contract §4.4; migration 0007 companion §3.4/§3.7.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { runMatcherCycle, matcherRedrive, matcherHealth, CONSUMERS, MATCHER_CONSUMER, MATCHER_VERSION, MATCHER_MAX_ATTEMPTS } from "../lib/matcher.mjs";
import { runRelayCycle } from "../lib/relay.mjs";
import { deadLetterCategory, relayFirmCategory } from "../lib/consumer-health.mjs";
import {
  skip,
  rootQuery,
  asRuntime,
  headSeq,
  buildFirmWithClients,
  seedVerifiedDocument,
  seedMatchableDocument,
  asMatcherLogin,
  drainMatcher,
  attemptsFor,
  ruleResolutionsFor,
  matcherCheckpoint,
  routerCheckpoint,
  matcherDeadLetters,
} from "./matcher-testkit.mjs";

const tinOf = () => "tin" + randomUUID().replace(/-/g, "").slice(0, 16);
const runCycle = (opts) => asMatcherLogin((c) => runMatcherCycle(c, opts));

// ---------------------------------------------------------------------------
// Cycle processing + walking past non-matcher events.
// ---------------------------------------------------------------------------

test("cycle: processes an extraction_completed event and advances the matcher checkpoint to head", { skip }, async () => {
  const { owner, firm, clients } = await buildFirmWithClients(1);
  const tin = tinOf();
  // _seed_verified_document also emits document.ingested (a NON-matcher event the
  // matcher must walk past), so the stream is mixed. The lane-1 rule hit itself
  // emits client.resolved, so we drive to convergence.
  const { document } = await seedMatchableDocument({ firm, owner, client: clients[0], tin });

  await drainMatcher(firm);

  assert.equal(await matcherCheckpoint(firm), await headSeq(firm), "matcher checkpoint converged to firm head");
  assert.equal((await ruleResolutionsFor(firm, document)).length, 1, "the extraction event was matched (lane-1 rule hit)");
  assert.equal((await attemptsFor(document)).filter((a) => a.matcher_version === MATCHER_VERSION).length, 1);
});

test("cycle: a firm with ONLY non-matcher events advances the checkpoint without any effects", { skip }, async () => {
  const { owner, firm, clients } = await buildFirmWithClients(1);
  // Two verified documents ⇒ document.ingested/filed events, but NO extraction_completed.
  await seedVerifiedDocument({ firm, uploadedBy: owner, client: clients[0] });
  await seedVerifiedDocument({ firm, uploadedBy: owner });

  const before = await rootQuery("select count(*)::int as n from clara.attribution_attempts where firm_id=$1", [firm]);
  await runCycle({ onlyFirm: firm, batchSize: 50 });
  const after = await rootQuery("select count(*)::int as n from clara.attribution_attempts where firm_id=$1", [firm]);

  assert.equal(await matcherCheckpoint(firm), await headSeq(firm), "checkpoint walked to head over non-matcher events");
  assert.equal(after.rows[0].n, before.rows[0].n, "no attribution attempts written for non-matcher events");
});

// ---------------------------------------------------------------------------
// Checkpoint independence — the matcher and router progress on separate pointers.
// ---------------------------------------------------------------------------

test("checkpoints are independent: router ahead, matcher behind, neither interferes", { skip }, async () => {
  const { owner, firm, clients } = await buildFirmWithClients(1);
  const tin = tinOf();
  const { document } = await seedMatchableDocument({ firm, owner, client: clients[0], tin });

  // Drive ONLY the router to head first.
  for (let i = 0; i < 20; i++) {
    await asRuntime((c) => runRelayCycle(c, { onlyFirm: firm, batchSize: 50 }));
    if ((await routerCheckpoint(firm)) === (await headSeq(firm))) break;
  }
  const routerCp = await routerCheckpoint(firm);
  assert.equal(routerCp, await headSeq(firm), "router reached head");
  assert.equal(await matcherCheckpoint(firm), null, "the matcher has NOT started — its own pointer is untouched");

  // Now drive the matcher. Its lane-1 resolution emits client.resolved (head grows),
  // which the matcher then walks past — but the ROUTER's own pointer must NOT move.
  await drainMatcher(firm);
  assert.equal(await matcherCheckpoint(firm), await headSeq(firm), "matcher independently converged to head");
  assert.equal(await routerCheckpoint(firm), routerCp, "the router's checkpoint is untouched by the matcher run");
  assert.ok((await headSeq(firm)) > routerCp, "head advanced past the router (the matcher's emitted client.resolved awaits the router)");
  assert.equal((await ruleResolutionsFor(firm, document)).length, 1, "the matcher still did its work");
});

// ---------------------------------------------------------------------------
// Dead-letter + consumer-specific redrive.
// ---------------------------------------------------------------------------

test("dead-letter: a failing handler records a consumer='matcher' dead-letter; matcherRedrive re-runs the MATCHER handler", { skip }, async () => {
  const { owner, firm, clients } = await buildFirmWithClients(1);
  const tin = tinOf();
  const { document, eventId } = await seedMatchableDocument({ firm, owner, client: clients[0], tin });

  // A transient, non-permission failure injected via the lane-2 reader (a non-42501
  // throw propagates and fails the effects) ⇒ a bounded dead-letter attempt.
  const boom = async () => {
    const e = new Error("injected transient reader failure");
    e.code = "XXBOOM";
    throw e;
  };
  await runCycle({ onlyFirm: firm, batchSize: 50, readMatchInputs: boom });

  const dl = await matcherDeadLetters(firm);
  assert.equal(dl.length, 1, "one consumer='matcher' dead-letter row");
  assert.equal(dl[0].eventId, eventId);
  assert.equal(dl[0].status, "pending");
  assert.equal((await ruleResolutionsFor(firm, document)).length, 0, "no resolution yet — the effect rolled back atomically");

  // Redrive with a healthy handler (default reader) ⇒ the MATCHER handler resolves it.
  const res = await asMatcherLogin((c) => matcherRedrive(c, eventId));
  assert.deepEqual({ resolved: res.resolved, consumer: res.consumer }, { resolved: true, consumer: "matcher" });
  assert.equal((await matcherDeadLetters(firm)).find((d) => d.eventId === eventId).status, "resolved", "dead-letter marked resolved");
  assert.equal((await ruleResolutionsFor(firm, document)).length, 1, "the matcher handler ran on redrive (lane-1 rule hit recorded)");
});

test("matcher redrive refuses when there is no matcher dead-letter (a never-dead-lettered event is never 'resolved')", { skip }, async () => {
  const { owner, firm, clients } = await buildFirmWithClients(1);
  const { eventId } = await seedMatchableDocument({ firm, owner, client: clients[0], tin: tinOf() });
  await assert.rejects(
    () => asMatcherLogin((c) => matcherRedrive(c, eventId)),
    /no dead-letter for consumer='matcher'/,
    "redrive of a clean event refuses (X5a analogue)",
  );
});

test("registry: the matcher entry dispatches the matcher handler (never the router taxonomy projection)", { skip }, async () => {
  assert.equal(CONSUMERS.matcher.name, MATCHER_CONSUMER);
  assert.equal(CONSUMERS.matcher.identity, "runtime-login", "matcher redrive needs the raw runtime LOGIN for lane-1");
  assert.equal(CONSUMERS.router.identity, "runtime-role", "router keeps its existing runtime-role path");
  assert.notEqual(CONSUMERS.matcher.redrive, CONSUMERS.router.redrive, "distinct handlers");
});

// ---------------------------------------------------------------------------
// matcherHealth — per-consumer lag + dead-letter counts (warn signal).
// ---------------------------------------------------------------------------

test("matcherHealth reports the matcher's own lag + pending dead-letter counts", { skip }, async () => {
  const h = await asMatcherLogin((c) => matcherHealth(c));
  assert.equal(h.consumer, MATCHER_CONSUMER);
  assert.equal(typeof h.lag, "number");
  assert.equal(typeof h.pendingDeadLetters, "number");
  assert.ok(h.lag >= 0 && h.pendingDeadLetters >= 0);
});

// #617 — THE CATEGORIES, AGAINST A REAL DATABASE.
//
// [#686 — 2026-09-09] These cells used to assert an ESTATE DELTA around their own work
// (`seeded.firmsUncheckpointed - before.firmsUncheckpointed === 1`), on the reasoning that an
// absolute estate number would be a fixture of whatever else had run. The delta is no better: CI
// runs `pnpm -r --if-present test`, i.e. the db, web and runtime suites CONCURRENTLY against ONE
// Postgres, and `clara.firm_event_seq` is shared by every consumer and every suite — so it was
// also counting firms another suite created between the two reads (wave-a's twin of this cell
// failed exactly that way on PR #686, `4 !== 1`). What IS deterministic is the PER-FIRM / PER-ROW
// category, so that is what these cells now prove, through the readers in lib/consumer-health.mjs:
// the same SQL text as the estate columns, over state no other suite can touch (their agreement is
// pinned in tests/consumer-health-readers.test.mjs). The estate counts keep only assertions that
// concurrent noise can STRENGTHEN, never break.

test("#617 matcherHealth: a firm with events and NO checkpoint counts as UNCHECKPOINTED, not merely as lag", { skip }, async () => {
  // The WIRE SHAPE, pinned. #617 moved this query into lib/consumer-health.mjs, shared with
  // every other relay consumer; the fields and their ORDER are what /ready and its readers
  // actually see, so a future consolidation that renames, reorders or drops one fails HERE.
  const shape = await asMatcherLogin((c) => matcherHealth(c));
  assert.deepEqual(
    Object.keys(shape),
    ["consumer", "lag", "pendingDeadLetters", "firmsTracked", "firmsUncheckpointed", "deadLetters"],
    "matcherHealth's field set and order",
  );
  const { owner, firm, clients } = await buildFirmWithClients(1);
  await seedMatchableDocument({ firm, owner, client: clients[0], tin: tinOf() });

  const seededFirm = await asMatcherLogin((c) => relayFirmCategory(c, MATCHER_CONSUMER, firm));
  assert.deepEqual(
    { hasEvents: seededFirm.hasEvents, checkpointed: seededFirm.checkpointed },
    { hasEvents: true, checkpointed: false },
    "a firm with events this consumer has never checkpointed is counted as NOT-YET-MEASURED — and is NOT in firmsTracked, the two being complements",
  );
  assert.equal(
    seededFirm.lag,
    await headSeq(firm),
    "while `lag` reads the missing checkpoint as last_seq 0 and reports the firm's ENTIRE history: exactly the ambiguity this category resolves",
  );
  const seeded = await asMatcherLogin((c) => matcherHealth(c));
  assert.ok(seeded.firmsUncheckpointed >= 1, "and the estate column carries it — a floor another suite's firms can only raise");

  // The discriminating half: run the consumer. The firm now HAS a checkpoint, so it leaves the
  // uncheckpointed category — while `lag` (which reads a missing checkpoint as last_seq 0) was
  // never able to tell the two states apart on its own.
  await drainMatcher(firm);
  const drainedFirm = await asMatcherLogin((c) => relayFirmCategory(c, MATCHER_CONSUMER, firm));
  assert.deepEqual(
    { hasEvents: drainedFirm.hasEvents, checkpointed: drainedFirm.checkpointed, lag: drainedFirm.lag },
    { hasEvents: true, checkpointed: true, lag: 0 },
    "once checkpointed the firm leaves the not-yet-measured category and joins the tracked one, contributing nothing to lag (drainMatcher converged to head)",
  );
  const drained = await asMatcherLogin((c) => matcherHealth(c));
  assert.ok(drained.firmsTracked >= 1, "which the estate's tracked count carries in turn");
});

test("#617 matcherHealth: dead letters split into pending vs EXHAUSTED at this consumer's own cap", { skip }, async () => {
  const { owner, firm, clients } = await buildFirmWithClients(1);
  const { eventId } = await seedMatchableDocument({ firm, owner, client: clients[0], tin: tinOf() });
  // A REAL dead letter, minted the way production mints one: a transient reader failure inside
  // the cycle (the same injection the redrive cell above uses), never a hand-inserted row.
  const boom = async () => {
    const e = new Error("injected transient reader failure (#617 boundary cell)");
    e.code = "XXBOOM";
    throw e;
  };
  await runCycle({ onlyFirm: firm, batchSize: 50, readMatchInputs: boom });
  assert.equal((await matcherDeadLetters(firm)).length, 1, "mandatory setup: one pending matcher dead-letter");

  // BOUNDARY, from below. One attempt short of the cap the row is still inside its retry budget:
  // it counts as pending and NOT as exhausted. Without this arm the cell would pass for an
  // implementation that simply called every pending dead letter exhausted.
  await rootQuery("update clara.relay_dead_letters set attempt_count = $3 where consumer = $1 and event_id = $2", [
    MATCHER_CONSUMER,
    eventId,
    MATCHER_MAX_ATTEMPTS - 1,
  ]);
  assert.equal(
    await asMatcherLogin((c) => deadLetterCategory(c, MATCHER_CONSUMER, eventId, MATCHER_MAX_ATTEMPTS)),
    "pending",
    "a pending dead letter one short of the cap is counted as pending and NOT as exhausted",
  );
  const retrying = await asMatcherLogin((c) => matcherHealth(c));
  assert.ok(retrying.deadLetters.pending >= 1, "and the estate backlog carries it");
  assert.equal(retrying.pendingDeadLetters, retrying.deadLetters.pending, "the compatibility field still mirrors the pending total");

  // AT the cap: retrying has stopped (the cycle skips past it and advances the checkpoint), so it
  // needs an operator redrive and is reported as its own category.
  await rootQuery("update clara.relay_dead_letters set attempt_count = $3 where consumer = $1 and event_id = $2", [
    MATCHER_CONSUMER,
    eventId,
    MATCHER_MAX_ATTEMPTS,
  ]);
  assert.equal(
    await asMatcherLogin((c) => deadLetterCategory(c, MATCHER_CONSUMER, eventId, MATCHER_MAX_ATTEMPTS)),
    "exhausted",
    "at the cap the row is EXHAUSTED",
  );
  const exhausted = await asMatcherLogin((c) => matcherHealth(c));
  assert.ok(exhausted.deadLetters.exhausted >= 1, "and the estate's exhausted count carries it");
  assert.ok(
    exhausted.deadLetters.pending >= exhausted.deadLetters.exhausted,
    "an exhausted row is STILL pending — exhausted is a subset, so the two counts must not be subtracted from each other (exact: one snapshot)",
  );
});

// ---------------------------------------------------------------------------
// The redrive CLI — `relay.mjs redrive <id> --consumer matcher` dispatches the
// matcher handler on a raw runtime-LOGIN connection.
// ---------------------------------------------------------------------------

const RELAY_SCRIPT = fileURLToPath(new URL("../scripts/relay.mjs", import.meta.url));
const RUNTIME_CWD = fileURLToPath(new URL("..", import.meta.url));

function runRedriveCli(args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [RELAY_SCRIPT, "redrive", ...args], {
      cwd: RUNTIME_CWD,
      env: { ...process.env, RELAY_TEST_MODE: "1", ...extraEnv },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    const t = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("redrive CLI timeout"));
    }, 20000);
    child.on("exit", (code) => {
      clearTimeout(t);
      if (code !== 0) return reject(new Error(`redrive CLI exit ${code}: stdout=[${out}] stderr=[${err}]`));
      const line = out.split("\n").map((s) => s.trim()).filter((s) => s.startsWith("{")).pop();
      if (!line) return reject(new Error(`redrive CLI produced no JSON: stdout=[${out}] stderr=[${err}]`));
      resolve(JSON.parse(line));
    });
  });
}

test("CLI: `redrive <id> --consumer matcher` dispatches the matcher handler and resolves the dead-letter", { skip }, async () => {
  const { owner, firm, clients } = await buildFirmWithClients(1);
  const tin = tinOf();
  const { document, eventId } = await seedMatchableDocument({ firm, owner, client: clients[0], tin });

  // Seed a matcher dead-letter first (a failing cycle), then redrive via the CLI.
  const boom = async () => {
    const e = new Error("boom");
    e.code = "XXBOOM";
    throw e;
  };
  await runCycle({ onlyFirm: firm, batchSize: 50, readMatchInputs: boom });
  assert.equal((await matcherDeadLetters(firm)).length, 1, "matcher dead-letter seeded");

  // The CLI's matcher path selects makeRuntimeClient (the runtime-LOGIN identity). On
  // this throwaway clara_runtime_login is NOLOGIN (the rig uses SET SESSION AUTHORIZATION,
  // and the grant/identity semantics are proven in-process), so we point the runtime
  // DSN at the superuser login to prove the CLI *dispatches the matcher handler* (never
  // the router taxonomy projection) end-to-end.
  const dsn = `postgresql://postgres@${process.env.PGHOST || "127.0.0.1"}:${process.env.PGPORT || "5544"}/${process.env.PGDATABASE || "clara_test"}`;
  const res = await runRedriveCli([eventId, "--consumer", "matcher"], { CLARA_RUNTIME_DATABASE_URL: dsn });
  assert.equal(res.resolved, true);
  assert.equal(res.consumer, "matcher");
  assert.equal((await matcherDeadLetters(firm)).find((d) => d.eventId === eventId).status, "resolved");
  assert.equal((await ruleResolutionsFor(firm, document)).length, 1, "the matcher handler ran via the CLI");
});
