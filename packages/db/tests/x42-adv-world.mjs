// 0042 Wave D-b — the STAFF-ADVANCE lane's root readbacks + fixture world (NOT a
// test file: the name does not end in `.test.mjs`, so `node --test` ignores it).
// Re-exports x42-adv-helpers so a test file imports ONE module.
//
// WHY A SEPARATE MODULE: the repo enforces a 500-line file ceiling and the pinned
// verb wrappers + refusal machinery already fill `x42-adv-helpers.mjs`. This is the
// x41-fa-fixtures / x41-fa-world split, verbatim.
//
// CONTRACT-BLIND (see the x42-adv-helpers.mjs header). Every object is built THROUGH
// the audited verbs — the x37 dog-fooding law. A raw INSERT / root readback appears
// only for FIXTURES and ASSERTIONS, never inside the lane under test.

import assert from "node:assert/strict";
import {
  rootQuery, opk, idOf, noteLane, collectRowKind, listReviewQueue, human, reverseEntry,
  getPool, ROLES,
  createClient, upsertAccountClassed, grantConsent, freshResolution, draftEntryV3, approveEntry,
  ADV1, ADV2, ADV3, BANKV, BANK2, WAGES, OTHERV, ARV, APV, FACOST, FAACCUM, FAEXP, SHAREV,
  enrolAdvance, bookApplication, retireAdvance, uniqTag, mon,
} from "./x42-adv-helpers.mjs";
import * as wb from "./wave-b/wb-fixtures.mjs";

export * from "./x42-adv-helpers.mjs";
export { wb };

// ---------------------------------------------------------------------------
// Root readbacks (superuser bypasses RLS — fixtures and assertions only, never
// the lane under test).
// ---------------------------------------------------------------------------

const rowsOf = async (sql, params) => (await rootQuery(sql, params)).rows.map((x) => x.row);

export const enrolmentRows = (client) =>
  rowsOf("select to_jsonb(a) as row from clara.staff_advance_accounts a where a.client_id=$1 order by a.enrolled_at, a.id", [client]);
export const enrolmentRow = async (id) =>
  (await rootQuery("select to_jsonb(a) as row from clara.staff_advance_accounts a where a.id=$1", [id])).rows[0]?.row ?? null;
export const advanceRows = (client) =>
  rowsOf("select to_jsonb(a) as row from clara.staff_advances a where a.client_id=$1 order by a.created_at, a.id", [client]);
export const advanceRow = async (id) =>
  (await rootQuery("select to_jsonb(a) as row from clara.staff_advances a where a.id=$1", [id])).rows[0]?.row ?? null;
export const applicationRows = (client) =>
  rowsOf("select to_jsonb(x) as row from clara.staff_advance_applications x where x.client_id=$1 order by x.created_at, x.id", [client]);
export const applicationRowsOf = (advance) =>
  rowsOf("select to_jsonb(x) as row from clara.staff_advance_applications x where x.advance_id=$1 order by x.created_at, x.id", [advance]);
export const policyRows = () =>
  rowsOf("select to_jsonb(p) as row from clara.ea1955_policy p order by p.fact, p.effective_from");
export const entryRowOf = async (entry) =>
  (await rootQuery("select to_jsonb(e) as row from clara.journal_entries e where e.id=$1", [entry])).rows[0]?.row ?? null;
export const entryLinesOf = (entry) =>
  rowsOf("select to_jsonb(l) as row from clara.journal_lines l where l.entry_id=$1 order by l.line_no", [entry]);
export const mirrorIdOf = async (entry) =>
  (await rootQuery("select id from clara.journal_entries where reversal_of=$1", [entry])).rows[0]?.id ?? null;

export const tableExists = async (name) =>
  (await rootQuery(
    "select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='clara' and c.relname=$1 and c.relkind='r'",
    [name])).rowCount > 0;
export const columnExists = async (table, column) =>
  (await rootQuery(
    "select 1 from information_schema.columns where table_schema='clara' and table_name=$1 and column_name=$2",
    [table, column])).rowCount > 0;

