"use client";

// #641 — the Work list's filter set: status facets, client (firm surface only), purpose, an
// initiated-by picker, a `[since, until)` date window and free text over the basis memo.
//
// ONE FILTER SET, TWO PRESENTATIONS, ONE SOURCE OF TRUTH. `WorkListFilterControls` renders the
// controls; `WorkListFilterBar` places them INLINE at `md` and up, and inside a Sheet below it
// (appendix D row 51: "mobile navigation, filters, and supporting object context"). The two are
// never mounted at once — `hidden md:block` / `md:hidden` on the two wrappers — because a
// duplicated control set would give the same accessible name to two elements and let a filter be
// changed from a control the person cannot see.
//
// URL-AS-TRUTH, `router.replace`, NEVER `push`. A filter change is a REFINEMENT of the current
// view, not a new place, so it must not grow the back-stack the way opening a Work's detail
// deliberately does — the same rule `components/firm/activity/activity-filters.tsx` states for the
// Activity feed and `components/registers/registers-workbench.tsx` for its `?tab=`. Paging IS a
// `push`, and that asymmetry is the point: Back out of page 3 goes to page 2, Back out of a
// narrowed list goes to wherever the person came from.
//
// A FILTER CHANGE DROPS THE CURSOR. `applyWorkListUrlState` does it centrally, for the reason its
// own header gives: a cursor fences ONE ordered result set, and carrying it into a different one
// names a page that never existed.

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { FilterIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { ClientRow } from "@/lib/firm/reads";
import { WORK_STATUS_FACETS } from "@/lib/work/work-list";
import {
  applyWorkListUrlState,
  countWorkListFilters,
  hasWorkListFilters,
  EMPTY_WORK_LIST_FILTERS,
  WORK_LIST_QUERY_MAX,
  type WorkListUrlState,
} from "@/lib/work/work-list-url-state";

/** The THREE purposes `clara.accounting_work.purpose` carries (0194's own CHECK). Rendered as a
 *  Select rather than hard-coded away because C51.2 asks the operation to be exposed under a user
 *  goal, and because the vocabulary can still grow: an unknown purpose already in the URL is
 *  preserved by `parseWorkListUrlState` and rendered verbatim here.
 *
 *  #638 · IT READ `["journal_entry"]` UNTIL NOW — true under 0178, stale since 0194, so the filter
 *  could not name two of the three values the column admits. DECISIONS §1.7 gives this vocabulary
 *  one owner so all four surfaces are corrected together. A staff expense claim is deliberately NOT
 *  a fourth value: it is admitted as `journal_entry` and identified through
 *  `clara.get_work_claim_origin` (migration 0206's header says why). */
const KNOWN_PURPOSES = ["journal_entry", "periodic_stock_adjustment", "payroll_obligation"] as const;

const ALL = "__all__";

export type WorkListFilterProps = {
  state: WorkListUrlState;
  /** Firm surface only. On `/clients/:id/work` the route pins the client, so no picker is shown
   *  and no `client` param is ever written. */
  clients?: readonly ClientRow[];
  showClient: boolean;
  /** id -> display name for the people who have initiated Work here. */
  members: ReadonlyMap<string, string>;
};

function useApply() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return (patch: Partial<WorkListUrlState>) => {
    const next = applyWorkListUrlState(searchParams, patch);
    const query = next.toString();
    router.replace(query === "" ? pathname : `${pathname}?${query}`);
  };
}

