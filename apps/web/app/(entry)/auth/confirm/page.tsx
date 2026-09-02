import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";

import {
  EmailConfirmationCard,
  type ConfirmCodeState,
} from "@/components/entry/email-confirmation-card";
import { confirmFlashCookie, parseConfirmFlash } from "./confirm-flash";

export async function generateMetadata() {
  const t = await getTranslations("ConfirmEmail");
  return { title: t("metaTitle") };
}

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Reads the raw flash cookie value, or `undefined` if absent — the ONLY
 * place this page touches `next/headers`. Injectable so the tests below
 * exercise the parsing/rendering logic without needing a real Next.js
 * cookie jar — the same DI seam idiom `verify/handler.ts` already uses for
 * its own doors (`createClient`, `claimAttempt`, `settleAttempt`).
 */
export type ReadConfirmFlash = () => Promise<string | undefined>;

async function defaultReadConfirmFlash(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(confirmFlashCookie().name)?.value;
}

/**
 * N1 CLOSED (裁-109) — this function no longer reads `status`/`remaining`/
 * `wait` from the URL at all. `query.flash` is a bare, non-authoritative
 * MARKER: its VALUE is never rendered, only compared for an exact match
 * against the cookie's own nonce (FOLD 1, `../confirm-flash.ts`). Every
 * value actually painted comes from `rawFlash`, the cookie
 * `readConfirmFlash` returned, which only this server could have set. A
 * present marker with no matching, valid cookie fails closed to `invalid`
 * — the marker's mere presence claims "a submission just happened", and
 * that claim needs corroboration it did not get.
 *
 * Only THIS BUILD's own fixed outcome vocabulary affects the rendering —
 * never the address (part 1 §3.3 / cell W-H). This function is not handed
 * `email` or `token` from anywhere: neither the URL nor the cookie carries
 * either field.
 */
function confirmCodeState(query: SearchParams, rawFlash: string | undefined): ConfirmCodeState {
  const marker = query.flash;
  const hasMarker = typeof marker === "string" && marker.length > 0;
  if (!hasMarker) return { kind: "form" };

  const flash = parseConfirmFlash(rawFlash, marker);
  if (flash === null) return { kind: "invalid" };

  switch (flash.kind) {
    case "wrong":
      return { kind: "wrong-code", remaining: flash.remaining };
    case "locked":
      return { kind: "locked", waitSeconds: flash.waitSeconds };
    case "unavailable":
      return { kind: "unavailable" };
    case "invalid":
      return { kind: "invalid" };
  }
}

/**
 * GET is paint-only. There is no auth client and no token exchange in this
 * execution root: a scanner may visit repeatedly and consume nothing. The
 * form's POST (`verify/handler.ts`) is the sole token-consuming execution
 * root.
 */
export default async function ConfirmEmailPage({
  searchParams,
  readConfirmFlash = defaultReadConfirmFlash,
}: {
  searchParams: Promise<SearchParams>;
  readConfirmFlash?: ReadConfirmFlash;
}) {
  const [query, rawFlash] = await Promise.all([searchParams, readConfirmFlash()]);
  return <EmailConfirmationCard state={confirmCodeState(query, rawFlash)} />;
}
