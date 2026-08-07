// 0049 — THE DIRECTION ANSWER MUST BE EARNED, IN BOTH DIRECTIONS.
//
// WHAT THIS FILE IS FOR. 0049's own tail asserts SHAPE (which arms the body carries, that the
// old fallthrough is gone, that both entry points delegate to one core) and re-measures the
// estate it is applied to. Neither is behaviour on FIXTURES it controls. Every cell below
// builds a document with a named evidence shape and reads what the DB actually answers.
//
// THE DEFECT, RESTATED SO THE CELLS ARE READABLE. clara._document_direction used to end
// `if v_sales then 'sales' else 'purchase'`, so every non-sale answered 'purchase' —
// including the ones where nothing had been tested. §7-A Half-1 measured that on a real
// document ROME SECRETARY had ISSUED: the page stated its registration, the client held no
// tin/ssm identifier to compare against, `exists(...)` answered false because there was
// nothing to compare, and the lane read the client's own sales invoice as a purchase.
//
// ADR-063 / wave-7a-contract 7A-R2: direction is {sales | purchase | unresolved}, and
// 'unresolved' is what a zero-evidence document answers.
//
// CONTRACT-BLIND where it can be: the cells name the OUTCOME (abstains / resolves purchase /
// resolves sales), not the internal variable that produces it.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, endPool, printLaneNotes, noteLane, printSkipCount,
  buildWorld, firmOf, opk, createClient,
  a21EnsureReady, skip16,
  seedCitedDocument, seedStatedInvoiceFacts, grantConsent,
  addClientIdentifier, rm,
} from "./a21-helpers.mjs";

let has49 = false;
let world = null;

function skipHere(t) {
  return skip16(t, has49, "0049 not applied — the direction-evidence battery is dormant");
}

/** Is 0049 on this database? Read from the migration ledger, not from a function's
 *  existence: a half-applied file is a different failure than an unapplied one. */
async function has0049() {
  const r = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version like '0049_%'");
  return r.rows[0].n === 1;
}

/** A client with NO client_identifiers rows at all — the shape BEE CREATIVE SOLUTION and
 *  ROME PROPERTIES are both in on live, and the shape ROME SECRETARY was in when the defect
 *  was measured. Every cell that matters here needs it, so it is the default. */
async function bareClient(sub) {
  const client = await createClient(sub, {
    name: `x49_${Date.now().toString(36)}_${randomUUID().slice(0, 6)}`, opKey: opk("cli"),
  });
  await grantConsent(sub, { firm: await firmOf(client), client }).catch(() => {});
  return client;
}

/** A filed document carrying a done invoice_facts extraction and EXACTLY the identity
 *  regions asked for. `fields` is a {field_path: text} map; omitted paths are genuinely
 *  absent, which is the whole point of several cells below. */
async function evidenceDoc(sub, client, fields = {}) {
  const firm = await firmOf(client);
  const cited = await seedCitedDocument(sub, { firm, client, quote: rm(90000) });
  await seedStatedInvoiceFacts(cited, { firm });
  const ext = await rootQuery(
    `select id from clara.document_extractions where document_id=$1 and engine_kind='invoice_facts'
       and status='done' order by version_n desc limit 1`, [cited.documentId]);
  assert.ok(ext.rows[0], "mandatory setup: the fixture document carries a done invoice_facts extraction");
  for (const [path, value] of Object.entries(fields)) {
    await rootQuery(
      `insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,field_path,text_content,engine_confidence)
       values($1,$2,'page_polygon','{"page":1,"polygon":[0,0,1,1]}'::jsonb,$3,$4,1.0)`,
      [firm, ext.rows[0].id, path, value]);
  }
  return { ...cited, firm, extraction: ext.rows[0].id };
}

/** A filed document with NO invoice_facts extraction at all — a bank statement, a management
 *  account, or an invoice whose extraction failed. 36 of the 38 live filings in this state
 *  are documents that HAVE no direction. */
async function unreadDoc(sub, client) {
  const firm = await firmOf(client);
  return { ...(await seedCitedDocument(sub, { firm, client, quote: rm(90000) })), firm };
}

/** Birth a live vendor counterparty in this client's books. Raw, because the product births
 *  counterparties through draft+approval and this fixture needs the END STATE, not the flow;
 *  the normalisation is written exactly as the table's CHECK constraints require. */
