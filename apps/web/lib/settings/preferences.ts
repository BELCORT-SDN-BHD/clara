// #626 (refresh spec #612, journey D1) — the web-side door calls for
// clara.get_my_preferences()/clara.save_my_preferences() (0179_user_preferences.sql).
// Both ride `callDoor` (lib/doors.ts) exactly like every other read-flavoured and
// write RPC in this codebase (lib/coding/reads.ts's own header names the same
// convention for get_open_question) — never a bespoke fetch, never getRows on a
// view. HYDRATE-NEVER-TRUST binds this module like every other doors.ts caller:
// `saveMyPreferences`'s own return is a report of what the DB did, not a value a
// caller may paint as new truth without the follow-up read
// `components/settings/account-settings.tsx` already performs via `useHydratedPart`.

import { callDoor, isDoorRefusal, type CallDoorOptions } from "@/lib/doors";
import {
  isMotionPreference,
  type MotionPreference,
} from "@/lib/settings/motion-preference";

export { isDoorRefusal };

/** interface.sidebarDefault's two values (0179's enumerated supported set). */
export type SidebarDefaultPreference = "expanded" | "collapsed";

export function isSidebarDefaultPreference(value: unknown): value is SidebarDefaultPreference {
  return value === "expanded" || value === "collapsed";
}

/**
 * #641 — one saved Work-list view: a NAME and the filter query string it stands for.
 *
 * `query` is `workListStateQuery`'s canonical spelling (`lib/work/work-list-url-state.ts`) — the
 * FILTERS only, never a cursor, so a view opens on the first page of what it describes rather than
 * on a fence into a result set that has since changed. 0189 validates the whole shape on the way
 * in (an array of at most 20 objects carrying exactly `id`/`name`/`query`, ids non-blank and
 * unique), so a row read back here was validated by the database, not merely by this module.
 */
export type WorkSavedView = { id: string; name: string; query: string };

/** Only EXPLICITLY saved overrides — an absent key means "the product
 *  default", never a stored sentinel (0179's own PATCH-semantics contract). */
export type InterfacePreferences = {
  motion?: MotionPreference;
  sidebarDefault?: SidebarDefaultPreference;
  /** #641 — absent (rather than `[]`) for a person who has never saved one. */
  workViews?: WorkSavedView[];
};

/** A stored view, shape-checked on the way OUT as well as in. The database already validated
 *  every element 0189 accepted, but a row saved by a FUTURE version of that door (or read from a
 *  database ahead of this build) must degrade to "not a view this build understands" rather than
 *  render `undefined` into a pill. */
function toWorkSavedView(raw: unknown): WorkSavedView | null {
  if (typeof raw !== "object" || raw === null) return null;
  const v = raw as Record<string, unknown>;
  if (typeof v.id !== "string" || v.id.trim() === "") return null;
  if (typeof v.name !== "string" || v.name.trim() === "") return null;
  if (typeof v.query !== "string") return null;
  return { id: v.id, name: v.name, query: v.query };
}

/** notifications carries zero supported keys today (0179's header) — typed as
 *  a bag of unknowns so a FUTURE additive key the DB starts returning is
 *  preserved through this module rather than silently dropped, even though
 *  the UI renders no control for any of them yet. */
export type NotificationPreferences = Record<string, unknown>;

export type MyPreferences = {
  version: number;
  interface: InterfacePreferences;
  notifications: NotificationPreferences;
  updatedAt: string | null;
};

type RawPreferencesEnvelope = {
  version: number;
  interface: Record<string, unknown>;
  notifications: Record<string, unknown>;
  updated_at: string | null;
};

function toInterface(raw: Record<string, unknown>): InterfacePreferences {
  const out: InterfacePreferences = {};
  if (isMotionPreference(raw.motion)) out.motion = raw.motion;
  if (isSidebarDefaultPreference(raw.sidebarDefault)) out.sidebarDefault = raw.sidebarDefault;
  if (Array.isArray(raw.workViews)) {
    const views = raw.workViews.map(toWorkSavedView).filter((v): v is WorkSavedView => v !== null);
    if (views.length > 0) out.workViews = views;
  }
  return out;
}

function toPreferences(raw: RawPreferencesEnvelope): MyPreferences {
  return {
    version: raw.version,
    interface: toInterface(raw.interface ?? {}),
    notifications: raw.notifications ?? {},
    updatedAt: raw.updated_at,
  };
}

/** `clara.get_my_preferences()` — no firm requirement (0179's own header); a
 *  caller with no saved row gets honest synthetic defaults (version 0, empty
 *  objects), never a refusal. */
export async function getMyPreferences(opts?: CallDoorOptions): Promise<MyPreferences> {
  const raw = await callDoor<RawPreferencesEnvelope>("get_my_preferences", {}, opts);
  return toPreferences(raw);
}

/** A PATCH — only the keys the caller is actually changing. Never send a key
 *  merely because the UI happens to know its current value; that is exactly
 *  the "one save clears unrelated settings" defect 0179's shallow merge and
 *  this module's own dirty-tracking (account-settings.tsx) both exist to
 *  prevent. */
export type PreferencesPatch = {
  interface?: InterfacePreferences;
};

/** `clara.save_my_preferences(p_expected_version, p_patch, p_op_key)`. Throws
 *  `DoorRefusal` (`isDoorRefusal`, re-exported above) with `.code` CLR06 on a
 *  stale `expectedVersion` or CLR10 on any unsupported key/value, `.reason`
 *  carrying the typed detail the migration raises. */
export async function saveMyPreferences(
  expectedVersion: number,
  patch: PreferencesPatch,
  opKey: string,
  opts?: CallDoorOptions,
): Promise<MyPreferences> {
  const raw = await callDoor<RawPreferencesEnvelope>(
    "save_my_preferences",
    { p_expected_version: expectedVersion, p_patch: patch, p_op_key: opKey },
    opts,
  );
  return toPreferences(raw);
}
