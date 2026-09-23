// 0042 Wave D-b — the ADJUSTMENT-TEMPLATE lane's fixture world, root readbacks and
// fixture surgery (NOT a test file: the name does not end in `.test.mjs`, so
// `node --test` ignores it). Re-exports `x42-adj-core.mjs` (vocabulary, readiness, MYT
// dates, refusal assertions, pinned verb wrappers) so a cell file imports ONE leaf.
//
// CONTRACT-BLIND — see the x42-adj-core.mjs header for the full discipline. This lane
// never reads 0042's SQL, and every object below is built THROUGH the audited verbs
// (the x37 dog-fooding law) except the four surgeries named next.
//
// FIXTURE SURGERY. Five shapes in this wave are produced by real TIME, by a verb that
// (correctly) refuses them, by a door #927 closed, or by nothing else a rig can reach:
//
//   1. a template SIGNED BEFORE the period it now runs. WDB-G4 forces a DRAFT for
//      every occurrence whose period ENDED BEFORE the signature; real books leave
//      catch-up behind by WAITING for the next month to end. A same-day suite cannot
//      wait, and no verb re-dates a signature — so the NON-catch-up branch, i.e. the
//      auto-post the design's §7 acceptance chain names, is unreachable without this.
//   2. a `mode='post'` STAMP on an unapproved draft. The poster auto-approves every
//      'post' stamp inside its own transaction, so arm (2)'s MODE axis is pure
//      defence-in-depth and no verb can leave one lying around.
//   3. an occurrence draft whose TEMPLATE is retired. `retire_adjustment_template`
//      refuses precisely while such a draft is outstanding (design §2.2), so arm (2)'s
//      `template_retired` axis has no verb-reachable input.
//   4. an INACTIVE coa account. MEASURED (the x41.b6 finding, re-measured by the cell
//      before use): no COA deactivation door exists anywhere; `upsert_account` is the
//      only writer and it always upserts `is_active = true`.
//   5. [#927] A PROPOSED, LIVE or RETIRED adjustment_templates ROW OF ANY KIND. #927
//      turned `propose_adjustment_template` and `sign_adjustment_template` into
//      unconditional refusals (D6: the row SHAPE this whole battery still needs to
//      read, correct and reverse is retained; only the two doors that could ever WRITE
//      a fresh one are gone). `insertTemplateRaw` below is the one remaining way to
//      mint a row of this shape on a rig, and it is what `liveTemplate` now calls —
//      every existing fixture and cell keeps the SAME shape it always produced, minted
//      by direct INSERT instead of by the retired ceremony. This is not a new idiom:
//      `plan-overlap-sibling-arm.test.mjs`'s own fixture (0281:247) already inserts a
//      `status='live'` row directly for the identical reason (proving the OTHER side of
//      an integration without driving the retired ceremony), and D6's whole premise —
//      that a firm's PRE-#927 templates are still real, readable rows — makes a direct
//      INSERT the historically honest shape for a fixture, not merely a workaround.
//
// Each surgery is confined to a fixture and carries a comment saying why. Where a user
// trigger would refuse the staging write, `session_replication_role='replica'` silences
// user triggers for that one session-local statement (the wave-b `backdateAuthExpiry`
// idiom); RLS is bypassed for the superuser in any case.

import assert from "node:assert/strict";
import {
  rootQuery, opk, idOf, getPool,
  createClient, createFirm, seedAdmission, insertUser, addMember,
  upsertAccountClassed, freshResolution, approveEntry, withdrawDraft,
  CHART, EXPA, ACCR, PREP, uniqTag,
  runOccurrence, adjustmentRunDue,
} from "./x42-adj-core.mjs";
import * as wb from "./wave-b/wb-fixtures.mjs";

export * from "./x42-adj-core.mjs";
export { wb };

// ---------------------------------------------------------------------------
// Root readbacks (superuser bypasses RLS — fixtures and assertions only, never the
// lane under test).
// ---------------------------------------------------------------------------

const rowsOf = async (sql, params) => (await rootQuery(sql, params)).rows.map((x) => x.row);

