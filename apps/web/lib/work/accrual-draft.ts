// #652 — THE UNSENT ACCRUAL DRAFT, and the intent identity that travels with it.
//
// IT IS `lib/work/journal-draft.ts`'s MECHANISM, REUSED — the scope key shape, the storage
// surface, the intent-key lifecycle and the "every read is untrusted" posture are that module's and
// are imported from it, not re-derived. What differs is exactly two things, and both are forced:
//
//   THE KEY PREFIX. An accrual configuration and a journal entry are different intents with
//   different payloads; filed under one key, opening one form would seed it with the other's draft
//   and a restore would fail its own parser. `clara:accrual-draft` keeps them apart under the same
//   user+firm+client scoping — which is what stops a draft crossing into another client's books.
//
//   THE PARSER. It reads a whole `AccrualDraft`, and every field is validated field by field;
//   anything not fully recognised returns null, because a half-understood draft is worse than none:
//   it would seed a form with figures nobody typed.
//
// `sessionStorage`, NOT `localStorage`, for the trust reason that module states: an accrued amount
// and a service period are client financial data, and `localStorage` would leave one member's
// half-typed accrual on a shared machine after they closed the tab.
//
// THE OP KEY IS THE DRAFT'S, NOT THE COMPONENT'S. `clara.create_accrual_adjustment` is idempotent
// on `(firm, 'create_accrual_adjustment', op_key)`, so a resubmit after a lost acknowledgement must
// carry the identity the database already knows — and a value that dies with a re-render cannot be
// an identity. It is minted ONCE when the draft starts, stored WITH the draft, and renewed only
// when the particulars change, because changed figures are a different decision.

import {
  defaultDraftStorage,
  journalDraftKey,
  type DraftStorage,
  type JournalDraftScope,
} from "./journal-draft";
import {
  ACCRUAL_METHODS,
  ACCRUAL_FREQUENCIES,
  ACCRUAL_DAY_RULES,
  accrualScheduleDues,
  accrualScheduleYields,
  type AccrualMethod,
  type AccrualPeriodAmount,
} from "@/lib/accruals/api";

/** #937 — one row of the per-period amounts block. `dueDate` is a date the SCHEDULE produces, and
 *  the form offers those dates rather than asking for them, which is what keeps the door's
 *  `accrual_period_amount_not_scheduled` refusal unreachable from this surface. */
export type AccrualPeriodAmountDraft = { dueDate: string; amountCents: number };

/** Every control the form owns, as strings — the form's own state shape. Cents is the one
 *  exception: `MoneyInput` speaks exact minor units and a string would invite a float. */
export type AccrualDraft = {
  purpose: string;
  authorityWorkId: string;
  expenseAccountCode: string;
  liabilityAccountCode: string;
  amountCents: number;
  servicePeriodStart: string;
  servicePeriodEnd: string;
  method: AccrualMethod;
  /** #937 — one row per period the accountant has stated an amount for, under the
   *  `stated_period_amount` rule. Empty under `stated_amount`, and the mapper drops the key
   *  entirely there: the door refuses `period_amounts` beside any other rule. Cents is an exact
   *  integer for the same reason `amountCents` is. */
  periodAmounts: AccrualPeriodAmountDraft[];
  instruction: string;
  memo: string;
  frequency: (typeof ACCRUAL_FREQUENCIES)[number];
  dayRule: (typeof ACCRUAL_DAY_RULES)[number];
  dayOfMonth: string;
  effectiveFrom: string;
  effectiveTo: string;
  /** The OPTIONAL source document, or "" for none. It rides the draft under the SAME key as the
   *  particulars because it is part of the same intent: the door folds the canonical particulars —
   *  the document among them — into its reservation payload, so re-sending one op key with a
   *  DIFFERENT document is a typed conflict rather than a replay. */
  sourceDocumentId: string;
};