async function seedVendor(sub, client, { name, registration = null }) {
  const firm = await firmOf(client);
  const id = randomUUID();
  await rootQuery(
    `insert into clara.counterparties(
       id,firm_id,client_id,kind,name,name_normalized,registration_no,registration_normalized,created_by)
     values($1,$2,$3,'vendor',$4,lower(regexp_replace($4,'[^a-zA-Z0-9]','','g')),
            $5::text, case when $5::text is null then null
                           else lower(regexp_replace($5::text,'[^a-zA-Z0-9]','','g')) end, $6)`,
    [id, firm, client, name, registration, sub]);
  return id;
}

/** { value, code } — the direction, or the sqlstate it abstained with. */
async function direction(document, client) {
  try {
    const r = await rootQuery("select clara._document_direction($1,$2) as d", [document, client]);
    return { value: r.rows[0].d, code: null };
  } catch (e) { return { value: null, code: e.code }; }
}
async function tri(document, client) {
  return (await rootQuery(
    "select clara._autodraft_direction_tri($1,$2) as d", [document, client])).rows[0].d;
}
async function lane(client, filing) {
  const r = await rootQuery("select lane, reasons from clara._coding_lane_core($1,$2)", [client, filing]);
  return r.rows[0];
}

before(async () => {
  const ready = await a21EnsureReady();
  has49 = ready.base && ready.has16 && (await has0049());
  if (has49) world = await buildWorld();
  else noteLane("0049 absent — direction-evidence battery skipped");
});
after(async () => { printLaneNotes("x49-direction-evidence"); printSkipCount("x49-direction-evidence"); await endPool(); });

// ===========================================================================
// THE DEFECT ITSELF
// ===========================================================================

test("D1 a stated supplier REGISTRATION the client cannot be compared against ABSTAINS (CLR30) — it is never scored as a miss", async (t) => {
  if (skipHere(t)) return;
  // THE §7-A HALF-1 SHAPE, EXACTLY. The page states a registration and a name; the client
  // holds NO tin/ssm identifier and no alias, so neither arm can hit — and the registration
  // arm could not even RUN. Pre-0049 this answered 'purchase' with total confidence.
  const sub = world.users.alice;
  const client = await bareClient(sub);
  const doc = await evidenceDoc(sub, client, {
    "invoice.vendor_registration": "202501019265",
    "invoice.vendor_name": "M ROME SECRETARY",
  });
  const d = await direction(doc.documentId, client);
  assert.equal(d.value, null,
    `an untestable hard identifier must NOT produce a confident direction (got '${d.value}')`);
  assert.equal(d.code, "CLR30",
    `it abstains with CLR30 direction_unresolved (got code=${d.code})`);
  assert.equal(await tri(doc.documentId, client), "unresolved",
    "and the tri-state authority reports 'unresolved' — the value that never drafts");
});

test("D2 the SAME document resolves 'purchase' once the client has a hard identifier to test it against", async (t) => {
  if (skipHere(t)) return;
  // The evidence did not change; the client's ability to TEST it did. This is the cell that
  // proves D1 is about testability and not about registrations being ignored — and it is the
  // live proof that seeding ROME SECRETARY's identifiers, with no code change, flipped the
  // answer.
  const sub = world.users.alice;
  const client = await bareClient(sub);
  const doc = await evidenceDoc(sub, client, {
    "invoice.vendor_registration": "201801099999",
    "invoice.vendor_name": "ACME SUPPLIES SDN BHD",
  });
  assert.equal((await direction(doc.documentId, client)).code, "CLR30",
    "premise: with no client identifier the stated registration is untestable");
  // ONE KIND IS NOT COVERAGE (the 2026-08-08 revision). `invoice.vendor_registration` carries
  // a BRN or a TIN and never says which, so an ssm-only client still cannot test a stated
  // registration: the value could be the TIN it has never recorded. This half of the cell is
  // the reviewer's exact scenario, and before the revision it answered a confident 'purchase'.
  await addClientIdentifier(sub, { client, kind: "ssm", value: "199901000777" });
  const partial = await direction(doc.documentId, client);
  assert.equal(partial.code, "CLR30",
    `an ssm-only client STILL cannot test a stated registration — the stated value may be the tin it does not hold (got '${partial.value}'/${partial.code})`);
  await addClientIdentifier(sub, { client, kind: "tin", value: "c99887766554" });
  const after = await direction(doc.documentId, client);
  assert.equal(after.value, "purchase",
    `with BOTH hard kinds on file the registration arm really runs, misses, and the answer is a TESTED purchase (got '${after.value}'/${after.code})`);
});

