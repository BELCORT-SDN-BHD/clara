// #960 — `clara.set_firm_document_limits(p_docs_per_day, p_pages_per_day, p_ocr_concurrency,
// p_llm_witness_concurrency, p_op_key)`: the governed write behind the processing-capacity card
// (migration 0270). The FIRST human writer `clara.firm_document_limits` has ever had.
//
// THE OWNER'S RULING (2026-09-20, ticket #960) IS THE CONTRACT: the firm's OWN owner or admin
// sets all four caps, with no operator gate and no operator-side surface. The door takes no firm
// argument at all — it always acts on the caller's own firm — so nothing here has a firm id to
// pass or to get wrong.
//
// A CAP THE PERSON DID NOT TOUCH IS OMITTED, NOT SENT AS NULL OR AS ITS CURRENT VALUE. The
// relation's write contract is column-preserving (migration 0196): an omitted argument reaches
// the trigger as NULL and means "leave this cap alone". Re-sending the value this build last
// READ would turn every save into a four-cap write — and would silently re-assert a number
// another admin changed between the read and the save, which is exactly the clobber the
// preserving trigger exists to prevent.
//
// NOTHING IS RETRIED HERE, and no answer is painted as truth. `lib/doors.ts`'s own rule: a
// `DoorRefusal` is the database's considered answer, and the caller re-reads the commercial
// state afterwards rather than trusting this receipt (`FirmSettingsPanelView` does exactly that).
// The receipt is a REPORT — it is rendered as one, and the figures on the card keep coming from
// `clara.get_firm_commercial_state`.
//
// THE REFUSALS ARE CLASSIFIED BY CODE **AND** REASON, never by sentence. Migration 0270 raises
// CLR10 with `detail.reason` of `invalid_op_key`, `no_cap_named`, `invalid_cap`,
// `cap_above_ceiling` or `op_key_conflict`, CLR13 with `operation_in_flight`, and CLR04
// ("insufficient role" / "actor has no active membership") with NO detail at all — the code
// alone is the discriminant there, which is `clara._human_ctx`'s own shape.

import { callDoor, isDoorRefusal, type CallDoorOptions } from "@/lib/doors";

export const SET_FIRM_DOCUMENT_LIMITS_DOOR = "set_firm_document_limits";

/** The four caps, in the relation's own column order. The app's spelling is camelCase; the
 *  door's is the column name, and the mapping lives here and nowhere else. */
export const PROCESSING_CAPS = [
  "docsPerDay", "pagesPerDay", "ocrConcurrency", "llmWitnessConcurrency",
] as const;
export type ProcessingCap = (typeof PROCESSING_CAPS)[number];

const DOOR_ARG: Record<ProcessingCap, string> = {
  docsPerDay: "p_docs_per_day",
  pagesPerDay: "p_pages_per_day",
  ocrConcurrency: "p_ocr_concurrency",
  llmWitnessConcurrency: "p_llm_witness_concurrency",
};

const RECEIPT_KEY: Record<ProcessingCap, string> = {
  docsPerDay: "docs_per_day",
  pagesPerDay: "pages_per_day",
  ocrConcurrency: "ocr_concurrency",
  llmWitnessConcurrency: "llm_witness_concurrency",
};

/** Which caps this call is asking to move. A cap absent from this object is a cap the door is
 *  not told about, which the relation preserves. */
export type ProcessingCapEdits = Partial<Record<ProcessingCap, number>>;

/** The four caps as the receipt reports them AFTER the write. Never partial: 0270's receipt
 *  states every resulting cap, including the ones a first write landed from the relation's own
 *  first-insert values. */
export type ProcessingCapValues = Record<ProcessingCap, number>;

/** The four caps BEFORE the write. Every one is null on a firm that had no stored row at all —
 *  "no cap was stored" is a different fact from "the cap was zero". */
export type ProcessingCapPrevious = Record<ProcessingCap, number | null>;

export type SetProcessingCapsOutcome =
  | {
      readonly kind: "set";
      readonly caps: ProcessingCapValues;
      readonly previous: ProcessingCapPrevious;
      readonly changed: readonly ProcessingCap[];
      /** True when this call created the firm's row. */
      readonly created: boolean;
    }
  /** A governed refusal, carried VERBATIM — code and sentence untouched. The ceiling refusal's
   *  own sentence names the cap and the number, which is why it is never re-worded here. */
  | {
      readonly kind: "refused";
      readonly code: string;
      readonly reason: string | null;
      readonly message: string;
    }
  /** Transport, auth, or a response this build will not act on. */
  | { readonly kind: "unavailable" };

