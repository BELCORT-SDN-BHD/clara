// #639 — THE DEPENDENT DEPRECIATION-PARTICULARS QUESTION, as a field declaration, a typed answer
// schema and a refusal mapper.
//
// WHY THIS FILE EXISTS AND WHY IT IS HERE. An acquisition posts the instant the facts suffice; the
// depreciation particulars may be missing, and then ONE dependent, versioned question parks the
// same Work until a human answers it. Opening that question from a run is a FROZEN act
// (`claraWork.v3.tools.ts`'s `ask_question` carries no `execute` — the workflow body opens it), so
// the tool itself ships in the wave's single shared `claraWork_v4`. Everything that tool needs
// which is NOT the frozen body lives here, in non-frozen infrastructure, tested on its own:
//
//   * FA_PARTICULARS_FIELDS — the `p_fields` array `clara.open_work_question` validates and every
//     answering surface renders. Proven against `clara._assert_work_question_fields` by the DB
//     battery (`p639.question.dependent`), not merely asserted here.
//   * faParticularsAnswerSchema — the CLOSED key set `clara._fa_validate_particulars` admits
//     (0041:2977-2984). A key outside it is refused by the database with axis `unknown_key`. It
//     parses the answer THE ANSWER DOOR CAN STORE, which is not the same spelling: a `text` field
//     is a JSON string there and a number here, and `note` is admitted there and refused here. The
//     conversion is `fromDoorAnswer`, below, and it is the whole of the successor review's F1.
//   * particularsFromAnswer — the `p_particulars` jsonb the door takes, built from the answer the
//     human gave, in the DATABASE's own spelling.
//   * localParticularsRefusal — the earlier, more legible half of a validation the database owns.
//   * refusalFieldForAxis — the CLR37 `detail.axis` → FIELD KEY map. The database names an AXIS;
//     a surface needs a CONTROL. Without this map an axis-typed refusal is a red banner over a
//     form the reader then has to search.
//
// THE DATABASE IS THE AUTHORITY, ALWAYS. `clara._fa_validate_particulars` re-checks every rule
// below, and `clara.complete_fixed_asset_particulars` / `..._for` add two more it alone can know
// (a non-depreciable enrolment admits `none` only; a residual may not exceed the asset's cost).
// Nothing here is a rule of its own — every check is a MIRROR — so a preparer sees the mistake
// beside the control that caused it instead of a round trip later.
//
// NOTHING HERE WRITES A JOURNAL, AND NOTHING HERE MAY. Answering the question completes a REGISTER
// fact. The acquisition posted when it posted; a second entry would be a second acquisition.
//
// THE CLOSURE RULE, STATED PLAINLY. `scripts/check-frozen-workflows.mjs`'s IMPORT-ESCAPE captures
// any first-party module a frozen body imports. Today nothing frozen imports this file, so it is
// not in `frozen-workflows.json`; the moment `claraWork.v4.tools.ts` imports it, it is hash-locked
// with the closure and may never be edited again except through a successor. That is the intended
// trajectory, not an oversight — and it is why the schema below is written to be final.

import { z } from "zod";

/** The tool name the wave's shared `claraWork_v4` cut will register. */
export const APPLY_FIXED_ASSET_PARTICULARS_TOOL = "apply_fixed_asset_particulars";

/** `clara.fixed_assets.depreciation_method`'s three values (0041's CHECK). `none` is not "skip
 *  depreciation later" — it is a STATED policy, and it still requires an in-service date. */
export const FA_METHODS = ["straight_line", "reducing_balance", "none"] as const;
export type FaMethod = (typeof FA_METHODS)[number];

/** The CLOSED key set `clara._fa_validate_particulars` admits (0041:2977-2984). A key outside it
 *  is a CLR37 `fa_particulars_invalid` with axis `unknown_key`, so listing them here is the
 *  difference between a refusal a human can read and one they cannot. */
export const FA_PARTICULARS_KEYS = [
  "method", "useful_life_months", "rate_bps", "residual_cents", "start_date",
  "description", "ca_class", "is_commercial_vehicle", "is_new",
] as const;
export type FaParticularsKey = (typeof FA_PARTICULARS_KEYS)[number];

