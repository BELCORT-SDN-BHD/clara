"use client";

// The /bank Accounts tab: the account list, open account proposals (a
// document ingest that could not bind to a known account), and the
// add_bank_account door — whose COA-binding check
// (clara._assert_bank_coa_candidate) is rendered VERBATIM on refusal, never
// guessed at locally (lib/bank/doors.ts's own header). Deactivate/reactivate
// are wired as light account-lifecycle actions; remap_bank_account_coa is a
// real, tested door (lib/bank/doors.ts) not yet wired to a control here —
// scope trim, not a missing verb.

import { useCallback, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { useHydratedPart } from "@/lib/parts/hooks";
import { useReadErrKind } from "@/lib/bank/error-kind";
import { listBankAccounts, listBankAccountProposals } from "@/lib/bank/reads";
import { addBankAccount, deactivateBankAccount, reactivateBankAccount } from "@/lib/bank/doors";
import type { BankAccountProposalRow } from "@/lib/bank/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SectionHeader } from "@/components/common/section-header";
import { ReadState } from "./read-state";
import { ActionRefusal } from "./action-refusal";

export function AccountsSection({ clientId }: { clientId: string }) {
  const t = useTranslations("ClientBank.accounts");
  const tc = useTranslations("ClientBank.common");

  const accountsKind = useReadErrKind();
  const accounts = useHydratedPart(
    sessionTokenAccessor,
    useCallback((s) => accountsKind.wrap(() => listBankAccounts(clientId, { session: s })), [clientId, accountsKind]),
  );

  const proposalsKind = useReadErrKind();
  const proposals = useHydratedPart(
    sessionTokenAccessor,
    useCallback((s) => proposalsKind.wrap(() => listBankAccountProposals(clientId, { session: s })), [clientId, proposalsKind]),
  );

  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [bankNameDisplay, setBankNameDisplay] = useState("");
  const [coaAccountCode, setCoaAccountCode] = useState("");
  const [proposalId, setProposalId] = useState<string | null>(null);

  function prefill(p: BankAccountProposalRow) {
    setBankCode(p.bank_code);
    setAccountNumber(p.account_number_normalized);
    setBankNameDisplay(p.bank_name ?? "");
    setProposalId(p.id);
  }

  async function submitAdd(e: FormEvent) {
    e.preventDefault();
    await accounts.act(
      async () => { await addBankAccount({ clientId, coaAccountCode, bankCode, accountNumber, bankNameDisplay, proposalId }, { session: sessionTokenAccessor }); },
      () => {
        setBankCode(""); setAccountNumber(""); setBankNameDisplay(""); setCoaAccountCode(""); setProposalId(null);
        void proposals.reload();
      },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <SectionHeader level={2}>{t("proposalsHeading")}</SectionHeader>
          <CardDescription>{t("proposalsDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ReadState hasData={proposals.data !== null} err={proposals.err} errKind={proposalsKind.kind} isEmpty={proposals.data?.length === 0} emptyCopy={t("emptyProposals")} onRetry={() => void proposals.reload()}>
            <ul className="flex flex-col gap-2">
              {(proposals.data ?? []).map((p) => (
                <li key={p.id} className="enter-content flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 text-sm">
                  <div>
                    <p className="font-medium text-foreground">{p.bank_name ?? p.bank_code} · {p.account_number_normalized}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.reason === "account_inactive" ? t("proposalReasonInactive", { account: p.existing_bank_account_display ?? "" }) : t("proposalReasonUnregistered")}
                    </p>
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={() => prefill(p)}>{t("useProposal")}</Button>
                </li>
              ))}
            </ul>
          </ReadState>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <SectionHeader level={2}>{t("addHeading")}</SectionHeader>
        </CardHeader>
        <CardContent>
          <form onSubmit={submitAdd} className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="bank-code">{t("bankCodeLabel")}</Label>
                <Input id="bank-code" value={bankCode} onChange={(e) => setBankCode(e.target.value)} required />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="account-number">{t("accountNumberLabel")}</Label>
                <Input id="account-number" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} required />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="bank-name-display">{t("bankNameDisplayLabel")}</Label>
                <Input id="bank-name-display" value={bankNameDisplay} onChange={(e) => setBankNameDisplay(e.target.value)} required />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="coa-account-code">{t("coaAccountCodeLabel")}</Label>
                <Input id="coa-account-code" value={coaAccountCode} onChange={(e) => setCoaAccountCode(e.target.value)} required />
              </div>
            </div>
            {proposalId && <p className="text-xs text-muted-foreground">{t("fromProposal")}</p>}
            <ActionRefusal err={accounts.err} clr={accounts.clr} />
            <Button type="submit" disabled={accounts.busy} className="self-start">
              {accounts.busy ? tc("busy") : t("addSubmit")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <SectionHeader level={2}>{t("listHeading")}</SectionHeader>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {accounts.data !== null && <ActionRefusal err={accounts.err} clr={accounts.clr} />}
          <ReadState hasData={accounts.data !== null} err={accounts.err} errKind={accountsKind.kind} isEmpty={accounts.data?.length === 0} emptyCopy={t("emptyAccounts")} onRetry={() => void accounts.reload()}>
            <ul className="flex flex-col gap-2">
              {(accounts.data ?? []).map((a) => (
                <li key={a.id} className="enter-content flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 text-sm">
                  <div>
                    <p className="font-medium text-foreground">
                      {a.bank_name_display} · {a.account_number}
                      {!a.active && <Badge variant="secondary" className="ml-2">{t("inactive")}</Badge>}
                    </p>
                    <p className="text-xs text-muted-foreground">{t("coaBinding", { coa: a.coa_account_code })}</p>
                  </div>
                  <div className="flex gap-1.5">
                    {a.active ? (
                      <Button
                        type="button" size="sm" variant="outline"
                        disabled={accounts.busy}
                        onClick={() => void accounts.act(() => deactivateBankAccount(clientId, a.id, t("defaultDeactivateReason"), { session: sessionTokenAccessor }))}
                      >
                        {t("deactivate")}
                      </Button>
                    ) : (
                      <Button
                        type="button" size="sm" variant="outline"
                        disabled={accounts.busy}
                        onClick={() => void accounts.act(() => reactivateBankAccount(clientId, a.id, { session: sessionTokenAccessor }))}
                      >
                        {t("reactivate")}
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </ReadState>
        </CardContent>
      </Card>
    </div>
  );
}
