// Slice-3 rig — event-spine shared helpers (NOT a test file: the name does not end
// in `.test.mjs`). Written INDEPENDENTLY from the migration lane, straight from the
// Slice-3 event-spine contract (docs/plan/slice3-event-spine-contract.md v2.2). Adversarial
// implementation of the contract that cross-checks lane-migration's 0005 schema.
//
// Beyond the Slice-2 harness this holds: the event catalog + client-scoped map + v1
// taxonomy (contract §2.1/§2.7), event-log/counter/pack readers, the wake_draft_entry +
// p_books_version wrapper, and the two-session forced-schedule drivers (C1 freshness
// interleaving, C4/C5 deadlock regressions, P6 allocator race).
//
// Signature strategy (inherited from rig-helpers): every clara fn is called by NAMED args
// using the parameter NAMES the CONTRACT states (_append_event / assert_books_current /
// get_context_pack / wake_draft_entry + p_books_version) — never from reading 0005.

import { randomUUID } from "node:crypto";
import {
  ROLES,
  getPool,
  namedCall,
  opk,
  rootQuery,
  humanQuery,
  wakeQuery,
  balanced,
  insertUser,
  seedAdmission,
  createFirm,
  createClient,
  upsertAccount,
} from "./rig-fixtures.mjs";

export * from "./rig-fixtures.mjs";

// ---------------------------------------------------------------------------
// Event catalog (contract §2.1 — 13 types) + client-scoped map + v1 taxonomy.
// ---------------------------------------------------------------------------

export const EVT = {
  firmCreated: "firm.created",
  clientCreated: "client.created",
  accountUpserted: "account.upserted",
  memberAdded: "member.added",
  memberRoleChanged: "member.role_changed",
  memberRemoved: "member.removed",
  documentIngested: "document.ingested",
  clientResolved: "client.resolved",
  entryDrafted: "entry.drafted",
  entryApproved: "entry.approved",
  entryReversed: "entry.reversed",
  notificationRecorded: "notification.recorded",
  booksBaseline: "books.baseline",
};

/** client_scoped flag per contract §2.1. F (firm-level) = false, C = true. */
export const EVENT_CLIENT_SCOPED = {
  "firm.created": false,
  "client.created": true,
  "account.upserted": true,
  "member.added": false,
  "member.role_changed": false,
  "member.removed": false,
  "document.ingested": true,
  "client.resolved": true,
  "entry.drafted": true,
  "entry.approved": true,
  "entry.reversed": true,
  "notification.recorded": true,
  "books.baseline": false,
};
export const ALL_EVENT_TYPES = Object.keys(EVENT_CLIENT_SCOPED);

/** Seed v1 routing (contract §2.7): document.ingested → background_review;
 *  notification.recorded → ignore; everything else → context_update. */
export const TAXONOMY_V1 = Object.fromEntries(
  ALL_EVENT_TYPES.map((t) => [
    t,
    t === "document.ingested" ? "background_review" : t === "notification.recorded" ? "ignore" : "context_update",
  ]),
);

export const TAXONOMY_DECISIONS = new Set([
  "internal_task",
  "notification",
  "background_review",
  "context_update",
  "ignore",
]);

/** Amount-shaped key patterns that MUST NEVER appear in an event payload (N2). */
const AMOUNT_KEY = /(debit|credit|cents|amount|balance|total|sum)/i;

// ---------------------------------------------------------------------------
// Readiness — the Slice-3 surface (domain_events + _append_event) must be present.
// ---------------------------------------------------------------------------

/** True once the event spine has landed (domain_events table + _append_event fn). */
export async function eventsReady() {
  const r = await rootQuery(
    `select
       (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'clara' and c.relname = 'domain_events' limit 1) as tbl,
       (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'clara' and p.proname = '_append_event' limit 1) as fn`,
  );
  return r.rows[0].tbl != null && r.rows[0].fn != null;
}

// ---------------------------------------------------------------------------
// Event-log + counter readers (as root — superuser bypasses RLS, sees every firm).
// ---------------------------------------------------------------------------