/** The question's declared fields — the `p_fields` array `clara.open_work_question` validates
 *  (`clara._assert_work_question_fields`, 0180:308) and `clara.answer_work_question` then holds the
 *  answer to. `money` fields take an integer number of cents as a JSON NUMBER; `text` fields take
 *  a string; `date` fields take an ISO `YYYY-MM-DD`.
 *
 *  ONLY `method` AND `start_date` ARE REQUIRED, and that is the ticket in one line: an in-service
 *  date is required for EVERY method including `none` (0041:3001), and the drivers are required
 *  only by the method that uses them — so a human who knows the method and the date can finish,
 *  and one who does not is told which single control is missing.
 *
 *  THE TWO DRIVERS ARE `text`, DELIBERATELY, AND THAT IS NOT AN OVERSIGHT. A months count and a
 *  basis-point rate are not MONEY: `money` is the one kind whose browser control runs typed text
 *  through `parseAmountToCents` (apps/web/lib/work/question-fields.ts), so a person typing `60`
 *  months into one would send 6000. `text` is what the DB battery proved this array with
 *  (`p639.question.dependent` answers `useful_life_months: "60"`), and `faParticularsAnswerSchema`
 *  converts the string the door stores into the number the particulars door takes. */
export const FA_PARTICULARS_FIELDS = [
  {
    key: "method",
    label: "Depreciation method",
    kind: "choice",
    required: true,
    options: [
      { value: "straight_line", label: "Straight line" },
      { value: "reducing_balance", label: "Reducing balance" },
      { value: "none", label: "Not depreciated" },
    ],
  },
  { key: "useful_life_months", label: "Useful life (months)", kind: "text", required: false, unit: "months" },
  { key: "rate_bps", label: "Annual rate (basis points)", kind: "text", required: false, unit: "bps" },
  { key: "residual_cents", label: "Residual value", kind: "money", required: false },
  { key: "start_date", label: "In-service (depreciation start) date", kind: "date", required: true },
  { key: "description", label: "Asset description", kind: "text", required: false },
] as const;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("A calendar date, YYYY-MM-DD. Ask the human if they did not give one.");

/**
 * THE DOOR'S ANSWER, TURNED INTO THE DATABASE'S OWN SPELLING — the ONE place the two grammars meet.
 *
 * THERE ARE TWO GRAMMARS HERE AND THEY ARE BOTH THE DATABASE'S. `clara._assert_work_answer`
 * (0180:444-486) judges an ANSWER against the declared FIELDS: a `text` field is a JSON **string**
 * and nothing else, a `money` field an integer JSON **number** and nothing else, and the reserved
 * `note` key is explicitly admitted beside them. `clara._fa_validate_particulars` (0041:2970-3033)
 * judges `p_particulars`, where `useful_life_months` and `rate_bps` are **numbers**. So the two
 * drivers are declared `text` above (proven against `clara._assert_work_question_fields` by the DB
 * battery, and answered as `"60"` by `p639.question.dependent` on a live rig) and are sent as
 * numbers below — and THIS function is the bridge. Without it the only answer a human could give
 * is the one the run would refuse, which is the successor review's F1 in one sentence.
 *
 * Three rules, each one the door's own:
 *
 *   1. A `text`-declared integer driver arrives as a decimal string and becomes a number. Anything
 *      that is not a whole number is left ALONE, so the refusal names the field instead of being
 *      coerced into a plausible wrong value (`z.coerce.number()` would make `""` a zero).
 *   2. A BLANK optional is ABSENT. `clara._assert_work_answer` treats a whitespace-only string in
 *      an optional field as "simply absent from the accepted answer" — and then stores the answer
 *      VERBATIM (`answer = p_answer`, 0180:847), so the blank really does arrive here.
 *   3. The reserved `note` is dropped. It is the human's remark on the ANSWER; it lives durably on
 *      `clara.agent_interruptions.answer`, which is the record every surface renders, and
 *      `clara._fa_validate_particulars` would refuse it as `unknown_key`.
 *
 * Anything that is not an object passes through untouched, so the object schema below produces the
 * refusal rather than this function inventing one.
 */
const DOOR_INTEGER_KEYS = new Set<string>(["useful_life_months", "rate_bps"]);

