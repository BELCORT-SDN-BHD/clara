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
