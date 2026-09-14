// WAIVERS for the operation-contract census (packages/db/scripts/operation-census.mjs).
//
// A waiver suppresses EXACTLY ONE (label, target) pair. There is no function-level blanket
// exemption and no wildcard: the key is `<label>:<target>` with the target spelled exactly
// as the census reports it (a function IDENTITY — `clara.name(argtypes)` — for every
// catalog-resolved finding, `clara.name` for a `called_missing`, `ledger-vs-disk` for a
// `frontier_mismatch`). A waiver for `unattributed:clara.foo(uuid)` therefore says nothing
// at all about `called_ungranted:clara.foo(uuid)`, nor about a second overload of `foo`.
//
// THE REASON IS THE EVIDENCE, not a note. `validateWaivers` refuses a reason under 40
// characters, refuses an unknown label, and refuses a wildcard target — so an exemption
// cannot be added without stating what was reviewed. `expires_frontier` is optional and
// records the migration version after which the waiver is expected to be re-reviewed; the
// census reports a waiver that matched nothing as a DEAD exemption rather than ignoring it.
//
// Every entry below was reviewed individually against the live catalog and the call sites
// the census reports; none is here because "the census was noisy".

/** The labels a waiver key may name — kept in step with the census's own FINDING_LABELS. */
export const WAIVABLE_LABELS = [
  "called_missing",
  "called_ungranted",
  "frontier_mismatch",
  "granted_uncalled",
  "named_arg_mismatch",
  "public_execute",
  "unattributed",
];

export const MIN_REASON_CHARS = 40;

/**
 * @type {Map<string, {reason: string, expires_frontier?: string}>}
 */
