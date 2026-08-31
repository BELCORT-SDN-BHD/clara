import { getTranslations } from "next-intl/server";

import {
  EmailConfirmationCard,
  type EmailConfirmationState,
} from "@/components/entry/email-confirmation-card";

export async function generateMetadata() {
  const t = await getTranslations("ConfirmEmail");
  return { title: t("metaTitle") };
}

type SearchParams = Record<string, string | string[] | undefined>;

/** Only the token hash and our own fixed status marker affect the rendering.
 * Caller-supplied `type` and `next` values are deliberately never read. */
function emailConfirmationState(query: SearchParams): EmailConfirmationState {
  if (query.status === "invalid") return { kind: "invalid" };
  const raw = query.token_hash;
  if (typeof raw !== "string" || raw.length === 0) return { kind: "missing" };
  return { kind: "ready", tokenHash: raw };
}

/**
 * GET is paint-only. In particular, there is no auth client and no token
 * exchange in this execution root: a scanner may visit twice and consume
 * nothing. The explicit button POSTs to the sibling route handler.
 */
export default async function ConfirmEmailPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return <EmailConfirmationCard state={emailConfirmationState(await searchParams)} />;
}
