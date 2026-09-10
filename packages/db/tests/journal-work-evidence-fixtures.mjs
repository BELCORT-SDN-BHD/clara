// #634 — OPTIONAL AND LATE EVIDENCE on the accounting-work journal lane: the battery's extra
// gate, verb wrappers and readers (NOT a test file: the name does not end in `.test.mjs`).
//
// It sits BESIDE `work-journal-fixtures.mjs` rather than inside it: #634's migration is a
// separate frontier from #623's, and the two lanes' cells must be able to skip independently
// when `db-slice-frontiers` runs this package against a database pinned between them.
//
// THE WIRE CONTRACT THIS MODULE ENCODES (all of it derived from ticket #634's own acceptance
// criteria and the C3 contract, never by reading the migration):
//
//   clara.admit_journal_work(..., p_source_refs, ...)   now validates each element and refuses a
//                                                       document already backing a posted entry
//   clara.attach_entry_evidence(p_entry, p_document, p_expected_revision, p_op_key) -> jsonb
//   clara.list_entry_links(p_client, p_entries uuid[])  -> jsonb array

import { rootQuery, humanQuery, opk, BUNDLE_DIGEST, RATIONALE } from "./work-journal-fixtures.mjs";
import { getPool } from "./rig-helpers.mjs";
import { markSkip } from "./wave-a-helpers.mjs";

export * from "./work-journal-fixtures.mjs";

// ===========================================================================================
// 1 · The #634 frontier gate — keyed on the migration's STABLE STEM, never its number.
// ===========================================================================================

/** The #634 migration's STABLE STEM. */
export const EVIDENCE_STEM = "journal_work_evidence$";

let _ready = null;
export async function evidenceLaneReady() {
  if (_ready === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1", [EVIDENCE_STEM]);
      _ready = r.rows[0].n > 0;
    } catch {
      _ready = false;
    }
  }
  return _ready;
}

/** `if (await gateEvidence(t)) return;` — the house per-cell frontier gate, with a COUNTED skip. */
export async function gateEvidence(t) {
  if (await evidenceLaneReady()) return false;
  markSkip();
  t.skip(`#634 journal-evidence lane absent (no ${EVIDENCE_STEM} migration applied)`);
  return true;
}

// ===========================================================================================
// 2 · The vocabulary this battery asserts on. Closed set, exactly as #623's REASON is.
// ===========================================================================================

export const EVIDENCE_REASON = {
  invalidSourceRef: "invalid_source_ref",
  sourceAlreadyPosted: "source_already_posted",
  sourceConflict: "source_conflict",
  evidenceAlreadyAttached: "evidence_already_attached",
  entryNotFound: "entry_not_found",
  entryNotApproved: "entry_not_approved",
  /** LAW 6 leaves a reversed entry `approved`, so `entry_not_approved` does not cover it: the
   *  late door refuses closed history under its own token, naming the correction. */
  entryReversed: "entry_reversed",
  staleRevision: "stale_revision",
  invalidOpKey: "invalid_op_key",
  clientNotFound: "client_not_found",
  tooManyEntries: "too_many_entries",
  operationInFlight: "operation_in_flight",
  operationConflict: "operation_payload_conflict",
};

/** CLR06 is the estate's optimistic-concurrency refusal (`approve_entry`'s revision token). */
export const EVIDENCE_CLR = { stale: "CLR06" };

// ===========================================================================================
// 3 · Verb wrappers. Named arguments only.
// ===========================================================================================

export async function attachEntryEvidence(sub, { entry, document, expectedRevision, opKey = null }) {
  const r = await humanQuery(sub,
    "select clara.attach_entry_evidence(p_entry => $1::uuid, p_document => $2::uuid,"
    + " p_expected_revision => $3::uuid, p_op_key => $4::text) as result",
    [entry, document, expectedRevision, opKey ?? opk("w634-attach")]);
  return r.rows[0].result;
}

export async function listEntryLinks(sub, { client, entries }) {
  const r = await humanQuery(sub,
    "select clara.list_entry_links(p_client => $1::uuid, p_entries => $2::uuid[]) as result",
    [client, entries]);
  return r.rows[0].result;
}

