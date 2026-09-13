"use client";

// #641 — SAVED VIEWS on the Work list: the two built-in ones this product ships, plus the
// caller's own, stored in `clara.user_preferences.interface.workViews` (0189).
//
// "NEEDS YOU" IS PRESERVED EXACTLY AS #614 MINTED IT — the address
// (`/work?view=needs-you`, `WORK_NEEDS_YOU_VIEW`), the strip's accessible name ("Saved views"),
// and the markup contract: pills are LINKS carrying `aria-current="page"`, through the same
// `NavPills` piece the settings nav uses. Each view is a distinct URL, so selecting one is a real
// navigation and a link is what it owes (that component's own header argues the case against
// tabs). `shell-migration-walk.spec.ts` pins exactly that shape.
//
// A SAVED VIEW IS A QUERY STRING, NOT A RESULT SET. It stores the FILTERS (`workListStateQuery`),
// never a cursor — see that function's own note: a view that remembered page 4 of a result set
// which has since changed would open on a fence into nothing.
//
// THE ACTIVE PILL IS DERIVED, NOT REMEMBERED. Two states are compared by their canonical query
// string, so a view stays lit while the URL still says what the view says, and goes dark the
// moment a filter is changed by hand — rather than staying lit because `?view=` is still in the
// address of a list it no longer describes.
//
// THE MANAGE CONTROLS ARE SIBLINGS OF THE STRIP, NOT CHILDREN OF A PILL. A delete button nested
// inside an anchor is invalid markup and an ambiguous click target; "Save this view" and the
// per-view "Remove" buttons therefore sit in their own row below, where they are ordinary
// keyboard-reachable buttons.
//
// HYDRATE-NEVER-TRUST ON THE WRITE. `saveMyPreferences` returns a report of what the database
// did; this component re-reads rather than painting that report as new truth, which is also what
// makes the CLR06 stale-version path recoverable: the next read carries the current version.

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { NavPills } from "@/components/common/nav-pills";
import { StateBanner } from "@/components/common/state";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { isDoorRefusal } from "@/lib/doors";
import { WORK_NEEDS_YOU_VIEW } from "@/lib/navigation/tree";
import {
  getMyPreferences,
  saveMyPreferences,
  type MyPreferences,
  type WorkSavedView,
} from "@/lib/settings/preferences";
import {
  hasWorkListFilters,
  workListStateQuery,
  type WorkListUrlState,
} from "@/lib/work/work-list-url-state";

/** The product's own views: the unfiltered list, and #614's attention view. */
const NEEDS_YOU_QUERY = "status=awaiting_input";

