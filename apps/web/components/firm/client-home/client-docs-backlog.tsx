"use client";

// SECTION D — documents and coding backlog. Four counts, each a LINK to the tab that owns the
// work. QuickBooks' "linked count list", not Xero's inline act: attribution is confirmed on the
// documents tab, a lint finding is fixed on the journals workbench, and neither verb belongs on
// a summary board.
//
// FOUR INDEPENDENT READS, FOUR INDEPENDENT FAILURES. Each count renders its own state, so one
// read failing leaves the other three real numbers on screen. A single combined `Promise.all`
// would have made any one failure blank all four — which reads as "this client has no backlog",
// the most expensive possible way to be wrong on this page.
//
// DE-DUPLICATED AGAINST THE NEEDS-YOU SECTION ABOVE, IN WORDS RATHER THAN IN ARITHMETIC. Three
// of these four populations also drive `counts.open_tasks` / `counts.lint_findings` /
// `counts.open_questions` in section C's chips. Subtracting one from the other would be this
// build computing a figure the DB never stated; instead the two sections say WHICH question
// they answer — C is "what is waiting on a person", D is "what is in the pipeline" — and the
// section note names the overlap so a reader does not add the numbers together.
//
// EVERY COUNT IS A ROWS.LENGTH OVER AN UNPAGINATED READ. `listOpenCandidatesForClient`,
// `listUncodedFilings`, `listOpenCodingTasks` and `listOpenLintFindings` each return the whole
// filtered population for one client with no limit, so the length IS the count. Stated because
// the sibling needs-you section on this same page must NOT do this — its envelope is paged.

import Link from "next/link";
import { useTranslations } from "next-intl";

import { SectionHeader } from "@/components/common/section-header";
import { listOpenCodingTasks, listOpenLintFindings, listUncodedFilings } from "@/lib/coding/reads";
import { listOpenCandidatesForClient } from "@/lib/documents/reads";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { ErrorMessage } from "../data-state";

function CountRow({
  loading,
  error,
  count,
  href,
  label,
}: {
  loading: boolean;
  error: unknown;
  count: number;
  href: string;
  /** The full noun phrase — "3 filings awaiting attribution", never the bare number. The
   *  accessible name of the link IS this sentence (spec's a11y note). */
  label: string;
}) {
  const t = useTranslations("Common");
  if (error) return <li><ErrorMessage error={error} /></li>;
  if (loading) return <li className="text-muted-foreground">{t("loading")}</li>;
  if (count === 0) return null;
  return (
    <li>
      <Link href={href} className="text-primary underline-offset-4 hover:underline">
        {label}
      </Link>
    </li>
  );
}

export function ClientDocsBacklog({ clientId }: { clientId: string }) {
  const t = useTranslations("ClientWorkspace");
  const opts = { session: sessionTokenAccessor };

  const candidates = useAsyncRead(() => listOpenCandidatesForClient(clientId, opts));
  const uncoded = useAsyncRead(() => listUncodedFilings(clientId, opts));
  const tasks = useAsyncRead(() => listOpenCodingTasks(clientId, opts));
  const findings = useAsyncRead(() => listOpenLintFindings(clientId, opts));

  const documentsHref = `/clients/${clientId}/documents`;
  const journalsHref = `/clients/${clientId}/journals`;

  const settled = [candidates, uncoded, tasks, findings].every((r) => !r.loading && !r.error);
  const allZero =
    settled &&
    (candidates.data?.length ?? 0) === 0 &&
    (uncoded.data?.length ?? 0) === 0 &&
    (tasks.data?.length ?? 0) === 0 &&
    (findings.data?.length ?? 0) === 0;

  return (
    <section aria-labelledby="client-home-docs" className="flex flex-col gap-2">
      <SectionHeader level={2}>
        <span id="client-home-docs">{t("docsHeading")}</span>
      </SectionHeader>
      {allZero ? (
        <p className="enter-content text-sm text-muted-foreground">{t("docsEmpty")}</p>
      ) : (
        <ul className="enter-content flex flex-col gap-1 text-sm">
          <CountRow
            loading={candidates.loading}
            error={candidates.error}
            count={candidates.data?.length ?? 0}
            href={documentsHref}
            label={t("docsAwaitingAttribution", { n: candidates.data?.length ?? 0 })}
          />
          <CountRow
            loading={uncoded.loading}
            error={uncoded.error}
            count={uncoded.data?.length ?? 0}
            href={documentsHref}
            label={t("docsUncoded", { n: uncoded.data?.length ?? 0 })}
          />
          <CountRow
            loading={tasks.loading}
            error={tasks.error}
            count={tasks.data?.length ?? 0}
            href={documentsHref}
            label={t("docsCodingTasks", { n: tasks.data?.length ?? 0 })}
          />
          <CountRow
            loading={findings.loading}
            error={findings.error}
            count={findings.data?.length ?? 0}
            href={journalsHref}
            label={t("docsLintFindings", { n: findings.data?.length ?? 0 })}
          />
        </ul>
      )}
      <p className="text-xs text-muted-foreground">{t("docsOverlapNote")}</p>
    </section>
  );
}