/** The firm's current max committed seq (0 when the firm has no events). */
export async function maxSeq(firm) {
  const r = await rootQuery("select coalesce(max(seq), 0)::int as n from clara.domain_events where firm_id = $1", [firm]);
  return r.rows[0].n;
}

/** The firm_event_seq allocator value (null when the row doesn't exist yet). */
export async function counterN(firm) {
  const r = await rootQuery("select n::int as n from clara.firm_event_seq where firm_id = $1", [firm]);
  return r.rows[0]?.n ?? null;
}

/** All events with seq > sinceSeq for a firm, ordered by seq (the events a single
 *  operation emitted, when sinceSeq was captured immediately before it). */
export async function eventsSince(firm, sinceSeq) {
  const r = await rootQuery(
    `select seq::int as seq, id, event_type, client_id, actor, on_behalf_of, via_wake_kind,
            entry_id, document_id, resolution_id, payload
       from clara.domain_events where firm_id = $1 and seq > $2 order by seq`,
    [firm, sinceSeq],
  );
  return r.rows;
}

/** The full, ordered seq list for a firm (for the dense/monotonic assertion). */
export async function allSeqs(firm) {
  const r = await rootQuery("select seq::int as seq from clara.domain_events where firm_id = $1 order by seq", [firm]);
  return r.rows.map((x) => x.seq);
}

/** Recursively collect every object key in a jsonb payload (for the N2 sweep). */
export function collectKeys(value, out = []) {
  if (Array.isArray(value)) {
    for (const v of value) collectKeys(v, out);
  } else if (value && typeof value === "object") {
    for (const k of Object.keys(value)) {
      out.push(k);
      collectKeys(value[k], out);
    }
  }
  return out;
}

/** Any amount-shaped key anywhere in a payload → a confidentiality violation. */
export function amountShapedKeys(payload) {
  return collectKeys(payload).filter((k) => AMOUNT_KEY.test(k));
}

// ---------------------------------------------------------------------------
// Context pack (contract §2.6). SECURITY INVOKER → RLS scopes to the caller.
// ---------------------------------------------------------------------------

/** get_context_pack in the HUMAN lane (jwt sub `sub`); returns the jsonb pack (or null). */
export async function contextPack(sub, client, purpose = "rig purpose") {
  const r = await humanQuery(sub, "select clara.get_context_pack(p_client => $1, p_purpose => $2) as pack", [client, purpose]);
  return r.rows[0].pack;
}

/** The books_version token a fresh pack stamps for a client (human lane). */
export async function packVersion(sub, client) {
  const pack = await contextPack(sub, client);
  return pack == null ? null : Number(pack.books_version);
}

// ---------------------------------------------------------------------------
// wake_draft_entry with the freshness token (contract §2.5 — the NEW p_books_version
// trailing param). Runs in the wake lane txn (wake_secret txn-local). Pass
// booksVersion:null explicitly to exercise the CLR10 "null token" gate.
// ---------------------------------------------------------------------------

export async function wakeDraftWithVersion({
  secret,
  client,
  resolution = null,
  lines,
  opKey,
  booksVersion, // number | null (null → CLR10); omit → not passed at all
  memo = "rig wake entry",
  postingDate = "2026-01-15",
  document = null,
  sha256 = null,
  flags = null,
  passVersion = true,
}) {
  const specs = [
    { name: "p_client" },
    { name: "p_resolution" },
    { name: "p_posting_date", cast: "date" },
    { name: "p_memo" },
    { name: "p_lines", cast: "jsonb" },
  ];
  const vals = [client, resolution, postingDate, memo, JSON.stringify(lines)];
  if (document != null) {
    specs.push({ name: "p_document" });
    vals.push(document);
  }
  if (sha256 != null) {
    specs.push({ name: "p_sha256" });
    vals.push(sha256);
  }
  if (flags != null) {
    specs.push({ name: "p_flags", cast: "jsonb" });
    vals.push(JSON.stringify(flags));
  }
  specs.push({ name: "p_op_key" });
  vals.push(opKey);
  if (passVersion) {
    specs.push({ name: "p_books_version", cast: "bigint" });
    vals.push(booksVersion ?? null);
  }
  const r = await wakeQuery(ROLES.wakeInteractive, secret, namedCall("wake_draft_entry", specs), vals);
  return r.rows[0].result;
}

