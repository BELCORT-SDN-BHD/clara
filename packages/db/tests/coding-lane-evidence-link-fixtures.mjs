// #718 — THE DOCUMENT-CODING LANE'S EVIDENCE-LINK LOOKBACK: this battery's extra gate, its
// coding-lane wrappers and the two-session drivers (NOT a test file: the name does not end in
// `.test.mjs`).
//
// It sits BESIDE `journal-work-evidence-fixtures.mjs` (#634 / 0182) and re-exports it, because
// every cell here needs BOTH lanes in one world: the accounting-work evidence lane (0182's doors)
// and the document-coding lane (`draft_entry` -> `approve_entry`). #718's migration is its own
// frontier, so its gate is separate — a database pinned between 0182 and it must SKIP rather than
// fail.
//
// THE WIRE CONTRACT THIS MODULE ENCODES (from ticket #718's acceptance criteria, never by reading
// the migration):
//
//   approving a coded entry whose document already holds a LIVE clara.entry_evidence_links row
//   refuses CLR13 with detail.reason = 'source_already_posted' and detail.entry_id naming the
//   entry that already stands there — the same pair clara.admit_journal_work and
//   clara.attach_entry_evidence already raise from the other side.

import { rootQuery, opk, ROLES } from "./journal-work-evidence-fixtures.mjs";
import { approveEntry, freshResolution } from "./rig-fixtures.mjs";
import { draftEntryV3, filedDocument } from "./s6-helpers.mjs";
import { getPool } from "./rig-helpers.mjs";
import { markSkip } from "./wave-a-helpers.mjs";

export * from "./journal-work-evidence-fixtures.mjs";
export { draftEntryV3, filedDocument };

// ===========================================================================================
// 1 · The #718 frontier gate — keyed on the migration's STABLE STEM, never its number.
// ===========================================================================================

/** The #718 migration's STABLE STEM. */
export const CODING_LINK_STEM = "coding_lane_evidence_link$";

let _ready = null;
export async function codingLinkLaneReady() {
  if (_ready === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1",
        [CODING_LINK_STEM]);
      _ready = r.rows[0].n > 0;
    } catch {
      _ready = false;
    }
  }
  return _ready;
}

/** `if (await gateCodingLink(t)) return;` — the house per-cell frontier gate, counted skip. */
export async function gateCodingLink(t) {
  if (await codingLinkLaneReady()) return false;
  markSkip();
  t.skip(`#718 coding-lane lookback absent (no ${CODING_LINK_STEM} migration applied)`);
  return true;
}

// #821
// THE OPENING LANE'S OWN FRONTIER. #821 widens the SAME two triggers to admit opening rows and
// branches inside `clara._tf_source_binding_wall`, so a database carrying 0197 but not this
// migration answers the OLD way — its cells and the structural census's new half must SKIP there
// rather than red, exactly as the #718 cells skip below 0197.
export const OPENING_WALL_STEM = "opening_balance_evidence_link_wall$";

let _openingReady = null;
export async function openingWallReady() {
  if (_openingReady === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1",
        [OPENING_WALL_STEM]);
      _openingReady = r.rows[0].n > 0;
    } catch {
      _openingReady = false;
    }
  }
  return _openingReady;
}

/** `if (await gateOpeningWall(t)) return;` — the per-cell frontier gate, counted skip. */
export async function gateOpeningWall(t) {
  if (await openingWallReady()) return false;
  markSkip();
  t.skip(`#821 opening-lane evidence-link wall absent (no ${OPENING_WALL_STEM} migration applied)`);
  return true;
}
// #821

// #1014
// THE BINDING-CLAIM FRONTIER. #1014 repairs the one arrival order #854 measured open (an evidence
// attachment holding the document lock, an opening approval blocking on it, and BOTH committing)
// by giving `clara._lock_document_binding` a CLAIM the serializable side cannot miss. A database
// carrying 0213 but not that migration still answers the OLD way, so the cells that assert the
// repair must SKIP there rather than red — exactly as the #821 cells skip below 0213.
export const BINDING_CLAIM_STEM = "opening_binding_claim$";

let _claimReady = null;
export async function bindingClaimReady() {
  if (_claimReady === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1",
        [BINDING_CLAIM_STEM]);
      _claimReady = r.rows[0].n > 0;
    } catch {
      _claimReady = false;
    }
  }
  return _claimReady;
}

/** `if (await gateBindingClaim(t)) return;` — the per-cell frontier gate, counted skip.
 *
 *  A FOCUSED invocation must never skip silently: the battery's own premise check lives in
 *  `opening-balance-evidence-link.test.mjs`'s `before`, which throws unless
 *  `CLARA_ALLOW_MISSING_OPENING_BINDING_CLAIM=1` is preloaded by the estate sweep's gate module
 *  (`opening-binding-claim-preintegration-gate.mjs`). */
export async function gateBindingClaim(t) {
  if (await bindingClaimReady()) return false;
  markSkip();
  t.skip(`#1014 opening binding claim absent (no ${BINDING_CLAIM_STEM} migration applied)`);
  return true;
}
// #1014

