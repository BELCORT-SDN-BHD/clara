// Slice-3 rig — the EVENT SPINE, part 4: UPGRADE / CUTOVER (§4.11 / C9 of
// docs/plan/completed/slice3-event-spine-contract.md v2.2).
//
// This is the ONLY event-spine test that RESETS the database (drops schema clara),
// so it is GATED behind CLARA_RIG_ALLOW_RESET=1 and is meant to run SEPARATELY (alone)
// — `node --test` runs files CONCURRENTLY against one shared DB (the Slice-2 lesson),
// and a mid-run schema drop would nuke the other files. In a normal run it SKIPS.
//
// It proves the deploy-onto-existing path: apply ONLY 0001–0004 (via migrate's `dir`
// override) onto a fresh DB, create firms/clients/entries THROUGH the writers (which
// emit nothing — no event spine yet), then apply 0005 onto the POPULATED DB and assert
// the cutover: exactly one books.baseline event per pre-existing firm, coherent packs
// with approval_history from the base tables, and emission working from then on.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, copyFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ROUTINE_CENTS,
  opk,
  human,
  balanced,
  rootQuery,
  endPool,
  createFirm,
  createClient,
  upsertAccount,
  freshResolution,
  draftEntry,
  approveEntry,
  insertUser,
  seedAdmission,
  maxSeq,
  eventsSince,
  contextPack,
} from "./rig-events-helpers.mjs";

after(endPool);

const RESET_OK = process.env.CLARA_RIG_ALLOW_RESET === "1";
const MIG_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

/** Copy migrations 0001–0004 (NOT 0005) into a throwaway dir for a partial migrate. */
function exportPre0005() {
  const tmp = mkdtempSync(join(tmpdir(), "clara-pre0005-"));
  for (const f of readdirSync(MIG_DIR)) {
    if (/^000[1-4]_.*\.sql$/.test(f)) copyFileSync(join(MIG_DIR, f), join(tmp, f));
  }
  return tmp;
}

test("§4.11 upgrade/cutover: 0001–0004 + data → 0005 lands one books.baseline per firm; packs coherent; emission resumes (C9)", async (t) => {
  if (!RESET_OK) {
    t.skip("destructive (drops schema clara); set CLARA_RIG_ALLOW_RESET=1 on an isolated DB to run alone");
    return;
  }
  const { reset } = await import("../scripts/reset.mjs");
  const { migrate } = await import("../scripts/migrate.mjs");
  const { sweepChainMintedRoles } = await import("./rig-cluster-reset.mjs");

  // 1. Fresh DB with ONLY 0001–0004 (no event spine). This file's own `migrate()`
  //    below (no `dir` override) runs the WHOLE 0001->frontier chain, which
  //    includes 0154's exact cluster-wide role-census wall. This is the FIRST
  //    closed-wave drill step in the CI job (action.yml), so on a genuinely fresh
  //    job it starts at zero roles — but the sweep here makes THIS file's own
  //    reset+migrate robust regardless of what ran before it (review-518 D1/D2;
  //    see tests/rig-cluster-reset.mjs's header). Requires
  //    CLARA_RIG_ALLOW_ROLE_SWEEP=1 (set by the action on this step).
  await reset({ log: () => {} });
  await sweepChainMintedRoles({ log: () => {} });
  const preDir = exportPre0005();
  await migrate({ dir: preDir, log: () => {} });

  // Sanity: the event spine is genuinely absent at this point.
  const spine = await rootQuery("select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'clara' and c.relname = 'domain_events'");
  assert.equal(spine.rowCount, 0, "domain_events does not exist under 0001–0004");

  // 2. Build a firm + client + chart + an APPROVED entry through the audited writers
  //    (these emit no events — the spine is not there yet).
  const prefix = `upg_${Date.now().toString(36)}_${randomUUID().slice(0, 6)}`;
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

  const preFirms = (await rootQuery("select id from clara.firms")).rows.map((r) => r.id);
  assert.ok(preFirms.includes(firm), "the pre-existing firm is present before cutover");

  // 3. Apply 0005 onto the POPULATED DB (default dir = all five; the drift guard passes
  //    because 0001–0004 are byte-identical to the temp export).
  await migrate({ log: () => {} });

  // 4a. Exactly one firm-level, actor-null books.baseline per pre-existing firm.
  for (const f of preFirms) {
    const b = await rootQuery(
      "select count(*)::int as n, bool_and(client_id is null) as firm_level, bool_and(actor is null) as sys from clara.domain_events where firm_id = $1 and event_type = 'books.baseline'",
      [f],
    );
    assert.equal(b.rows[0].n, 1, `firm ${f} has exactly one books.baseline after cutover`);
    assert.equal(b.rows[0].firm_level, true, "books.baseline is firm-level (client_id null)");
    assert.equal(b.rows[0].sys, true, "books.baseline actor is null (a system/migration event)");
  }
  // The counter bootstrapped for the firm.
  const counter = await rootQuery("select n::int as n from clara.firm_event_seq where firm_id = $1", [firm]);
  assert.ok(counter.rows[0] && counter.rows[0].n >= 1, "firm_event_seq bootstrapped at cutover");

  // 4b. Packs are coherent: approval_history comes from the BASE tables (the log begins
  //     at the baseline), and the token is the freshly-staled cutover edition.
  const pack = await contextPack(owner, client, "post-cutover");
  assert.ok(pack, "a pack is returned after cutover");
  assert.ok(Array.isArray(pack.approval_history) && pack.approval_history.length >= 1, "approval_history carries the pre-0005 approved entry (from base tables)");
  assert.equal(Number(pack.books_version), await maxSeq(firm), "books_version = the firm's max seq (staled once at cutover)");

  // 4c. Subsequent writes emit from then on.
  const m = await maxSeq(firm);
  const res2 = await freshResolution(owner, client);
  const d2 = await draftEntry(human(owner), { client, resolution: res2, lines: balanced({ cash: "1000", sales: "4000" }, ROUTINE_CENTS), opKey: opk() });
  const ev = await eventsSince(firm, m);
  assert.ok(ev.some((e) => e.event_type === "client.resolved"), "record_client_resolution emits after cutover");
  assert.ok(ev.some((e) => e.event_type === "entry.drafted" && e.entry_id === d2.entry_id), "draft_entry emits after cutover");
});