export const templateRows = (client) =>
  rowsOf("select to_jsonb(t) as row from clara.adjustment_templates t where t.client_id=$1 order by t.created_at, t.id", [client]);
export const templateRow = async (id) =>
  (await rootQuery("select to_jsonb(t) as row from clara.adjustment_templates t where t.id=$1", [id])).rows[0]?.row ?? null;

export const runRowsOf = (client) =>
  rowsOf("select to_jsonb(r) as row from clara.adjustment_runs r where r.client_id=$1 order by r.created_at, r.id", [client]);
export const runRowsForTemplate = (template) =>
  rowsOf("select to_jsonb(r) as row from clara.adjustment_runs r where r.template_id=$1 order by r.created_at, r.id", [template]);
export const receiptForEntry = async (entry) =>
  (await rootQuery("select to_jsonb(r) as row from clara.adjustment_runs r where r.entry_id=$1", [entry])).rows[0]?.row ?? null;

export const pairRows = (client) =>
  rowsOf("select to_jsonb(p) as row from clara.adjustment_pair_reversals p where p.client_id=$1 order by p.created_at, p.id", [client]);
export const pairRow = async (id) =>
  (await rootQuery("select to_jsonb(p) as row from clara.adjustment_pair_reversals p where p.id=$1", [id])).rows[0]?.row ?? null;

export const entryRowOf = async (entry) =>
  (await rootQuery("select to_jsonb(e) as row from clara.journal_entries e where e.id=$1", [entry])).rows[0]?.row ?? null;
export const entryLinesOf = (entry) =>
  rowsOf("select to_jsonb(l) as row from clara.journal_lines l where l.entry_id=$1 order by l.line_no", [entry]);

/** The MIRROR of an occurrence — linked by `auto_reversal_of` (design §2.4; the pair
 *  deliberately leaves reversal_of / reversed_by UNUSED on both halves). */
export const mirrorOf = async (occurrence) =>
  (await rootQuery("select to_jsonb(e) as row from clara.journal_entries e where e.auto_reversal_of=$1", [occurrence])).rows[0]?.row ?? null;

/** Every entry carrying THIS template's `recurring_adjustment` stamp, oldest first —
 *  the rig's own view of the ABI §B flags key. */
export const stampedEntries = (template, role = null) =>
  rowsOf(
    `select to_jsonb(e) as row from clara.journal_entries e
      where e.flags -> 'recurring_adjustment' ->> 'template_id' = $1::text
        and ($2::text is null or e.flags -> 'recurring_adjustment' ->> 'role' = $2::text)
      order by e.created_at, e.id`,
    [template, role],
  );

/** Domain events for one entry / one client, oldest first (per-firm `seq` is the order
 *  of record — the design §2.4 event-ordering assertion reads exactly this). */
export const eventsOfEntry = (entry) =>
  rowsOf("select to_jsonb(d) as row from clara.domain_events d where d.entry_id=$1 order by d.seq", [entry]);
export const eventsOfClient = (client, type = null) =>
  rowsOf(
    `select to_jsonb(d) as row from clara.domain_events d
      where d.client_id=$1 and ($2::text is null or d.event_type=$2::text) order by d.seq`,
    [client, type],
  );
export const eventCount = async (client, type) =>
  Number((await rootQuery(
    "select count(*)::int as n from clara.domain_events where client_id=$1 and event_type=$2", [client, type])).rows[0].n);

/** The net-debit GL balance of one account over APPROVED entries only. */
export async function glNet(client, code, asOf = null) {
  const r = await rootQuery(
    `select coalesce(sum(l.debit_cents - l.credit_cents),0)::bigint as n
       from clara.journal_lines l join clara.journal_entries e on e.id=l.entry_id
      where l.client_id=$1 and l.account_code=$2 and e.status='approved'
        and ($3::date is null or e.posting_date <= $3::date)`,
    [client, code, asOf]);
  return Number(r.rows[0].n);
}

/** {month, day} — the client's CURRENT financial-year end (0041's columns; NULL means
 *  the 31-December fallback the period arithmetic coalesces to). */