// ---------------------------------------------------------------------------
// A dedicated fresh firm built through the audited writers, so its event seqs are a
// known, isolated sequence (dense-seq + emission + upgrade tests). Returns ids + owner.
// ---------------------------------------------------------------------------

export const FRESH_COA = { cash: "1000", ar: "1100", sales: "4000", expense: "5000", rounding: "9990" };

export async function seedFreshFirm(prefix, tag = "f") {
  const owner = await insertUser(prefix, `${tag}_owner`);
  const token = await seedAdmission();
  const firm = await createFirm(owner, { name: `${prefix}_${tag}_${randomUUID().slice(0, 6)}`, token, opKey: opk() });
  const client = await createClient(owner, { name: `${prefix}_${tag}_c1`, opKey: opk() });
  await upsertAccount(owner, { client, code: FRESH_COA.cash, name: "Cash", type: "asset", opKey: opk() });
  await upsertAccount(owner, { client, code: FRESH_COA.ar, name: "AR", type: "asset", opKey: opk() });
  await upsertAccount(owner, { client, code: FRESH_COA.sales, name: "Sales", type: "income", opKey: opk() });
  await upsertAccount(owner, { client, code: FRESH_COA.expense, name: "Expense", type: "expense", opKey: opk() });
  await upsertAccount(owner, { client, code: FRESH_COA.rounding, name: "Rounding", type: "equity", special: "rounding", opKey: opk() });
  return { owner, firm, client, coa: { ...FRESH_COA } };
}

// ---------------------------------------------------------------------------
// Two-session forced-schedule drivers. Each takes two dedicated pool clients, drives a
// precise lock schedule, and ALWAYS resets both clients (rollback → reset role → reset
// all) before returning them to the pool (T16b hygiene). Mirrors rig-txn.mjs style.
// ---------------------------------------------------------------------------

