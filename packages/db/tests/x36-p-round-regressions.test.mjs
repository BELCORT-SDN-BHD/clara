// Task #36 consolidated P-round regressions.
//
// New coverage only: existing x36-vendor-binding-*.test.mjs files deliberately
// remain untouched for their separately-owned signature/fixture rewrite.
//
//   P-B/C/E1: a production-shaped absent receipt admits; two F1+F3 bindings
//     with different F2 prefixes remain ambiguous, and _coding_lane_core
//     surfaces binding_ambiguous as a hard reason.
//
// RETIRED WITH F-A2 PR-3 (docs/plan/active/f-a2-agentic-posting-design.md Annex B.1,
// the census gap this file's own siblings x36-q-round-regressions.test.mjs and
// x36-vendor-binding-executor.test.mjs were already retired for): three cells whose
// CLAIM was clara.execute_rule_post's own post-time behaviour, verb EXISTENCE per the
// D39 claim split —
//   P-B/E2: the same collision at post time skips binding_ambiguous even though
//     the current invoice happens to match one candidate's F2.
//   P-E3: a real matched receipt plus vendor registration resolves to the
//     binding's own counterparty and posts through A.5 step 5.
//   P-D: force proposed->live between the executor's bulk rule lock and exact
//     lookup; the new rule is excluded for this pass and no deadlock occurs.
// — all three called clara.execute_rule_post directly (P-D through its own two-session
// race, the other two through the local post() helper) and all three exercised
// machinery (the bulk rule lock, the post-time skip path) that retired WITH the
// function, not around it. P-B/C/E1 above tests clara._coding_lane_core at DRAFT time
// only and is untouched — draft-time binding_ambiguous is not this PR's business.
// Their helpers (seedRule, seedPostDraft, addLatestOcr, post(), hash64(),
// fullMatchedReceipt) retire with them; nothing else in this file called them.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  AP, EXP, buildWorld, endPool, rootQuery,
  upsertAccountClassed, upsertPayableAccount,
} from "./wave-a-fixtures.mjs";
import {
  has29, propose, seedApprovedEntry, seedBareDocument, seedF123Evidence,
  seedPayableAccount, seedVendorCounterparty, sign,
} from "./x36-vendor-binding-helpers.mjs";

let ready = false;
let w = null;

const fullAbsentReceipt = () => ({
  matched: 0,
  absent: 1,
  ambiguous: 0,
  rejected_gate: 0,
  below_band: 0,
  height_missing: 0,
  unit_unresolved: 0,
  no_geometry: 0,
  label_continuation: 0,
  no_vendor_anchor: 0,
  vendor_anchor_far: 0,
  closer_to_customer: 0,
  typed_collapsed: 0,
  typed_disagreement: 0,
  typed_vs_ambiguous: 0,
  emitted: 0,
  candidates: [],
  outcome: "absent",
});

async function currentActor() {
  return (await rootQuery(
    `select user_id
       from clara.firm_memberships
      where firm_id=$1 and status='active'
      order by created_at,user_id
      limit 1`,
    [w.firms.A],
  )).rows[0].user_id;
}

