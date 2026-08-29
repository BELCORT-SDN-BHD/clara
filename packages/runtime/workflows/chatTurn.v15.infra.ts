// @frozen
//
// FROZEN — part of the chatTurn_v15 closure (F-A6 PR-2: THE AUDITED FREEFORM READ, the runtime
// half). A NEW frozen closure beside byte-untouched chatTurn_v1..v14 (ARCHITECTURE Appendix A:
// a behavioural change ships as a new _vN export, never an in-place edit — registry.ts repoints
// `chatTurn:` here).
//
// THIS FILE (infra) — v15 vs v14: everything v14.infra.ts exports (`pools`, `resolveModel`,
// `readScoped`, `writeScoped`, `safeRead`, `questionScoped`, `bankScoped`, and the
// `PgExec`/`ToolCtx`/`ClaraPools` types) is BYTE-CARRIED, by import-and-re-export — not copied,
// so it cannot drift. TWO ADDITIONS, both forced by the freeform read:
//
//   1. `ClaraPoolsV15` / `poolsV15()` — v13's `ClaraPools` type does not declare
//      `withFreeformRead`, and it CANNOT be widened: it is exported from a frozen file. So this
//      file declares the wider view of THE SAME injected object and reads it POSITIVELY.
//      `poolsV15()` does not cast: it CHECKS that `withFreeformRead` is a function and refuses
//      otherwise (review law 3 — a cast asserts a member's existence from its type's spelling;
//      only a read that actually SAW the function is evidence it is there). The failure it
//      guards against is real and dated: a chatTurn_v15 body running inside an image whose
//      plugins/startWorld.ts predates this PR would otherwise TypeError deep inside a tool call
//      instead of saying which half of the deploy is missing.
//
//   2. `freeformScoped` — THE MINT CENSUS, and it is a WALL, not plumbing (design §3.8, D-23).
//      The freeform read's client scope is compiled server-side FROM THE CREDENTIAL and never
//      from a tool argument (TA-P9 A(1)), so a client-bound chat session that presented a plain
//      `interactive` credential would look to the DB exactly like a lawful HOME read — a silent
//      firm-wide widening inside a client's conversation. This helper is where that cannot
//      happen: `ctx.clientId` non-null MINTS `interactive_client`, `ctx.clientId` null mints
//      plain `interactive` OBO, and the battery forces BOTH directions. (The DB now refuses it
//      too — `_freeform_core`'s `session_pin_missing` arm, 0131 §6.3(b), which found D-23's
//      "invisible to the DB by construction" premise to be false. Belts, not substitutes: this
//      one is what stops the call being made, that one is what stops it landing.)
//
// WHY NOT REUSE `questionScoped` OR `bankScoped` FOR THE PINNED MINT. Both are named for, and
// documented as, ONE call path each (`wake_open_question`; the thirteen bank verbs) — the
// chatTurn.v14.infra.ts precedent says in its own words that reusing a helper whose docblock
// claims "the ONE call path" would leave the earlier closure's claim misleading to a reader even
// though its code never changes. More than naming separates them here: both run on the WRITE
// pool as `clara_wake_interactive`, and this read must run on the FREEFORM pool as
// `clara_freeform_ro` — a different Postgres role with a different grant set, which is the whole
// mechanism (design §3.1). A shared helper could not have done both.
//
// OQ-A, AND IT IS AN ADDITION RATHER THAN A WEAKENING. F-A2's R-1 narrowed `interactive_client`
// to one call path (`wake_open_question`); F-A3 PR-3 added the thirteen bank verbs; this adds
// `wake_freeform_read`. The kind's own DB-side roster is EXTEND-ONLY (0131 ships exactly two
// allowlist rows for this verb, `interactive` and `interactive_client`, and F-A2's own row is
// untouched), and no plain `interactive` credential gains a client anywhere.

export {
  pools,
  resolveModel,
  readScoped,
  writeScoped,
  safeRead,
  questionScoped,
  type PgExec,
  type ToolCtx,
  type ClaraPools,
} from "./chatTurn.v14.infra.js";
export { bankScoped } from "./chatTurn.v14.infra.js";

import { pools as _pools, type ClaraPools as _ClaraPools, type ToolCtx as _ToolCtx } from "./chatTurn.v14.infra.js";

/** The arguments of ONE audited freeform read, as `lib/freeform-read.mjs` accepts them minus
 *  the credential (which `freeformScoped` mints and never lets a caller supply). */