export function emptyAccrualDraft(): AccrualDraft {
  return {
    purpose: "",
    authorityWorkId: "",
    expenseAccountCode: "",
    liabilityAccountCode: "",
    amountCents: 0,
    servicePeriodStart: "",
    servicePeriodEnd: "",
    method: "stated_amount",
    periodAmounts: [],
    instruction: "",
    memo: "",
    frequency: "monthly",
    dayRule: "last_day_of_month",
    dayOfMonth: "",
    effectiveFrom: "",
    effectiveTo: "",
    sourceDocumentId: "",
  };
}

export type StoredAccrualDraft = {
  /** Minted when the draft STARTS. Stable across every edit of the SAME particulars and every
   *  resubmit of them; a genuinely new decision gets a new one. */
  opKey: string;
  draft: AccrualDraft;
};

const KEY_PREFIX = "clara:accrual-draft";

/** The storage key. Derived from `journalDraftKey` so the SCOPE RULE — user+firm+client, every part
 *  percent-encoded — has exactly one definition in the app; only the prefix is swapped. */
export function accrualDraftKey(scope: JournalDraftScope): string {
  return journalDraftKey(scope).replace(/^clara:journal-draft/, KEY_PREFIX);
}

const isString = (v: unknown): v is string => typeof v === "string";
const isCents = (v: unknown): v is number => Number.isSafeInteger(v);

function parseDraft(raw: string): StoredAccrualDraft | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const stored = parsed as Record<string, unknown>;
  if (!isString(stored.opKey) || stored.opKey.trim() === "") return null;
  if (typeof stored.draft !== "object" || stored.draft === null) return null;
  const d = stored.draft as Record<string, unknown>;

  if (!ACCRUAL_METHODS.includes(d.method as never)) return null;
  if (!ACCRUAL_FREQUENCIES.includes(d.frequency as never)) return null;
  if (!ACCRUAL_DAY_RULES.includes(d.dayRule as never)) return null;
  const texts = [
    "purpose", "authorityWorkId", "expenseAccountCode", "liabilityAccountCode",
    "servicePeriodStart", "servicePeriodEnd", "instruction", "memo", "dayOfMonth",
    "effectiveFrom", "effectiveTo", "sourceDocumentId",
  ] as const;
  for (const key of texts) if (!isString(d[key])) return null;
  // CENTS MUST BE A SAFE INTEGER EVEN COMING OUT OF STORAGE. A JSON payload can carry 12.5 or
  // "1200"; seeding a money field from either is the floating-point coercion this lane forbids.
  if (!isCents(d.amountCents)) return null;
  // #937 — the per-period rows, under the SAME "anything not fully recognised returns null" law:
  // a half-understood set of period amounts would seed the form with figures nobody typed, and
  // these are the figures that post. An ABSENT key is an older draft and reads as none.
  const rows = d.periodAmounts === undefined ? [] : d.periodAmounts;
  if (!Array.isArray(rows)) return null;
  const periodAmounts: AccrualPeriodAmountDraft[] = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) return null;
    const r = row as Record<string, unknown>;
    if (!isString(r.dueDate) || !isCents(r.amountCents)) return null;
    periodAmounts.push({ dueDate: r.dueDate, amountCents: r.amountCents });
  }

  const draft: AccrualDraft = emptyAccrualDraft();
  for (const key of texts) draft[key] = d[key] as string;
  draft.amountCents = d.amountCents;
  draft.periodAmounts = periodAmounts;
  draft.method = d.method as AccrualMethod;
  draft.frequency = d.frequency as AccrualDraft["frequency"];
  draft.dayRule = d.dayRule as AccrualDraft["dayRule"];

  return { opKey: stored.opKey, draft };
}

/** The draft filed under this exact scope, or null. Never throws: a storage that refuses to be read
 *  is the same answer as an empty one. */
export function readAccrualDraft(
  scope: JournalDraftScope,
  storage: DraftStorage | null = defaultDraftStorage(),
): StoredAccrualDraft | null {
  if (storage === null) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(accrualDraftKey(scope));
  } catch {
    return null;
  }
  return raw === null ? null : parseDraft(raw);
}