export const WAIVERS = new Map([
  // REVIEWED 2026-09-09 against the live catalog at frontier 0177 and the call site itself.
  //
  // `clara.record_rule_resolution(uuid,text)` is granted to `clara_runtime_login` and to NO
  // group role — `{clara_fn_owner=X/clara_fn_owner,clara_runtime_login=X/clara_fn_owner}`,
  // read off pg_proc.proacl. packages/runtime/lib/matcher.mjs:186-196 reaches it DELIBERATELY:
  // it issues `reset role` to fall back to the session's bare login identity for exactly this
  // one statement and restores `set role clara_runtime` in a `finally`. The census resolves
  // that call site to the module's pool lanes (clara_runtime / clara_wake_interactive) because
  // the transient login identity is a runtime manoeuvre no static lane map models, not because
  // the grant is missing. rig-meta.mjs's new "clara_runtime_login" key asserts this exact
  // one-name surface catalog-wide, so a REVOKE still reds — in T17 rather than here.
  ["called_ungranted:clara.record_rule_resolution(p_document uuid, p_op_key text)", {
    reason:
      "matcher.mjs:186-196 calls this under a deliberate transient `reset role` to "
      + "clara_runtime_login, which is the sole grantee (pg_proc.proacl, measured); the lane "
      + "map models pool roles, not that manoeuvre. T17's new clara_runtime_login key covers "
      + "the grant itself, so a revoke still fails a test.",
  }],
  // REVIEWED 2026-09-09. A REAL, UNFIXABLE-HERE DEFECT, waived so it is stated rather than
  // silently green — see the report on #618 for the routing note.
  //
  // RE-REVIEWED 2026-09-14 when chatTurn_v19 landed, because the wave asked whether a new chat
  // successor could retire this. IT CANNOT, and the reason is structural rather than a matter of
  // effort. The census resolves a CALL SITE IN SOURCE, not the pinned version: the bare reader's
  // only caller is chatTurn_v1's own frozen tools body, which stays in the tree — and stays
  // EXPORTED from registry.ts — under versioning policy (c), so a run parked on v1 has a body to
  // resume into. v19 could only have retired it by deleting that file, which is the one thing the
  // policy forbids. Measured both ways on rig rigv19 (55455/clara_v19, frontier 189): with this
  // waiver present the census is 10/10; with it deleted, `opcen.1` reds naming
  // `clara.get_journal_entry(p_entry uuid) ... call sites:
  // packages/runtime/workflows/chatTurn.impl.ts:112 [alias:read]` — a LIVE finding, not a dead
  // exemption. The current closure is clean: chatTurn.v10.tools.ts:477 (which v11..v19 all carry
  // by import) reads `clara.get_journal_entry_for`, and so do claraWork v1/v2. Retiring this needs
  // a ruling that v1 may stop being exported, not another successor.
  //
  // THE ONE ALTERNATIVE THAT WAS PUT TO ME, ANSWERED RATHER THAN IGNORED: could the census scope
  // its READ-pool check to the ENQUEUED (registry-pinned) bodies, the way #637 derived provenance,
  // and let this waiver retire? NO — it would be a weakening, on three separate grounds, and each
  // is checkable:
  //   1. THE CALLER IS REACHABLE TODAY. A superseded frozen body is not dead code: policy (c)
  //      keeps it exported precisely so a PARKED run can resume into it, and
  //      `scripts/check-workflow-bundle.mjs` asserts every one of them SHIPS IN THE IMAGE ("50
  //      superseded body(ies) still ship for parked runs", measured on this branch). A parked
  //      chatTurn_v1 run that resumes executes this exact tool and gets 42501. A census that
  //      stopped reporting it would be reporting on a program that is not the one running.
  //   2. IT WOULD BE A BLANKET EXEMPTION WEARING A SCOPE'S CLOTHES. The exclusion could not be
  //      narrowed to this call site: it would drop EVERY call site in EVERY superseded body —
  //      dozens of files across chatTurn v1..v18, autoDraft v1..v9, statementFacts, witnessFacts,
  //      clientOnboarding, firmInterview — from the caller side in one line. This fixture's own
  //      header refuses exactly that shape: "There is no function-level blanket exemption and no
  //      wildcard."
  //   3. IT WOULD MAKE packages/db DEPEND ON packages/runtime's REGISTRY to decide what counts as
  //      a call site, so a repoint (a routine act, several per wave) would silently change what the
  //      SQL boundary census reports. The census's own header says it never infers the caller side
  //      from anything but the repository's sources.
  // So the waiver stays, and what it suppresses stays visible in its own reason. THE FOLLOW-UP IT
  // NEEDS is not another chatTurn successor — it is a ruling that chatTurn_v1 may stop being
  // exported (a drain proof: zero non-terminal runs on that body, which
  // `scripts/rollback-preflight.mjs` can already count), after which the file leaves the tree and
  // this entry becomes a DEAD exemption the census itself reports.
  //
  // packages/runtime/workflows/chatTurn.impl.ts:112 (chatTurn_v1's read tool) calls
  // `clara.get_journal_entry($1)` on the READ pool, which SET ROLEs to clara_agent_ro.
  // Migration 0009 (S6 §9/C-11) retired the bare same-firm entry oracle from the agent lane —
  // rig-meta.mjs's agentRo roster is literally `READS.filter(r => r !== "get_journal_entry")`
  // — so that tool answers 42501 today. It is the ONLY call site of the bare reader left in
  // packages/runtime (measured: `grep -n "clara.get_journal_entry(" workflows/*.ts`); every
  // later version calls the client-pinned `get_journal_entry_for` instead. The registry now
  // binds `chatTurn` to chatTurn_v18 (#623's repoint), and #623's OWN new closure —
  // claraWork_v1, whose `confirmEntryStep` re-reads the entry it just posted — deliberately
  // uses `get_journal_entry_for` too, so a second successor has come and gone without adding a
  // reason to keep the bare reader alive. The file is FROZEN (frozen-workflows.json lists it),
  // so the fix is not a source edit here: a parked v1 run that resumes into that tool surfaces
  // the read as its `{ error }` result.
  ["called_ungranted:clara.get_journal_entry(p_entry uuid)", {
    reason:
      "chatTurn_v1 (workflows/chatTurn.impl.ts:112, FROZEN per frozen-workflows.json) is the "
      + "last caller of the bare reader 0009 retired from clara_agent_ro; every later version "
      + "uses get_journal_entry_for, registry.ts binds chatTurn to v19, and both #623's "
      + "claraWork_v1 and #643/#644's chatTurn_v19 use get_journal_entry_for as well — three "
      + "successors have come and gone without a reason to keep the bare reader. Real defect, "
      + "unfixable in a frozen artifact that policy (c) requires to stay exported — reported for "
      + "routing, not silently absorbed.",
  }],
]);

/**
 * Refuse anything that is not a single, explained (label, target) pair.
 * @param {Map<string, {reason: string, expires_frontier?: string}>} waivers
 */
export function validateWaivers(waivers) {
  if (!(waivers instanceof Map)) throw new TypeError("census waivers must be a Map keyed by <label>:<target>");
  for (const [key, value] of waivers) {
    if (typeof key !== "string" || !key.includes(":")) {
      throw new Error(`census waiver key ${JSON.stringify(key)} is not "<label>:<target>"`);
    }
    const label = key.slice(0, key.indexOf(":"));
    const target = key.slice(key.indexOf(":") + 1);
    if (!WAIVABLE_LABELS.includes(label)) {
      throw new Error(`census waiver ${JSON.stringify(key)} names an unknown label ${JSON.stringify(label)} — it can never suppress a finding`);
    }
    if (target.length === 0 || target.includes("*")) {
      throw new Error(`census waiver ${JSON.stringify(key)} does not name exactly one target — a wildcard or empty target is refused`);
    }
    if (!value || typeof value.reason !== "string" || value.reason.length < MIN_REASON_CHARS) {
      throw new Error(
        `census waiver ${JSON.stringify(key)} needs a reason of at least ${MIN_REASON_CHARS} characters naming the evidence reviewed`
        + ` (got ${value && typeof value.reason === "string" ? value.reason.length : 0})`,
      );
    }
    if (value.expires_frontier !== undefined && typeof value.expires_frontier !== "string") {
      throw new Error(`census waiver ${JSON.stringify(key)} has a non-string expires_frontier`);
    }
  }
  return waivers;
}
