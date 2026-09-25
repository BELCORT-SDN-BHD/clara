// #933 — WHAT CLARA PROPOSES WHEN AN ENROLLED ASSET ACCOUNT HAS NO DEFAULT POLICY.
//
// WHY THIS FILE EXISTS. #932 gave an enrolled fixed-asset account a person-set default
// depreciation policy: an acquisition on a covered account is born COMPLETE and no question opens
// at all. #883's second half is the other account — the one nobody has set a policy for. There the
// #639 dependent particulars question still parks the Work, and the owner's 2026-09-18 ruling is
// that it no longer parks an EMPTY form: Clara proposes the particulars, with the one line she
// derived them from, and a person confirms or edits. This module is that derivation, and nothing
// else.
//
// A PERSON STAYS THE AUTHOR OF EVERY DEPRECIATION ESTIMATE — the ruling's own words, and the rule
// that shapes every line below. A useful life is a professional judgement about how long a thing
// will earn its keep; it is not recoverable from an asset's name, and a product that guessed one
// from the word "compressor" would be making that judgement under a person's signature. So:
//
//   * A DRIVER IS PROPOSED ONLY WHERE A GROUND EXISTS. Four grounds, in this order of authority:
//       enrolment              — an enrolment with no accumulated-depreciation account admits
//                                `none` and nothing else. That is not an estimate at all, it is
//                                `clara.complete_fixed_asset_particulars`'s own rule
//                                (0041:3080-3083), and proposing anything else would be proposing
//                                a refusal.
//       client_knowledge       — a depreciation note recorded against this client (or this
//                                account) by a person of the firm. See THE KNOWLEDGE GROUND below.
//                                Two records that disagree ground nothing, exactly as two siblings
//                                that disagree do.
//       retired_account_policy — THIS account's own default policy, retired. A person of the firm
//                                signed it for these very assets; that it was later retired makes
//                                it history, not noise, and it is named as retired in the reason.
//       account_siblings       — the account's other COMPLETED assets, where they AGREE. A split
//                                account grounds nothing and says so: picking a side would be
//                                Clara choosing between two humans' judgements.
//   * ONE ACCOUNT RULE, THE SAME ON ALL THREE GROUNDS. A ground speaks for this row only when its
//     OWN account is this row's account — and `clara.fixed_assets.asset_account_code` is nullable,
//     so a row on no account grounds on nothing but inputs that are also on no account. Three arms
//     that disagreed about one null let a sibling from any account in the register ground a
//     proposal whose reason then named an account it never came from.
//   * THE TWO FACTS THAT ARE NOT ESTIMATES ARE ALWAYS PROPOSED. The in-service date is the
//     acquisition's own posting date (the owner's #932 decision, applied to the same question),
//     and the residual is nil (the owner's #932 default). Both are stated rather than inferred.
//   * THE RESIDUAL IS NEVER READ OFF A GROUND, and none of the three ground types carries one.
//     The owner's #932 decision fixes it at the firm's nil default, so a ground's own residual
//     could only ever be half-adopted — the drivers taken, the residual discarded — under a
//     sentence claiming Clara proposed "the same". The field used to sit on all three input types
//     and be read by none; it is gone, and the sibling sentence now names the DRIVERS it read.
//   * WHERE NOTHING GROUNDS A METHOD, `method` IS NULL and the reason says so in words. An empty
//     method is an honest proposal; an invented one is not.
//
// NOTHING HERE IS A RULE OF ITS OWN. Every shape it proposes is one
// `clara._fa_validate_particulars` admits (0041:2977-3033): `straight_line` carries a life and no
// rate, `reducing_balance` carries both, `none` carries neither, and a residual is a non-negative
// integer number of cents. A proposal the door would refuse is worse than no proposal, so a ground
// whose own shape is incongruent is DROPPED rather than repaired.
//
// IT IS PURE, AND THAT IS DELIBERATE. The reads that gather its facts are the successor workflow's
// own step (see the successor contract in this ticket's report); a derivation that reached for a
// pool could be driven only through a database.

import { z } from "zod";