/** Files the draft under this scope. Returns whether it was actually stored, so a caller can tell
 *  "saved" from "this browser does not keep it" rather than promising a reload recovery it cannot
 *  deliver (§3: "Do not promise reload recovery from memory-only state"). */
export function writeAccrualDraft(
  scope: JournalDraftScope,
  draft: StoredAccrualDraft,
  storage: DraftStorage | null = defaultDraftStorage(),
): boolean {
  if (storage === null) return false;
  try {
    storage.setItem(accrualDraftKey(scope), JSON.stringify(draft));
    return true;
  } catch {
    // A quota failure, or a browser refusing storage. The form keeps working.
    return false;
  }
}

/** Retires the draft — called ONLY after the door has answered, because until then the typed
 *  particulars are the only copy that exists. */
export function clearAccrualDraft(
  scope: JournalDraftScope,
  storage: DraftStorage | null = defaultDraftStorage(),
): void {
  if (storage === null) return;
  try {
    storage.removeItem(accrualDraftKey(scope));
  } catch {
    // Nothing to recover from: the draft is being discarded either way.
  }
}

// ── the field mapper ────────────────────────────────────────────────────────

export type AccrualFieldId =
  | "purpose" | "authorityWorkId" | "expenseAccountCode" | "liabilityAccountCode"
  | "amountCents" | "servicePeriodStart" | "servicePeriodEnd" | "method" | "instruction"
  | "memo" | "frequency" | "dayRule" | "dayOfMonth" | "effectiveFrom" | "effectiveTo"
  | "sourceDocumentId" | "periodAmounts";

/** The controls a SERVER refusal can land on. Everything migration 0222 can name in
 *  `detail.field` appears here and nothing else does: a mapper that promised to focus a control for
 *  a refusal that cannot arrive would be a promise the database never keeps. */
const ACCRUAL_FIELDS = new Set<string>([
  "purpose", "authorityWorkId", "expenseAccountCode", "liabilityAccountCode", "amountCents",
  "servicePeriodStart", "servicePeriodEnd", "method", "instruction", "memo",
  "frequency", "dayRule", "dayOfMonth", "effectiveFrom", "effectiveTo", "sourceDocumentId",
  // #937. Migration 0303 can name this one INDEXED — `accrual.period_amounts[2].amount_cents` —
  // because a refusal about one row has to say which row; the mapper strips the subscript and
  // folds every one of them onto the block, which is the one control there is for it.
  "periodAmounts",
]);

/**
 * `detail.field` → the control that holds the mistake.
 *
 * TWO PREFIXES, ONE MAPPER. The typed particulars are prefixed `accrual.` (0222's own spelling, so
 * they can never collide with the journal basis's `posting_date` / `lines[N]`), and the door's own
 * schedule refusals come back unprefixed from `clara._assert_plan_schedule` (`frequency`,
 * `day_rule`, `day_of_month`, `effective_from`, `effective_to`) because that validator is 0193's
 * and its vocabulary is not this lane's to re-spell. `method.rule` folds onto the `method` control,
 * which is the only control there is for it.
 */
export function fieldForAccrualPath(path: string | null): AccrualFieldId | null {
  if (path === null) return null;
  const bare = path.startsWith("accrual.") ? path.slice("accrual.".length) : path;
  const head = (bare.split(".")[0] ?? bare).replace(/\[\d+\]$/, "");
  const camel = head.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
  return ACCRUAL_FIELDS.has(camel) ? (camel as AccrualFieldId) : null;
}

// ── local validation ────────────────────────────────────────────────────────

export type AccrualIssue = { field: AccrualFieldId; code: string };

/**
 * Every refusal the form can raise BEFORE a round trip, in the order the controls appear. Each one
 * MIRRORS a rule `clara._assert_accrual_particulars` or `clara._assert_plan_schedule` enforces —
 * nothing here is a rule of its own, and the database is the authority.
 *
 * IT REFUSES BEFORE ADMISSION, which is #652's own ruling and the estate's standing one: a missing
 * particular is refused at the form, never admitted hoping a Work question completes the basis,
 * because an admitted Work's basis is immutable.
 */
