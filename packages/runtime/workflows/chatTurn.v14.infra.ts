// @frozen
//
// FROZEN — part of the chatTurn_v14 closure (F-A3 PR-3, OQ-6: BANK CHAT PARITY, owner ruling
// 2026-08-25 — a human in chat may drive the bank lane's 13 verbs on the hard condition that the
// receipt records the truth). A NEW frozen closure beside the byte-untouched chatTurn_v1..v13
// (ARCHITECTURE Appendix A: a behavioural change ships as a new _vN export, never an in-place
// edit — registry.ts repoints `chatTurn:` here).
//
// WHY THIS FILE EXISTS AT ALL — IT CORRECTS A PREMISE chatTurn.v13.infra.ts:30-32 STATES AS
// LOAD-BEARING AND CANNOT BE EDITED TO FIX (that file is FROZEN, `// @frozen` on its own line 1).
// v13's own words: "`interactive_client` holds EXACTLY ONE `wake_fn_allowlist` row, for
// `wake_open_question`, and the post verb is allowlisted for `autodraft` and `interactive`
// only — measured on the rig, not assumed." That was TRUE the moment v13 shipped and became
// FALSE the instant F-A3 PR-3's SS4 landed: SS4 inserts one `interactive_client` allowlist row
// for EVERY function already allowlisted under `bank_agent` (thirteen names, measured live —
// see that migration's own SS4 section comment), so `interactive_client` now carries FOURTEEN
// rows (`wake_open_question` plus the thirteen bank verbs), not one. v13's own call sites are
// UNCHANGED by this — v13 still only ever mints `interactive_client` for `wake_open_question`
// (R-1's narrowing describes v13's OWN closure honestly, and stays true of it) — but a reader of
// v13.infra.ts alone would now form a false belief about the CREDENTIAL KIND itself. This file is
// the correction, stated in the one place a correction can land without editing a frozen body:
// beside the NEW closure that is the reason the premise changed.
//
// THIS FILE (infra) — v14 vs v13: everything v13.infra.ts exports (`pools`, `resolveModel`,
// `readScoped`, `writeScoped`, `safeRead`, `questionScoped`, and the `PgExec`/`ToolCtx`/
// `ClaraPools` types) is BYTE-CARRIED, by import-and-re-export — not copied, so it cannot drift.
// `ClaraPools` already declares `mintWakeCredentialClientObo` (F-A2/D34), which is exactly the
// mint this file's own addition needs; no widening of that type is required.
//
// ONE ADDITION: `bankScoped`, the mint path for the twelve bank ACT verbs plus the one bank READ
// verb (`get_bank_pack`) — the thirteen names SS4 allowlisted. NOT a reuse of v13's
// `questionScoped`: that helper's own name and docblock describe ONE call path
// (`wake_open_question`) by design, and reusing it here for a completely different verb family
// would leave v13's "the ONE call path" claim misleading to a reader even though v13's own code
// never changes. `bankScoped` is therefore a NEW, separately-named function with the identical
// two-line body (mint `interactive_client` OBO the acting human, client-pinned; run on the WRITE
// pool) — the chatTurn_v13.usage.ts precedent for deliberate duplication over cross-closure
// sharing applies to naming-and-narrative here, not only to literal code reuse.
//
// WHY `interactive_client`, NOT PLAIN `interactive`, FOR THE BANK VERBS. Two independent reasons
// converge on the same answer: (1) SS4 widened `interactive_client`'s allowlist, not
// `interactive`'s — calling through plain `interactive` would fail `assert_wake_allowed` outright
// for all thirteen names; SS4's own section comment frames the whole limb as "interactive_client
// rows on the same cores" (design OQ-6's own recommendation, verbatim). (2) Every bank wake
// wrapper checks `w.client_id is not null and p_client is distinct from w.client_id` — a
// client-pinned credential is what makes that check load-bearing rather than vacuous, and a bank
// act is inherently client-scoped (a statement, an account, a match all belong to exactly one
// client) the same way a client-scoped open question is. Plain `interactive`'s NULL-client
// guarantee, which is exactly right for `post_journal_entry` (client is asserted from the chat
// session's own binding, not the credential), is not the better fit here — the credential itself
// should refuse to reach another client's bank data, not merely rely on the wrapper's own check.
//
// THE POSTGRES GRANT THIS MINT DEPENDS ON, STATED HERE SO IT IS NEVER LOST TO A COMMENT ONLY THE
// AUTHOR READ. `wake_fn_allowlist` (SS4) is an APPLICATION-LEVEL allowlist `assert_wake_allowed`
// reads — it is NOT a Postgres ACL. The write pool (`packages/runtime/lib/pools.mjs`,
// `withWriteWakeScoped`) connects as `clara_wake_write_login` and `SET ROLE clara_wake_interactive`
// on every checkout, REGARDLESS of which wake_kind the minted credential carries (`interactive` and
// `interactive_client` are both reached through this ONE Postgres role) — so a mint succeeding and
// an allowlist row existing are BOTH necessary but NEITHER sufficient: the connecting ROLE also
// needs `GRANT EXECUTE` on each of the thirteen bank `wake_*` functions, and SS4 does not grant it
// (SS4 only touches `wake_fn_allowlist`). Measured live at review time: `clara_wake_interactive`
// held EXECUTE on 0 of the 13. The grant that makes this file's mint reach anything at all ships
// as its own migration, `UNNUMBERED_chatturn_v14_bank_interactive_grants.sql`, an EXTEND-ONLY ACL
// widening scoped to exactly these thirteen named functions — never a blanket grant, and reviewed
// as its own deliberate act rather than folded silently into this runtime change.

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
} from "./chatTurn.v13.infra.js";

import { pools as _pools, type PgExec as _PgExec, type ToolCtx as _ToolCtx } from "./chatTurn.v13.infra.js";

/**
 * F-A3 PR-3 (OQ-6) — mint the PINNED `interactive_client` kind, client-pinned OBO the acting
 * human, and run on the WRITE pool. The ONE mint path every bank verb tool in this closure calls
 * through (thirteen wake_* names, SS4's own roster). Refuses without a client rather than
 * falling back — a bank act with no client-bound session has no bank data to act on, and minting
 * plain `interactive` instead would only reach a wake_* wrapper that refuses CLR11
 * (`credential_client_pin`) anyway once it tried to name a client, one layer further from cause.
 */
export async function bankScoped<T>(ctx: _ToolCtx, fn: (c: _PgExec) => Promise<T>): Promise<T> {
  if (!ctx.clientId) {
    throw Object.assign(new Error("a bank act needs a client-pinned chat session"), {
      code: "CLR03",
      detail: '{"reason":"bank_act_needs_client_pin"}',
    });
  }
  const { secret } = await _pools().mintWakeCredentialClientObo(ctx.firmId, ctx.createdBy, ctx.clientId);
  return _pools().withWriteWakeScoped(secret, fn);
}
