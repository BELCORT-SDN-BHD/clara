// #648 (journey A5) — the shapes `clara.get_firm_setup()` emits and the four firm setup doors take.
//
// EVERY ONE OF THESE IS THE DATABASE'S OWN VOCABULARY, read back rather than invented here. The
// answer shapes, the option lists and the group keys all come from `clara.firm_setup_keys`
// (packages/db/migrations/0218_firm_setup.sql §A), which is a code-populated catalogue precisely so
// that "the facts a firm must state about itself" is data an owner can read and ratify instead of a
// literal buried in a function body — or, worse, in a TypeScript file the owner never opens.
//
// THERE IS NO SECOND READ. `clara.get_firm_setup()` is the one production-facing read for this
// journey; there is deliberately no `getRows` PostgREST path over `clara.onboarding_plan_items`
// beside it, because a battery that proves a door the browser never calls proves nothing.

/** The five answer shapes `clara.firm_setup_keys.answer_shape` admits. */
export type FirmSetupAnswerShape = "text" | "long_text" | "choice" | "month" | "labelled_object";

/** A plan item's state, plus the one state that belongs to the READ rather than to the plan:
 *  `unseeded` means the catalogue row exists and this firm's plan has no item for it yet, which is
 *  exactly what the reconciling seed fixes. It is a real state of this surface, never a null. */
export type FirmSetupItemState = "unseeded" | "pending" | "answered" | "resolved" | "deferred";

/** #891 — whether this item is asked of THIS firm at all, derived live from an earlier answer on
 *  the same plan (never stored): `applicable`, `inapplicable`, or `undetermined` while the item it
 *  depends on is itself unanswered. Ten of the twelve catalogue rows read `applicable` always;
 *  `mpers_eligibility` (entity_type) and `tin` (turnover) are the only two with a real predicate. */
export type FirmSetupApplicability = "applicable" | "inapplicable" | "undetermined";

export type FirmSetupPlanState = "open" | "committed" | "cancelled";

/** The catalogue row joined to this firm's plan item. */
export type FirmSetupItem = {
  item_key: string;
  /** `must_ask` / `capture` / `todo` / `education` — the interview segment's own classification. */
  kind: string;
  /** Which Card this fact belongs under. A bounded RELATED SET is exactly one group's pending items. */
  group_key: string;
  question: string;
  /** The catalogue's own note: why the row exists, what the interview asked verbatim, and every
   *  honest boundary (an unverified registration format, a conditional statutory screen). */
  note: string;
  required: boolean;
  min_role: string;
  answer_shape: FirmSetupAnswerShape;
  /** Non-empty for `choice`, and for a `labelled_object` whose value is itself bounded. Read out of
   *  `clara.knowledge_keys.allowed_values` at seed time, so this surface can never offer a value
   *  the capture door would refuse. */
  answer_options: string[];
  /** The ONE object key a `labelled_object` answer carries. Null for every other shape. */
  answer_field: string | null;
  sort_order: number;
  state: FirmSetupItemState;
  /** jsonb, of whatever shape `answer_shape` declares. A deferral carries `{deferred_reason}`. */
  answer: unknown;
  answered_by: string | null;
  answered_by_name: string | null;
  answered_at: string | null;
  /** Non-null for exactly the three firm-defaultable facts (D8). */
  knowledge_key: string | null;
  /** The knowledge record this item produced, once it has been answered. */
  knowledge_record_id: string | null;
  /** #891 — see `FirmSetupApplicability`. Absent on an older fixture reads as `undefined`, which
   *  `isHiddenByApplicability`/`isNowInapplicable` below both treat as "applicable". */
  applicability?: FirmSetupApplicability;
};

/** One confirmed firm profile fact: a `clara.knowledge_records` row in the SAME canonical register
 *  Settings and Knowledge read, plus the read's own authority verdict. */
