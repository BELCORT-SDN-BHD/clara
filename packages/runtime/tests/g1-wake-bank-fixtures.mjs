// Shared BANK-LANE fixtures for Gate G1's bankAgent_v1 cells.
//
// Split out of g1-wake-bank-e2e.test.mjs when 裁-44 added four more end-to-end cells that need the
// same books: a full COA + bank account + consent/activation pair + live statement + approved
// journal entries, all built through the estate's OWN audited writers (_seed_verified_document,
// upsert_account, add_bank_account, draft_entry/approve_entry) rather than raw inserts.
//
// EVERY STEP BELOW IS COMMENTED WITH THE RUNG IT EXISTS TO SATISFY, because a slipped fixture fact
// here fails a rung whose name looks nothing like its actual cause (measured, not guessed — see
// the sign-convention note at the journal lines).

import { randomUUID, createHash } from "node:crypto";
import * as rig from "./rig.mjs";

export const sha256hex = (seed) => createHash("sha256").update(String(seed)).digest("hex");

export const BANK_COA = "1060";
export const INCOME_COA = "4000";
export const BANK_CODE = "MBB"; // clara.bank_institutions — Maybank, seeded and active on every rig.

// Every date sits inside one fiscal window, entry/line dates <= the statement's period_end (D) —
// the period_exception_unacknowledged rung (0121:5991-6001) fails closed on a posting date AFTER
// period_end, and the tool hardcodes p_ack_period_exceptions=false, so there is no waiver from this
// lane. Fixed literals, not the DB's clock: draft_entry carries no fiscal-year gate.
export const PERIOD_START = "2024-06-01";
export const PERIOD_END = "2024-06-30";
export const LINE_DATE = "2024-06-15";

/** Mint a verified `clara.documents` row (+ optional filing) via the same superuser-only
 *  `_seed_verified_document` the db package's own rig fixtures use — called directly here since a
 *  runtime test cannot import a sibling package's test helpers. */
export async function seedVerifiedDoc(firm, client, sha, ownerSub) {
  const storagePath = `firms/${firm}/docs/${sha}.pdf`;
  const r = await rig.rootQuery("select clara._seed_verified_document($1,$2,$3,$4,$5,$6,$7,$8) as r", [
    firm, client, sha, "g1-bank-e2e.pdf", "application/pdf", 2048, storagePath, ownerSub,
  ]);
  return r.rows[0].r;
}

/** The bank COA + income COA + the consent/activation pair _agent_bank_tier_a demands. Runs once
 *  per firm; a second bank account on the same client reuses all of it. */
export async function buildBankPrereqs(w) {
  // §1 — the bank COA account. _assert_bank_coa_candidate (0121) demands active + asset-typed +
  // account_class IS NULL (non-control); upsert_account's default account_class is NULL.
  await rig.humanQuery(w.owner, "select clara.upsert_account(p_client=>$1,p_code=>$2,p_name=>$3,p_type=>$4,p_op_key=>$5) as r",
    [w.client, BANK_COA, "Maybank Current (g1 bank e2e)", "asset", rig.opk("g1be-bcoa")]);
  // The balancing leg — income, not expense: the sign convention needs a CREDIT leg opposite the
  // bank DEBIT.
  await rig.humanQuery(w.owner, "select clara.upsert_account(p_client=>$1,p_code=>$2,p_name=>$3,p_type=>$4,p_op_key=>$5) as r",
    [w.client, INCOME_COA, "Consulting Revenue (g1 bank e2e)", "income", rig.opk("g1be-icoa")]);

  // §3 — THE GATE THAT BITES FIRST: _agent_bank_tier_a runs on EVERY bank verb, the pack read
  // included, and refuses CLR10 purpose_unconsented without a live bank_matching consent +
  // activation pair. The consent needs a REAL clara.documents row for its evidence_document_id
  // (NOT NULL, FK'd) — an UNFILED one (client null) is enough.
  const evidence = await seedVerifiedDoc(w.firm, null, sha256hex(randomUUID()), w.owner);
  const consent = await rig.rootQuery(
    `insert into clara.client_egress_purpose_consents(firm_id, client_id, purpose, scope_note, evidence_document_id, granted_by)
       values ($1,$2,'bank_matching','g1 bank rig consent — inserted raw, deliberately, mirroring
         packages/db/tests/f-a3-pr1b-wake-verbs.test.mjs''s own before() hook',$3,$4) returning id`,
    [w.firm, w.client, evidence.document_id, w.owner],
  );
  await rig.rootQuery(
    `insert into clara.client_egress_purpose_activations(firm_id, client_id, purpose, consent_id, activated_by)
       values ($1,$2,'bank_matching',$3,$4)`,
    [w.firm, w.client, consent.rows[0].id, w.owner],
  );
  // No clara.bank_agency_holds row is planted — its absence IS the "not on hold" state
  // _agent_bank_tier_a reads (coalesce(v_held,false)).
}

