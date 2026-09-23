// F-A4 PR-2a -- the prepayment-limb battery's shared fixture CORE (NOT a test file: the name does
// not end in `.test.mjs`, so `node --test` ignores it). Split out so each battery file stays under
// the repo's 500-line convention, the f-a4-pr1c-fixtures precedent.
//
// CONTRACT-BLIND: every readiness probe reads the LIVE CATALOG by EXACT SIGNATURE, never the
// migration's SQL text and never a migration NUMBER -- numbers are claimed at merge, so a number
// gate would break the moment this train is renumbered.

import { rootQuery, opk, waveAEnsureReady, buildWorld, firmOf, freshResolution } from "./wave-a-fixtures.mjs";
import { wakeQuery, ROLES, humanQuery } from "./rig-helpers.mjs";
import { upsertAccount } from "./rig-fixtures.mjs";
import { has0056, cleanCloseableFY } from "./x56-fixtures.mjs";
import { seedVerifiedDocument, fileDocument } from "./rig-docs-fixtures.mjs";
import { mintClosePrepSession, derivedOpKey, uniq, RATIONALE, MODEL, caught, tokens }
  from "./f-a4-pr1c-fixtures.mjs";

export { derivedOpKey, uniq, RATIONALE, MODEL, caught, tokens, rootQuery, opk };

export const VERB12 = "wake_establish_prepayment_schedule";
export const TARGET_BASIS = "f-a4-pr2a battery: the invoice narrates a subscription service";

/** Frontier probe. Every object is asked by EXACT regprocedure/regclass -- law 3: a bare name is a
 *  projection of the thing, a signature IS the thing. */
export async function hasPR2A() {
  const r = await rootQuery(
    `select (to_regprocedure('clara.wake_establish_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)') is not null) as wrapper,
            (to_regprocedure('clara.prepayment_schedule_v1(uuid,uuid)') is not null) as evaluator,
            (to_regprocedure('clara._adj_period_lines(jsonb,jsonb,date,date)') is not null) as resolver,
            (to_regclass('clara.document_service_periods') is not null) as carrier,
            (to_regprocedure('clara.record_document_service_period(uuid,date,date,text,text)') is not null) as door,
            exists (select 1 from pg_attribute where attrelid = 'clara.adjustment_templates'::regclass
                      and attname = 'schedule' and not attisdropped) as schedule_col`);
  const x = r.rows[0];
  return Boolean(x.wrapper && x.evaluator && x.resolver && x.carrier && x.door && x.schedule_col);
}

const state = { ready: false, has56: false, hasLimb: false };

export async function ensurePrepay(noteLane) {
  state.ready = await waveAEnsureReady();
  if (!state.ready) { noteLane("0011 surface absent -- f-a4-pr2a battery skipped"); return state; }
  state.has56 = await has0056();
  if (!state.has56) { noteLane("0056 (close model) absent -- f-a4-pr2a battery skipped"); return state; }
  state.hasLimb = await hasPR2A();
  if (!state.hasLimb) noteLane("F-A4 PR-2a (the prepayment limb) not applied -- battery dormant");
  return state;
}

/** THE ARMED SKIP (Annex A's own defence). It never gates on a flag assigned in `before()` -- the
 *  0136 lesson, where `{skip: flag}` always read the INITIAL value -- and every skip PRINTS the
 *  catalog fact that caused it, so a skipped run is legible as a decision rather than a silence. */
export function prepayGate(t, markSkip) {
  if (!state.ready || !state.has56 || !state.hasLimb) {
    markSkip();
    t.skip(`F-A4 PR-2a dormant (waveA=${state.ready} x56=${state.has56} limb=${state.hasLimb}) -- probed at the live catalog`);
    return true;
  }
  return false;
}

/** An account minted through the GOVERNED door, never a hand-built COA row. */
export async function account(sub, { client, code, name, type }) {
  await upsertAccount(sub, { client, code, name, type, opKey: opk("fa4p2a-acct") });
  return code;
}

/** THE PREPAID SCENE: a closeable FY, a verified document, a dedicated prepaid-ASSET account and a
 *  dedicated EXPENSE target, and an APPROVED entry debiting the asset. Everything through governed
 *  doors -- a hand-built entry would prove the evaluator reads rows, not that it reads BOOKS. */
