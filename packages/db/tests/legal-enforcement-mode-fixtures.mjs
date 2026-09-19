// #1008 — THE PLATFORM'S LEGAL ENFORCEMENT MODE: the battery's frontier gate, door wrappers and
// readers (NOT a test file: the name does not end in `.test.mjs`, so `node --test` ignores it).
//
// THE RULING THIS ENCODES. The owner ruled on 2026-09-20 that during the beta the state of a
// firm's agreements must never switch a capability off: "现在是beta phase, 我要所有东西都可以用和
// test, 这些东西反而是最不重要的, 正式发布前我会和律师核对, 你不要DARk东西了". Migration
// 0234_legal_enforcement_mode.sql gives the platform ONE mode with TWO values and leaves it at
// `prompt`:
//
//   enforce  — 0195's own rule, unchanged: ONE active owner of the firm holding acceptances of
//              the CURRENTLY PUBLISHED version of BOTH kinds, and an active client.
//   prompt   — an ACTIVE client of the firm, and an ACTIVE OWNER of the firm who holds at least
//              ONE REAL `clara.legal_acceptances` row (either kind, at any version). The
//              acceptance the basis CITES is that owner's most recent DPA acceptance when one
//              exists, otherwise their most recent Terms acceptance. No published version is
//              required to exist. A firm whose active owner has never accepted ANYTHING is still
//              not live — prompt relaxes currency and completeness, it never manufactures a
//              citation.
//
// THE WIRE CONTRACT THIS MODULE ENCODES:
//
//   clara.set_legal_enforcement_mode(p_mode, p_reason, p_op_key)
//        -> {status, mode, previous_mode, reason, updated_at}
//   clara.get_legal_enforcement_mode()
//        -> {mode, reason, updated_at, updated_by}
//   clara.get_firm_legal_standing()          -> …, enforcement_mode
//   clara._legal_enforcement_mode()          -> text (UNGRANTED; the one body every wall reads)
//
// WHY THE MODE IS ARRANGED AT ROOT IN MOST CELLS, AND THROUGH THE DOOR IN ITS OWN. The write door
// is floored on the OPERATOR FIRM's owner, and the estate admits exactly ONE operator firm at a
// time (`uq_firms_one_operator`, claimed through `claimOperatorFirm`'s bounded take). Driving
// every cell's arrangement through that door would serialise this whole battery behind a global
// lock other files also take. So the mode is ARRANGED by a LABELLED root UPDATE — the same
// disposition `publishNextVersion` carries for `clara.legal_documents` — and the DOOR itself is
// exercised by the cells that are about the door: its floor, its replay, its receipt and its
// vocabulary. Nothing under test is arranged by root DML.

import { randomUUID } from "node:crypto";
import {
  rootQuery, humanQuery, namedCall, opk, insertUser, seedAdmission, createFirm, createClient,
  ROLES, withActor,
} from "./rig-fixtures.mjs";
import { markSkip } from "./wave-a-helpers.mjs";

// ===========================================================================================
// 1 · The #1008 frontier gate — keyed on the migration's STABLE STEM, never its number.
// ===========================================================================================

/** The #1008 migration's STABLE STEM. */
export const ENFORCEMENT_STEM = "legal_enforcement_mode$";

/** The two values, spelled once. */
export const MODE_PROMPT = "prompt";
export const MODE_ENFORCE = "enforce";

/** The door's own typed refusal reasons, spelled once. */
export const ENFORCEMENT_REASON = {
  notOperatorFirm: "not_operator_firm",
  invalidOpKey: "invalid_op_key",
  invalidMode: "invalid_mode",
  reasonRequired: "reason_required",
  reasonTooLong: "reason_too_long",
  opKeyConflict: "op_key_conflict",
  rowMissing: "enforcement_row_missing",
};

let _ready = null;
export async function enforcementLaneReady() {
  if (_ready === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1",
        [ENFORCEMENT_STEM]);
      _ready = r.rows[0].n > 0;
    } catch {
      _ready = false;
    }
  }
  return _ready;
}

