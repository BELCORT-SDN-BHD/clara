// F-A2 WINDOW B -- THE BANK-STATEMENT WITNESS ACTIVATION battery, for
// migrations/UNNUMBERED_f_a2_statement_activation.sql (number claimed at merge). NOT
// contract-blind: this lane authored the migration, so every cell targets the ACTUAL installed
// behaviour. Design of record: `docs/plan/active/f-a1-witness-pair-design.md` SS3.7 + the
// F-A1 statement-witness ACTIVATION spec (SS2/SS3/SS6/SS8).
//
// SCOPE: the router re-key (the bank_statement classification arm's engine identity, on an
// UNMOVED statement_facts lane) and the consent re-key (the statement arm's enqueue-time typed
// consent moves to `witness_extraction`). The wb-0020 restore-pair battery (wall 12) is a
// SEPARATE file (tests/wave-b/wb-0020-legacy.test.mjs) and is not duplicated here; the runtime
// half -- the registry repoint, the pre-egress provenance WAIT and the model-call budget --
// lives in packages/runtime/tests/f-a2-statement-{activation,timeout}.test.mjs.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ROLES, rootQuery, endPool } from "./rig-helpers.mjs";
import { printLaneNotes } from "./rig-runtime-helpers.mjs";
import { ensureReady, seedVerifiedDocument, fileDocument } from "./rig-docs-fixtures.mjs";
import { buildWorld, freshResolution } from "./rig-fixtures.mjs";
import { firmOf, filedDocument } from "./s6-helpers.mjs";
import {
  grantPurpose, activatePurpose, deactivatePurpose, consentEvidenceDoc,
} from "./wave-b/wb-0020-helpers.mjs";

const WITNESS_PURPOSE = "witness_extraction";
const STATEMENT_PURPOSE = "statement_extraction";
/** The literal the router now stamps. Held here as the battery's own independent copy: the
 *  engine-literal cell below re-derives the runtime's value from its SOURCE and compares all
 *  three (this constant, the runtime module, the installed catalog body) rather than deriving
 *  any one of them from another. */
const STATEMENT_WITNESS_ENGINE_ID = "llm-openai:gpt-5.6-terra:stmt-witness-v1";
const AZURE_STATEMENT_ENGINE_ID = "azure-di:prebuilt-bankStatement.us:2024-11-30";

let ready = false;
let world = null;

/** THE CAPABILITY, read from the catalog -- the instrument production itself uses. TWO
 *  independently-checked facts, not one: the router's bank_statement arm actually minting the
 *  witness engine identity, AND the statement typed-consent lookup actually reading
 *  `witness_extraction`. A HALF-applied activation (one half spliced, the other not) is DRIFT,
 *  not dormancy, and must fail loudly rather than silently skip. */
async function activationReady() {
  const r = await rootQuery(`
    with body as (
      select p.prosrc as src from pg_proc p
        where p.oid = 'clara._enqueue_invoice_facts_core(uuid)'::regprocedure)
    select position($1 in src) > 0 as router_cut,
           position($2 in src) = 0 as consent_cut,
           position($3 in src) = 0 as azure_gone
      from body`,
    [`v_lane:='statement_facts'; v_engine:='${STATEMENT_WITNESS_ENGINE_ID}';`,
      `and a.purpose='${STATEMENT_PURPOSE}'`,
      AZURE_STATEMENT_ENGINE_ID]);
  const s = r.rows[0];
  if (!s.router_cut && !s.consent_cut && !s.azure_gone) return false;
  if (!s.router_cut || !s.consent_cut || !s.azure_gone) {
    throw new Error(`F-A2 WINDOW B DRIFT: a half-applied activation -- router_cut=${s.router_cut} consent_cut=${s.consent_cut} azure_gone=${s.azure_gone} -- apply the statement-activation migration as a whole`);
  }
  return true;
}

before(async () => {
  await ensureReady();
  ready = await activationReady();
  if (!ready) return;
  world = await buildWorld();
});

after(async () => {
  printLaneNotes("f-a2-statement-activation");
  await endPool();
});

function mustBeReady() {
  assert.ok(ready, "the F-A2 Window-B statement-activation migration is not applied on this database -- this battery must FAIL, not skip, against a pre-activation chain");
}