function fromDoorAnswer(raw: unknown): unknown {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (key === "note") continue;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed === "") continue;
      if (DOOR_INTEGER_KEYS.has(key) && /^-?\d+$/.test(trimmed)) {
        out[key] = Number(trimmed);
        continue;
      }
    }
    out[key] = value;
  }
  return out;
}

/** The typed answer. `.strict()` on purpose: a key the database would refuse must not travel —
 *  and `fromDoorAnswer` above has already put the answer the ANSWER door stored into the spelling
 *  the PARTICULARS door takes, so one object satisfies both. */
export const faParticularsAnswerSchema = z.preprocess(fromDoorAnswer, z
  .object({
    method: z.enum(FA_METHODS).describe(
      "How this asset is depreciated. `none` is a stated policy (land, for instance), not an omission.",
    ),
    useful_life_months: z.number().int().positive().nullable().optional().describe(
      "Whole months. Required for straight_line and reducing_balance; forbidden for none.",
    ),
    rate_bps: z.number().int().min(1).max(10000).nullable().optional().describe(
      "The annual reducing-balance rate in basis points (1..10000). Reducing balance only.",
    ),
    residual_cents: z.number().int().min(0).nullable().optional().describe(
      "Residual value in whole cents. Never a float, never a major-unit figure.",
    ),
    start_date: isoDate.describe(
      "The in-service date depreciation starts from. Required for EVERY method, including none.",
    ),
    description: z.string().trim().min(1).max(200).nullable().optional().describe(
      "What the asset is. Replaces the placeholder the acquisition birthed the row with.",
    ),
    ca_class: z.string().trim().min(1).max(64).nullable().optional(),
    is_commercial_vehicle: z.boolean().nullable().optional(),
    is_new: z.boolean().nullable().optional(),
  })
  .strict());

export type FaParticularsAnswer = z.infer<typeof faParticularsAnswerSchema>;

/** The `p_particulars` jsonb `clara.complete_fixed_asset_particulars[_for]` takes, in the
 *  DATABASE's own spelling. Absent optionals are OMITTED rather than sent as null: the validator
 *  reads `p_particulars ->> key` and `nullif(..., '')`, so both are equivalent to it, and omitting
 *  keeps the op-key payload hash stable for an answer that did not mention them. */
export function particularsFromAnswer(answer: FaParticularsAnswer): Record<string, unknown> {
  const out: Record<string, unknown> = { method: answer.method, start_date: answer.start_date };
  const put = (k: FaParticularsKey, v: unknown) => {
    if (v !== undefined && v !== null && v !== "") out[k] = v;
  };
  put("useful_life_months", answer.useful_life_months);
  put("rate_bps", answer.rate_bps);
  put("residual_cents", answer.residual_cents);
  put("description", answer.description);
  put("ca_class", answer.ca_class);
  put("is_commercial_vehicle", answer.is_commercial_vehicle);
  put("is_new", answer.is_new);
  return out;
}

/** The CLR37 axes `clara._fa_validate_particulars` and the two completion doors raise
 *  (0041:2971-3033, 3066-3083), each mapped to the FIELD KEY a surface should focus.
 *
 *  `lifecycle` and `shape` map to NO field on purpose — they are not about a control the reader
 *  can correct, and pretending otherwise would send focus somewhere useless. A surface that gets
 *  `null` back renders the refusal at form level, which is the honest place for it. */
export const FA_REFUSAL_AXIS_FIELD: Readonly<Record<string, FaParticularsKey | null>> = Object.freeze({
  method: "method",
  drivers: "useful_life_months",
  start_date: "start_date",
  residual: "residual_cents",
  non_depreciable: "method",
  unknown_key: null,
  malformed: null,
  shape: null,
  lifecycle: null,
});

/** The control a CLR37 refusal names, or null when the refusal is about the form as a whole.
 *  `details.field` wins when the database supplied one — a later door may name a field directly,
 *  and a map that overrode it would be a second opinion about the same refusal. */