/** `if (await gateEnforcement(t)) return;` — the house per-cell frontier gate, COUNTED.
 *
 *  A FOCUSED invocation must never skip silently: this battery's own premise check lives in the
 *  test file's `before`, which throws unless `CLARA_ALLOW_MISSING_LEGAL_ENFORCEMENT_MODE=1` is
 *  preloaded by the estate sweep's gate module. */
export async function gateEnforcement(t) {
  if (await enforcementLaneReady()) return false;
  markSkip();
  t.skip(`#1008 legal enforcement mode absent (no ${ENFORCEMENT_STEM} migration applied)`);
  return true;
}

// ===========================================================================================
// 2 · The two doors, named arguments only.
// ===========================================================================================

export async function setEnforcementMode(sub, { mode, reason = "#1008 rig", opKey = null } = {}) {
  const r = await humanQuery(sub, namedCall("set_legal_enforcement_mode", [
    { name: "p_mode", cast: "text" }, { name: "p_reason", cast: "text" },
    { name: "p_op_key", cast: "text" },
  ]), [mode, reason, opKey ?? opk("w1008-mode")]);
  return r.rows[0].result;
}

export async function getEnforcementMode(sub) {
  const r = await humanQuery(sub, "select clara.get_legal_enforcement_mode() as result");
  return r.rows[0].result;
}

// ===========================================================================================
// 3 · Arrangement and readers. Every root call here is a LABELLED fixture, never the thing
//     under test.
// ===========================================================================================

/** LABELLED FIXTURE DML (root): put the platform in `mode` without the operator-firm ceremony.
 *  `clara.legal_enforcement` carries FORCE ROW LEVEL SECURITY and a single `clara_fn_owner`
 *  policy with no application-role grant at all, so there is no other way for a test to arrange
 *  it — which is exactly the posture `p1008.db.relation_posture` asserts. */
export async function forceMode(mode) {
  await rootQuery(
    "update clara.legal_enforcement set mode = $1, reason = $2 where id",
    [mode, `#1008 rig fixture ${randomUUID().slice(0, 8)}`]);
}

/** The stored row, read at root — the doors mask nothing, but a cell that wants to pin the
 *  RELATION rather than the door's answer reads it here. */
export async function storedEnforcement() {
  const r = await rootQuery(
    "select mode, reason, updated_by, updated_at from clara.legal_enforcement where id");
  return r.rows[0] ?? null;
}

/** The DERIVED BASIS itself, read at root. `clara._accounting_work_egress_live` is UNGRANTED by
 *  design (0195:911) — a per-client answer is an existence oracle for another firm's books — so
 *  the only lawful reader is a definer body, and the only test reader is the superuser. */
export async function egressBasis(firm, client) {
  const r = await rootQuery(
    "select clara._accounting_work_egress_live($1::uuid, $2::uuid) as basis", [firm, client]);
  return r.rows[0].basis;
}

/** The ungranted mode predicate, read at root. */
export async function predicateMode() {
  const r = await rootQuery("select clara._legal_enforcement_mode() as mode");
  return r.rows[0].mode;
}

/** A firm of its own, with an owner who has accepted NOTHING. `clara.legal_acceptances` is keyed
 *  on the PERSON and `clara.legal_documents` is GLOBAL, so a cell that needs a particular
 *  acceptance shape needs a fresh person — sharing one would share the shape. */
export async function virginFirm(tag) {
  const owner = await insertUser("p1008", `${tag}_owner`);
  const token = await seedAdmission(`p1008-${tag}`);
  const firm = await createFirm(owner, {
    name: `P1008 ${tag} ${randomUUID().slice(0, 8)}`, token, opKey: opk(`p1008_firm_${tag}`),
  });
  const client = await createClient(owner, {
    name: `p1008_${tag}_client_${randomUUID().slice(0, 8)}`, opKey: opk(`p1008_cli_${tag}`),
  });
  return { tag, firm, owner, client };
}

