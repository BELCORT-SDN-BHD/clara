// #635 — the ONE view-state ladder every card on `/settings/firm` renders, so "still reading",
// "your rank does not reach this", "this failed" and "it read, and here is what it says" are
// told apart by SHAPE before a word is read (`components/common/state.tsx`'s own ladder, applied
// to a read that can also be REFUSED by the database).
//
// WHY `denied` IS A STATE AND NOT AN ERROR. `clara._human_ctx` raises CLR04 with NO
// `detail.reason` — measured on the rig (0004:299-309: 'no authenticated actor' / 'actor has no
// active membership' / 'insufficient role'). So the surface keys its denied face off the CODE
// and renders the database's own sentence VERBATIM; it invents no reason token and it does not
// guess which of the three sentences it got.
//
// WHY A DENIED VIEW CARRIES NO DATA. A live demotion must not leave a stale payload behind a
// disabled control: the moment a re-read comes back CLR04, the card's rendered figures are GONE,
// not greyed. The type makes that structural rather than a rule somebody has to remember —
// `denied` has no `data` field to put them in.

export type FirmSettingsView<T> =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly data: T }
  /** The database refused this caller. `message` is its own sentence, unedited. */
  | { readonly status: "denied"; readonly message: string }
  /** Transport, decode, or anything that is not a governed refusal. */
  | { readonly status: "failed"; readonly message: string };

export const LOADING = { status: "loading" } as const;

export function ready<T>(data: T): FirmSettingsView<T> {
  return { status: "ready", data };
}

export function denied<T>(message: string): FirmSettingsView<T> {
  return { status: "denied", message };
}

export function failed<T>(message: string): FirmSettingsView<T> {
  return { status: "failed", message };
}
