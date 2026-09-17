// #639 — AXIS → CONTROL, on the human side of the same door.
//
// `clara._fa_validate_particulars` and `clara._fa_complete_particulars_core` refuse an invalid
// answer with CLR37 `fa_particulars_invalid` and a typed `axis` inside `detail` — `start_date`,
// `drivers`, `residual`, `non_depreciable`, `method`, `lifecycle`. The browser's job is to put the
// reader AT the control that axis names instead of leaving them in front of a sentence and a form
// with nine fields.
//
// WHY A SECOND COPY OF THE MAP. `packages/runtime/lib/fixed-asset-acquisition.ts` carries the same
// axis→field table for the claraWork_v4 successor. `apps/web` does not depend on `@clara/runtime`
// (nothing under apps/web imports it, and the package is not in apps/web's dependencies), so this
// is a deliberate MIRROR rather than an import — and the two are pinned to each other by
// `fa-refusal-field.test.ts`, which asserts this file's own key set is the closed particulars key
// set the door admits.
//
// `lifecycle`, `shape` and `malformed` map to NO control on purpose: they are not about a field
// the reader can correct, and sending focus somewhere useless is worse than leaving it alone. A
// null answer means "render the refusal at form level", which is what the dialog already does.

import { isDoorRefusal } from "@/lib/doors";
import type { FaParticularsInput } from "@/lib/registers/fixed-assets";

export type FaParticularsKey = keyof FaParticularsInput;

/** The door's own axis vocabulary, mapped to the field a human corrects. */
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

/** The id suffix `FaParticularsFields` gives each control (`${idPrefix}-${suffix}`). That
 *  component is reused UNCHANGED by the register, the detail route and the inline affordance —
 *  its deterministic ids are the seam this module addresses it through, which is why nothing here
 *  needs a ref, a context or an edit to the shared field set. */
export const FA_FIELD_CONTROL_SUFFIX: Readonly<Partial<Record<FaParticularsKey, string>>> = Object.freeze({
  method: "method",
  start_date: "start",
  useful_life_months: "life",
  rate_bps: "rate",
  residual_cents: "residual",
  description: "desc",
  ca_class: "caclass",
});

/** The control a refusal names, read off the `DoorRefusal`'s own typed detail.
 *
 *  `detail.field` WINS when the database supplied one — a later door may name a field directly and
 *  a map that overrode it would be a second opinion about the same refusal. Anything that is not a
 *  governed refusal (a transport failure, an auth rejection) names no control at all. */
export function faRefusalField(error: unknown): FaParticularsKey | null {
  if (!isDoorRefusal(error)) return null;
  const detail = error.detail;
  if (detail === null) return null;
  const field = typeof detail.field === "string" ? detail.field : null;
  if (field && field in FA_FIELD_CONTROL_SUFFIX) return field as FaParticularsKey;
  const axis = typeof detail.axis === "string" ? detail.axis : null;
  if (axis && axis in FA_REFUSAL_AXIS_FIELD) return FA_REFUSAL_AXIS_FIELD[axis] ?? null;
  return null;
}

/** The DOM id of the control a refusal names inside one dialog's field set, or null when the
 *  refusal is about the form as a whole (or is not a governed refusal at all). */
export function faRefusalControlId(idPrefix: string, error: unknown): string | null {
  const field = faRefusalField(error);
  if (field === null) return null;
  const suffix = FA_FIELD_CONTROL_SUFFIX[field];
  return suffix ? `${idPrefix}-${suffix}` : null;
}