export function validateAccrualDraft(
  draft: AccrualDraft,
  knownAccounts: ReadonlySet<string> | null = null,
): AccrualIssue[] {
  const issues: AccrualIssue[] = [];
  const t = (v: string) => v.trim();

  if (t(draft.purpose) === "") issues.push({ field: "purpose", code: "purposeRequired" });
  if (t(draft.authorityWorkId) === "") issues.push({ field: "authorityWorkId", code: "authorityRequired" });

  // THE FIVE PARTICULARS BOTH DRAFTS CARRY, in the order their controls appear. Shared with the
  // #936 correction draft rather than written twice: the codes, the fields and the order are one
  // rule each, and a rule with two owners is one that gets changed in one place.
  issues.push(...validateAccrualParticulars(draft, knownAccounts));

  if (t(draft.effectiveFrom) === "") issues.push({ field: "effectiveFrom", code: "effectiveFromRequired" });
  // THE AUTHORITY ENDS, AND IT ENDS INSIDE THE TERM IT ACCRUES FOR (0222's SIXTH MEASUREMENT,
  // mirrored here so the mistake is named beside the control rather than a round trip later). An
  // open-ended authority under a term that ends would go on posting a line naming a period it had
  // already run past — measured on a rig before the wall existed.
  if (t(draft.effectiveTo) === "") {
    issues.push({ field: "effectiveTo", code: "effectiveToRequired" });
  } else if (t(draft.effectiveFrom) !== "" && draft.effectiveTo < draft.effectiveFrom) {
    issues.push({ field: "effectiveTo", code: "effectiveToBeforeFrom" });
  }
  // ONLY ONCE THE TERM ITSELF STANDS UP. A term that is absent or ends before it starts is the
  // mistake to fix first, and piling two window issues on top of it would send the preparer to the
  // wrong control.
  const termStands = t(draft.servicePeriodStart) !== "" && t(draft.servicePeriodEnd) !== ""
    && draft.servicePeriodEnd >= draft.servicePeriodStart;
  if (termStands && t(draft.effectiveFrom) !== ""
      && draft.effectiveFrom < draft.servicePeriodStart) {
    issues.push({ field: "effectiveFrom", code: "windowBeforeTerm" });
  }
  if (termStands && t(draft.effectiveTo) !== "" && draft.effectiveTo > draft.servicePeriodEnd) {
    issues.push({ field: "effectiveTo", code: "windowAfterTerm" });
  }

  if (draft.dayRule === "day_of_month") {
    const day = Number(t(draft.dayOfMonth));
    if (!Number.isInteger(day) || day < 1 || day > 28) {
      issues.push({ field: "dayOfMonth", code: "dayOfMonthRange" });
    } else if (draft.frequency === "monthly" && day === 1) {
      // 0193's ONE COLLIDING SHAPE (`_assert_plan_schedule`'s reversing arm), named at the control
      // rather than arriving as a refusal a round trip later.
      issues.push({ field: "dayOfMonth", code: "reversalCollides" });
    }
  } else if (t(draft.dayOfMonth) !== "") {
    issues.push({ field: "dayOfMonth", code: "dayOfMonthAbsent" });
  }

  // …AND THE SCHEDULE REACHES AN ACCRUAL DATE INSIDE THE WINDOW (0222's SEVENTH MEASUREMENT).
  // ASKED LAST, and only once everything it depends on stands up: a day number out of range or a
  // window that ends before it starts is the mistake to fix first, and this issue would otherwise
  // pile onto a control the preparer has already been sent to. MEASURED before the wall existed
  // (review round 2, NB1): a half-month term on a month-end rule was accepted, the plan went live
  // and no due date was ever reached.
  const dayNumber = Number(t(draft.dayOfMonth));
  const scheduleStands = !issues.some((i) => i.field === "dayOfMonth")
    && t(draft.effectiveFrom) !== "" && t(draft.effectiveTo) !== ""
    && draft.effectiveTo >= draft.effectiveFrom;
  if (scheduleStands
      && !accrualScheduleYields(draft.frequency, draft.dayRule,
           draft.dayRule === "day_of_month" ? dayNumber : null,
           draft.effectiveFrom, draft.effectiveTo)) {
    // The DAY RULE, or the day number under it — the control that makes this a wall rather than a
    // ban. The term is the fact a human stated; the schedule is the thing to change.
    issues.push({
      field: draft.dayRule === "day_of_month" ? "dayOfMonth" : "dayRule",
      code: "scheduleYieldsNone",
    });
  }

  // #937 — THE TWO PER-PERIOD RULES THAT NEED THE SCHEDULE, asked here because this is the draft
  // that carries one. ASKED LAST, and only once the schedule itself stands up: a day number out of
  // range or a window that yields nothing is the mistake to fix first, and "no amount is stated for
  // any period" piled on top of it would be true of a schedule the preparer is still fixing.
  issues.push(...validateStatedPeriodCoverage(draft, {
    frequency: draft.frequency,
    dayRule: draft.dayRule,
    dayOfMonth: draft.dayRule === "day_of_month" ? dayNumber : null,
    effectiveFrom: draft.effectiveFrom,
    effectiveTo: draft.effectiveTo,
  }, issues.length > 0));

  return issues;
}