async function seedFullF123Evidence(document, identity, invoiceId, receipt) {
  const facts = randomUUID();
  await rootQuery(
    `insert into clara.document_extractions(
       id,firm_id,document_id,engine_id,engine_kind,version_n,status,
       page_count,envelope
     ) values (
       $1,$2,$3,'p-round-facts:v1','invoice_facts',1,'done',1,$4::jsonb
     )`,
    [
      facts, w.firms.A, document,
      JSON.stringify({ vendor_identity: receipt }),
    ],
  );
  await rootQuery(
    `insert into clara.document_regions(
       firm_id,extraction_id,locator_kind,locator,field_path,
       text_content,engine_confidence
     ) values
       ($1,$2,'page_polygon','{"page":1,"polygon":[0,0,1,1]}'::jsonb,
        'invoice.vendor_name',$3,1.0),
       ($1,$2,'page_polygon','{"page":1,"polygon":[0,0,1,1]}'::jsonb,
        'invoice.invoice_id',$4,1.0)`,
    [w.firms.A, facts, identity.name, invoiceId],
  );
  const ocr = randomUUID();
  await rootQuery(
    `insert into clara.document_extractions(
       id,firm_id,document_id,engine_id,engine_kind,version_n,status,
       page_count,envelope
     ) values (
       $1,$2,$3,'p-round-ocr:v1','ocr',1,'done',1,
       '{"pages":[{"page_number":1,"height":11}]}'::jsonb
     )`,
    [ocr, w.firms.A, document],
  );
  await rootQuery(
    `insert into clara.document_regions(
       firm_id,extraction_id,locator_kind,locator,field_path,
       text_content,engine_confidence
     ) values (
       $1,$2,'page_polygon',$3::jsonb,'pages.1.lines.0',$4,1.0
     )`,
    [
      w.firms.A,
      ocr,
      JSON.stringify({
        page_number: 1,
        polygon: [1, 0.5, 2, 0.5, 2, 0.9, 1, 0.9],
      }),
      `${identity.name} (${identity.reg})`,
    ],
  );
}

async function addTopBandOcrLines(document, texts) {
  const ocr = (await rootQuery(
    `select id
       from clara.document_extractions
      where document_id=$1 and engine_kind='ocr' and status='done'
      order by version_n desc,id desc
      limit 1`,
    [document],
  )).rows[0].id;
  for (const [index, text] of texts.entries()) {
    await rootQuery(
      `insert into clara.document_regions(
         firm_id,extraction_id,locator_kind,locator,field_path,
         text_content,engine_confidence
       ) values (
         $1,$2,'page_polygon',$3::jsonb,$4,$5,1.0
       )`,
      [
        w.firms.A,
        ocr,
        JSON.stringify({
          page_number: 1,
          polygon: [1, 0.55 + index * 0.05, 2, 0.55 + index * 0.05,
            2, 0.9 + index * 0.05, 1, 0.9 + index * 0.05],
        }),
        `pages.1.lines.${index + 10}`,
        text,
      ],
    );
  }
}

async function fileBareDocument(document) {
  const actor = await currentActor();
  const resolution = (await rootQuery(
    `insert into clara.client_resolutions(
       firm_id,client_id,subject_kind,subject_id,confidence,method,evidence,resolved_by
     ) values ($1,$2,'document',$3,1.0,'human','{}'::jsonb,$4)
     returning id`,
    [w.firms.A, w.clients.A1, document, actor],
  )).rows[0].id;
  return (await rootQuery(
    `insert into clara.document_filings(
       firm_id,document_id,client_id,filed_by,basis,resolution_id
     ) values ($1,$2,$3,$4,'seed-0007',$5)
     returning id`,
    [w.firms.A, document, w.clients.A1, actor, resolution],
  )).rows[0].id;
}

async function bindLive(cp, pageVendor, invoiceIds) {
  const dates = ["2025-08-25", "2025-08-29", "2025-10-13"];
  for (const [index, postingDate] of dates.entries()) {
    const doc = await seedBareDocument(
      w.firms.A,
      `p-window-${cp.id}-${index}`,
    );
    // 裁-18b PR-1 (the wall-introducing-PR law): the invoice ids here were ALREADY distinct, so
    // only the trusted clock needed truing — approval now tracks the posting dates and the
    // extraction is backdated ahead of it, or the frozen derivation refuses `evidence_restated`
    // before the new span wall is ever reached.
    await seedF123Evidence(
      w.firms.A,
      doc.id,
      { name: pageVendor, reg: cp.reg },
      invoiceIds[index],
      pageVendor,
      `${postingDate}T00:00:00Z`,
    );
    await seedApprovedEntry(
      w.firms.A,
      w.clients.A1,
      cp.id,
      doc,
      { postingDate, approvedAt: `${postingDate}T09:00:00Z` },
    );
  }
  const proposed = await propose(w.users.bob, {
    client: w.clients.A1,
    counterparty: cp.id,
  });
  return sign(w.users.alice, { binding: proposed.binding_id });
}

