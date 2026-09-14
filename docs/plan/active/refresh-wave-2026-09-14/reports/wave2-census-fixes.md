# Wave-2 — the last five db-estate reds (census + agent lane)

`integration/wave-2`, worktree `clara-wt/integration2`, four commits on `3adc3043`: `0cb1da60`
fix(db) #640 house date · `7fb54725` fix(db) #624 registry agent lane · `bad108ec` test(db) §6 agent
sweep · `36ae4425` test(db) S5.25 rosters. Worktree CLEAN; nothing pushed.

**rigw2b** `:55456` queried only (red-first; never reset) → **rigw2c** `:55457/clara_w2`, re-migrated
from scratch on the edited chain (189 migrations; 0191's and 0193's tails green at apply time).

## 1 · agent lane — `rig-runtime-visibility.test.mjs:165`

**Cause** `0191:258` granted `select on clara.document_capabilities` to `clara_agent_ro`. The cell
aborts at its first failure, so **the CI red hid four more**: measured on rigw2b, the wave granted
the lane five tables (0191's two, 0192's three).
**Rule** the brief's two branches, discriminated by whether a definer DOOR already serves the lane.
**Fix** `document_capabilities`: grant and the policy's agent arm withdrawn. 0165 — the model this
registry's own comment cites — rules identically; 0191 already EXECUTE-grants three SECURITY DEFINER
readers; `grep -rn document_capabilities packages/runtime` finds one test, reading as root. 0191's
tail gains sweep (5b), asserting both directions; its read-lane sweep is now per table. The other
four are firm-scoped/global agent reads with **no door** to route through (0192 §H's 0057 dark-grant
ruling), pinned in the census's exception list with reasons, positively verified.
**Evidence** dry-run on rigw2b in a rolled-back txn: the clause fires on the granted catalog, holds
after the revoke, 2 policies, the agent still reads via the door, direct SELECT `42501`. rigw2c:
visibility **8/8**, registry **16/16**, belt **8/8**, field-path **7/7**, filing-conflict **5/5**,
knowledge-records **27/27**.

## 2 · KL roster — `x42b2-r7-s5-census:123`, `x42b2-s5c-clock:230`

**Cause** `clara._assert_plan_schedule` joined it (`0193:1572-1597`). **Measured: it derives no
date** — it validates the caller's `timezone` against the lane's one-member vocabulary and names it
in a typed CLR10. Arm (B)'s law is "a second body owning the house legal DATE"; its detector
(`like '%asia/kuala_lumpur%'`) cannot tell a spelled CONVERSION from a spelled zone NAME.
**Fix** the bodies that DID own a second copy were recut (§3); this one is pinned with its reason —
it cannot call `_book_today()` (a date, not a zone name), the adjudication `_close_gate_undated` and
`_bank_enrolled_fy_months` already carry.
**Divergence, flagged:** the brief expected the roster UNCHANGED, on the premise that this body
computes a KL date. It does not.

## 3 · bare-token roster — `x42b2-r7-s5-clock:140`, `x42b2-s5c-clock:369`

**Cause** ten new names. FIVE were real house dates spelled `(now() at time zone r.timezone)::date`
(`_plan_admissible_event`, `_plan_admit_occurrence`'s due gate, `request_plan_catch_up`,
`preview_accounting_plan`, `list_accounting_plans`) — a second owner AND a transaction-pinned clock
(round-7 finding C). Recut to `clara._book_today()`: same zone by the one-member CHECK (measured
equal under four hostile session zones), all five SECURITY DEFINER. SIX stamp audit INSTANTS only,
pinned with reasons in two stem-gated cohorts; 0191/0194 add none (measured).
**Evidence** red on rigw2b with exactly the four recut names as the diff, which proves the pin
narrow. Green on rigw2c: census **2/2**, r7-clock **2/2**, s5c-clock **2/2**, b0 forks **4/4**+
**4/4**, s5-residuals **9/9**, x42b3-af2-rebook4 **2/2**.

## Gates (rigw2c, the exact 27 gate flags)

**Whole `packages/db` suite 4584 / 4487 pass / 2 fail / 95 skip**, against CI 807b's 4584 / 4484 /
5 / 95 — same tests, same skips, the five reds closed. The 2 are `delta-contract.test.mjs` + child,
whose own name requires a **fresh disposable DB**: I ran batteries against `clara_w2` first, so its
one-way ceremony had already run (`verified_deployed` 6, not 0; the extra is `prepayment_schedule`,
which that cell's formula omits). Green in CI on a fresh `clara_ci`; neither commit touches
evaluator freeze. Named singly: plans **20/20** · plan-occurrences **15/15** (KL due gate) ·
periodic-adjustment **19/19** · operation-census **10/10** · checkout-gate-c3 **69/69**.
Runtime `reconcile*` **110/110**; `plan-occurrence-e2e.mjs` OK (five passes) on a `clara_rt_test`
copy. `pnpm typecheck` green, `pnpm lint` 0. 0191's sha repinned; `firm-scope-db-pins` **22/22**.
ARCHITECTURE §7 + #640's cadence paragraph updated. **Hosted evidence: none.**
