// F-A2 PR-1 — the AGENTIC POSTING battery's WORLD (NOT a test file). The instruments half is
// `f-a2-post-fixtures.mjs`; this module re-exports it, so a battery imports ONE leaf:
//
//     import { ... } from "./f-a2-post-world.mjs";
//
// CONTRACT-BLIND: every shape here is built from the design's own words (§3.2's ladder, §3.3's
// receipt, Annex I's three B4 formulas, §D.6's projected-state predicate), never from the
// sibling lane's migration source.
//
// WHY EVERY POSITIVE FIXTURE IS AN **AGENT** DRAFT. C.8 says it outright for the excision cells
// — "a human fixture would prove only the human case" — and the same reasoning binds the whole
// battery. `wake_post_entry` admits only `maker_actor = clara.agent_user_id() AND
// last_human_editor is null` (A8), so a human-drafted fixture cannot reach any rung past Tier A;
// a cell built on one would be green for the wrong reason. Every draft below therefore goes
// through the WAKE ceiling on an autodraft credential.

import { randomUUID } from "node:crypto";
import {
  opk, noteLane, firmOf, freshResolution, seedCitedDocument, grantConsent, ev, billLines,
  wakeDraftEntry, mintWake5, factsRegion, upsertAccountClassed, booksVersion,
  witnessShape, landWitnessPair, money, rootQuery,
  withWitnessV2, textCoverage, visionCoverage, documentSha,
} from "./f-a2-post-fixtures.mjs";

export * from "./f-a2-post-fixtures.mjs";

// ---------------------------------------------------------------------------
// The chart. A leg is a CONTROL leg because of its `account_class`, which is exactly what
// B10 / B11 / B14 are about — so the classes are stated here rather than defaulted.
// ---------------------------------------------------------------------------

export const CHART = {
  payable: "400-000",    // liability, account_class='payable'    — the AP control leg
  receivable: "300-000", // asset,     account_class='receivable' — the AR control leg
  expense: "500-A01",
  revenue: "500-000",
  sstOutput: "250-000",  // liability, special_acc_type='sst_output'
  rounding: "9990",      // seeded by buildWorld as special_acc_type='rounding'
  bank: "1000",
};

/** Build the classed chart the shape floors need. Tolerant of a pre-existing account: the
 *  battery re-uses one world across many cells, and a duplicate upsert is not the thing under
 *  test — but the raise is NOTED, never swallowed silently. */
export async function ensureChart(sub, client) {
  const mk = (code, name, type, accountClass, special) =>
    upsertAccountClassed(sub, { client, code, name, type, accountClass, special, opKey: opk("f-a2-coa") })
      .catch((e) => noteLane(`ensureChart(${code}) raised ${e.code}: ${e.message}`));
  await mk(CHART.payable, "Trade Creditors", "liability", "payable", null);
  await mk(CHART.receivable, "Trade Debtors", "asset", "receivable", null);
  await mk(CHART.expense, "Expense", "expense", null, null);
  await mk(CHART.revenue, "Revenue", "income", null, null);
  await mk(CHART.sstOutput, "SST Output", "liability", null, "sst_output");
  return CHART;
}

// ---------------------------------------------------------------------------
// Corroborated documents — B2's positive input, and C.17(1)'s hard prerequisite.
// ---------------------------------------------------------------------------

/** A page-polygon identity region on the witness TEXT row. */
const idRegion = (fieldPath, text) => ({
  field_path: fieldPath, text_content: text,
  locator_kind: "page_polygon", locator: { page: 1, polygon: [0, 0, 1, 1] },
});

export const BUYER_NAME = "F-A2 BUYER SDN BHD";
export const SUPPLIER_NAME = "F-A2 SUPPLIER SDN BHD";

/**
 * The identity regions that make a document's DIRECTION resolve, derived by rig replay against
 * the live `clara._direction_from_extraction` rather than guessed:
 *
 *   'purchase'   — a stated supplier NAME and NO stated registration. The (P2) arm returns
 *                  purchase when `v_sup_reg is null`, because the name comparison really ran
 *                  (clara.clients.name is NOT NULL) and did not match. Stating a REGISTRATION
 *                  instead sends the resolver down the `v_hard_id` limb, which needs the client
 *                  to hold BOTH a tin AND an ssm identifier — a fixture that stated one would
 *                  quietly resolve `unresolved` and make every directional cell prove nothing.
 *   'sales'      — the supplier name IS the client's own registered name, with no registration
 *                  stated (the name-only sales arm), plus a named buyer.
 *   'unresolved' — no identity regions at all: the resolver raises CLR30 and
 *                  `_autodraft_direction_tri` answers 'unresolved'. This is the LAWFUL generic
 *                  shape, and it is what B15's second cell needs.
 */
