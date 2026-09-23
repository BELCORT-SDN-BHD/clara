# wave 3 · lane 01 · fix round — #890, #921

**Branch** `riders/w3-lane01` · **base** `ffe63a0dd084e99b84c1368119845be273c421ce`
**New head** `adf980b088d50ab502fa052a1ccd437a182d976e`
**Worktree** `C:\Users\zhant\Desktop\clara-wt\635` · **DB** `clara_l01` @ 127.0.0.1:55741 (268 applied migrations)
**Playwright triple** `https://127.0.0.1:3500` / 3501 / 3502

Single fix worker for both review axes (`/implement-spec`: one implementer fixes every review issue).

## Starting state

`git status` clean; `git log --oneline ffe63a0dd..HEAD` showed the ten commits the reviews measured
(`c50b7afc1` … `00ba92176`). No uncommitted changes were left behind by the cut-off implementer —
their work is all in those ten commits.

## Commits added by this round

| commit | what |
|---|---|
| `0d3f6a5a7` | `fix(db): #921 drive the retired vendor-binding write doors through their owner` — SPEC-921-A, L01-STD-1, SPEC-921-D, L01-STD-3 |
| `f8870c214` | `docs(db): #921 re-true the grant claims the 0273 cut left behind` — SPEC-921-B, L01-STD-2 |
| `df10b9ef3` | `test(web): #890 drive and assert origin in the add-alias draft cell` — SPEC-890-A |
| `adf980b08` | `test(web): #921 give the e2e walk's Sign assertion something it could fail on` — SPEC-921-C, SPEC-921-E |

---

## Finding by finding

### SPEC-921-A (blocker) + L01-STD-1 (blocker) — 57 red cells in six pre-existing batteries — **FIXED**

**Reproduced first**, on `clara_l01` with the exact `--import` gate list from `packages/db/package.json`:

| file | before |
|---|---|
| `tests/x36-vendor-binding-ceremony.test.mjs` | 11 tests / 1 pass / **10 fail** |
| `tests/x30-f1-lcp.test.mjs` | 9 / 0 / **7 fail** / 2 skip |
| `tests/binding-proposal-pr-1.test.mjs` | 111 / 78 / **33 fail** |
| `tests/x31-autopost-lane-unify.test.mjs` | 9 / 8 / **1 fail** |
| `tests/x36-p-round-regressions.test.mjs` | 1 / 0 / **1 fail** |
| `tests/x36-vendor-binding-resolver.test.mjs` | 7 / 2 / **5 fail** |

57 failures, every one traceable to 0273 (42501 on propose / sign / decline, or a downstream
mismatch such as x30.3 expecting CLR36 and getting 42501). `x36-vendor-binding-dwell` (5/5) and
`rig-docs-download-door` (21/21) were clean, as the spec review said.

**The fix, and why it is this one rather than the reviewer's suggested one.** The reviewer's
`required_fix` proposed converting fixture call sites to the raw builders the earlier cut added and
retiring the ceremony battery. I did something smaller and, I argue, more faithful:

* 0273 moves the **grant** and nothing else. Its own header: "No table, column, trigger, policy,
  function BODY, or any OTHER role's ACL … moves." D6 keeps the three bodies deliberately —
  "revoking rather than dropping keeps every one of those rows' provenance columns meaningful
  without resurrecting a body from source control **if the ruling is ever revisited**".
* What the 57 cells are about is those bodies: the rank floors, 裁-18a's signer<>proposer wall
  (and its NULL-principal defensive arm), the loop brake, the sign-time drift and corpus re-runs,
  H5's roster window, H6's lock order, C3's post-time interlock, and their mutants. Retiring them
  would mean a future restore of the grant ships unguarded.
* #921's AC3 asks for batteries "updated to the read-only shape and **stay green**", and #921's
  own "Out of scope" is "Removing the lane's tables, doors or historical rows". Re-pointing is the
  minimal change that satisfies both.

So the shared wrappers are renamed and re-transported:

* `x36-vendor-binding-helpers.mjs`: `propose` → `proposeAsFnOwner`, `sign` → `signAsFnOwner`,
  `signLive` → `signLiveAsFnOwner`, plus `retiredWriteDoorQuery(sub, sql, params)` for the four
  drives that pass `p_attestation`. Each runs `withActor({ role: ROLES.fnOwner, jwtSub: sub })` —
  `clara_fn_owner` still holds EXECUTE, and `request.jwt.claims` still names the same human, so
  `clara._human_ctx` resolves the same actor and every wall inside each body still runs.
