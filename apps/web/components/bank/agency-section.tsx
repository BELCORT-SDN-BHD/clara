"use client";

// The /bank Agent tab: the agency-hold toggle (F-A3 Annex D — a brake on the
// bank agent lane, per client) and open identifier-promotion proposals with
// the confirm door — bank_account-kind only; its typed refusals
// (identifier_kind_out_of_scope, promotion_target_ambiguous,
// promotion_target_unavailable) render VERBATIM via ActionRefusal, never
// re-worded.

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { useHydratedPart } from "@/lib/parts/hooks";
import { useReadErrKind } from "@/lib/bank/error-kind";
import { getBankAgencyHold, listOpenBankIdentifierPromotionProposals } from "@/lib/bank/table-reads";
import { setBankAgencyHold, confirmBankIdentifierPromotion } from "@/lib/bank/agency-doors";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ReadState } from "./read-state";
import { ActionRefusal } from "./action-refusal";

export function AgencySection({ clientId }: { clientId: string }) {
  const t = useTranslations("ClientBank.agency");
  const tc = useTranslations("ClientBank.common");

  // getBankAgencyHold legitimately resolves null ON SUCCESS ("never held" —
  // the common case for most clients), unlike an array read where
  // null-vs-[] means loading-vs-loaded. `holdLoadedOnce` flips true only on
  // a SUCCESSFUL resolution and then stays true (mirroring how an array
  // read's `data` never reverts to null once loaded) — so a LATER write
  // failure (setBankAgencyHold refusing) still shows the badge + form
  // (via ActionRefusal, not by hiding everything), the same
  // read-vs-write-error distinction ReadState draws for every array read.
  const [holdLoadedOnce, setHoldLoadedOnce] = useState(false);
  const holdKind = useReadErrKind();
  const hold = useHydratedPart(
    sessionTokenAccessor,
    useCallback(
      (s) => holdKind.wrap(() => getBankAgencyHold(clientId, { session: s }).then((v) => { setHoldLoadedOnce(true); return v; })),
      [clientId, holdKind],
    ),
  );
  const [holdReason, setHoldReason] = useState("");

  const proposalsKind = useReadErrKind();
  const proposals = useHydratedPart(
    sessionTokenAccessor,
    useCallback((s) => proposalsKind.wrap(() => listOpenBankIdentifierPromotionProposals(clientId, { session: s })), [clientId, proposalsKind]),
  );

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("holdHeading")}</CardTitle>
          <CardDescription>{t("holdDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <ActionRefusal err={hold.err} clr={hold.clr} />
          <ReadState hasData={holdLoadedOnce} err={hold.err} errKind={holdKind.kind} onRetry={() => void hold.reload()}>
            <div className="flex items-center gap-2">
              <Badge variant={hold.data?.on_hold ? "destructive" : "outline"}>
                {hold.data?.on_hold ? t("onHold") : t("notOnHold")}
              </Badge>
              {hold.data?.reason && <span className="text-xs text-muted-foreground">{hold.data.reason}</span>}
            </div>
            <div className="flex items-end gap-2">
              <div className="grid flex-1 gap-1.5">
                <Label htmlFor="hold-reason">{t("reasonLabel")}</Label>
                <Input id="hold-reason" value={holdReason} onChange={(e) => setHoldReason(e.target.value)} />
              </div>
              <Button
                type="button" variant={hold.data?.on_hold ? "outline" : "destructive"} disabled={hold.busy}
                onClick={() =>
                  void hold.act(
                    async () => { await setBankAgencyHold(clientId, !hold.data?.on_hold, holdReason, { session: sessionTokenAccessor }); },
                    () => setHoldReason(""),
                  )
                }
              >
                {hold.busy ? tc("busy") : hold.data?.on_hold ? t("releaseHold") : t("setHold")}
              </Button>
            </div>
          </ReadState>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("promotionsHeading")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {proposals.data !== null && <ActionRefusal err={proposals.err} clr={proposals.clr} />}
          <ReadState hasData={proposals.data !== null} err={proposals.err} errKind={proposalsKind.kind} isEmpty={proposals.data?.length === 0} onRetry={() => void proposals.reload()}>
            <ul className="flex flex-col gap-2">
              {(proposals.data ?? []).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-2 text-sm">
                  <div>
                    <p className="font-medium text-foreground">
                      {String(p.payload.identifier_kind ?? "")} · {String(p.payload.identifier_value ?? "")}
                    </p>
                    <p className="text-xs text-muted-foreground">{p.rationale}</p>
                  </div>
                  <Button
                    type="button" size="sm" disabled={proposals.busy}
                    onClick={() =>
                      void proposals.act(async () => { await confirmBankIdentifierPromotion(p.id, { session: sessionTokenAccessor }); })
                    }
                  >
                    {proposals.busy ? tc("busy") : t("confirm")}
                  </Button>
                </li>
              ))}
            </ul>
          </ReadState>
        </CardContent>
      </Card>
    </div>
  );
}
