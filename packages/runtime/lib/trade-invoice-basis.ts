// #655 — THE TYPED PARTICULARS OF A TRADE INVOICE, as a schema, a builder, a local refusal mapper
// and a display helper.
//
// WHY THIS FILE EXISTS AND WHY IT IS HERE. The chat tool `start_trade_invoice_work` ships in the
// shared `chatTurn_v21` cut by the integration worker after the wave's ten merges, and a frozen
// workflow version is expensive to mint twice. So everything that tool needs which is NOT the
// frozen tool body lives here, in non-frozen infrastructure, tested on its own. It is the
// `staff-expense-claim-basis.ts` pattern, restated — which is itself `periodic-adjustment-basis.ts`
// restated, which is itself `chatTurn.v18.tools.ts`'s `basisFromInput` / `localBasisRefusal`
// extracted so the frozen file can be small.
//
// **THIS MODULE IS NON-FROZEN ONLY UNTIL THE SUCCESSOR IMPORTS IT.**
// `scripts/check-frozen-workflows.mjs` freezes the transitive relative-import closure of every
// frozen workflow, so the moment `chatTurn.v21.tools.ts` imports this file, every byte below is
// hash-locked in `frozen-workflows.json` — exactly what happened to
// `lib/periodic-adjustment-basis.ts` when v19 imported it, and to `lib/staff-expense-claim-basis.ts`
// when v20 did. A change to a rule here after that point is a change to a deployed body: it ships
// as a NEW module beside this one, wired by a NEW chatTurn version.
//
// WHICH IS WHY EVERY DURABLE RULE LIVES IN MIGRATION 0225, NEVER HERE. `clara.admit_trade_invoice_work`
// and `clara._assert_trade_invoice_basis` re-check every rule below at admission — the payload half
// before anything durable, the world half twice, the second time under the client rung — against
// the client's live chart, the live counterparty identity surface and the live fiscal calendar.
// Nothing here is a rule of its own: every check is a MIRROR of one the database enforces, so a
// preparer or a model sees the mistake beside the thing that caused it instead of as a refusal a
// round trip later.
//
// AND NOTHING HERE INVENTS A FACT. The due date is the clearest case: this module carries what was
// STATED and never derives a fallback, because the counterparty's agreed terms are a fact only the
// database holds (`clara.counterparties.payment_terms_days`). The door derives
// `stated -> counterparty_terms -> absent` and its answer is the one that is stored.
//
// TAX FACTS ARE CARRIED, NEVER VALIDATED — the #638 rule. There is no `tax_code` vocabulary in this
// estate, `0150:525` calls the statutory tag a hint and `docs/PRD.md:124` defers tax; AC6 asks only
// that supplied tax facts be carried. `tax_facts` is therefore an opaque passthrough object, echoed
// into `clara.trade_invoices.tax_facts` and validated against nothing.

import { z } from "zod";

export const START_TRADE_INVOICE_WORK_TOOL = "start_trade_invoice_work";

/** The two kinds a trade invoice can be. `clara.trade_invoices.kind`'s own CHECK. */
export const TRADE_INVOICE_KINDS = ["sales_invoice", "supplier_bill"] as const;
export type TradeInvoiceKind = (typeof TRADE_INVOICE_KINDS)[number];

/**
 * THE DUE-DATE BASIS (D12c). `stated` — the document says so. `counterparty_terms` — the party's
 * agreed payment terms produced it. `absent` — neither, and the due date is honestly NULL rather
 * than invented. `clara.trade_invoices.due_date_source`'s own CHECK, and a CHECK pairs it with the
 * column: `(due_date is null) = (due_date_source = 'absent')`.
 */
export const DUE_DATE_SOURCES = ["stated", "counterparty_terms", "absent"] as const;
export type DueDateSource = (typeof DUE_DATE_SOURCES)[number];

/** How the party was stated. A trade invoice's counterparty is resolved AT ADMISSION (D12a). */
export const BASIS_ORIGINS = ["user_direct", "clara_interpreted"] as const;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("A calendar date, YYYY-MM-DD. Ask the human if they did not give one — never invent it.");

const accountCode = z.string().trim().min(1).max(64);

export const MEMO_MAX_CHARS = 4000;
export const LINE_DESCRIPTION_MAX_CHARS = 2000;
export const REFERENCE_MAX_CHARS = 64;