// ===========================================================================================
// 4 · World helpers — documents, filings and their retirement, through the estate's OWN doors.
// ===========================================================================================

/** A verified document FILED to this client, through clara.file_document (the estate's door).
 *  Returns `{ documentId, filingId, sha256 }`. */
export async function evidenceDocument(sub, { firm, client, kind = "invoice" }) {
  const { filedDocument } = await import("./s6-helpers.mjs");
  return filedDocument(sub, { firm, client, kind });
}

/** Retire a filing through clara.retire_document_filing — the estate's own human door, never a
 *  hand-set `retired_at` (which `ck_document_filings_retirement` would refuse anyway). */
export async function retireFiling(sub, { filing, reason = "#634 rig: source withdrawn" }) {
  const rev = await rootQuery(
    "select revision_token from clara.document_filings where id=$1", [filing]);
  const r = await humanQuery(sub,
    "select clara.retire_document_filing(p_filing_id => $1::uuid, p_reason => $2::text,"
    + " p_expected_revision => $3::uuid, p_op_key => $4::text) as result",
    [filing, reason, rev.rows[0].revision_token, opk("w634-retire")]);
  return r.rows[0].result;
}

/** A `document` source ref, in the shape admission accepts. */
export const docRef = (documentId) => ({ kind: "document", document_id: documentId });

/** Reverse a posted entry through `clara.reverse_entry` — LAW 6's own door (0009), never a
 *  hand-set `reversed_by` (which `clara._tf_entry_immutable` refuses anyway). Returns the door's
 *  receipt: `{reversal_id, status}`. The caller ASSERTS on it; a raise here is a finding about
 *  the world, not a reason to go green. */
export async function reverseEntry(sub, { entry, reason = "#634 rig: posted in error", opKey = null }) {
  const r = await humanQuery(sub,
    "select clara.reverse_entry(p_entry => $1::uuid, p_reason => $2::text,"
    + " p_op_key => $3::text) as result",
    [entry, reason, opKey ?? opk("w634-reverse")]);
  return r.rows[0].result;
}

// ===========================================================================================
// 4b · FORCED TWO-SESSION SCHEDULES. The estate's X7 law: PROVE the block via pg_blocking_pids
// BEFORE releasing the holder — a schedule that never blocked proves nothing about a race.
//
// Modelled on `rig-docs-race.mjs`'s `holdThenContend` and kept HERE rather than imported so the
// #634 battery carries its own identity setup (a wake credential on one side, a signed-in human
// on the other) and its own outcome shape: this lane's whole claim is about the typed `detail`
// a loser gets, and the shared driver discards it.
// ===========================================================================================

async function raceEnter(client, side) {
  const pid = (await client.query("select pg_backend_pid() as pid")).rows[0].pid;
  if (side.role) await client.query(`set role ${side.role}`);
  await client.query("begin");
  if (side.jwtSub != null) {
    await client.query("select set_config('request.jwt.claims', $1, true)",
      [JSON.stringify({ sub: side.jwtSub, role: "authenticated" })]);
  }
  if (side.wakeSecret != null) {
    await client.query("select set_config('clara.wake_secret', $1, true)", [side.wakeSecret]);
  }
  return pid;
}

async function raceCleanup(clients) {
  for (const c of clients) {
    await c.query("rollback").catch(() => {});
    await c.query("reset role").catch(() => {});
    await c.query("reset all").catch(() => {});
    c.release();
  }
}

/** Poll until backend `pid` is WAITING on a lock held by `blockerPid`. */
async function waitBlockedBy(pid, blockerPid, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await rootQuery(
      "select wait_event_type as wet, pg_blocking_pids(pid) as blockers"
      + " from pg_stat_activity where pid = $1", [pid]);
    const row = r.rows[0];
    if (row && row.wet === "Lock" && (row.blockers || []).map(Number).includes(Number(blockerPid))) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}