async function cleanup(clients) {
  for (const c of clients) {
    await c.query("rollback").catch(() => {});
    await c.query("reset role").catch(() => {});
    await c.query("reset all").catch(() => {});
    c.release();
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DRAFT_SPECS = [
  { name: "p_client" },
  { name: "p_resolution" },
  { name: "p_posting_date", cast: "date" },
  { name: "p_memo" },
  { name: "p_lines", cast: "jsonb" },
  { name: "p_op_key" },
];
const WAKE_DRAFT_SPECS = [...DRAFT_SPECS, { name: "p_books_version", cast: "bigint" }];

/** Poll until backend `pid` is WAITING on a Lock held by `blockerPid` (pg_blocking_pids
 *  resolves the tuple/transactionid chain). True once proven, false on timeout. */
async function waitBlockedBy(pid, blockerPid, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await rootQuery(
      "select wait_event_type as wet, pg_blocking_pids(pid) as blockers from pg_stat_activity where pid = $1",
      [pid],
    );
    const row = r.rows[0];
    if (row && row.wet === "Lock" && (row.blockers || []).map(Number).includes(Number(blockerPid))) return true;
    await sleep(50);
  }
  return false;
}

/**
 * The C1 freshness interleaving (contract §2.5 / P4) — PINS the commit-time recheck.
 * T2 (human) holds the counter row lock with an UNCOMMITTED client-A draft; T1 (wake)
 * passes the fast gate at `token`, then BLOCKS at the allocator on T2's lock. We PROVE T1
 * is at the allocator (the fast gate is a lock-free SELECT, so a Lock-wait on T2 can only
 * be the allocator) via pg_blocking_pids BEFORE committing T2 — so ONLY the commit-time
 * recheck (0005's second assert_books_current) can catch the staleness; delete it and T1
 * commits stale and this test FAILS. Returns { t1, gapFree, provedBlocked }.
 */
export async function c1FreshnessInterleaving({ firm, client, humanSub, wakeSecret, resolution, coa, amount, token }) {
  const c2 = await getPool().connect(); // T2 human
  const c1 = await getPool().connect(); // T1 wake
  const out = { t1: null, gapFree: null, provedBlocked: false };
  try {
    // T2: a human draft on `client` — allocates + HOLDS the counter row lock, uncommitted.
    const t2Pid = (await c2.query("select pg_backend_pid() as pid")).rows[0].pid;
    await c2.query(`set role ${ROLES.authenticated}`);
    await c2.query("begin");
    await c2.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: humanSub })]);
    await c2.query(namedCall("draft_entry", DRAFT_SPECS), [
      client,
      resolution,
      "2026-01-15",
      "T2 relevant draft",
      JSON.stringify(balanced(coa, amount)),
      opk(),
    ]);

    // T1: wake draft at `token`. Fast gate passes (T2 uncommitted → invisible); then it
    // BLOCKS at the allocator waiting for c2's counter row lock. Do NOT await yet.
    const t1Pid = (await c1.query("select pg_backend_pid() as pid")).rows[0].pid;
    await c1.query(`set role ${ROLES.wakeInteractive}`);
    await c1.query("begin");
    await c1.query("select set_config('clara.wake_secret', $1, true)", [wakeSecret]);
    const t1p = c1
      .query(namedCall("wake_draft_entry", WAKE_DRAFT_SPECS), [
        client,
        resolution,
        "2026-01-15",
        "T1 wake draft",
        JSON.stringify(balanced(coa, amount)),
        opk(),
        token,
      ])
      .then(() => {
        out.t1 = { ok: true };
      })
      .catch((e) => {
        out.t1 = { ok: false, code: e.code };
      });

    // PROVE T1 is past the fast gate and WAITING on T2's counter lock, THEN publish T2's
    // now-relevant event. If T1 never reaches that wait (e.g. it CLR12'd at the fast gate
    // instead), provedBlocked stays false and the test fails — the recheck is not pinned.
    out.provedBlocked = await waitBlockedBy(t1Pid, t2Pid);
    await c2.query("commit"); // publish T2's relevant event; T1 unblocks + rechecks → CLR12
    await t1p;
    await c1.query("commit").catch(() => c1.query("rollback").catch(() => {}));
  } finally {
    await cleanup([c1, c2]);
  }
  // No gap: after the dust settles the firm's seqs are still contiguous (the aborted
  // T1 allocation reverted).
  const seqs = await allSeqs(firm);
  out.gapFree = seqs.every((s, i) => i === 0 || s === seqs[i - 1] + 1);
  return out;
}

/**
 * C4 regression (contract §2.2 / P5): add_member (holds firms FOR UPDATE + the counter)
 * interleaved with a same-firm draft_entry. With NO FK from firm_event_seq → firms
 * (the chosen design) the draft's allocator does not need a firms lock, so there is no
 * cycle: the draft blocks on the counter, add_member commits, the draft proceeds. Both
 * complete; neither raises 40P01. Returns { addMember, draft }.
 */
export async function addMemberVsDraft({ firm, adminSub, newUser, client, resolution, coa, amount }) {
  const c1 = await getPool().connect(); // add_member
  const c2 = await getPool().connect(); // draft_entry
  const out = { addMember: null, draft: null };
  try {
    await c1.query(`set role ${ROLES.authenticated}`);
    await c1.query("begin");
    await c1.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: adminSub })]);
    await c1
      .query("select clara.add_member(p_firm => $1, p_user => $2, p_role => $3, p_op_key => $4)", [firm, newUser, "viewer", opk()])
      .then(() => {
        out.addMember = { ok: true };
      })
      .catch((e) => {
        out.addMember = { ok: false, code: e.code };
      });

    await c2.query(`set role ${ROLES.authenticated}`);
    await c2.query("begin");
    await c2.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: adminSub })]);
    const c2p = c2
      .query(namedCall("draft_entry", DRAFT_SPECS), [client, resolution, "2026-01-15", "concurrent draft", JSON.stringify(balanced(coa, amount)), opk()])
      .then(() => {
        out.draft = { ok: true };
      })
      .catch((e) => {
        out.draft = { ok: false, code: e.code };
      });

    await sleep(300); // draft reaches the counter and blocks on c1
    await c1.query("commit");
    await c2p;
    await c2.query("commit").catch(() => c2.query("rollback").catch(() => {}));
  } finally {
    await cleanup([c1, c2]);
  }
  return out;
}

