// #945 — READING A PAYROLL SUMMARY BACK, as a pure parse and a refusal map.
//
// WHY THIS ENTRY IS CLASS A AND NOT CLASS C. #946, #947, #948 and #949 were deferred because their
// doors are `clara_authenticated`-only and a tool over one could only ever answer a grant refusal.
// This one is different, and the difference is a MEASUREMENT rather than an argument:
// `clara.get_document_extract` is granted to `clara_agent_ro` as well as to `clara_authenticated`
// (asserted at `0054:467`, and re-measured on the lane database at this cut), so the machine lane
// can reach it through `readScoped`.
//
// THE STATE IS BANKED, NOT RECOMPUTED. The payroll reader writes `payroll_state` into the
// `payroll_text_facts` extraction's own envelope; every figure in it is either a rendering the page
// printed or a sum the database computed from quoted rows. Nothing here adds anything up, and
// nothing here applies a statutory rate.
//
// AND A FIGURE THE PAGE DOES NOT PRINT IS NOT ZERO. That is the load-bearing clause of the whole
// entry: `missing` names the figures the page never printed, and a surface that rendered them as
// `0` would be telling a professional that a statutory contribution was nil.
//
// NO OBJECT SPREAD ANYWHERE IN THIS FILE — `check-parts-parity.mjs` refuses one in any module it
// walks, and this module enters that walk at the cut.

/** The door, spelled once. The live signature takes THREE arguments — the document, the CLIENT and
 *  a character ceiling — which is what keeps the read inside the conversation's own client rather
 *  than merely inside the firm. #945's contract wrote the two-argument form; the three-argument one
 *  is what the lane database carries. */
export const GET_DOCUMENT_EXTRACT_DOOR = "clara.get_document_extract";

/** The extraction kind the payroll reader banks its state under. */
export const PAYROLL_FACTS_ENGINE_KIND = "payroll_text_facts";

/** The field-path namespace #945's migration reserved for payroll regions. */
export const PAYROLL_FIELD_PATH_PREFIX = "payroll.";

/** The ceiling the read asks for. It bounds the TEXT the door returns; the state itself is small. */
export const PAYROLL_EXTRACT_MAX_CHARS = 20000;

export type PayrollFactState = {
  state_version: string;
  rows: number;
  facts: Record<string, number | null>;
  established: string[];
  disagreed: string[];
  missing: string[];
};

export type PayrollRegion = {
  field_path: string;
  page: number | null;
  text_content: string | null;
};

export type PayrollFactStateOutcome =
  | { ok: true; state: PayrollFactState; regions: PayrollRegion[] }
  | { ok: false; reason: "payroll_not_read" };

function stringsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) out.push(String(item));
  return out;
}

/**
 * The state and its regions, out of ONE extract answer.
 *
 * A MISSING ROW AND AN UNREADABLE ENVELOPE ARE THE SAME ANSWER, and it is never an empty state.
 * "This payroll summary has not been read yet" is a fact a person can act on; a state of zeroes
 * would be a set of figures nobody printed.
 */
export function payrollFactStateFromExtract(extract: unknown): PayrollFactStateOutcome {
  const bag = (extract ?? {}) as Record<string, unknown>;
  const extractions = Array.isArray(bag.extractions) ? (bag.extractions as Record<string, unknown>[]) : [];
  const row = extractions.find((e) => String(e.engine_kind ?? "") === PAYROLL_FACTS_ENGINE_KIND);
  if (row === undefined) return { ok: false, reason: "payroll_not_read" };
  let envelope: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(String(row.envelope_text ?? ""));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, reason: "payroll_not_read" };
    }
    envelope = parsed as Record<string, unknown>;
  } catch {
    return { ok: false, reason: "payroll_not_read" };
  }
  const raw = envelope.payroll_state;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, reason: "payroll_not_read" };
  const state = raw as Record<string, unknown>;

  const facts: Record<string, number | null> = {};
  const rawFacts = state.facts;
  if (rawFacts && typeof rawFacts === "object" && !Array.isArray(rawFacts)) {
    for (const [key, value] of Object.entries(rawFacts as Record<string, unknown>)) {
      // A NULL STAYS NULL. `Number(null)` is 0, and that coercion is exactly the defect this
      // entry's own stanza forbids a model from making in words.
      facts[key] = value == null ? null : Number(value);
    }
  }

  const regions: PayrollRegion[] = [];
  const rawRegions = Array.isArray(bag.regions) ? (bag.regions as Record<string, unknown>[]) : [];
  for (const region of rawRegions) {
    const path = String(region.field_path ?? "");
    if (!path.startsWith(PAYROLL_FIELD_PATH_PREFIX)) continue;
    regions.push({
      field_path: path,
      page: region.page == null ? null : Number(region.page),
      text_content: region.text_content == null ? null : String(region.text_content),
    });
  }

  return {
    ok: true,
    state: {
      state_version: String(state.state_version ?? ""),
      rows: state.rows == null ? 0 : Number(state.rows),
      facts,
      established: stringsOf(state.established),
      disagreed: stringsOf(state.disagreed),
      missing: stringsOf(state.missing),
    },
    regions,
  };
}

export type PayrollReadRefusal = { code: string; reason: string; message: string };

/** The estate's typed codes, mapped to what the person is told. #945's own table. */
export function payrollReadRefusal(code: string, reason: string | null): PayrollReadRefusal {
  if (code === "CLR03") {
    return {
      code,
      reason: "not_permitted",
      message: "You are not a member of the firm that holds this document.",
    };
  }
  if (code === "CLR11") {
    return {
      code,
      reason: "document_not_found",
      message: "I cannot find that document under this client.",
    };
  }
  return {
    code,
    reason: reason ?? "payroll_read_failed",
    message: "That payroll summary could not be read.",
  };
}

/**
 * The `payroll_not_read` sentence, NAMING THE TASK'S OWN STATUS rather than guessing — #945's
 * contract says so in as many words, and the reason is that "queued" and "failed" send a person to
 * two different places. An unknown status says nothing about one rather than inventing one.
 */
export function payrollNotReadMessage(status: string | null): string {
  return status === null || status === ""
    ? "That payroll summary has not been read yet."
    : `That payroll summary has not been read yet — its reading is ${status}.`;
}