/** One bank account plus a live statement carrying `lineCents.length` lines. `suffix` keeps two
 *  accounts on one client from colliding on their op keys.
 *
 *  `descriptions` (optional, one per line) is 裁-44 R2 / FOLD-11's own surface: the promotion
 *  verb's `times_seen` is now COUNTED from the printed text of the pack's lines, so a cell that
 *  needs a known sighting count plants that text here. The default keeps every line's text
 *  distinct-but-shared-prefixed ("g1 bank line 1", "g1 bank line 2", ...), which is why the E2
 *  cell can promote the substring "g1 bank line" and expect a count equal to the line count. */
export async function buildBankAccount(w, lineCents, suffix = "a", coaCode = BANK_COA, descriptions = null) {
  // §2 — the bank_accounts row + is_bank_account flip, through the ONE audited writer
  // (clara.add_bank_account -> _add_bank_account_core), which also sets
  // coa_accounts.is_bank_account=true in the same transaction.
  //
  // A SECOND ACCOUNT NEEDS ITS OWN COA ROW, and that is the database's rule rather than a fixture
  // convenience: _add_bank_account_core refuses "this chart account is already bound to another
  // active bank account". Measured, not assumed — the FOLD-4 cell's first draft shared one code
  // and was refused there.
  if (coaCode !== BANK_COA) {
    await rig.humanQuery(w.owner, "select clara.upsert_account(p_client=>$1,p_code=>$2,p_name=>$3,p_type=>$4,p_op_key=>$5) as r",
      [w.client, coaCode, `Maybank Current ${suffix} (g1 bank e2e)`, "asset", rig.opk(`g1be-bcoa-${suffix}`)]);
  }
  const acctNumber = `108${randomUUID().slice(0, 8).replace(/[a-f]/g, "1")}`;
  const bankRes = (await rig.humanQuery(w.owner,
    `select clara.add_bank_account(p_client=>$1,p_coa_account_code=>$2,p_bank_code=>$3,
       p_account_number=>$4,p_bank_name_display=>$5,p_op_key=>$6) as r`,
    [w.client, coaCode, BANK_CODE, acctNumber, `Maybank Current ${suffix}`, rig.opk(`g1be-bank-${suffix}`)],
  )).rows[0].r;
  const bankAccountId = bankRes.bank_account_id;

  // §4 — the statement's OWN evidence document, FILED to the client, which is what buys
  // bank_statements.filing_id a real row to reference. A DIFFERENT sha256 than the consent
  // evidence doc — _seed_verified_document upserts on (firm_id, sha256).
  const stmtSha = sha256hex(randomUUID());
  const stmtDoc = await seedVerifiedDoc(w.firm, w.client, stmtSha, w.owner);

  // §5/§6 — the statement AND every line in ONE statement (db-tests.md: "a pooled query() outside
  // an explicit begin is its own transaction"). t_bank_statements_belt is `deferrable initially
  // deferred` and re-derives line_count from the ACTUAL rows at transaction end, so three separate
  // calls would fire the belt right after the statement insert alone and refuse.
  // 裁-44 R2 / FOLD-10 — CENTS TRAVEL AS DECIMAL STRINGS FROM HERE ON, and that is a finding
  // rather than a style: a JS number literal of 9007199254740993 is ALREADY 9007199254740992
  // before node-postgres ever sees it, so a fixture written with numbers cannot plant the value
  // the cell is about. `::bigint[]` parses the text exactly, and the closing balance is summed
  // with BigInt for the same reason. Ordinary cells may still pass plain numbers.
  const centsText = lineCents.map((c) => String(c));
  const closing = centsText.reduce((a, b) => a + BigInt(b), 0n).toString();
  const built = await rig.rootQuery(
    `with stmt as (
       insert into clara.bank_statements(firm_id, client_id, bank_account_id, document_id,
           source_doc_sha256, filing_id, facts_hash, period_start, period_end, statement_date,
           opening_cents, closing_cents, line_count, status, ingest_mode)
         values ($1,$2,$3,$4,$5,$6,decode($5,'hex'),$7::date,$8::date,$8::date,0,$10,$11,'live','structured')
         returning id
     ), lns as (
       insert into clara.bank_statement_lines(firm_id, client_id, statement_id, bank_account_id, line_no, entry_date, amount_cents, description)
         select $1,$2,stmt.id,$3, x.ord, $9::date, x.cents, x.descr
           from stmt, unnest($12::bigint[], $13::text[]) with ordinality as x(cents, descr, ord)
         returning id, line_no
     )
     select (select id from stmt) as statement_id,
            (select array_agg(id order by line_no) from lns) as line_ids`,
    [w.firm, w.client, bankAccountId, stmtDoc.document_id, stmtSha, stmtDoc.filing_id,
      PERIOD_START, PERIOD_END, LINE_DATE, closing, lineCents.length, centsText,
      descriptions ?? lineCents.map((_, i) => `g1 bank line ${i + 1}`)],
  );
  return { bankAccountId, statementId: built.rows[0].statement_id, lineIds: built.rows[0].line_ids };
}