export type FirmSetupFact = {
  record_id: string;
  revision_id: string;
  revision_n: number;
  scope_kind: "firm";
  knowledge_key: string;
  item_key: string;
  question: string;
  kind: string;
  value: unknown;
  applies_when: Record<string, unknown>;
  effective_from: string | null;
  effective_to: string | null;
  source_kind: string;
  trust: string;
  basis: string;
  asserted_by: string;
  asserted_by_name: string | null;
  recorded_via: string;
  recorded_at: string;
  state: "live" | "superseded" | "withdrawn";
  correctable: boolean;
  key_description: string | null;
  authority_bearing: boolean | null;
  /** Is the person who stated this still an active member of the firm? */
  asserted_by_active: boolean;
  /** …and at what rank, TODAY. */
  asserted_by_role: string | null;
  /** Would that CURRENT rank still carry the authority this key needs? The rule
   *  `clara.promote_plan_answers_to_knowledge` applies at 0192:1694-1703, applied to a read so a
   *  downgraded author is visible on the fact itself rather than only in an audit log. */
  authority_current: boolean;
  /** TRUE where this key is also one of the five carried legacy `clara.client_facts` keys, whose
   *  client rows a firm default NEVER shadows (0192 §D.8). The panel says so, because a register
   *  that showed a firm default without that sentence would look self-contradictory. */
  legacy_client_fact_key: boolean;
};

export type FirmSetupEnvelope = {
  /** Null only where the firm holds no firm-scope plan at all — a defect, since
   *  `clara._create_firm_core` opens one for every firm, and the surface says so honestly. */
  plan_id: string | null;
  /** The CAS token every write must carry. */
  revision_token: string | null;
  revision_n: number | null;
  state: FirmSetupPlanState | null;
  committed_at: string | null;
  /** TRUE once every catalogue row has a plan item. */
  seeded: boolean;
  catalogue_total: number;
  /** MEASURED, in the database, over the catalogue's own required set. Never a percentage, never a
   *  sum over facets that may overlap (#650 AC2), and never #636's cross-batch aggregate. */
  counter: { required_answered: number; required_total: number };
  items: FirmSetupItem[];
  required_outstanding: string[];
  confirmed_facts: FirmSetupFact[];
};

/** A typed draft: one item's in-progress value, plus the plan revision it was typed against. */
export type FirmSetupDraft = {
  value: string;
  /** The revision_token this text was typed against. Kept so a convergence can SAY the draft is
   *  older than the plan, rather than silently discarding it. */
  revision: string | null;
};

/** The item keys whose answer reaches the canonical knowledge register. Derived from the envelope,
 *  never hardcoded: D8's set is catalogue data and #654 may widen it. */
export function capturedItemKeys(env: FirmSetupEnvelope): string[] {
  return env.items.filter((i) => i.knowledge_key !== null).map((i) => i.item_key);
}

/** The groups, in catalogue order, each with its items in catalogue order. */
export function firmSetupGroups(env: FirmSetupEnvelope): { key: string; items: FirmSetupItem[] }[] {
  const order: string[] = [];
  const byGroup = new Map<string, FirmSetupItem[]>();
  for (const item of [...env.items].sort((a, b) => a.sort_order - b.sort_order)) {
    if (!byGroup.has(item.group_key)) {
      byGroup.set(item.group_key, []);
      order.push(item.group_key);
    }
    byGroup.get(item.group_key)?.push(item);
  }
  return order.map((key) => ({ key, items: byGroup.get(key) ?? [] }));
}

/**
 * #891 — an item this surface must never render a question or an answer form for, because nothing
 * has ever been recorded against it and its predicate says it either cannot yet be determined or
 * already reads NO. An item that WAS answered before it became inapplicable is never hidden — its
 * answer survives, and it renders through `isNowInapplicable` below instead (AC4).
 */
export function isHiddenByApplicability(item: FirmSetupItem): boolean {
  if (item.state !== "unseeded") return false;
  return item.applicability === "undetermined" || item.applicability === "inapplicable";
}

/** #891 — an item that DOES carry a plan item (seeded, possibly answered) but whose dependency now
 *  reads it inapplicable. Its own `state`/`answer` are untouched; only this reads differently. */
export function isNowInapplicable(item: FirmSetupItem): boolean {
  return item.state !== "unseeded" && item.applicability === "inapplicable";
}

/** An item still waiting for a decision. `unseeded` is not answerable until the seed has run. */
export function isPending(item: FirmSetupItem): boolean {
  return item.state === "pending";
}