export async function clientFy(client) {
  const r = await rootQuery("select fy_end_month as m, fy_end_day as d from clara.clients where id=$1", [client]);
  return { month: r.rows[0]?.m ?? null, day: r.rows[0]?.d ?? null };
}

export const firmOfClient = async (client) =>
  (await rootQuery("select firm_id from clara.clients where id=$1", [client])).rows[0]?.firm_id ?? null;

export const tableExists = async (name) =>
  (await rootQuery(
    "select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='clara' and c.relname=$1 and c.relkind='r'",
    [name])).rowCount > 0;
export const fnExists = async (name) =>
  (await rootQuery(
    "select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara' and p.proname=$1 limit 1",
    [name])).rowCount > 0;
export const rlsFlagsOf = async (table) =>
  (await rootQuery(
    "select c.relrowsecurity as rls, c.relforcerowsecurity as force from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='clara' and c.relname=$1",
    [table])).rows[0] ?? null;
export const indexDefs = async (table) =>
  (await rootQuery(
    `select pg_get_indexdef(ix.indexrelid) as def from pg_index ix
       join pg_class t on t.oid=ix.indrelid join pg_namespace n on n.oid=t.relnamespace
      where n.nspname='clara' and t.relname=$1`, [table])).rows.map((x) => x.def);
export const triggerNames = async (table) =>
  (await rootQuery(
    `select tg.tgname as n from pg_trigger tg join pg_class c on c.oid=tg.tgrelid
       join pg_namespace ns on ns.oid=c.relnamespace
      where ns.nspname='clara' and c.relname=$1 and not tg.tgisinternal`, [table])).rows.map((x) => x.n);

// ---------------------------------------------------------------------------
// THE RAMP CLOCK, rebuilt INDEPENDENTLY from design §2.3 (never a DB helper). A
// completed PAIR correction AND an approved plain-`reverse_entry` mirror over a SOLO
// occurrence both reset it; a CANCELLED pair contributes nothing.
// ---------------------------------------------------------------------------

export async function rampClock(template) {
  const r = await rootQuery(
    `with occ as (
       select e.* from clara.journal_entries e
        where e.flags -> 'recurring_adjustment' ->> 'template_id' = $1::text
          and e.flags -> 'recurring_adjustment' ->> 'role' = 'occurrence'),
     reset as (
       select greatest(
         coalesce((select max(r.completed_at) from clara.adjustment_pair_reversals r
                    where r.template_id = $1::uuid and r.status = 'completed'), '-infinity'::timestamptz),
         coalesce((select max(m.approved_at) from clara.journal_entries m
                    join occ o on m.reversal_of = o.id where m.status = 'approved'), '-infinity'::timestamptz)
       ) as at)
     select (select at from reset)::text as reset_at,
            exists (select 1 from occ o, reset
                     where o.status = 'approved' and o.reversed_by is null
                       and o.approved_at > reset.at) as earned`,
    [template]);
  return { resetAt: r.rows[0].reset_at, earned: r.rows[0].earned };
}

/** The design §2.3 MODE predicate, composed from its stated inputs so a cell asserts
 *  the LAW rather than a hard-coded expectation:
 *    post ⇔ ramp-earned AND NOT high-stakes AND NOT catch-up
 *    catch-up ⇔ period_end < (signed_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date  [WDB-G4] */
export function expectedMode({ periodEnd, signedOn, rampEarned, highStakes }) {
  const catchUp = String(periodEnd) < String(signedOn);
  return (rampEarned && !highStakes && !catchUp) ? "post" : "draft";
}

/** 'YYYY-MM-DD' — a template's signature date IN MYT, exactly as WDB-G4 reads it. */
export async function signedOnMyt(template) {
  const r = await rootQuery(
    "select (t.signed_at at time zone 'Asia/Kuala_Lumpur')::date::text as d from clara.adjustment_templates t where t.id=$1",
    [template]);
  return r.rows[0]?.d ?? null;
}