* `binding-proposal-pr-1-helpers.mjs`: `declineBinding` → `declineBindingAsFnOwner`, and a new
  `asRetiredWriteDoorSession(client, sub)` for the three two-session lock-order cells (W14c, D4c,
  D4d), which drive raw SQL on their own pooled clients.
* `revoke` keeps its bare name and is still driven as `clara_authenticated`, because 0273 did not
  move it. The asymmetry at a call site is the point.

**MEASURED, not assumed** (the claim is in the helper header and the README): driving
`propose_vendor_identity_binding` as `clara_fn_owner` with an unknown `sub` raises
`CLR04 actor has no active membership` — the body — while the identical call as
`clara_authenticated` raises `42501` — the ACL, before the body.

This also removed the three raw write mirrors the earlier cut added
(`insertHumanProposedBinding` / `signLiveDirect` / `declineDirect`), which fixes **SPEC-921-D**
(`declineDirect` exported and called by nothing) and **L01-STD-3** (Duplicated Code: the mirrors
hand-copied each door's INSERT/UPDATE with nothing pinning the copy against the live body) by
deletion rather than by adding a pinning cell. `seedLiveBinding` goes back to the real doors, which
also restores the sign **receipt shape** its callers read (`binding_id`, `f2_invoice_prefix`) —
the earlier cut had silently changed it to a table row, which is why x36v.1 failed on
`binding_id returned` and x36v.2 on an undefined prefix.
`vendor-binding-write-doors-revoked.test.mjs` builds its fixture binding the same way now; it
remains the only proof of the denial and still drives `clara_authenticated` at every rank.

`bp1.F1`'s grant invariant ("DROP destroys the ACL — the grant must have been re-made", 0154's own
claim about the recreated 3-arg signer) is **re-trued, not deleted**: the OWNER's EXECUTE is
asserted at every frontier, and the HUMAN's EXECUTE is asserted to track the
`vendor_binding_write_doors_revoked` ledger row, so the cell reads true on both sides of 0273 and
needs no frontier arm to maintain.

**After** (same gate chain, same database):

| file | after |
|---|---|
| `x36-vendor-binding-ceremony` | 11 / 11 / 0 |
| `x36-vendor-binding-resolver` | 7 / 7 / 0 |
| `x36-vendor-binding-dwell` | 5 / 5 / 0 |
| `x30-f1-lcp` | 9 / 7 / 0 / 2 skip (pre-existing F-A2 PR-3 retirements x30.2b, x30.2d) |
| `x31-autopost-lane-unify` | 9 / 9 / 0 |
| `x36-p-round-regressions` | 1 / 1 / 0 |
| `binding-proposal-pr-1` | 111 / 111 / 0 |
| `vendor-binding-write-doors-revoked` | 6 / 6 / 0 |
| `rig-docs-download-door` | 21 / 21 / 0 |

**A rig-state repair that is NOT a code change, recorded because the next person will meet it.**
Three of the 33 bp1 failures were `42601 duplicate declaration at or near "v_c3"`, not `42501`.
Cause: `bp1.C3-identity` recuts `clara._approve_entry_core` and restores it, and the 42501 threw
between the two acts, so the earlier red runs left one planted
`v_c3 text := 'binding_post_time_recheck_v1';` declaration in the LIVE body on `clara_l01`. That
line is a known single insertion after `\ndeclare`, so removing exactly it is its byte-exact
inverse; done. Confirmed afterwards by four batteries that read that body: `a21-adversarial`
15 pass / 12 skip, `a21-watch` 18/18, `f-a2-grants` 14/14, `f-a2-excision` 9/9 — and by
`bp1.C3-identity` and `bp1.C3-spoof-under-stale` themselves, which recut and restore it under sha
verification. I also probed the rest of the rig for drift left by the red runs:
`vendor_identity_bindings.created_by` is still NOT NULL, `clara.control_witnesses` is empty, and
all three door bodies still match 0273's own measured prestate pins (`fe14f239…`, `b56d2554…`,
`b289a0b6…`) byte for byte.

### SPEC-921-B (major) + L01-STD-2 (major) — false claims of repo state in shipped source — **FIXED**

The helper header asserted that `x36-vendor-binding-ceremony.test.mjs` was "RETIRED (see its own
removal note in `packages/db/README.md`'s "0273" section)" — the file was present, untouched by the
diff, and no such README note existed — and that "every OTHER battery … now uses the raw,
door-bypassing builders", when only `seedLiveBinding` had been converted. Both claims went with the
raw builders in `0d3f6a5a7`; `f8870c214` finished the sweep of prose that outlived the revoke:

* `x36-vendor-binding-ceremony.test.mjs`'s header said the file "drives the three GRANTED verbs".
  Only `revoke` is granted now. The header names which role carries which call and points at the
  denial battery.