/**
 * C5 regression (contract §2.4): approve of a drafted reversal MIRROR racing a fresh
 * reverse_entry on the SAME original. The C5 fix makes approve_entry lock the ORIGINAL
 * before the mirror (consistent original-before-mirror order with reverse_entry) → no
 * deadlock. Fires both concurrently; returns their outcomes. The caller asserts no
 * 40P01 + exactly one APPROVED reversal survives.
 */
export async function approveMirrorVsReverse({ approverSub, reverserSub, original, mirror, mirrorToken }) {
  const c1 = await getPool().connect(); // approve(mirror)
  const c2 = await getPool().connect(); // reverse(original) again
  const out = { approve: null, reverse: null };
  try {
    await c1.query(`set role ${ROLES.authenticated}`);
    await c1.query("begin");
    await c1.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: approverSub })]);

    await c2.query(`set role ${ROLES.authenticated}`);
    await c2.query("begin");
    await c2.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: reverserSub })]);

    // Fire both statements concurrently; COMMIT each as soon as ITS OWN statement
    // resolves — so a block on the OTHER txn's row lock resolves (the holder commits
    // and releases) instead of a client-orchestration deadlock. A genuine DB deadlock
    // still surfaces as 40P01 (caught below).
    const p1 = (async () => {
      try {
        await c1.query(namedCall("approve_entry", [{ name: "p_entry" }, { name: "p_expected_revision" }, { name: "p_op_key" }]), [mirror, mirrorToken, opk()]);
        out.approve = { ok: true };
      } catch (e) {
        out.approve = { ok: false, code: e.code };
      } finally {
        await c1.query("commit").catch(() => c1.query("rollback").catch(() => {}));
      }
    })();
    const p2 = (async () => {
      try {
        await c2.query(namedCall("reverse_entry", [{ name: "p_entry" }, { name: "p_reason" }, { name: "p_op_key" }]), [original, "concurrent reverse", opk()]);
        out.reverse = { ok: true };
      } catch (e) {
        out.reverse = { ok: false, code: e.code };
      } finally {
        await c2.query("commit").catch(() => c2.query("rollback").catch(() => {}));
      }
    })();
    await Promise.all([p1, p2]);
  } finally {
    await cleanup([c1, c2]);
  }
  return out;
}

/**
 * P6 / C17 allocator race (contract §2.2): two CONCURRENT first-events for a brand-new
 * firm (no firm_event_seq row yet) must get distinct, contiguous seqs. Drives
 * _append_event directly (superuser) with a firm-level type on a fresh firm_id so no
 * firms row / client is needed and the validation trigger passes. Returns { a, b }.
 */
export async function firstEventRace() {
  const firm = randomUUID();
  const actor = randomUUID();
  const call = namedCall("_append_event", [
    { name: "p_firm" },
    { name: "p_type" },
    { name: "p_client" },
    { name: "p_actor" },
    { name: "p_obo" },
    { name: "p_wake_kind" },
    { name: "p_entry" },
    { name: "p_document" },
    { name: "p_resolution" },
    { name: "p_payload", cast: "jsonb" },
  ]).replace(" as result", " as seq");
  const params = [firm, EVT.memberAdded, null, actor, null, null, null, null, null, JSON.stringify({})];
  const c1 = await getPool().connect();
  const c2 = await getPool().connect();
  const out = { firm, a: null, b: null };
  try {
    await c1.query("begin");
    await c2.query("begin");
    // Both fire concurrently; each COMMITs the moment its own allocation resolves. The
    // second blocks on the first's uncommitted counter key, then proceeds once the first
    // commits — no client-orchestration deadlock, and the on-conflict yields seq 2.
    const p1 = (async () => {
      const r = await c1.query(call, params);
      out.a = Number(r.rows[0].seq);
      await c1.query("commit");
    })();
    const p2 = (async () => {
      const r = await c2.query(call, params);
      out.b = Number(r.rows[0].seq);
      await c2.query("commit");
    })();
    await Promise.all([p1, p2]);
  } finally {
    await cleanup([c1, c2]);
  }
  return out;
}