/** The firm's high-stakes floor (cents) for a client — `is_high_stakes` compares
 *  Σdebit_cents against it, so a template's per-occurrence total decides the drop. */
export async function firmThresholdOf(client) {
  const r = await rootQuery(
    "select f.high_stakes_amount_cents as n from clara.firms f join clara.clients c on c.firm_id=f.id where c.id=$1",
    [client]);
  return Number(r.rows[0].n);
}

// ---------------------------------------------------------------------------
// THE FIXTURE WORLD.
// ---------------------------------------------------------------------------

let _w = null;
/** The Wave-B multi-user world: firm A carries alice (owner), bob + grace
 *  (bookkeepers), carol (viewer), hana (admin) — so eligible_checker_count(firm A) >= 2
 *  and the high-stakes DISTINCT-CHECKER arm binds; firm S is erin ALONE, the only shape
 *  where `_approve_entry_core`'s SELF-ATTESTATION arm can bind (design §7's
 *  signer-approves-own high-stakes cell). Cached per process. */
export async function adjWorld() {
  if (!_w) _w = await wb.buildWaveBWorld();
  return _w;
}

export const manualRes = (sub, client) =>
  freshResolution(sub, client, { subjectKind: "manual", subjectId: null });

export async function buildAdjChart(sub, client) {
  for (const [code, name, type, klass] of CHART) {
    await upsertAccountClassed(sub, { client, code, name, type, accountClass: klass, opKey: opk("x42coa") });
  }
}

/** A fresh firm-A client carrying the x42 chart. */
export async function freshAdjClient(label) {
  const w = await adjWorld();
  const client = await createClient(w.users.alice, { name: `x42_${label}_${uniqTag()}`, opKey: opk("x42cli") });
  await buildAdjChart(w.users.alice, client);
  return client;
}

/** A fresh SOLO-firm client (firm S: erin is the only member, so
 *  eligible_checker_count = 1). erin is the owner, hence both proposer and signer. */
export async function soloAdjClient(label) {
  const w = await adjWorld();
  const client = await createClient(w.users.erin, { name: `x42s_${label}_${uniqTag()}`, opKey: opk("x42scli") });
  await buildAdjChart(w.users.erin, client);
  return { client, sub: w.users.erin, firm: w.firms.S };
}

/** A DEDICATED firm (owner + admin + bookkeeper) plus one client on the x42 chart.
 *  Used ONLY by the cell that mutates `firms.high_stakes_amount_cents`, so that surgery
 *  can never leak into the shared world's other cells. */
export async function freshAdjFirm(label) {
  const prefix = `x42f_${label}_${uniqTag()}`;
  const users = {
    owner: await insertUser(prefix, "owner"),
    admin: await insertUser(prefix, "admin"),
    keeper: await insertUser(prefix, "keeper"),
  };
  const firm = await createFirm(users.owner, { name: prefix, token: await seedAdmission(), opKey: opk("x42firm") });
  await addMember(users.owner, { firm, user: users.admin, role: "admin", opKey: opk("x42mem") });
  await addMember(users.owner, { firm, user: users.keeper, role: "bookkeeper", opKey: opk("x42mem") });
  const client = await createClient(users.owner, { name: `${prefix}_c`, opKey: opk("x42fcli") });
  await buildAdjChart(users.owner, client);
  return { firm, client, users };
}

// ---------------------------------------------------------------------------
// Line-set builders (ABI §C: >=2 rows, exactly one side positive per row, Σdr = Σcr).
// ---------------------------------------------------------------------------

/** The archetypal accrual: Dr expense / Cr accruals. */
export const accrualLines = (cents, { debit = EXPA, credit = ACCR } = {}) => [
  { account_code: debit, debit_cents: cents, credit_cents: 0, description: "accrued charge" },
  { account_code: credit, debit_cents: 0, credit_cents: cents, description: "accrual" },
];

/** A prepayment reclass: Dr prepayments (an ASSET, so a RESERVING door can legally
 *  take it) / Cr expense. The line-eligibility cells need one template leg an FA
 *  profile or an advance enrolment can claim. */
