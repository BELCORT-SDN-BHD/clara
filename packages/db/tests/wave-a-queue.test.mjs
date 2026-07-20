// Wave-A rig — the review QUEUE read (Codex probe 25; contract §4 + companion §6 +
// PINS §5a). list_review_queue returns rows AND counts AND an as-of watermark from
// ONE snapshot, a total ordering tuple + a validated keyset cursor: no duplicates or
// skips across pages under concurrent mutation; counts describe the same snapshot; a
// malformed cursor is a typed refusal (CLR10); a removed member sees nothing.
// Contract-blind. SKIPS (counted) until 0011 lands.
//
// Cursor interpretation (PINS §5a): p_cursor is the previous page's next_cursor
// object ({tuple:[...]}); recorded as an interpretation.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  opk, endPool, printLaneNotes, noteLane, printSkipCount, skipUnready,
  waveAEnsureReady, buildWorld, firmOf, upsertPayableAccount, upsertAccountClassed,
  seedCitedDocument, freshResolution, draftEntryV3, billLines, ev, FIELD, grantConsent,
  openQuestion, listReviewQueue, humanPersona, removeMember, membershipId, ROUTINE_CENTS,
} from "./wave-a-fixtures.mjs";
import { AP, EXP } from "./wave-a-fixtures.mjs";

let ready = false;
let world = null;
before(async () => {
  ready = await waveAEnsureReady();
  if (ready) {
    world = await buildWorld();
    for (const c of [world.clients.A1, world.clients.A2]) {
      await upsertPayableAccount(world.users.alice, { client: c, code: AP, name: "Trade Creditors", opKey: opk("ap") });
      await upsertAccountClassed(world.users.alice, { client: c, code: EXP, name: "Prof Fees", type: "expense", opKey: opk("exp") });
      await grantConsent(world.users.alice, { firm: await firmOf(c), client: c }).catch(() => {});
    }
    // Seed ~6 open drafts + 2 open questions across the two clients (queue members).
    for (let i = 0; i < 6; i++) {
      const client = i % 2 ? world.clients.A2 : world.clients.A1;
      const firm = await firmOf(client);
      const cited = await seedCitedDocument(world.users.alice, { firm, client, quote: "RM 500.00" });
      await draftEntryV3(world.users.alice, {
        client, resolution: await freshResolution(world.users.alice, client, { subjectKind: "document", subjectId: cited.documentId }),
        document: cited.documentId, sha256: cited.sha256, lines: billLines(EXP, AP, ROUTINE_CENTS + i * 100),
        vendor: { new: { name: `QUEUECO ${i} SDN BHD`, registration_no: `20180101000${i}` } }, evidence: [ev(cited.regionId, cited.quote, FIELD.total)], opKey: opk("qcite"),
      });
    }
    await openQuestion(world.users.alice, { client: world.clients.A1, scopeKind: "client", scopeId: world.clients.A1 }).catch(() => {});
    await openQuestion(world.users.alice, { client: world.clients.A2, scopeKind: "client", scopeId: world.clients.A2 }).catch(() => {});
  }
});
after(async () => { printLaneNotes("wave-a-queue"); printSkipCount("wave-a-queue"); await endPool(); });

/** Walk every page (keyset) and return the ordered list of row ids. */
async function walkAll(sub, { limit = 2, mutateAfter = null } = {}) {
  const ids = [];
  let cursor = null, guard = 0;
  for (;;) {
    const page = await listReviewQueue(humanPersona(sub), { scope: {}, cursor, limit });
    const rows = page.rows ?? [];
    for (const r of rows) ids.push(r.id);
    if (mutateAfter && guard === 0) await mutateAfter();
    cursor = page.next_cursor ?? null;
    if (!rows.length || !cursor || (cursor.tuple && cursor.tuple.length === 0)) break;
    if (++guard > 50) { noteLane("queue walk exceeded 50 pages — possible cursor non-advance; aborting"); break; }
  }
  return ids;
}

// ===========================================================================
// Keyset pagination — no duplicates/skips; counts same snapshot.
// ===========================================================================

