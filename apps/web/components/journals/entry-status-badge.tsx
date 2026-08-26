// Pure presentational badges — no hook, no fetch, no state. `section`/`row_kind`
// are rendered VERBATIM (the conductor's steer on list_review_queue's own
// vocabulary): this component only picks a Badge COLOR per known value, it never
// invents a different label than the raw string the DB returned.

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { JournalEntryStatus } from "@/lib/journals/types";

export function EntryStatusBadge({ status }: { status: JournalEntryStatus }) {
  const t = useTranslations("JournalsWorkbench.status");
  const variant = status === "approved" ? "default" : status === "withdrawn" ? "outline" : "secondary";
  const label = status === "draft" || status === "approved" || status === "withdrawn" ? t(status) : status;
  return <Badge variant={variant}>{label}</Badge>;
}

/** `section` is the review-queue row's own field — "needs_review" | "needs_you"
 *  (or any other string a future row_kind adds); rendered verbatim, badge color
 *  only picks a tone, never a re-labeling. */
export function QueueSectionBadge({ section }: { section: string }) {
  const t = useTranslations("JournalsWorkbench.section");
  const variant = section === "needs_you" ? "destructive" : "secondary";
  const known = section === "needs_review" || section === "needs_you";
  return <Badge variant={variant}>{known ? t(section) : section}</Badge>;
}
