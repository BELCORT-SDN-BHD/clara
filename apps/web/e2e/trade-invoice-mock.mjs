// #655's own mock lane — the trade-invoice journey (C1/C3/C6: the form, its refusals, the Work it
// admits and the mutual links that Work then shows), a file-disjoint sibling of
// `staff-expense-claim-mock.mjs` and consulted by `serve-built.mjs` through the two hooks that
// module's header describes.
//
// WHAT IS REAL AND WHAT IS FAKE. The browser, the built Next bundle, the real same-origin runtime
// proxy (`app/api/runtime/[...path]/route.ts`, with its firm-scope guard and header allow-list) and
// every line of client code under test are REAL — the form's state machine, the refusal→control
// mapping, the party picker, the draft in `sessionStorage`, the Work detail's link block. What is
// faked is what sits behind them: PostgREST's reads and the RUNTIME's
// `POST /api/work/trade-invoice`. So this walk proves the JOURNEY and the client's own wire shapes;
// it proves NOTHING about whether Postgres would admit an invoice, whether
// `clara._assert_trade_invoice_basis` really refuses a receivable leg on a bill, or whether the
// deferred birth trigger mints its open item. `packages/db/tests/trade-invoice.test.mjs` and
// `packages/runtime/tests/trade-invoice-e2e.mjs` own those, and the second one is the ONLY place
// the open item at commit can be shown at all.
//
// EVERY REFUSAL BODY BELOW IS THE REAL ONE, TRANSCRIBED FROM THE ROUTE — never a shape invented to
// make a cell go green:
//
//   400 `{ "error": "invalid_basis", "field": "invoice.<snake_key>", "reason": <token> }` — the
//   route emits every trade-invoice path under the single `invoice.` prefix (`toDbTradeInvoice`),
//   and `apps/web/lib/work/trade-invoice.ts`'s `fieldForServerPath` is the ONE mapper onto a
//   control. A mock that made up a field name would let a broken mapper pass a browser walk.
//
//   409 `{ "error": "intent_payload_conflict", "work_id" }` — the id of the Work that intent key
//   ALREADY names, which is what lets the form offer a route to it instead of an apology.
//
//   202 carries `invoice_id`, `counterparty_id`, `due_date` and `due_date_source` — the four facts
//   the browser could NOT have computed. The `due_date_source` the mock answers with is
//   `counterparty_terms` on the happy path even though the form sent `absent`, because that is
//   exactly what the real door does (D12c) and the success banner's whole job is to render what it
//   was told rather than what it guessed.
//
// EVERY HANDLER IS SCOPED TO THIS LANE'S OWN CLIENT, the control endpoint included, and falls
// through otherwise (`e2e-fixture-ownership.test.ts` exists because three lanes learned the hard
// way that a handler claiming a SHARED endpoint replaces everyone else's fixture). This lane claims
// no unfiltered register, no shared session list and no firm-wide read, and it answers NEITHER
// `list_accounting_work` NOR `list_entry_links`: both are read by surfaces other lanes drive.

export const TI = {
  clientId: "65565565-6556-4655-8655-655655655655",
  clientName: "ROME PROPERTIES SDN BHD",
  expense: "6300",
  sst: "6310",
  payable: "2000",
  receivable: "1200",
  revenue: "4100",
  /** Alpha Supplies — a VENDOR with agreed terms, which is what makes the door's derived due date
   *  a fact the browser could not have produced. */
  vendorId: "65565a01-6556-4655-8655-65565565a01a",
  vendorName: "ALPHA SUPPLIES SDN BHD",
  /** A SECOND vendor answering to the same first word, so the ambiguity arm is reachable. */
  vendorTwinId: "65565a02-6556-4655-8655-65565565a02a",
  vendorTwinName: "ALPHA SUPPLIES (JOHOR) SDN BHD",
  customerId: "65565c01-6556-4655-8655-65565565c01a",
  customerName: "TANJUNG DEVELOPMENT BHD",
  /** The Work the happy submit resolves to — the persistent outcome the walk reloads. */
  workId: "65509001-6550-4655-8655-655065509001",
  invoiceId: "65509aaa-6550-4655-8655-655065509aaa",
  entryId: "65509f01-6550-4655-8655-655065509f01",
  receiptId: "65509f02-6550-4655-8655-655065509f02",
  openItemId: "65509f03-6550-4655-8655-655065509f03",
  documentId: "65509d01-6550-4655-8655-655065509d01",
  /** A Work already admitted under `seededIntentKey`: a submit under that key with DIFFERENT
   *  particulars is the conflict arm, and the 409 names this Work. */
  seededWorkId: "65509002-6550-4655-8655-655065509002",
  seededIntentKey: "ti-seeded-intent",
  /** The control endpoint, as the BROWSER addresses it: the same-origin proxy maps
   *  `/api/runtime/<p>` onto the runtime's `/api/<p>`. */
  controlPath: "/api/runtime/e2e-trade-invoice/control",
};

