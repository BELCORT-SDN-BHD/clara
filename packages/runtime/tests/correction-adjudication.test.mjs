import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import {
  HIGH_STAKES_CENTS,
  activeFilings,
  approveCorrection,
  approveEntry,
  balanced,
  buildWorld,
  docsReady,
  draftEntry,
  endPool,
  ensureReady,
  fileDocument,
  freshResolution,
  human,
  idOf,
  opk,
  proposeCorrection,
  reverseEntry,
  rootQuery,
  seedVerifiedDocument,
} from "../../db/tests/rig-docs-fixtures.mjs";

let ready = false;
let world;

before(async () => {
  await ensureReady();
  ready = await docsReady();
  if (ready) world = await buildWorld();
});

after(async () => {
  await endPool();
});

async function firmOf(client) {
  return (await rootQuery("select firm_id from clara.clients where id=$1", [client])).rows[0].firm_id;
}

test("correction proposal refuses a destination without authoritative document attribution", async (t) => {
  if (!ready) {
    t.skip("Slice-5 document pipeline is not migrated");
    return;
  }

  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const { documentId } = await seedVerifiedDocument({ firm });
  await fileDocument(users.alice, {
    document: documentId,
    client: clients.A1,
    resolution: await freshResolution(users.alice, clients.A1),
  });
  await assert.rejects(
    proposeCorrection(users.alice, {
      document: documentId,
      fromClient: clients.A1,
      toClient: clients.A2,
      reason: "missing destination attribution",
    }),
    (err) => err?.code === "CLR01",
  );
  assert.equal((await rootQuery(
    "select count(*)::int as n from clara.filing_corrections where document_id=$1",
    [documentId],
  )).rows[0].n, 0, "the refused proposal persists no correction plan");
});

test("correction adopts an exact pending reversal, withdraws a mismatch, and emits one AB-9 recode notification", async (t) => {
  if (!ready) {
    t.skip("Slice-5 document pipeline is not migrated");
    return;
  }

  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const { documentId, sha256 } = await seedVerifiedDocument({ firm });
  await fileDocument(users.alice, {
    document: documentId,
    client: clients.A1,
    resolution: await freshResolution(users.alice, clients.A1),
  });
  const resolution = await freshResolution(users.alice, clients.A1);
  const original = await draftEntry(human(users.alice), {
    client: clients.A1,
    resolution,
    document: documentId,
    sha256,
    lines: balanced({ cash: "1000", sales: "4000" }, HIGH_STAKES_CENTS),
    opKey: opk("correction-original"),
  });
  await approveEntry(users.bob, {
    entry: original.entry_id,
    expectedRevision: original.revision_token,
    opKey: opk("correction-original-approve"),
  });

  const exact = await reverseEntry(users.alice, {
    entry: original.entry_id,
    reason: "pending exact reversal",
    opKey: opk("correction-exact-reversal"),
  });
  assert.equal(exact.status, "draft", "the high-stakes mirror remains pending");

  const mismatch = (await rootQuery(
    `with mirror as (
       insert into clara.journal_entries(
         client_id,status,posting_date,memo,origin,resolution_id,
         is_opening_balance,is_year_end,tax_affecting,maker_actor,last_human_editor,
         reversal_of,reversal_reason
       )
       select client_id,'draft',current_date,'mismatched pending reversal','reversal',resolution_id,
         is_opening_balance,is_year_end,tax_affecting,$2,$2,id,'mismatched pending reversal'
       from clara.journal_entries where id=$1 returning id
     )
     insert into clara.journal_lines(entry_id,line_no,account_code,debit_cents,credit_cents,description)
     select mirror.id,line_no,account_code,
       case when credit_cents > 0 then credit_cents - 1 else 0 end,
       case when debit_cents > 0 then debit_cents - 1 else 0 end,
       description
     from clara.journal_lines cross join mirror where entry_id=$1 order by line_no
     returning entry_id`,
    [original.entry_id, users.alice],
  )).rows[0].entry_id;

  await freshResolution(users.alice, clients.A2, {
    subjectKind: "document",
    subjectId: documentId,
  });
  const proposal = await proposeCorrection(users.alice, {
    document: documentId,
    fromClient: clients.A1,
    toClient: clients.A2,
    reason: "wrong destination client",
  });
  const correction = idOf(proposal, "correction_id", "correction");
  const planHash = proposal.plan_hash ?? (await rootQuery(
    "select plan_hash from clara.filing_corrections where id=$1",
    [correction],
  )).rows[0].plan_hash;
  await approveCorrection(users.bob, { correction, planHash });

  const item = (await rootQuery(
    "select reversal_id, adopted_reversal, outcome from clara.filing_correction_items where correction_id=$1 and entry_id=$2",
    [correction, original.entry_id],
  )).rows[0];
  assert.equal(item.reversal_id, exact.reversal_id, "the exact pending reversal is reused");
  assert.equal(item.adopted_reversal, true);
  assert.equal(item.outcome, "reversed");

  const mismatchRow = (await rootQuery(
    "select status, withdrawal_reason from clara.journal_entries where id=$1",
    [mismatch],
  )).rows[0];
  assert.deepEqual(mismatchRow, {
    status: "withdrawn",
    withdrawal_reason: "superseded-by-correction",
  });

  const notices = (await rootQuery(
    `select client_id, created_by, payload
     from clara.notifications where kind='document_recode_required'
       and payload->>'correction_id'=$1`,
    [correction],
  )).rows;
  assert.equal(notices.length, 1, "exactly one durable recode notification is emitted");
  assert.equal(notices[0].client_id, clients.A2);
  assert.equal(notices[0].created_by, users.bob);
  assert.equal(notices[0].payload.document_id, documentId);
  assert.equal(notices[0].payload.work_kind, "recode_document");
  assert.equal(notices[0].payload.status, "pending");

  const notificationEvents = (await rootQuery(
    `select count(*)::int as n from clara.domain_events
     where event_type='notification.recorded'
       and payload->>'correction_id'=$1`,
    [correction],
  )).rows[0].n;
  assert.equal(notificationEvents, 1, "the notification has one durable domain event");
  assert.equal((await activeFilings(documentId)).filter((f) => f.client_id === clients.A2).length, 1);
});
