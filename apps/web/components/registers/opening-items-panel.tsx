"use client";

// The draft-items table (mobbin grounding takeaway 3: outstanding items are a
// TABLE, not a number alone — each row carries enough to act on it) plus the
// "Draft opening item" entry dialog (draft_opening_item, bookkeeper+, six
// non-fixed-asset kinds via opening-item-fields.tsx's shared kind switch).
// Per-row Supersede lives in opening-supersede-dialog.tsx (only offered on an
// ACTIVE item of a FINALIZED seed — the door's own precondition).

import { useState } from "react";
import { useTranslations } from "next-intl";
import { DataTableCard } from "@/components/common/data-table-card";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/common/state";
import { OpeningDoorDialog } from "./OpeningDoorDialog";
import { OpeningItemFields } from "./opening-item-fields";
import { OpeningSupersedeDialog } from "./opening-supersede-dialog";
import { draftOpeningItem } from "@/lib/registers/opening-item-doors";
import { fmtCents } from "@/lib/registers/money";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import type { OpeningItemInput, OpeningItemRow, OpeningLineInput, OpeningSeedRow } from "@/lib/registers/opening-types";
import type { AccountRow } from "@/lib/registers/accounts";
import type { CounterpartyRow } from "@/lib/registers/counterparty";

const EMPTY_ITEM: OpeningItemInput = { item_kind: "gl_balance", item_key: "", amount_cents: null, counterparty_id: null, item_ref: null, item_date: null };

export function OpeningItemsPanel({
  clientId,
  seed,
  items,
  accounts,
  counterparties,
  keyedResolutionId,
  busy,
  act,
}: {
  clientId: string;
  seed: OpeningSeedRow;
  items: OpeningItemRow[];
  accounts: AccountRow[];
  counterparties: CounterpartyRow[];
  /** The seed's own bound `client_resolutions` row id (opening.ts's
   *  `loadOpeningKeyedResolution`) — `null` on a tied seed (irrelevant there)
   *  OR an untied seed with no keyed resolution minted yet. */
  keyedResolutionId: string | null;
  busy: boolean;
  act: (fn: () => Promise<void>) => Promise<boolean>;
}) {
  const t = useTranslations("OpeningCarryDown.items");
  const tc = useTranslations("Common");
  const kindLabels: Record<string, string> = {
    gl_balance: t("kindLabels.gl_balance"),
    bank_uncleared: t("kindLabels.bank_uncleared"),
    ar_open_item: t("kindLabels.ar_open_item"),
    ap_open_item: t("kindLabels.ap_open_item"),
    fixed_asset: t("kindLabels.fixed_asset"),
    equity_net: t("kindLabels.equity_net"),
    obe_plug: t("kindLabels.obe_plug"),
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{t("heading")}</p>
        {seed.state === "open" ? (
          <DraftItemDialog clientId={clientId} seed={seed} accounts={accounts} counterparties={counterparties} keyedResolutionId={keyedResolutionId} busy={busy} act={act} />
        ) : null}
      </div>
      {items.length === 0 ? (
        <EmptyState className="text-xs">{t("empty")}</EmptyState>
      ) : (
        <DataTableCard>
          <TableHeader>
            <TableRow>
              <TableHead>{t("keyCol")}</TableHead>
              <TableHead>{t("kindCol")}</TableHead>
              <TableHead className="text-right">{t("amountCol")}</TableHead>
              <TableHead>{t("stateCol")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((i) => (
              <TableRow key={i.id}>
                <TableCell>{i.item_key}</TableCell>
                <TableCell className="text-muted-foreground">{kindLabels[i.item_kind] ?? i.item_kind}</TableCell>
                <TableCell className="text-right">{fmtCents(i.amount_cents, tc("centsUnsafe"))}</TableCell>
                <TableCell className="text-muted-foreground">{i.state === "active" ? t("stateActive") : t("stateSuperseded")}</TableCell>
                <TableCell>
                  {i.state === "active" && seed.state === "finalized" ? <OpeningSupersedeDialog item={i} busy={busy} act={act} /> : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </DataTableCard>
      )}
    </div>
  );
}

function DraftItemDialog({
  clientId,
  seed,
  accounts,
  counterparties,
  keyedResolutionId,
  busy,
  act,
}: {
  clientId: string;
  seed: OpeningSeedRow;
  accounts: AccountRow[];
  counterparties: CounterpartyRow[];
  keyedResolutionId: string | null;
  busy: boolean;
  act: (fn: () => Promise<void>) => Promise<boolean>;
}) {
  const t = useTranslations("OpeningCarryDown.items");
  const [item, setItem] = useState<OpeningItemInput>(EMPTY_ITEM);
  const [lines, setLines] = useState<OpeningLineInput[]>([]);
  const untiedAndUnresolved = !seed.tie_document_id && !keyedResolutionId;

  return (
    <OpeningDoorDialog
      triggerLabel={t("draftTrigger")}
      title={t("draftTitle")}
      description={t("draftDescription")}
      confirmLabel={t("draftTrigger")}
      busy={busy}
      confirmDisabled={!item.item_key.trim() || untiedAndUnresolved}
      onConfirm={() =>
        act(async () => {
          await draftOpeningItem(sessionTokenAccessor, {
            client: clientId,
            seed: seed.id,
            item,
            lines: lines.length > 0 ? lines : null,
            resolution: seed.tie_document_id ? null : keyedResolutionId,
            document: seed.tie_document_id,
            sha256: seed.tie_document_sha256,
          });
        }).then((ok) => {
          // F6 (fix round, rev-t2): only clear the typed fields on a REAL
          // success — `act()` resolves `false` (never rejects) on a caught
          // refusal, and the prior unconditional reset wiped what the human
          // typed at the exact moment they most needed to see it again (to
          // fix and resubmit) — the refusal banner showed, but the form
          // behind it had already gone blank.
          if (ok) {
            setItem(EMPTY_ITEM);
            setLines([]);
          }
          // CB-AE2E-004: the outcome is also what closes (or keeps) the dialog.
          return ok;
        })
      }
    >
      <OpeningItemFields idPrefix="opening-draft" item={item} onItemChange={setItem} lines={lines} onLinesChange={setLines} accounts={accounts} counterparties={counterparties} />
      {untiedAndUnresolved ? <p className="text-xs text-warning">{t("keyedResolutionRequired")}</p> : null}
    </OpeningDoorDialog>
  );
}
