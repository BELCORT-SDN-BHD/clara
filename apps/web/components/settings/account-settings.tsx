"use client";

// #626 (refresh spec #612, journey D1) — `/settings/account`'s real content,
// replacing the deliberately-placeholder page #614 shipped (see
// app/(firm)/settings/account/page.tsx's own header for that history).
//
// THE INVENTORY THIS TICKET'S FIRST ACCEPTANCE LINE REQUIRED ("expose only
// persisted supported preferences … a control whose value nothing consumes is
// a lie") — checked against the live source before any control was built:
//   - Theme/dark mode: NO mechanism exists (no `.dark` class, no
//     `data-theme`, app/globals.css is light-only by owner ruling) — no
//     control offered; there is nothing to switch.
//   - Locale: only messages/en.json exists — no picker offered.
//   - Motion: NO user-level mechanism existed before this ticket. Built one:
//     `interface.motion` drives `data-motion` on `<html>`
//     (components/app-shell/motion-preference-sync.tsx), which
//     app/globals.css's `@custom-variant motion-reduce` reads ALONGSIDE the
//     OS query, so it governs every existing `motion-reduce:`-tagged utility
//     in the product, not merely new UI this ticket writes.
//   - Sidebar default: the shell's `sidebar_state` cookie
//     (components/ui/sidebar.tsx) already decides the sidebar's initial
//     state on every load — `interface.sidebarDefault` writes THAT SAME
//     cookie on a successful save (`applySidebarCookie` below), so it is a
//     second WRITER of the one existing mechanism, never a second one.
//   - Start destination (home/work): considered and DROPPED. The only real
//     hook is `lib/safe-redirect.ts`'s hardcoded `"/"` fallback inside the
//     security-reviewed login-redirect wall (components/login-form.tsx) —
//     wiring a preference into that pre-auth path adds real risk to a
//     hardened surface for a low-value convenience. Not offered.
//   - Display name / email: clara.users already carries `display_name`, and
//     its RLS already admits a self-read; email is read straight from the
//     Supabase session. Both render READ-ONLY (account-section.tsx) —
//     EDITING either is a different, not-yet-built capability, named as such.
//   - Notifications: NO reader of a per-user notification preference exists
//     anywhere in this codebase (clara.notifications, 0003:184, is a
//     firm/client event log with no recipient column). No control offered —
//     notifications-section.tsx renders the honest absence.
//
// STATE MACHINE: `useHydratedPart`'s own `act()` already IS the
// concurrent-change flow this ticket asks for. A refused save's `err`/`clr`
// are STICKY (lib/parts/hooks.ts's own contract) and `act()` ALWAYS reloads
// afterward regardless of outcome — so by the time a CLR06 refusal is
// visible, `preferences` is ALREADY the fresh row; "Reload and keep my
// edits" only needs to call the hook's own `reload()` (which clears the
// sticky banner on success) because `draft` — the person's unsaved edits —
// lives in THIS component's own state, entirely untouched by any reload.

import { useEffect, useState } from "react";
import { Loader2Icon } from "lucide-react";
import { useTranslations } from "next-intl";

import { StateBanner } from "@/components/common/state";
import { AccountSection } from "@/components/settings/account-section";
import { InterfaceSection, type InterfaceFieldViewState } from "@/components/settings/interface-section";
import { NotificationsSection } from "@/components/settings/notifications-section";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SIDEBAR_COOKIE_MAX_AGE, SIDEBAR_COOKIE_NAME } from "@/components/ui/sidebar";
import { Toaster, toast } from "@/components/ui/toast";
import { isDoorError } from "@/lib/doors";
import { useHydratedPart } from "@/lib/parts/hooks";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import {
  buildInterfacePatch,
  dirtyInterfaceFields,
  effectiveInterfaceValue,
  firstDirtyField,
  isFieldDirty,
  resetDraftField,
  setDraftField,
  type InterfaceDraft,
  type InterfaceField,
} from "@/lib/settings/preference-state";
import {
  getMyPreferences,
  saveMyPreferences,
  type MyPreferences,
  type SidebarDefaultPreference,
} from "@/lib/settings/preferences";

