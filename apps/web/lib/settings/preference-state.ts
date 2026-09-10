// #626 (refresh spec #612, journey D1) — the PURE dirty/patch/reset state machine
// for the Interface section of `/settings/account`. No React, no door calls: this
// module only ever combines an in-memory DRAFT (what the person has touched since
// the last authoritative load, never persisted) with the AUTHORITATIVE row
// (`clara.get_my_preferences()`'s last read) into the three things a form needs —
// what to show, what is dirty, and what to send. Kept separate from
// `components/settings/account-settings.tsx` so this logic has a DOM-free unit
// cell (test/manifest.txt), matching the house convention (lib/parts/hooks.ts
// keeps the hydrate mechanism apart from any one card's JSX for the same reason).
//
// ONE SAVE CANNOT CLEAR AN UNRELATED SETTING — the acceptance line this whole
// module exists to prove. `buildInterfacePatch` includes ONLY the fields the
// draft actually touched (dirty-only), never every field the effective view
// happens to show; 0179_user_preferences.sql's own shallow `||` merge is the
// other half of that guarantee, and this module's job is to never even ASK it to
// touch a field nothing changed.

import type { InterfacePreferences } from "@/lib/settings/preferences";

export type InterfaceField = "motion" | "sidebarDefault";

/** Fixed, deliberate order — "first dirty field" (first-invalid-focus on a save
 *  refusal, and the deterministic patch key order) reads top-to-bottom exactly
 *  as the Interface section renders the two fields. */
export const INTERFACE_FIELD_ORDER: readonly InterfaceField[] = ["motion", "sidebarDefault"];

/** What the person has touched since the last authoritative load. A field
 *  absent from this object has NOT been touched — `undefined` and "touched
 *  back to the original value" are different states a `delete` (never an
 *  explicit `undefined` assignment) keeps distinguishable; see `resetDraftField`. */
export type InterfaceDraft = Partial<InterfacePreferences>;

export const EMPTY_DRAFT: InterfaceDraft = {};

/** What a field should DISPLAY: the draft's own unsaved value if the person
 *  touched it this session, else the authoritative stored value. */
export function effectiveInterfaceValue<F extends InterfaceField>(
  draft: InterfaceDraft,
  authoritative: InterfacePreferences | undefined,
  field: F,
): InterfacePreferences[F] {
  const draftValue = draft[field];
  return draftValue !== undefined ? draftValue : authoritative?.[field];
}

/** A field counts as dirty only when the draft holds a value AND that value
 *  differs from the authoritative one — touching a control back to its
 *  original value is not a pending change. */
export function isFieldDirty(
  draft: InterfaceDraft,
  authoritative: InterfacePreferences | undefined,
  field: InterfaceField,
): boolean {
  const draftValue = draft[field];
  return draftValue !== undefined && draftValue !== authoritative?.[field];
}

/** Every currently-dirty field, in the fixed display order. */
export function dirtyInterfaceFields(
  draft: InterfaceDraft,
  authoritative: InterfacePreferences | undefined,
): InterfaceField[] {
  return INTERFACE_FIELD_ORDER.filter((field) => isFieldDirty(draft, authoritative, field));
}

export function hasAnyDirtyField(draft: InterfaceDraft, authoritative: InterfacePreferences | undefined): boolean {
  return dirtyInterfaceFields(draft, authoritative).length > 0;
}

/** The FIRST dirty field, in display order — where first-invalid-focus lands
 *  after a CLR10 the server raised against the just-submitted patch (the
 *  patch can only ever be built from dirty fields, so a refused save refused
 *  one of THESE). Null when nothing is dirty (nothing to focus). */
export function firstDirtyField(
  draft: InterfaceDraft,
  authoritative: InterfacePreferences | undefined,
): InterfaceField | null {
  const fields = dirtyInterfaceFields(draft, authoritative);
  return fields[0] ?? null;
}

/** ONLY the dirty fields, as a patch fit to send to `saveMyPreferences` — the
 *  guarantee this module exists for. A field the person never touched never
 *  appears here, regardless of what the effective view happens to show. */
export function buildInterfacePatch(
  draft: InterfaceDraft,
  authoritative: InterfacePreferences | undefined,
): InterfacePreferences {
  const patch: InterfacePreferences = {};
  for (const field of dirtyInterfaceFields(draft, authoritative)) {
    if (field === "motion") patch.motion = draft.motion;
    else if (field === "sidebarDefault") patch.sidebarDefault = draft.sidebarDefault;
  }
  return patch;
}

/** Restores ONE field to the authoritative value — a `delete`, not a
 *  `{...draft, [field]: authoritative?.[field]}` write, so the field goes back
 *  to genuinely untouched (isFieldDirty false) rather than merely equal by
 *  coincidence. Every OTHER field's draft is untouched. */
export function resetDraftField(draft: InterfaceDraft, field: InterfaceField): InterfaceDraft {
  const next = { ...draft };
  delete next[field];
  return next;
}

/** Set one field's DRAFT value — the control's own onChange. */
export function setDraftField<F extends InterfaceField>(
  draft: InterfaceDraft,
  field: F,
  value: InterfacePreferences[F],
): InterfaceDraft {
  return { ...draft, [field]: value };
}
