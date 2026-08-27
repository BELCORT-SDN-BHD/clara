"use client";

// The settle-from-line sub-form (split out of matching-section.tsx for file-
// size discipline — the dashboard's own model-split precedent). Counterparty
// kind -> counterparty -> open items by counterparty, then settle_from_bank_
// line with the selected items' allocations. No adjustments/charge/
// attestation/control-account controls this pass — the plain settlement path
// only; see this component's own "not built" note for the rest of
// settle_from_bank_line's optional args.

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { useHydratedPart } from "@/lib/parts/hooks";
import { useReadErrKind } from "@/lib/bank/error-kind";
import { useReloadOnChange } from "@/lib/bank/reload-on-change";
import { listCounterparties } from "@/lib/bank/table-reads";
import { listOpenItemsByCounterparty } from "@/lib/bank/match-reads";
import { settleFromBankLine } from "@/lib/bank/match-doors";
import { settlementDomainFor, type CounterpartyKind } from "@/lib/bank/match-types";
import { formatMyr, parseAmountToCents } from "@/lib/bank/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ReadState } from "./read-state";
import { ActionRefusal } from "./action-refusal";

export function SettleLineForm({ clientId, lineId, onDone }: { clientId: string; lineId: string; onDone: () => void }) {
  const t = useTranslations("ClientBank.matching");
  const tc = useTranslations("ClientBank.common");

  const [kind, setKind] = useState<CounterpartyKind>("customer");
  const [counterpartyId, setCounterpartyId] = useState("");
  const [memo, setMemo] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const cpKind = useReadErrKind();
  const counterparties = useHydratedPart(
    sessionTokenAccessor,
    useCallback((s) => cpKind.wrap(() => listCounterparties(clientId, kind, { session: s })), [clientId, kind, cpKind]),
  );
  useReloadOnChange(() => void counterparties.reload(), kind);

  const itemsKind = useReadErrKind();
  const domain = settlementDomainFor(kind);
  const items = useHydratedPart(
    sessionTokenAccessor,
    useCallback(
      (s) => (counterpartyId ? itemsKind.wrap(() => listOpenItemsByCounterparty(clientId, domain, counterpartyId, { session: s })) : Promise.resolve([])),
      [clientId, domain, counterpartyId, itemsKind],
    ),
  );
  useReloadOnChange(() => void items.reload(), counterpartyId);

  async function submit() {
    setFormError(null);
    const allocations: { item_id: string; amount_cents: number }[] = [];
    for (const [itemId, raw] of Object.entries(amounts)) {
      if (!raw) continue;
      const cents = parseAmountToCents(raw);
      if (cents === null || cents <= 0) {
        setFormError(t("invalidAllocation"));
        return;
      }
      allocations.push({ item_id: itemId, amount_cents: cents });
    }
    if (allocations.length === 0) {
      setFormError(t("noAllocations"));
      return;
    }
    if (!memo.trim()) {
      setFormError(t("memoRequired"));
      return;
    }
    await items.act(
      async () => { await settleFromBankLine({ clientId, lineId, counterpartyId, allocations, memo }, { session: sessionTokenAccessor }); },
      onDone,
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-2">
      <div className="flex gap-2">
        <select
          aria-label={t("kindLabel")}
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
          value={kind}
          onChange={(e) => { setKind(e.target.value as CounterpartyKind); setCounterpartyId(""); }}
        >
          <option value="customer">{t("kindCustomer")}</option>
          <option value="vendor">{t("kindVendor")}</option>
        </select>
        <ReadState hasData={counterparties.data !== null} err={counterparties.err} errKind={cpKind.kind} isEmpty={counterparties.data?.length === 0} onRetry={() => void counterparties.reload()}>
          <select
            aria-label={t("counterpartyLabel")}
            className="h-8 flex-1 rounded-lg border border-input bg-transparent px-2 text-sm"
            value={counterpartyId}
            onChange={(e) => setCounterpartyId(e.target.value)}
          >
            <option value="">{t("selectCounterparty")}</option>
            {(counterparties.data ?? []).map((cp) => <option key={cp.id} value={cp.id}>{cp.name}</option>)}
          </select>
        </ReadState>
      </div>

      {counterpartyId && (
        <ReadState hasData={items.data !== null} err={items.err} errKind={itemsKind.kind} isEmpty={items.data?.length === 0} onRetry={() => void items.reload()}>
          <ul className="flex flex-col gap-1">
            {(items.data ?? []).map((it) => (
              <li key={it.id} className="flex items-center justify-between gap-2 text-xs">
                <span>{it.item_kind} · {it.item_date} · {formatMyr(it.outstanding_cents ?? it.amount_cents)}</span>
                <Input
                  className="h-7 w-28" inputMode="decimal" placeholder="0.00"
                  aria-label={t("allocationAmountLabel")}
                  value={amounts[it.id] ?? ""}
                  onChange={(e) => setAmounts((prev) => ({ ...prev, [it.id]: e.target.value }))}
                />
              </li>
            ))}
          </ul>
          <div className="mt-2 grid gap-1.5">
            <Label htmlFor={`memo-${lineId}`}>{t("memoLabel")}</Label>
            <Textarea id={`memo-${lineId}`} value={memo} onChange={(e) => setMemo(e.target.value)} />
          </div>
        </ReadState>
      )}

      {formError && <p role="alert" className="text-xs text-destructive">{formError}</p>}
      <ActionRefusal err={items.err} clr={items.clr} />
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={items.busy || !counterpartyId} onClick={() => void submit()}>
          {items.busy ? tc("busy") : t("settleSubmit")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>{tc("cancel")}</Button>
      </div>
    </div>
  );
}