/** The net-debit GL balance of one account over APPROVED entries only. */
export async function glNet(client, code, asOf = null) {
  const r = await rootQuery(
    `select coalesce(sum(l.debit_cents - l.credit_cents),0)::bigint as n
       from clara.journal_lines l join clara.journal_entries e on e.id=l.entry_id
      where l.client_id=$1 and l.account_code=$2 and e.status='approved'
        and ($3::date is null or e.posting_date <= $3::date)`,
    [client, code, asOf],
  );
  return Number(r.rows[0].n);
}

/** The design §3.2 outstanding equation, rebuilt INDEPENDENTLY here (never a DB
 *  helper): base (gated on issue_date) − Σ application effects with effective_date
 *  ≤ as_of − the void effect. `correction` rows are POSITIVE effects (they unwind an
 *  application); nothing is excluded by a reversed flag. */
export async function outstandingAt(advance, asOf) {
  const a = await advanceRow(advance);
  assert.ok(a, `outstandingAt: no staff_advances row ${advance}`);
  let n = a.issue_date <= asOf ? Number(a.amount_cents) : 0;
  for (const x of await applicationRowsOf(advance)) {
    if (x.effective_date > asOf) continue;
    n += x.kind === "correction" ? Number(x.amount_cents) : -Number(x.amount_cents);
  }
  if (a.void_effective_date && a.void_effective_date <= asOf) n -= Number(a.amount_cents);
  return n;
}

// ---------------------------------------------------------------------------
// The fixture world.
// ---------------------------------------------------------------------------

let _w = null;
/** The Wave-B multi-user world: firm A carries alice (owner), bob + grace
 *  (bookkeepers), carol (viewer), hana (admin) — so eligible_checker_count(firm A)
 *  >= 2 and the high-stakes DISTINCT-CHECKER arm can actually bind. Cached. */
export async function advWorld() {
  if (!_w) _w = await wb.buildWaveBWorld();
  return _w;
}

export const manualRes = (sub, client) => freshResolution(sub, client, { subjectKind: "manual", subjectId: null });

/** A distinct firm-A human to check `maker`'s draft (CLR05 never binds on the rig's
 *  own setup entries). */
export async function checkerFor(maker) {
  const w = await advWorld();
  return maker === w.users.alice ? w.users.bob : w.users.alice;
}

export async function buildAdvChart(sub, client) {
  for (const [code, name, type, klass] of [
    [ADV1, "Staff Advance — A. Rig (x42)", "asset", null],
    [ADV2, "Staff Advance — B. Rig (x42)", "asset", null],
    [ADV3, "Staff Advance — C. Rig (x42)", "asset", null],
    [BANKV, "Maybank current (x42)", "asset", null],
    [BANK2, "CIMB current (x42)", "asset", null],
    [WAGES, "Salaries & Wages (x42)", "expense", null],
    [OTHERV, "Sundry Expense (x42)", "expense", null],
    [FACOST, "Plant & Machinery (x42)", "asset", null],
    [FAACCUM, "Accum Depreciation P&M (x42)", "asset", null],
    [FAEXP, "Depreciation Expense (x42)", "expense", null],
    [SHAREV, "Share Capital (x42)", "equity", null],
    [ARV, "Trade Debtors (x42)", "asset", "receivable"],
    [APV, "Trade Creditors (x42)", "liability", "payable"],
  ]) {
    await upsertAccountClassed(sub, { client, code, name, type, accountClass: klass, opKey: opk("x42coa") });
  }
}

/** A fresh firm-A client with the x42 chart and (by default) ADV1 enrolled.
 *  Returns {client, enrolment} — `enrolment` is null when `enrol:false`. */
export async function freshAdvClient(label, { enrol = true, code = ADV1, personLabel = null } = {}) {
  const w = await advWorld();
  const sub = w.users.alice;
  const client = await createClient(sub, { name: `x42v_${label}_${uniqTag()}`, opKey: opk("x42cli") });
  await buildAdvChart(sub, client);
  await grantConsent(sub, { firm: w.firms.A, client }).catch(() => {});
  let enrolment = null;
  if (enrol) enrolment = await enrolHere(sub, { client, code, personLabel: personLabel ?? `Staff ${label}` });
  return { client, enrolment };
}