import { FA_METHODS, type FaMethod } from "./fixed-asset-acquisition.js";

/** The grounds a proposal may stand on, in the order of authority the header states. */
export const FA_PROPOSAL_BASES = [
  "enrolment",
  "client_knowledge",
  "retired_account_policy",
  "account_siblings",
  "acquisition_date",
  "firm_default_residual",
] as const;
export type FaProposalBasis = (typeof FA_PROPOSAL_BASES)[number];

/** The pending register row a question is being opened for. */
export type FaProposalAsset = {
  assetId: string;
  /** The row's description; the empty string when the acquisition birthed a placeholder. */
  description: string;
  costCents: number;
  /** No accumulated-depreciation account on the enrolment: the register admits `none` alone. */
  nonDepreciable: boolean;
  /** TRUE when #932's policy path already birthed this row complete. */
  particularsComplete: boolean;
  assetAccount: string | null;
  /**
   * The acquisition entry's posting date as a `YYYY-MM-DD` Asia/Kuala_Lumpur CALENDAR STRING — the
   * in-service date the owner's ruling names — or `null`.
   *
   * NEVER A `Date`, AND THE READER MUST CAST. `node-postgres` maps a Postgres `date` column onto a
   * JS `Date` at LOCAL midnight, whose UTC spelling under Asia/Kuala_Lumpur is the PREVIOUS
   * calendar day (measured: `select '2026-09-15'::date` → `2026-09-14T16:00:00.000Z`), and this
   * estate sets no `setTypeParser` anywhere. So the successor's own read spells it
   * `fa.acquired_date::text as acquired_date`; a caller that forgets is refused by
   * `deriveFaParticularsProposal` rather than silently shipping a date one day early, on the
   * driver every depreciation charge from then on is computed from.
   */
  acquiredDate: string | null;
};

/** One of the account's other register rows. Only a COMPLETE one grounds anything. */
export type FaProposalSibling = {
  assetAccount: string | null;
  particularsComplete: boolean;
  method: FaMethod | string | null;
  usefulLifeMonths: number | null;
  rateBps: number | null;
};

/**
 * A depreciation policy a person of the firm RECORDED against this client — the "client's recorded
 * knowledge and policies" half of the owner's ruling.
 *
 * WIRED AND UNFED ON THIS FRONTIER, AND THAT IS RECORDED RATHER THAN HIDDEN. `clara.knowledge_keys`
 * is a CLOSED, code-populated catalogue (migration 0230) and, measured on the lane database on
 * 2026-09-24, it holds fourteen keys of which none is about depreciation: accounting_basis,
 * banking_arrangement, coa_seed_decision, customer_identity_policy, default_currency, entity_type,
 * financial_year_end_day, financial_year_end_month, mpers_eligibility, msic, reporting_framework,
 * sst_regime, trade_nature, turnover_band. `clara.knowledge_records.knowledge_key` carries a
 * foreign key onto that catalogue, so no recorded record can state a depreciation policy until a
 * key is catalogued — a migration this ticket does not own. The ground is built and ranked here so
 * that cataloguing the key, and mapping its value onto this shape, is the whole of the later
 * change.
 *
 * `assetAccount` NULL means the record is about the client as a whole; a record naming THIS
 * account governs it, because the narrower statement is the one its author meant for these assets.
 */
export type FaProposalKnowledgeNote = {
  /** `clara.knowledge_records.id`, as the retrieval block printed it — so a reason can cite it. */
  recordId: string | null;
  assetAccount: string | null;
  /** What to call the record in one line of prose. */
  label: string;
  method: FaMethod | string | null;
  usefulLifeMonths: number | null;
  rateBps: number | null;
};

/** THIS account's own default depreciation policy, RETIRED (#932's `fa_account_depreciation_policies`
 *  with `active = false`). The live one never reaches here: a covered acquisition is born complete
 *  and no question opens at all. */
export type FaProposalRetiredPolicy = {
  assetAccount: string | null;
  version: number | null;
  method: FaMethod | string | null;
  usefulLifeMonths: number | null;
  rateBps: number | null;
};