async function tasksOf(document) {
  const r = await rootQuery(
    "select id, lane, status, error_code, engine_id, version_n from clara.document_processing_tasks where document_id=$1 order by id",
    [document]);
  return r.rows;
}

async function eventCount(firm, type, document = null) {
  const r = document
    ? await rootQuery("select count(*)::int n from clara.domain_events where firm_id=$1 and event_type=$2 and document_id=$3", [firm, type, document])
    : await rootQuery("select count(*)::int n from clara.domain_events where firm_id=$1 and event_type=$2", [firm, type]);
  return r.rows[0].n;
}

async function reservationCount(taskId) {
  const r = await rootQuery("select count(*)::int n from clara.processing_call_reservations where task_id=$1", [taskId]);
  return r.rows[0].n;
}

/** Grant + activate a purpose for a client, asserting BOTH steps landed (a silent
 *  grant-without-activation would make every downstream cell test the wrong thing). */
async function liveConsent(sub, { firm, client, purpose }) {
  const evidence = await consentEvidenceDoc(sub, { firm });
  const grant = await grantPurpose(sub, { client, purpose, evidenceDocument: evidence.documentId });
  assert.equal(grant.status, "live", `${purpose} grant must succeed (got ${JSON.stringify(grant)})`);
  const activate = await activatePurpose(sub, { client, purpose, consent: grant.consent_id });
  assert.equal(activate.status, "active", `${purpose} activation must succeed (got ${JSON.stringify(activate)})`);
  return grant.consent_id;
}

test("META: the statement-activation migration is applied", async () => {
  mustBeReady();
});

// ===========================================================================
// SECTION 1 -- the router re-key: a new engine identity on an UNMOVED lane.
// ===========================================================================

test("f-a2.activation.a a bank_statement pdf with a live witness_extraction consent enqueues on statement_facts with the WITNESS engine identity", async () => {
  mustBeReady();
  const { users, clients } = world;
  const firm = await firmOf(clients.A2);
  await liveConsent(users.alice, { firm, client: clients.A2, purpose: WITNESS_PURPOSE });

  const doc = await filedDocument(users.alice, { firm, client: clients.A2, kind: "bank_statement" });
  const tasks = await tasksOf(doc.documentId);
  assert.equal(tasks.length, 1, `exactly one task minted (got ${JSON.stringify(tasks)})`);
  const t = tasks[0];
  assert.equal(t.lane, "statement_facts", "THE LANE DOES NOT MOVE -- 0098's LANE DECISION; llm_witness would be resolved as an INVOICE corroboration");
  assert.equal(t.status, "queued", `with a live witness consent the task queues (got ${JSON.stringify(t)})`);
  assert.equal(t.engine_id, STATEMENT_WITNESS_ENGINE_ID, "the re-keyed engine literal");
  assert.notEqual(t.engine_id, AZURE_STATEMENT_ENGINE_ID, "the retiring vendor identity must never be stamped again");
});

test("f-a2.activation.b the statement lane KEEPS its page-budget reservation -- 0098's \"NO LAPSE HERE\"", async () => {
  mustBeReady();
  const { users, clients } = world;
  const firm = await firmOf(clients.A2);
  // A2 already carries the live witness consent from cell (a); a second filed statement mints a
  // second task, and the reservation is what this cell is about.
  const doc = await filedDocument(users.alice, { firm, client: clients.A2, kind: "bank_statement" });
  const tasks = await tasksOf(doc.documentId);
  assert.equal(tasks.length, 1);
  const t = tasks[0];
  assert.equal(t.lane, "statement_facts");
  assert.equal(t.status, "queued", `(got ${JSON.stringify(t)})`);
  // The invoice half's registered spend exposure (llm_witness joins NEITHER reserving arm) does
  // NOT extend to statements, precisely because the lane did not move. Asserted rather than
  // assumed: a reservation row must EXIST.
  assert.equal(await reservationCount(t.id), 1, "statement_facts is still in the enqueue-time page-budget reserving set");
});