/**
 * THE PARTY. Either the counterparty this client already has, or the identity as the document
 * states it — a name, and the registration number or TIN if the document carries them.
 *
 * IT IS NEVER CREATED FROM HERE. 2026-09-15 D11 stands: #655 CONSUMES 0215's identity provenance
 * and writes NO counterparty alias. A name nobody answers to leaves as `party_unresolved`, and two
 * parties answering to one name leave as `party_ambiguous` WITH THE CANDIDATE LIST, so the person
 * picks from what the books actually hold.
 */
export const tradeInvoicePartySchema = z
  .object({
    id: z
      .string()
      .uuid()
      .optional()
      .describe("The counterparty this client already has. Prefer it whenever you know it."),
    name: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .optional()
      .describe("The party's name exactly as the document states it. Never a name you inferred."),
    registration_no: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .optional()
      .describe("The registration number the document states, if it states one."),
    tin: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .optional()
      .describe("The tax identification number the document states, if it states one."),
  })
  .strict();

export type TradeInvoiceParty = z.infer<typeof tradeInvoicePartySchema>;

/** One line of the journal basis. These are JOURNAL BASIS LINES, never extracted invoice line
 *  items — #782 owns line items and `docs/ARCHITECTURE.md:529` records them as planned. */
export const tradeInvoiceLineSchema = z
  .object({
    account_code: accountCode,
    debit_cents: z.number().int().nonnegative(),
    credit_cents: z.number().int().nonnegative(),
    description: z.string().max(LINE_DESCRIPTION_MAX_CHARS).nullish(),
  })
  .strict();

/**
 * THE TOOL'S INPUT. `.strict()` throughout, so a model that invents a `line_items` or a
 * `withholding_tax` field is refused by the schema rather than having its extra key silently
 * dropped on the way to a durable record.
 */
export const startTradeInvoiceWorkInputSchema = z
  .object({
    kind: z
      .enum(TRADE_INVOICE_KINDS)
      .describe(
        "`sales_invoice` when this client is owed money by a customer; `supplier_bill` when this "
        + "client owes a vendor. A credit note is NEITHER — say so rather than negating an invoice.",
      ),
    counterparty: tradeInvoicePartySchema,
    document_date: isoDate.describe("The date the document itself states. Never today, never the posting date."),
    due_date: isoDate
      .nullable()
      .describe(
        "The due date the document states, or null. Do NOT compute one from payment terms: the "
        + "database derives that, because only it knows the party's agreed terms.",
      ),
    due_date_source: z
      .enum(DUE_DATE_SOURCES)
      .describe(
        "`stated` when the document states a due date, `absent` when it does not. Never claim "
        + "`counterparty_terms`: only the database can, and it will.",
      ),
    reference: z
      .string()
      .trim()
      .min(1)
      .max(REFERENCE_MAX_CHARS)
      .nullable()
      .describe("The document's own number, exactly as printed, or null."),
    currency: z.literal("MYR"),
    total_cents: z
      .number()
      .int()
      .positive()
      .describe("The document's stated total in whole sen. It must equal the control leg's signed amount."),
    tax_facts: z
      .record(z.string(), z.unknown())
      .nullable()
      .describe("The tax figures the document states, carried verbatim. Nothing recomputes them."),
    posting_date: isoDate.describe("The date the books record it. Often, but not always, the document date."),
    memo: z.string().trim().min(1).max(MEMO_MAX_CHARS),
    lines: z
      .array(tradeInvoiceLineSchema)
      .min(2)
      .describe(
        "The journal this invoice posts. EXACTLY ONE control-account leg, of the domain the kind "
        + "names. These are journal basis lines, never the document's own line items.",
      ),
    document_id: z.string().uuid().nullable(),
    basis_origin: z.enum(BASIS_ORIGINS),
  })
  .strict();

export type StartTradeInvoiceWorkInput = z.infer<typeof startTradeInvoiceWorkInputSchema>;

/** The database's typed refusal shape, as the door raises it and the surfaces render it. */
export type TradeInvoiceRefusal = {
  error: "invalid_basis";
  field: string;
  reason: string;
  detail?: Record<string, unknown>;
};

/**
 * THE DOOR'S OWN RAISE LADDER (DECISIONS.md:50 — "the count is descriptive, the door's own raise
 * ladder is the contract"). Fourteen tokens plus `invalid_kind`, which 0225's section B names
 * explicitly as the fifteenth: a `kind` that is neither admitted value and is not credit-shaped
 * either would otherwise leave as a bare 23514 out of the column CHECK, which 0194:1078-1081
 * forbids.
 *
 * These strings are the SAME in the migration, in this module and in the chatTurn_v21 stanza. A
 * surface that renders a reason not in this map is rendering a reason nobody wrote.
 */