/** Enrol + assert the ABI §A envelope; returns the enrolment id. */
export async function enrolHere(sub, { client, code = ADV1, personLabel = "Rig Staff Member", attestation = undefined }) {
  const args = { client, accountCode: code, personLabel };
  if (attestation !== undefined) args.attestation = attestation;
  const receipt = await enrolAdvance(sub, args);
  const id = idOf(receipt, "enrolment_id", "id");
  assert.ok(id, `enrol_staff_advance_account names the enrolment (got ${JSON.stringify(receipt)})`);
  assert.equal(receipt.status, "active", "…and reports status 'active' (ABI §A)");
  return id;
}

/** Draft+approve a plain entry as `maker`, checked by a DISTINCT firm-A human by
 *  default (the rig's setup entries must never trip the pre-existing CLR05
 *  distinct-checker floor above the firm's RM10,000 high-stakes threshold). */
export async function approvedEntry(maker, {
  client, lines, memo = "x42 entry", postingDate, checker = null, attestation = null, flags = null,
}) {
  const d = await draftEntryV3(maker, {
    client, resolution: await manualRes(maker, client), lines, memo, postingDate, flags,
    opKey: opk("x42draft"),
  });
  const args = { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("x42approve") };
  if (attestation) args.attestation = attestation;
  await approveEntry(checker ?? (await checkerFor(maker)), args);
  return d.entry_id;
}

/** Approve an existing DRAFT with a distinct checker, reading its live revision
 *  token first (a hook-side write may have bumped it). */
export async function approveDraft(entry, { maker = null, checker = null, attestation = null } = {}) {
  const e = await entryRowOf(entry);
  assert.ok(e, `approveDraft: no journal_entries row ${entry}`);
  assert.equal(e.status, "draft", `approveDraft: entry ${entry} is '${e.status}', not a draft`);
  const args = { entry, expectedRevision: e.revision_token, opKey: opk("x42aprdraft") };
  if (attestation) args.attestation = attestation;
  const who = checker ?? (maker ? await checkerFor(maker) : (await advWorld()).users.alice);
  return approveEntry(who, args);
}

/** Disburse an advance: Dr <enrolled code> / Cr bank, approved → the hook
 *  soft-births ONE register row per debit leg. */
export async function disburse({
  client, cents, postingDate, account = ADV1, memo = "x42 staff advance disbursement",
  maker = null, checker = null,
}) {
  const w = await advWorld();
  const sub = maker ?? w.users.alice;
  const before = (await advanceRows(client)).length;
  const entry = await approvedEntry(sub, {
    client, memo, postingDate, checker,
    lines: [
      { account_code: account, debit_cents: cents, credit_cents: 0, description: "advance paid out" },
      { account_code: BANKV, debit_cents: 0, credit_cents: cents, description: "from bank" },
    ],
  });
  const rows = await advanceRows(client);
  assert.equal(rows.length, before + 1,
    `the disbursement soft-birthed exactly ONE register row (had ${before}, now ${rows.length})`);
  return { entry, advance: rows[rows.length - 1] };
}

/** A one-leg application line set: Dr `counter` / Cr <the advance's account>. The
 *  advance leg is ALWAYS line_no 2 (draft_entry numbers lines `with ordinality`). */
export function applicationLines(accountCode, cents, { counter = WAGES, desc = "advance recovered" } = {}) {
  return [
    { account_code: counter, debit_cents: cents, credit_cents: 0, description: desc },
    { account_code: accountCode, debit_cents: 0, credit_cents: cents, description: "advance applied" },
  ];
}

/** Book (and, on the high-stakes DRAFT branch, optionally approve) one application
 *  against a single advance. Returns {receipt, entryId, mode}. */
export async function applyToAdvance(sub, {
  client, advance, accountCode = ADV1, cents, postingDate, kind = "payroll_deduction",
  counter = WAGES, reason = "x42 rig application", settle = true, checker = null, opKey = null,
}) {
  const receipt = await bookApplication(sub, {
    client, postingDate, lines: applicationLines(accountCode, cents, { counter }),
    allocations: [{ line_no: 2, advance_id: advance, amount_cents: cents }],
    kind, reason, opKey,
  });
  const entryId = idOf(receipt, "entry_id", "id");
  assert.ok(entryId, `book_staff_advance_application names its entry (got ${JSON.stringify(receipt)})`);
  assert.ok(["posted", "drafted"].includes(receipt.status),
    `the WCA-R7 envelope reports 'posted' or 'drafted' (got ${JSON.stringify(receipt)})`);
  if (receipt.status === "drafted" && settle) await approveDraft(entryId, { maker: sub, checker });
  return { receipt, entryId, mode: receipt.status };
}