type LoadResult = { status: "ok"; preferences: MyPreferences } | { status: "denied" };

/** Folds an unauthenticated read into a SUCCESSFUL resolution (never a thrown
 *  error) so `useHydratedPart` treats "signed out" as a genuine STATE rather
 *  than a fault — the same distinction components/common/state.tsx's own
 *  header draws between its `info` and `error` tones. Any OTHER failure
 *  (transport, server_error, …) is left to throw, so it reaches the hook's
 *  ordinary err/clr path and the read-error banner below. */
async function loadPreferences(session: typeof sessionTokenAccessor): Promise<LoadResult> {
  try {
    const preferences = await getMyPreferences({ session });
    return { status: "ok", preferences };
  } catch (e) {
    if (isDoorError(e) && (e.kind === "no_session" || e.kind === "unauthenticated")) {
      return { status: "denied" };
    }
    throw e;
  }
}

/** Writes the SAME cookie components/ui/sidebar.tsx's own SidebarProvider
 *  reads on the next load — see this file's header for why this is a second
 *  WRITER, not a second mechanism. Best-effort: the DB save already
 *  succeeded regardless of whether this cookie write is honored. */
function applySidebarCookie(value: SidebarDefaultPreference): void {
  try {
    const openState = value === "expanded" ? "true" : "false";
    document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}; SameSite=Lax`;
  } catch {
    // Cookie writes can fail (storage blocked); never worth surfacing an error for.
  }
}

export function AccountSettings() {
  const t = useTranslations("Settings.account");
  const { data: load, loading, err, clr, busy, act, reload } = useHydratedPart(sessionTokenAccessor, loadPreferences);
  const preferences = load?.status === "ok" ? load.preferences : null;

  const [draft, setDraft] = useState<InterfaceDraft>({});
  const [focusTokens, setFocusTokens] = useState<Record<InterfaceField, number>>({ motion: 0, sidebarDefault: 0 });
  const [reloadingStale, setReloadingStale] = useState(false);

  // First-invalid-focus: a NON-stale refusal against a save is a validation
  // problem with one of the fields the just-submitted patch touched — focus
  // the first one. CLR06 is handled by its own dedicated banner/action below,
  // never a focus jump (there is nothing to correct — the DATA moved, not the
  // person's input).
  useEffect(() => {
    if (!clr || clr.code === "CLR06") return;
    const field = firstDirtyField(draft, preferences?.interface);
    if (field) setFocusTokens((prev) => ({ ...prev, [field]: prev[field] + 1 }));
    // Deliberately keyed on `clr` alone (this project's eslint config does not
    // enforce exhaustive-deps, lib/parts/hooks.ts's own convention) — re-running
    // on every `draft` keystroke would be wrong: this effect exists to react to
    // a NEW refusal, not to the input that produced it.
  }, [clr]);

  const dirtyFields = dirtyInterfaceFields(draft, preferences?.interface);
  const isDirty = dirtyFields.length > 0;

  function changeMotion(value: "system" | "reduced") {
    setDraft((prev) => setDraftField(prev, "motion", value));
  }
  function resetMotion() {
    setDraft((prev) => resetDraftField(prev, "motion"));
  }
  function changeSidebarDefault(value: SidebarDefaultPreference) {
    setDraft((prev) => setDraftField(prev, "sidebarDefault", value));
  }
  function resetSidebarDefault() {
    setDraft((prev) => resetDraftField(prev, "sidebarDefault"));
  }

  async function handleSave() {
    if (!preferences || !isDirty) return;
    const patch = { interface: buildInterfacePatch(draft, preferences.interface) };
    const sidebarChoice = patch.interface.sidebarDefault;

    const ok = await act(async () => {
      await saveMyPreferences(preferences.version, patch, crypto.randomUUID(), { session: sessionTokenAccessor });
    });

    if (ok) {
      // Durable state is updated FIRST (act() already reloaded the
      // authoritative row above) — the draft clears and the Toast is only an
      // acknowledgement, never the record of what happened.
      setDraft({});
      if (sidebarChoice) applySidebarCookie(sidebarChoice);
      toast.add({ title: t("save.savedToast"), type: "success" });
    }
  }

  async function handleReloadKeepEdits() {
    setReloadingStale(true);
    try {
      await reload(); // Clears the sticky CLR06 banner on success; `draft` is untouched.
    } finally {
      setReloadingStale(false);
    }
  }

  if (load?.status === "denied") {
    return (
      <StateBanner tone="info" title={t("deniedTitle")}>
        {t("deniedBody")}
      </StateBanner>
    );
  }

  if (loading && !preferences) {
    return (
      <div className="flex flex-col gap-6" aria-hidden="true">
        <Skeleton className="h-28 w-full max-w-lg" />
        <Skeleton className="h-48 w-full max-w-lg" />
        <Skeleton className="h-20 w-full max-w-lg" />
      </div>
    );
  }

  if (err && !preferences) {
    return (
      <StateBanner tone="error" title={t("readErrorTitle")}>
        {t("readErrorBody")}
      </StateBanner>
    );
  }

  // DISPLAY defaults only — a radio group must always show exactly one selected option, so an
  // absent value (nothing drafted, nothing ever saved) falls back to the actual product default
  // rather than rendering with nothing checked. This is purely cosmetic: `effectiveInterfaceValue`
  // itself stays honest about "no explicit value" (lib/settings/preference-state.ts's own
  // contract, unit-pinned), `isFieldDirty`/`buildInterfacePatch` are computed from the SAME raw
  // value above and are untouched by this fallback, and a save still sends nothing for a field
  // the person never touched. "system" is motion's own stated default (lib/settings/motion-
  // preference.ts: "an unset/absent value... means 'defer to the OS query'"); "expanded" is
  // components/ui/sidebar.tsx's `defaultOpen` — the state a caller with no saved cookie actually
  // gets today.
  const motionValue = effectiveInterfaceValue(draft, preferences?.interface, "motion");
  const sidebarDefaultValue = effectiveInterfaceValue(draft, preferences?.interface, "sidebarDefault");
  const motionField: InterfaceFieldViewState<"system" | "reduced"> = {
    value: motionValue ?? "system",
    dirty: isFieldDirty(draft, preferences?.interface, "motion"),
    invalid: false,
    focusToken: focusTokens.motion,
    onChange: changeMotion,
    onReset: resetMotion,
  };
  const sidebarDefaultField: InterfaceFieldViewState<SidebarDefaultPreference> = {
    value: sidebarDefaultValue ?? "expanded",
    dirty: isFieldDirty(draft, preferences?.interface, "sidebarDefault"),
    invalid: false,
    focusToken: focusTokens.sidebarDefault,
    onChange: changeSidebarDefault,
    onReset: resetSidebarDefault,
  };

  return (
    <Toaster>
      <div className="flex flex-col gap-8">
        <AccountSection />
        <InterfaceSection motion={motionField} sidebarDefault={sidebarDefaultField} disabled={busy} />
        <NotificationsSection />

        {clr?.code === "CLR06" ? (
          <StateBanner
            tone="warning"
            title={t("save.staleTitle")}
            action={
              <Button size="sm" variant="outline" onClick={() => void handleReloadKeepEdits()} disabled={reloadingStale}>
                {reloadingStale ? (
                  <>
                    <Loader2Icon className="animate-spin" aria-hidden="true" />
                    {t("save.saving")}
                  </>
                ) : (
                  t("save.staleReload")
                )}
              </Button>
            }
          >
            {t("save.staleBody")}
          </StateBanner>
        ) : err ? (
          <StateBanner tone="error" title={t("save.failedTitle")}>
            {clr ? err : t("save.failedGenericBody")}
          </StateBanner>
        ) : null}

        <div className="flex items-center gap-3">
          <Button onClick={() => void handleSave()} disabled={!isDirty || busy}>
            {busy ? (
              <>
                <Loader2Icon className="animate-spin" aria-hidden="true" />
                {t("save.saving")}
              </>
            ) : (
              t("save.action")
            )}
          </Button>
        </div>
      </div>
    </Toaster>
  );
}
