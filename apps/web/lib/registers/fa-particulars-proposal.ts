// #933 — CLARA'S PROPOSED DEPRECIATION PARTICULARS, AS THE BROWSER READS THEM.
//
// WHERE THE PROPOSAL COMES FROM. When an acquisition posts to an enrolled asset account that has
// NO default depreciation policy (#932's path), the #639 dependent particulars question still
// parks the Work — and, from `claraWork_v6` onward, it carries Clara's proposal: method, life or
// rate, residual and start date, with the ONE LINE she derived them from. The block rides inside
// the question's own `source_ref`, beside #639's `{kind:'fixed_asset', asset_id}` stanza, because
// `clara.agent_interruptions.source_ref` is constrained to "null or an object" and nothing more
// (0180:183). `packages/db/tests/fa-particulars-proposal.test.mjs` drives that on a live database.
//
// THIS IS A SECOND IMPLEMENTATION OF ONE CONTRACT, AND THAT IS STATED RATHER THAN HIDDEN.
// `apps/web` has no dependency on `@clara/runtime` — no workspace import, no `transpilePackages`
// entry — so the derivation in `packages/runtime/lib/fa-particulars-proposal.ts` cannot be
// imported here, and this module is its READER, written from the same contract. The two are kept
// in step the way `lib/work/question-fields.ts` keeps its own pair in step: one written grammar,
// one live database battery that drives it, and a divergence that shows up as a proposal a
// surface refuses to render rather than as a wrong value silently pre-filled.
//
// THE READER IS TOLERANT, AND THAT IS THE WHOLE POSTURE. A question is durable; a person opens it
// hours or days later, possibly against a build that is not the one that wrote it. So an absent
// block, a block at a version this build does not know, and a block whose values are not the
// shapes the particulars door admits ALL read as "no proposal" — which degrades exactly to today's
// empty form. It never crashes, and it never repairs a value into a plausible wrong one.
//
// NOTHING HERE IS AN AUTHORITY. The proposal is a suggestion; the person confirms or edits, and
// `clara.complete_fixed_asset_particulars[_for]` is what decides whether the confirmed values are
// acceptable. This module pre-fills a form and renders a sentence, and that is all it does.

import { getRows } from "../read";
import type { SessionTokenAccessor } from "@/lib/session";

/** The three methods `clara.fixed_assets.depreciation_method` admits (0041's CHECK). */
const METHODS = ["straight_line", "reducing_balance", "none"] as const;
export type FaProposalMethod = (typeof METHODS)[number];

/**
 * THE BLOCK, TRANSCRIBED FROM THE WIRE CONTRACT FIELD FOR FIELD.
 *
 * `basis` and `reason` are the derivation's own account of itself: `basis` is the ordered list of
 * grounds it stood on and `reason` is the one line a person reads. A surface renders the reason;
 * `basis` is kept because a reader who wants to know WHICH ground produced a value should not have
 * to parse prose for it.
 */
export type FaParticularsProposal = {
  method: FaProposalMethod | null;
  useful_life_months: number | null;
  rate_bps: number | null;
  residual_cents: number | null;
  start_date: string | null;
  description: string | null;
  basis: string[];
  reason: string;
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

/** An integer within bounds, or null. A value outside them is DROPPED, never clamped: clamping
 *  would pre-fill a number nobody proposed. */
function intIn(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  return value >= min && value <= max ? value : null;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t === "" || t.length > max ? null : t;
}

/**
 * The proposal a question carries, or `null` when it carries none this build understands.
 *
 * `v` IS THE ESCAPE. A block at an unknown version is not read at all — a later cut may change
 * what a field MEANS, and a reader that guessed would pre-fill a form under a person's name with
 * a value from a contract it does not know.
 */
export function readFaParticularsProposal(
  sourceRef: Record<string, unknown> | null | undefined,
): FaParticularsProposal | null {
  if (!isObject(sourceRef)) return null;
  const raw = sourceRef.proposal;
  if (!isObject(raw)) return null;
  if (raw.v !== 1) return null;
  const method = typeof raw.method === "string" && (METHODS as readonly string[]).includes(raw.method)
    ? (raw.method as FaProposalMethod)
    : null;
  const startDate = typeof raw.start_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.start_date)
    ? raw.start_date
    : null;
  return {
    method,
    useful_life_months: intIn(raw.useful_life_months, 1, Number.MAX_SAFE_INTEGER),
    rate_bps: intIn(raw.rate_bps, 1, 10000),
    residual_cents: intIn(raw.residual_cents, 0, Number.MAX_SAFE_INTEGER),
    start_date: startDate,
    description: text(raw.description, 200),
    basis: Array.isArray(raw.basis) ? raw.basis.filter((b): b is string => typeof b === "string") : [],
    reason: text(raw.reason, 400) ?? "",
  };
}

/**
 * A PENDING work question, as the register's own entrances need to see it.
 *
 * `clara.agent_interruptions` is granted to `clara_authenticated` column by column, and its human
 * policy is `firm_id = clara.jwt_firm()` — a plain, forced-RLS table read, the same Q3
 * read-the-tables mechanism `lib/journals/governance-doors.ts` already uses on this very relation.
 * `packages/db/tests/fa-particulars-proposal.test.mjs` drives both the grant and the wall.
 */
type PendingQuestionRow = { id: string; source_ref: Record<string, unknown> | null };

/** How many of a client's pending questions are read before the asset's own is looked for. A
 *  client parks at most a handful at a time (`clara.open_work_question` admits ONE pending
 *  question per Work), and a bound is what keeps a surface's convenience read from becoming a
 *  page-sized one. */
const PENDING_QUESTION_SCAN = 50;