/** The schedule a per-period set must cover — the five plan facts `accrualScheduleDues` walks. On
 *  the CREATE form they are controls; on the #936 correction form they are the LIVE revision's
 *  own, read off the accrual and not editable. */
export type AccrualScheduleFacts = {
  frequency: (typeof ACCRUAL_FREQUENCIES)[number];
  dayRule: (typeof ACCRUAL_DAY_RULES)[number];
  dayOfMonth: number | null;
  effectiveFrom: string;
  effectiveTo: string;
};

/**
 * #937 — every stated date is one this schedule produces, and every date it produces is stated.
 * The second is the door's `accrual_period_amount_missing`; the first is
 * `accrual_period_amount_not_scheduled`, which a preparer cannot reach from a form that OFFERS the
 * dates — it is mirrored anyway, because a restored draft can carry a date a since-changed
 * schedule no longer produces.
 */
export function validateStatedPeriodCoverage(
  draft: AccrualParticularsSource,
  schedule: AccrualScheduleFacts,
  scheduleUnsettled = false,
): AccrualIssue[] {
  if (draft.method !== "stated_period_amount" || scheduleUnsettled) return [];
  const dues = accrualScheduleDues(schedule.frequency, schedule.dayRule, schedule.dayOfMonth,
    schedule.effectiveFrom, schedule.effectiveTo);
  if (dues.length === 0) return [];
  const rows = draft.periodAmounts;
  const stated = new Set(rows.map((r) => r.dueDate));
  const issues: AccrualIssue[] = [];
  if (rows.some((r) => r.dueDate !== "" && !dues.includes(r.dueDate))) {
    issues.push({ field: "periodAmounts", code: "periodAmountNotScheduled" });
  }
  if (dues.some((due) => !stated.has(due))) {
    issues.push({ field: "periodAmounts", code: "periodAmountMissing" });
  }
  return issues;
}

export function firstInvalidAccrualField(issues: readonly AccrualIssue[]): AccrualFieldId | null {
  return issues[0]?.field ?? null;
}

/**
 * THE FIVE PARTICULARS EVERY ACCRUAL DRAFT STATES — both account legs, the amount, the term and
 * the instruction — validated once, in the order their controls appear.
 *
 * WHY IT IS SHARED (standards review L06-STD-1). `validateAccrualDraft` (create) and
 * `validateAccrualCorrectionDraft` (#936) each carried a byte-identical copy of these checks: the
 * same five fields, the same issue codes, the same order. That is Fowler's Duplicated Code with
 * the sharpest edge it has — the two copies are a rule of the ACCOUNTING domain, so a later change
 * to one (a currency-precision rule, a reworded `accountsNotDistinct`) silently makes the create
 * form and the correction form disagree about what a valid accrual is.
 *
 * The parameter is `AccrualParticularsSource`, the same `Pick` `toAccrualParticulars` takes, so
 * either draft shape satisfies it structurally. Each caller appends its OWN issues around this
 * call: create adds purpose, authority and the schedule window; a correction adds the brackets of
 * the window it may not move.
 */