export function WorkListFilterControls({ state, clients, showClient, members }: WorkListFilterProps) {
  const t = useTranslations("WorkList");
  const apply = useApply();

  const toggleStatus = (status: string) => {
    const active = state.status.includes(status);
    const next = active ? state.status.filter((s) => s !== status) : [...state.status, status];
    // Toggling a status by hand OVERRIDES whatever saved view brought the person here — the URL
    // now says something more specific than the pill did, and leaving `view` set would light a
    // pill that no longer describes the list.
    apply({ status: next, view: null });
  };

  const memberOptions = [...members.entries()].sort((a, b) => a[1].localeCompare(b[1]));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        {showClient ? (
          <Field className="w-full sm:w-56">
            <FieldLabel htmlFor="work-filter-client">{t("filterClient")}</FieldLabel>
            <FieldContent>
              <Select
                value={state.client ?? ALL}
                onValueChange={(value) => apply({ client: value === ALL ? null : String(value), view: null })}
              >
                <SelectTrigger id="work-filter-client" className="w-full">
                  <SelectValue placeholder={t("filterClientAll")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{t("filterClientAll")}</SelectItem>
                  {(clients ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldContent>
          </Field>
        ) : null}

        <Field className="w-full sm:w-48">
          <FieldLabel htmlFor="work-filter-purpose">{t("filterPurpose")}</FieldLabel>
          <FieldContent>
            <Select
              value={state.purpose[0] ?? ALL}
              onValueChange={(value) => apply({ purpose: value === ALL ? [] : [String(value)], view: null })}
            >
              <SelectTrigger id="work-filter-purpose" className="w-full">
                <SelectValue placeholder={t("filterPurposeAll")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("filterPurposeAll")}</SelectItem>
                {KNOWN_PURPOSES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {t(`purposeLabels.${p}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldContent>
        </Field>

        <Field className="w-full sm:w-56">
          <FieldLabel htmlFor="work-filter-initiator">{t("filterInitiator")}</FieldLabel>
          <FieldContent>
            <Select
              value={state.initiator ?? ALL}
              onValueChange={(value) => apply({ initiator: value === ALL ? null : String(value), view: null })}
            >
              <SelectTrigger id="work-filter-initiator" className="w-full">
                <SelectValue placeholder={t("filterInitiatorAll")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("filterInitiatorAll")}</SelectItem>
                {memberOptions.map(([id, name]) => (
                  <SelectItem key={id} value={id}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldContent>
        </Field>

        <Field className="w-full sm:w-40">
          <FieldLabel htmlFor="work-filter-since">{t("filterSince")}</FieldLabel>
          <FieldContent>
            <Input
              id="work-filter-since"
              type="date"
              value={state.since ?? ""}
              max={state.until ?? undefined}
              onChange={(e) => apply({ since: e.target.value || null, view: null })}
            />
          </FieldContent>
        </Field>

        <Field className="w-full sm:w-40">
          <FieldLabel htmlFor="work-filter-until">{t("filterUntil")}</FieldLabel>
          <FieldContent>
            <Input
              id="work-filter-until"
              type="date"
              value={state.until ?? ""}
              min={state.since ?? undefined}
              onChange={(e) => apply({ until: e.target.value || null, view: null })}
            />
          </FieldContent>
        </Field>

        {/* FREE TEXT IS A FORM, not an onChange-per-keystroke filter. Every keystroke would be a
            `router.replace` and a governed read; a submit is one of each, and it also gives the
            control a real Enter behaviour a keyboard user expects from a search box. */}
        <form
          className="flex w-full items-end gap-2 sm:w-auto"
          onSubmit={(e) => {
            e.preventDefault();
            const value = new FormData(e.currentTarget).get("q");
            apply({ q: typeof value === "string" && value.trim() !== "" ? value.trim() : null, view: null });
          }}
        >
          <Field className="w-full sm:w-56">
            <FieldLabel htmlFor="work-filter-q">{t("filterText")}</FieldLabel>
            <FieldContent>
              {/* CAPPED WHERE IT IS TYPED, at the same 512 characters 0189 accepts for a saved
                  view's whole query string. Without it a long paste became a `?q=` that saved
                  fine and then refused the moment somebody tried to SAVE the view it produced —
                  a refusal earned three controls away from the box that caused it. */}
              <Input
                id="work-filter-q"
                name="q"
                type="search"
                maxLength={WORK_LIST_QUERY_MAX}
                defaultValue={state.q ?? ""}
                key={state.q ?? ""}
                placeholder={t("filterTextPlaceholder")}
              />
            </FieldContent>
          </Field>
          <Button type="submit" variant="outline" size="sm">
            {t("filterTextApply")}
          </Button>
        </form>
      </div>

      {/* THE STATUS FACETS ARE TOGGLES, and each one carries its own WORD — colour is never the
          only cue (C08.6). `aria-pressed` is what makes the pressed state audible as well as
          visible. */}
      <div role="group" aria-label={t("filterStatus")} className="flex flex-wrap gap-1.5">
        {WORK_STATUS_FACETS.map((status) => {
          const active = state.status.includes(status);
          return (
            <Button
              key={status}
              type="button"
              variant={active ? "default" : "outline"}
              size="sm"
              aria-pressed={active}
              onClick={() => toggleStatus(status)}
            >
              {t(`statusFacets.${status}`)}
            </Button>
          );
        })}
      </div>

      {hasWorkListFilters(state) ? (
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => apply(EMPTY_WORK_LIST_FILTERS)}
          >
            {t("filterClear")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function WorkListFilterBar(props: WorkListFilterProps) {
  const t = useTranslations("WorkList");
  // The axis count comes from the ONE place the seven axes are enumerated — this file used to
  // keep its own copy of the tuple, which is the fourth of the five hand-written copies the
  // standards review found.
  const activeCount = countWorkListFilters(props.state);

  return (
    <>
      {/* WIDE: the filters are VISIBLE, which is the journey's own word for them (B3: "list
          filters are visible and clearable"). No disclosure, no popover. */}
      <div className="hidden rounded-lg border border-border bg-card p-3 md:block">
        <WorkListFilterControls {...props} />
      </div>

      {/* NARROW: the same controls inside a Sheet. The trigger names how many filters are
          currently narrowing the list, so a person arriving on a filtered deep link can SEE that
          the list is filtered without opening anything. */}
      <div className="md:hidden">
        <Sheet>
          <SheetTrigger render={<Button type="button" variant="outline" size="sm" />}>
            <FilterIcon aria-hidden />
            {activeCount > 0 ? t("filtersNarrowWithCount", { count: activeCount }) : t("filtersNarrow")}
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>{t("filtersSheetTitle")}</SheetTitle>
              <SheetDescription>{t("filtersSheetBody")}</SheetDescription>
            </SheetHeader>
            <div className="px-4 pb-4">
              <WorkListFilterControls {...props} />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
