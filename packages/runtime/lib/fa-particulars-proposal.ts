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
//       retired_account_policy — THIS account's own default policy, retired. A person of the firm
//                                signed it for these very assets; that it was later retired makes
//                                it history, not noise, and it is named as retired in the reason.
//       account_siblings       — the account's other COMPLETED assets, where they AGREE. A split
//                                account grounds nothing and says so: picking a side would be
//                                Clara choosing between two humans' judgements.
//   * THE TWO FACTS THAT ARE NOT ESTIMATES ARE ALWAYS PROPOSED. The in-service date is the
//     acquisition's own posting date (the owner's #932 decision, applied to the same question),
//     and the residual is nil (the owner's #932 default). Both are stated rather than inferred.
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
  /** The acquisition entry's posting date, ISO. The in-service date the owner's ruling names. */
  acquiredDate: string | null;
};

/** One of the account's other register rows. Only a COMPLETE one grounds anything. */
export type FaProposalSibling = {
  assetAccount: string | null;
  particularsComplete: boolean;
  method: FaMethod | string | null;
  usefulLifeMonths: number | null;
  rateBps: number | null;
  residualCents: number | null;
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
  residualCents: number | null;
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
  residualCents: number | null;
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

/** The account's other completed assets, WHERE THEY AGREE. A split account grounds nothing. */
function fromSiblings(asset: FaProposalAsset, siblings: readonly FaProposalSibling[]): Grounded {
  const seen: NonNullable<Grounded>[] = [];
  for (const s of siblings) {
    if (s.particularsComplete !== true) continue;
    if (asset.assetAccount !== null && s.assetAccount !== asset.assetAccount) continue;
    const g = congruent(s.method, s.usefulLifeMonths, s.rateBps);
    if (g === null) continue;
    seen.push(g);
  }
  if (seen.length === 0) return null;
  const first = seen[0]!;
  for (const g of seen) {
    if (g.method !== first.method || g.usefulLifeMonths !== first.usefulLifeMonths || g.rateBps !== first.rateBps) {
      return null;
    }
  }
  return first;
}

/** A calendar date in the prose a person reads, from the ISO one the register holds. `Intl` is
 *  avoided on purpose: this string is built inside a workflow closure the Workflow DevKit compiles
 *  into a VM script, and the twelve month names are cheaper than a locale table. */
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
function prettyDate(iso: string | null): string | null {
  if (iso === null || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
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
function reasonFor(
  asset: FaProposalAsset,
  grounded: Grounded,
  ground: FaProposalBasis | null,
  note: FaProposalKnowledgeNote | null,
  retiredVersion: number | null,
): string {
  const account = asset.assetAccount === null ? "this asset account" : asset.assetAccount;
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
    return `This client's record states ${label && label !== "" ? `“${label}”` : "a depreciation policy"} `
      + `for ${account}, so I propose ${drivers}. ${tail}`;
  }
  if (ground === "retired_account_policy") {
    const v = retiredVersion === null ? "" : ` (version ${retiredVersion})`;
    return `${account} has no live default policy, but the one a person of this firm signed for it`
      + `${v} and later retired said ${drivers}, so that is what I propose. ${tail}`;
  }
  return `Every other completed asset on ${account} is depreciated ${drivers}, so I propose the same. ${tail}`;
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
    // THE NARROWER RECORD GOVERNS: one naming this account beats one about the client as a whole,
    // because the narrower statement is the one its author meant for these assets.
    for (const note of inputs.knowledge ?? []) {
      const scoped = asset.assetAccount !== null && note.assetAccount === asset.assetAccount;
      const wide = note.assetAccount === null;
      if (!scoped && !wide) continue;
      const g = congruent(note.method, note.usefulLifeMonths, note.rateBps);
      if (g === null) continue;
      if (knowledgeNote === null || (scoped && knowledgeNote.assetAccount === null)) {
        knowledgeNote = note;
        grounded = g;
      }
    }
    if (grounded !== null) { basis.push("client_knowledge"); methodGround = "client_knowledge"; }
  }
  if (grounded === null) {
    const retired = inputs.retiredPolicy ?? null;
    if (retired !== null && (asset.assetAccount === null || retired.assetAccount === asset.assetAccount)) {
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
  if (asset.acquiredDate !== null) basis.push("acquisition_date");
  basis.push("firm_default_residual");

  return {
    v: 1,
    method: grounded?.method ?? null,
    useful_life_months: grounded?.usefulLifeMonths ?? null,
    rate_bps: grounded?.rateBps ?? null,
    residual_cents: 0,
    start_date: asset.acquiredDate,
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
 * would be a proposal the particulars door refuses at the moment of confirmation. Every bound here
 * is `clara._fa_validate_particulars`'s own (0041:2977-3033) — none is a rule of this module's.
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
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    description: z.string().trim().min(1).max(200).nullable(),
    basis: z.array(z.enum(FA_PROPOSAL_BASES)),
    reason: z.string().max(400),
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