// ===========================================================================================
// 2 · The DOCUMENT-CODING lane, driven through its own two human doors.
//
// A coded entry here carries `document_id` + `filing_id` + `source_doc_sha256` (the trio
// `ck_je_doc_pair` / `ck_je_document_filing_pair` make inseparable) and NO `coding_kind`: the
// supplier-bill/sales shapes drag in counterparty proposals, cited evidence regions and machine
// facts that say nothing about #718. The plain document draft is the SMALLEST entry that reaches
// the lane this ticket is about.
//
// MAKER AND CHECKER ARE DIFFERENT PEOPLE ON PURPOSE — the draft is BOB's (bookkeeper), the
// approval ALICE's (owner). Otherwise clara._approve_entry_core's high-stakes arm decides the
// cell instead of this ticket's wall, and it decides it differently per firm threshold.
// ===========================================================================================

/** A filed, byte-verified document of this client, plus the chart-bound coded DRAFT that cites
 *  it. Returns `{ documentId, filingId, sha256, entry_id, revision_token }`. */
export async function codedDraftOnDocument(maker, { firm, client, chart, cents = 50000,
  document = null }) {
  const doc = document ?? await filedDocument(maker, { firm, client });
  const receipt = await draftEntryV3(maker, {
    client,
    resolution: freshResolution(maker, client,
      { subjectKind: "document", subjectId: doc.documentId }),
    document: doc.documentId,
    sha256: doc.sha256,
    memo: `#718 rig coded draft ${opk("memo")}`,
    lines: [
      { account_code: chart.expense, debit_cents: cents, credit_cents: 0, description: "coded-exp" },
      { account_code: chart.bank, debit_cents: 0, credit_cents: cents, description: "coded-bank" },
    ],
    opKey: opk("w718-draft"),
  });
  return { ...doc, entry_id: receipt.entry_id, revision_token: receipt.revision_token };
}

/** `approve_entry` as a named human. Returns the door's receipt. */
export async function approveCodedEntry(checker, { entry, expectedRevision, opKey = null }) {
  return approveEntry(checker, {
    entry, expectedRevision, opKey: opKey ?? opk("w718-approve"),
  });
}

/** `approve_entry` on a CALLER-SUPPLIED client — the race sides own their own transaction. */
export async function approveCodedEntryOn(client, { entry, expectedRevision, opKey }) {
  const r = await client.query(
    "select clara.approve_entry(p_entry => $1::uuid, p_expected_revision => $2::uuid,"
    + " p_op_key => $3::text) as result",
    [entry, expectedRevision, opKey]);
  return r.rows[0].result;
}

// ===========================================================================================
// 3 · Readers. Root-privileged, because a cell's claim is about what COMMITTED, never about
//     what a door reported.
// ===========================================================================================

/** Every APPROVED, not-reversed entry standing on this document through EITHER lane — the
 *  coding lane's `journal_entries.document_id` and the evidence lane's live link — as one list.
 *  This is the ONE number #718 is about: it must never exceed 1 for a document. */
export async function postedEntriesOnDocument(document) {
  const r = await rootQuery(
    `select distinct e.id, e.status, e.document_id is not null as coded,
            exists (select 1 from clara.entry_evidence_links l
                     where l.entry_id = e.id and l.document_id = $1 and l.released_at is null) as linked
       from clara.journal_entries e
      where e.status = 'approved' and e.reversed_by is null
        and (e.document_id = $1
             or exists (select 1 from clara.entry_evidence_links l2
                         where l2.entry_id = e.id and l2.document_id = $1 and l2.released_at is null))
      order by e.id`, [document]);
  return r.rows;
}

export async function entryStatus(entry) {
  const r = await rootQuery(
    "select status, reversed_by, revision_token from clara.journal_entries where id=$1", [entry]);
  return r.rows[0] ?? null;
}

/** The #718 objects, read off the catalog. */
// #821 · `prosrc` joins the projection because the opening carve-out MOVED: 0197 excluded opening
// rows in the trigger WHEN clauses, #821 admits them and branches inside the body, so the census
// cell can only describe the live inventory if it can read both. The NAME LISTS are unchanged —
// #821 mints no function and no trigger, and recreates the two coding-wall triggers under their
// existing names so their precedence over t_je_immutable / t_period_wall is untouched.
// #821
export async function wallCatalog() {
  const fns = await rootQuery(
    `select p.proname, r.rolname as owner, p.prosecdef, p.prosrc,
            has_function_privilege('public', p.oid, 'execute') as public_exec
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       join pg_roles r on r.oid = p.proowner
      where n.nspname='clara' and p.proname in
        ('_lock_document_binding','_tf_source_binding_wall','_tf_evidence_link_binding_wall')
      order by p.proname`);
  const trg = await rootQuery(
    `select t.tgname, c.relname, (t.tgtype & 2) <> 0 as before_row
       from pg_trigger t join pg_class c on c.oid = t.tgrelid
      where not t.tgisinternal and t.tgname in
        ('t_source_binding_wall_ins','t_source_binding_wall_upd','t_entry_evidence_links_binding_wall')
      order by t.tgname`);
  return { fns: fns.rows, triggers: trg.rows };
}

