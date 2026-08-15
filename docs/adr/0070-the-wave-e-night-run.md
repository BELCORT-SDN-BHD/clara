# ADR-0070 — The Wave E night run: δ + the RS guard land LIVE; the whole-wave authorization

**Date:** 2026-08-13/14 · **Status:** standing · *narrative in parts (state lives in
`PROGRESS.md`; the ceremony record is `docs/plan/completed/wave-e-delta-ceremony-asrun.md`)*

## The authorization

The owner authorized the ENTIRE Wave E in one overnight run — build, review, merge, and live
ceremony — with full permission ("literally anything"), explicitly including the agent
running the ceremony itself and sourcing the live credential. The constitutional human half
(BEE FY2025 close keys, the #43 MASB wording sitting, ms/zh claim-policy copy) was named at
the outset as the only residue the run may leave.

## What landed live

Migrations **0058-0063** (PRs #233, #234, #236; ceremony 2026-08-14): the δ metric algebra +
catalog + evaluator freeze family + A30b evaluation-attempt receipts; the RS name-only guard
pair (hard constraint 12 made structural, with an owner-only lift floor); the PG17 runner
hardening; the dispatch-model harness guard (hard constraint 5 made mechanical). Both
evaluator closures are **deployed and frozen** (`verify_evaluator_freeze` ok 2/2).

## Rulings minted (each recorded in the mechanism it binds)

1. **Seal-currency:** a stored claim assessment is an instrument, never an authority — the
   seal re-derives the non-canonical population at the enforcement point and refuses on
   drift (`assessment_stale`). *(the ε docket, B1)*
2. **The draft-time numeral wall:** user/model-supplied text matching a currency-amount
   shape is refused at validation, naming the placeholder mechanism as the remedy; years and
   note references stay lawful; the spelled-out-numeral limit is documented, not hidden.
   *(ε docket, B2)*
3. **Machine-sealer attribution:** a JWT-less worker seals as `clara.agent_user_id()` with
   the requesting human as `on_behalf_of` — the act and the authority are two facts with two
   columns; misattributing a machine act to a person reads as evidence and is worse than
   omission. *(ζ, complete_render_job)*
4. **The RS lift floor:** the name-only policy stays liftable — through the audited door,
   with a recorded basis, **owner-only** — because an unliftable wall gets routed around by
   retire-and-recreate. Arming stays admin+. *(0063)*
5. **η v1 scope:** the render-preview chain (open→evaluate→seal→enqueue) is deferred to the
   OBO lane — pack evaluation is human-bound by the δ-v1 ruling and its body is now frozen;
   the lawful wake path arrives as `evaluate_fs_pack_v2` through its own registration and
   deploy ceremony. The chat tool ships as a named structural refusal. *(η)*
6. **The op-key interpretation, binding for every wake wrapper:** the deterministic caller
   key passes through and blank is refused; a wrapper must never mint its own (a fresh key
   per WDK replay defeats the reservation's purpose).
7. **Same-family freeze imports:** a new workflow version may import a prior version's
   UNCHANGED modules rather than hand-copying them — the freeze-lint's transitive hashing
   already hard-rejects any byte change to a registered file, and 1,900 transcribed lines
   are a defect source with no reviewer benefit. Cross-FAMILY imports stay forbidden.
8. **Dual-lane core splits follow consumers:** a wrapper/`_core` split ships when a JWT-less
   caller exists (seal, draft), and does NOT ship speculatively (open/seal-dataset cores
   were declined for having no v1 caller).
9. **Effective dates are explicit accounting facts** — never derived from the session clock,
   never defaulted to "today" by any lane including the agent's; the date joins the op-key
   hash so a different date is a distinct operation. *(the ε forbidden-clock fix + the η
   rebind)*

## The engineering laws the field taught (all now mechanical)

- **A managed cluster is not CI's superuser container:** SUSET baseline parameters get the
  guarded pin (attempt → on 42501 verify-value-or-refuse), with the restricted set proven
  from `pg_settings` by a live cell. *(PR #234; discharges the sting of Slice-2 HIGH 8/9 —
  the full non-superuser CI leg remains registered)*
- **Session identity is proven by a pin nonce, never by backend pid** — pooled backends
  legitimately recur; the nonce also converts transaction-pooling (where the advisory lock
  and the temp wrapper silently evaporate) into a loud statement-one refusal. *(PR #236)*
- **A squash-merged branch reused for a second PR must merge main back first** — a
  CONFLICTING merge ref does not fail CI, it silently prevents workflow runs from being
  created at all. Three runs were lost to this before the cause surfaced.
- **Never `git add -A` from a deep scratch path on Windows** — MAX_PATH-blocked checkouts
  read as tracked deletions and a blanket add ships them; stage explicit paths and verify
  the staged set by name. *(ε's near-miss, θ's confirmed encounter)*
- **The wave-battery presence gate** (`*-preintegration-gate.mjs` + focused-unset-FAILS /
  package-wide-var-LOUD-SKIPS) is the standing shape for every wave lane, enforced by a
  dedicated ci.yml drill per wave (the sweep-skip false-green hole the δ review named).

## Review economics, recorded

The uniform ladder earned its cost thrice over in one night: the δ cross-model round found
six blockers after 63/63 green batteries; the ε round found nine (incl. a seal-gate
time-of-check hole and string-encoded numerals) after 51/51; the estate sweeps caught a
forbidden-clock defect no lane battery could see. Generator-≠-evaluator is not a formality.

## Supplement — the wave-close rounds (2026-08-14/15)

What landed after the night run: migrations **0064-0084** all LIVE across two further
ceremonies (0064-0072; then 0077-0084 with a D1 write-quiesce, the chatTurn v11 deploy and
the freeze deploy-lock), plus ζ's fly ceremony (`clara-render` live from merged main, first
worker run a clean drain, the leader's dispatch half wired on `clara-runtime`). Codex's
quota exhausted mid-close; per the owner's fallback ruling the review lanes switched to
native fresh-context panels, which performed at level (they found the ci.yml stale-base
clobber, a replay tenant hole, the Typst version mismatch, and the null-maker fail-open).

Rulings minted in the close rounds (continuing the numbering above):

10. **Guard polarity — the ARM-0 law.** An identity-measuring guard handles the NULL or
    absent principal as its own FIRST arm, refusing or routing to the strictest path —
    never resolving it by inference. Three-valued logic turns a described branch into no
    branch: a NULL operand poisons every arm's predicate and the act sails through the gap
    BETWEEN arms; comparisons reachable by NULL use `is not distinct from`. *(0084 — the
    null-maker fail-open, found by the adversarial panel after green batteries)*
11. **Adoption semantics.** An orphaned proposal (no directing human, a departed director,
    a NULL proposer) is approvable only as an ADOPTION through `self_approval_attestation`
    — the deadlock is opened by an attestation door, not by frictionless approval. The
    maker/checker measure runs against the DIRECTING human (`proposal_evidence.
    on_behalf_of`), never the mechanical actor, with standing re-read at approval time.
    *(0084)*
12. **The isolation pin.** Migration isolation is a checksum-keyed PER-MIGRATION pin in the
    runner (0057 → `repeatable read`), and the pin is MEASURED post-BEGIN by a
    `current_setting` read-back, not assumed from the request; a blanket isolation raise
    was rejected (0019's CLR32 refuses it). Born of S0.9: 0057's birth sentinel raced the
    cluster-wide `latestCompletedXid` under read committed (~30ms window). *(the S0.9 fix)*
13. **Requeue re-derives; reap is immediate.** A human requeue of a failed render
    RE-DERIVES the pinned inputs and records both digests, drift consented via
    `p_accept_drift` (verbatim requeue rejected — the seal itself re-derives, so a
    verbatim copy can only agree by luck). Expired render leases are reaped IMMEDIATELY —
    a grace window was proven useless by its own arithmetic (an at-cap expired row is
    neither claimable nor completable) and publicly reverted; the worker self-fences via
    `render_lease_alive`. *(ζ, rounds 4-6)*

Two field laws with teeth, recorded here because each burned a full diagnostic cycle:
**number migrations IN-REPO** — an out-of-tree staging directory desynchronizes the DB's
applied history from the tested tree and the history-integrity guard fires correctly en
masse (η's 180 reds, two wrong diagnoses first); and **a probe that cannot say NO has a
meaningless YES** — ζ's storage read probe answered `not_found` identically for permitted
and forbidden prefixes (proven by its own negative control), so only the WRITE probe
answers a write question (the operator shape is in `docs/ops/DR-render.md`).