async function directionRegions(client, direction, vendorName) {
  if (direction === "unresolved") return [];
  if (direction === "sales") {
    const r = await rootQuery("select name from clara.clients where id=$1", [client]);
    return [idRegion("invoice.vendor_name", r.rows[0].name), idRegion("invoice.customer_name", BUYER_NAME)];
  }
  return [idRegion("invoice.vendor_name", vendorName)];
}

/**
 * A filed document carrying a CORROBORATING witness pair.
 *
 * CORROBORATION IS BUILT, NOT ASSERTED. The v2 predicate's three locks need the witnessFacts.v2
 * additions — a TEXT coverage receipt, a VISION coverage receipt pinned to the document's OWN
 * sha256, and an SST presence answer on both channels — so the fixture applies them through
 * `withWitnessV2` exactly as the openers' own battery does. Without them the pair lands and the
 * state reads `corroborated:false`, and every positive cell in this battery would refuse at B2
 * while looking like a ladder defect.
 *
 * `corroborated:false` withholds the CITATIONS rather than setting a flag, because in today's
 * estate `corroborated=false` REMOVES walls (finding 1) — a fixture that faked non-corroboration
 * with a flag would prove the opposite of its cell.
 *
 * `rounding` and the component fields are what GM-1's corrected B4-sales tie reads. They are
 * stated HERE, on the FACT side, and nowhere else: an entry may never supply its own slack, or
 * the tie becomes self-certifying (Annex I).
 *
 * The currency renders as `RM`, not `MYR`: a real Malaysian invoice prints "RM 1,060.00" and
 * never a standalone MYR token, and the envelope's currency key is the ALPHABETIC REDUCTION of
 * what the page printed.
 */
export async function witnessedFiling(sub, {
  client, gross, net = null, tax = null, rounding = null, typeCode = "01",
  kind = "invoice", vendorName = SUPPLIER_NAME, corroborated = true, dropFields = [],
  direction = "purchase",
}) {
  const firm = await firmOf(client);
  await grantConsent(sub, { firm, client }).catch(() => {});
  const cited = await seedCitedDocument(sub, { firm, client, quote: money(gross), kind });
  const sha = await documentSha(cited.documentId);
  const fields = { "invoice.total": gross, "invoice.currency": "RM", "invoice.type_code": typeCode };
  if (net != null) fields["invoice.total_excl_tax"] = net;
  if (tax != null) fields["invoice.tax_total"] = tax;
  if (rounding != null) fields["invoice.rounding"] = rounding;
  for (const f of dropFields) delete fields[f];
  const base = witnessShape({
    fields,
    noRegions: corroborated ? [] : Object.keys(fields),
    extraRegions: await directionRegions(client, direction, vendorName),
  });
  const silent = { state: "not_printed" };
  const shape = withWitnessV2(base, {
    coverage: { text: textCoverage(), vision: visionCoverage({ inputSha256: sha }) },
    sst: { text: silent, vision: silent },
  });
  const pair = await landWitnessPair(cited.documentId, shape);
  return { ...cited, firm, pair, gross, net, tax, rounding, typeCode, vendorName, corroborated, direction };
}

/** A document with NO fact state at all — B2's `'{}'`-shaped / absent twin. Absence is the
 *  refusal, and it is built by landing nothing rather than by asserting an absence. */
export async function unwitnessedFiling(sub, { client, gross, kind = "invoice" }) {
  const firm = await firmOf(client);
  await grantConsent(sub, { firm, client }).catch(() => {});
  const cited = await seedCitedDocument(sub, { firm, client, quote: money(gross), kind });
  return { ...cited, firm, gross, pair: null, corroborated: false };
}

// ---------------------------------------------------------------------------
// Credentials.
// ---------------------------------------------------------------------------

/** An autodraft credential (system origin, OBO nobody). Finding 7: `mint_wake_credential`
 *  FORBIDS `on_behalf_of` on autodraft — which is what makes the receipt's NULL structural
 *  rather than a bug, and what C.6's paired cell proves. */
export const autodraftCred = async (client) =>
  mintWake5({ kind: "autodraft", firm: await firmOf(client), onBehalfOf: null, client });

/** An interactive credential CARRYING a director — the chat lane's shape, `on_behalf_of`
 *  NON-NULL. Client-less by construction (`ck_wake_credentials_client_0011`), which is the
 *  standing fact C-3 refused to weaken. */