export type FaProposalInputs = {
  asset: FaProposalAsset;
  siblings?: readonly FaProposalSibling[];
  retiredPolicy?: FaProposalRetiredPolicy | null;
  knowledge?: readonly FaProposalKnowledgeNote[];
};

/** The typed block a question carries, and the exact object the web reader parses. */
export type FaParticularsProposal = {
  v: 1;
  method: FaMethod | null;
  useful_life_months: number | null;
  rate_bps: number | null;
  residual_cents: number | null;
  start_date: string | null;
  description: string | null;
  basis: FaProposalBasis[];
  reason: string;
};

/** A candidate driver set, and nothing about where it came from. */
type Grounded = { method: FaMethod; usefulLifeMonths: number | null; rateBps: number | null } | null;

/** Is this driver set one `clara._fa_validate_particulars` admits? A ground whose shape the door
 *  would refuse is dropped, never repaired: repairing it would invent the missing half. */
function congruent(method: unknown, life: number | null, rate: number | null): Grounded {
  if (typeof method !== "string" || !(FA_METHODS as readonly string[]).includes(method)) return null;
  const m = method as FaMethod;
  if (m === "none") {
    return life === null && rate === null ? { method: m, usefulLifeMonths: null, rateBps: null } : null;
  }
  if (life === null || !Number.isInteger(life) || life <= 0) return null;
  if (m === "straight_line") return rate === null ? { method: m, usefulLifeMonths: life, rateBps: null } : null;
  if (rate === null || !Number.isInteger(rate) || rate < 1 || rate > 10000) return null;
  return { method: m, usefulLifeMonths: life, rateBps: rate };
}

/** Does this ground speak for this row? ONE RULE FOR ALL THREE GROUNDS: the ground's own account
 *  must BE this row's account. `asset_account_code` is nullable, so "no account" is an account
 *  like any other here — a ground about account 1500 does not speak for a row that has none, and
 *  a client-wide ground does not speak for a row that has one. */
function speaksFor(asset: FaProposalAsset, groundAccount: string | null): boolean {
  return groundAccount === asset.assetAccount;
}

/** The ONE driver set a collection of grounds agrees on, or null where it does not. Picking a side
 *  would be Clara choosing between two humans' judgements — the header's rule, applied by the
 *  sibling ground and, since the same defect was found in it, by the knowledge ground too. */
function agreedOn(seen: readonly NonNullable<Grounded>[]): Grounded {
  if (seen.length === 0) return null;
  const first = seen[0]!;
  for (const g of seen) {
    if (g.method !== first.method || g.usefulLifeMonths !== first.usefulLifeMonths || g.rateBps !== first.rateBps) {
      return null;
    }
  }
  return first;
}

/** The account's other completed assets, WHERE THEY AGREE. A split account grounds nothing. */
function fromSiblings(asset: FaProposalAsset, siblings: readonly FaProposalSibling[]): Grounded {
  const seen: NonNullable<Grounded>[] = [];
  for (const s of siblings) {
    if (s.particularsComplete !== true) continue;
    if (!speaksFor(asset, s.assetAccount)) continue;
    const g = congruent(s.method, s.usefulLifeMonths, s.rateBps);
    if (g === null) continue;
    seen.push(g);
  }
  return agreedOn(seen);
}

/** A calendar date in the prose a person reads, from the ISO one the register holds. `Intl` is
 *  avoided on purpose: this string is built inside a workflow closure the Workflow DevKit compiles
 *  into a VM script, and the twelve month names are cheaper than a locale table. */
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * THE ONE INPUT SHAPE THIS MODULE REFUSES RATHER THAN TOLERATES, and the reason it is a throw.
 *
 * Everything else here degrades: a ground it cannot use is dropped, a method it cannot derive is
 * left null. A MIS-SHAPED DATE CANNOT DEGRADE. Accepting a `Date` would put either a value the wire
 * schema drops (losing the whole proposal, silently) or a calendar day one earlier than the
 * acquisition's own posting date onto a form a person signs. Neither is something to be tolerant
 * about, and the caller that produced it has a one-word fix (`::text`), so it is named.
 */
