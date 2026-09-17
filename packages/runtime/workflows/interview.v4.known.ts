// @frozen
//
// FROZEN — part of the clientOnboarding_v5 closure. THE KNOWN-FACTS PRE-READ (#649's successor
// contract, item 3).
//
// WHY IT IS A SIBLING STEP MODULE AND NOT PART OF THE QUESTION INVENTORY. It reads the DATABASE.
// `interview.v4.questions.ts` is a list of questions and their validators — pure, driveable without
// an engine, and unit-tested that way — and a list that could fail a door call would be a different
// kind of thing. The driver in `clientOnboarding.v5.ts` calls this ONCE, before the segment loop.
//
// WHAT IT IS FOR, IN ONE SENTENCE FROM THE TICKET: "an answered fact is an absent question, not an
// unanswered one". A firm that already recorded this client's entity type, turnover band, industry
// code, SST regime, default currency or year-end month should not be asked for it again by an
// interview that can read it — being asked a question the system has already been told the answer
// to is the specific insult #649 set out to remove.
//
// =============================================================================================
// THE THREE WALLS, BECAUSE THIS IS A LANE THAT SKIPS QUESTIONS AND THAT IS A DANGEROUS THING TO DO.
//
//   1. IT ONLY EVER SKIPS A QUESTION THE RECORD CAN ANSWER. A known fact is accepted ONLY when the
//      segment's OWN validator accepts it — the same function, with the same `prior`, that would
//      have judged a human's typing. So the value that lands in the plan is a value this question
//      could lawfully have been answered with, normalised by the same code path, and not a shape
//      the knowledge register happens to hold.
//
//   2. A RECORD THAT DISAGREES IS ASKED, NOT SKIPPED — "known, confirm", never only "known, skip".
//      When the validator refuses the recorded value, the segment is ASKED and the question CARRIES
//      the recorded value and its provenance, so the person is correcting a stated fact rather than
//      answering into a vacuum. That is the whole of the ticket's disagreement clause that this cut
//      could close; what it does NOT do is write back — correcting a knowledge record is
//      `capture_knowledge`'s act under a named human's authority, and a workflow step carries no
//      authenticated actor (the same wall `interview.v3.questions.ts` documents for the chart
//      apply). The residual is named in the cut's report.
//
//   3. IT TOUCHES ONLY KEYS WHOSE RECORDED VALUE IS THE ANSWER ITSELF. Six segments map onto six
//      registered knowledge keys whose `value_shape` is the answer a person types. The four
//      object-shaped folds — `reporting_framework`, `accounting_basis`, `mpers_eligibility`,
//      `coa_seed_decision` — are DELIBERATELY absent: each records the interview's own FOLD of an
//      answer (`{framework_code, framework_label, …}`, `{seed: …}`), not the answer, so replaying
//      one as an answer would feed a validator a value no person could have typed. `trade_nature`,
//      `banking_arrangement` and `customer_identity_policy` have no segment at all.
//
// AND THE READ NEVER DECIDES ANYTHING BY FAILING. `readKnowledgePack` answers `unavailable` rather
// than throwing or returning null, and an unavailable pack yields NO known facts — so every
// question is asked, exactly as v4 asks them today. A context read that could suppress a question
// by failing would be the worst possible shape for this feature.
// =============================================================================================

import { readKnowledgePack } from "../lib/knowledge.mjs";
import { questionOf, type SegmentV2 } from "./interview.v2.core.js";

type Pools = { withRuntime: <T>(fn: (c: { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }> }) => Promise<T>) => Promise<T> };

function pools(): Pools {
  const p = (globalThis as unknown as { __claraPools?: Pools }).__claraPools;
  if (!p) throw new Error("runtime pools not injected (globalThis.__claraPools) — the supervisor injects them at boot");
  return p;
}

/** The purpose this lane reads a pack FOR. `clara.get_knowledge_pack` records and echoes it, so a
 *  stated purpose is what makes a later "who read this, and for what" answerable. */
export const ONBOARDING_KNOWLEDGE_PURPOSE = "client_onboarding";

