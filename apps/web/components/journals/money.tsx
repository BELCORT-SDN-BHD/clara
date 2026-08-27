"use client";

// N9 (independent review): route currency rendering through next-intl's
// `useFormatter` instead of a hand-rolled `"RM " + toLocaleString("en-MY")`
// string (lib/journals/balance.ts's `formatCents`, still exported/tested there
// as a plain-string fallback for non-JSX contexts, but no longer the render
// path). `currencyDisplay: "narrowSymbol"` is what actually produces "RM" —
// under this app's configured locale ("en", i18n/request.ts), the default
// `currencyDisplay: "symbol"` renders "MYR" instead (verified against a live
// Intl.NumberFormat, both mechanisms exist per ECMA-402 / CLDR).

import { useFormatter } from "next-intl";

export function Money({ cents }: { cents: number | null | undefined }) {
  const format = useFormatter();
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return <>—</>;
  return <>{format.number(cents / 100, { style: "currency", currency: "MYR", currencyDisplay: "narrowSymbol" })}</>;
}