/** `n` approved journal entries, one per element of `entryCents`, each carrying that many cents of
 *  DEBIT on the bank COA (so each has exactly that much matchable capacity).
 *
 *  SIGN CONVENTION, stated once and load-bearing: matched_cents is the signed effect on the BANK
 *  account. A POSITIVE line (money in) pairs with a DEBIT on the bank COA. Getting this backwards
 *  fails tie_nonzero, NOT capacity_exhausted — a confusing rung to debug blind. */
export async function buildApprovedEntries(w, entryCents, suffix = "a", attestation = null) {
  // draft_entry needs a client_resolutions row; a bare 'manual' one (subject_id null) is the exact
  // shape reconcile-fa.test.mjs's own seedResolution plants for the same purpose.
  const resolution = await rig.rootQuery(
    `insert into clara.client_resolutions(firm_id,client_id,subject_kind,subject_id,confidence,method,evidence,resolved_by)
       values($1,$2,'manual',null,1.0,'human','{}'::jsonb,null) returning id`,
    [w.firm, w.client],
  );
  const ids = [];
  for (const [i, cents] of entryCents.entries()) {
    // Cents as DECIMAL STRINGS: the core reads them with (elem->>'debit_cents')::bigint
    // (0004:161/:197), so a string round-trips exactly while a JS number literal beyond 2^53 is
    // already rounded before JSON.stringify runs. See buildBankAccount's own note.
    const c = String(cents);
    const lines = [
      { account_code: BANK_COA, debit_cents: c, credit_cents: "0", description: `g1 bank inflow ${suffix}${i}` },
      { account_code: INCOME_COA, debit_cents: "0", credit_cents: c, description: `g1 bank revenue ${suffix}${i}` },
    ];
    const draft = (await rig.humanQuery(w.owner,
      `select clara.draft_entry(p_client=>$1,p_resolution=>$2,p_posting_date=>$3::date,p_memo=>$4,
         p_lines=>$5::jsonb,p_op_key=>$6) as r`,
      [w.client, resolution.rows[0].id, LINE_DATE, `g1 bank receipt ${suffix}${i}`, JSON.stringify(lines), rig.opk(`g1be-draft-${suffix}${i}`)],
    )).rows[0].r;
    // Deliberately BELOW any firm's high-stakes threshold in the ordinary case, so the
    // single-owner rig firm can lawfully self-check its own draft — the posture
    // reconcile-fa.test.mjs documents.
    //
    // A CELL THAT NEEDS A DELIBERATELY HUGE ENTRY (FOLD-10's unrepresentable capacity) is ABOVE
    // that threshold and the database says so: "solo high-stakes approval requires an
    // attestation". It is supplied here rather than routed around — the estate's own door, with
    // the attestation the door asks for, is the only lawful way past it.
    if (attestation === null) {
      await rig.humanQuery(w.owner, "select clara.approve_entry(p_entry=>$1,p_expected_revision=>$2,p_op_key=>$3) as r",
        [draft.entry_id, draft.revision_token, rig.opk(`g1be-appr-${suffix}${i}`)]);
    } else {
      await rig.humanQuery(w.owner, "select clara.approve_entry(p_entry=>$1,p_expected_revision=>$2,p_attestation=>$3,p_op_key=>$4) as r",
        [draft.entry_id, draft.revision_token, attestation, rig.opk(`g1be-appr-${suffix}${i}`)]);
    }
    ids.push(draft.entry_id);
  }
  return ids;
}