function calendarDay(value: string | null): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !CALENDAR_DAY.test(value)) {
    throw new TypeError(
      "fa-particulars-proposal: acquiredDate must be a YYYY-MM-DD calendar string or null, got "
        + `${Object.prototype.toString.call(value)} ${JSON.stringify(String(value))} — read the `
        + "column as `fa.acquired_date::text`, because node-postgres maps a `date` onto a JS Date "
        + "at local midnight and its UTC spelling is the previous calendar day",
    );
  }
  return value;
}

function prettyDate(iso: string | null): string | null {
  if (iso === null || !CALENDAR_DAY.test(iso)) return iso;
  const [y, m, d] = iso.split("-");
  const name = MONTHS[Number(m) - 1];
  if (name === undefined) return iso;
  return `${Number(d)} ${name} ${y}`;
}

/** How a grounded driver set reads in words. */
function driversText(g: NonNullable<Grounded>): string {
  if (g.method === "none") return "not depreciated";
  if (g.method === "straight_line") return `straight line over ${g.usefulLifeMonths} months`;
  return `reducing balance at ${g.rateBps} basis points a year, over ${g.usefulLifeMonths} months`;
}

/**
 * THE ONE LINE A PERSON READS BESIDE THE FORM, and the reason it is prose rather than a token: a
 * proposal nobody can check is a proposal nobody should confirm, and "where did this come from" is
 * the first thing an accountant asks. It names the ground, the account, and the two facts; where
 * nothing grounded a method it SAYS so, because a silence there reads as a recommendation.
 */
/** The longest prose this module will put on a durable wire, and the longest it lets either of its
 *  two free-text inputs contribute. These are THIS MODULE's bounds on ITS OWN sentence — not the
 *  particulars door's, which has none — and they exist because a question is durable and a reason
 *  nobody can read is worse than a shorter one. A producer that can break its own bound does not
 *  have one, so both caps are applied before the sentence is built and the result is clamped. */
const REASON_MAX = 400;
const ACCOUNT_LABEL_MAX = 40;
const NOTE_LABEL_MAX = 100;

/** Trim to `max` on a word boundary where there is one, with an ellipsis, so a clipped label still
 *  reads as a clipped label rather than as a different one. */
function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max - 1);
  const space = head.lastIndexOf(" ");
  return `${(space > max * 0.6 ? head.slice(0, space) : head).trimEnd()}…`;
}

function reasonFor(
  asset: FaProposalAsset,
  grounded: Grounded,
  ground: FaProposalBasis | null,
  note: FaProposalKnowledgeNote | null,
  retiredVersion: number | null,
): string {
  return clip(reasonLine(asset, grounded, ground, note, retiredVersion), REASON_MAX);
}

function reasonLine(
  asset: FaProposalAsset,
  grounded: Grounded,
  ground: FaProposalBasis | null,
  note: FaProposalKnowledgeNote | null,
  retiredVersion: number | null,
): string {
  const account = asset.assetAccount === null
    ? "this asset account"
    : clip(asset.assetAccount, ACCOUNT_LABEL_MAX);
  const date = prettyDate(asset.acquiredDate);
  const tail = date === null
    ? "I propose a nil residual, which is this firm's default."
    : `I propose ${date} — the acquisition's own posting date — as the in-service date, and a nil residual, which is this firm's default.`;
  if (grounded === null) {
    return `Nothing on record grounds a depreciation method for ${account}: it carries no policy, `
      + `no completed asset of its own and no recorded note, so I am not proposing one. ${tail}`;
  }
  const drivers = driversText(grounded);
  if (ground === "enrolment") {
    return `${account} is enrolled with no accumulated-depreciation account, so the register admits `
      + `“not depreciated” and nothing else. ${tail}`;
  }
  if (ground === "client_knowledge") {
    const label = note?.label?.trim();
    return `This client's record states ${label && label !== "" ? `“${clip(label, NOTE_LABEL_MAX)}”` : "a depreciation policy"} `
      + `for ${account}, so I propose ${drivers}. ${tail}`;
  }
  if (ground === "retired_account_policy") {
    const v = retiredVersion === null ? "" : ` (version ${retiredVersion})`;
    return `${account} has no live default policy, but the one a person of this firm signed for it`
      + `${v} and later retired said ${drivers}, so that is what I propose. ${tail}`;
  }
  // NAMES THE DRIVERS IT READ, not "the same": the proposal's residual is the firm's default rather
  // than whatever those assets carry, and a sentence that said "the same" would be claiming a
  // driver set this module never reads.
  return `Every other completed asset on ${account} is depreciated ${drivers}, so I propose those drivers. ${tail}`;
}