test("f-a2.activation.c the OTHER statement lane (csv/ofx statement_parse) is byte-untouched", async () => {
  mustBeReady();
  // Read off the installed body rather than driven through a filing: the csv arm's own mime
  // gate is unrelated to this migration, and what the migration promises is that its TEXT did
  // not move.
  const src = (await rootQuery(
    "select prosrc from pg_proc where oid='clara._enqueue_invoice_facts_core(uuid)'::regprocedure")).rows[0].prosrc;
  assert.ok(src.includes("v_lane:='statement_parse'; v_engine:='clara-statement-parse:v1';"),
    "the csv/ofx arm must survive verbatim");
  assert.ok(src.includes("v_lane:='classify'; v_engine:='clara-classify-llm:v1';"), "the classify arm must survive verbatim");
  assert.ok(src.includes("v_lane:='local_facts'; v_engine:='clara-myinvois:v1';"), "the xml arm must survive verbatim");
  // The skipped_kind receipt still stamps the retiring Azure INVOICE constant -- proof this
  // migration removed the bank-statement literal specifically, not every azure-di string.
  assert.ok(src.includes("'azure-di:prebuilt-invoice:2024-11-30','{}'::jsonb"),
    "the skipped_kind receipt's own engine constant must survive verbatim");
});

// ===========================================================================
// SECTION 2 -- the consent re-key, with its negative twin.
// ===========================================================================

test("f-a2.activation.d a client with NO witness_extraction consent REFUSES the statement enqueue -- consent_inactive, this arm's OWN code", async () => {
  mustBeReady();
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const before_ = await eventCount(firm, "document.statement_facts_failed");

  const doc = await filedDocument(users.alice, { firm, client: clients.A1, kind: "bank_statement" });
  const tasks = await tasksOf(doc.documentId);
  assert.equal(tasks.length, 1, `exactly one (terminal) task minted (got ${JSON.stringify(tasks)})`);
  const t = tasks[0];
  assert.equal(t.lane, "statement_facts");
  assert.equal(t.status, "failed", `no live witness consent must refuse at enqueue (got ${JSON.stringify(t)})`);
  assert.equal(t.error_code, "consent_inactive",
    "the STATEMENT arm keeps its own vocabulary -- never the llm_witness arm's witness_consent_inactive");
  assert.equal(t.engine_id, STATEMENT_WITNESS_ENGINE_ID, "even the refusal receipt carries the re-keyed identity");

  assert.equal(await eventCount(firm, "document.statement_facts_failed"), before_ + 1,
    "exactly one document.statement_facts_failed event -- the statement twin, not the invoice one");
  // The filing transaction is NOT aborted: the gate writes a terminal receipt, never a raise.
  const filing = await rootQuery("select 1 from clara.document_filings where document_id=$1 and retired_at is null", [doc.documentId]);
  assert.equal(filing.rowCount, 1, "the filing transaction committed -- the enqueue refusal never rolled it back");
});

test("f-a2.activation.e THE NEGATIVE TWIN: a consent activated ONLY for the retiring purpose now REFUSES", async () => {
  mustBeReady();
  const { users, clients } = world;
  const firm = await firmOf(clients.B1);
  // A SECOND FIRM on purpose: cells (e)-(g) walk one client through three consent states, and
  // doing that on firm A would entangle them with the A1/A2 cells above.
  // The pre-re-key shape, in full: a real, live, ACTIVE statement_extraction consent. Before
  // this migration it admitted; after it, it must not -- which is what proves the re-key MOVED
  // the literal rather than widening the check to accept either purpose.
  await liveConsent(users.dave, { firm, client: clients.B1, purpose: STATEMENT_PURPOSE });

  const doc = await filedDocument(users.dave, { firm, client: clients.B1, kind: "bank_statement" });
  const tasks = await tasksOf(doc.documentId);
  assert.equal(tasks.length, 1, `exactly one task minted (got ${JSON.stringify(tasks)})`);
  const t = tasks[0];
  assert.equal(t.status, "failed",
    "a statement_extraction-only activation must NOT satisfy the re-keyed lookup (got a queued task -- the check was widened, not moved)");
  assert.equal(t.error_code, "consent_inactive");
});