export type SetFirmDocumentLimitsParams = {
  readonly edits: ProcessingCapEdits;
  /** Minted and held by the CALLER (see `processingCapsOpKey`). */
  readonly opKey: string;
};

export type SetFirmDocumentLimits = (
  params: SetFirmDocumentLimitsParams,
  opts?: CallDoorOptions,
) => Promise<SetProcessingCapsOutcome>;

function readCaps(raw: unknown, key: Record<ProcessingCap, string>): ProcessingCapValues | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const out: Partial<ProcessingCapValues> = {};
  for (const cap of PROCESSING_CAPS) {
    const v = r[key[cap]];
    if (typeof v !== "number" || !Number.isInteger(v)) return null;
    out[cap] = v;
  }
  return out as ProcessingCapValues;
}

function readPrevious(raw: unknown): ProcessingCapPrevious | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const out: Partial<ProcessingCapPrevious> = {};
  for (const cap of PROCESSING_CAPS) {
    const v = r[RECEIPT_KEY[cap]];
    if (v !== null && (typeof v !== "number" || !Number.isInteger(v))) return null;
    out[cap] = v as number | null;
  }
  return out as ProcessingCapPrevious;
}

function readChanged(raw: unknown): readonly ProcessingCap[] | null {
  if (!Array.isArray(raw)) return null;
  const out: ProcessingCap[] = [];
  for (const entry of raw) {
    const cap = PROCESSING_CAPS.find((c) => RECEIPT_KEY[c] === entry);
    if (cap === undefined) return null;
    out.push(cap);
  }
  return out;
}

/** THE PRODUCTION IMPLEMENTATION. */
export const setFirmDocumentLimits: SetFirmDocumentLimits = async (params, opts) => {
  const args: Record<string, unknown> = {};
  for (const cap of PROCESSING_CAPS) {
    const asked = params.edits[cap];
    if (asked !== undefined) args[DOOR_ARG[cap]] = asked;
  }
  args.p_op_key = params.opKey;

  try {
    const out = await callDoor<Record<string, unknown>>(
      SET_FIRM_DOCUMENT_LIMITS_DOOR, args, opts ?? {});
    // POSITIVELY CHECKED, every field. A 200 that carries a half-readable receipt is not
    // evidence that a write happened, and this card must never report caps nobody stored.
    if (typeof out !== "object" || out === null) return { kind: "unavailable" };
    if (out.status !== "set") return { kind: "unavailable" };
    const caps = readCaps(out.caps, RECEIPT_KEY);
    const previous = readPrevious(out.previous);
    const changed = readChanged(out.changed);
    if (caps === null || previous === null || changed === null) return { kind: "unavailable" };
    if (typeof out.created !== "boolean") return { kind: "unavailable" };
    return { kind: "set", caps, previous, changed, created: out.created };
  } catch (err) {
    if (isDoorRefusal(err)) {
      return {
        kind: "refused",
        code: err.code ?? "CLR",
        reason: err.reason ?? null,
        message: err.message,
      };
    }
    return { kind: "unavailable" };
  }
};

/** THE OPERATION IDENTITY for one cap change, deterministic in exactly the way
 *  `clara._reserve_op` needs (0004: replay is keyed on `(firm, fn, op_key)` and the arguments are
 *  re-hashed, so a retry that carries a FRESH key re-enters the body instead of replaying the
 *  receipt the first call already earned).
 *
 *  NO DIGEST HERE, unlike `lib/operator/op-key.ts`'s builders, and the difference is the inputs:
 *  those bind FREE TEXT (a reason a person typed), which has to be hashed to become a key. This
 *  binds four optional integers and a uuid, all of which spell themselves unambiguously — so a
 *  collision between two different edits is not possible rather than merely unlikely, and there
 *  is no async crypto call on the path.
 *
 *  `callerId` is folded in because `_reserve_op` is scoped only by `(firm, fn, op_key)` — the
 *  actor lives inside the re-hashed arguments, never in the reservation's identity — so two
 *  admins making the SAME edit at once would otherwise collide on one key and the second would
 *  meet `op_key_conflict` instead of the honest answer a second writer should get. */
export function processingCapsOpKey(callerId: string, edits: ProcessingCapEdits): string {
  const spelled = PROCESSING_CAPS
    .map((cap) => (edits[cap] === undefined ? "x" : String(edits[cap])))
    .join("-");
  return `op-caps-${callerId}-${spelled}`;
}
