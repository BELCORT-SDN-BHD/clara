// Slice-4 rig — DURABLE RUNTIME part 7: UPGRADE / CUTOVER (§6 item 8; contract
// §3.9 + S4-ND9). Contract-blind: derived from the contract v2.1, never from 0006.
//
// This is the ONLY runtime test that RESETS the database (drops schema clara),
// so it is GATED behind CLARA_RIG_ALLOW_RESET=1 and MUST run ALONE (node --test
// runs files concurrently against one shared DB — a mid-run schema drop would
// nuke the other suites). In a normal run it SKIPS.
//
// The deploy-onto-existing path: apply ONLY 0001–0005 onto a fresh DB, create
// real data through the writers, seed a SYNTHETIC taxonomy version mapping
// event types to internal_task AND notification (S4-ND9 — v1 only maps
// background_review, and the Slice-3 stamping trigger rejects unmapped triples;
// without the seed this test false-greens to background_review-only), leave
// PENDING intents for ALL THREE wake-bound decisions, then apply 0006 and
// prove: the intents survive AND are consumable, the new guards are live, and
// context packs are unaffected.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, copyFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ROLES,
  ROUTINE_CENTS,
  opk,
  sha,
  human,
  balanced,
  rootQuery,
  roleQuery,
  endPool,
  insertUser,
  seedAdmission,
  createFirm,
  createClient,
  upsertAccount,
  freshResolution,
  draftEntry,
  approveEntry,
  ingestDocument,
  contextPack,
  maxSeq,
  readRow,
  printLaneNotes,
} from "./rig-runtime-fixtures.mjs";

after(async () => {
  printLaneNotes("upgrade");
  await endPool();
});

const RESET_OK = process.env.CLARA_RIG_ALLOW_RESET === "1";
const MIG_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const SYNTH_VERSION = 90001;

/** Copy migrations 0001–0005 (NOT 0006) into a throwaway dir for a partial migrate. */
function exportPre0006() {
  const tmp = mkdtempSync(join(tmpdir(), "clara-pre0006-"));
  for (const f of readdirSync(MIG_DIR)) {
    if (/^000[1-5]_.*\.sql$/.test(f)) copyFileSync(join(MIG_DIR, f), join(tmp, f));
  }
  return tmp;
}

/** The latest event of a type for a client (root). */
async function latestEvent(client, type) {
  const r = await rootQuery(
    "select id, firm_id, seq, event_type from clara.domain_events where client_id = $1 and event_type = $2 order by seq desc limit 1",
    [client, type],
  );
  return r.rows[0];
}

async function insertPendingIntent(ev, decision, version) {
  const r = await roleQuery(
    ROLES.runtime,
    "insert into clara.wake_intents (event_id, firm_id, event_seq, event_type, decision, taxonomy_version) values ($1, $2, $3, $4, $5, $6) returning id",
    [ev.id, ev.firm_id, ev.seq, ev.event_type, decision, version],
  );
  return r.rows[0].id;
}

