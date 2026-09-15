"use client";

// #654 — THE FIRM-RULE / CLIENT-EXCEPTION PAIR, on the client register (C13).
//
// WHY THE CLIENT REGISTER CANNOT SHOW THIS ON ITS OWN. `clara.list_client_knowledge`
// FILTERS a shadowed firm row out in SQL (0192:1355-1363), so a client holding its
// own value sees exactly that value and no statement that a firm-wide rule exists
// and is being overridden — nor any route to it. `clara.get_knowledge_applicability`
// is the read that answers it, per applicability, and this block renders that answer.
//
// AN EXCEPTION PAIR IS NOT THE CONFLICT FACE, and getting the two confused is the
// defect this surface exists to avoid. `knowledge-panel.tsx`'s conflict banner means
// "two live client rows of one key and nothing decides between them" — UNDECIDED. A
// pair here means the opposite: the database HAS decided, per applicability, and this
// block says which row won and why. So it renders as a muted, informational
// statement, never as a warning, and it is mounted BESIDE the conflict banner rather
// than instead of it.
//
// IT IS A SEPARATE READ, and it fails on its own. A firm rule that cannot be read
// says so and leaves the client's own record above it untouched — "named but
// currently unreadable" is a fact worth telling, exactly as the inaccessible-source
// face is (knowledge-shared.tsx's own reasoning).

import { useTranslations } from "next-intl";
import Link from "next/link";

import { StateBanner } from "@/components/common/state";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import {
  loadKnowledgeApplicability,
  type KnowledgeApplicabilityEntry,
} from "@/lib/registers/knowledge";
import { appliesWhenText, knowledgeValueText } from "./knowledge-shared";

export const FIRM_KNOWLEDGE_HREF = "/settings/knowledge";

/** The entries a human needs to be told about: the ones where a firm rule exists
 *  AND this client's own record is what governs. An entry the firm rule already
 *  wins is simply a firm row the register is showing anyway (0192 does not shadow
 *  it), and an entry with no firm rule at all is not a pair. */
export function overriddenEntries(
  entries: readonly KnowledgeApplicabilityEntry[],
): KnowledgeApplicabilityEntry[] {
  return entries.filter(
    (entry) => entry.in_force === "client_exception" && entry.firm_rule !== null,
  );
}

export function KnowledgeExceptionPair({
  clientId,
  knowledgeKey,
}: {
  clientId: string;
  knowledgeKey: string;
}) {
  const t = useTranslations("FirmKnowledge.exception");
  const read = useAsyncRead(() =>
    loadKnowledgeApplicability(clientId, knowledgeKey, { session: sessionTokenAccessor }),
  );

  if (read.loading && read.data === null) {
    return <p className="text-xs text-muted-foreground">{t("loading")}</p>;
  }
  if (read.error) {
    // NOT an empty state and NOT silence: the client's own record above is still
    // real and unaffected, and this says so rather than implying no firm rule exists.
    return (
      <StateBanner tone="neutral" className="text-xs">
        {t("unavailable")}
      </StateBanner>
    );
  }

  const entries = overriddenEntries(read.data?.applicabilities ?? []);
  if (entries.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-muted/40 p-2 text-xs text-muted-foreground">
      <span className="font-medium text-muted-foreground">{t("heading")}</span>
      {entries.map((entry) => (
        <div key={entry.applies_when_digest} className="flex flex-col gap-1">
          <span>{t("firmValue", { value: knowledgeValueText(entry.firm_rule?.value) })}</span>
          <span>
            {t("conditions", {
              conditions: appliesWhenText(entry.applies_when) ?? t("always"),
            })}
          </span>
          {/* THE SENTENCE THAT MAKES IT A PAIR RATHER THAN A SECOND ROW. */}
          <span className="text-foreground">{t("overridden")}</span>
        </div>
      ))}
      <Link className="w-fit underline underline-offset-4" href={FIRM_KNOWLEDGE_HREF}>
        {t("openRegister")}
      </Link>
    </div>
  );
}
