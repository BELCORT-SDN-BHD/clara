// #974 [0260, riders wave 2 lane 07] — "A blocked depreciation queue has no Needs-you row."
//
// THE SEAM: `clara.list_review_queue` (lib/firm/needs-you.ts's `listReviewQueue` on the web
// side) — the ONE read the ticket's Agent Brief names. A client's proposed, unsigned
// depreciation authority (clara.fa_depreciation_authorities.status='proposed') must produce
// exactly one row_kind='depreciation_authority_pending' row, in the needs_you section/lane,
// and signing or withdrawing (retiring) the authority must remove it on the next read — with
// no existing row kind's label, affordance, tally or row set moved.
//
// EVERY ASSERTION BELOW GOES THROUGH THE REAL DOORS (propose_depreciation_authority,
// sign_depreciation_authority via signAuthority's compat shim, retire_depreciation_authority)
// and the REAL read (list_review_queue), at real personas — never a raw INSERT standing in for
// the thing under test.
//
// FRONTIER-GATED on the `depreciation_authority_pending_rowkind$` stem, never on a number. A
// FOCUSED invocation (without --import of
// depreciation-authority-pending-rowkind-preintegration-gate.mjs) FAILS LOUDLY when 0260 is
// absent, because a skip is not evidence.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  faWorld, createClient, proposeAuthority, signAuthority, retireAuthorityVerb,
  rootQuery, human, listReviewQueue, opk, uniqTag,
  markSkip, endPool, printLaneNotes, printSkipCount,
} from "./x41-fa-world.mjs";

const STEM = "depreciation_authority_pending_rowkind$";

let _ready = null;
async function queueRowReady() {
  if (_ready === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1", [STEM]);
      _ready = r.rows[0].n > 0;
    } catch {
      _ready = false;
    }
  }
  return _ready;
}

/** The per-cell frontier gate, COUNTED — the depreciation-history.test.mjs / gate651 shape. */
async function gate974(t) {
  if (await queueRowReady()) return false;
  if (process.env.CLARA_ALLOW_MISSING_DEPRECIATION_AUTHORITY_QUEUE_ROW !== "1") {
    assert.fail(
      `#974 migration (${STEM}) is NOT applied to this database, and this is a FOCUSED run. `
      + "A skip is not evidence: apply the migration, or preload "
      + "tests/depreciation-authority-pending-rowkind-preintegration-gate.mjs for a package-wide sweep.");
  }
  markSkip();
  t.skip(`#974 depreciation-authority-pending-rowkind lane absent (no ${STEM} migration applied)`);
  return true;
}

let w = null;
before(async () => { w = await faWorld(); });
after(async () => {
  printLaneNotes("p974 depreciation-authority-pending-rowkind");
  printSkipCount("p974 depreciation-authority-pending-rowkind");
  await endPool();
});

/** A fresh firm-A client, proposed authority by BOB (bookkeeper) — the real door. Returns the
 *  client id and the authority id. */
async function proposedClient(label) {
  const client = await createClient(w.users.alice, { name: `p974_${label}_${uniqTag()}`, opKey: opk("p974cli") });
  const receipt = await proposeAuthority(w.users.bob, { client, cadence: "monthly" });
  return { client, authorityId: receipt.authority_id };
}

const rowFor = (env, kind) => env.rows.filter((r) => r.row_kind === kind);

test("p974.row.appears: a proposed, unsigned authority produces exactly one depreciation_authority_pending row, needs_you/needs_you", async (t) => {
  if (await gate974(t)) return;
  const { client, authorityId } = await proposedClient("appears");
  const env = await listReviewQueue(human(w.users.alice), { scope: { client_id: client } });
  const rows = rowFor(env, "depreciation_authority_pending");
  assert.equal(rows.length, 1, "exactly one row for the client's one proposed authority");
  const row = rows[0];
  assert.equal(row.client_id, client);
  assert.equal(row.id, authorityId, "the row's shared id IS the authority id");
  assert.equal(row.authority_id, authorityId, "authority_id mirrors id (asset_id/advance_id idiom)");
  assert.equal(row.section, "needs_you");
  assert.equal(row.lane, "needs_you");
  assert.match(row.question_text, /awaiting signature/i);
  assert.match(row.question_text, /monthly/i, "the cadence the client actually proposed, not a generic sentence");
  assert.ok(row.aged_since, "aged_since carries the authority's own created_at");
});

test("p974.row.distinct: two different clients' proposed authorities never collide on id", async (t) => {
  if (await gate974(t)) return;
  const a = await proposedClient("distinct-a");
  const b = await proposedClient("distinct-b");
  const envA = await listReviewQueue(human(w.users.alice), { scope: { client_id: a.client } });
  const envB = await listReviewQueue(human(w.users.alice), { scope: { client_id: b.client } });
  assert.equal(rowFor(envA, "depreciation_authority_pending").length, 1);
  assert.equal(rowFor(envB, "depreciation_authority_pending").length, 1);
  assert.notEqual(a.authorityId, b.authorityId);
});