export type FreeformReadArgs = {
  /** The model's composed SELECT. Travels as a BIND PARAMETER of the one verb, never as text
   *  the runtime concatenates — see lib/freeform-read.mjs's S-1 header. */
  sql: string;
  /** Why this read is being made, in the model's own words. NOT NULL on the receipt, and an
   *  ANNOTATION beside the mechanically-bound actor/turn — never the only evidence (TA-P4 A). */
  purpose: string;
  /** The deterministic per-call key. One receipt row per call, replay-stable. */
  opKey: string;
  /** An optional caller ceiling on rows, itself capped by the verb's own constant. */
  rowCap?: number | null;
};

/** The DB verb's own jsonb answer, carried verbatim. Deliberately NOT re-typed field by field:
 *  the runtime never re-derives a verdict the DB already reached (the F-A2 consumer contract). */
export type FreeformReadResult = Record<string, unknown>;

/** The injected pool API as chatTurn_v15 needs to see it. Same object as `ClaraPools`, wider
 *  view — the widening is declared here because v13's type is frozen. */
export type ClaraPoolsV15 = _ClaraPools & {
  withFreeformRead(args: FreeformReadArgs & { secret: string; taskId: string }): Promise<FreeformReadResult | null>;
};

/** Positive read of the injected pool API (see this file's header, addition 1). */
export function poolsV15(): ClaraPoolsV15 {
  const p = _pools() as Partial<ClaraPoolsV15>;
  if (typeof p.withFreeformRead !== "function") {
    throw Object.assign(
      new Error(
        "the injected runtime pools carry no withFreeformRead — this chatTurn_v15 body is running in an image " +
          "whose plugins/startWorld.ts predates F-A6 PR-2. The freeform read is unavailable; nothing was read.",
      ),
      { code: "CLR03", detail: '{"reason":"freeform_pool_not_injected"}' },
    );
  }
  return p as ClaraPoolsV15;
}

/**
 * THE MINT RULE, IN ONE PLACE. Two call sites need it — `freeformScoped` (which credential to
 * MINT) and the tool's metering row (which `via_wake_kind` to RECORD) — and a second copy of a
 * one-line rule is how a ledger comes to describe a mint that did not happen. They read the same
 * function instead, so the label cannot drift from the act it labels.
 */
export function freeformWakeKindFor(ctx: _ToolCtx): "interactive" | "interactive_client" {
  return ctx.clientId ? "interactive_client" : "interactive";
}

/**
 * THE MINT CENSUS (design §3.8, D-23) — see this file's header, addition 2.
 *
 * A client-bound session mints `interactive_client` pinned to that client; a HOME session (no
 * client) mints plain `interactive` OBO the initiator. Forced BOTH ways by the battery, because
 * only one direction is the interesting failure: a client-bound session falling back to plain
 * `interactive` reads FIRM-WIDE under a client pin's cover, and looks lawful from the DB side of
 * the credential alone.
 *
 * OBO IS NOT OPTIONAL EITHER. Both mints carry `on_behalf_of = ctx.createdBy`, so the read rides
 * the initiating member's LIVE bookkeeper+ authority (a below-bookkeeper OBO mint is refused
 * CLR10; a demoted member's outstanding credential goes inert at `wake_context()`) — and the
 * receipt's `on_behalf_of` names a real human rather than a service identity.
 *
 * The secret is minted, used and discarded inside ONE step execution attempt; it never crosses a
 * WDK step boundary (contract §4.1) and is never returned, logged or persisted here.
 */
export async function freeformScoped(ctx: _ToolCtx, args: FreeformReadArgs): Promise<FreeformReadResult | null> {
  const p = poolsV15();
  const { secret } =
    freeformWakeKindFor(ctx) === "interactive_client"
      ? await p.mintWakeCredentialClientObo(ctx.firmId, ctx.createdBy, ctx.clientId as string)
      : await p.mintWakeCredentialObo(ctx.firmId, ctx.createdBy);
  return p.withFreeformRead({
    secret,
    sql: args.sql,
    purpose: args.purpose,
    // The receipt binds the read to the TRIGGERING TURN, and the turn id comes from the
    // execution context — never from the model. TA-P4's mechanical binding, runtime half.
    taskId: ctx.taskId,
    opKey: args.opKey,
    rowCap: args.rowCap ?? null,
  });
}