* `x36c.4`'s comment claimed "the GRANT itself admits `clara_authenticated` broadly; the floor is
  enforced inside the function body." The first half is false since 0273. The cell still proves the
  body's rank floor and now says a viewer trying this for real would be stopped one layer earlier,
  by 42501.
* `x36v.1` was titled "propose -> sign drives a binding to 'live'", which reads as a human
  capability. It names the bodies and the transport.
* `packages/db/README.md`'s `## 0273` section gained the note the helper header used to cite: the
  six batteries, why none was retired, what the `…AsFnOwner` wrappers do, the measurement above,
  and how `bp1.F1` was re-trued.

### SPEC-890-A (minor) — the add-alias cell never drove `origin` — **FIXED, and the first fix was itself vacuous**

Both halves of the cell now drive `cp-alias-origin` off its default, to `former_name`.

The instrument is the **door**, not the control, and that is measured rather than argued. My first
attempt asserted the refused/reopened `<select>`'s `.value` — and the mutant **SURVIVED** it, 3/3
green. In this harness react-dom never writes state back onto a `<select>` node, so the only thing
that had ever set `.value` was `setFieldValue` itself. The two text fields are genuine (react-dom
does assign `.value` on an `<input>`), so the name and basis assertions stand; origin is asked for
where the component's state is observable — the arguments of the next governed call:

* refusal half: the human retries without changing anything; the second (still refused)
  `add_counterparty_alias` must carry `p_origin: "former_name"` with the same alias and basis.
* success half: the reopened dialog gets only a name typed; its `add_counterparty_alias` must carry
  the default `p_origin: "trade_name"` and `p_basis: null`.

**Vacuity control**, run on this rig and restored byte for byte (`git diff --stat` on the component
empty): with `setOrigin("trade_name")` hoisted out of the `if (ok)` branch — the exact mutant the
finding named — the cell goes RED (`expected 'former_name', actual 'trade_name'`), and back to 3/3
once restored.

`counterparty-door-dialogs-draft-rule.test.tsx` 3 tests / 3 pass / 0 fail.

### SPEC-921-C (minor) — the e2e Sign assertions could not fail — **FIXED**

At the base commit Sign rendered only under `binding.status === "proposed" && canSign`, and the walk
stubbed a single `live` row, so both Sign assertions counted 0 on the pre-#921 code too. The fixture
carries two rows now: the live one (which keeps Revoke asserted) and a historical `proposed` one,
under a different counterparty name because the name assertion is an exact-text match and two rows
sharing a name would trip strict mode. The walk asserts that second name is on the page, so the Sign
assertions can never be asserting the absence of a control on a row that is not rendered. Revoke is
pinned at `toHaveCount(1)` as well as visible — one per LIVE row, not one per row.

**Vacuity control**, run on this lane's own triple and restored byte for byte: with a Sign trigger
put back on a proposed row the walk goes RED on this cell
(`toHaveCount(expected) failed, Received: 1` — 10 passed / 1 failed), and back to 11 passed once
restored.

### SPEC-921-E (note) — **FIXED.** The block header claimed the walk stubs
`list_vendor_bindings`/`get_vendor_binding`; it stubs only the first. `get_vendor_binding` is read
from inside the Revoke dialog, which this walk never opens. The header now says so, and says who
has to add the stub.

### SPEC-921-F (note) — **ANSWERED HERE.** "`sign_vendor_identity_binding` (both overloads)" is
satisfied because only one overload is live. Measured on `clara_l01` at the new head:

```
clara.decline_vendor_identity_binding(uuid,text,text)   {clara_fn_owner=X/clara_fn_owner}
clara.propose_vendor_identity_binding(jsonb,text)       {clara_fn_owner=X/clara_fn_owner}
clara.sign_vendor_identity_binding(uuid,text,text)      {clara_fn_owner=X/clara_fn_owner}
clara.get_vendor_binding(uuid)                          {clara_fn_owner=…,clara_authenticated=X/clara_fn_owner}
clara.list_vendor_bindings(uuid)                        {clara_fn_owner=…,clara_authenticated=X/clara_fn_owner}
clara.revoke_vendor_identity_binding(uuid,text,text)    {clara_fn_owner=…,clara_authenticated=X/clara_fn_owner}
clara.reset_binding_decline(uuid,text,text)             {clara_fn_owner=…,clara_authenticated=X/clara_fn_owner}
```

There is exactly one `sign` signature; the 2-arg overload was dropped at 0154 and `bp1.F1` asserts
its absence by `to_regprocedure` at every run.