test("D3 an ACCEPTED VENDOR of this client is positive purchase evidence, even with no client identifier at all", async (t) => {
  if (skipHere(t)) return;
  // THE ARM WITH NO LIVE COVERAGE, WHICH IS WHY IT HAS THIS CELL. Measured read-only on
  // 2026-08-08: across all four live clients, 29 read filings answer (P1), 19 answer (P2) and
  // ZERO answer (P3) — including the two ROME PROPERTIES BRIGHTPATH bills an earlier note
  // credited to this arm, which in fact resolve their BUYER to the client and are answered by
  // (P1) two branches earlier. So THIS CELL IS (P3)'s ONLY COVERAGE anywhere. It matters
  // forward, not today: it is what answers the same bill once a page stops naming its
  // customer, on a client that holds no hard identifiers of its own.
  const sub = world.users.alice;
  const client = await bareClient(sub);
  const doc = await evidenceDoc(sub, client, {
    "invoice.vendor_registration": "2024010477561593602-X",
    "invoice.vendor_name": "CONSULTANCY RIGHTPATH",
  });
  assert.equal((await direction(doc.documentId, client)).code, "CLR30",
    "premise: before the vendor exists, the untestable registration abstains");
  await seedVendor(sub, client, { name: "Consultancy Rightpath", registration: "2024010477561593602X" });
  const after = await direction(doc.documentId, client);
  assert.equal(after.value, "purchase",
    `a supplier the client's books already hold as a vendor is purchase evidence (got '${after.value}'/${after.code})`);
});

test("D4 a THIRD-PARTY supplier NAME alone still resolves 'purchase' on a client with no identifiers", async (t) => {
  if (skipHere(t)) return;
  // BEE CREATIVE SOLUTION's live shape: ten real supplier bills, no client identifiers, no
  // stated supplier registration. The name arm is genuinely performable (clara.clients.name
  // is NOT NULL), so this is a TESTED miss and 'purchase' is earned. If this cell ever goes
  // red, a real purchase pipeline has been broken by an over-wide unresolved rule.
  const sub = world.users.alice;
  const client = await bareClient(sub);
  const doc = await evidenceDoc(sub, client, { "invoice.vendor_name": "OPENAI LLC" });
  const d = await direction(doc.documentId, client);
  assert.equal(d.value, "purchase",
    `a stated third-party supplier name is testable and resolves purchase (got '${d.value}'/${d.code})`);
  assert.equal(await tri(doc.documentId, client), "purchase", "and the tri-state agrees");
});

test("D5 a document stating NO counterparty identity at all ABSTAINS", async (t) => {
  if (skipHere(t)) return;
  // Read, and nothing directable on the page. Not a contradiction — an absence, and the
  // fail-closed branch is where absences go.
  const sub = world.users.alice;
  const client = await bareClient(sub);
  const doc = await evidenceDoc(sub, client, {});
  const d = await direction(doc.documentId, client);
  assert.equal(d.code, "CLR30", `no identity on the page means no direction (got '${d.value}')`);
  assert.equal(await tri(doc.documentId, client), "unresolved", "the tri-state answer is unresolved");
});

test("D6 the BUYER resolving to this client is purchase evidence on its own", async (t) => {
  if (skipHere(t)) return;
  // No supplier identity at all, but the page names this client as the customer. Whoever
  // issued it, the client is on the buying side.
  const sub = world.users.alice;
  const client = await bareClient(sub);
  const name = (await rootQuery("select name from clara.clients where id=$1", [client])).rows[0].name;
  const doc = await evidenceDoc(sub, client, { "invoice.customer_name": name });
  const d = await direction(doc.documentId, client);
  assert.equal(d.value, "purchase",
    `the client named as the buyer is decisive purchase evidence (got '${d.value}'/${d.code})`);
});