export const prepaymentLines = (cents, { asset = PREP, expense = EXPA } = {}) => [
  { account_code: asset, debit_cents: cents, credit_cents: 0, description: "prepaid portion" },
  { account_code: expense, debit_cents: 0, credit_cents: cents, description: "expense relieved" },
];

// ---------------------------------------------------------------------------
// FIXTURE SURGERY — the four shapes named in the header. Fixtures only, never a lane.
// ---------------------------------------------------------------------------

/** Run one superuser statement with USER TRIGGERS SILENCED. */
async function withTriggersOff(sql, params) {
  const c = await getPool().connect();
  try {
    await c.query("set session_replication_role = replica");
    return await c.query(sql, params);
  } finally {
    await c.query("set session_replication_role = origin").catch(() => {});
    await c.query("reset all").catch(() => {});
    c.release();
  }
}

/** SURGERY 1 — move a LIVE template's `signed_at` to noon MYT on `isoDate`.
 *  The transition trigger admits only proposed→live / proposed→retired / live→retired,
 *  so even a superuser UPDATE of `signed_at` alone is refused as an unlawful live→live
 *  transition; the triggers are therefore silenced for this one statement. Noon MYT is
 *  used so the MYT date is unambiguous whatever the server's session timezone. */
export async function backdateSignedAt(template, isoDate) {
  assert.match(String(isoDate), /^\d{4}-\d{2}-\d{2}$/, `backdateSignedAt takes a bare ISO date (got '${isoDate}')`);
  await withTriggersOff(
    `update clara.adjustment_templates
        set signed_at = ($2::date + time '12:00') at time zone 'Asia/Kuala_Lumpur'
      where id = $1`,
    [template, isoDate]);
  const got = await signedOnMyt(template);
  assert.equal(got, isoDate, `the backdated signature really reads ${isoDate} in MYT (got ${got})`);
  return got;
}

const COLUMN_RE = /^[a-z][a-z0-9_]*$/;

/** SURGERY 2/3 support — patch named columns of ONE journal entry with user triggers
 *  silenced. `_tf_entry_immutable` lets a draft→draft UPDATE touch only
 *  `revision_token` and `updated_at`, so `flags` / `origin` cannot be staged at all —
 *  and no verb produces them either (`_draft_entry_core` keeps only three named
 *  booleans out of p_flags, and `revise_entry` refuses every D-b proposal flag by
 *  design). Arm (2)'s ORIGIN / MODE / LINES / PERIOD axes exist to catch exactly a
 *  tampered stamp, so a tampered stamp is what they must be fed. */
export async function forgeEntryColumns(entry, patch, { casts = {} } = {}) {
  const cols = Object.keys(patch);
  assert.ok(cols.length > 0, "forgeEntryColumns needs at least one column");
  for (const c of cols) assert.match(c, COLUMN_RE, `forge column '${c}' is not a bare identifier`);
  const sets = cols.map((c, i) => `${c} = $${i + 2}${casts[c] ? `::${casts[c]}` : ""}`);
  const vals = cols.map((c) => (patch[c] !== null && typeof patch[c] === "object" ? JSON.stringify(patch[c]) : patch[c]));
  await withTriggersOff(`update clara.journal_entries set ${sets.join(", ")} where id = $1`, [entry, ...vals]);
  return entryRowOf(entry);
}

/** Replace an entry's whole `flags` jsonb (the row-shape-dispatch cells feed edge
 *  shapes: an empty object, a missing `role`, an explicit null). */
export const forgeEntryFlags = (entry, flags) =>
  forgeEntryColumns(entry, { flags }, { casts: { flags: "jsonb" } });

/** Merge a patch into `flags.recurring_adjustment`, preserving every other key. */
export async function forgeStamp(entry, patch) {
  const row = await entryRowOf(entry);
  const stamp = { ...(row.flags?.recurring_adjustment ?? {}), ...patch };
  return forgeEntryFlags(entry, { ...(row.flags ?? {}), recurring_adjustment: stamp });
}