/**
 * WHAT CLARA PROPOSES FOR ONE PENDING REGISTER ROW, or `null` when she proposes nothing at all.
 *
 * `null` means exactly one thing: THERE IS NOTHING TO ASK ABOUT. #932's policy path already
 * birthed this row complete, so no question opens and a proposal would be a proposal about a
 * settled fact.
 */
export function deriveFaParticularsProposal(inputs: FaProposalInputs): FaParticularsProposal | null {
  const asset = inputs.asset;
  if (asset.particularsComplete === true) return null;
  // The one input whose shape is checked rather than tolerated — see `calendarDay`.
  const acquiredDate = calendarDay(asset.acquiredDate);

  const basis: FaProposalBasis[] = [];
  let grounded: Grounded = null;
  let methodGround: FaProposalBasis | null = null;
  if (asset.nonDepreciable === true) {
    // THE ENROLMENT OUTRANKS EVERY OTHER GROUND, and it is not an estimate: the door admits `none`
    // alone here, so any other method would be a proposal of a refusal.
    grounded = { method: "none", usefulLifeMonths: null, rateBps: null };
    basis.push("enrolment");
    methodGround = "enrolment";
  }
  let knowledgeNote: FaProposalKnowledgeNote | null = null;
  if (grounded === null) {
    // TWO TIERS, AND THE NARROWER ONE GOVERNS OUTRIGHT: a record naming THIS account is the one
    // its author meant for these assets, so a client-wide record is not its rival and is not
    // consulted at all once a scoped one exists. WITHIN the governing tier the records are peers,
    // and peers that disagree ground nothing — the same rule a split account already had. Taking
    // the first admissible record, as an earlier cut did, resolved two people's judgements by
    // array order; falling back to the wide tier when the narrow one splits would choose a side by
    // another route.
    const scoped: { note: FaProposalKnowledgeNote; g: NonNullable<Grounded> }[] = [];
    const wide: { note: FaProposalKnowledgeNote; g: NonNullable<Grounded> }[] = [];
    for (const note of inputs.knowledge ?? []) {
      const isScoped = speaksFor(asset, note.assetAccount);
      // A client-wide record (`assetAccount: null`) speaks for a row on an account; for a row on
      // NO account it is the same statement as the scoped one, and `speaksFor` already took it.
      const isWide = note.assetAccount === null && !isScoped;
      if (!isScoped && !isWide) continue;
      const g = congruent(note.method, note.usefulLifeMonths, note.rateBps);
      if (g === null) continue;
      (isScoped ? scoped : wide).push({ note, g });
    }
    const tier = scoped.length > 0 ? scoped : wide;
    grounded = agreedOn(tier.map((x) => x.g));
    if (grounded !== null) {
      knowledgeNote = tier[0]!.note;
      basis.push("client_knowledge");
      methodGround = "client_knowledge";
    }
  }
  if (grounded === null) {
    const retired = inputs.retiredPolicy ?? null;
    if (retired !== null && speaksFor(asset, retired.assetAccount)) {
      grounded = congruent(retired.method, retired.usefulLifeMonths, retired.rateBps);
      if (grounded !== null) { basis.push("retired_account_policy"); methodGround = "retired_account_policy"; }
    }
  }
  if (grounded === null) {
    grounded = fromSiblings(asset, inputs.siblings ?? []);
    if (grounded !== null) { basis.push("account_siblings"); methodGround = "account_siblings"; }
  }

  // THE TWO FACTS THAT ARE NOT ESTIMATES, always proposed and always named as grounds of their
  // own: the in-service date is the acquisition's own posting date and the residual is nil, both
  // the owner's 2026-09-18 decisions on #932 applied to the same question.
  if (acquiredDate !== null) basis.push("acquisition_date");
  basis.push("firm_default_residual");

  return {
    v: 1,
    method: grounded?.method ?? null,
    useful_life_months: grounded?.usefulLifeMonths ?? null,
    rate_bps: grounded?.rateBps ?? null,
    residual_cents: 0,
    start_date: acquiredDate,
    description: asset.description.trim() === "" ? null : asset.description.trim(),
    basis,
    reason: reasonFor(asset, grounded, methodGround, knowledgeNote, inputs.retiredPolicy?.version ?? null),
  };
}