export function validateAccrualParticulars(
  draft: AccrualParticularsSource,
  knownAccounts: ReadonlySet<string> | null = null,
): AccrualIssue[] {
  const issues: AccrualIssue[] = [];
  const t = (v: string) => v.trim();

  if (t(draft.expenseAccountCode) === "") {
    issues.push({ field: "expenseAccountCode", code: "expenseAccountRequired" });
  } else if (knownAccounts !== null && !knownAccounts.has(t(draft.expenseAccountCode))) {
    issues.push({ field: "expenseAccountCode", code: "accountUnknown" });
  }
  if (t(draft.liabilityAccountCode) === "") {
    issues.push({ field: "liabilityAccountCode", code: "liabilityAccountRequired" });
  } else if (knownAccounts !== null && !knownAccounts.has(t(draft.liabilityAccountCode))) {
    issues.push({ field: "liabilityAccountCode", code: "accountUnknown" });
  }
  if (t(draft.expenseAccountCode) !== "" && t(draft.expenseAccountCode) === t(draft.liabilityAccountCode)) {
    issues.push({ field: "liabilityAccountCode", code: "accountsNotDistinct" });
  }

  if (!Number.isSafeInteger(draft.amountCents) || draft.amountCents <= 0) {
    issues.push({ field: "amountCents", code: "amountRequired" });
  }

  // THE TERM. Both halves, and its own code rather than a generic "required", because the
  // preparer's next move differs: they have to go and find out, not fix a typo.
  if (t(draft.servicePeriodStart) === "") issues.push({ field: "servicePeriodStart", code: "silentTerm" });
  if (t(draft.servicePeriodEnd) === "") issues.push({ field: "servicePeriodEnd", code: "silentTerm" });
  if (t(draft.servicePeriodStart) !== "" && t(draft.servicePeriodEnd) !== ""
      && draft.servicePeriodEnd < draft.servicePeriodStart) {
    issues.push({ field: "servicePeriodEnd", code: "servicePeriodOrder" });
  }

  if (t(draft.instruction) === "") issues.push({ field: "instruction", code: "instructionRequired" });

  // #937 — THE PER-PERIOD RULES THAT NEED NOTHING BUT THE PARTICULARS. Each one MIRRORS a wall
  // `clara._assert_accrual_period_amounts` enforces; the two that need the SCHEDULE (every stated
  // date is one the schedule produces, every produced date is stated) are asked by the callers
  // that hold it. Nothing here is a rule of its own, and the database is the authority.
  issues.push(...validateStatedPeriodAmounts(draft));

  return issues;
}

/**
 * #937 — the exact-sum rule and the final-period remainder, plus the shape rules under them.
 *
 * THE TOTAL AND ITS PARTS ARE ONE CLAIM. Under `stated_period_amount`, `amount_cents` is the TOTAL
 * for the authority window (0303's FOURTH MEASUREMENT), so a set that does not add up to it is two
 * different statements about one accrual — which is exactly what makes the set checkable at all.
 *
 * THE REMAINDER CONVENTION GOVERNS AN EVEN SPLIT AND NOTHING ELSE. When the stated set IS an equal
 * split with one odd period — every amount is `trunc(total/n)` or `trunc(total/n) + remainder`, and
 * exactly one is the latter — that odd period must be the LAST. July 3,000 / August 3,500 never
 * enters this arm: the convention says where a DIVISION's leftover cent goes, not what a person may
 * state.
 */