test("D7 a document with NO invoice facts at all is 'unresolved', and the human queue is UNCHANGED", async (t) => {
  if (skipHere(t)) return;
  // Two claims, and the second is why 0049 recuts clara._coding_lane_core at all. The tri
  // answer must be honest — nothing has been read. The QUEUE must not change: 36 of the 38
  // live filings in this state are bank statements and management accounts, and telling a
  // human "we could not tell if this is a sale or a purchase" about a bank statement, in the
  // NEEDS-YOU lane, forever, is a regression produced by a fix meant to improve signals.
  const sub = world.users.alice;
  const client = await bareClient(sub);
  const doc = await unreadDoc(sub, client);
  assert.equal(await tri(doc.documentId, client), "unresolved",
    "an unread document has no direction, and says so");
  assert.equal((await direction(doc.documentId, client)).code, "CLR30",
    "the entry point abstains rather than defaulting");
  const l = await lane(client, doc.filingId);
  assert.ok(l.reasons.includes("facts_pending"),
    `the state is named ONCE, by the reason that already exists for it (got ${JSON.stringify(l.reasons)})`);
  assert.ok(!l.reasons.includes("direction_unresolved"),
    `and NOT a second time as a direction failure (got ${JSON.stringify(l.reasons)})`);
  assert.notEqual(l.lane, "needs_you",
    `an unread document is not a hard human escalation (got lane=${l.lane}, reasons=${JSON.stringify(l.reasons)})`);
});

test("D8 a document that WAS read and still cannot be directed IS a hard needs-you", async (t) => {
  if (skipHere(t)) return;
  // The other half of D7, and the reason D7's carve-out is narrow rather than a loophole:
  // once the facts exist, an undirectable document is a real human question and the lane says
  // so by name.
  const sub = world.users.alice;
  const client = await bareClient(sub);
  const doc = await evidenceDoc(sub, client, { "invoice.vendor_registration": "202501019265" });
  const l = await lane(client, doc.filingId);
  assert.ok(l.reasons.includes("direction_unresolved"),
    `an untestable read document names the direction failure (got ${JSON.stringify(l.reasons)})`);
  assert.equal(l.lane, "needs_you",
    `and it is HARD — a human must resolve it (got lane=${l.lane})`);
});

// ===========================================================================
// THE SALES HALF IS UNTOUCHED — the regression guard for the carry-across
// ===========================================================================

test("D9 supplier = the client still resolves 'sales'", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = await bareClient(sub);
  const name = (await rootQuery("select name from clara.clients where id=$1", [client])).rows[0].name;
  await addClientIdentifier(sub, { client, kind: "ssm", value: "202501019265" });
  const doc = await evidenceDoc(sub, client, {
    "invoice.vendor_registration": "202501019265",
    "invoice.vendor_name": name,
    "invoice.customer_name": "A REAL CUSTOMER SDN BHD",
  });
  const d = await direction(doc.documentId, client);
  assert.equal(d.value, "sales",
    `a page whose supplier IS the client is still sales (got '${d.value}'/${d.code})`);
});

test("D10 a supplier NAME matching the client but a registration that does not still ABSTAINS", async (t) => {
  if (skipHere(t)) return;
  // 0015's FIX-4 contradiction arm, re-asserted here because 0049 rewrote the body it lives
  // in: a contradiction must stay a CONTRADICTION and must not be absorbed into the new
  // zero-evidence branch, which would lose the distinction the detail payload now carries.
  const sub = world.users.alice;
  const client = await bareClient(sub);
  const name = (await rootQuery("select name from clara.clients where id=$1", [client])).rows[0].name;
  await addClientIdentifier(sub, { client, kind: "tin", value: "TINONLYX48" });
  const doc = await evidenceDoc(sub, client, {
    "invoice.vendor_registration": "BRN9990001X",
    "invoice.vendor_name": name,
  });
  const d = await direction(doc.documentId, client);
  assert.equal(d.code, "CLR30", `the contradiction abstains (got '${d.value}')`);
});

// ===========================================================================
// THE EXECUTOR'S PINNED-EXTRACTION ENTRY POINT
// ===========================================================================

test("D11 a pin that is not a done invoice_facts extraction of this document ABSTAINS, never 'purchase'", async (t) => {
  if (skipHere(t)) return;
  // clara.execute_rule_post reads the 3-arity variant, so this is the path that POSTS. Before
  // 0049 it carried a byte-duplicate of the decision and an unhonourable pin answered
  // 'purchase' — the executor would then have looked for a purchase-side rule on a document
  // it had not read.
  const sub = world.users.alice;
  const client = await bareClient(sub);
  const doc = await evidenceDoc(sub, client, { "invoice.vendor_name": "OPENAI LLC" });
  await assert.rejects(
    () => rootQuery("select clara._document_direction_at($1,$2,gen_random_uuid())",
      [doc.documentId, client]),
    (e) => e.code === "CLR30",
    "an unhonourable pin is a refusal, not a direction");
  const pinned = await rootQuery(
    "select clara._document_direction_at($1,$2,$3) as d", [doc.documentId, client, doc.extraction]);
  assert.equal(pinned.rows[0].d, "purchase",
    "and the honourable pin answers exactly what the live selector answers");
});