/** Break — or re-derive — the ISSUER op-receipt binding for a poster op key.
 *  `clara.op_receipts` carries no trigger, so this is a plain superuser UPDATE. Arm
 *  (2)'s second axis re-derives the request hash from client+template+period (design
 *  §2.6) and ABI §E pins those literal fields for the poster key, so the non-garbage
 *  branch recomputes the hash for a DIFFERENT period through the DB's own `clara._hash`
 *  — which is what lets the PERIOD axis be reached without tripping the receipt axis,
 *  the earlier one, first. */
export async function forgeOpReceiptHash(firm, opKey, { garbage = false, client = null, template = null, ps = null, pe = null } = {}) {
  const sql = garbage
    ? `update clara.op_receipts set request_hash = sha256(convert_to('x42-forged-receipt','UTF8'))
        where firm_id = $1 and op_key = $2 returning fn`
    : `update clara.op_receipts
          set request_hash = clara._hash(jsonb_build_object('client', $3::uuid, 'template', $4::uuid,
                'ps', $5::date, 'pe', $6::date))
        where firm_id = $1 and op_key = $2 returning fn`;
  const params = garbage ? [firm, opKey] : [firm, opKey, client, template, ps, pe];
  const r = await rootQuery(sql, params);
  assert.ok(r.rowCount > 0,
    `the poster reserved an op-receipt row for op_key '${opKey}' (ABI §E: the run verb is the reserver)`);
  return r.rows.map((x) => x.fn);
}

/** SURGERY 3 — retire a template OUT OF BAND. `retire_adjustment_template` refuses
 *  exactly while an occurrence draft is outstanding (its own cell asserts that), so the
 *  one state arm (2)'s `template_retired` axis exists to catch is unreachable through
 *  the verb. The transition trigger DOES admit live→retired, so no silencing is needed
 *  and the retire columns are written exactly as the verb writes them. */
export async function retireTemplateRaw(template, who, reason = "x42 out-of-band retire") {
  await rootQuery(
    `update clara.adjustment_templates
        set status = 'retired', retired_by = $2, retired_at = now(), retired_reason = $3,
            retired_op_key = $4
      where id = $1`,
    [template, who, reason, opk("x42rawret")]);
  const row = await templateRow(template);
  assert.equal(row.status, "retired", "the out-of-band retire really landed");
  return row;
}

/** SURGERY 4 — deactivate a COA account. `coa_accounts` carries no update trigger, so
 *  a plain superuser UPDATE stages the inactive account the propose-time line
 *  eligibility rule (design §2.1) must refuse. The caller RE-MEASURES first that no
 *  deactivation verb exists, so this never quietly outlives the gap it stands in for. */
export async function deactivateAccountRaw(client, code) {
  const r = await rootQuery(
    "update clara.coa_accounts set is_active = false where client_id = $1 and account_code = $2 returning is_active",
    [client, code]);
  assert.equal(r.rowCount, 1, `exactly one coa row for ${code}`);
  assert.equal(r.rows[0].is_active, false, `${code} is now inactive`);
}

/** Which `clara._adj_template_hash` body is live on THIS database — 7 args (0045) or 8 (0140's
 *  schedule-bearing recut). Memoised: one catalog read per process, like every other frontier
 *  probe in this battery. */
let _hashArity = null;
export async function adjTemplateHashArity() {
  if (_hashArity !== null) return _hashArity;
  const r = await rootQuery(
    `select max(p.pronargs)::int as n from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara' and p.proname = '_adj_template_hash'`);
  _hashArity = Number(r.rows[0].n);
  return _hashArity;
}

/** SURGERY 5 [#927] — mint one `clara.adjustment_templates` row of ANY status by direct
 *  INSERT: `propose_adjustment_template`/`sign_adjustment_template` are retired doors as of
 *  #927 (see this file's header). `content_hash` and the stored line canon are computed
 *  through the DB's own `clara._adj_canon_lines`/`clara._adj_template_hash` — the same
 *  bodies the retired propose door used to call — so a fixture built this way is byte-for-
 *  byte the row a real proposal would have produced, never a hand-shaped approximation.
 *  No trigger silencing is needed: the transition trigger only fires on UPDATE/DELETE, and
 *  this is a plain INSERT. */