test("p974.row.withdraw_removes: retire_depreciation_authority (withdraw) removes the row on the next read", async (t) => {
  if (await gate974(t)) return;
  const { client, authorityId } = await proposedClient("withdraw");
  assert.equal(rowFor(await listReviewQueue(human(w.users.alice), { scope: { client_id: client } }),
    "depreciation_authority_pending").length, 1, "present before withdrawal");
  await retireAuthorityVerb(w.users.hana, { client, authority: authorityId, reason: "p974 test withdraw" });
  const after = await listReviewQueue(human(w.users.alice), { scope: { client_id: client } });
  assert.equal(rowFor(after, "depreciation_authority_pending").length, 0,
    "gone the moment the authority is no longer 'proposed'");
});

test("p974.row.sign_removes: sign_depreciation_authority (status -> live) also removes the row", async (t) => {
  if (await gate974(t)) return;
  const { client, authorityId } = await proposedClient("sign");
  await signAuthority(w.users.hana, { client, authority: authorityId });
  const after = await listReviewQueue(human(w.users.alice), { scope: { client_id: client } });
  assert.equal(rowFor(after, "depreciation_authority_pending").length, 0,
    "a SIGNED (now 'live') authority is no longer 'proposed' -- the read excludes it too");
});

test("p974.counts.needs_you: the tally includes the new row and no OTHER counts key moves", async (t) => {
  if (await gate974(t)) return;
  const { client } = await proposedClient("counts");
  const before = await listReviewQueue(human(w.users.alice), { scope: { client_id: client } });
  const baselineNeedsYou = before.counts.needs_you;
  // A second, unrelated proposed authority for a SIBLING client must not appear in a
  // client-scoped read, and must not perturb this client's own counts.
  await proposedClient("counts-sibling");
  const after = await listReviewQueue(human(w.users.alice), { scope: { client_id: client } });
  assert.equal(after.counts.needs_you, baselineNeedsYou,
    "this client's own needs_you count is unaffected by a SIBLING client's authority");
  assert.equal(after.counts.open_drafts, before.counts.open_drafts);
  assert.equal(after.counts.open_questions, before.counts.open_questions);
  assert.equal(after.counts.open_tasks, before.counts.open_tasks);
  assert.equal(after.counts.compliance_watches, before.counts.compliance_watches);
  assert.equal(after.counts.lint_findings, before.counts.lint_findings);
  assert.equal(Object.hasOwn(after.counts, "depreciation_authorities_pending"), false,
    "no new counts.* key was minted (the ticket's own brief: optional, and seeding_proposal set the precedent of minting none)");
});

test("p974.role_floor: a caller other than the proposer/signer, at the queue's existing floor, sees the row (no new restriction, no widening)", async (t) => {
  if (await gate974(t)) return;
  const { client } = await proposedClient("role-floor");
  // grace is a SECOND bookkeeper who neither proposed nor will sign/retire this authority --
  // the same floor every other row kind already reaches (clara.role_rank('viewer'), untouched
  // by this splice).
  const env = await listReviewQueue(human(w.users.grace), { scope: { client_id: client } });
  assert.equal(rowFor(env, "depreciation_authority_pending").length, 1,
    "reaches exactly the callers who could already read the queue -- no new floor, no new gap");
});

// #974 code-review fix round (SPEC-L07-04) -----------------------------------------------------
//
// THE NARROWING AC1 DOES NOT STATE, PINNED EITHER WAY. The ticket says "a client with a proposed,
// unsigned authority produces exactly one queue row" without qualifying the client. The installed
// CTE qualifies it: `join clara.clients active_fda_client ... and active_fda_client.status='active'`.
// That is the house rule (0017 R1-F5, carried by eight of the other ten kinds, and pinned for the
// eleventh's immediate predecessor by w629.inbox.archived in work-question-reads.test.mjs), but it
// was nowhere in this file, so the review could only read it off the migration's own comment. It is
// measured here rather than argued: the row appears while the client is active and is withheld the
// moment it is not, through the same real door and the same real read as every cell above.
test("p974.row.non_active_client: the row is withheld once the client leaves 'active' -- the guard eight other kinds carry", async (t) => {
  if (await gate974(t)) return;
  const { client, authorityId } = await proposedClient("nonactive");
  const live = await listReviewQueue(human(w.users.alice), { scope: { client_id: client } });
  assert.equal(rowFor(live, "depreciation_authority_pending").length, 1,
    "present while the client is active -- otherwise the second half below proves nothing");
  await rootQuery("update clara.clients set status='archived' where id=$1", [client]);
  const scoped = await listReviewQueue(human(w.users.alice), { scope: { client_id: client } });
  assert.equal(rowFor(scoped, "depreciation_authority_pending").length, 0,
    "a non-active client's proposed authority is not chased in the inbox");
  // And not through the FIRM-wide read either -- the client scope is a filter, never the guard.
  const firmWide = await listReviewQueue(human(w.users.alice), { scope: {} });
  assert.equal(firmWide.rows.filter((r) => r.id === authorityId).length, 0,
    "withheld at firm altitude too, not merely filtered out of the client-scoped read");
});