export async function prepaidScene(tag, { cents = 120000, startsOn = "2025-01-01",
    postingDate = "2025-01-15" } = {}) {
  const w = await buildWorld();
  const alice = w.users.alice, bob = w.users.bob;
  const fx = await cleanCloseableFY(alice, { tag: `fa4p2a_${tag}_${uniq()}`, prepSub: bob, startsOn });
  const firm = await firmOf(fx.client);
  const u = uniq();
  // Codes are 8 DIGITS because ck_coa_account_code_0009 admits only `^[0-9]{4,8}$` or
  // `^[0-9]{3}-[0-9A-Z]{2,4}$` -- read off the constraint, not guessed. Fixed values are safe
  // because every scene builds its own client.
  const prepaid = await account(alice, {
    client: fx.client, code: "19000001", name: `Prepayments (${u})`, type: "asset" });
  const target = await account(alice, {
    client: fx.client, code: "59000001", name: `Subscriptions (${u})`, type: "expense" });
  // Seeded at FIRM scope then FILED to the client through the governed door. Binding a document to
  // an entry needs the client attribution that filing establishes -- a document seeded straight at
  // client scope answers "client attribution not established" at draft time. Measured.
  const doc = await seedVerifiedDocument({ firm, client: null, filename: `prepay-${u}.pdf` });
  await fileDocument(alice, { document: doc.documentId, client: fx.client, opKey: opk("fa4p2a-file") });
  const { draftEntryV3, approveEntry } = await import("./wave-a-reads.mjs");
  // THE DOCUMENT IS BOUND AT THE DOOR, never by a later UPDATE. Measured, not assumed: the estate
  // refuses an ordinary UPDATE on a journal entry at EVERY status -- an approved one answers
  // "approved entries permit only a complete reversal-linkage pair" and even a draft answers
  // "illegal change to entry (status draft -> draft)". Two cuts of this fixture died there before
  // I read clara.draft_entry's own arguments and found it takes p_document / p_sha256. The wall is
  // right; the fixture moved.
  const d = await draftEntryV3(alice, {
    client: fx.client,
    // A DOCUMENT resolution naming this document -- clara.assert_client_resolved refuses a
    // document-bearing draft whose resolution does not establish the client through that document
    // ("client attribution not established"). A `manual` resolution does not, and it is not the
    // door being fussy: the resolution is what ties the client to the evidence.
    resolution: await freshResolution(alice, fx.client,
      { subjectKind: "document", subjectId: doc.documentId }),
    memo: `prepaid subscription ${u}`, postingDate,
    document: doc.documentId, sha256: doc.sha256,
    lines: [
      { account_code: prepaid, debit_cents: cents, credit_cents: 0, description: "prepaid" },
      { account_code: "170-C56", debit_cents: 0, credit_cents: cents, description: "paid" },
    ],
    opKey: opk("fa4p2a-draft"),
  });
  // Approved by a DIFFERENT human: maker != checker is the estate's own rule, and an entry that
  // never cleared it would make every "approved" assertion below vacuous.
  await approveEntry(bob, { entry: d.entry_id, expectedRevision: d.revision_token,
    opKey: opk("fa4p2a-appr") });
  const s = await mintClosePrepSession(firm, fx.client);
  return { w, alice, bob, firm, ...fx, prepaid, target, cents,
    document: doc.documentId, entry: d.entry_id, s };
}

/** The human door, called as a real bookkeeper through the governed path. */
export function recordPeriod(sub, { document, start, end,
    basis = "f-a4-pr2a battery: the invoice states the service term on its face" }) {
  return humanQuery(sub,
    `select clara.record_document_service_period($1::uuid,$2::date,$3::date,$4,$5) as r`,
    [document, start, end, basis, opk("fa4p2a-period")]).then((r) => r.rows[0].r);
}

/** Propose a template through the REAL door as a human, with an optional explicit schedule. */
export function proposeTemplate(sub, { client, name, start, end, lines, schedule = null,
    memo = "fa4p2a", cadence = "monthly" }) {
  return humanQuery(sub,
    `select clara.propose_adjustment_template($1::uuid,$2,$3,$4::date,$5::date,false,
       $6::jsonb,$7,$8,null,$9::jsonb) as r`,
    [client, name, cadence, start, end, JSON.stringify(lines), memo, opk("fa4p2a-prop"),
      schedule === null ? null : JSON.stringify(schedule)]).then((r) => r.rows[0].r);
}

/** Does THIS database carry #927's retirement of the human template doors (migration 0282)?
 *  Read off `clara.schema_migrations` by STEM, never by number -- numbers are claimed at merge.
 *  Memoised per process, like every other frontier probe in this battery. */
let _retired = null;
export async function adjTemplateDoorsRetired() {
  if (_retired !== null) return _retired;
  const r = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ 'retire_adjustment_template_doors$'");
  _retired = Number(r.rows[0].n) > 0;
  return _retired;
}

/** THE LANE'S MINT, AT TWO FRONTIERS [#927]. Below 0282 this is the real propose door. Above it
 *  the door is one typed refusal (owner ruling #788: retire the 0045 recurring-adjustment template
 *  lane), so the row is written directly -- with the stored line canon and `content_hash` computed
 *  through the DB's own `clara._adj_canon_lines` / `clara._adj_template_hash`, the very bodies the
 *  door called, so the row is byte-for-byte what a proposal produced. Used ONLY by cells whose
 *  subject is the RESOLVER, the storage layer or the books; a cell whose subject is the door's own
 *  validation asserts the retirement instead (`proposeDoorRetired` in the battery files). */
