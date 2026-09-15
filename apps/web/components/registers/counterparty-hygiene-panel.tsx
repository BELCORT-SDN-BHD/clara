"use client";

// The counterparty hygiene panel — T8's NEW surface (port-wave plan §4/§5):
// create · set terms · add alias · rename · merge. Nested inside the
// registers "aging" tab (Q3's closed IA; no TABS/CLIENT_TABS edit — the
// team-lead's own brief), a full write surface in the staff-advances-register.tsx
// shape: one useHydratedPart, one persistent refusal banner, every dialog a
// thin controlled form over a single governed call.
//
// #647: THE ALIAS LIST, ITS PROVENANCE AND ITS RETIREMENT LIVE ON THE ROUTED IDENTITY DETAIL.
// The stale rung-0 finding that used to sit here — "retire_counterparty_alias has no honest way
// to reach it, because no read exists to discover an alias id" — was taken at frontier 0140 and
// was already refuted by `clara.counterparty_aliases_visible` (0145:960-964). It is deleted
// rather than amended, and the `NotBuiltNote` it justified is gone with it: 0200 §8.2 ships
// `clara.get_counterparty_identity`, and each row below links to the detail that renders it.
//
// THIS PANEL KEEPS THE ACTS, THE DETAIL KEEPS THE READS. Create, set terms, add alias, rename and
// merge are acts on a REGISTER and stay here (C-41: no control per database function, and no
// duplicate of one either); the alias history, the identifier corrections, the merge lineage and
// the conflicts are identity FACTS and live under the client's Knowledge area.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useHydratedPart } from "@/lib/parts/hooks";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { loadCounterparties, type CounterpartyKind, type CounterpartyRow } from "@/lib/registers/counterparty";
import {
  createCounterparty, setCounterpartyTerms, addCounterpartyAlias,
  renameCounterparty, mergeCounterparties,
} from "@/lib/registers/counterparty-doors";
import { SectionHeader } from "@/components/common/section-header";
import { EmptyState, LoadingState, StateBanner } from "@/components/common/state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { counterpartyIdentityHref } from "@/lib/navigation/tree";
import { CreateCounterpartyDialog } from "./CreateCounterpartyDialog";
import { SetCounterpartyTermsDialog } from "./SetCounterpartyTermsDialog";
import { AddCounterpartyAliasDialog } from "./AddCounterpartyAliasDialog";
import { RenameCounterpartyDialog } from "./RenameCounterpartyDialog";
import { MergeCounterpartiesDialog } from "./MergeCounterpartiesDialog";
import type { SessionTokenAccessor } from "@/lib/session";

// H-34 — BOTH kinds, always. `loadCounterparties` sends `kind: eq.<kind>`
// (lib/registers/counterparty.ts:87), so a single-kind read makes the other kind's
// rows structurally unreachable — and the empty branch then claimed something about
// the CLIENT ("No counterparties recorded yet for this client") that the read never
// asked. Worse in place: this panel is nested inside AgingRegister, whose own domain
// state defaults to "ar" = receivables = CUSTOMERS, so on first paint the aging table
// above showed customer aging while the panel below said there were no counterparties
// at all.
//
// Two calls of the SAME function — no new read, no new grant — and the kind toggle
// becomes self-evidencing: each button carries its own count, so a human never reads
// "none" while the other toggle shows a number. It also retires the kind-change reload
// effect entirely.
async function loadHygieneData(session: SessionTokenAccessor, clientId: string) {
  const [vendor, customer] = await Promise.all([
    loadCounterparties(session, clientId, "vendor"),
    loadCounterparties(session, clientId, "customer"),
  ]);
  return { vendor, customer };
}

function statusBadge(t: ReturnType<typeof useTranslations>, row: CounterpartyRow, all: CounterpartyRow[]) {
  if (row.merged_into) {
    const survivor = all.find((c) => c.id === row.merged_into);
    return <Badge variant="secondary">{t("statusMerged", { name: survivor?.name ?? row.merged_into.slice(0, 8) })}</Badge>;
  }
  if (row.retired_at) return <Badge variant="secondary">{t("statusRetired")}</Badge>;
  return <Badge variant="outline">{t("statusLive")}</Badge>;
}