export async function insertTemplateRaw({
  client, status = "live", label = "tpl", cadence = "monthly", lines = null, cents = 120_000,
  autoReverse = false, start, end = null, memo = "x42 accrual",
  proposer = null, signer = null, retiredReason = "x42 raw retire",
  name: explicitName = null, replaces = null,
}) {
  assert.ok(["proposed", "live", "retired"].includes(status), `insertTemplateRaw: unknown status '${status}'`);
  const w = await adjWorld();
  const firm = await firmOfClient(client);
  const name = explicitName ?? `x42 ${label} ${uniqTag()}`;
  const body = lines ?? accrualLines(cents);
  const canon = (await rootQuery(
    "select clara._adj_canon_lines($1::jsonb) as l", [JSON.stringify(body)])).rows[0].l;
  // FRONTIER ARITY. `clara._adj_template_hash` takes SEVEN arguments at 0045 and EIGHT from
  // 0140 (`drop function ... (text,text,date,date,boolean,jsonb,text)` then a `schedule`-bearing
  // recut). This fixture runs at BOTH frontiers -- the package sweep at the head of the chain,
  // and the d-b2 slice leg on a 0001..0045 copy (.github/actions/frontier-leg) -- so it asks the
  // catalog which body is live instead of pinning one arity a bounded chain does not have.
  const hash = (await rootQuery(
    await adjTemplateHashArity() === 8
      ? "select clara._adj_template_hash($1,$2,$3::date,$4::date,$5,$6::jsonb,$7,null) as h"
      : "select clara._adj_template_hash($1,$2,$3::date,$4::date,$5,$6::jsonb,$7) as h",
    [name, cadence, start, end, autoReverse, JSON.stringify(canon), memo])).rows[0].h;

  const signed = status === "live" || status === "retired";
  const retired = status === "retired";
  const proposedBy = proposer ?? w.users.bob;
  const signedBy = signed ? (signer ?? w.users.hana) : null;
  const retiredBy = retired ? (signer ?? w.users.hana) : null;

  // [#927] `lineage_root_id` is DERIVED here exactly as the retired propose core derived it
  // (0140's `_propose_adjustment_template_core`: "the predecessor's own root, or the predecessor
  // itself when it is one -- and NULL when nothing was declared"), read off the live row rather
  // than recomputed in JS, so a declared lineage is byte-identical to what the door produced.
  const r = await rootQuery(
    `insert into clara.adjustment_templates(
       firm_id, client_id, status, name, cadence, start_date, end_date, auto_reverse, lines,
       memo_template, content_hash, proposed_by, proposed_op_key,
       signed_by, signed_at, signed_op_key, retired_by, retired_at, retired_reason, retired_op_key,
       replaces_template_id, lineage_root_id)
     values (
       $1, $2, $3, $4, $5, $6::date, $7::date, $8, $9::jsonb, $10, $11, $12, $13,
       $14, case when $14::uuid is not null then now() else null end, $15,
       $16, case when $16::uuid is not null then now() else null end, $17, $18,
       $19::uuid,
       case when $19::uuid is null then null
            else (select coalesce(pr.lineage_root_id, pr.id) from clara.adjustment_templates pr
                   where pr.id = $19::uuid) end)
     returning *`,
    [firm, client, status, name, cadence, start, end, autoReverse, JSON.stringify(canon), memo, hash,
      proposedBy, opk("x42rawprop"),
      signedBy, signed ? opk("x42rawsign") : null,
      retiredBy, retired ? retiredReason : null, retired ? opk("x42rawret") : null,
      replaces]);
  const row = r.rows[0];
  assert.equal(row.status, status, `insertTemplateRaw: the row really landed at status '${status}'`);
  return {
    id: row.id, name, cadence, memo, lines: canon, autoReverse, cents,
    signedBy: row.signed_by, contentHash: row.content_hash, row,
  };
}

