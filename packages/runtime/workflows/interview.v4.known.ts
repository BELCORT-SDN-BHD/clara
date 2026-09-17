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
import { questionOf, segmentApplies, type PlanItemInput, type SegmentV2 } from "./interview.v2.core.js";

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
 * THE CLIENT'S OWN RECORD GOVERNS ITS OWN INTERVIEW, AND THIS FOLD MAKES THAT TRUE RATHER THAN
 * ASSUMING IT. The precedence is worth stating because of what it decides: the winner under a key
 * is the value that SKIPS a question, so getting it from row order would be deciding a client's
 * accounting facts by a database's scan order.
 *
 * MEASURED, NOT ASSERTED. `clara.get_knowledge_pack` aggregates with
 * `coalesce(jsonb_agg(j order by knowledge_key), '[]')` (0192:1502) — by KEY alone, with no
 * tie-break — and then appends the legacy rows as a second, separate concatenation. Its firm arm
 * excludes a firm row only when a client row shares the same `applies_when_digest`
 * (0192:1509-1518), so a firm-wide rule and a narrower client exception under ONE key both reach
 * the pack, in an order nothing defines. That is not hypothetical here:
 * `clara.knowledge_key_firm_eligibility` admits `accounting_basis`, `default_currency` and
 * `reporting_framework`, and `default_currency` is `KNOWN_FACT_KEYS.currency` (the other two are
 * among the object-shaped folds this module deliberately excludes).
 *
 * SO THE RULE IS EXPLICIT: a `scope_kind:'client'` row under a key wins over a `'firm'` row under
 * the same key, whatever order they arrive in. Among rows of the SAME scope the first still wins —
 * two client records under one key is a conflict this lane does not resolve, and it simply does not
 * use the later one; the question it might have skipped is still governed by wall 1 (the
 * validator).
 */
export function knownFactsFromPack(pack: unknown): KnownFacts {
  const p = (pack ?? {}) as { status?: unknown; records?: unknown };
  if (p.status !== "ok" || !Array.isArray(p.records)) return Object.freeze({});
  const bySegment: Record<string, KnownFact> = {};
  for (const [segmentKey, knowledgeKey] of Object.entries(KNOWN_FACT_KEYS)) {
    let chosen: KnownFact | null = null;
    for (const raw of p.records) {
      const r = (raw ?? {}) as Record<string, unknown>;
      if (r.knowledge_key !== knowledgeKey) continue;
      if (r.value === undefined) continue;
      const fact: KnownFact = {
        segmentKey,
        knowledgeKey,
        value: r.value,
        recordId: str(r.record_id),
        knowledgeVersion: str(r.knowledge_version),
        trust: str(r.trust) || "unknown",
        sourceKind: str(r.source_kind) || "unknown",
        scopeKind: str(r.scope_kind) || "client",
      };
      if (chosen === null) chosen = fact;
      else if (chosen.scopeKind !== "client" && fact.scopeKind === "client") chosen = fact;
      // The first CLIENT row is final — nothing later can outrank it.
      if (chosen.scopeKind === "client") break;
    }
    if (chosen !== null) bySegment[segmentKey] = chosen;
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

/** One plan item as `readPlan` returns it — the two fields this fold reads, and nothing else, so a
 *  cell can drive it with a literal. */
export type AnsweredPlanItem = { itemKey: string; state: string; answer: unknown };

/**
 * #649 ITEM 3, THE PLAN HALF: `prior`, SEEDED FROM THE PLAN'S OWN ANSWERED ITEMS.
 *
 * The stanza seeds `prior` "from `clara.get_knowledge_pack` … PLUS the plan's own answered items".
 * The pack half is the rest of this module; this is the other half, and it closes a specific,
 * ordinary case: a firm that filled part of the onboarding plan from the dashboard and THEN started
 * the interview. `clara.begin_client_onboarding` (0017:2492) seeds no plan items at all, so a plan
 * born and interviewed in one go folds to `{}` here and a first run is byte-for-byte v4's.
 *
 * IT USES THE SEGMENT'S OWN VALIDATOR, exactly as wall 1 does for a knowledge record, and for the
 * same reason: what lands in `prior` must be a value this question could lawfully have been
 * answered with, normalised by the same code path a person's typing takes — never the raw jsonb the
 * plan happens to hold. A value the validator REFUSES seeds nothing, so the question is asked.
 *
 * IN SEGMENT ORDER, because the validators are cross-field: `fye_day` is judged against the `fye`
 * this same fold just accepted, and an item for a segment the accumulating `prior` says does not
 * apply is not seeded at all.
 *
 * A validator that THROWS on a shape no person could have typed is treated as a refusal. This fold
 * runs before the first question of a run and may not be the thing that ends it.
 */
export function priorFromPlanItems(
  segments: ReadonlyArray<SegmentV2>,
  items: ReadonlyArray<AnsweredPlanItem> | null | undefined,
): Record<string, unknown> {
  const answered = new Map<string, unknown>();
  for (const raw of items ?? []) {
    const it = (raw ?? {}) as AnsweredPlanItem;
    const key = typeof it.itemKey === "string" ? it.itemKey : "";
    if (key === "" || it.state !== "answered") continue;
    if (!answered.has(key)) answered.set(key, it.answer);
  }
  const prior: Record<string, unknown> = {};
  if (answered.size === 0) return prior;
  for (const seg of segments) {
    if (!answered.has(seg.key)) continue;
    if (!segmentApplies(seg, prior)) continue;
    try {
      const v = seg.validate(answered.get(seg.key), prior);
      if (v.ok === true) prior[seg.key] = v.value;
    } catch {
      // refused — the question is asked
    }
  }
  return prior;
}

/** The suffix a register-sourced provenance item carries. A NEW key, so nothing in
 *  `clara.commit_client_onboarding`'s vocabulary reads it and the ceremony's gate does not move —
 *  the same ground `fye_day` stands on. */
export const KNOWN_FACT_ITEM_SUFFIX = "__known_from_register";

/**
 * THE DURABLE STAMP ON A QUESTION NOBODY ANSWERED.
 *
 * `clara.update_onboarding_plan` requires an `answered_by` that is an active bookkeeper+ of the
 * firm and writes it onto every non-pending item (0017:2680-2681), so a segment the REGISTER
 * answered is stamped with the member who STARTED the run — a person who did not answer it. There
 * is no third state available: `item_kind` is CHECKed closed to `must_ask`/`capture`/`todo`, and a
 * null actor is refused.
 *
 * So the provenance goes beside the answer instead of inside it. The answer item keeps the value a
 * validator produced — `commit_client_onboarding` reads plan answers BY NAME, and wrapping one in
 * an envelope would have moved the ceremony's gate — and this companion `capture` item records
 * which knowledge record supplied it, under which scope, at which firm watermark. A person reading
 * the plan can tell "Clara read this off the register" from "somebody typed this", which is the
 * whole of the finding.
 */
export function knownProvenanceItem(fact: KnownFact): PlanItemInput {
  return {
    item_key: `${fact.segmentKey}${KNOWN_FACT_ITEM_SUFFIX}`,
    item_kind: "capture",
    question: null,
    answer: {
      knowledge_key: fact.knowledgeKey,
      knowledge_record_id: fact.recordId,
      knowledge_version: fact.knowledgeVersion,
      scope_kind: fact.scopeKind,
      trust: fact.trust,
      source_kind: fact.sourceKind,
    },
    state: "answered",
    required_for_commit: false,
  };
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