/**
 * CLARA'S PROPOSAL FOR ONE ASSET, for a surface that holds an asset id and no question id.
 *
 * THE TWO REGISTER-SIDE ENTRANCES ARE WHY THIS EXISTS. The conversation form is handed the whole
 * question record and reads the block straight off it. The asset page dialog and the Needs-you
 * inline form are not: `clara.list_review_queue`'s `fixed_asset_incomplete` row carries `asset_id`
 * and no question id at all (`lib/firm/needs-you.ts`), and the register's own read says nothing
 * about Work. So the parked question is found by its `source_ref`, under the caller's own
 * firm-scoped policy.
 *
 * IT NEVER THROWS, AND THAT IS THE POINT. A proposal is a convenience laid over a form that works
 * without it. A read that fails, a client with nothing parked and a question carrying no block all
 * answer the same way — `null` — and the entrance renders the ordinary empty form, which is
 * exactly today's behaviour.
 */
export async function loadAssetParticularsProposal(
  session: SessionTokenAccessor,
  { clientId, assetId }: { clientId: string; assetId: string },
): Promise<FaParticularsProposal | null> {
  try {
    const rows = await getRows<PendingQuestionRow>("agent_interruptions", {
      select: "id,source_ref",
      filters: { status: "eq.pending", client_id: `eq.${clientId}` },
      order: "created_at.desc",
      limit: PENDING_QUESTION_SCAN,
      session,
    });
    // `Array.isArray` IS LOAD-BEARING, not a habit. PostgREST answers a select with a list, and
    // "always" is exactly the assumption that takes a page down when it turns out not to be: an
    // error body, a proxy's own JSON, a 200 from something that is not PostgREST at all. A
    // pre-fill that threw would leave a person unable to complete particulars AT ALL, which is a
    // far worse outcome than not seeing a suggestion.
    if (!Array.isArray(rows)) return null;
    for (const row of rows) {
      const ref = row?.source_ref;
      if (!isObject(ref)) continue;
      if (ref.asset_id !== assetId) continue;
      const proposal = readFaParticularsProposal(ref);
      if (proposal !== null) return proposal;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * THE REGISTER'S OWN PRE-FILL — a `FaParticularsInput` seeded from the proposal.
 *
 * `base` IS THE FORM'S OWN STARTING VALUE (`EMPTY_PARTICULARS`, or a row's current particulars),
 * and it is a parameter rather than an import so this module stays free of the client component
 * that owns it. Only a field the proposal actually GROUNDS is written: a proposal that grounds no
 * method leaves the form's own starting method alone rather than blanking a control, and the
 * capital-allowance fields the proposal says nothing about are untouched.
 *
 * A NULL PROPOSAL RETURNS THE BASE UNCHANGED, which is today's empty form exactly.
 */
export function particularsFromProposal<T extends {
  method: FaProposalMethod;
  useful_life_months?: number | null;
  rate_bps?: number | null;
  residual_cents?: number | null;
  start_date: string;
  description?: string | null;
}>(proposal: FaParticularsProposal | null, base: T): T {
  if (proposal === null) return base;
  const next: T = { ...base };
  if (proposal.method !== null) {
    next.method = proposal.method;
    next.useful_life_months = proposal.useful_life_months;
    next.rate_bps = proposal.rate_bps;
  }
  if (proposal.residual_cents !== null) next.residual_cents = proposal.residual_cents;
  if (proposal.start_date !== null) next.start_date = proposal.start_date;
  if (proposal.description !== null) next.description = proposal.description;
  return next;
}

/** One declared field of a Work question — the shape `lib/work/questions.ts` publishes, restated
 *  structurally so this module does not drag the Work lane's imports into the register's. */
type DeclaredField = { key: string; kind: string };

/**
 * THE WORK QUESTION'S PRE-FILL — a draft seeded from the proposal, in the ANSWER DOOR's spelling.
 *
 * TWO GRAMMARS, AND THIS IS THE SECOND. `clara._assert_work_answer` (0180:444-486) judges an answer
 * against the DECLARED fields: a `text` field is a JSON string and nothing else, a `money` field an
 * integer JSON number and nothing else. The particulars question declares its two drivers as
 * `text` (`packages/runtime/lib/fixed-asset-acquisition.ts`'s own header says why: a `money`
 * control would run "60" through `parseAmountToCents` and send 6000 months), so a proposed life of
 * 60 is pre-filled as the STRING "60" while a proposed residual is pre-filled as the NUMBER 0.
 *
 * ONLY THE QUESTION'S OWN DECLARED FIELDS ARE FILLED. A key outside them is one the answer door
 * refuses, and pre-filling it would hand a person a form that cannot be submitted.
 *
 * AN UNGROUNDED VALUE IS ABSENT, never a blank string: a blank is something a person has to
 * notice and clear, and an optional field's blank is what `clara._assert_work_answer` treats as
 * absent anyway.
 */
export function proposalAnswerDraft(
  fields: readonly DeclaredField[],
  proposal: FaParticularsProposal | null,
): Record<string, string | number> {
  const draft: Record<string, string | number> = {};
  if (proposal === null) return draft;
  const value = (key: string): string | number | null => {
    switch (key) {
      case "method": return proposal.method;
      case "useful_life_months": return proposal.useful_life_months;
      case "rate_bps": return proposal.rate_bps;
      case "residual_cents": return proposal.residual_cents;
      case "start_date": return proposal.start_date;
      case "description": return proposal.description;
      default: return null;
    }
  };
  for (const field of fields) {
    const v = value(field.key);
    if (v === null) continue;
    draft[field.key] = field.kind === "money" ? v : String(v);
  }
  return draft;
}
