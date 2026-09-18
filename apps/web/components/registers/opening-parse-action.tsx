"use client";

// #656 — "READ THIS DOCUMENT": the browser's only entrance to the opening source.
//
// A PLAIN ACTION, NOT A GATED ONE, and that is an acceptance criterion rather than a taste call.
// #656 AC5 forbids adding a blanket opening approval ritual, and a second confirmation dialog in
// front of the DOCUMENT READ would be exactly that: the ceremony this lane already has is
// `approve_opening_seed`'s distinct-checker door, which is where a human commits the basis. Reading
// the source records evidence and nothing else — every figure is re-derived by the database before
// a target exists, and the approval re-runs the same assertion over every one of them. So: one
// button, one call.
//
// THE OUTCOME IS PERSISTENT. It is a `StateBanner` that stays until the next read, never a toast.
// A refusal here names rows on a page a professional has to go and find — the producer's whole
// value is that it says WHICH lines it could not read — and a message that fades cannot carry
// that. It is also why the banner survives a failed act: `useAsyncRead`'s own error is separate
// from this component's outcome, and neither clears the other.
//
// EVERY BRANCH OF THE ROUTE'S CONTRACT IS RENDERED, with the DATABASE'S OWN WORDS where it has
// them. `no_opening_tb_lines` is NOT an error — it is the honest keyed-fallback signal ("this
// document is not a trial balance we can read; key the balances instead"), so it renders as
// information with the keyed path named. A 403 renders as denied and names the restriction rather
// than offering a retry that cannot work.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { StateBanner } from "@/components/common/state";
import { isRuntimeError } from "@/lib/documents/runtime-wire";
import {
  isKeyedFallback,
  parseOpeningSource,
  type OpeningParseOutcome,
} from "@/lib/registers/opening-source";

type Settled =
  | { state: "outcome"; outcome: OpeningParseOutcome }
  /** A transport or infrastructure fault, classified by kind — never by quoting a body. */
  | { state: "failed"; kind: string };

export function OpeningParseAction({
  seedId,
  busy,
  onParsed,
}: {
  seedId: string;
  busy: boolean;
  /** Re-read the basis after a successful parse, so the targets and the tie gates move together. */
  onParsed: () => Promise<void>;
}) {
  const t = useTranslations("OpeningCarryDown.source");
  const [running, setRunning] = useState(false);
  const [settled, setSettled] = useState<Settled | null>(null);

  const run = async () => {
    setRunning(true);
    try {
      const outcome = await parseOpeningSource(seedId);
      setSettled({ state: "outcome", outcome });
      if (outcome.kind === "parsed") await onParsed();
    } catch (e) {
      // A DELIBERATE ABORT is not a failure and must not paint one (runtime-wire.ts's carve-out).
      if (e instanceof Error && e.name === "AbortError") return;
      setSettled({ state: "failed", kind: isRuntimeError(e) ? e.kind : "transport" });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-col gap-2" data-testid="opening-parse-action">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" disabled={busy || running} onClick={run}>
          {running ? t("readingDocument") : t("readDocumentTrigger")}
        </Button>
        <p className="text-xs text-muted-foreground">{t("readDocumentHint")}</p>
      </div>
      {settled ? <OpeningParseOutcomeBanner settled={settled} /> : null}
    </div>
  );
}

/** Exported for the unit battery: the whole point of this component is the branch table below, and
 *  a test that had to drive a network call to see it would be testing the fetch, not the copy. */
export function OpeningParseOutcomeBanner({ settled }: { settled: Settled }) {
  const t = useTranslations("OpeningCarryDown.source");

  if (settled.state === "failed") {
    return (
      <StateBanner tone="error" title={t("outcome.failedTitle")}>
        {t("outcome.failedBody", { kind: settled.kind })}
      </StateBanner>
    );
  }

  const o = settled.outcome;
  if (o.kind === "parsed") {
    return (
      <StateBanner tone="neutral" title={t("outcome.parsedTitle")}>
        {t("outcome.parsedBody", { n: o.lines })}
      </StateBanner>
    );
  }
  if (o.kind === "unparseable") {
    // THE KEYED-FALLBACK SIGNAL IS NOT AN ERROR. It is the lane telling the truth: this document
    // is not a trial balance it can read, and keying the balances is the supported way forward.
    if (isKeyedFallback(o)) {
      return (
        <StateBanner tone="info" title={t("outcome.noLinesTitle")}>
          {t("outcome.noLinesBody")}
        </StateBanner>
      );
    }
    return (
      <StateBanner tone="warning" title={t("outcome.unparseableTitle")}>
        {/* VERBATIM. The reason carries the counts and the failing row identifiers, and paraphrasing
            it would throw away the only thing that tells a person which line to look at. */}
        <p className="break-words">{o.reason}</p>
        {o.unmappedAccounts.length > 0 ? (
          <p className="mt-1">{t("outcome.unmappedAccounts", { accounts: o.unmappedAccounts.join(", ") })}</p>
        ) : null}
        <p className="mt-1">{t("outcome.allOrNothing")}</p>
      </StateBanner>
    );
  }
  if (o.kind === "refused") {
    return (
      <StateBanner tone="warning" title={t("outcome.refusedTitle")} code={o.code ?? undefined}>
        <p className="break-words">{o.reason}</p>
      </StateBanner>
    );
  }
  if (o.kind === "denied") {
    return (
      <StateBanner tone="error" title={t("outcome.deniedTitle")}>
        {t("outcome.deniedBody")}
      </StateBanner>
    );
  }
  return (
    <StateBanner tone="error" title={t("outcome.notFoundTitle")}>
      {t("outcome.notFoundBody")}
    </StateBanner>
  );
}
