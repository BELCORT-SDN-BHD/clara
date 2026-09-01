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

const WAIT_SECONDS_DEFAULT = 900; // §3.4 C1/C2's own 15-minute window, as a floor
                                   // when the query carries no (or a malformed) value.
const REMAINING_DEFAULT = 0;

function positiveInt(value: string | string[] | undefined, fallback: number): number {
  if (typeof value !== "string") return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
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
  switch (query.status) {
    case "wrong":
      return { kind: "wrong-code", remaining: positiveInt(query.remaining, REMAINING_DEFAULT) };
    case "expired":
      return { kind: "expired" };
    case "locked":
      return { kind: "locked", waitSeconds: positiveInt(query.wait, WAIT_SECONDS_DEFAULT) };
    case "unavailable":
      return { kind: "unavailable" };
    case "invalid":
      return { kind: "invalid" };
    default:
      return { kind: "form" };
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
