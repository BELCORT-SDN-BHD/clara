"use client";

// #940 — THE PREPAYMENT-ACCOUNT ROSTER PANEL, beside the fixed-asset account profiles on the
// client's Registers page (the ticket's own placement: this is an ACCOUNT-ENROLMENT panel, and the
// Registers page is where this client's account enrolments live — the fixed-asset profiles above it
// and the staff-advance enrolments one tab across).
//
// WHAT IT IS FOR. `clara.create_prepayment_schedule`'s prepaid-leg wall is NEGATIVE — not a control
// account, not a bank account, not inactive, not reserved by another register — so any ordinary
// asset account passed it. A deposit, an inventory purchase or a prepaid tax could be amortised into
// expense for twelve months with every entry balanced. The POSITIVE statement "this account holds
// prepayments" is the judgement made here, by a bookkeeper, with a reason.
//
// IT READS THE RELATION DIRECTLY, exactly as `fa-account-profiles-panel.tsx` reads
// `clara.fa_account_profiles`: `clara.prepayment_account_enrolments` carries a real SELECT grant to
// `clara_authenticated` under forced RLS, so `useHydratedPart`'s `act()` re-reads the live roster
// after every enrol/retire rather than painting this component's own optimistic answer.
//
// THE DROPDOWN OFFERS WHAT THE DOOR'S POSITIVE RULE ADMITS and no more: this client's active,
// non-control ASSET accounts. It does NOT try to exclude bank-bound or register-reserved codes —
// those are the DOOR's five negative axes, answered with the estate's own reason, and a second
// client-side copy of that judgement would be a second rule that could disagree.
//
// #941 — THE SAME ROSTER, A SECOND PURPOSE. A customer's advance is recognised into revenue under
// the same positive statement, made on the same relation with `purpose = 'deferred_revenue'`, and
// migration 0308 states that arm's rule at the door: a prepayment is a prepaid ASSET released by
// credit, a customer advance a contract LIABILITY released by debit. This panel therefore reads the
// WHOLE roster rather than one arm (a panel that showed one would tell a firm no account is
// enrolled while one is), prints each row's purpose rather than inferring it from the account type,
// and carries the purpose into BOTH doors — the roster is keyed on (client, account, purpose), so a
// retire that defaulted would close a different enrolment from the row a person clicked.
//
// `FaDoorDialog` is this domain's own door-dialog mechanism (one click opens, one confirm performs
// exactly one governed call, the refusal travels into the dialog). It is reused rather than copied:
// a third copy would be a third mechanism to keep honest.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SectionHeader } from "@/components/common/section-header";
import { EmptyState, StateBanner } from "@/components/common/state";
import { NativeSelect } from "@/components/common/native-select";
import { useHydratedPart } from "@/lib/parts/hooks";
import {
  loadPrepaymentRoster, enrolPrepaymentAccount, retirePrepaymentAccount,
  type PrepaymentAccountPurpose,
} from "@/lib/registers/prepayment-accounts";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { FaDoorDialog } from "./FaDoorDialog";
import type { AccountRow } from "@/lib/registers/accounts";