/**
 * HOLD-then-CONTEND: side `a` runs its statement and HOLDS its transaction open (its writes
 * uncommitted); side `b` fires and must BLOCK on `a`'s uncommitted key, then resolve against
 * `a`'s COMMITTED state once `a` commits. Returns `{ a, b, provedBlocked }`, each side
 * `{ ok, receipt }` or `{ ok:false, code, detail, message }` — `detail` PARSED, because the typed
 * refusal is the whole point of the schedule.
 */
export async function holdThenContend({ a, b }) {
  const c1 = await getPool().connect();
  const c2 = await getPool().connect();
  const out = { a: null, b: null, provedBlocked: false };
  const settle = (e) => ({
    ok: false, code: e.code,
    detail: (() => { try { return JSON.parse(e.detail ?? "{}"); } catch { return {}; } })(),
    message: e.message,
  });
  try {
    const pid1 = await raceEnter(c1, a);
    try {
      out.a = { ok: true, receipt: await a.run(c1) };
    } catch (e) {
      out.a = settle(e);
    }

    const pid2 = await raceEnter(c2, b);
    const p2 = Promise.resolve()
      .then(() => b.run(c2))
      .then((receipt) => { out.b = { ok: true, receipt }; })
      .catch((e) => { out.b = settle(e); });

    out.provedBlocked = await waitBlockedBy(pid2, pid1);
    await c1.query("commit").catch(() => c1.query("rollback").catch(() => {}));
    await p2;
    await c2.query("commit").catch(() => c2.query("rollback").catch(() => {}));
  } finally {
    await raceCleanup([c1, c2]);
  }
  return out;
}

/** `wake_record_journal_entry` on a CALLER-SUPPLIED client (the race sides own their txn). The
 *  named-argument call is the same one `wakeRecordJournalEntry` builds. */
export async function recordJournalEntryOn(client, { client: cli, work, logicalOpId, basis: b,
  bundleDigest = BUNDLE_DIGEST, runId = null, rationale = RATIONALE }) {
  const r = await client.query(
    "select clara.wake_record_journal_entry(p_client => $1::uuid, p_work => $2::uuid,"
    + " p_logical_op_id => $3::text, p_basis => $4::jsonb, p_bundle_digest => $5::text,"
    + " p_run_id => $6::text, p_rationale => $7::text) as result",
    [cli, work, logicalOpId, JSON.stringify(b), bundleDigest, runId ?? opk("w634-race-run"),
      rationale]);
  return r.rows[0].result;
}

/** `attach_entry_evidence` on a CALLER-SUPPLIED client, for the same reason. */
export async function attachEntryEvidenceOn(client, { entry, document, expectedRevision, opKey }) {
  const r = await client.query(
    "select clara.attach_entry_evidence(p_entry => $1::uuid, p_document => $2::uuid,"
    + " p_expected_revision => $3::uuid, p_op_key => $4::text) as result",
    [entry, document, expectedRevision, opKey]);
  return r.rows[0].result;
}

// ===========================================================================================
// 5 · Readers.
// ===========================================================================================

export async function linksForEntry(entry) {
  const r = await rootQuery(
    "select * from clara.entry_evidence_links where entry_id=$1 order by attached_at", [entry]);
  return r.rows;
}

export async function linksForDocument(document) {
  const r = await rootQuery(
    "select * from clara.entry_evidence_links where document_id=$1", [document]);
  return r.rows;
}

export async function linkCount(client) {
  const r = await rootQuery(
    "select count(*)::int as n from clara.entry_evidence_links where client_id=$1", [client]);
  return r.rows[0].n;
}

export async function entryRow(entry) {
  const r = await rootQuery(
    "select id, status, origin, document_id, filing_id, source_doc_sha256, revision_token,"
    + " reversal_of, reversed_by, reversal_reason from clara.journal_entries where id=$1", [entry]);
  return r.rows[0] ?? null;
}

/** The op_receipts row one human door reserved under one key — the "nothing was reserved"
 *  half of a BEFORE-any-reservation refusal. */
export async function opReceiptCount(fn, opKey) {
  const r = await rootQuery(
    "select count(*)::int as n from clara.op_receipts where fn=$1 and op_key=$2", [fn, opKey]);
  return r.rows[0].n;
}
