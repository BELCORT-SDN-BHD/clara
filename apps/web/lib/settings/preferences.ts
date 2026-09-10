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

/** Only EXPLICITLY saved overrides — an absent key means "the product
 *  default", never a stored sentinel (0179's own PATCH-semantics contract). */
export type InterfacePreferences = {
  motion?: MotionPreference;
  sidebarDefault?: SidebarDefaultPreference;
};

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