before(async () => {
  ready = await has29();
  if (!ready) return;
  w = await buildWorld();
  await seedPayableAccount(w.firms.A, w.clients.A1);
  await upsertPayableAccount(w.users.alice, {
    client: w.clients.A1,
    code: AP,
    name: "Trade Creditors",
  });
  await upsertAccountClassed(w.users.alice, {
    client: w.clients.A1,
    code: EXP,
    name: "Professional Fees",
    type: "expense",
  });
});

after(async () => {
  await endPool();
});

function requireReady(t) {
  if (ready) return false;
  t.skip("0029_vendor_binding_executor is not applied");
  return true;
}

test("P-B/C/E1 full absent receipt admits; F1 collision ignores F2 and surfaces hard binding_ambiguous", async (t) => {
  if (requireReady(t)) return;
  const pageVendor = `SHARED P ROUND ${randomUUID().slice(0, 6)}`;
  const cpA = await seedVendorCounterparty(
    w.firms.A,
    w.clients.A1,
    "PFA",
  );
  const bindingA = await bindLive(cpA, pageVendor, [
    "PALPHA-001", "PALPHA-002", "PALPHA-003",
  ]);

  const positive = await seedBareDocument(w.firms.A, "p-full-receipt");
  await seedFullF123Evidence(
    positive.id,
    { name: pageVendor, reg: cpA.reg },
    `${bindingA.f2_invoice_prefix}99`,
    fullAbsentReceipt(),
  );
  const admitted = (await rootQuery(
    "select clara._resolve_vendor_binding($1,$2,$3) as r",
    [w.clients.A1, positive.id, null],
  )).rows[0].r;
  assert.equal(admitted.outcome, "bound");
  assert.equal(admitted.counterparty_id, cpA.id);

  const f2Mismatch = await seedBareDocument(w.firms.A, "p-f2-mismatch");
  await seedFullF123Evidence(
    f2Mismatch.id,
    { name: pageVendor, reg: cpA.reg },
    `UNRELATED-${randomUUID().slice(0, 8)}`,
    fullAbsentReceipt(),
  );
  const refused = (await rootQuery(
    "select clara._resolve_vendor_binding($1,$2,$3) as r",
    [w.clients.A1, f2Mismatch.id, null],
  )).rows[0].r;
  assert.equal(refused.outcome, "ambiguous");
  assert.equal(refused.counterparty_id, undefined,
    "a unique F1+F3 candidate that fails F2 never resolves a counterparty");

  const cpB = await seedVendorCounterparty(
    w.firms.A,
    w.clients.A1,
    "PFB",
  );
  const bindingB = await bindLive(cpB, pageVendor, [
    "PBETA-001", "PBETA-002", "PBETA-003",
  ]);
  assert.notEqual(bindingA.f2_invoice_prefix, bindingB.f2_invoice_prefix);

  const collision = await seedBareDocument(w.firms.A, "p-f2-collision");
  await seedFullF123Evidence(
    collision.id,
    { name: pageVendor, reg: cpA.reg },
    `${bindingA.f2_invoice_prefix}88`,
    fullAbsentReceipt(),
  );
  await addTopBandOcrLines(collision.id, [cpB.reg]);
  const result = (await rootQuery(
    "select clara._resolve_vendor_binding($1,$2,$3) as r",
    [w.clients.A1, collision.id, null],
  )).rows[0].r;
  assert.equal(result.outcome, "ambiguous",
    "the candidate whose F2 happens to match must not hide the other F1+F3 hit");

  const filing = await fileBareDocument(collision.id);
  const lane = (await rootQuery(
    "select * from clara._coding_lane_core($1,$2)",
    [w.clients.A1, filing],
  )).rows[0];
  assert.ok(lane.reasons.includes("binding_ambiguous"));
  assert.equal(lane.lane, "needs_you",
    "binding ambiguity is a named hard blocker at the real Slot-A caller");

});
