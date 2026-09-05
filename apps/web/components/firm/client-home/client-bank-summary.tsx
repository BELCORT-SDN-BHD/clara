"use client";

// SECTION E — bank. Each account with its LATEST STATEMENT, plus how many account proposals are
// pending.
//
// THE LABEL IS "LATEST STATEMENT PER ACCOUNT", AND IT IS NEVER "COVERAGE". No read in this app
// computes a period gap: `getBankReconciliation` (lib/bank/recon-reads.ts:15) is per-account and
// per-period, and nothing aggregates across periods. "Coverage" would promise that the months
// between statements have been checked. They have not been, by anything.
//
// THE N+1 IS BOUNDED BY THE ACCOUNTS THE DB ACTUALLY RETURNED. `list_bank_statements` takes
// (p_client, p_bank_account), so one call per account is the only shape the contract offers. The
// fan-out is over a list the previous read produced — never over a range this build guessed —
// and a single account's statement read failing leaves that ONE row honest about itself while
// the others still print.
//
// NO ACT HERE. Recording a statement, approving a proposal and matching lines all live on the
// bank tab behind their own governed doors. This is a state summary with one link.

import Link from "next/link";
import { useTranslations } from "next-intl";

import { SectionHeader } from "@/components/common/section-header";
import { listBankAccountProposals, listBankAccounts, listBankStatements } from "@/lib/bank/reads";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { DataState, ErrorMessage } from "../data-state";

type AccountLine = {
  id: string;
  display: string;
  /** The newest statement's `period_end`, or `null` when the account has none. `null` is a real
   *  answer — "no statement recorded" — and is never rendered as a blank cell. */
  latestPeriodEnd: string | null;
  /** True when THIS account's statement read failed. The row then says so instead of claiming
   *  the account has no statement: absence of a read is not absence of a statement. */
  unreadable: boolean;
};

export function ClientBankSummary({ clientId }: { clientId: string }) {
  const t = useTranslations("ClientWorkspace");
  const opts = { session: sessionTokenAccessor };

  const accounts = useAsyncRead<AccountLine[]>(async () => {
    const rows = await listBankAccounts(clientId, opts);
    return Promise.all(
      rows.map(async (account): Promise<AccountLine> => {
        const display = `${account.bank_name_display} ${account.account_number}`.trim();
        try {
          const statements = await listBankStatements(clientId, account.id, opts);
          // `period_end` is `not null` on the statement row, so the newest is a plain max over
          // the returned page — no date is composed here, only chosen.
          const latest = statements.reduce<string | null>(
            (best, row) => (best === null || row.period_end > best ? row.period_end : best),
            null,
          );
          return { id: account.id, display, latestPeriodEnd: latest, unreadable: false };
        } catch {
          return { id: account.id, display, latestPeriodEnd: null, unreadable: true };
        }
      }),
    );
  });

  const proposals = useAsyncRead(() => listBankAccountProposals(clientId, opts));
  const rows = accounts.data ?? [];

  return (
    <section aria-labelledby="client-home-bank" className="flex flex-col gap-2">
      <SectionHeader level={2}>
        <span id="client-home-bank">{t("bankHeading")}</span>
      </SectionHeader>
      <DataState
        loading={accounts.loading}
        error={accounts.error}
        isEmpty={rows.length === 0}
        emptyMessage={t("bankEmpty")}
      >
        <dl className="enter-content grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
          {rows.map((row) => (
            <div key={row.id} className="contents">
              <dt className="text-card-foreground">{row.display}</dt>
              <dd className="text-right text-xs text-muted-foreground">
                {row.unreadable
                  ? t("bankStatementUnreadable")
                  : row.latestPeriodEnd === null
                    ? t("bankNoStatement")
                    : t("bankLatestStatement", { period: row.latestPeriodEnd })}
              </dd>
            </div>
          ))}
        </dl>
      </DataState>
      {proposals.error ? <ErrorMessage error={proposals.error} /> : null}
      {(proposals.data?.length ?? 0) > 0 ? (
        <p className="text-xs text-muted-foreground">
          {t("bankProposals", { n: proposals.data?.length ?? 0 })}
        </p>
      ) : null}
      <Link
        href={`/clients/${clientId}/bank`}
        className="text-xs text-primary underline-offset-4 hover:underline"
      >
        {t("bankOpenTab")}
      </Link>
    </section>
  );
}