test("f-a2.activation.f the SAME client, once witness_extraction is activated, enqueues normally", async () => {
  mustBeReady();
  const { users, clients } = world;
  const firm = await firmOf(clients.B1);
  // Continues cell (e) on the same client: the statement_extraction activation is untouched and
  // still on file, so this cell also proves the two purposes coexist rather than replace.
  await liveConsent(users.dave, { firm, client: clients.B1, purpose: WITNESS_PURPOSE });

  const doc = await filedDocument(users.dave, { firm, client: clients.B1, kind: "bank_statement" });
  const tasks = await tasksOf(doc.documentId);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].status, "queued", `(got ${JSON.stringify(tasks[0])})`);
  assert.equal(tasks[0].engine_id, STATEMENT_WITNESS_ENGINE_ID);

  const rows = await rootQuery(
    "select purpose from clara.client_egress_purpose_activations where client_id=$1 and deactivated_at is null order by purpose",
    [clients.B1]);
  assert.deepEqual(rows.rows.map((x) => x.purpose), [STATEMENT_PURPOSE, WITNESS_PURPOSE],
    "the retiring purpose is never dropped -- historical rows reference it (the 0038:5462 by-name-drop contract)");
});

test("f-a2.activation.g deactivating witness_extraction makes a SUBSEQUENT statement enqueue refuse again", async () => {
  mustBeReady();
  const { users, clients } = world;
  const firm = await firmOf(clients.B1);
  const off = await deactivatePurpose(users.dave, { client: clients.B1, purpose: WITNESS_PURPOSE });
  assert.equal(off.status, "deactivated", `deactivation must succeed (got ${JSON.stringify(off)})`);

  const doc = await filedDocument(users.dave, { firm, client: clients.B1, kind: "bank_statement" });
  const tasks = await tasksOf(doc.documentId);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].status, "failed", `(got ${JSON.stringify(tasks[0])})`);
  assert.equal(tasks[0].error_code, "consent_inactive");
});

test("f-a2.activation.g2 REGISTERED SIDE EFFECT: the csv/ofx statement_parse lane moved WITH the re-key -- one branch gates both lanes", async () => {
  mustBeReady();
  const { users, clients } = world;
  const firm = await firmOf(clients.B1);
  // The typed-consent branch opens `if v_lane in ('statement_facts','statement_parse')` -- ONE
  // branch, TWO lanes -- so re-keying its purpose moved the FREE, LOCAL csv/ofx parse lane too,
  // even though it egresses nothing. That is what the deferral contract asks for (0098:161-165
  // names the arm, whole), and it is not a new oddity: the csv lane was already gated on an
  // egress purpose. This cell exists so the consequence is VISIBLE in the battery rather than
  // discovered later by a firm whose csv statements stopped enqueueing. B1's witness activation
  // is deactivated by cell (g) above, so this is the refusal side; the admit side follows.
  const csv = await seedVerifiedDocument({ firm, kind: "bank_statement", mime: "text/csv", filename: "rig.csv" });
  await fileDocument(users.dave, {
    document: csv.documentId,
    client: clients.B1,
    resolution: await freshResolution(users.dave, clients.B1, { subjectKind: "document", subjectId: csv.documentId }),
  });
  const refused = await tasksOf(csv.documentId);
  assert.equal(refused.length, 1, `exactly one task minted (got ${JSON.stringify(refused)})`);
  assert.equal(refused[0].lane, "statement_parse", "a csv bank_statement still routes to the LOCAL parse lane -- the lane is untouched");
  assert.equal(refused[0].status, "failed",
    "with no live witness_extraction activation the csv lane now refuses too -- the registered side effect, asserted rather than assumed");
  assert.equal(refused[0].error_code, "consent_inactive");
  assert.equal(refused[0].engine_id, "clara-statement-parse:v1", "the csv lane's own engine literal is byte-untouched by this migration");

  // …and the admit side, so the cell can say YES as well as NO. Cell (g) deactivated the
  // ACTIVATION, not the CONSENT — the consent record survives a deactivation by design — so the
  // way back is to re-activate that same consent, never to grant a second one (the writer
  // refuses a duplicate live consent, which is itself the 0020 contract).
  const liveRow = await rootQuery(
    "select id from clara.client_egress_purpose_consents where client_id=$1 and purpose=$2 and revoked_at is null order by granted_at desc limit 1",
    [clients.B1, WITNESS_PURPOSE]);
  assert.equal(liveRow.rowCount, 1, "cell (g) deactivated the activation; the CONSENT record must have survived");
  const back = await activatePurpose(users.dave, { client: clients.B1, purpose: WITNESS_PURPOSE, consent: liveRow.rows[0].id });
  assert.equal(back.status, "active", `re-activation must succeed (got ${JSON.stringify(back)})`);
  const csv2 = await seedVerifiedDocument({ firm, kind: "bank_statement", mime: "text/csv", filename: "rig.csv" });
  await fileDocument(users.dave, {
    document: csv2.documentId,
    client: clients.B1,
    resolution: await freshResolution(users.dave, clients.B1, { subjectKind: "document", subjectId: csv2.documentId }),
  });
  const admitted = await tasksOf(csv2.documentId);
  assert.equal(admitted.length, 1);
  assert.equal(admitted[0].lane, "statement_parse");
  assert.equal(admitted[0].status, "queued",
    `the witness activation re-opens the csv lane (got ${JSON.stringify(admitted[0])})`);
});

