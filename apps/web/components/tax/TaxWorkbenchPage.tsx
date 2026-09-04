"use client";

// The Tax tab — Malaysia's SST and income-tax lifecycle for one client.
//
// 裁-44 FIXES THE SHAPE and this train does not change it: the tab is a PROPOSAL / RECEIPT
// surface with a human signing lane, never an input grid a professional types a computation
// into. After a close seals, Clara drafts the computation rungs with their statutory citations
// and a human reviews and signs. A lane that builds a computation form here has built the wrong
// surface, not merely an early one.
//
// WHAT THIS TRAIN CHANGED (CB-AE2E-032, the map's "confirmed" verdict):
//   1. THE TAB READS. It used to `void clientId` and issue zero reads while the one piece of
//      tax state a human session can reach — the SST compliance watch — sat unread on this very
//      client's own review-queue envelope. One read now happens here, at the top, and both the
//      watch section and the classification control share it.
//   2. THE COPY IS IN PROFESSIONAL REGISTER. The three notes were internal build-log prose
//      naming lane ids, migration numbers, an owner-ruling id and raw SQL signatures. Every one
//      of those identifiers now lives in a source comment — where it is useful and where it
//      already was — and the reader gets a sentence about their own books instead.
//   3. THE LIVE DOOR HAS A SURFACE. `clara.set_turnover_classification` has been callable since
//      migration 0016 with no user interface anywhere in the product.
//
// THE COMPUTATION PANEL IS STILL A NOTE, AND HONESTLY SO. Nothing that would drive it exists:
// no computation object, no CP204 object, no Form C object. Its note now says that as a fact
// about the product rather than as a citation of the lane that is paused.
//
// ONE ENVELOPE READ, TWO CONSUMERS, ONE ACT CYCLE. `loadClientSstWatch` makes a single
// `list_review_queue` call scoped to this client and splits it into the compliance aggregate
// (the figures) and the queue row that carries `watch_id` (the acts). The classification
// control's governed write rides THIS read's `act()`, so every act re-reads — see that panel's
// own note on why the watch, and not the chart, is the thing re-read.

import { useTranslations } from "next-intl";

import { PageHeader, PageShell } from "@/components/common/page-shell";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { loadClientSstWatch, type ClientSstWatch } from "@/lib/tax/sst-watch";
import { SstPanel } from "./SstPanel";
import { TaxComputationPanel } from "./TaxComputationPanel";
import { TurnoverClassificationPanel } from "./TurnoverClassificationPanel";

export function TaxWorkbenchPage({ clientId }: { clientId: string }) {
  const t = useTranslations("ClientTax");
  const watch = useAsyncRead<ClientSstWatch>(() => loadClientSstWatch(sessionTokenAccessor, clientId));

  // The service groups THIS CLIENT'S OWN envelope reports — the only DB-owned list of group
  // names a human session can see, because `clara.sst_threshold_schedule` (the table the
  // classification door validates against) carries no `clara_authenticated` grant. De-duplicated
  // because the aggregate ships one row per (client, service group) and a client can hold
  // several.
  const serviceGroups = Array.from(new Set((watch.data?.watches ?? []).map((row) => row.service_group)));

  return (
    <PageShell>
      <PageHeader title={t("heading")} description={t("body")} />
      <SstPanel watch={watch} />
      <TaxComputationPanel />
      <TurnoverClassificationPanel
        clientId={clientId}
        serviceGroups={serviceGroups}
        busy={watch.busy}
        act={watch.act}
      />
    </PageShell>
  );
}
