// #812 — `clara.reactivate_client_egress_purpose(p_client, p_purpose, p_op_key)`: the governed
// write behind the Work-detail `egress_not_authorized` face's owner-only recovery action
// (migration 0211).
//
// WHY THE CONSOLE CALLS **THIS** DOOR AND NOT `activate_client_egress_purpose`. The activate door
// requires the caller to NAME the consent, and `clara.client_egress_purpose_consents` carries
// FORCE ROW LEVEL SECURITY with a `clara_fn_owner`-only policy and no table grant (migration
// 0020): no lawful read hands that id to `clara_authenticated`, so the browser has nothing to
// send. 0211's door resolves the surviving consent inside the database and delegates.
//
// WHAT IT IS AND IS NOT. It reverses a DEACTIVATION of the derived `accounting_work` activation.
// It does NOT reverse a REVOKE (that is `restore_client_egress_purpose`), it does not accept a
// newer legal version on anyone's behalf, and it does not re-activate an archived client — the
// database refuses all three, and this module carries those refusals up VERBATIM rather than
// re-wording them.
//
// RECOVERY RESTORES FUTURE DISPATCHES ONLY. The refused Work on the screen stays refused: its
// authorization was consumed before the withdrawal, and the posting core reads the activation
// that authorization names. The copy says so, and `retry` is the act that starts a new run.
//
// THE OP KEY IS THE CALLER'S, minted once per attempt and held by the component, so a resubmit
// after a dropped answer REPLAYS through `_reserve_op` rather than activating twice.

import { callDoor, isDoorRefusal } from "@/lib/doors";

export const REACTIVATE_CLIENT_EGRESS_DOOR = "reactivate_client_egress_purpose";

/** The one purpose this door accepts. Spelled here so no call site invents another. */
export const WORK_EGRESS_PURPOSE = "accounting_work";

export type ReactivateClientEgressParams = {
  readonly clientId: string;
  /** Minted and held by the CALLER, one per attempt. */
  readonly opKey: string;
};

export type ReactivateClientEgressOutcome =
  /** The activation is live again. Future dispatches for this client are authorised. */
  | { readonly kind: "active" }
  /** A governed refusal, carried VERBATIM — code, reason and sentence untouched. */
  | { readonly kind: "refused"; readonly code: string; readonly reason: string | null; readonly message: string }
  /** Transport, auth, or an answer this build will not act on. Nothing was decided. */
  | { readonly kind: "unavailable" };

export type ReactivateClientEgress = (
  params: ReactivateClientEgressParams,
) => Promise<ReactivateClientEgressOutcome>;

/** THE PRODUCTION IMPLEMENTATION. */
export const reactivateClientEgress: ReactivateClientEgress = async (params) => {
  try {
    const out = await callDoor<Record<string, unknown>>(REACTIVATE_CLIENT_EGRESS_DOOR, {
      p_client: params.clientId,
      p_purpose: WORK_EGRESS_PURPOSE,
      p_op_key: params.opKey,
    });
    // POSITIVELY CHECKED. A 200 that does not say the activation is live is not evidence that it
    // is, and the one thing this face must never do is tell an owner that AI processing is back on
    // when nothing was written.
    if (out?.status !== "active") return { kind: "unavailable" };
    if (out?.purpose !== WORK_EGRESS_PURPOSE) return { kind: "unavailable" };
    if (typeof out?.activation_id !== "string" || out.activation_id.length === 0) {
      return { kind: "unavailable" };
    }
    return { kind: "active" };
  } catch (err) {
    if (isDoorRefusal(err)) {
      return {
        kind: "refused",
        code: err.code ?? "CLR",
        reason: err.reason ?? null,
        message: err.message,
      };
    }
    return { kind: "unavailable" };
  }
};