export function CounterpartyHygienePanel({
  clientId,
  onActed,
}: {
  clientId: string;
  /** Fired on every SETTLED act here (sweep addendum item 4). This panel is nested
   *  INSIDE AgingRegister, and renaming or merging a counterparty changes the name —
   *  and, for a merge, the ROWS — the aging table above it is showing. The sibling
   *  CounterpartyStatementPanel four lines up in aging-register.tsx already takes this
   *  exact prop; this panel was the one that did not. */
  onActed?: () => void;
}) {
  const t = useTranslations("ArApCounterparty");
  const tIdentity = useTranslations("ArApCounterparty.identity");
  const [kind, setKind] = useState<CounterpartyKind>("vendor");
  const { data, busy, err, clr, act: rawAct } = useHydratedPart(sessionTokenAccessor, (s) => loadHygieneData(s, clientId));
  const act = async (fn: () => Promise<void>): Promise<boolean> => {
    const ok = await rawAct(fn);
    // On SETTLE, not on success: a refused merge may still have moved something the
    // aging read would report differently, and re-deriving is never the wrong answer.
    onActed?.();
    return ok;
  };

  // F4 (independent review, fix-required): the sibling shape
  // (staff-advances-register.tsx) — before the FIRST successful load,
  // "still loading" and "the read itself failed" are mutually exclusive,
  // never shown together. A post-load act() refusal (create/rename/merge/…)
  // is a SEPARATE err banner further down, inside the loaded render, where
  // `data` is real.
  if (!data) {
    return err ? <StateBanner tone="error">{err}</StateBanner> : <LoadingState>{t("loading")}</LoadingState>;
  }

  const shown = data[kind];

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        level={2}
        action={
          <CreateCounterpartyDialog
            busy={busy}
            onSubmit={(k, name, registrationNo, tin) => act(() => createCounterparty(clientId, k, name, registrationNo, tin, { session: sessionTokenAccessor }).then(() => undefined))}
          />
        }
      >
        {t("heading")}
      </SectionHeader>
      {err && (
        <StateBanner tone="error" code={clr ? `${clr.code}${clr.reason ? ` · ${clr.reason}` : ""}` : undefined}>
          {err}
        </StateBanner>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {(["vendor", "customer"] as const).map((k) => (
          <Button key={k} type="button" size="sm" variant={kind === k ? "default" : "outline"} aria-pressed={kind === k} onClick={() => setKind(k)}>
            {t(k === "vendor" ? "kindVendorPlural" : "kindCustomerPlural")}
            <span className="ml-1.5 opacity-70">{data[k].length}</span>
          </Button>
        ))}
      </div>

      {shown.length === 0 ? (
        // The sentence now names the kind the read actually asked for.
        <EmptyState>{t(kind === "vendor" ? "emptyVendor" : "emptyCustomer")}</EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((row) => {
            const isLive = row.merged_into === null && row.retired_at === null;
            const mergeCandidates = shown.filter((c) => c.id !== row.id && c.merged_into === null && c.retired_at === null);
            return (
              <li key={row.id} className="flex flex-col gap-2 rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{row.name}</span>
                    {statusBadge(t, row, [...data.vendor, ...data.customer])}
                  </div>
                  {isLive && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <RenameCounterpartyDialog
                        currentName={row.name}
                        busy={busy}
                        onSubmit={(newName) => act(() => renameCounterparty(clientId, row.id, newName, { session: sessionTokenAccessor }).then(() => undefined))}
                      />
                      <SetCounterpartyTermsDialog
                        counterpartyName={row.name}
                        currentDays={row.payment_terms_days}
                        busy={busy}
                        onSubmit={(days) => act(() => setCounterpartyTerms(row.id, days, { session: sessionTokenAccessor }).then(() => undefined))}
                      />
                      <AddCounterpartyAliasDialog
                        counterpartyName={row.name}
                        busy={busy}
                        onSubmit={(alias, origin, basis) => act(() => addCounterpartyAlias(clientId, row.id, alias, origin, { basis }, { session: sessionTokenAccessor }).then(() => undefined))}
                      />
                      <MergeCounterpartiesDialog
                        clientId={clientId}
                        kind={kind}
                        counterparty={row}
                        candidates={mergeCandidates}
                        busy={busy}
                        onConfirm={(survivorId, mergedId, reason) => act(() => mergeCounterparties(clientId, survivorId, mergedId, reason, { session: sessionTokenAccessor }).then(() => undefined))}
                      />
                    </div>
                  )}
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-4">
                  <div className="flex justify-between gap-1">
                    <dt>{t("registration")}</dt><dd>{row.registration_no ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-1">
                    <dt>{t("tin")}</dt><dd>{row.tin ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-1">
                    <dt>{t("terms")}</dt><dd>{row.payment_terms_days ?? "—"}</dd>
                  </div>
                </dl>
                {/* Item (33): the row is not a disguised link — this is a real, focusable anchor
                    with its own accessible name, and it is the ONE way from the register to the
                    identity's durable URL. It is offered for a merged or retired row too:
                    reading where an identity went is exactly what a dead row is still for. */}
                <Link
                  className="w-fit text-xs underline underline-offset-4"
                  href={counterpartyIdentityHref(clientId, row.id)}
                >
                  {tIdentity("openDetail")}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
