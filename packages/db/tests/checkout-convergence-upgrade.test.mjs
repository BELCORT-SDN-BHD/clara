// #628 — THE 0186 BACKFILL DRILL (deploy-onto-existing risk).
//
// WHY THIS FILE EXISTS AT ALL. `checkout-convergence.test.mjs` runs against a database where 0186
// was applied BEFORE any of its fixtures existed, so `clara.checkout_intents.status` is backfilled
// over ZERO pre-existing rows there and 0186 §A's one statement — the only thing in that migration
// that touches live, money-adjacent data inside a quiesce window — is structurally untested by
// every other battery. This drill does what CI otherwise never does: applies 0001→0185, builds
// checkout intents in every PRE-0186 shape the estate can hold, and only then applies 0186 onto
// them.
//
// It is a member of the house drill family (rig-events-upgrade / rig-docs-upgrade / s6-upgrade /
// wave-b/wb-0020-upgrade / x37-0037-upgrade / x40-0040-upgrade) and follows their pattern exactly:
// RESET-GATED (it drops schema clara), so it SKIPS in the ordinary battery — a mid-run schema drop
// would nuke every other file — and it is run ALONE against its OWN throwaway database:
//
//   PGDATABASE=clara_0186_upgrade CLARA_RIG_ALLOW_RESET=1 CLARA_RIG_ALLOW_ROLE_SWEEP=1 \
//     CLARA_ALLOW_DESTRUCTIVE=1 node --test packages/db/tests/checkout-convergence-upgrade.test.mjs
//
// THE SHAPES IT BUILDS, and why each is a separate claim 0186 §A makes:
//   · an UNSTAMPED intent                       -> `open`,            status_at = opened_at
//   · a STAMPED intent with no payment          -> `session_created`, status_at = opened_at
//   · a STAMPED intent with an unconsumed payment -> `paid`,          status_at = recorded_at
//   · a STAMPED intent with a CONSUMED payment  -> `consumed`,        status_at = consumed_at
//   · a SUPERSEDED stamped intent SHARING ITS REGISTRATION with the paid one, under a different
//     Stripe session -> `session_created`. This is the discriminating row: a backfill that matched
//     the payment on `registration_id` (which is the obvious spelling, and wrong — one registration
//     can hold several intents through 0163's plan-rotation arm) would mark it `paid` and hand the
//     estate two paid intents for one payment.
//
// AND ONE THING IT DOES NOT ASSERT: the exact instant of a pre-0186 session stamp. 0158 recorded
// none, so 0186 uses `opened_at` — a LOWER BOUND, stated in the column's own comment. This drill
// pins that it IS opened_at rather than `now()`, because "every pre-0186 applicant's session was
// created at migration time" would be a fabricated fact wearing a timestamp's clothes.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, copyFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { endPool, rootQuery } from "./rig-helpers.mjs";

after(async () => { await endPool(); });

const RESET_OK = process.env.CLARA_RIG_ALLOW_RESET === "1";
const MIG_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

function skipUnlessReset(t) {
  if (!RESET_OK) {
    t.skip("destructive (drops schema clara); set CLARA_RIG_ALLOW_RESET=1 + "
      + "CLARA_RIG_ALLOW_ROLE_SWEEP=1 on an ISOLATED database to run ALONE");
    return true;
  }
  return false;
}

/** Copy every migration EXCEPT the one under test into a throwaway dir. Keyed on the STABLE STEM,
 *  never on the number: numbers are claimed at merge (standing law), and a hard-coded `0186_`
 *  would silently stop excluding anything the day this file is renumbered. */
function exportPreConvergence() {
  const tmp = mkdtempSync(join(tmpdir(), "clara-pre0186-"));
  let excluded = 0;
  for (const f of readdirSync(MIG_DIR)) {
    if (!/^\d{4}_.*\.sql$/.test(f)) continue;
    if (/_checkout_convergence\.sql$/.test(f)) { excluded += 1; continue; }
    copyFileSync(join(MIG_DIR, f), join(tmp, f));
  }
  assert.equal(excluded, 1,
    "exactly one migration matches the checkout_convergence stem -- if this is 0, the drill would "
    + "apply the file under test in its own pre-state and prove nothing");
  return tmp;
}

async function freshPreConvergenceDb() {
  const { reset } = await import("../scripts/reset.mjs");
  const { migrate } = await import("../scripts/migrate.mjs");
  const { sweepChainMintedRoles } = await import("./rig-cluster-reset.mjs");
  // Cluster-wide role survival: roles outlive `drop database`/`drop schema`, and 0154 asserts an
  // EXACT cluster-wide `clara%` role count, so a second from-scratch chain on one cluster refuses
  // without this sweep (tests/rig-cluster-reset.mjs's own header, review-518 D1/D2).
  await reset({ log: () => {} });
  await sweepChainMintedRoles({ log: () => {} });
  await migrate({ dir: exportPreConvergence(), log: () => {} });
  return { migrate };
}