export function WorkSavedViews({
  state,
  /** Injected by the cells; production reads the preferences door. */
  loadPreferences,
  savePreferences,
}: {
  state: WorkListUrlState;
  loadPreferences?: () => Promise<MyPreferences>;
  savePreferences?: (version: number, views: WorkSavedView[], opKey: string) => Promise<MyPreferences>;
}) {
  const t = useTranslations("WorkList");
  const pathname = usePathname();

  const [prefs, setPrefs] = useState<MyPreferences | null>(null);
  const [naming, setNaming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  const loadRef = useRef(loadPreferences);
  loadRef.current = loadPreferences;
  const saveRef = useRef(savePreferences);
  saveRef.current = savePreferences;

  // The #746 ref pattern: the loader is read through a ref so a state update never re-arms it,
  // and this effect runs exactly once per mount.
  const refresh = useCallback(async () => {
    try {
      const loader = loadRef.current;
      setPrefs(loader ? await loader() : await getMyPreferences());
    } catch {
      // A preferences read that fails costs the person their SAVED views, not the list: the
      // built-in pills still render and the list itself is unaffected. A banner over a working
      // list would be louder than the fact.
      setPrefs(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saved = prefs?.interface.workViews ?? [];
  const currentQuery = workListStateQuery(state);
  const currentIsSaved = saved.some((v) => v.query === currentQuery);
  const currentIsBuiltIn = currentQuery === "" || currentQuery === NEEDS_YOU_QUERY;

  /** A view's own address on THIS surface — the client list keeps its own path, so a saved view
   *  works identically at both altitudes without storing a path it would then have to migrate. */
  const hrefFor = (query: string, viewId: string | null): string => {
    const params = new URLSearchParams(query);
    if (viewId !== null) params.set("view", viewId);
    const qs = params.toString();
    return qs === "" ? pathname : `${pathname}?${qs}`;
  };

  const persist = async (views: WorkSavedView[]) => {
    if (prefs === null) return;
    setBusy(true);
    setRefusal(null);
    try {
      const save = saveRef.current;
      if (save) await save(prefs.version, views, crypto.randomUUID());
      else await saveMyPreferences(prefs.version, { interface: { workViews: views } }, crypto.randomUUID());
      await refresh();
      setNaming(false);
    } catch (error) {
      // The door's own refusal, verbatim — never re-worded (lib/doors.ts's rule). CLR06 means a
      // second tab saved first; the re-read below is what makes the next attempt succeed.
      setRefusal(isDoorRefusal(error) ? error.message : t("saveViewFailed"));
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const items = [
    { key: "__all__", href: hrefFor("", null), label: t("viewAll"), current: currentQuery === "" },
    {
      key: WORK_NEEDS_YOU_VIEW,
      href: hrefFor(NEEDS_YOU_QUERY, WORK_NEEDS_YOU_VIEW),
      label: t("viewNeedsYou"),
      current: currentQuery === NEEDS_YOU_QUERY,
    },
    ...saved.map((view) => ({
      key: view.id,
      href: hrefFor(view.query, view.id),
      label: view.name,
      current: view.query === currentQuery,
    })),
  ];

  // Offered only where it would MEAN something: there are filters to save, and this exact filter
  // set is not already a view (built-in or saved). A control that could only duplicate what is
  // already there is not an affordance.
  const canSave = prefs !== null && hasWorkListFilters(state) && !currentIsSaved && !currentIsBuiltIn;

  return (
    <div className="flex flex-col gap-2">
      <NavPills label={t("viewsLabel")} items={items} />

      {canSave || saved.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {canSave ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => setNaming((v) => !v)}>
              {t("saveView")}
            </Button>
          ) : null}
          {saved.map((view) => (
            <Button
              key={view.id}
              type="button"
              size="xs"
              variant="ghost"
              disabled={busy}
              onClick={() => void persist(saved.filter((v) => v.id !== view.id))}
            >
              {t("deleteViewLabel", { name: view.name })}
            </Button>
          ))}
        </div>
      ) : null}

      {naming ? (
        <form
          className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-3"
          onSubmit={(e) => {
            e.preventDefault();
            const raw = new FormData(e.currentTarget).get("name");
            const name = typeof raw === "string" ? raw.trim() : "";
            if (name === "") return;
            // The id is derived from the NAME and de-duplicated against the existing set: 0189
            // refuses duplicate ids outright, and a person naming two views the same thing should
            // get two views rather than a refusal they did not cause.
            const base =
              name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "view";
            let id = base;
            let n = 2;
            while (saved.some((v) => v.id === id)) id = `${base}-${n++}`;
            void persist([...saved, { id, name: name.slice(0, 64), query: currentQuery }]);
          }}
        >
          <Field className="w-full sm:w-64">
            <FieldLabel htmlFor="work-save-view-name">{t("saveViewName")}</FieldLabel>
            <FieldContent>
              <Input id="work-save-view-name" name="name" maxLength={64} required />
            </FieldContent>
          </Field>
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? t("savingView") : t("saveViewSubmit")}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setNaming(false)}>
            {t("saveViewCancel")}
          </Button>
        </form>
      ) : null}

      {refusal !== null ? (
        <StateBanner tone="error" code={refusal}>
          {t("saveViewFailed")}
        </StateBanner>
      ) : null}
    </div>
  );
}