export function PrepaymentAccountsPanel({
  clientId,
  accounts,
  onActed,
}: {
  clientId: string;
  accounts: AccountRow[];
  /** Fired on every SETTLED enrol/retire. Enrolling or retiring changes which recognitions the
   *  prepayment attention band offers, and that band owns its own read on another page — a caller
   *  that shows both at once passes this so the sibling re-reads. */
  onActed?: () => void;
}) {
  const t = useTranslations("PrepaymentAccounts");
  const { data: rows, loading, err, clr, busy, act: rawAct } =
    useHydratedPart(sessionTokenAccessor, (s) => loadPrepaymentRoster(s, clientId));
  const act = async (fn: () => Promise<void>): Promise<boolean> => {
    const ok = await rawAct(fn);
    onActed?.();
    return ok;
  };

  return (
    <div className="flex flex-col gap-2" data-testid="prepayment-accounts-panel">
      <SectionHeader
        level={2}
        action={<EnrolDialog clientId={clientId} accounts={accounts} busy={busy} act={act} />}
      >
        {t("heading")}
      </SectionHeader>
      <p className="text-xs text-muted-foreground">{t("subheading")}</p>
      {err ? (
        <StateBanner tone="error" code={clr ? `${clr.code}${clr.reason ? ` · ${clr.reason}` : ""}` : undefined} className="text-xs">
          {err}
        </StateBanner>
      ) : null}
      {/* `loading` gates the empty claim: without it, "nothing is enrolled" could paint while the
          first read is still in flight, and on THIS panel that sentence is load-bearing — it is
          what tells a firm no prepayment can be amortised at all. */}
      {loading ? null : !rows || rows.length === 0 ? (
        <EmptyState className="text-xs">{t("empty")}</EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-col gap-1 rounded-md border p-2" data-testid="prepayment-account-row">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="secondary">{row.account_code}</Badge>
                {/* WHICH PURPOSE THIS ENROLMENT CARRIES, in a word rather than a colour. It is the
                    row's own field, never inferred from the account's type: the purpose is the
                    judgement the door recorded, and a reader guessing it from the chart would be
                    guessing. */}
                <PurposeBadge purpose={row.purpose} />
                <span className="text-muted-foreground">
                  {t("enrolledOn", { date: String(row.enrolled_at).slice(0, 10) })}
                </span>
                <RetireDialog
                  clientId={clientId}
                  accountCode={row.account_code}
                  purpose={row.purpose}
                  busy={busy}
                  act={act}
                />
              </div>
              {/* THE REASON IS SHOWN, not stored and hidden. It is the whole audit trail a later
                  reader has for why this account was treated as a prepayment account. */}
              <p className="text-xs text-muted-foreground">
                <span className="font-medium">{t("reasonPrefix")}: </span>
                {row.reason}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** THE TWO ARMS, each in its own word. A closed set of two: an unknown purpose prints itself
 *  rather than being swallowed, because a roster row a reader cannot name is worse than an ugly
 *  one. */
function PurposeBadge({ purpose }: { purpose: string }) {
  const t = useTranslations("PrepaymentAccounts");
  const words: Record<string, string> = {
    prepayment: t("purposeBadgePrepayment"),
    deferred_revenue: t("purposeBadgeDeferredRevenue"),
  };
  return <Badge variant="outline">{words[purpose] ?? purpose}</Badge>;
}

function EnrolDialog({
  clientId,
  accounts,
  busy,
  act,
}: {
  clientId: string;
  accounts: AccountRow[];
  busy: boolean;
  act: (fn: () => Promise<void>) => Promise<boolean>;
}) {
  const t = useTranslations("PrepaymentAccounts");
  const [purpose, setPurpose] = useState<PrepaymentAccountPurpose>("prepayment");
  const [accountCode, setAccountCode] = useState("");
  const [reason, setReason] = useState("");
  // THE ONE POSITIVE RULE THE PURPOSE ADDS, as the door states it (0308 §A): a prepayment is a
  // prepaid ASSET, a customer's advance a contract LIABILITY. The five NEGATIVE axes — inactive,
  // control-class, bank-bound, register-reserved, unknown — stay the DOOR's, answered with the
  // estate's own reason; only `account_class === null` is repeated here, and only because it is
  // what keeps a receivable or a payable out of a list that offers nothing else.
  const wantedType = purpose === "deferred_revenue" ? "liability" : "asset";
  const eligibleAccounts = accounts.filter(
    (a) => a.account_type === wantedType && a.account_class === null && a.is_active);
  const ready = accountCode !== "" && reason.trim() !== "";

  return (
    <FaDoorDialog
      triggerLabel={t("enrolTrigger")}
      title={t("enrolTitle")}
      description={t("enrolDescription")}
      confirmLabel={t("enrolTrigger")}
      busy={busy}
      // THE REASON IS REQUIRED BEFORE THE DOOR IS CALLED. The door refuses a blank one by name
      // (`prepayment_account_enrolment_invalid` / `reason_missing`) and stays the backstop; asking
      // here means a person is not sent to the database to be told to type a sentence.
      confirmDisabled={!ready}
      onConfirm={() =>
        act(async () => {
          await enrolPrepaymentAccount(sessionTokenAccessor, {
            clientId, accountCode, purpose, reason,
          });
        })
      }
    >
      <div className="flex flex-col gap-2">
        {/* WHAT THIS ACCOUNT HOLDS, asked BEFORE the account: the answer decides which accounts can
            be offered at all, so asking it second would present a list that then changes under the
            person who read it. Switching it clears the chosen code for the same reason — an asset
            code left selected under "advances received" is a submit the door could only refuse. */}
        <div className="grid gap-1.5">
          <Label htmlFor="prepayment-account-purpose">{t("purposeLabel")}</Label>
          <NativeSelect
            id="prepayment-account-purpose"
            value={purpose}
            onChange={(e) => {
              setPurpose(e.target.value as PrepaymentAccountPurpose);
              setAccountCode("");
            }}
          >
            <option value="prepayment">{t("purposePrepayment")}</option>
            <option value="deferred_revenue">{t("purposeDeferredRevenue")}</option>
          </NativeSelect>
          <p className="text-xs text-muted-foreground">{t("purposeHint")}</p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="prepayment-account-code">{t("accountLabel")}</Label>
          <NativeSelect
            id="prepayment-account-code"
            value={accountCode}
            onChange={(e) => setAccountCode(e.target.value)}
          >
            <option value="">{t("accountChoose")}</option>
            {eligibleAccounts.map((a) => (
              <option key={a.account_code} value={a.account_code}>
                {a.account_code} — {a.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="prepayment-account-reason">{t("reasonLabel")}</Label>
          <Textarea
            id="prepayment-account-reason"
            value={reason}
            required
            onChange={(e) => setReason(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">{t("reasonHint")}</p>
          {reason.trim() === "" ? (
            <p className="text-xs text-muted-foreground">{t("reasonRequired")}</p>
          ) : null}
        </div>
      </div>
    </FaDoorDialog>
  );
}

function RetireDialog({
  clientId,
  accountCode,
  purpose,
  busy,
  act,
}: {
  clientId: string;
  accountCode: string;
  /** THE ROW'S OWN PURPOSE, carried into the door. The roster is keyed on
   *  (client, account, purpose), so a default here would retire a different enrolment from the one
   *  whose Retire control a person pressed — or none at all, leaving the row on screen. */
  purpose: PrepaymentAccountPurpose;
  busy: boolean;
  act: (fn: () => Promise<void>) => Promise<boolean>;
}) {
  const t = useTranslations("PrepaymentAccounts");
  return (
    <FaDoorDialog
      triggerLabel={t("retireTrigger")}
      title={t("retireTitle")}
      // THE SENTENCE THAT MATTERS MOST HERE: retiring closes the FUTURE only. A person who thought
      // it stopped a running amortisation would be wrong about the books.
      description={t("retireDescription")}
      confirmLabel={t("retireTrigger")}
      busy={busy}
      onConfirm={() =>
        act(async () => {
          await retirePrepaymentAccount(sessionTokenAccessor, { clientId, accountCode, purpose });
        })
      }
    />
  );
}