const CLIENT = {
  id: TI.clientId,
  name: TI.clientName,
  status: "active",
  created_at: "2026-01-01T00:00:00.000Z",
};

const ACCOUNTS = [
  { client_id: TI.clientId, account_code: TI.expense, name: "Office Supplies", account_type: "expense", is_active: true },
  { client_id: TI.clientId, account_code: TI.sst, name: "SST on Purchases", account_type: "expense", is_active: true },
  { client_id: TI.clientId, account_code: TI.payable, name: "Trade Payables Control", account_type: "liability", is_active: true },
  { client_id: TI.clientId, account_code: TI.receivable, name: "Trade Receivables Control", account_type: "asset", is_active: true },
  { client_id: TI.clientId, account_code: TI.revenue, name: "Service Revenue", account_type: "income", is_active: true },
];

const cp = (id, name, kind, terms) => ({
  id, firm_id: "65565f00-6556-4655-8655-65565565f00a", client_id: TI.clientId, kind, name,
  name_normalized: name.toLowerCase().replace(/[^a-z0-9]/g, ""),
  registration_no: `2001010${id.slice(-5, -1)}`, tin: null,
  payment_terms_days: terms, merged_into: null, retired_at: null,
  created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z",
});

const VENDORS = [
  cp(TI.vendorId, TI.vendorName, "vendor", 30),
  cp(TI.vendorTwinId, TI.vendorTwinName, "vendor", null),
];
const CUSTOMERS = [cp(TI.customerId, TI.customerName, "customer", 14)];

/** `clara.get_trade_invoice`'s own answer for the Work the happy submit produced — POSTED, with
 *  every derived id present. This is what AC5's reload leg reads. */
const POSTED_INVOICE = {
  invoice_id: TI.invoiceId,
  work_id: TI.workId,
  kind: "supplier_bill",
  domain: "ap",
  counterparty_id: TI.vendorId,
  counterparty_name: TI.vendorName,
  counterparty_kind: "vendor",
  counterparty_registration_no: "200101065565",
  document_date: "2026-03-04",
  due_date: "2026-04-30",
  due_date_source: "counterparty_terms",
  reference: "ALPHA-2026-0042",
  currency: "MYR",
  total_cents: 106000,
  tax_facts: { stated_code: "SR", stated_cents: 6000 },
  source_document_id: TI.documentId,
  recorded_by: "65565u01-6556-4655-8655-65565565u01a",
  created_at: "2026-03-31T02:00:00.000Z",
  state: "posted",
  entry_id: TI.entryId,
  receipt_id: TI.receiptId,
  open_item_id: TI.openItemId,
  open_item_amount_cents: 106000,
  open_item_due_date: "2026-04-30",
  outstanding_cents: 106000,
};

const state = {
  /** intentKey -> { workId, payload } */
  intents: new Map(),
  /** The next admission's refusal, planted by the control endpoint. */
  nextRefusal: null,
  /** Every admission body this lane received, so a cell can assert ONE submission rather than two. */
  received: [],
};

/** THE PARSE IS CACHED ON THE REQUEST — `periodic-adjustment-mock.mjs`'s own measured note applies
 *  verbatim: `for await (const chunk of request)` drains the stream exactly once, so an uncached
 *  re-read after a sibling hook has already read it sees `{}` and falls through silently. */
async function readJson(request) {
  if (request.__e2eParsedBody !== undefined) return request.__e2eParsedBody;
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  let parsed = {};
  if (chunks.length > 0) {
    try { parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { parsed = {}; }
  }
  request.__e2eParsedBody = parsed;
  return parsed;
}

function send(response, status, body) {
  const text = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(text),
    "access-control-allow-origin": "*",
  });
  response.end(text);
}

/** THE PostgREST HALF. Every branch names this lane's own client before it answers. */
export async function handleTradeInvoiceSupabase(request, response, path, url, sendJson, cors) {
  const idFilter = url.searchParams.get("id");
  const clientFilter = url.searchParams.get("client_id");
  const kindFilter = url.searchParams.get("kind");

  if (request.method === "GET" && path === "/rest/v1/clients") {
    const id = idFilter?.startsWith("eq.") ? idFilter.slice(3) : null;
    if (id === TI.clientId) {
      sendJson(response, 200, [CLIENT], cors);
      return true;
    }
    return false;
  }

  if (request.method === "GET" && path === "/rest/v1/coa_accounts") {
    const client = clientFilter?.startsWith("eq.") ? clientFilter.slice(3) : null;
    if (client === TI.clientId) {
      sendJson(response, 200, ACCOUNTS, cors);
      return true;
    }
    return false;
  }

  // THE COUNTERPARTY READ the form's party picker makes — the SAME one the registers already use
  // (`lib/registers/counterparty.ts`), filtered by client AND kind, because a sales invoice is
  // recorded against a customer and a supplier bill against a vendor.
  if (request.method === "GET" && path === "/rest/v1/counterparties") {
    const client = clientFilter?.startsWith("eq.") ? clientFilter.slice(3) : null;
    if (client !== TI.clientId) return false;
    const kind = kindFilter?.startsWith("eq.") ? kindFilter.slice(3) : null;
    sendJson(response, 200, kind === "customer" ? CUSTOMERS : VENDORS, cors);
    return true;
  }

  if (request.method !== "POST" || !path.startsWith("/rest/v1/rpc/")) return false;
  const verb = path.slice("/rest/v1/rpc/".length);

  // THE ONE READ THIS LANE OWNS EXCLUSIVELY. It answers ONLY for the Work this module minted.
  if (verb === "get_trade_invoice") {
    const body = await readJson(request);
    if (body?.p_work !== TI.workId) return false;
    sendJson(response, 200, POSTED_INVOICE, cors);
    return true;
  }

  return false;
}