/**
 * THE WIRE SCHEMA — what a reader on any surface may assume about the block, stated once.
 *
 * It exists so the SUCCESSOR can refuse to put a malformed block on a wire nobody can take back:
 * a question is durable, a person reads it hours later, and a proposal whose residual was negative
 * would be a proposal the particulars door refuses at the moment of confirmation.
 *
 * WHICH BOUNDS ARE WHOSE, STATED HONESTLY — an earlier cut of this header claimed every one was
 * the door's, and two were not (adversarial ADV-L05-02, 2026-09-24). The method enum, the positive
 * useful life, the 1..10000 basis points, the non-negative residual and the calendar-day start are
 * `clara._fa_validate_particulars`'s own (0041:2977-3033). `description` carries NO bound, because
 * the door carries none either: the validator imposes no length and `clara.fixed_assets.description`
 * is `text` with no length CHECK. It must not be bounded here, because the web pre-fills this exact
 * value straight back into the door — a wire bound would either delete a real asset's proposal or,
 * worse, quietly shorten a person's own description at the moment they confirm it. `reason` is the
 * ONE bound that IS this module's own: it is this module's prose, not a person's data, `reasonFor`
 * guarantees it by construction, and `p933.wire.reason_ceiling` drives that guarantee.
 *
 * `v` IS THE READER'S ESCAPE. A surface that meets a block it does not understand renders no
 * proposal and the ordinary empty form, which is exactly today's behaviour; it never guesses.
 */
export const faParticularsProposalSchema = z
  .object({
    v: z.literal(1),
    method: z.enum(FA_METHODS).nullable(),
    useful_life_months: z.number().int().positive().nullable(),
    rate_bps: z.number().int().min(1).max(10000).nullable(),
    residual_cents: z.number().int().min(0).nullable(),
    start_date: z.string().regex(CALENDAR_DAY).nullable(),
    description: z.string().trim().min(1).nullable(),
    basis: z.array(z.enum(FA_PROPOSAL_BASES)),
    reason: z.string().max(REASON_MAX),
  })
  .strict();

/**
 * THE `source_ref` A #933 QUESTION CARRIES — #639's `{kind:'fixed_asset', asset_id}` stanza
 * EXTENDED with the proposal, never replaced.
 *
 * NO MIGRATION IS NEEDED FOR THIS AND THAT IS MEASURED, NOT ASSUMED. `clara.agent_interruptions`
 * constrains `source_ref` to "null or a jsonb object" and nothing else (0180:183), and
 * `clara.open_work_question` validates the FIELDS but passes `p_source_ref` through
 * (0180:579-589). The db battery `fa-particulars-proposal.test.mjs` drives exactly that on a live
 * database rather than reading it off the file.
 *
 * A NULL PROPOSAL IS ABSENT FROM THE WIRE, never `proposal: null`: the two would have to mean the
 * same thing to every reader, and one of them is a key somebody will eventually interpret.
 */
export function proposalSourceRef(
  assetId: string,
  proposal: FaParticularsProposal | null,
): { kind: "fixed_asset"; asset_id: string; proposal?: FaParticularsProposal } {
  const ref: { kind: "fixed_asset"; asset_id: string; proposal?: FaParticularsProposal } = {
    kind: "fixed_asset",
    asset_id: assetId,
  };
  if (proposal !== null) ref.proposal = proposal;
  return ref;
}