/** An item that has been decided: answered, resolved, or deliberately skipped. */
export function isSettled(item: FirmSetupItem): boolean {
  return item.state === "answered" || item.state === "resolved" || item.state === "deferred";
}

/**
 * CAN THIS SURFACE STILL SEND AN ANSWER FOR THIS ITEM? — C48.5's "correction path", which is a
 * separate word from "persisted answers" and is not satisfied by either of the other two.
 *
 * `clara.answer_firm_setup_item` sets `state='answered'` from ANY non-committed state and replaces
 * `answer` wholesale (0218_firm_setup.sql:783-787), so the door corrects a recorded fact and
 * un-skips a deferred one by the same act — proven under real roles by `p648.answer.correct`. The
 * ONE case it refuses is a key that already carries a LIVE knowledge record: `capture_knowledge`
 * answers the second capture `knowledge_already_live` (0192:852), and the honest path for those is
 * `clara.correct_knowledge` on the facts panel, which this surface already renders. A withdrawn
 * record leaves `knowledge_record_id` null (the read joins `state = 'live'`), so a withdrawn fact
 * becomes answerable again here rather than dead-ending.
 */
export function isAnswerable(item: FirmSetupItem): boolean {
  if (item.state === "unseeded") return false;
  // #891 — an item this firm has answered before but that now reads inapplicable keeps its answer
  // on screen, with no form: correcting it belongs to whatever made it applicable again (answering
  // the dependency the other way), never to this item's own control.
  if (isNowInapplicable(item)) return false;
  if (item.state === "pending") return true;
  return item.knowledge_record_id === null;
}

/** An item whose correction belongs to the knowledge register rather than to this checklist. */
export function correctsOnRegister(item: FirmSetupItem): boolean {
  return isSettled(item) && item.knowledge_key !== null && item.knowledge_record_id !== null;
}

/**
 * The raw text a re-opened form should start from. A DEFERRAL prefills NOTHING: its `answer`
 * carries only the reason it was skipped, and offering that back as the answer would turn "we
 * could not find the certificate" into the firm's MIA number.
 */
export function answerDraftText(item: FirmSetupItem): string {
  if (item.state !== "answered" && item.state !== "resolved") return "";
  const value = item.answer;
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object" && item.answer_field) {
    const field = (value as Record<string, unknown>)[item.answer_field];
    if (typeof field === "string") return field;
    if (typeof field === "number" || typeof field === "boolean") return String(field);
  }
  return "";
}

/** What a written answer looks like for each shape. The DOOR validates this again — this function
 *  exists so the form can refuse locally, with the error beside the control, before a round trip. */
export function buildAnswer(item: FirmSetupItem, raw: string): unknown {
  const text = raw.trim();
  if (item.answer_shape === "month") return Number(text);
  if (item.answer_shape === "labelled_object" && item.answer_field) return { [item.answer_field]: text };
  return text;
}

/** The local half of the catalogue's grammar. Returns a constraint token (an i18n key suffix), or
 *  null when the value is admissible. Never a re-derivation of the DB's message text. */
export function validateAnswer(item: FirmSetupItem, raw: string): string | null {
  const text = raw.trim();
  if (text === "") return "required";
  if (item.answer_shape === "month") {
    if (!/^\d+$/.test(text)) return "month";
    const n = Number(text);
    if (!Number.isInteger(n) || n < 1 || n > 12) return "month";
    return null;
  }
  if (item.answer_options.length > 0 && !item.answer_options.includes(text)) return "choice";
  return null;
}

/** The value a settled item shows. A deferral shows its stated reason; everything else shows what
 *  was recorded, in the shape the catalogue declares — never `[object Object]`. */
export function answerText(item: FirmSetupItem): string | null {
  const value = item.answer;
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (item.state === "deferred" && typeof record.deferred_reason === "string") {
      return record.deferred_reason;
    }
    if (item.answer_field && typeof record[item.answer_field] === "string") {
      return record[item.answer_field] as string;
    }
    return Object.entries(record)
      .map(([k, v]) => `${k}: ${typeof v === "object" && v !== null ? JSON.stringify(v) : String(v)}`)
      .join(" · ");
  }
  return String(value);
}
