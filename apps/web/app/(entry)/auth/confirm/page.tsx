import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";

import {
  EmailConfirmationCard,
  type ConfirmCodeState,
} from "@/components/entry/email-confirmation-card";
import {
  confirmFlashCookie,
  parseConfirmFlash,
  type ConfirmFlashPayload,
} from "./confirm-flash";

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
 * Only THIS BUILD's own fixed outcome vocabulary affects the RENDERING — never
 * the address (part 1 §3.3 / cell W-H). The URL still carries neither `email`
 * nor `token`, and no code ever crosses this boundary at all. What the cookie
 * may now carry (#621) is the address THIS BROWSER's own POST just submitted,
 * echoed back so the redirect does not empty the field the person filled in;
 * it chooses no card and changes no outcome, and `ConfirmFlashPayload`'s own
 * note records why an unforgeable same-origin cookie honours the W-H wall
 * where a query parameter would break it.
 */
function confirmCodeState(flash: ConfirmFlashPayload | null, hasMarker: boolean): ConfirmCodeState {
  if (!hasMarker) return { kind: "form" };
  if (flash === null) return { kind: "invalid" };

  switch (flash.kind) {
    case "wrong":
      return { kind: "wrong-code", remaining: flash.remaining };
    case "locked":
      return flash.atLeast === true
        ? { kind: "locked", waitSeconds: flash.waitSeconds, atLeast: true }
        : { kind: "locked", waitSeconds: flash.waitSeconds };
    case "unavailable":
      return { kind: "unavailable" };
    case "invalid":
      return { kind: "invalid" };
    // The resend POST's own five (#621). They travel the identical cookie and
    // are read the identical way; only the card they choose differs.
    case "resent":
      return { kind: "resent" };
    case "resend-locked":
      return { kind: "resend-locked", waitSeconds: flash.waitSeconds, atLeast: flash.atLeast };
    case "resend-rate-limited":
      return { kind: "resend-rate-limited", waitSeconds: flash.waitSeconds, atLeast: flash.atLeast };
    case "resend-invalid-email":
      return { kind: "resend-invalid-email" };
    case "resend-unavailable":
      return { kind: "resend-unavailable" };
  }
}

/** The flash's echoed address, or null. NOT exported: an App Router page may
 *  export only its route symbols (the reason `signup-route.tsx` exists one
 *  directory over), so this stays local and is driven through the page itself. */
function confirmPrefillEmail(flash: ConfirmFlashPayload | null): string | null {
  return flash?.email ?? null;
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
  const marker = query.flash;
  const hasMarker = typeof marker === "string" && marker.length > 0;
  const flash = hasMarker ? parseConfirmFlash(rawFlash, marker) : null;
  return (
    <EmailConfirmationCard
      state={confirmCodeState(flash, hasMarker)}
      prefillEmail={confirmPrefillEmail(flash)}
    />
  );
}