/** The CURRENT published version + bytes of one legal kind, or null. */
export async function publishedLegal(kind) {
  const r = await rootQuery(
    "select version, body_sha256 from clara.legal_documents where kind=$1 and status='published'",
    [kind]);
  return r.rows[0] ?? null;
}

/** Accept ONE published kind as `sub`, through the estate's own governed door (0185:684). This
 *  is how a rig person acquires a REAL acceptance row: never by a root insert, because the whole
 *  point of #1008's AC3 is that no cell, door or migration invents one. */
export async function acceptKind(sub, kind, { opKey = null } = {}) {
  const doc = await publishedLegal(kind);
  if (doc === null) throw new Error(`fixture: no PUBLISHED ${kind} document to accept`);
  const r = await humanQuery(sub, namedCall("accept_legal_document", [
    { name: "p_kind", cast: "text" }, { name: "p_version", cast: "integer" },
    { name: "p_body_sha256", cast: "text" }, { name: "p_op_key", cast: "text" },
  ]), [kind, doc.version, doc.body_sha256, opKey ?? opk(`p1008-acc-${kind}`)]);
  return { receipt: r.rows[0].result, version: doc.version };
}

/** The acceptance rows one person holds, newest version first per kind. */
export async function acceptancesOf(user) {
  const r = await rootQuery(
    "select id, kind, version, accepted_at from clara.legal_acceptances where user_id=$1 order by kind, version",
    [user]);
  return r.rows;
}

/** Publish a NEWER version of one kind — the estate's own supersession, and the act that
 *  withdraws every firm's authority under `enforce`. LABELLED FIXTURE DML (root):
 *  `clara.publish_legal_document` is floored on the OPERATOR firm, and minting an operator firm
 *  to exercise a CONSEQUENCE of publication would put a second, irrelevant authority inside the
 *  cell. `checkout-gate-c1.test.mjs:393`, `firm-commercial-settings-fixtures.mjs` and
 *  `work-egress-fixtures.mjs` all move the shelf exactly this way. */
export async function publishNextVersion(kind) {
  const cur = await rootQuery(
    "select coalesce(max(version), 0)::int as v from clara.legal_documents where kind = $1", [kind]);
  const version = cur.rows[0].v + 1;
  const body = `P1008 rig ${kind} v${version} — fixture text, not a legal document.`;
  await rootQuery(
    "update clara.legal_documents set status = 'superseded' where kind = $1 and status = 'published'",
    [kind]);
  await rootQuery(
    `insert into clara.legal_documents(kind, version, status, title, body, body_sha256,
       source_path, effective_from, published_at)
     values ($1, $2, 'published', $3, $4, encode(sha256(convert_to($4,'UTF8')),'hex'), $5, now(), now())`,
    [kind, version, `P1008 ${kind} v${version}`, body, `rig/p1008/${kind}-v${version}.md`]);
  return version;
}

/** The standing door, as `sub`. */
export async function legalStanding(sub) {
  const r = await humanQuery(sub, "select clara.get_firm_legal_standing() as result");
  return r.rows[0].result;
}

/** How many audit rows the estate carries for one fn name in one firm. */
export async function auditRows(firm, fn) {
  const r = await rootQuery(
    "select actor, args, at from clara.audit_log where firm_id=$1 and fn=$2 order by at", [firm, fn]);
  return r.rows;
}

/** Catalog posture for one routine, by EXACT signature (law 3). */
export async function routinePosture(sig) {
  const r = await rootQuery(
    `select pg_get_userbyid(p.proowner) as owner, p.prosecdef as secdef,
            coalesce(array_to_string(p.proconfig,','),'<none>') as config,
            coalesce(array_to_string(p.proacl,','),'<null>') as acl,
            encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as sha
       from pg_proc p where p.oid = to_regprocedure($1)`, [sig]);
  return r.rows[0] ?? null;
}