/**
 * SEGMENT KEY → REGISTERED KNOWLEDGE KEY, for the six where the recorded value IS the answer.
 *
 * Measured against `clara.knowledge_keys` on the merged 0001→0224 chain rather than transcribed
 * from a design: `entity_type` (enum ENTITY_TYPES_V2), `turnover_band` (enum TURNOVER_BANDS_V1),
 * `msic` (format only), `sst_regime` (enum SST_REGIMES_V1), `default_currency` (enum CURRENCIES_V1)
 * and `financial_year_end_month` (range 1–12) each carry exactly the value their segment's
 * validator normalises to. Two of the six have a segment key that differs from the knowledge key
 * (`turnover`→`turnover_band`, `currency`→`default_currency`), which is why this is a map and not a
 * assumption that the names agree.
 */
export const KNOWN_FACT_KEYS: Readonly<Record<string, string>> = Object.freeze({
  entity_type: "entity_type",
  turnover: "turnover_band",
  msic: "msic",
  sst_regime: "sst_regime",
  currency: "default_currency",
  fye: "financial_year_end_month",
});

/** ONE recorded fact, with the provenance a person needs to judge it. `recordId` addresses the
 *  record's own page; `knowledgeVersion` is the firm's watermark AFTER the capture, carried as TEXT
 *  because a bigint through a JS number can come back wrong. */
export type KnownFact = {
  segmentKey: string;
  knowledgeKey: string;
  value: unknown;
  recordId: string;
  knowledgeVersion: string;
  trust: string;
  sourceKind: string;
  scopeKind: string;
};

export type KnownFacts = Readonly<Record<string, KnownFact>>;

function str(v: unknown): string {
  return typeof v === "string" ? v : v === null || v === undefined ? "" : String(v);
}

/**
 * Fold a pack answer into the segment-keyed map. PURE, so the whole guard can be driven in a unit
 * cell without a database.
 *
 * FIRST ROW WINS PER KEY, and the pack's own order is what decides it: `clara.get_knowledge_pack`
 * returns the client's own records ahead of the firm's inherited ones, which is the precedence the
 * register itself renders. A second row under one key is a CONFLICT the interview does not resolve
 * — it simply does not use the later one, and the question it might have skipped is still governed
 * by wall 1 (the validator).
 */
export function knownFactsFromPack(pack: unknown): KnownFacts {
  const p = (pack ?? {}) as { status?: unknown; records?: unknown };
  if (p.status !== "ok" || !Array.isArray(p.records)) return Object.freeze({});
  const bySegment: Record<string, KnownFact> = {};
  for (const [segmentKey, knowledgeKey] of Object.entries(KNOWN_FACT_KEYS)) {
    for (const raw of p.records) {
      const r = (raw ?? {}) as Record<string, unknown>;
      if (r.knowledge_key !== knowledgeKey) continue;
      if (r.value === undefined) continue;
      bySegment[segmentKey] = {
        segmentKey,
        knowledgeKey,
        value: r.value,
        recordId: str(r.record_id),
        knowledgeVersion: str(r.knowledge_version),
        trust: str(r.trust) || "unknown",
        sourceKind: str(r.source_kind) || "unknown",
        scopeKind: str(r.scope_kind) || "client",
      };
      break;
    }
  }
  return Object.freeze(bySegment);
}

/** Read the client's governed knowledge and fold it. NEVER throws: an unreadable pack yields no
 *  known facts, so every question is asked. */
export async function loadKnownFactsStep(clientId: string, firmId: string): Promise<KnownFacts> {
  "use step";
  try {
    const pack = await pools().withRuntime((c) =>
      readKnowledgePack(c, { clientId, purpose: ONBOARDING_KNOWLEDGE_PURPOSE, firmId }));
    return knownFactsFromPack(pack);
  } catch {
    return Object.freeze({});
  }
}

/** The recorded fact for a segment, or null. A fact the interview has ALREADY recorded in this run
 *  (`prior`) wins over the register: the person is in front of the question now. */
export function knownFactFor(seg: SegmentV2, prior: Readonly<Record<string, unknown>>, known: KnownFacts): KnownFact | null {
  if (Object.prototype.hasOwnProperty.call(prior, seg.key)) return null;
  return known[seg.key] ?? null;
}