export const interactiveCred = async (client, onBehalfOf) =>
  mintWake5({ kind: "interactive", firm: await firmOf(client), onBehalfOf });

/** A PROACTIVE credential — single-use, and never a posting kind. C.1's cell makes the CALL
 *  with it and is refused; reading the allowlist instead would prove the row is absent, not
 *  that the door is shut (the gate's own re-cut of that cell). */
export const proactiveCred = async (client) =>
  mintWake5({ kind: "proactive", firm: await firmOf(client), onBehalfOf: null });

// ---------------------------------------------------------------------------
// Line shapes — one per B4 formula (Annex I).
// ---------------------------------------------------------------------------

/** `payable credit = expense debit = total_cents` — the faithful relocation. The supplier
 *  aggregate is `account_type`-based, so it SWALLOWS an expense-typed rounding leg and still
 *  ties, where the sales tie (which names income and tax separately) cannot. */
export const supplierLines = (amount) => billLines(CHART.expense, CHART.payable, amount, { desc: "f-a2-bill" });

/** `receivable = total_cents` AND `income + tax = total_cents − coalesce(rounding_cents,0)`.
 *  `roundingCents` here is the ENTRY's printed rounding leg; the TIE reads the FACT-side value,
 *  and the two are deliberately separable so the absent-fact twin can be built. */
export function salesLines(gross, net, tax, roundingCents = 0) {
  const lines = [{ account_code: CHART.receivable, debit_cents: gross, credit_cents: 0, description: "f-a2-ar" }];
  if (net > 0) lines.push({ account_code: CHART.revenue, debit_cents: 0, credit_cents: net, description: "f-a2-rev" });
  if (tax > 0) lines.push({ account_code: CHART.sstOutput, debit_cents: 0, credit_cents: tax, description: "f-a2-sst" });
  if (roundingCents !== 0) {
    lines.push(roundingCents > 0
      ? { account_code: CHART.rounding, debit_cents: 0, credit_cents: roundingCents, description: "f-a2-round" }
      : { account_code: CHART.rounding, debit_cents: -roundingCents, credit_cents: 0, description: "f-a2-round" });
  }
  return lines;
}

/** The credit-note MIRROR — every term's sign flipped. What keeps a credit note from tying by
 *  absolute value (Annex I). */
export const creditNoteLines = (gross, net, tax, roundingCents = 0) =>
  salesLines(gross, net, tax, roundingCents).map((l) => ({
    ...l, debit_cents: l.credit_cents, credit_cents: l.debit_cents,
  }));

/** A generic journal entry: NO coding kind, so no direction arm, no coded-kind preconditions
 *  and no shape floor. Its only anchor is `sum(debit_cents) = total_cents` — the weakest honest
 *  anchor available (Annex I), which is why B14 and B15 exist beside it. */
export const genericLines = (amount, { debitCode = CHART.expense, creditCode = CHART.bank } = {}) => [
  { account_code: debitCode, debit_cents: amount, credit_cents: 0, description: "f-a2-generic-dr" },
  { account_code: creditCode, debit_cents: 0, credit_cents: amount, description: "f-a2-generic-cr" },
];

/** GB-1's SUPPRESSED-PAYABLE fixture: a supplier invoice drafted GENERIC as `Dr Expense /
 *  Cr Bank`. It passes every one of v4's fourteen rungs and posts a phantom payment with the
 *  payable suppressed — the hole B15 closes, and the reason B15's cell must go RED with B15
 *  removed. */
export const suppressedPayableLines = (amount) =>
  genericLines(amount, { debitCode: CHART.expense, creditCode: CHART.bank });

/** A generic entry that DOES carry an AR/AP control leg — B14's positive refusal, whose
 *  negative twin is the same entry with the leg swapped for the bank. */
export const genericWithControlLeg = (amount) =>
  genericLines(amount, { debitCode: CHART.expense, creditCode: CHART.payable });

// ---------------------------------------------------------------------------
// Drafting through the wake ceiling.
// ---------------------------------------------------------------------------

/**
 * `codingKind: null` is the GENERIC lane and is passed EXPLICITLY rather than omitted: a NULL
 * `coding_kind` is a model-supplied input that SELECTS which walls bind (finding 4 / GB-1), so
 * a fixture reaching it by omission would exercise a different decision from the runtime's.
 */