test("f-a2.activation.h TWO active filing clients still refuse statement_multi_client -- the gate's other verdict is unmoved", async () => {
  mustBeReady();
  const { users, clients } = world;
  const firm = world.firms.A;
  // The x38.v shape, through the real filing door twice: the multi-client branch runs BEFORE
  // the activation lookup, so this verdict must be untouched by the purpose re-key. Note A2
  // holds a live witness_extraction consent from cell (a) -- which is the point: a consented
  // client does not rescue a document whose ownership is ambiguous.
  const seed = await seedVerifiedDocument({ firm, kind: "bank_statement" });
  for (const client of [clients.A1, clients.A2]) {
    await fileDocument(users.alice, {
      document: seed.documentId,
      client,
      resolution: await freshResolution(users.alice, client, { subjectKind: "document", subjectId: seed.documentId }),
    });
  }
  const filings = await rootQuery(
    "select count(*)::int n from clara.document_filings where document_id=$1 and retired_at is null", [seed.documentId]);
  assert.equal(filings.rows[0].n, 2, "the document carries two ACTIVE filings (mandatory setup)");

  const r = await rootQuery("select clara._enqueue_invoice_facts_core($1) as r", [seed.documentId]);
  assert.equal(r.rows[0].r.reason, "statement_multi_client",
    `two active filing clients must refuse statement_multi_client (got ${JSON.stringify(r.rows[0].r)})`);
});

// ===========================================================================
// SECTION 3 -- the engine literal contract, read from BOTH sides and compared.
// ===========================================================================

test("f-a2.activation-engine-literal the router's literal string-equals the runtime's STATEMENT_WITNESS_ENGINE_SNAPSHOT.engineId", async () => {
  mustBeReady();
  // Three INDEPENDENT reads, none derived from another: this battery's own constant, the
  // runtime module's SOURCE (parsed for the two parts the snapshot is built from), and the
  // installed catalog body. A DB-side migration cannot read a .mjs file, so this cell IS the
  // enforcement of the pairing the migration's header declares -- and the workflow WAITS rather
  // than egressing if the two ever drift, so a failure here is a stalled lane, not a wrong read.
  const runtimeSrc = readFileSync(new URL("../../runtime/workflows/statementFacts.v2.services.mjs", import.meta.url), "utf8");
  const modelMatch = /STATEMENT_WITNESS_MODEL_ID = process\.env\.CLARA_STATEMENT_WITNESS_MODEL_ID \|\| "([^"]+)"/.exec(runtimeSrc);
  const versionMatch = /STATEMENT_WITNESS_ENGINE_VERSION = "([^"]+)"/.exec(runtimeSrc);
  assert.ok(modelMatch, "STATEMENT_WITNESS_MODEL_ID's default must be readable from the runtime source");
  assert.ok(versionMatch, "STATEMENT_WITNESS_ENGINE_VERSION must be readable from the runtime source");
  const runtimeEngineId = `llm-openai:${modelMatch[1]}:${versionMatch[1]}`;
  assert.equal(runtimeEngineId, STATEMENT_WITNESS_ENGINE_ID, "the migration's hardcoded literal must string-equal the runtime's derived default");

  const routerSrc = (await rootQuery(
    "select prosrc from pg_proc where oid='clara._enqueue_invoice_facts_core(uuid)'::regprocedure")).rows[0].prosrc;
  assert.ok(routerSrc.includes(`v_engine:='${runtimeEngineId}'`),
    "the router's own catalog source must carry the SAME literal, read independently");
  assert.ok(!routerSrc.includes(AZURE_STATEMENT_ENGINE_ID), "and must no longer carry the retiring one");
});