export const TRADE_INVOICE_REFUSALS = {
  party_ambiguous: "More than one party answers to that name. Say which one.",
  party_unresolved: "No party of this client answers to that name.",
  credit_shape_not_admitted:
    "A credit note is not recorded here. Record it as a credit against the invoice it corrects.",
  invalid_total: "The stated total does not match the control leg's signed amount.",
  unbalanced_basis: "The journal does not balance.",
  control_leg_missing: "This invoice names no control-account leg.",
  wrong_control_domain: "The party and the control account disagree about which way the money runs.",
  invalid_due_date: "The due date precedes the document date.",
  source_already_posted: "That document already backs a posted journal entry.",
  client_inactive: "This client is not active, so no new work is admitted.",
  insufficient_role: "Recording a trade invoice requires a bookkeeper or above.",
  invalid_intent_key: "This submission carries no idempotency key.",
  intent_payload_conflict: "That key already carries a different trade invoice.",
  period_locked: "The fiscal year containing that posting date is closed.",
  invalid_kind: "A trade invoice is either a sales invoice or a supplier bill.",
} as const;

export type TradeInvoiceRefusalReason = keyof typeof TRADE_INVOICE_REFUSALS;

/** True when `reason` is one the door actually raises. */
export function isTradeInvoiceRefusal(reason: string): reason is TradeInvoiceRefusalReason {
  return Object.prototype.hasOwnProperty.call(TRADE_INVOICE_REFUSALS, reason);
}

const controlKindFor = (kind: TradeInvoiceKind): "receivable" | "payable" =>
  (kind === "sales_invoice" ? "receivable" : "payable");

// NO OBJECT SPREAD ANYWHERE IN THIS FILE. `packages/runtime/scripts/check-parts-parity.mjs`
// refuses a spread in any module it walks ("unclassifiable object spread"), because a spread makes
// a part's shape underivable from its source — and this module enters that walk the moment
// `chatTurn_v21` imports it. Measured: the guard REFUSED an earlier draft of this very function.
function refuse(field: string, reason: TradeInvoiceRefusalReason, detail?: Record<string, unknown>):
  TradeInvoiceRefusal {
  const out: TradeInvoiceRefusal = { error: "invalid_basis", field, reason };
  if (detail !== undefined) out.detail = detail;
  return out;
}

/**
 * THE SHAPE REFUSALS A CALLER CAN ACT ON WITHOUT A DATABASE ROUND TRIP.
 *
 * It is deliberately NARROWER than the door. Everything that needs the client's chart (which
 * account is the control account), the identity surface (which party answers to that name) or the
 * calendar (whether the period is closed) is the DATABASE's to answer, and this module does not
 * guess at any of it. What it can settle locally is exactly what is settleable from the payload:
 * the credit shape, the two dates against each other, the balance, and the declared due-date basis
 * against the payload it describes.
 *
 * Returns `null` when nothing local is wrong — which never means the door will admit it.
 */
