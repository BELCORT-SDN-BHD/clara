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
  WORK_LIST_MAX_SAVED_VIEWS,
  WORK_LIST_QUERY_MAX,
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
  /** CONTROLLED, not read off the form at submit. The value is a piece of this component's state
   *  like every other decision it makes, which is also what lets the Save control state its own
   *  gate (`disabled` on a blank name) instead of relying on the browser's `required` to stop a
   *  submit that would otherwise reach the door with nothing in it. */
  const [viewName, setViewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  /** A cap this build can check BEFORE the write, named in words the person can act on. Kept
   *  separate from `refusal` (the door's own verbatim message) because the two are different
   *  claims: one says what THIS build knows the door would refuse, the other reports what it did. */
  const [capMessage, setCapMessage] = useState<string | null>(null);

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
    setCapMessage(null);
    try {
      const save = saveRef.current;
      if (save) await save(prefs.version, views, crypto.randomUUID());
      else await saveMyPreferences(prefs.version, { interface: { workViews: views } }, crypto.randomUUID());
      await refresh();
      setNaming(false);
      setViewName("");
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

  /**
   * 0189'S OWN TWO CAPS, IN WORDS. The door refuses both under the single field path
   * `interface.workViews` — one taxonomy, which is right for a wire contract and useless as a
   * sentence to a person: "That view could not be saved" does not say that they already hold
   * twenty, or that the filter set they are trying to keep is too long to store. Returning the
   * SENTENCE here, from the numbers 0189 actually enforces, is what makes the refusal actionable.
   *
   * IT IS NOT AN AUTHORITY, IT IS AN ECHO. The door remains the only thing that decides what is
   * stored; this saves a doomed round trip and says which rule stopped it.
   */
  const capRefusal = (): string | null => {
    if (saved.length >= WORK_LIST_MAX_SAVED_VIEWS) {
      return t("saveViewTooMany", { max: WORK_LIST_MAX_SAVED_VIEWS });
    }
    if (currentQuery.length > WORK_LIST_QUERY_MAX) {
      return t("saveViewQueryTooLong", { max: WORK_LIST_QUERY_MAX });
    }
    return null;
  };

  return (
    <div className="flex flex-col gap-2">
      <NavPills label={t("viewsLabel")} items={items} />

      {canSave || saved.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {canSave ? (
            // THE CAP IS CHECKED WHERE THE PERSON PRESSES, not three keystrokes later. Opening a
            // naming form for a view that cannot be stored would ask somebody to name something
            // and then refuse it.
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                const cap = capRefusal();
                setCapMessage(cap);
                if (cap !== null) return;
                setViewName("");
                setNaming((v) => !v);
              }}
            >
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
            const name = viewName.trim();
            if (name === "") return;
            // THE SAME TWO CAPS AGAIN, and not as a copy: `saved` is re-read from preferences on
            // every write, so a second tab that filled the twentieth slot while this form was open
            // must stop this save too rather than spend a round trip learning it.
            const cap = capRefusal();
            if (cap !== null) {
              setCapMessage(cap);
              return;
            }
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
              <Input
                id="work-save-view-name"
                name="name"
                maxLength={64}
                required
                value={viewName}
                onChange={(e) => setViewName(e.target.value)}
              />
            </FieldContent>
          </Field>
          <Button type="submit" size="sm" disabled={busy || viewName.trim() === ""}>
            {busy ? t("savingView") : t("saveViewSubmit")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setNaming(false);
              setViewName("");
            }}
          >
            {t("saveViewCancel")}
          </Button>
        </form>
      ) : null}

      {/* THE CAP SPEAKS FOR ITSELF — no `code`, because nothing refused: this build declined to
          ask. The door's own refusal keeps its verbatim message in the banner below. */}
      {capMessage !== null ? (
        <StateBanner tone="warning">{capMessage}</StateBanner>
      ) : null}

      {refusal !== null ? (
        <StateBanner tone="error" code={refusal}>
          {t("saveViewFailed")}
        </StateBanner>
      ) : null}
    </div>
  );
}
