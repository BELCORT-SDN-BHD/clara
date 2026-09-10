"use client";

// The Activity feed's filter bar (#632) — client Select, kind-group toggle chips, since/until
// date inputs. URL-as-truth via `applyActivityUrlState` (lib/firm/activity.ts), exactly the
// `?tab=` idiom `components/registers/registers-workbench.tsx` already established: a filter
// change is `router.replace`, never `push` — it is a REFINEMENT of the current view, not a new
// place, so it must not grow the back-stack the way opening the event Sheet deliberately does.
//
// A filter change also clears `cursor` (a stale keyset cursor from the PRIOR filter set does not
// address anything meaningful under a new one) — every other param, including an open `event`
// Sheet, is left exactly as `applyActivityUrlState` leaves an unnamed field: untouched.

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ACTIVITY_KINDS, applyActivityUrlState, type ActivityKind, type ActivityUrlState } from "@/lib/firm/activity";
import type { ClientRow } from "@/lib/firm/reads";

export function ActivityFilters({
  state,
  clients,
}: {
  state: ActivityUrlState;
  clients: readonly ClientRow[];
}) {
  const t = useTranslations("Activity");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const apply = (patch: Partial<ActivityUrlState>) => {
    const next = applyActivityUrlState(searchParams, { cursor: null, ...patch });
    router.replace(`${pathname}?${next.toString()}`);
  };

  const toggleKind = (kind: ActivityKind) => {
    const active = state.kinds.includes(kind);
    const kinds = active ? state.kinds.filter((k) => k !== kind) : [...state.kinds, kind];
    apply({ kinds });
  };

  const hasFilters = state.client !== null || state.kinds.length > 0 || state.since !== null || state.until !== null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field className="w-56">
          <FieldLabel htmlFor="activity-filter-client">{t("filterClient")}</FieldLabel>
          <FieldContent>
            <Select
              value={state.client ?? "__all__"}
              onValueChange={(value) => apply({ client: value === "__all__" ? null : value })}
            >
              <SelectTrigger id="activity-filter-client" className="w-full">
                <SelectValue placeholder={t("filterClientAll")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t("filterClientAll")}</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldContent>
        </Field>

        <Field className="w-40">
          <FieldLabel htmlFor="activity-filter-since">{t("filterSince")}</FieldLabel>
          <FieldContent>
            <Input
              id="activity-filter-since"
              type="date"
              value={state.since ?? ""}
              max={state.until ?? undefined}
              onChange={(e) => apply({ since: e.target.value || null })}
            />
          </FieldContent>
        </Field>

        <Field className="w-40">
          <FieldLabel htmlFor="activity-filter-until">{t("filterUntil")}</FieldLabel>
          <FieldContent>
            <Input
              id="activity-filter-until"
              type="date"
              value={state.until ?? ""}
              min={state.since ?? undefined}
              onChange={(e) => apply({ until: e.target.value || null })}
            />
          </FieldContent>
        </Field>

        {hasFilters ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => apply({ client: null, kinds: [], since: null, until: null })}
          >
            {t("filterClear")}
          </Button>
        ) : null}
      </div>

      <div role="group" aria-label={t("filterKinds")} className="flex flex-wrap gap-1.5">
        {ACTIVITY_KINDS.map((kind) => {
          const active = state.kinds.includes(kind);
          return (
            <Button
              key={kind}
              type="button"
              variant={active ? "default" : "outline"}
              size="sm"
              aria-pressed={active}
              onClick={() => toggleKind(kind)}
            >
              {t(`kindLabels.${kind}`)}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