// ---------------------------------------------------------------------------
// The OPENING-BALANCE client — the ONLY producer of `is_opening_balance` entries
// (the Wave-B K family). Built entirely through the audited K verbs, with the
// advance account ENROLLED FIRST (while the code's approved balance is still zero,
// as enrol-clean-only demands) so the soft-birth gate `NOT is_opening_balance` is
// genuinely exercised at K5 approve.
// ---------------------------------------------------------------------------

export async function openingBalanceAdvanceClient(label, { cents = 250_000, code = ADV1 } = {}) {
  const w = await advWorld();
  const o = await wb.onboardingClient(w.users.hana, `x42vk_${label}_${uniqTag()}`);
  await wb.seedOpeningCoa(w.users.alice, o.client);
  await buildAdvChart(w.users.alice, o.client);
  const enrolment = await enrolHere(w.users.alice, { client: o.client, code, personLabel: `Opening ${label}` });

  const doc = await wb.openingDoc(w.users.alice, { firm: w.firms.A, client: o.client });
  const sr = await wb.createOpeningSeed(w.users.bob, {
    client: o.client, plan: o.plan, asOf: mon(-6).end, tieDocument: doc.documentId, tieSha256: doc.sha256,
  });
  const seed = sr.seed_id ?? sr.id;
  await wb.recordParsedTargets({ firm: w.firms.A, seed, doc, lines: [
    { line_key: "adv", account_code: code, source_label: "staff advance", debit_cents: cents, credit_cents: 0 },
    { line_key: "cap", account_code: SHAREV, source_label: "share capital", debit_cents: 0, credit_cents: cents },
  ] });

  const res = () => freshResolution(w.users.bob, o.client, { subjectKind: "document", subjectId: doc.documentId });
  const mk = (itemKey, lines) => wb.draftOpeningItem(w.users.bob, {
    client: o.client, seed, resolution: res(), document: doc.documentId, sha256: doc.sha256,
    item: { item_kind: "gl_balance", item_key: itemKey }, lines,
  });
  const advItem = await mk("gl:adv", [{ account_code: code, debit_cents: cents, credit_cents: 0 }]);
  const capItem = await mk("gl:cap", [{ account_code: SHAREV, debit_cents: 0, credit_cents: cents }]);

  // K5 is the act under test in the cell that uses this fixture (an opening-balance
  // debit must never soft-birth), so the approval is handed back UNCALLED.
  const approve = async () => wb.approveOpeningSeed(w.users.hana, {
    seed, planRevision: await wb.planRevision(o.plan), tieSha256: doc.sha256,
    entryRevisions: wb.revMapOf([advItem, capItem]), opKey: opk("x42vkapr"),
  });
  return { client: o.client, plan: o.plan, seed, doc, enrolment, cents, code, advItem, capItem, approve };
}

/** Reverse an entry and settle its mirror (the mirror DRAFTS when high-stakes, and the
 *  advance-side consequences all live in the APPROVE hook — never in reverse_entry
 *  itself — so a cell that stops at the verb has proved nothing about the register).
 *  Returns {mirror, drafted}; `drafted` says which branch actually ran, so a cell can
 *  assert it exercised the high-stakes lane rather than assuming it. */
export async function reverseAndSettle(sub, { entry, reason, opKey = null }) {
  await reverseEntry(sub, { entry, reason, opKey: opKey ?? opk("x42rev") });
  const mirror = await mirrorIdOf(entry);
  assert.ok(mirror, `reverse_entry minted a mirror for ${entry}`);
  const drafted = (await entryRowOf(mirror)).status === "draft";
  if (drafted) await approveDraft(mirror, { maker: sub });
  assert.equal((await entryRowOf(mirror)).status, "approved", "…and the mirror is approved");
  return { mirror, drafted };
}

// ---------------------------------------------------------------------------
// THE APPROVE-RACES-ENROLMENT STAGING (design §3.3, the watermark).
//
// `journal_entries.approved_at` is stamped with now() — the approving TRANSACTION'S
// START, not the moment of the act. This helper opens session A's transaction FIRST
// (pinning that stamp), lets a SEPARATE session enrol the code and COMMIT, and only
// then runs the approve inside A. So the approve's stamp precedes the enrolment's
// stamp while the act itself unambiguously follows it — the exact band in which a
// transaction-start timestamp is not a visibility boundary, and the only way to reach
// it from a test is with two real sessions.
//
// Returns {entry, enrolment, approvedAt, enrolledAt, approveError} — `approveError` is
// null when the approve committed, so a cell can assert either outcome by name.
// ---------------------------------------------------------------------------