/** True iff G1 PR-2a's per-act bank gate is applied, probed by EXACT SIGNATURE (law 3 — a bare
 *  name is a projection of the function, not the function) rather than by a migration number. */
export async function hasBankWakeGate() {
  const r = await rig.rootQuery(
    "select to_regprocedure('clara._bank_wake_task_gate(text,uuid,boolean,boolean)') as g");
  return r.rows[0].g != null;
}

/** THE PRODUCER'S OWN ARTEFACTS, which a bank_agent credential now presupposes.
 *
 *  G1 PR-2a binds every bank_agent credential to a live wake task: the plain mint refuses
 *  bank_agent_task_absent when the firm/client has none, and every bank act is then gated on that
 *  task's status and on the bank account its producing event named. So this builds the real chain
 *  — a client-scoped `bank.agent_due` domain event carrying bank_account_id, its wake intent at
 *  the ACTIVE taxonomy version, the held agent_tasks(kind='wake') row drain.mjs would project,
 *  and the held->running claim the engine would make. Nothing is hand-stamped past what the
 *  database's own derivation triggers already do.
 *
 *  MEMOIZED per (firm, client) for CORRECTNESS, not speed: the plain mint refuses outright when a
 *  (firm, client) has MORE THAN ONE live wake task, so a helper that minted a fresh one per call
 *  would make the second credential in any battery refuse bank_agent_task_ambiguous. */
const _bankWakeTasks = new Map();
export async function ensureBankWakeTask(firmId, clientId) {
  const key = `${firmId}:${clientId}`;
  if (_bankWakeTasks.has(key)) return _bankWakeTasks.get(key);
  const live = await rig.rootQuery(
    `select id from clara.agent_tasks where firm_id=$1 and client_id=$2 and kind='wake'
       and status in ('held','running','cancel_requested')`, [firmId, clientId]);
  if (live.rowCount === 1) { _bankWakeTasks.set(key, live.rows[0].id); return live.rows[0].id; }
  if (live.rowCount > 1) return null;   // ambiguous by construction: let the mint's own refusal name it
  // EXACTLY ONE active bank account -> that one; NONE -> a synthetic id (a client with no bank
  // account can only be driving the verbs that HAVE no account subject, for which the value is
  // never compared); SEVERAL -> null, so the gate's own wake_task_account_unbound says so out
  // loud rather than a fixture quietly picking one.
  const acct = await rig.rootQuery(
    "select id from clara.bank_accounts where client_id=$1 and active", [clientId]);
  const bankAccount = acct.rowCount === 1 ? acct.rows[0].id : (acct.rowCount === 0 ? randomUUID() : null);
  const seq = (await rig.rootQuery(
    "select clara._append_event($1,'bank.agent_due',$2,null,null,null,null,null,null,$3::jsonb) as seq",
    [firmId, clientId, JSON.stringify(bankAccount == null ? {} : { bank_account_id: bankAccount })])).rows[0].seq;
  const eventId = (await rig.rootQuery(
    "select id from clara.domain_events where firm_id=$1 and seq=$2", [firmId, seq])).rows[0].id;
  const decision = (await rig.rootQuery(
    `select decision from clara.trigger_taxonomy
      where event_type='bank.agent_due' and version=(select version from clara.taxonomy_active)`)).rows[0].decision;
  const intentId = (await rig.asRuntime((c) => c.query(
    "insert into clara.wake_intents (event_id, decision, taxonomy_version) values ($1,$2,(select version from clara.taxonomy_active)) returning id",
    [eventId, decision]))).rows[0].id;
  const taskId = (await rig.rootQuery(
    "insert into clara.agent_tasks (firm_id, kind, status, origin_intent_id) values ($1,'wake','held',$2) returning id",
    [firmId, intentId])).rows[0].id;
  await rig.rootQuery("update clara.agent_tasks set status='running' where id=$1", [taskId]);
  _bankWakeTasks.set(key, taskId);
  return taskId;
}