test("§3.9 upgrade/cutover: 0001–0005 + data + PENDING intents for ALL THREE wake-bound decisions → 0006 → intents preserved + consumable; guards live; packs unaffected", async (t) => {
  if (!RESET_OK) {
    t.skip("destructive (drops schema clara); set CLARA_RIG_ALLOW_RESET=1 on an isolated DB to run ALONE");
    return;
  }
  const { reset } = await import("../scripts/reset.mjs");
  const { migrate } = await import("../scripts/migrate.mjs");

  // 1. Fresh DB with ONLY 0001–0005 (the Slice-3 world; no runtime core).
  await reset({ log: () => {} });
  await migrate({ dir: exportPre0006(), log: () => {} });
  const pre = await rootQuery(
    "select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'clara' and c.relname = 'agent_tasks'",
  );
  assert.equal(pre.rowCount, 0, "agent_tasks does not exist under 0001–0005");

  // 2. Real data through the audited writers: a firm, client, chart, an APPROVED
  //    entry, a resolution, and an ingested document (the three event types the
  //    wake-bound decisions will ride on).
  const prefix = `upg6_${Date.now().toString(36)}_${randomUUID().slice(0, 6)}`;
  const owner = await insertUser(prefix, "owner");
  const token = await seedAdmission();
  const firm = await createFirm(owner, { name: `${prefix}_firm`, token, opKey: opk() });
  const client = await createClient(owner, { name: `${prefix}_c1`, opKey: opk() });
  await upsertAccount(owner, { client, code: "1000", name: "Cash", type: "asset", opKey: opk() });
  await upsertAccount(owner, { client, code: "4000", name: "Sales", type: "income", opKey: opk() });
  await upsertAccount(owner, { client, code: "9990", name: "Rounding", type: "equity", special: "rounding", opKey: opk() });
  const res = await freshResolution(owner, client);
  const d = await draftEntry(human(owner), { client, resolution: res, lines: balanced({ cash: "1000", sales: "4000" }, ROUTINE_CENTS), opKey: opk() });
  await approveEntry(owner, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk() });
  await ingestDocument(human(owner), { client, sha256: sha(randomUUID()), opKey: opk() });

  // 3. S4-ND9: a SYNTHETIC taxonomy version mapping event types to internal_task
  //    and notification (v1 maps only background_review; the stamping trigger
  //    rejects unmapped (version, type, decision) triples).
  await rootQuery("insert into clara.taxonomy_versions (version, note) values ($1, 'rig synthetic all-decisions version (S4-ND9)')", [SYNTH_VERSION]);
  await rootQuery(
    `insert into clara.trigger_taxonomy (version, event_type, decision, note) values
       ($1, 'entry.approved',    'internal_task',     'rig synthetic'),
       ($1, 'client.resolved',   'notification',      'rig synthetic'),
       ($1, 'document.ingested', 'background_review', 'rig synthetic')`,
    [SYNTH_VERSION],
  );

  // 4. PENDING intents for ALL THREE wake-bound decisions.
  const intents = {
    internal_task: await insertPendingIntent(await latestEvent(client, "entry.approved"), "internal_task", SYNTH_VERSION),
    notification: await insertPendingIntent(await latestEvent(client, "client.resolved"), "notification", SYNTH_VERSION),
    background_review: await insertPendingIntent(await latestEvent(client, "document.ingested"), "background_review", SYNTH_VERSION),
  };
  const preSeq = await maxSeq(firm);
  const prePackVersion = Number((await contextPack(owner, client, "pre-0006"))?.books_version);
  assert.equal(prePackVersion, preSeq, "pre-0006 sanity: the pack token equals the firm head");

  // 5. Apply 0006 onto the POPULATED DB (default dir = every migration).
  await migrate({ log: () => {} });

  // 6a. The runtime core landed; the new tables are FORCE-RLS.
  const at = await rootQuery(
    `select c.relrowsecurity as rls, c.relforcerowsecurity as force
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'clara' and c.relname = 'agent_tasks'`,
  );
  assert.equal(at.rowCount, 1, "agent_tasks exists after 0006");
  assert.ok(at.rows[0].rls && at.rows[0].force, "agent_tasks is FORCE-RLS after the upgrade");

  // 6b. Every pre-existing intent survived the guard swap: still pending, null
  //     consumption fields (the new columns), identity untouched.
  for (const [decision, id] of Object.entries(intents)) {
    const row = await readRow("wake_intents", id);
    assert.ok(row, `the ${decision} intent survived the upgrade`);
    assert.equal(row.status, "pending", `the ${decision} intent is still pending`);
    assert.equal(row.consumed_at ?? null, null, `the ${decision} intent has no consumed_at`);
    assert.equal(row.consumed_by ?? null, null, `the ${decision} intent has no consumed_by`);
    assert.equal(row.decision, decision, `the ${decision} intent kept its decision`);
    assert.equal(row.taxonomy_version, SYNTH_VERSION, "the synthetic taxonomy_version survived");
  }

  // 6c. Each is CONSUMABLE through the new lifecycle (pending→consumed derives
  //     consumed_at, requires consumed_by) — all three wake-bound decisions drain.
  for (const [decision, id] of Object.entries(intents)) {
    const upd = await roleQuery(
      ROLES.runtime,
      "update clara.wake_intents set status = 'consumed', consumed_by = $2 where id = $1 and status = 'pending' returning consumed_at",
      [id, randomUUID()],
    );
    assert.equal(upd.rowCount, 1, `the ${decision} intent consumed post-upgrade`);
    assert.ok(upd.rows[0].consumed_at, `the ${decision} consumption derived consumed_at`);
  }

  // 6d. The new guards are LIVE on the upgraded DB: a forged-consumed INSERT is
  //     forced to pending; DELETE stays blocked.
  await ingestDocument(human(owner), { client, sha256: sha(randomUUID()), opKey: opk() });
  const freshEv = await latestEvent(client, "document.ingested");
  const forged = await roleQuery(
    ROLES.runtime,
    `insert into clara.wake_intents (event_id, firm_id, event_seq, event_type, decision, taxonomy_version, status, consumed_at, consumed_by)
     values ($1, $2, $3, $4, 'background_review', 1, 'consumed', now(), $5) returning id`,
    [freshEv.id, freshEv.firm_id, freshEv.seq, freshEv.event_type, randomUUID()],
  );
  const frow = await readRow("wake_intents", forged.rows[0].id);
  assert.equal(frow.status, "pending", "post-upgrade: INSERT cannot forge consumed (S4-D7 live)");
  assert.equal(frow.consumed_at ?? null, null, "post-upgrade: consumed_at nulled on INSERT");
  let delFailed = false;
  try {
    await rootQuery("delete from clara.wake_intents where id = $1", [forged.rows[0].id]);
  } catch {
    delFailed = true;
  }
  assert.ok(delFailed, "post-upgrade: DELETE on wake_intents is still blocked");

  // 6e. Packs are unaffected by the upgrade: coherent shape, base-table
  //     approval_history, and the token still equals the firm head (0006 emits
  //     no domain events of its own — runtime-control mutations emit none, §0.11).
  const pack = await contextPack(owner, client, "post-0006");
  assert.ok(pack, "a pack is returned after the upgrade");
  assert.ok(Array.isArray(pack.approval_history) && pack.approval_history.length >= 1, "approval_history still carries the approved entry");
  assert.equal(Number(pack.books_version), await maxSeq(firm), "books_version == the firm head after the upgrade");
});