### SPEC-921-G (note) — no action for this lane, and I did not widen scope to it. The wake/agent
proposal door keeps its grant, deliberately per the brief, and nothing in this round touched it.
Worth the integrator's eye if O37's retirement is meant to cover the wake lane too.

### SPEC-890-B (note) — no action required, as the reviewer said; the fourth dialog's two cells stay
where they are in `counterparty-identity-correct.test.tsx`.

### L01-STD-4 (note) — no action required of this lane. `rig-meta.mjs`'s two narrowing edits are
unchanged by this round; the integrator watches for a conflicting concurrent edit.

---

## Gates, with counts

Every command run from `C:\Users\zhant\Desktop\clara-wt\635`, Node 22, with
`PGHOST=127.0.0.1 PGPORT=55741 PGUSER=postgres PGDATABASE=clara_l01 CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1`
for db work. `CLARA_RIG_ALLOW_RESET` / `CLARA_RIG_ALLOW_ROLE_SWEEP` never set.

| gate | result |
|---|---|
| the nine db files touched, full `--import` gate chain | 180 tests / 178 pass / 0 fail / 2 skip (see the table above) |
| `operation-census.test.mjs` | 10 / 10 / 0 |
| `rig-isolation.test.mjs` | 23 / 22 / 0 / 1 (the standing #866 skip) |
| approve-path witnesses after the drift repair | `a21-adversarial` 15 pass/12 skip, `a21-watch` 18/18, `f-a2-grants` 14/14, `f-a2-excision` 9/9 |
| `counterparty-door-dialogs-draft-rule.test.tsx` | 3 / 3 / 0 |
| whole `apps/web` unit suite (`node scripts/run-tests.mjs`) | **4844 tests / 4842 pass / 0 fail / 2 skip** |
| `pnpm --filter @clara/web e2e firm-navigation-walk` on 3500/3501/3502 | **11 passed** |
| `pnpm typecheck` | Done (apps/web, packages/runtime) |
| `CI=true GITHUB_ACTIONS=true pnpm lint` | exit 0 |

No migration was edited, so nothing needed `CLARA_MIGRATION_REDO`, no prestate pin moved, and
`apps/web/tests/firm-scope-db-pins.corpus.ts` needed no re-measurement (it is in the web suite above
and passes). `packages/runtime` untouched, so no frozen-workflow or parts-parity run was owed beyond
the ones `pnpm lint` already performs.

Known Windows-only reds per RIG.md were not encountered in anything I ran, and nothing was "fixed"
that belongs to that list.

## Docs updated

* `packages/db/README.md` — the `## 0273` section's new "What the rig batteries did about it."
* Module-level headers in `x36-vendor-binding-helpers.mjs`, `x36-vendor-binding-ceremony.test.mjs`,
  `x36-vendor-binding-resolver.test.mjs`, `binding-proposal-pr-1-helpers.mjs`,
  `vendor-binding-write-doors-revoked.test.mjs`.
* No new vocabulary, so `CONTEXT.md` is untouched.

## Successor contracts

None. Nothing in this round touched a frozen chat or Work tool.

## Follow-ups worth filing

1. **A pinning cell for the door bodies' write shape.** L01-STD-3's underlying worry survives the
   deletion of the mirrors in a milder form: nothing in the suite fails if a future migration recuts
   `propose` / `sign` / `decline` while the batteries keep driving them as the owner. 0273's own
   prestate pins the three `prosrc` shas today, but only at apply time.
2. **The wake lane (SPEC-921-G).** If O37's retirement is meant to cover
   `wake_propose_vendor_identity_binding` too, that is a separate ticket; today it is the one path
   left that can create a binding, and nothing can sign one.
3. **`<select>` state is unobservable in the web harness.** `setFieldValue` can drive a
   `NativeSelect`, but nothing reflects react state back onto the node, so any cell asserting a
   select's value after a re-render is vacuous. A `selectValue`-style harness helper (or a documented
   refusal) would stop the next lane repeating my first attempt.

## Anything unverified

* The approve-path restore is argued to be byte-exact from the shape of the known insertion (a
  single line after `\ndeclare`, removed) and corroborated by five batteries that read that body —
  but there is no independent `prosrc` sha pin for `clara._approve_entry_core` anywhere in the repo
  to check it against, so "byte-exact" is reasoning plus corroboration, not a pin. The integrator's
  from-scratch chain on a disposable cluster settles it.
* I did not run the full `packages/db` suite (441 files) — the work order's rule 8 asks for the
  touched files with the full gate chain plus `operation-census` and `rig-isolation`, which is what I
  ran. The six batteries this round repaired are the ones 0273 broke, established by reproducing
  every one of the 57 failures first and by the spec review's own independent sweep.