/**
 * The pools the frozen bankAgent_v1 closure reaches through globalThis: role clara_wake_bank (not
 * clara_wake_interactive), and mintBankAgentCredential calling
 * clara.mint_wake_credential('bank_agent', firm, null, ttl, client) — the FIRM+CLIENT-scoped mint
 * bank_agent actually uses (unlike close_prep's TASK-scoped door).
 *
 * G1 PR-2a: that mint now DERIVES and binds the client's one live wake task, and refuses when
 * there is none — so the stub materialises the producer's chain first, gated on the gate's own
 * presence so this same file is unchanged against a pre-PR-2a chain. (The comment that used to
 * stand here said this lane's task binding "rides the op_key text alone, not the credential
 * itself". That was true of 0129 and is no longer true of the credential.)
 *
 * Returns the previous value so the caller restores it in its own finally.
 */
export function injectBankPools() {
  const previous = globalThis.__claraPools;
  globalThis.__claraPools = {
    withRuntime: (fn) => rig.asRuntime((c) => fn(c)),
    mintBankAgentCredential: async (firmId, clientId, ttl) => {
      if (await hasBankWakeGate()) await ensureBankWakeTask(firmId, clientId);
      return rig.asRuntime(async (c) => {
        const r = await c.query("select credential_id, secret from clara.mint_wake_credential($1,$2,$3,$4::interval,$5)", [
          "bank_agent", firmId, null, ttl, clientId,
        ]);
        return { secret: String(r.rows[0].secret) };
      });
    },
    // The wake secret is bound TXN-LOCALLY exactly as pools.mjs's own withBankWakeScoped does —
    // set_config(..., true) inside one transaction, COMMITted (not rolled back — get_bank_pack
    // itself writes a pack_read receipt, so even the "read" tool needs a connection that keeps its
    // work). A stub that skipped the SET ROLE clara_wake_bank would make every cell using this
    // VACUOUS — every wrapper's wake_context() would see no wake credential AT ALL.
    //
    // WHAT THIS STUB DOES *NOT* PROVE, said plainly: it sets the role itself rather than going
    // through pools.mjs's own withBankWakeScoped, so the production helper at pools.mjs:500 —
    // including its `set role clara_wake_bank`, which RELAY_TEST_MODE does not bypass — is NOT
    // exercised by any cell in this battery. The role wall itself IS proven, behaviourally, by
    // G1B-F1/F3 calling the verbs as each role and reading the database's own 42501.
    withBankWakeScoped: (secret, fn) =>
      rig.withActor({ role: "clara_wake_bank" }, async (c) => {
        await c.query("begin");
        await c.query("select set_config('clara.wake_secret', $1, true)", [secret]);
        try {
          const out = await fn(c);
          await c.query("commit");
          return out;
        } catch (e) {
          await c.query("rollback").catch(() => {});
          throw e;
        }
      }),
  };
  return previous;
}