/** A user, a registration, and the shared legal/plan facts a pre-0186 intent needs. */
async function preWorld(tag) {
  const user = randomUUID();
  await rootQuery(
    "insert into clara.users(id,display_name,email,is_agent) values ($1,$2,$3,false)",
    [user, `u186_${tag}`, `u186_${tag}_${user.slice(0, 8)}@rig.test`]);
  const registration = (await rootQuery(
    `insert into clara.firm_registration_requests(applicant,firm_name,note,op_key)
     values ($1,$2,'#628 backfill drill',$3) returning id`,
    [user, `u186_${tag}_${randomUUID().slice(0, 8)}`, `u186_${tag}_${randomUUID()}`])).rows[0].id;
  return { user, registration };
}

async function preIntent({ registration, user, session = null, openedAt = null }) {
  const dpa = (await rootQuery(
    "select version from clara.legal_documents where kind='dpa' order by version limit 1")).rows[0].version;
  const plan = (await rootQuery(
    "select local_key from clara.billing_plans where is_current")).rows[0].local_key;
  const id = (await rootQuery(
    `insert into clara.checkout_intents(registration_id,applicant,price_local_key,dpa_version,opened_at)
     values ($1,$2,$3,$4,coalesce($5::timestamptz, now())) returning id`,
    [registration, user, plan, dpa, openedAt])).rows[0].id;
  if (session) {
    // The 0185 wall admits exactly this: the first NULL -> nonblank session_id stamp. No `status`
    // column exists yet, which is the entire point of the drill.
    await rootQuery("update clara.checkout_intents set session_id=$2 where id=$1", [id, session]);
  }
  return id;
}

/** A pre-0186 payment row, optionally CONSUMED (which needs a firm and a dpa acceptance, because
 *  `ck_frp_consumed_all_or_none` is all-or-none). */
async function prePayment({ registration, user, session, consumed = false }) {
  const event = `evt_u186${randomUUID().replaceAll("-", "")}`;
  await rootQuery(
    `insert into clara.stripe_events(event_id,type,livemode,session_id,registration_id,applicant,
       payment_status,mode,session_status,projection)
     values ($1,'checkout.session.completed',false,$2,$3,$4,'paid','payment','complete','{}'::jsonb)`,
    [event, session, registration, user]);
  let firm = null; let acceptance = null;
  if (consumed) {
    firm = (await rootQuery("insert into clara.firms(name) values ($1) returning id",
      [`u186_${randomUUID().slice(0, 8)}`])).rows[0].id;
    const doc = (await rootQuery(
      "select kind,version,body_sha256 from clara.legal_documents where kind='dpa' order by version limit 1")).rows[0];
    acceptance = (await rootQuery(
      `insert into clara.legal_acceptances(user_id,kind,version,body_sha256,op_key)
       values ($1,$2,$3,$4,$5) returning id`,
      [user, doc.kind, doc.version, doc.body_sha256, `u186_${randomUUID()}`])).rows[0].id;
  }
  const row = (await rootQuery(
    `insert into clara.firm_registration_payments(registration_id,applicant,stripe_event_id,
       stripe_session_id,consumed_at,consumed_firm_id,consumed_dpa_signature)
     values ($1,$2,$3,$4,$5,$6,$7) returning id,recorded_at,consumed_at`,
    [registration, user, event, session,
      consumed ? new Date(Date.now() - 3600_000).toISOString() : null, firm, acceptance])).rows[0];
  return row;
}

const iso = (v) => (v === null ? null : new Date(v).toISOString());