// ===========================================================================================
// 4 · The HUMAN/HUMAN two-session driver.
//
// `holdThenContend` (0182's fixtures) is wake-credential-on-one-side; #718's race is HUMAN on
// both — an evidence attachment and a coded approval, each a signed-in bookkeeper+. The shared
// shape is kept: side `a` runs and HOLDS its transaction open, side `b` fires and must be PROVEN
// blocked (`wait_event_type = 'Lock'` AND `pg_blocking_pids` naming `a`'s backend) before `a`
// commits. A schedule that never blocked proves nothing about a race, so `provedBlocked` is
// asserted by every cell that uses this.
//
// #854: `side.isolation` (only `"serializable"` is accepted) opens that side's transaction at
// that isolation level instead of the bare `begin` above. `clara.approve_opening_seed` /
// `clara.approve_opening_correction` refuse CLR31 `not_serializable` outside a genuinely
// SERIALIZABLE transaction (0171), so the opening lane cannot be driven through this helper at
// all without it. A SERIALIZABLE side can also lose only at COMMIT (Postgres defers the
// conflict to `40001` there, not to the statement that read the stale snapshot) rather than at
// the statement `b.run()` awaits — `commitOrCapture` below makes that failure visible on the
// SAME `out.a`/`out.b` shape a statement-level refusal already uses, so a cell asserts one
// shape regardless of WHERE Postgres actually raised it.
// ===========================================================================================

const ISOLATION_LEVELS = new Set(["serializable"]);

async function enter(client, side) {
  const pid = (await client.query("select pg_backend_pid() as pid")).rows[0].pid;
  await client.query(`set role ${side.role ?? ROLES.authenticated}`);
  if (side.isolation != null && !ISOLATION_LEVELS.has(side.isolation)) {
    throw new Error(`humanHoldThenContend: unsupported isolation "${side.isolation}"`);
  }
  await client.query(side.isolation ? `begin isolation level ${side.isolation}` : "begin");
  if (side.jwtSub != null) {
    await client.query("select set_config('request.jwt.claims', $1, true)",
      [JSON.stringify({ sub: side.jwtSub, role: "authenticated" })]);
  }
  return pid;
}

async function waitBlockedBy(pid, blockerPid, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    const r = await rootQuery(
      "select wait_event_type as wet, wait_event as we, pg_blocking_pids(pid) as blockers"
      + " from pg_stat_activity where pid = $1", [pid]);
    const row = r.rows[0];
    if (row) last = row;
    if (row && row.wet === "Lock" && (row.blockers || []).map(Number).includes(Number(blockerPid))) {
      return { blocked: true, waitEventType: row.wet, waitEvent: row.we };
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return { blocked: false, waitEventType: last?.wet ?? null, waitEvent: last?.we ?? null };
}

const settle = (e) => ({
  ok: false,
  code: e.code,
  detail: (() => { try { return JSON.parse(e.detail ?? "{}"); } catch { return {}; } })(),
  message: e.message,
});

/** Commits `key`'s side unless it already lost at the statement `run()` awaited; a SERIALIZABLE
 *  side can still fail HERE (Postgres's `40001` is a commit-time discovery, not a statement-time
 *  one), so that failure is folded into the SAME `out[key]` shape a statement-level refusal
 *  already uses — #854, so a cell asserts one shape regardless of where Postgres raised it. */
async function commitOrCapture(client, out, key) {
  if (out[key]?.ok === false) {
    await client.query("rollback").catch(() => {});
    return;
  }
  try {
    await client.query("commit");
  } catch (e) {
    out[key] = settle(e);
    await client.query("rollback").catch(() => {});
  }
}

/** Side `a` runs and holds; side `b` must block on it, then resolve against `a`'s COMMITTED
 *  state. Returns `{ a, b, provedBlocked, waitEventType, waitEvent }`. */
export async function humanHoldThenContend({ a, b }) {
  const c1 = await getPool().connect();
  const c2 = await getPool().connect();
  const out = { a: null, b: null, provedBlocked: false, waitEventType: null, waitEvent: null };
  try {
    const pid1 = await enter(c1, a);
    try {
      out.a = { ok: true, receipt: await a.run(c1) };
    } catch (e) {
      out.a = settle(e);
    }

    const pid2 = await enter(c2, b);
    const p2 = Promise.resolve()
      .then(() => b.run(c2))
      .then((receipt) => { out.b = { ok: true, receipt }; })
      .catch((e) => { out.b = settle(e); });

    const seen = await waitBlockedBy(pid2, pid1);
    out.provedBlocked = seen.blocked;
    out.waitEventType = seen.waitEventType;
    out.waitEvent = seen.waitEvent;
    await commitOrCapture(c1, out, "a");
    await p2;
    await commitOrCapture(c2, out, "b");
  } finally {
    for (const c of [c1, c2]) {
      await c.query("rollback").catch(() => {});
      await c.query("reset role").catch(() => {});
      await c.query("reset all").catch(() => {});
      c.release();
    }
  }
  return out;
}