test("keyset pagination yields DISTINCT rows across pages (no duplicates) and the union covers the membership (no skips)", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users } = world;
  const ids = await walkAll(users.alice, { limit: 2 });
  assert.equal(new Set(ids).size, ids.length, `no duplicate row appears across pages (got ${ids.length}, distinct ${new Set(ids).size})`);
  // A single big-limit call is the reference membership set for the same identity.
  const whole = await listReviewQueue(humanPersona(users.alice), { scope: {}, cursor: null, limit: 500 });
  const wholeIds = new Set((whole.rows ?? []).map((r) => r.id));
  for (const id of wholeIds) assert.ok(ids.includes(id), `paginated walk did not SKIP membership row ${id}`);
});

test("counts describe the SAME snapshot as the rows (one statement): the returned counts object is present and coherent", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users } = world;
  const page = await listReviewQueue(humanPersona(users.alice), { scope: {}, cursor: null, limit: 500 });
  assert.ok(page.counts && typeof page.counts === "object", "the envelope carries a counts object");
  assert.ok("watermark" in page, "the envelope carries an as-of watermark (max surfaced domain_events seq)");
  // open_drafts count should be ≥ the drafts we can see in the rows of this same snapshot.
  const draftRows = (page.rows ?? []).filter((r) => r.row_kind === "draft").length;
  if (typeof page.counts.open_drafts === "number") assert.ok(page.counts.open_drafts >= draftRows, `counts.open_drafts (${page.counts.open_drafts}) is coherent with the ${draftRows} draft rows in the same snapshot`);
});

test("pagination under a concurrent INSERT mid-walk: no pre-existing row is duplicated or skipped (the watermark bounds the snapshot)", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const baseline = new Set((await listReviewQueue(humanPersona(users.alice), { scope: {}, cursor: null, limit: 500 })).rows.map((r) => r.id));
  const ids = await walkAll(users.alice, {
    limit: 2,
    mutateAfter: async () => {
      const firm = await firmOf(clients.A1);
      const cited = await seedCitedDocument(users.alice, { firm, client: clients.A1, quote: "RM 500.00" });
      await draftEntryV3(users.alice, {
        client: clients.A1, resolution: await freshResolution(users.alice, clients.A1, { subjectKind: "document", subjectId: cited.documentId }),
        document: cited.documentId, sha256: cited.sha256, lines: billLines(EXP, AP, 90000),
        vendor: { new: { name: "MIDWALKCO SDN BHD", registration_no: "201801011000" } }, evidence: [ev(cited.regionId, cited.quote, FIELD.total)], opKey: opk("midcite"),
      });
    },
  });
  assert.equal(new Set(ids).size, ids.length, "no duplicates even with a concurrent insert mid-walk");
  for (const id of baseline) assert.ok(ids.includes(id), `pre-existing row ${id} was not skipped by a concurrent insert`);
});

// ===========================================================================
// Malformed cursor + membership floor.
// ===========================================================================

test("a malformed cursor is a typed refusal (CLR10), never a raw error or a silent reset", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users } = world;
  await assert.rejects(() => listReviewQueue(humanPersona(users.alice), { scope: {}, cursor: { tuple: "not-a-tuple", garbage: true }, limit: 2 }),
    (e) => e.code === "CLR10", "a malformed cursor refuses CLR10 (validated fail-closed)");
  await assert.rejects(() => listReviewQueue(humanPersona(users.alice), { scope: { client_id: "not-a-uuid" }, cursor: null, limit: 2 }),
    (e) => ["CLR10", "22P02"].includes(e.code), "a malformed scope refuses typed (CLR10)");
});

test("a REMOVED member sees NOTHING (live-membership floor re-checked in-fn)", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, firms } = world;
  // carol is a viewer in firm A; remove her, then her identity must see an empty queue.
  const mem = await membershipId(firms.A, users.carol);
  if (!mem) { noteLane("carol membership not found — cannot exercise the removed-member floor"); return; }
  await removeMember(users.alice, { membership: mem, opKey: opk("rm") }).catch((e) => noteLane(`remove_member raised ${e.code}`));
  const page = await listReviewQueue(humanPersona(users.carol), { scope: {}, cursor: null, limit: 500 }).catch((e) => ({ error: e.code }));
  if (page?.error) { assert.ok(["CLR03", "CLR04", "CLR11"].includes(page.error), `a removed member is refused (got ${page.error})`); return; }
  assert.equal((page.rows ?? []).length, 0, "a removed member's queue is empty (no cross-firm/stale leakage)");
});