/** THE RUNTIME HALF. */
export async function handleTradeInvoiceRuntime(request, response, url) {
  const path = url.pathname;

  if (request.method === "POST" && path === "/api/e2e-trade-invoice/control") {
    const body = await readJson(request);
    // SCOPED LIKE EVERY OTHER HANDLER HERE: a control endpoint that mutates shared fixture state
    // for ANY body is a lane claiming a shared endpoint.
    if (body?.client !== TI.clientId) return false;
    if (body?.op === "refuse_next") {
      state.nextRefusal = {
        field: String(body.field ?? "invoice.counterparty"),
        reason: String(body.reason ?? "party_ambiguous"),
        detail: body.detail ?? null,
      };
      send(response, 200, { ok: true });
      return true;
    }
    if (body?.op === "seed_intent") {
      // PLANTED WITH A PAYLOAD NOTHING CAN EQUAL, so every submit under this key is the CONFLICT
      // arm rather than a replay — the state the database produces for a key that already names a
      // different trade invoice.
      state.intents.set(TI.seededIntentKey, { workId: TI.seededWorkId, payload: null });
      send(response, 200, { ok: true });
      return true;
    }
    if (body?.op === "received") {
      send(response, 200, { received: state.received });
      return true;
    }
    if (body?.op === "reset") {
      state.intents.clear();
      state.nextRefusal = null;
      state.received = [];
      send(response, 200, { ok: true });
      return true;
    }
    return false;
  }

  if (request.method === "POST" && path === "/api/work/trade-invoice") {
    const body = await readJson(request);
    // SCOPED BY THE REQUEST'S OWN CLIENT — another lane's admission falls through to the shared
    // fallback rather than being answered with this lane's Work.
    if (body?.clientId !== TI.clientId) return false;
    const intentKey = String(body?.intentKey ?? "");
    state.received.push({
      intentKey,
      kind: body?.kind ?? null,
      invoice: body?.invoice ?? null,
      basis: body?.basis ?? null,
    });

    if (state.nextRefusal !== null) {
      const refusal = state.nextRefusal;
      state.nextRefusal = null;
      const out = { error: "invalid_basis", field: refusal.field, reason: refusal.reason };
      if (refusal.detail) out.detail = refusal.detail;
      send(response, 400, out);
      return true;
    }

    // THE IDEMPOTENCY, MODELLED — the surface's whole lost-response arm is written against it.
    const prior = state.intents.get(intentKey);
    if (prior !== undefined) {
      if (prior.payload === null || prior.payload !== JSON.stringify(body?.invoice ?? null)) {
        // The real route's own 409 body: the machine-readable token AND the Work that key names.
        send(response, 409, { error: "intent_payload_conflict", work_id: prior.workId });
        return true;
      }
      send(response, 202, {
        work_id: prior.workId,
        task_id: "65509t01-6550-4655-8655-655065509t01",
        logical_op_id: `work:${prior.workId}:journal_entry:1`,
        status: "queued",
        replayed: true,
        invoice_id: TI.invoiceId,
        kind: body?.kind ?? "supplier_bill",
        counterparty_id: TI.vendorId,
        due_date: "2026-04-30",
        due_date_source: "counterparty_terms",
      });
      return true;
    }

    state.intents.set(intentKey, { workId: TI.workId, payload: JSON.stringify(body?.invoice ?? null) });
    // THE FOUR FACTS THE BROWSER COULD NOT HAVE COMPUTED. The form sent `absent`; the door derived
    // `counterparty_terms` from the party's agreed 30 days, and the banner renders what it was told.
    send(response, 202, {
      work_id: TI.workId,
      task_id: "65509t01-6550-4655-8655-655065509t01",
      logical_op_id: `work:${TI.workId}:journal_entry:1`,
      status: "queued",
      replayed: false,
      invoice_id: TI.invoiceId,
      kind: body?.kind ?? "supplier_bill",
      counterparty_id: TI.vendorId,
      due_date: "2026-04-30",
      due_date_source: "counterparty_terms",
    });
    return true;
  }

  return false;
}
