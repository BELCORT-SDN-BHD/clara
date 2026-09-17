// #812 — THE OWNER'S WAY BACK ON, on the one screen that tells them the door is shut.
//
// The Work-detail `egress_not_authorized` face used to name only two recoveries — accept the
// current Terms and DPA, keep the client active — and neither of them reverses a DEACTIVATED
// `accounting_work` activation. An owner who paused AI processing for a client had no documented
// way back. This is it: one owner-only button that calls `clara.reactivate_client_egress_purpose`
// (migration 0211), which resolves the consent that survived the deactivation and re-activates it.
//
// OWNER ONLY, decided by the DATABASE's own `role_rank` and never by a role's spelling. The door
// floors at owner and would answer CLR04 to anyone else, so offering the press to a bookkeeper
// would only ever produce a refusal.
//
// IT DOES NOT RE-RUN THIS WORK, and the copy says so. Recovery restores FUTURE dispatches: this
// run's authorization was consumed before the withdrawal and the posting core reads the activation
// that authorization names. "Try again" is the act that starts a new run, and it is already on
// this banner.
//
// EVERY REFUSAL IS THE DATABASE'S OWN SENTENCE, printed verbatim. `no_consent` (the withdrawal was
// a REVOKE, which `restore_client_egress_purpose` reverses) and `nothing_to_reactivate` (nothing
// was ever deactivated — the refusal is about the legal texts or the client instead) are both
// real answers a person needs to read, not states this component may paraphrase.

"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  reactivateClientEgress as defaultReactivate,
  type ReactivateClientEgress,
  type ReactivateClientEgressOutcome,
} from "@/lib/work/egress-recovery";

export function EgressReactivateAction({
  clientId,
  reactivate = defaultReactivate,
  newOpKey = () => crypto.randomUUID(),
  onReactivated,
}: {
  clientId: string;
  /** Open as a seam for the same reason `retry` is on this page: a cell must be able to drive the
   *  DECISION without a socket. */
  reactivate?: ReactivateClientEgress;
  newOpKey?: () => string;
  /** RE-READ. An owner who restores authority should see the page converge, not a stale banner. */
  onReactivated?: () => void | Promise<void>;
}) {
  const t = useTranslations("WorkDetail");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<ReactivateClientEgressOutcome | null>(null);

  const press = useCallback(async () => {
    setBusy(true);
    try {
      // The op key is minted ONCE per press and handed to the door, so a resubmit after a dropped
      // answer replays through `_reserve_op` rather than activating twice.
      const result = await reactivate({ clientId, opKey: newOpKey() });
      setOutcome(result);
      if (result.kind === "active") await onReactivated?.();
    } finally {
      setBusy(false);
    }
  }, [clientId, newOpKey, onReactivated, reactivate]);

  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => void press()}
      >
        {t("egressNotAuthorized.reactivate")}
      </Button>
      {outcome === null ? null : (
        <span className="text-sm" role="status">
          {outcome.kind === "active"
            ? t("egressNotAuthorized.reactivated")
            : outcome.kind === "refused"
              ? outcome.message
              : t("egressNotAuthorized.reactivateUnavailable")}
        </span>
      )}
    </div>
  );
}