export async function mintTemplate(sub, { client, name, cadence = "monthly", start, end = null,
    lines, schedule = null, memo = "fa4p2a", opKey = null }) {
  if (!(await adjTemplateDoorsRetired())) {
    return proposeTemplate(sub, { client, name, cadence, start, end, lines, schedule, memo, opKey });
  }
  const r = await rootQuery(
    `with canon as (select clara._adj_canon_lines($5::jsonb) as l)
     insert into clara.adjustment_templates(firm_id, client_id, status, name, cadence, start_date,
         end_date, auto_reverse, lines, memo_template, content_hash, schedule, proposed_by,
         proposed_op_key)
     select c.firm_id, $1::uuid, 'proposed', $2, $9, $3::date, $4::date, false, canon.l, $6,
            clara._adj_template_hash($2, $9, $3::date, $4::date, false, canon.l, $6, $7::jsonb),
            $7::jsonb, $8::uuid, coalesce($10, 'fa4p2a-raw-' || gen_random_uuid()::text)
       from clara.clients c, canon
      where c.id = $1::uuid
     returning id`,
    [client, name, start, end, JSON.stringify(lines), memo,
     schedule === null ? null : JSON.stringify(schedule), sub, cadence, opKey]);
  return { template_id: r.rows[0].id };
}

/** Sign, at two frontiers [#927]: the real door below 0282, and above it the transition the door
 *  performed, written directly with the user triggers silenced (`clara._tf_adjustment_template_
 *  transition` refuses every non-lifecycle UPDATE by design, which is the law f-a4-pr2a-schedule's
 *  W36-immutability cell pins and not something to weaken). Used by cells whose subject is what
 *  happens AFTER a template goes live -- the books. */
export async function makeTemplateLive(sub, { client, template }) {
  if (!(await adjTemplateDoorsRetired())) {
    return (await humanQuery(sub,
      "select clara.sign_adjustment_template($1::uuid,$2::uuid,$3) as r",
      [client, template, opk("fa4p2a-sign")])).rows[0].r;
  }
  await rootQuery(`do $do$ begin
    perform set_config('session_replication_role','replica',true);
    update clara.adjustment_templates
       set status = 'live', signed_by = proposed_by, signed_at = now(),
           signed_op_key = 'fa4p2a-raw-sign-' || gen_random_uuid()::text
     where id = '${template}'::uuid;
  end $do$;`);
  return { status: "live", template_id: template };
}

/** The residue of a cell whose whole subject is a propose-door validation #927 retired: drive the
 *  door once and prove it refuses for the retirement, by its own reason token. Answers true when
 *  the original law is no longer reachable, so the caller returns; false below 0282, where the
 *  original body runs unchanged. NEVER a skip -- a skip is not evidence, and this battery's
 *  `armed-skip` cell counts them. */
export async function proposeDoorRetired(sub, { client, lines, law }) {
  if (!(await adjTemplateDoorsRetired())) return false;
  const err = await caught(() => proposeTemplate(sub, {
    client, name: `retired-probe-${uniq()}`, start: "2025-02-01", end: "2025-02-28", lines }));
  if (!err) throw new Error(`${law}: the propose door answered -- it must REFUSE once 0282 is applied`);
  const reason = (() => { try { return JSON.parse(err.detail).reason; } catch { return null; } })();
  if (reason !== "adjustment_template_lane_retired") {
    throw new Error(`${law}: the door refused with ${reason}, not the #927 retirement`);
  }
  return true;
}

/** A two-line pair, the shape every prepayment occurrence posts. */
export function pair(dr, cr, cents) {
  return [{ account_code: dr, debit_cents: cents, credit_cents: 0, description: "d" },
          { account_code: cr, debit_cents: 0, credit_cents: cents, description: "c" }];
}

/** Wrapper 12 through a REAL clara_wake_interactive session -- the production path, so a missing
 *  grant or an argument-name mismatch is a finding here rather than something a direct core call
 *  would smooth over. */
export function wake12(s, { client, entry, target, basis = TARGET_BASIS,
    rationale = RATIONALE, model = MODEL, opKey } = {}) {
  const sql = `select clara.${VERB12}(p_client => $1::uuid, p_source_entry => $2::uuid,
      p_target_account => $3, p_target_basis => $4, p_rationale => $5,
      p_model => $6::jsonb, p_op_key => $7) as r`;
  return wakeQuery(ROLES.wakeInteractive, s.secret, sql,
    [client, entry, target, basis, rationale, JSON.stringify(model),
      opKey ?? derivedOpKey(s.task, VERB12, client)]).then((r) => r.rows[0].r);
}

export async function templateById(id) {
  const r = await rootQuery("select * from clara.adjustment_templates where id = $1", [id]);
  return r.rows[0] ?? null;
}

export async function periodRows(document) {
  const r = await rootQuery(
    "select * from clara.document_service_periods where document_id = $1 order by recorded_at, id",
    [document]);
  return r.rows;
}

export async function receiptsForTask(task) {
  const r = await rootQuery(
    "select * from clara.agent_act_receipts where wake_task_id = $1 order by created_at, id", [task]);
  return r.rows;
}

/** The evaluator, called directly as root -- for the arithmetic cells, which are about the FORMULA
 *  and should not have to walk the whole ladder to reach it. */
export async function evaluate(client, entry) {
  const r = await rootQuery("select clara.prepayment_schedule_v1($1,$2) as r", [client, entry]);
  return r.rows[0].r;
}