/** Raise or lower a firm's high-stakes floor. Only ever called on a DEDICATED firm
 *  minted by `freshAdjFirm`, never on the shared world's firms. `clara.firms` carries
 *  no update trigger, so this is a plain superuser UPDATE. */
export async function setFirmThreshold(firm, cents) {
  const r = await rootQuery(
    "update clara.firms set high_stakes_amount_cents = $2::bigint where id = $1 returning high_stakes_amount_cents as n",
    [firm, cents]);
  assert.equal(r.rowCount, 1, "the dedicated firm's threshold really moved");
  return Number(r.rows[0].n);
}

// ---------------------------------------------------------------------------
// Higher-level fixtures.
// ---------------------------------------------------------------------------

/** A LIVE template. [#927] Built by direct INSERT (SURGERY 5 above) rather than by
 *  propose+sign — those two doors are retired; every caller of this fixture keeps the exact
 *  same return shape it always got. `backdateSignTo` moves the signature into the past
 *  (SURGERY 1) so the periods under test are NOT catch-up. `signer` names who
 *  `signed_by` reads (the default is hana, matching the pre-#927 default signer). */
export async function liveTemplate({
  client, label = "tpl", cadence = "monthly", lines = null, cents = 120_000,
  autoReverse = false, start, end = null, memo = "x42 accrual",
  proposer = null, signer = null, backdateSignTo = null, name = null, replaces = null,
}) {
  const t = await insertTemplateRaw({
    client, status: "live", label, cadence, lines, cents, autoReverse, start, end, memo,
    proposer, signer, name, replaces,
  });
  if (backdateSignTo) await backdateSignedAt(t.id, backdateSignTo);
  const row = await templateRow(t.id);
  assert.equal(row.status, "live", "the raw-inserted template is LIVE");
  return { ...t, row };
}

/** Approve a draft as `sub`, always re-reading the CURRENT revision token first (the
 *  forge helpers do not rotate it, and a fixture must never race the token). */
export async function approveDraft(sub, entry, { attestation = null, opKey = null } = {}) {
  const e = await entryRowOf(entry);
  assert.ok(e, `entry ${entry} exists`);
  const args = { entry, expectedRevision: e.revision_token, opKey: opKey ?? opk("x42apr") };
  if (attestation) args.attestation = attestation;
  return approveEntry(sub, args);
}

/** Withdraw a draft as `sub` (the occurrence-draft resolver; a PAIR draft is refused by
 *  design and that refusal has its own cell). */
export async function withdrawAs(sub, entry, reason = "x42 withdraw") {
  const e = await entryRowOf(entry);
  return withdrawDraft(sub, { entry, reason, expectedRevision: e.revision_token, opKey: opk("x42wd") });
}

/** Run one occurrence through the MACHINE verb and, when it DRAFTED, approve it with
 *  `approveAs` so the ramp can advance. Returns {receipt, entryId, mode}. */
export async function runAndSettle({ client, template, period, approveAs = null, attestation = null }) {
  const w = await adjWorld();
  const receipt = await runOccurrence({
    client, template, periodStart: period.start, periodEnd: period.end,
  });
  const entryId = idOf(receipt, "entry_id", "id");
  assert.ok(entryId, `a run receipt names its entry (got ${JSON.stringify(receipt)})`);
  if (receipt.status === "drafted") await approveDraft(approveAs ?? w.users.alice, entryId, { attestation });
  return { receipt, entryId, mode: receipt.status };
}

/** Drain the due ladder: run the oracle's oldest unmet period until nothing is due,
 *  approving every draft so the next period opens. Returns the receipts in order. */
export async function drainDue(client, { approveAs = null, cap = 24 } = {}) {
  const out = [];
  for (let i = 0; i < cap; i++) {
    const due = await adjustmentRunDue(client);
    if (!due?.due) return out;
    out.push(await runAndSettle({
      client, template: due.template_id,
      period: { start: due.period_start, end: due.period_end }, approveAs,
    }));
  }
  assert.fail(`drainDue exceeded ${cap} periods — the due ladder is not converging`);
  return out;
}
