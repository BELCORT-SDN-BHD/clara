"use client";

// The KEYED path panel — shown only for an UNTIED seed (no `tie_document_id`):
// record_opening_keyed_resolution (THE HUMAN KEYED DOOR, always open per
// fa7b-gate-record.md's own ratified clarification) plus record_opening_target
// (one TB target line at a time — the door's own per-line XOR-amount
// contract). Both are bookkeeper+.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/common/native-select";
import { MoneyInput } from "@/components/common/money-input";
import { OpeningDoorDialog } from "./OpeningDoorDialog";
import { EmptyState } from "@/components/common/state";
import { DataTableCard } from "@/components/common/data-table-card";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { recordOpeningKeyedResolution } from "@/lib/registers/opening-item-doors";
import { recordOpeningTarget } from "@/lib/registers/opening-item-doors";
import { fmtCents } from "@/lib/registers/money";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import type { OpeningSeedRow, OpeningTbTargetRow } from "@/lib/registers/opening-types";
import type { AccountRow } from "@/lib/registers/accounts";

export function OpeningTargetKeyedPanel({
  clientId,
  seed,
  targets,
  keyedResolutionId,
  accounts,
  busy,
  act,
}: {
  clientId: string;
  seed: OpeningSeedRow;
  targets: OpeningTbTargetRow[];
  keyedResolutionId: string | null;
  accounts: AccountRow[];
  busy: boolean;
  act: (fn: () => Promise<void>) => Promise<boolean>;
}) {
  const t = useTranslations("OpeningCarryDown.keyed");
  const tc = useTranslations("Common");

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{keyedResolutionId ? t("resolutionBound") : t("resolutionMissing")}</p>
        {seed.state === "open" ? <KeyedResolutionDialog clientId={clientId} seed={seed} busy={busy} act={act} /> : null}
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{t("targetsHeading")}</p>
        {/* F8 (fix round, rev-t2): `record_opening_target` carries NO
            resolution precondition at all (its live body asserts bookkeeper+,
            in-firm, state='open', untied, debit/credit XOR — nothing about a
            bound resolution); the trigger used to be hidden on
            `keyedResolutionId`, a precondition this door does not have.
            Render-and-shape: the trigger is always reachable on an open,
            untied seed — the door is still the wall for anything it DOES
            require. */}
        {seed.state === "open" ? <TargetDialog seed={seed} accounts={accounts} busy={busy} act={act} /> : null}
      </div>
      {targets.length === 0 ? (
        <EmptyState className="text-xs">{t("targetsEmpty")}</EmptyState>
      ) : (
        <DataTableCard>
          <TableHeader>
            <TableRow>
              <TableHead>{t("lineKeyCol")}</TableHead>
              <TableHead>{t("accountCol")}</TableHead>
              <TableHead className="text-right">{t("debitCol")}</TableHead>
              <TableHead className="text-right">{t("creditCol")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {targets.map((tg) => (
              <TableRow key={tg.id}>
                <TableCell>{tg.line_key}</TableCell>
                <TableCell className="text-muted-foreground">{tg.account_code ?? "—"}</TableCell>
                <TableCell className="text-right">{fmtCents(tg.debit_cents, tc("centsUnsafe"))}</TableCell>
                <TableCell className="text-right">{fmtCents(tg.credit_cents, tc("centsUnsafe"))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </DataTableCard>
      )}
    </div>
  );
}

function KeyedResolutionDialog({ clientId, seed, busy, act }: { clientId: string; seed: OpeningSeedRow; busy: boolean; act: (fn: () => Promise<void>) => Promise<boolean> }) {
  const t = useTranslations("OpeningCarryDown.keyed");
  const [note, setNote] = useState("");

  return (
    <OpeningDoorDialog
      triggerLabel={t("mintResolutionTrigger")}
      title={t("mintResolutionTitle")}
      description={t("mintResolutionDescription")}
      confirmLabel={t("mintResolutionTrigger")}
      busy={busy}
      onConfirm={async () => { await act(async () => { await recordOpeningKeyedResolution(sessionTokenAccessor, { client: clientId, seed: seed.id, note }); }); }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="opening-keyed-note">{t("noteLabel")}</Label>
        <Textarea id="opening-keyed-note" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </OpeningDoorDialog>
  );
}

function TargetDialog({ seed, accounts, busy, act }: { seed: OpeningSeedRow; accounts: AccountRow[]; busy: boolean; act: (fn: () => Promise<void>) => Promise<boolean> }) {
  const t = useTranslations("OpeningCarryDown.keyed");
  const [lineKey, setLineKey] = useState("");
  const [accountCode, setAccountCode] = useState("");
  const [debit, setDebit] = useState(0);
  const [credit, setCredit] = useState(0);
  const activeAccounts = accounts.filter((a) => a.is_active);
  const xorValid = (debit > 0) !== (credit > 0);

  return (
    <OpeningDoorDialog
      triggerLabel={t("addTargetTrigger")}
      title={t("addTargetTitle")}
      description={t("addTargetDescription")}
      confirmLabel={t("addTargetTrigger")}
      busy={busy}
      confirmDisabled={!lineKey.trim() || !xorValid}
      onConfirm={() =>
        act(async () => {
          await recordOpeningTarget(sessionTokenAccessor, { seed: seed.id, lineKey: lineKey.trim(), accountCode, sourceLabel: lineKey.trim(), debitCents: debit, creditCents: credit });
        }).then((ok) => {
          // F6 (fix round, rev-t2): only clear on a real success — see
          // opening-items-panel.tsx's own DraftItemDialog note.
          if (ok) { setLineKey(""); setDebit(0); setCredit(0); }
        })
      }
    >
      <div className="flex flex-col gap-2">
        <div className="grid gap-1.5">
          <Label htmlFor="opening-target-key">{t("lineKeyLabel")}</Label>
          <Input id="opening-target-key" value={lineKey} onChange={(e) => setLineKey(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="opening-target-account">{t("accountCol")}</Label>
          <NativeSelect id="opening-target-account" value={accountCode} onChange={(e) => setAccountCode(e.target.value)}>
            <option value="">—</option>
            {activeAccounts.map((a) => (
              <option key={a.account_code} value={a.account_code}>{a.account_code} — {a.name}</option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="opening-target-debit">{t("debitCol")}</Label>
            <MoneyInput id="opening-target-debit" aria-label={t("debitCol")} cents={debit} mode="unsigned" onValueChange={(change) => {
              if (change.ok) {
                const cents = change.cents ?? 0;
                setDebit(cents);
                if (cents > 0) setCredit(0);
              }
            }} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="opening-target-credit">{t("creditCol")}</Label>
            <MoneyInput id="opening-target-credit" aria-label={t("creditCol")} cents={credit} mode="unsigned" onValueChange={(change) => {
              if (change.ok) {
                const cents = change.cents ?? 0;
                setCredit(cents);
                if (cents > 0) setDebit(0);
              }
            }} />
          </div>
        </div>
      </div>
    </OpeningDoorDialog>
  );
}
