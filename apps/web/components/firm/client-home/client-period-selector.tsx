"use client";

// #660 — THE PERIOD SELECTOR, and there is no other one in this app.
//
// IT IS SCOPED TO THE MONEY BAND, DELIBERATELY. It sits inside the financial section's own header,
// not in the page chrome, so a reader can see what it narrows: the Work band above it has no
// period axis at all (`client-work-attention.test.tsx`'s `p650.pack.no_period_axis` mounts this
// very board at `?period=…` and asserts NOTHING changes there), and a control in the page header
// would look like it narrowed the whole board.
//
// THE ADDRESS IS THE STATE. Choosing a period `router.push`es a new `?period=`; this component
// keeps no period of its own. PUSH rather than REPLACE, so Back returns the reader to the period
// they came from — which is the whole reason the address holds it.
//
// FOCUS STAYS ON THE CONTROL. A `router.push` re-renders the section beneath it; the trigger keeps
// a stable `id` and is not remounted, so the keyboard user who just changed the period is still on
// the thing they changed. `Select` is appendix D's own choice for "a moderate stable choice list
// such as period" — fourteen options, all known in advance, no search needed.

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { periodHref, periodOptions, type PeriodOption } from "@/lib/dashboard/period";

/** The one value the `Select` uses for month-to-date. `?period=` is ABSENT for it on the wire;
 *  a sentinel is needed only because a `SelectItem` cannot carry an empty value. */
export const MTD_VALUE = "mtd";

export function ClientPeriodSelector({
  clientId,
  pathname,
  search,
  value,
  options,
}: {
  clientId: string;
  pathname: string;
  search: string;
  /** The `?period=` currently in the address, or null for month-to-date. */
  value: string | null;
  /** Injected by the cells so the list is deterministic; production computes it from today MYT. */
  options?: PeriodOption[];
}) {
  const t = useTranslations("ClientFinancial");
  const router = useRouter();
  const list = options ?? periodOptions();
  const id = `client-period-${clientId}`;

  const label = (option: PeriodOption): string =>
    option.isMtd ? t("period.monthToDate", { month: monthLabel(option.month) }) : monthLabel(option.month);

  return (
    <Select
      value={value ?? MTD_VALUE}
      onValueChange={(next) => {
        router.push(periodHref(pathname, search, next === MTD_VALUE ? null : next));
      }}
    >
      <SelectTrigger id={id} size="sm" aria-label={t("period.label")} className="w-[13rem]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {list.map((option) => (
          <SelectItem key={option.value ?? MTD_VALUE} value={option.value ?? MTD_VALUE}>
            {label(option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** `2026-03` → `March 2026`. Built from the month's own first day at UTC noon so no timezone can
 *  shift it onto the neighbouring month — the value is a MONTH, never an instant. */
export function monthLabel(month: string): string {
  const parts = month.split("-");
  const year = Number(parts[0] ?? 0);
  const index = Number(parts[1] ?? 1) - 1;
  return new Intl.DateTimeFormat("en-MY", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, index, 1, 12)));
}