export async function approveRacingEnrolment({
  client, code = ADV1, cents = 100_000, postingDate, maker, checker,
  personLabel = "Race holder", lines = null, memo = "x42 approve racing an enrolment",
}) {
  const w = await advWorld();
  const mk = maker ?? w.users.alice;
  const ck = checker ?? (await checkerFor(mk));
  const d = await draftEntryV3(mk, {
    client, resolution: await manualRes(mk, client), postingDate, memo,
    lines: lines ?? [
      { account_code: code, debit_cents: cents, credit_cents: 0, description: "advance paid out" },
      { account_code: BANKV, debit_cents: 0, credit_cents: cents, description: "from bank" },
    ],
    opKey: opk("x42race"),
  });

  const conn = await getPool().connect();
  let approveError = null;
  let approvedAt = null;
  let enrolment = null;
  let enrolledAt = null;
  try {
    await conn.query(`set role ${ROLES.authenticated}`);
    await conn.query("begin");
    // A stuck race must fail the cell, never hang the suite.
    await conn.query("set local statement_timeout = '30s'");
    await conn.query("select set_config('request.jwt.claims',$1,true)",
      [JSON.stringify({ sub: ck, role: "authenticated" })]);
    approvedAt = (await conn.query("select now() as t")).rows[0].t;

    // …the enrolment happens on ITS OWN connection and COMMITS while A is open.
    enrolment = await enrolHere(mk, { client, code, personLabel });
    enrolledAt = (await rootQuery(
      "select enrolled_at from clara.staff_advance_accounts where id=$1", [enrolment])).rows[0].enrolled_at;
    assert.ok(enrolledAt > approvedAt,
      `mandatory setup: the enrolment's stamp (${enrolledAt?.toISOString?.()}) must fall AFTER the approving transaction's start (${approvedAt?.toISOString?.()}) — otherwise this cell is not staging the race at all`);

    try {
      await conn.query(
        "select clara.approve_entry(p_entry => $1::uuid, p_expected_revision => $2::uuid, p_op_key => $3::text) as r",
        [d.entry_id, d.revision_token, opk("x42raceapr")]);
      await conn.query("commit");
    } catch (e) {
      approveError = e;
      await conn.query("rollback").catch(() => {});
    }
  } finally {
    await conn.query("reset role").catch(() => {});
    await conn.query("reset all").catch(() => {});
    conn.release();
  }
  return { entry: d.entry_id, enrolment, approvedAt, enrolledAt, approveError };
}

// ---------------------------------------------------------------------------
// THE APPROVE-RACES-**RETIREMENT** STAGING (the other side of the same watermark).
//
// The sibling above stages an enrolment committing under an open approve. This one
// stages a RETIREMENT doing it — the direction round 2 deliberately left on the
// transaction-start stamp, and the one that lets a disbursement land on a generation
// `retire_staff_advance_account` has already closed (its outstanding guard looked, and
// the row did not exist yet; it can never look again).
//
// `entry` races an EXISTING draft (a reversal mirror, a high-stakes application) —
// otherwise a fresh Dr <code> / Cr bank draft is made. `then` runs on its own
// connection AFTER the retirement commits and BEFORE the approve, so a cell can stage
// a lawful retire-AND-re-enrol inside the same band.
//
// Returns {entry, revision, approvedAt, retiredAt, approveError, thenResult}.
// ---------------------------------------------------------------------------