/** THE ANSWER A RECORDED FACT SUPPLIES, or null when it supplies none. Wall 1: the segment's own
 *  validator, with the same `prior`, is the only judge. */
export function knownAnswer(
  seg: SegmentV2,
  prior: Readonly<Record<string, unknown>>,
  known: KnownFacts,
): { fact: KnownFact; value: unknown; echo: string } | null {
  const fact = knownFactFor(seg, prior, known);
  if (fact === null) return null;
  const v = seg.validate(fact.value, prior);
  if (v.ok !== true) return null;
  return { fact, value: v.value, echo: v.echo };
}

/**
 * Should this segment still be ASKED, given what the register already holds?
 *
 * Beside `segmentApplies`, and the two answer different questions: `segmentApplies` asks whether
 * this question is RELEVANT to this client, `knownApplies` asks whether it has already been
 * ANSWERED somewhere the interview can read. Both must be true for a question to reach a person.
 */
export function knownApplies(seg: SegmentV2, prior: Readonly<Record<string, unknown>>, known: KnownFacts): boolean {
  return knownAnswer(seg, prior, known) === null;
}

/**
 * THE "KNOWN, CONFIRM" QUESTION — wall 2. Used when a recorded fact EXISTS for this segment but the
 * segment's own validator refuses it, so the question is asked with the record in front of the
 * person instead of as though nothing were on file.
 *
 * Returns the segment's ordinary question when there is nothing to show, so a caller can use it
 * unconditionally.
 */
export function knownQuestionFor(seg: SegmentV2, prior: Readonly<Record<string, unknown>>, known: KnownFacts): string {
  const fact = knownFactFor(seg, prior, known);
  const base = questionOf(seg, prior);
  if (fact === null) return base;
  if (seg.validate(fact.value, prior).ok === true) return base;
  let rendered: string;
  try {
    rendered = JSON.stringify(fact.value ?? null);
  } catch {
    rendered = "<unrenderable>";
  }
  const scope = fact.scopeKind === "firm" ? "a firm-wide rule" : "this client's record";
  return [
    `Clara has ${rendered} on file for this (${scope}, trust ${fact.trust}, source ${fact.sourceKind}),`,
    "and it is not an answer this question accepts. Please give the correct value — the recorded one",
    "stays as it is until somebody corrects it on the record's own page.",
    "",
    base,
  ].join("\n");
}

/**
 * A copy of a segment that asks a DIFFERENT question text, field by field.
 *
 * AN EXPLICIT COPY RATHER THAN A SPREAD, and that is measured rather than fussy:
 * `packages/runtime/scripts/check-parts-parity.mjs` refuses an object spread anywhere under
 * `packages/runtime/**` that it cannot classify, admitting one only through a sha-pinned tuple in a
 * shared exemptions registry. `interview.v2.core.ts:371` carries such a tuple for the identical
 * shape; a new file does not need one if it does not spread, and one less contended shared file is
 * worth one line of expressiveness.
 */
export function segmentAsking(seg: SegmentV2, question: string): SegmentV2 {
  const out: SegmentV2 = {
    key: seg.key,
    question,
    requiredForCommit: seg.requiredForCommit,
    skippable: seg.skippable,
    validate: seg.validate,
  };
  if (seg.appliesTo) out.appliesTo = seg.appliesTo;
  if (seg.followUps) out.followUps = seg.followUps;
  if (seg.onInsist) out.onInsist = seg.onInsist;
  if (seg.warn) out.warn = seg.warn;
  if (seg.toItems) out.toItems = seg.toItems;
  // `questionFor` is DELIBERATELY NOT CARRIED: the caller has already resolved it into `question`,
  // and carrying it would let the dynamic text override the resolved one at ask time.
  return out;
}

/** The activity echo a SKIPPED-BECAUSE-KNOWN segment streams, so the run's own transcript says
 *  where the answer came from. The plan item's shape is untouched — it is a DB contract for several
 *  keys and this lane does not widen it — so the stream is where the provenance lives. */
export function knownEcho(fact: KnownFact, echo: string): string {
  return `${echo} — taken from the client's recorded knowledge (record ${fact.recordId}, version ${fact.knowledgeVersion}, trust ${fact.trust})`;
}