function validateStatedPeriodAmounts(draft: AccrualParticularsSource): AccrualIssue[] {
  if (draft.method !== "stated_period_amount") return [];
  const rows = draft.periodAmounts;
  if (rows.length === 0) return [{ field: "periodAmounts", code: "periodAmountsRequired" }];

  const issues: AccrualIssue[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.dueDate.trim() === "") {
      issues.push({ field: "periodAmounts", code: "periodDueDateRequired" });
    } else if (seen.has(row.dueDate)) {
      issues.push({ field: "periodAmounts", code: "periodAmountDuplicate" });
    } else {
      seen.add(row.dueDate);
    }
    if (!Number.isSafeInteger(row.amountCents) || row.amountCents <= 0) {
      issues.push({ field: "periodAmounts", code: "periodAmountRequired" });
    }
  }
  // THE ARITHMETIC RULES ARE ASKED ONLY ONCE EVERY ROW STANDS UP. Summing a set that still holds a
  // blank row would report an imbalance the preparer has not caused yet, and send them to the
  // wrong mistake.
  if (issues.length > 0) return issues;

  const total = draft.amountCents;
  const sum = rows.reduce((a, r) => a + r.amountCents, 0);
  if (!Number.isSafeInteger(total) || total <= 0) return issues; // `amountRequired` already fired
  if (sum !== total) {
    issues.push({ field: "periodAmounts", code: "periodAmountsUnbalanced" });
    return issues;
  }

  const base = Math.trunc(total / rows.length);
  const remainder = total - base * rows.length;
  if (remainder !== 0) {
    const odd = rows.filter((r) => r.amountCents === base + remainder);
    const atBase = rows.filter((r) => r.amountCents === base);
    if (odd.length === 1 && atBase.length === rows.length - 1) {
      const last = rows.reduce((a, r) => (r.dueDate > a ? r.dueDate : a), "");
      if (odd[0]!.dueDate !== last) {
        issues.push({ field: "periodAmounts", code: "periodRemainderMisplaced" });
      }
    }
  }
  return issues;
}

/** The `id` attribute of one control, so a label, its error and a focus call all name one element. */
export function accrualFieldElementId(field: AccrualFieldId): string {
  return `accrual-${field}`;
}

/** The nine particulars fields both the CREATE draft and the #936 CORRECTION draft carry — a
 *  `Pick`, not the full `AccrualDraft`, so `toAccrualParticulars` below accepts either shape
 *  structurally and a correction needs no second copy of this mapping. */
type AccrualParticularsSource = Pick<
  AccrualDraft,
  "expenseAccountCode" | "liabilityAccountCode" | "amountCents" | "servicePeriodStart"
  | "servicePeriodEnd" | "method" | "instruction" | "memo" | "sourceDocumentId" | "periodAmounts"
>;

/** The draft as the door's `p_accrual` argument, in the DATABASE's own field spelling. Only what
 *  0222 reads: the schedule, the window and the authority are the door's OWN arguments, and a key
 *  the database never reads could carry no refusal. */
export function toAccrualParticulars(draft: AccrualParticularsSource): {
  expense_account_code: string;
  liability_account_code: string;
  amount_cents: number;
  currency: string;
  service_period_start: string;
  service_period_end: string;
  term_source: "human_stated";
  method: { rule: AccrualMethod };
  period_amounts?: AccrualPeriodAmount[];
  instruction: string;
  memo?: string;
  source_document_id?: string;
} {
  const out = {
    expense_account_code: draft.expenseAccountCode.trim(),
    liability_account_code: draft.liabilityAccountCode.trim(),
    amount_cents: draft.amountCents,
    currency: "MYR",
    service_period_start: draft.servicePeriodStart,
    service_period_end: draft.servicePeriodEnd,
    // ALWAYS `human_stated`, and the form offers no control for it: a period a model read off a
    // document may not enter the durable record (0140's table comment, CONFIRMED AS LAW), and the
    // only thing this surface can send is a term a person typed.
    term_source: "human_stated" as const,
    method: { rule: draft.method },
    instruction: draft.instruction.trim(),
  };
  const memo = draft.memo.trim();
  const document = draft.sourceDocumentId.trim();
  // #937 — THE KEY IS SENT ONLY UNDER THE RULE THAT PERFORMS IT. `clara._assert_accrual_period_-
  // amounts` refuses `period_amounts` beside `stated_amount` by name, so sending `[]` there would
  // be this form manufacturing a refusal the preparer never asked for.
  const periods = draft.method === "stated_period_amount"
    ? draft.periodAmounts.map((r) => ({ due_date: r.dueDate, amount_cents: r.amountCents }))
    : null;
  return Object.assign(
    out,
    memo === "" ? {} : { memo },
    document === "" ? {} : { source_document_id: document },
    periods === null ? {} : { period_amounts: periods },
  );
}

