import { getTranslations } from "next-intl/server";

import {
  EmailConfirmationCard,
  type ConfirmCodeState,
} from "@/components/entry/email-confirmation-card";

export async function generateMetadata() {
  const t = await getTranslations("ConfirmEmail");
  return { title: t("metaTitle") };
}

type SearchParams = Record<string, string | string[] | undefined>;

// NIT-3, fix round 2026-09-01: `remaining` and `wait` are CLIENT-CONTROLLABLE
// (this redirect's own idiom — confirmRedirect() in verify/handler.ts sets
// them, but nothing stops a hand-crafted URL from setting them to anything).
// A mailable link reading "wait 1440 minutes" or "0 attempts left" is a mild
// social-engineering surface — it renders authoritative-looking numbers this
// build never actually computed. So each is bound to the widest value the
// REAL wall could ever produce, per §3.4: C1/C2's ceiling is 5 rejected
// attempts (so `remaining` is never more than 5) inside a 15-minute window
// (so `wait` is never more than that window's own 900 seconds). A value
// outside its bound is not "clamped" to the edge — clamping would still
// render an attacker-chosen number, just capped. It falls through to the
// generic `invalid` card instead, the same way a missing/duplicated form
// field already does, because a value the real wall could never have emitted
// is exactly as untrustworthy as a missing one.
//
// RECONCILIATION OWED (fs4-pr488-review ruling, 2026-09-01, recorded in full
// at `confirmation-wall.ts`'s `ConfirmationAttemptOutcome.rejected` arm):
// `WAIT_SECONDS_MAX` assumes C1/C2's real window is 900s. The C-3 driver
// building `clara.claim_confirmation_attempt` names the actual window;
// if it differs, THIS constant must be trued to it in the same/a follow-up
// change, not left guessed.
const REMAINING_MAX = 5;
const WAIT_SECONDS_MAX = 900;

/** `null` for anything that is not a plausible, in-range integer — absent,
 *  non-numeric, negative, or above the wall's own ceiling. The caller must
 *  treat `null` as "this value came from nowhere real", never substitute a
 *  default that would still paint an unverified number. */
function boundedInt(value: string | string[] | undefined, max: number): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || String(parsed) !== value.trim() || parsed < 0 || parsed > max) {
    return null;
  }
  return parsed;
}

// N1, fix round 2026-09-01 (PR #488 Codex adversarial leg) — THE OBSERVED-
// VALUE ALLOWLIST, symmetric to `boundedInt` above: that clamp covers the
// two NUMBERS this redirect ever carries; this covers the ENUM. Named
// explicitly rather than left implicit in a switch's case labels, so the
// set this function accepts is one place, not "whatever the switch
// currently happens to match" — a future case added to `confirmRedirect`
// (`verify/handler.ts`) without a matching entry here now fails to compile,
// instead of silently falling through to `default`. This does not by
// itself authenticate a redirect (nothing on this GET is signed — that
// residual is unchanged and accepted, part 1 §3.3/W-H); it only closes the
// gap between "the switch's default happens to be safe" and "the accepted
// set is a named fact checked before any branch runs."
const KNOWN_STATUSES = ["wrong", "expired", "locked", "unavailable", "invalid"] as const;
type KnownStatus = (typeof KNOWN_STATUSES)[number];

function isKnownStatus(value: unknown): value is KnownStatus {
  return typeof value === "string" && (KNOWN_STATUSES as readonly string[]).includes(value);
}

/**
 * Only THIS BUILD's own fixed status vocabulary and its two numeric slots
 * affect the rendering — never the address (part 1 §3.3 / cell W-H). This
 * function is not handed `email`, `token`, or any other field the person
 * typed: `page.tsx` never reads one from `searchParams` at all, which is a
 * stronger property than merely ignoring it (there is nothing here to weaken
 * by accident).
 */
function confirmCodeState(query: SearchParams): ConfirmCodeState {
  if (!isKnownStatus(query.status)) return { kind: "form" };
  switch (query.status) {
    case "wrong": {
      const remaining = boundedInt(query.remaining, REMAINING_MAX);
      return remaining === null ? { kind: "invalid" } : { kind: "wrong-code", remaining };
    }
    case "expired":
      return { kind: "expired" };
    case "locked": {
      const waitSeconds = boundedInt(query.wait, WAIT_SECONDS_MAX);
      return waitSeconds === null ? { kind: "invalid" } : { kind: "locked", waitSeconds };
    }
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
}: {
  searchParams: Promise<SearchParams>;
}) {
  return <EmailConfirmationCard state={confirmCodeState(await searchParams)} />;
}