export async function agentDraft(sub, cred, {
  client, cited, lines, codingKind, vendor = undefined, evidence = undefined,
  flags = {}, opKey = null, memo = "f-a2 agent draft", postingDate = "2026-03-15",
}) {
  const region = evidence === undefined ? await factsRegion(cited.documentId, "invoice.total") : null;
  return wakeDraftEntry(cred, {
    client,
    resolution: freshResolution(sub, client, { subjectKind: "document", subjectId: cited.documentId }),
    lines, document: cited.documentId, sha256: cited.sha256, flags, memo, postingDate,
    vendor: vendor === undefined ? { new: { name: cited.vendorName ?? "F-A2 SUPPLIER SDN BHD" } } : vendor,
    evidence: evidence === undefined
      ? [ev(region?.id ?? cited.regionId, region?.text_content ?? cited.quote, "invoice.total")]
      : evidence,
    codingKind,
    opKey: opKey ?? `f-a2:${cited.filingId}:${randomUUID().slice(0, 8)}`,
  });
}

/**
 * The whole positive chain in one call: chart → witnessed filing → agent draft → the four
 * arguments `wake_post_entry` needs. Every cell that wants "an agent draft that SHOULD post"
 * starts here, so a cell that refuses is refusing on the ONE term it broke and not on fixture
 * drift.
 */
/** The document DIRECTION each coding kind lawfully sits on. Generic defaults to `unresolved`,
 *  which is the shape B15 ADMITS; a cell that wants the suppressed-payable attack passes
 *  `direction: 'purchase'` explicitly, so the attack is always visible at the call site. */
const SALES_KINDS = ["sales_invoice", "sales_credit_note", "customer_receipt"];
const defaultDirection = (codingKind) =>
  codingKind == null ? "unresolved" : SALES_KINDS.includes(codingKind) ? "sales" : "purchase";

export async function agentPostable(sub, {
  client, amount = 500000, codingKind = "supplier_bill", lines = null,
  net = null, tax = null, rounding = null, typeCode = "01", kind = "invoice",
  vendor = undefined, evidence = undefined, flags = {}, corroborated = true, dropFields = [],
  direction = undefined,
}) {
  await ensureChart(sub, client);
  const dir = direction ?? defaultDirection(codingKind);
  const cited = await witnessedFiling(sub, {
    client, gross: amount, net, tax, rounding, typeCode, kind, corroborated, dropFields, direction: dir,
  });
  const cred = await autodraftCred(client);
  // On the SALES side the counterparty is the BUYER, not the client — a fixture that birthed the
  // supplier name there would be booking a receivable against the wrong party.
  const party = vendor === undefined && dir === "sales"
    ? { new: { name: BUYER_NAME }, kind: "customer" } : vendor;
  const draft = await agentDraft(sub, cred, {
    client, cited, codingKind, vendor: party, evidence, flags,
    lines: lines ?? (codingKind === "supplier_bill" ? supplierLines(amount)
      : SALES_KINDS.includes(codingKind) ? salesLines(amount, net ?? amount, tax ?? 0, rounding ?? 0)
        : genericLines(amount)),
  });
  return {
    cited, cred, draft,
    args: {
      entry: draft?.entry_id, expectedRevision: draft?.revision_token,
      client, booksVersion: await booksVersion(client),
    },
  };
}

// ---------------------------------------------------------------------------
// Small readbacks the batteries share.
// ---------------------------------------------------------------------------

/** Rows in a table for a client, for the zero-count heads C.8 re-points. Returns a NUMBER, and
 *  a missing relation returns `null` rather than 0 — an absent table is not an empty one, and
 *  reading it as zero is the absence-as-evidence defect (review law 2). */
export async function countFor(table, client) {
  try {
    const r = await rootQuery(`select count(*)::int as n from clara.${table} where client_id=$1`, [client]);
    return r.rows[0].n;
  } catch (e) {
    noteLane(`countFor(${table}) raised ${e.code}: ${e.message}`);
    return null;
  }
}

/** The live body of a function, by exact regprocedure identity. Used ONLY where the design says
 *  a catalog read is the instrument (the no-DML wrapper cell, the WB_AUTHORITY_FNS scan); never
 *  as a substitute for behaviour, and never as the way a retirement is proven — that is a rig
 *  REPLAY, never a grep (F49). */
export async function bodyOf(signature) {
  const r = await rootQuery("select prosrc from pg_proc where oid=$1::regprocedure", [signature]);
  return r.rows[0]?.prosrc ?? null;
}

/** Does clara.<name> exist at all, at any arity? */
export async function fnPresent(name) {
  const r = await rootQuery(
    "select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara' and p.proname=$1",
    [name]);
  return r.rows[0].n > 0;
}