// ── #936: THE ACCRUAL CORRECTION DRAFT ──────────────────────────────────────
//
// A CORRECTION IS NOT A CREATION, and its draft says so by carrying fewer fields: no purpose, no
// authority, no schedule. `clara.correct_accrual_adjustment` takes none of those as arguments —
// the plan's purpose is unchanged and the schedule (frequency/day_rule/day_of_month/timezone) and
// the authority window (effective_from/effective_to) are the LIVE revision's own, carried through
// server-side (the migration's own header). What a correction restates is the nine particulars
// `AccrualParticularsSource` above already names, so this draft is exactly that shape plus nothing.

export type AccrualCorrectionDraft = AccrualParticularsSource;

/** The authority window a correction may NOT move — read off the accrual being corrected, never
 *  typed. `validateAccrualCorrectionDraft` mirrors `clara._assert_accrual_term_window` against it
 *  so a corrected term that would fall outside it is refused HERE, beside the control that holds
 *  the mistake, rather than at a round trip. */
/** #937 widened it from the two window dates to the LIVE revision's whole schedule: a corrected
 *  per-period set must cover exactly the due dates the plan that is actually running will reach,
 *  and those need the frequency and the day rule as well as the window. Every one of the five is
 *  read off the accrual being corrected; not one of them is a control on that form. */
export type AccrualCorrectionWindow = AccrualScheduleFacts;

/**
 * Every refusal a correction can raise BEFORE a round trip: the five shared particulars, and then
 * the one rule that is this draft's alone — the fixed authority window must stay bracketed by the
 * term. There is no purpose, authority or schedule issue to raise: this draft carries none of
 * those controls.
 */
export function validateAccrualCorrectionDraft(
  draft: AccrualCorrectionDraft,
  window: AccrualCorrectionWindow,
  knownAccounts: ReadonlySet<string> | null = null,
): AccrualIssue[] {
  const t = (v: string) => v.trim();
  const issues: AccrualIssue[] = validateAccrualParticulars(draft, knownAccounts);

  // THE FIXED AUTHORITY WINDOW BRACKETS THE STATED TERM (0222's SIXTH MEASUREMENT, the same wall
  // `validateAccrualDraft` mirrors for CREATE) — but the MISTAKE, if any, is in the term a
  // correction is free to restate, never in the window a correction cannot move. So the issue
  // lands on the service-period control, the one the preparer can actually act on here.
  const termStands = t(draft.servicePeriodStart) !== "" && t(draft.servicePeriodEnd) !== ""
    && draft.servicePeriodEnd >= draft.servicePeriodStart;
  if (termStands && window.effectiveFrom < draft.servicePeriodStart) {
    issues.push({ field: "servicePeriodStart", code: "windowBeforeTerm" });
  }
  if (termStands && window.effectiveTo > draft.servicePeriodEnd) {
    issues.push({ field: "servicePeriodEnd", code: "windowAfterTerm" });
  }

  // #937 — and the corrected per-period set covers exactly the periods the LIVE schedule reaches.
  // Unlike the create form, this one cannot move the schedule, so the coverage question is always
  // settled: there is no half-typed day rule to wait for.
  issues.push(...validateStatedPeriodCoverage(draft, window));

  return issues;
}
