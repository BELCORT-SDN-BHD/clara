"use client";

// The shared item-kind fields for T2's opening-item authoring — used by both
// the "Draft opening item" dialog (opening-items-panel.tsx) and the optional
// replacement half of the "Supersede" dialog. `draft_opening_item`'s six
// non-fixed-asset kinds (`clara._draft_opening_item_core`'s own grounding,
// lib/registers/opening-item-doors.ts) each need a different field set; this
// component switches on `item.item_kind` rather than growing six sibling
// dialogs. `seed_fixed_asset` is its OWN dedicated dialog
// (opening-fixed-asset-dialog.tsx) — not this component — per the port-wave
// plan's own 1:1 door-to-affordance mapping.

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/common/native-select";
import { CentsInput } from "./staff-advance-money-input";
import { SignedAmountInput } from "./opening-signed-amount-input";
import { OpeningLinesEditor, sumOpeningLines } from "./opening-lines-editor";
import { fmtCents } from "@/lib/registers/money";
import type { OpeningItemInput, OpeningItemKind, OpeningLineInput } from "@/lib/registers/opening-types";
import type { AccountRow } from "@/lib/registers/accounts";
import type { CounterpartyRow } from "@/lib/registers/counterparty";

const LINE_KINDS: OpeningItemKind[] = ["gl_balance", "bank_uncleared"];
const AR_AP_KINDS: OpeningItemKind[] = ["ar_open_item", "ap_open_item"];
const SIGNED_AMOUNT_KINDS: OpeningItemKind[] = ["equity_net", "obe_plug"];

export function OpeningItemFields({
  idPrefix,
  item,
  onItemChange,
  lines,
  onLinesChange,
  accounts,
  counterparties,
}: {
  idPrefix: string;
  item: OpeningItemInput;
  onItemChange: (item: OpeningItemInput) => void;
  lines: OpeningLineInput[];
  onLinesChange: (lines: OpeningLineInput[]) => void;
  accounts: AccountRow[];
  counterparties: CounterpartyRow[];
}) {
  const t = useTranslations("OpeningCarryDown.itemFields");
  const tc = useTranslations("Common");
  const activeAccounts = accounts.filter((a) => a.is_active);
  const kind = item.item_kind;

  function patch(p: Partial<OpeningItemInput>) {
    onItemChange({ ...item, ...p });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-kind`}>{t("kindLabel")}</Label>
        <NativeSelect
          id={`${idPrefix}-kind`}
          value={kind}
          onChange={(e) => {
            // N4 (fix round, rev-t2): a kind switch clears `lines` — carrying
            // stale GL lines into e.g. obe_plug sends a non-null `p_lines`
            // the door refuses outright ("OBE plug lines are DB-resolved;
            // p_lines must be null", CLR10) rather than silently dropping.
            patch({ item_kind: e.target.value as OpeningItemInput["item_kind"] });
            onLinesChange([]);
          }}
        >
          <option value="gl_balance">{t("kinds.gl_balance")}</option>
          <option value="bank_uncleared">{t("kinds.bank_uncleared")}</option>
          <option value="ar_open_item">{t("kinds.ar_open_item")}</option>
          <option value="ap_open_item">{t("kinds.ap_open_item")}</option>
          <option value="equity_net">{t("kinds.equity_net")}</option>
          <option value="obe_plug">{t("kinds.obe_plug")}</option>
        </NativeSelect>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-key`}>{t("itemKeyLabel")}</Label>
        <Input id={`${idPrefix}-key`} value={item.item_key} onChange={(e) => patch({ item_key: e.target.value })} />
      </div>

      {LINE_KINDS.includes(kind) ? <OpeningLinesEditor lines={lines} onChange={onLinesChange} accounts={activeAccounts} /> : null}

      {kind === "bank_uncleared" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor={`${idPrefix}-ref`}>{t("itemRefLabel")}</Label>
            <Input id={`${idPrefix}-ref`} value={item.item_ref ?? ""} onChange={(e) => patch({ item_ref: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${idPrefix}-date`}>{t("itemDateLabel")}</Label>
            <Input id={`${idPrefix}-date`} type="date" value={item.item_date ?? ""} onChange={(e) => patch({ item_date: e.target.value })} />
          </div>
        </div>
      ) : null}

      {AR_AP_KINDS.includes(kind) ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor={`${idPrefix}-cp`}>{t("counterpartyLabel")}</Label>
            <NativeSelect id={`${idPrefix}-cp`} value={item.counterparty_id ?? ""} onChange={(e) => patch({ counterparty_id: e.target.value || null })}>
              <option value="">{t("selectCounterparty")}</option>
              {counterparties.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${idPrefix}-amount`}>{t("amountLabel")}</Label>
            <CentsInput id={`${idPrefix}-amount`} ariaLabel={t("amountLabel")} cents={item.amount_cents ?? 0} onChange={(c) => patch({ amount_cents: c })} />
          </div>
        </div>
      ) : null}

      {SIGNED_AMOUNT_KINDS.includes(kind) ? (
        <div className="grid gap-1.5">
          <Label htmlFor={`${idPrefix}-signed`}>{t("signedAmountLabel")}</Label>
          <SignedAmountInput id={`${idPrefix}-signed`} cents={item.amount_cents} onChange={(amount_cents) => patch({ amount_cents })} />
          <p className="text-xs text-muted-foreground">{t("signedAmountHint")}</p>
        </div>
      ) : null}

      {LINE_KINDS.includes(kind) ? (
        <p className="text-xs text-muted-foreground">{t("netCarried", { amount: fmtCents(sumOpeningLines(lines).netCarriedCents, tc("centsUnsafe")) })}</p>
      ) : null}
    </div>
  );
}