export function localTradeInvoiceRefusal(input: StartTradeInvoiceWorkInput): TradeInvoiceRefusal | null {
  // The credit shape, refused by name and FIRST, so the #666/#662 boundary is spoken rather than
  // silent. The tax facts are opaque, but a MyInvois `type_code` of '02' IS a credit note however
  // the caller labels it — 0225 refuses the same shape for the same reason.
  const typeCode = input.tax_facts && typeof input.tax_facts["type_code"] === "string"
    ? (input.tax_facts["type_code"] as string).trim()
    : null;
  if (typeCode === "02") {
    return refuse("kind", "credit_shape_not_admitted", { type_code: typeCode });
  }

  if (input.due_date !== null && input.due_date < input.document_date) {
    return refuse("due_date", "invalid_due_date", {
      due_date: input.due_date, document_date: input.document_date, constraint: "not_before_document",
    });
  }
  if (input.due_date_source === "stated" && input.due_date === null) {
    return refuse("due_date_source", "invalid_due_date", { constraint: "declaration_contradicts_payload" });
  }
  if (input.due_date_source === "absent" && input.due_date !== null) {
    return refuse("due_date_source", "invalid_due_date", { constraint: "declaration_contradicts_payload" });
  }
  // `counterparty_terms` is the DATABASE's answer, never the caller's: only it holds
  // `clara.counterparties.payment_terms_days`. A caller claiming it has invented a fact.
  if (input.due_date_source === "counterparty_terms") {
    return refuse("due_date_source", "invalid_due_date", { constraint: "derived_by_the_database" });
  }

  let debit = 0;
  let credit = 0;
  for (const line of input.lines) {
    const oneSided = (line.debit_cents > 0 && line.credit_cents === 0)
      || (line.credit_cents > 0 && line.debit_cents === 0);
    if (!oneSided) {
      return refuse("lines", "unbalanced_basis", { constraint: "exactly_one_side", account_code: line.account_code });
    }
    debit += line.debit_cents;
    credit += line.credit_cents;
  }
  if (debit !== credit) {
    return refuse("lines", "unbalanced_basis", { debit_cents: debit, credit_cents: credit });
  }
  if (debit === 0) {
    return refuse("lines", "invalid_total", { constraint: "nonzero_total" });
  }
  // The stated total must at least be REACHABLE from the lines: no single leg can carry it if the
  // whole entry is smaller. The exact control-leg tie needs the chart and is the door's.
  if (input.total_cents > debit) {
    return refuse("total_cents", "invalid_total", {
      total_cents: input.total_cents, entry_total_cents: debit, constraint: "control_leg_tie",
    });
  }
  if (input.counterparty.id === undefined
      && input.counterparty.name === undefined
      && input.counterparty.registration_no === undefined
      && input.counterparty.tin === undefined) {
    return refuse("counterparty", "party_unresolved", { constraint: "required" });
  }
  return null;
}

/**
 * `p_particulars` — the jsonb the door takes. The journal basis is a SEPARATE argument (`p_basis`),
 * unlike #638's claim door, because a trade invoice's journal is not derivable from its
 * particulars: which expense account a bill debits is a coding judgement, not an arithmetic one.
 */
export function tradeInvoiceFromInput(input: StartTradeInvoiceWorkInput): Record<string, unknown> {
  const party: Record<string, unknown> = {};
  if (input.counterparty.id !== undefined) party.id = input.counterparty.id;
  if (input.counterparty.name !== undefined) party.name = input.counterparty.name.trim();
  if (input.counterparty.registration_no !== undefined) {
    party.registration_no = input.counterparty.registration_no.trim();
  }
  if (input.counterparty.tin !== undefined) party.tin = input.counterparty.tin.trim();
  return {
    counterparty: party,
    document_date: input.document_date,
    due_date: input.due_date,
    due_date_source: input.due_date_source,
    reference: input.reference === null ? null : input.reference.trim(),
    currency: "MYR",
    total_cents: input.total_cents,
    tax_facts: input.tax_facts,
  };
}

/** `p_basis` — the journal the invoice posts, in the shape `clara._assert_journal_basis` reads. */
export function journalBasisFromInput(input: StartTradeInvoiceWorkInput): Record<string, unknown> {
  return {
    posting_date: input.posting_date,
    memo: input.memo.trim().slice(0, MEMO_MAX_CHARS),
    currency: "MYR",
    lines: input.lines.map((line) => ({
      account_code: line.account_code.trim(),
      debit_cents: line.debit_cents,
      credit_cents: line.credit_cents,
      description: line.description === undefined || line.description === null
        ? null
        : String(line.description).slice(0, LINE_DESCRIPTION_MAX_CHARS),
    })),
  };
}

/**
 * A DISPLAY HELPER, NEVER THE WIRE — the #638 footer rule. It states, in one line, the accounting
 * fact the particulars produce, so a surface (or a model) can SHOW it before it is admitted.
 *
 * It does NOT name the control account: which account is the control account is a fact about the
 * client's chart, and this module has no chart. It names the DOMAIN, which the kind decides.
 */
export function basisFromTradeInvoice(input: StartTradeInvoiceWorkInput): {
  kind: TradeInvoiceKind;
  domain: "ar" | "ap";
  control_account_class: "receivable" | "payable";
  item_kind: "invoice" | "bill";
  total_cents: number;
  document_date: string;
  due_date: string | null;
  due_date_source: DueDateSource;
} {
  return {
    kind: input.kind,
    domain: input.kind === "sales_invoice" ? "ar" : "ap",
    control_account_class: controlKindFor(input.kind),
    item_kind: input.kind === "sales_invoice" ? "invoice" : "bill",
    total_cents: input.total_cents,
    document_date: input.document_date,
    due_date: input.due_date,
    due_date_source: input.due_date_source,
  };
}