export async function approveRacingRetirement({
  client, enrolment, entry = null, lines = null, cents = 100_000, code = ADV1,
  postingDate, maker = null, checker = null, then = null, act = null,
  memo = "x42 approve racing a retirement", reason = "x42 race: the staff member left",
}) {
  const w = await advWorld();
  const mk = maker ?? w.users.alice;
  const ck = checker ?? (await checkerFor(mk));
  let target = entry;
  if (!act && !target) {
    const d = await draftEntryV3(mk, {
      client, resolution: await manualRes(mk, client), postingDate, memo,
      lines: lines ?? [
        { account_code: code, debit_cents: cents, credit_cents: 0, description: "advance paid out" },
        { account_code: BANKV, debit_cents: 0, credit_cents: cents, description: "from bank" },
      ],
      opKey: opk("x42rret"),
    });
    target = d.entry_id;
  }
  const revision = target ? (await entryRowOf(target)).revision_token : null;

  const conn = await getPool().connect();
  let approveError = null, approvedAt = null, retiredAt = null, thenResult = null;
  try {
    await conn.query(`set role ${ROLES.authenticated}`);
    await conn.query("begin");
    await conn.query("set local statement_timeout = '30s'"); // a stuck race fails, never hangs
    await conn.query("select set_config('request.jwt.claims',$1,true)",
      [JSON.stringify({ sub: ck, role: "authenticated" })]);
    // FULL PRECISION, DELIBERATELY. `now()` is microsecond-resolution in Postgres and a JS
    // Date is millisecond-resolution, so comparing the two stamps in JS silently rounds the
    // band away — the two transactions really can start inside the same millisecond. The stamp
    // is therefore carried as TEXT and the ordering is asked of the DATABASE.
    const a0 = (await conn.query("select now() as t, now()::text as ts")).rows[0];
    approvedAt = a0.t;

    // …the RETIREMENT happens on its OWN connection and COMMITS while A is open.
    await retireAdvance(w.users.hana, { client, enrolment, reason, opKey: opk("x42rretR") });
    const band = (await rootQuery(
      `select a.retired_at, a.retired_at::text as ts, (a.retired_at >= $2::timestamptz) as in_band
         from clara.staff_advance_accounts a where a.id=$1`, [enrolment, a0.ts])).rows[0];
    retiredAt = band.retired_at;
    // AT OR AFTER, not strictly after: the boundary instant (two starts inside one clock tick)
    // is INSIDE the band the ruling covers, and demanding strict inequality would make the cell
    // flake on a coarse clock rather than test anything more.
    assert.ok(band.in_band,
      `mandatory setup: the retirement's stamp (${band.ts}) must fall AT OR AFTER the approving transaction's start (${a0.ts}) — otherwise this cell is not staging the race at all`);
    if (then) thenResult = await then();

    try {
      // `act` lets a cell run the WHOLE act inside the race band rather than only an
      // approve — `clara.reverse_entry` on a low-stakes entry approves its own mirror in
      // this transaction, which is the ONLY way to reach hook arm (1) in the band.
      if (act) await act(conn);
      else {
        await conn.query(
          "select clara.approve_entry(p_entry => $1::uuid, p_expected_revision => $2::uuid, p_op_key => $3::text) as r",
          [target, revision, opk("x42rretA")]);
      }
      await conn.query("commit");
    } catch (e) {
      approveError = e;
      await conn.query("rollback").catch(() => {});
    }
  } finally {
    // ROLL BACK UNCONDITIONALLY BEFORE RELEASING. A staging error (a bad fixture, a failed
    // precondition assertion) throws with the transaction still OPEN, and a connection handed
    // back to the pool mid-transaction poisons every later cell with errors that look like
    // build defects. Harmless when the act already committed or rolled back.
    await conn.query("rollback").catch(() => {});
    await conn.query("reset role").catch(() => {});
    await conn.query("reset all").catch(() => {});
    conn.release();
  }
  return { entry: target, revision, approvedAt, retiredAt, approveError, thenResult };
}

/** The firm's high-stakes floor, READ (never assumed): the cells that need
 *  `reverse_entry` to leave a DRAFT mirror they can race must post above it. */
export const firmHighStakesCents = async (firm) =>
  Number((await rootQuery("select high_stakes_amount_cents as n from clara.firms where id=$1", [firm])).rows[0].n);

/** Every queue row of `kind` for one client — the /queue chase surface. */
export async function queueRowsOfKind(sub, client, kind) {
  const page = await listReviewQueue(human(sub), { scope: { client_id: client }, limit: 100 });
  const hits = collectRowKind(page, kind);
  if (!hits.length) noteLane(`queueRowsOfKind: no '${kind}' rows for this client (page keys: ${Object.keys(page ?? {}).join(", ")})`);
  return hits;
}