// =========================================================================================
// #1090 — THE `client_knowledge` GROUND, FED. Migration 0345 catalogues the `depreciation_policy`
// knowledge key `deriveFaParticularsProposal` already ranks and tests; this is the ONE mapping
// its brief still owes: `clara.knowledge_records` rows for that key -> `FaProposalKnowledgeNote[]`.
//
// THE READ ITSELF IS NOT HERE, on purpose, for the SAME reason the header above gives for the rest
// of this file: "the reads that gather its facts are the successor workflow's own step". That
// step (`loadFaProposalInputsStepV6` or its successor) does not exist in this repository —
// `packages/runtime/workflows/claraWork.v6.impl.ts` is absent — and lives inside a frozen-workflow
// closure this ticket must never create or edit. The exact SQL that produces the rows this mapper
// consumes is stated in this ticket's report (successor contract) rather than executed here:
//
//   select id, applies_when, value from clara.knowledge_records
//    where client_id = $1::uuid and knowledge_key = 'depreciation_policy' and state = 'live'
//
// run under the SAME OBO read credential v4's own register read mints (`clara_agent_ro`, RLS
// `p_knowledge_records_agent`, `firm_id = clara.wake_firm()` — 0192:611-612, unmodified), with the
// client additionally pinned in the WHERE clause exactly as v4 pins the asset's own client.
//
// SCOPING: a client-wide note is captured with `applies_when = {}` (`assetAccount: null` here); an
// account-scoped note is captured with `applies_when = {"asset_account_code": "<code>"}` — the
// convention migration 0345's own catalog description states. `speaksFor` (above) already treats
// `assetAccount: null` as an account like any other, so this mapper does no ranking of its own.
//
// TOLERANT BY CONSTRUCTION, never thrown on: the catalog validates `depreciation_policy` no more
// strictly than "an object" (`shape_only`), so a captured `value` missing a field, carrying the
// wrong type, or naming a method `congruent()` does not recognise is not this mapper's business to
// refuse — `congruent()` already drops a driver set it cannot use, the same rule an incongruent
// SIBLING already lives by (see `fromSiblings` above). A field this mapper cannot read maps to
// `null` (or, for `label`, the empty string) rather than raising, so one malformed knowledge row
// among several cannot take a well-formed one down with it.

/** One `clara.knowledge_records` row for the `depreciation_policy` key, exactly as the SQL above
 *  returns it — the raw shape a future step hands this mapper, with no reshaping in between. */
export type DepreciationPolicyKnowledgeRow = {
  id: string;
  applies_when: unknown;
  value: unknown;
};

function asPlainObject(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** `clara.knowledge_records` rows for `depreciation_policy` -> `FaProposalKnowledgeNote[]`, in
 *  the SAME order the rows arrived (this module ranks and de-duplicates nothing — `deriveFa
 *  ParticularsProposal`'s own `agreedOn`/`speaksFor` already do, over every note it is handed). */
export function mapDepreciationKnowledgeRows(
  rows: readonly DepreciationPolicyKnowledgeRow[],
): FaProposalKnowledgeNote[] {
  const notes: FaProposalKnowledgeNote[] = [];
  for (const row of rows) {
    const value = asPlainObject(row.value);
    if (value === null) continue; // shape_only still means "an object": anything else grounds nothing.
    const appliesWhen = asPlainObject(row.applies_when) ?? {};
    const rawAccount = appliesWhen.asset_account_code;
    const rawLabel = value.label;
    notes.push({
      recordId: typeof row.id === "string" ? row.id : null,
      assetAccount: typeof rawAccount === "string" && rawAccount !== "" ? rawAccount : null,
      label: typeof rawLabel === "string" ? rawLabel : "",
      method: typeof value.method === "string" ? (value.method as FaMethod | string) : null,
      usefulLifeMonths: typeof value.useful_life_months === "number" ? value.useful_life_months : null,
      rateBps: typeof value.rate_bps === "number" ? value.rate_bps : null,
    });
  }
  return notes;
}