test("D12 the two entry points cannot drift: they answer identically on every fixture shape", async (t) => {
  if (skipHere(t)) return;
  // The duplicate body is why this fix could have half-landed — the human lane reads the
  // 2-arity and the autopost executor reads the 3-arity. This asserts the property that the
  // shared core is supposed to guarantee, on shapes chosen to hit each arm.
  const sub = world.users.alice;
  const client = await bareClient(sub);
  await addClientIdentifier(sub, { client, kind: "ssm", value: "199901000888" });
  const shapes = [
    {},
    { "invoice.vendor_name": "SOME SUPPLIER SDN BHD" },
    { "invoice.vendor_registration": "201801099998" },
    { "invoice.vendor_registration": "199901000888", "invoice.vendor_name": "NOT THE CLIENT SDN BHD" },
  ];
  for (const [i, fields] of shapes.entries()) {
    const doc = await evidenceDoc(sub, client, fields);
    const live = await direction(doc.documentId, client);
    let pinnedValue = null; let pinnedCode = null;
    try {
      pinnedValue = (await rootQuery("select clara._document_direction_at($1,$2,$3) as d",
        [doc.documentId, client, doc.extraction])).rows[0].d;
    } catch (e) { pinnedCode = e.code; }
    assert.equal(pinnedValue, live.value, `shape ${i}: the pinned variant answers what the live one answers`);
    assert.equal(pinnedCode, live.code, `shape ${i}: and abstains exactly where the live one abstains`);
  }
});

// ===========================================================================
// THE APPLY-TIME CHANNEL ITSELF
// ===========================================================================

test("D13 the apply left a DURABLE receipt â€” clara.migration_receipts, not a discarded NOTICE", async (t) => {
  if (skipHere(t)) return;
  // THE ARM THE REVIEW MINTED. 0049's tail measures one class it deliberately does not assert
  // away (a READ filing moving off a defaulted direction) and the first cut reported it with
  // `raise notice`, while the production runner (packages/db/scripts/migrate.mjs â†’ a bare
  // pg.Client) attached no 'notice' listener and dropped every one of them. This cell is the
  // positive read that the replacement channel SURVIVED the apply on this very database â€”
  // not that the code contains an insert, but that a row is there to be selected.
  const r = await rootQuery(
    `select receipt, measured_at from clara.migration_receipts
      where version = '0049_direction_zero_evidence' order by id desc limit 1`);
  assert.ok(r.rows[0], "0049's apply persisted a receipt row (the channel the ceremony reads)");
  const receipt = r.rows[0].receipt;
  for (const k of ["filings_measured", "read_filings_moved", "read_movement_declared",
                   "unread_filings_now_unresolved", "moved_filings", "database", "applied_by"]) {
    assert.ok(Object.hasOwn(receipt, k), `the receipt carries '${k}' (got keys: ${Object.keys(receipt).join(",")})`);
  }
  // The named list and the count are the SAME measurement stated twice; a receipt whose list
  // is shorter than its count is the truncated-evidence shape this cell exists to refuse.
  assert.equal(receipt.moved_filings.length, receipt.read_filings_moved,
    "every counted movement is also NAMED in the receipt (no truncation)");
  // ...and the table is unreachable from every application role: it is ceremony metadata.
  for (const role of ["clara_authenticated", "clara_agent_ro", "clara_runtime"]) {
    for (const priv of ["select", "insert", "update", "delete"]) {
      const ok = (await rootQuery("select has_table_privilege($1,$2,$3) as ok",
        [role, "clara.migration_receipts", priv])).rows[0].ok;
      assert.equal(ok, false, `${role} must NOT ${priv} clara.migration_receipts`);
    }
  }
  const rls = (await rootQuery(
    "select relrowsecurity as rls, relforcerowsecurity as force from pg_class where oid='clara.migration_receipts'::regclass")).rows[0];
  assert.ok(rls.rls && rls.force, `clara.migration_receipts is RLS ENABLE+FORCE (got ${JSON.stringify(rls)})`);
});