export function refusalFieldForAxis(
  details: { axis?: unknown; field?: unknown } | null | undefined,
): FaParticularsKey | null {
  const field = typeof details?.field === "string" ? details.field : null;
  if (field && (FA_PARTICULARS_KEYS as readonly string[]).includes(field)) {
    return field as FaParticularsKey;
  }
  const axis = typeof details?.axis === "string" ? details.axis : null;
  if (axis && axis in FA_REFUSAL_AXIS_FIELD) return FA_REFUSAL_AXIS_FIELD[axis] ?? null;
  return null;
}

export type FaParticularsRefusal = {
  reason: "fa_particulars_invalid";
  axis: string;
  field: FaParticularsKey | null;
  message: string;
};

const refusal = (axis: string, message: string): FaParticularsRefusal => ({
  reason: "fa_particulars_invalid",
  axis,
  field: refusalFieldForAxis({ axis }),
  message,
});

/** The earlier half of a validation the database owns — a MIRROR of
 *  `clara._fa_validate_particulars`, never a rule of its own. `nonDepreciable` is the one fact the
 *  caller must supply from the register row: an asset enrolled with no accumulated-depreciation
 *  account admits `method='none'` alone (0041:3080-3083), and the form knows that BEFORE it offers
 *  a method rather than after the door refuses one. `costCents` lets the residual wall (0041:3086)
 *  be checked in the same place.
 *
 *  Returns null when the answer is one the database will accept on shape. It is NOT an
 *  authorisation check and never a substitute for the door. */
export function localParticularsRefusal(
  answer: FaParticularsAnswer,
  context: { nonDepreciable?: boolean; costCents?: number | null } = {},
): FaParticularsRefusal | null {
  if (!(FA_METHODS as readonly string[]).includes(answer.method)) {
    return refusal("method", "Choose straight line, reducing balance, or not depreciated.");
  }
  if (!answer.start_date) {
    return refusal(
      "start_date",
      "An in-service date is required for every method, including an asset that is not depreciated.",
    );
  }
  const life = answer.useful_life_months ?? null;
  const rate = answer.rate_bps ?? null;
  if (answer.method === "none") {
    if (life !== null || rate !== null) {
      return refusal("drivers", "An asset that is not depreciated carries neither a useful life nor a rate.");
    }
  } else if (answer.method === "straight_line") {
    if (life === null || life <= 0 || rate !== null) {
      return refusal("drivers", "Straight line needs a positive useful life in months and no rate.");
    }
  } else {
    if (life === null || life <= 0 || rate === null || rate < 1 || rate > 10000) {
      return refusal(
        "drivers",
        "Reducing balance needs a positive useful life (so it terminates) and an annual rate of 1–10000 basis points.",
      );
    }
  }
  const residual = answer.residual_cents ?? null;
  if (residual !== null && residual < 0) {
    return refusal("residual", "A residual value cannot be negative.");
  }
  if (context.nonDepreciable === true && answer.method !== "none") {
    return refusal(
      "non_depreciable",
      "This asset sits on a non-depreciable enrolment with no accumulated-depreciation account, so its method must be “not depreciated”.",
    );
  }
  if (
    answer.method !== "none"
    && residual !== null
    && typeof context.costCents === "number"
    && residual > context.costCents
  ) {
    return refusal("residual", "A residual value cannot exceed the asset's acquisition cost.");
  }
  return null;
}

// =====================================================================================
// WHAT `claraWork_v4` MUST WIRE, and nothing more.
//
//   1. After a commit whose effect names a fixed asset with `particulars_complete:false`, call
//      `clara.open_work_question(p_task, p_hook_token, p_question, p_fields => FA_PARTICULARS_FIELDS,
//      p_reason, p_source_ref => {kind:'fixed_asset', asset_id})` and park on the WDK hook.
//   2. On resume, parse the answer with `faParticularsAnswerSchema`, check
//      `localParticularsRefusal(answer, {nonDepreciable, costCents})`, then call
//      `clara.complete_fixed_asset_particulars_for(p_client, p_asset,
//      p_particulars => particularsFromAnswer(answer), p_op_key, p_obo => <the Work's initiator>)`.
//   3. Map a CLR37 refusal through `refusalFieldForAxis(details)` before showing it.
//   4. NEVER post a second journal entry. The acquisition already posted; step 2 writes a REGISTER
//      fact and the door itself touches no `clara.journal_entries` row (0216 tail T.9 asserts it).
// =====================================================================================