test("u186.1 the 0186 backfill maps every PRE-0186 intent shape from the evidence that already exists", async (t) => {
  if (skipUnlessReset(t)) return;
  const { migrate } = await freshPreConvergenceDb();

  // The pre-state is real: no status column exists, and the convergence cohort is absent.
  const pre = await rootQuery(
    `select
       (select count(*)::int from information_schema.columns
         where table_schema='clara' and table_name='checkout_intents' and column_name='status') as status_column,
       (select to_regclass('clara.admission_capacity') is not null) as capacity,
       (select max(version) from clara.schema_migrations) as frontier`);
  assert.deepEqual(
    { status_column: pre.rows[0].status_column, capacity: pre.rows[0].capacity },
    { status_column: 0, capacity: false },
    "the drill starts on a chain that genuinely predates 0186");

  const openWorld = await preWorld("open");
  const openIntentId = await preIntent({ ...openWorld, openedAt: "2026-03-01T01:02:03Z" });

  const stampedWorld = await preWorld("stamped");
  const stampedSession = `cs_u186_stamped_${randomUUID().replaceAll("-", "")}`;
  const stampedIntentId = await preIntent({
    ...stampedWorld, session: stampedSession, openedAt: "2026-03-02T04:05:06Z" });

  // The PAID registration carries TWO stamped intents under two different sessions, and only the
  // later one holds the payment. A backfill matching on registration_id would paint both `paid`.
  const paidWorld = await preWorld("paid");
  const supersededSession = `cs_u186_super_${randomUUID().replaceAll("-", "")}`;
  const supersededIntentId = await preIntent({
    ...paidWorld, session: supersededSession, openedAt: "2026-03-03T00:00:00Z" });
  const paidSession = `cs_u186_paid_${randomUUID().replaceAll("-", "")}`;
  const paidIntentId = await preIntent({
    ...paidWorld, session: paidSession, openedAt: "2026-03-03T07:08:09Z" });
  const paidRow = await prePayment({ ...paidWorld, session: paidSession });

  const consumedWorld = await preWorld("consumed");
  const consumedSession = `cs_u186_consumed_${randomUUID().replaceAll("-", "")}`;
  const consumedIntentId = await preIntent({
    ...consumedWorld, session: consumedSession, openedAt: "2026-03-04T10:11:12Z" });
  const consumedRow = await prePayment({ ...consumedWorld, session: consumedSession, consumed: true });

  const openedAt = new Map((await rootQuery(
    "select id, opened_at from clara.checkout_intents")).rows.map((r) => [r.id, r.opened_at]));

  // THE MIGRATION UNDER TEST, applied onto that populated estate.
  await migrate({ log: () => {} });

  const applied = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ 'checkout_convergence$'");
  assert.equal(applied.rows[0].n, 1, "0186 landed -- read from the LEDGER, never from its notice");

  const rows = new Map((await rootQuery(
    "select id, status, status_at, status_reason, session_id from clara.checkout_intents")).rows
    .map((r) => [r.id, r]));

  assert.equal(rows.get(openIntentId).status, "open");
  assert.equal(iso(rows.get(openIntentId).status_at), iso(openedAt.get(openIntentId)),
    "an unstamped intent's state began when it opened, and the migration says so");

  assert.equal(rows.get(stampedIntentId).status, "session_created");
  assert.equal(iso(rows.get(stampedIntentId).status_at), iso(openedAt.get(stampedIntentId)),
    "0158 recorded no stamp instant, so opened_at is the honest LOWER BOUND -- never now()");

  assert.equal(rows.get(paidIntentId).status, "paid");
  assert.equal(iso(rows.get(paidIntentId).status_at), iso(paidRow.recorded_at),
    "a paid intent's state began when the payment was recorded");

  assert.equal(rows.get(supersededIntentId).status, "session_created",
    "THE DISCRIMINATING ROW: the payment is matched on the SESSION, so a superseded intent of the "
    + "same registration is not painted paid by its sibling's money");

  assert.equal(rows.get(consumedIntentId).status, "consumed");
  assert.equal(iso(rows.get(consumedIntentId).status_at), iso(consumedRow.consumed_at),
    "a consumed intent's state began when the firm was claimed");

  assert.equal(
    [...rows.values()].filter((r) => r.status_reason !== null).length, 0,
    "the backfill invents no reason for a state it inferred");

  // NOTHING ELSE MOVED. The stamp wall is armed again, and the rows the migration disabled it for
  // are otherwise byte-identical.
  const trigger = await rootQuery(
    `select tgenabled from pg_trigger where tgrelid='clara.checkout_intents'::regclass
       and tgname='t_checkout_intents_session_stamp'`);
  assert.equal(trigger.rows[0].tgenabled, "O",
    "the trigger the backfill disabled for its own width is ARMED again");
  assert.deepEqual(
    [...rows.values()].map((r) => r.session_id).filter(Boolean).sort(),
    [consumedSession, paidSession, stampedSession, supersededSession].sort(),
    "every session stamp survived the backfill untouched");

  // …and the wall works on the backfilled rows: a pre-0186 `session_created` intent still refuses
  // an unlawful move, and still admits a lawful one.
  await assert.rejects(
    () => rootQuery("update clara.checkout_intents set status='consumed' where id=$1", [stampedIntentId]),
    (e) => e.code === "CLR09" && JSON.parse(e.detail).reason === "invalid_transition");
  await rootQuery("update clara.checkout_intents set status='expired' where id=$1", [stampedIntentId]);
  assert.equal((await rootQuery(
    "select status from clara.checkout_intents where id=$1", [stampedIntentId])).rows[0].status, "expired");

  // The capacity row landed seeded-unlimited on a populated estate too.
  const capacity = await rootQuery("select max_firms, reason from clara.admission_capacity where id");
  assert.equal(capacity.rowCount, 1);
  assert.equal(capacity.rows[0].max_firms, null, "an upgrade admits exactly what it admitted before");
});