test("f-a2.activation.i the INVOICE witness arm is untouched -- this migration edits the statement path only", async () => {
  mustBeReady();
  const src = (await rootQuery(
    "select prosrc from pg_proc where oid='clara._enqueue_invoice_facts_core(uuid)'::regprocedure")).rows[0].prosrc;
  assert.ok(src.includes("elsif v_lane='llm_witness' then"), "the llm_witness typed-consent branch survives");
  assert.ok(src.includes("v_gate:='witness_multi_client';"), "…with its own refusal codes");
  assert.ok(src.includes("v_gate:='witness_consent_inactive';"));
  assert.ok(src.includes("d.document_kind in ('invoice','credit_note','debit_note','receipt')"), "the invoice-kind condition set survives");
  assert.ok(src.includes("if v_task is null and v_lane='llm_witness' then"), "the M-4 EITHER-REGIME short-circuit survives");
  // The witness_extraction lookup now appears TWICE: the re-keyed statement arm and the
  // untouched llm_witness arm. Counted, because a third would mean the splice hit something it
  // was not aimed at.
  assert.equal(src.split("and a.purpose='witness_extraction'").length - 1, 2,
    "exactly two witness_extraction activation lookups -- the re-keyed statement arm and the untouched llm_witness arm");
});

// ===========================================================================
// SECTION 4 -- the pre-window backlog: the tasks that straddle the ceremony.
// ===========================================================================

test("f-a2.activation.j a PRE-window Azure-stamped statement task is still storable and still claimable after the migration", async () => {
  mustBeReady();
  const { clients } = world;
  const firm = await firmOf(clients.A1);
  const seed = await seedVerifiedDocument({ firm, client: null, kind: "bank_statement" });
  // The population the activation spec's SS3 in-flight discipline is about: enqueued BEFORE the
  // router re-key, so stamped with the retiring identity, still queued when the window closes.
  // The lane<->engine CHECK must still ADMIT it -- the migration widened nothing and narrowed
  // nothing, so the backlog is never invalidated by the flip.
  const ins = await rootQuery(
    `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,engine_config,version_n,lane,status)
     values($1,$2,$3,'{}'::jsonb,1,'statement_facts','queued') returning id`,
    [firm, seed.documentId, AZURE_STATEMENT_ENGINE_ID]);
  const taskId = ins.rows[0].id;
  const row = (await rootQuery("select lane, status, engine_id from clara.document_processing_tasks where id=$1", [taskId])).rows[0];
  assert.equal(row.engine_id, AZURE_STATEMENT_ENGINE_ID,
    "the retiring identity is still ADMISSIBLE on statement_facts -- the pre-window backlog is not invalidated by the re-key");
  assert.equal(row.status, "queued");
  // What happens NEXT is the runtime's job and is proven there: statementFacts_v2's pre-egress
  // provenance guard WAITS on this stamp rather than egressing under a receipt naming a model it
  // did not call (packages/runtime/tests/f-a2-statement-activation.test.mjs). Named here so the
  // two halves of the in-flight story are findable from either side.
});

test("f-a2.activation.k the persist half is live and still EXECUTE-granted to the runtime", async () => {
  mustBeReady();
  // The re-key decides which engine STAMPS the task; 0098's verb is what SETTLES it. A re-keyed
  // lane whose settle verb was ungranted would mint tasks nothing could finish.
  const r = await rootQuery(`
    select exists (select 1 from pg_proc p, aclexplode(p.proacl) a
      where p.oid='clara.persist_statement_facts_v2(uuid,jsonb)'::regprocedure
        and a.grantee=$1::regrole and a.privilege_type='EXECUTE') as granted`, [ROLES.runtime]);
  assert.equal(r.rows[0].granted, true, "persist_statement_facts_v2 must stay EXECUTE-granted to the runtime role");
});