/** One person's ACTIVE membership row in one firm. The three member doors (`add_member`,
 *  `set_member_role`, `remove_member`) take the MEMBERSHIP id, never the (firm, person) pair, so a
 *  cell that wants to demote or remove somebody has to look it up. A root READ, not DML. */
export async function membershipOf(firm, user) {
  const r = await rootQuery(
    `select id, role, status from clara.firm_memberships
      where firm_id = $1 and user_id = $2 and status = 'active'`, [firm, user]);
  return r.rows[0] ?? null;
}

// ===========================================================================================
// 4 · THE CONCURRENT FIRST DISPATCH, MADE DETERMINISTIC.
// ===========================================================================================

/** TWO FIRST DISPATCHES FOR ONE CLIENT, PROVABLY INSIDE EACH OTHER'S MINT WINDOW.
 *
 *  A bare `Promise.all([prepare(), prepare()])` is NOT this race and must not be mistaken for it:
 *  MEASURED on the rehearsal rig (fix round 1), the first call commits before the second's
 *  `not exists` guard runs, so the second never enters the mint arm at all — that pair stays green
 *  even against a `prepare_egress_dispatch` whose `on conflict do nothing` has been DELETED, which
 *  is the one defect the cell exists to catch.
 *
 *  So the window is FORCED, in `withWorkRowLocked`'s own two-connection shape: session A opens a
 *  transaction and mints WITHOUT committing; session B then enters the same arm, sees no committed
 *  consent and BLOCKS on `uq_client_egress_purpose_consents_one_live` behind A's uncommitted
 *  tuple. The block is OBSERVED in `pg_stat_activity` from a third session before A is allowed to
 *  commit, and `blocked` comes back with the two verdicts so the cell can assert the contention
 *  actually happened rather than trust the scheduler. Both sessions carry a `statement_timeout`,
 *  so a wall that never lifts fails the cell instead of hanging the battery. */
export async function racedFirstDispatch({ firm, client, seqA, seqB, timeoutMs = 15000 }) {
  const call = namedCall("prepare_egress_dispatch", [
    { name: "p_firm", cast: "uuid" }, { name: "p_client", cast: "uuid" },
    { name: "p_purpose", cast: "text" }, { name: "p_event_seq", cast: "bigint" },
    { name: "p_event_type", cast: "text" }, { name: "p_document_sha256", cast: "text" },
  ]);
  const args = (seq) => [firm, client, "accounting_work", String(seq), "work.segment", null];

  let minted = null; const aMinted = new Promise((r) => { minted = r; });
  let release = null; const aHeld = new Promise((r) => { release = r; });
  let a = null; let b = null; let blocked = false;

  const runA = withActor({ role: ROLES.runtime }, async (c) => {
    await c.query(`set statement_timeout = ${Number(timeoutMs)}`);
    await c.query("begin");
    a = (await c.query(call, args(seqA))).rows[0].result;
    minted();                              // …minted, and NOT committed
    await aHeld;
    await c.query("commit");
  });
  runA.catch(() => {});                     // awaited below; this only silences the early-reject warning

  let runB = null;
  try {
    await Promise.race([aMinted, runA]);    // if A fails before it mints, fail here, not in a hang
    runB = withActor({ role: ROLES.runtime }, async (c) => {
      await c.query(`set statement_timeout = ${Number(timeoutMs)}`);
      await c.query("begin");
      b = (await c.query(call, args(seqB))).rows[0].result;
      await c.query("commit");
    });
    runB.catch(() => {});
    // OBSERVE THE CONTENTION from a THIRD session rather than assuming the scheduler produced it.
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline && !blocked) {
      const w = await rootQuery(
        `select count(*)::int as n from pg_stat_activity
          where datname = current_database() and wait_event_type = 'Lock'
            and query ilike '%prepare_egress_dispatch%'`);
      if (w.rows[0].n > 0) blocked = true;
      else await new Promise((r) => { setTimeout(r, 25); });
    }
  } finally {
    release();
    await runA;
    if (runB) await runB;
  }
  return { a, b, blocked };
}