// ---------------------------------------------------------------------------------------------
// WHAT THE SUCCESSOR (`chatTurn_v21`) MUST WIRE, and nothing more.
//
//   1. `tool({ inputSchema: startTradeInvoiceWorkInputSchema, execute })` under the name
//      `START_TRADE_INVOICE_WORK_TOOL`, registered beside the tools v20 already has (all of which
//      stay exactly as v20 has them).
//   2. In `execute`: the client pin (`if (!ctx.clientId) return noClientRefusal()`), then
//      `const local = localTradeInvoiceRefusal(input); if (local) return local;`.
//   3. `const intentKey = stableOpKey(ctx.taskId, START_TRADE_INVOICE_WORK_TOOL, input);`
//      — the SAME identity discipline `start_journal_work` uses, so a re-run turn resolves to the
//      Work it already admitted instead of admitting a second one.
//   4. ONE query. THE ARGUMENT ORDER IS FIXED HERE:
//
//        select clara.admit_trade_invoice_work(
//          $1::uuid,   -- ctx.clientId
//          $2::uuid,   -- ctx.createdBy
//          $3::text,   -- intentKey
//          $4::text,   -- input.kind
//          $5::jsonb,  -- tradeInvoiceFromInput(input)
//          $6::jsonb,  -- journalBasisFromInput(input)
//          $7::text,   -- input.basis_origin ('clara_interpreted' on the chat lane)
//          $8::jsonb,  -- [{ kind: 'chat_task', task_id: ctx.taskId, session_id: <from the task> }]
//          $9::text    -- modelId
//        ) as r
//
//      The door is granted to `clara_runtime` (the #915 lesson: a `clara_authenticated`-only door
//      makes the tool a guaranteed grant refusal).
//   5. The SAME result mapping `runStartJournalWork` already has: a `WorkAcceptedPart` on success,
//      and the database's typed `(code, detail.reason)` handed back on a refusal. The answer
//      carries `invoice_id`, `kind`, `counterparty_id`, `due_date` and `due_date_source` beside
//      `work_id` / `task_id` / `logical_op_id` / `status` / `replayed`.
//   6. The prompt stanza must say "I've QUEUED it": the tool ADMITS and posts nothing. The entry is
//      written moments later by a `claraWork` run under a wake credential minted OBO the same
//      human, with the database rechecking role, period, chart and cents at commit.
//
// **NO `WORK_ACCEPTED_PURPOSES` WIDENING IS REQUIRED.** `chatTurn.v19.parts.ts:91`'s frozen
// `WORK_ACCEPTED_PURPOSES_V19 = ["journal_entry","periodic_stock_adjustment","payroll_obligation"]`
// already names a trade-invoice Work: its purpose IS `journal_entry`, exactly as #638's claim is
// (migration 0225's header states why — a fourth purpose cannot post without recutting the posting
// core's Work lookup). The chat `work_accepted` part therefore needs no change and
// `p6-1-parts-parity.test.mjs` stays green.
//
// WHAT THE SUCCESSOR MUST NOT DO: mint a new claraWork bundle. A trade-invoice Work runs through
// the EXISTING frozen `claraWork_v4` body byte for byte — it reads `basis` off the Work row and
// nothing else, and the typed invoice lives in `clara.trade_invoices`, which the run never reads
// and never echoes. An ambiguous counterparty is refused AT ADMISSION (D12a) precisely so no new
// mid-run question shape is needed; a fact discovered mid-run goes through `claraWork_v4`'s
// existing `ASK_QUESTION_TOOL`, already in its closed roster.
//
// ONE HONEST LIMIT ON THIS STANZA: `chatTurn_v19`'s complete tool roster and its prompt stanzas
// were never enumerated in this ticket's research — only `chatTurn.v18.tools.ts:52`,
// `chatTurn.v19.tools.ts:98`/`:380` and `chatTurn.v20.tools.ts:6-9`'s delta of exactly two. This
// stanza therefore names ONLY `start_trade_invoice_work` and assumes no other tool's shape;
// enumerating the full v21 roster and reconciling the other lanes' stanzas is the integration
// worker's job at the cut.
// ---------------------------------------------------------------------------------------------
