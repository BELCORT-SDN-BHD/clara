# waveK / lane 01 — fix round (single implementer)

- **Worktree** `C:\Users\zhant\Desktop\clara-wt\701` · **branch** `riders/wK-lane01` · **base** `ffb629d73`
- **Database** `127.0.0.1:55742 / clara_c01`, 339 files, max `0363_payroll_posting_state_read`
- **New head** `87ab0de1c`
- **Reports fixed against** `waveK-lane01-codereview-spec.json`, `waveK-lane01-review-adversarial.json`
  (there is no `waveK-lane01-codereview-standards.json`; the lane was reviewed on the SPEC and
  ADVERSARIAL axes only)

Six commits on top of the twelve the lane already carried:

| commit | finding(s) | what it does |
|---|---|---|
| `cac1d799f` | SPEC-02, ADV-01 (major) | 0362 §B counts the firm's INSTRUCTION, not the withdrawn row |
| `2c3dc86ba` | SPEC-01, ADV-02 (major) | a payslip that DID post is no longer told it "was not posted again"; 0363 projects `duplicate_scope` |
| `af5cb950a` | ADV-03 (major), SPEC-08 (note) | the standing-instruction family census names the one lawful machine signature |
| `550235668` | ADV-05 (minor) | the read door's ACL asserted as an ALLOWLIST, in 0362's tail and in `p1147.read.acl` |
| `c8f6181bd` | ADV-04 (minor) | the `=0` sentence states the moment it was measured, not a future it cannot see |
| `87ab0de1c` | all of the above | `packages/db/README.md`'s 0362 and 0363 sections, with re-measured post-images |

Both migrations are this lane's own and unmerged, so both were **edited and re-applied**. Everything
below was driven on `clara_c01`; nothing is argued from reading the code alone.

---

## 1 · Disposition, finding by finding

### SPEC-02 / ADV-01 — `plans_still_posting` counted the withdrawn ROW · **FIXED**

**Reproduced.** The new cell `p1147.withdraw.counts_across_a_restatement`
(`packages/db/tests/standing-instruction-agent-read.test.mjs`) drives, through the estate's own
doors: record → a real `close_prep` wake plan (`wake12`) → **restate the reason** → withdraw. Against
the shipped body it failed `expected 1, actual 0`, with the plan re-read as root and still
`status = 'active'`. That is the review's own drive, in a cell.

**Why the state is real.** 0338's record door is version-forward (`0338:436`): a restated reason — or
simply recording the instruction again after a withdrawal — withdraws the live row as *superseded by
a restated standing instruction* and inserts a fresh one with a new id, precisely so a plan written
while the old row stood keeps reading the basis it was written under. That plan goes on citing the
superseded id, and `authority_ref ->> 'id' = v_row.id::text` cannot see it.

**Fix** (`packages/db/migrations/0362_standing_instruction_agent_read.sql` §B). The predicate is now
the whole `(firm_id, instruction_key)` family:

```sql
and ap.authority_ref ->> 'id' in (
      select fsi.id::text from clara.firm_standing_instructions fsi
       where fsi.firm_id = v_firm and fsi.instruction_key = v_key)
```

The firm wall, `status = 'active'`, `authority_kind`, the `firm_standing_instruction` kind test and
the TEXT comparison of the citation are unchanged. The family is reached through the ROWS rather than
through `authority_ref ->> 'instruction_key'` (which `0338:1102` also writes) because `id` is the
citation `clara._authority_ref_refusal` itself keys on: a plan the estate can still resolve is a plan
this count can still see. The door's `comment on function` and the README say so.

**Green after.** 9/9 in that file, and `p1147.withdraw.counts_only_what_still_posts` (the sibling-firm
and paused-plan cell) still passes, so the widening did not leak across firms or count a paused plan.

### SPEC-01 / ADV-02 — the document page's panel on the SUCCESS path · **FIXED**

**Reproduced.** `p1148.read.posted` seeds the payroll chart and drives the ordinary unattended
posting path (`seedPayrollChart` + `readPayrollDoc`, month 2026-09). The run posts ONE approved entry
from the document, and `clara.get_payroll_posting_state` — called as firm A's **viewer** — answers
`verdict: blocked`, `rung: no_duplicate_entry`, `reason: duplicate_entry` with 0343's sentence
*"… is already posted (…). This payslip was not posted again — open that entry to decide whether this
is a correction or a re-upload."* The panel rendered that verbatim for **every** payroll summary, on
the accounting tab, directly under the entries list that already shows the entry it names.

**Fix, at the seam that actually owns the missing fact.** The sentence is neither reworded nor
replaced — one body owns the words. What the page could not work out is *whose* entry the verdict
meant, and the verdict had already decided that (`detail.duplicate.scope`, four scopes, the first of
them `same_document` via `clara._document_posting_entry`). So:

- **0363 §A(3b)** projects that ONE token as `duplicate_scope`, null on every other rung and always
  present. It discloses strictly less than the sentence the same caller already reads, which names
  the entry's memo and posting date; `entry_id`, `status`, `memo` and `posting_date` stay behind. The
  tail now pins `duplicate_scope` in the body text, and `p1148.read.projection` pins seven keys and
  asserts `detail` itself does not cross.
- **`apps/web/lib/documents/payroll-posting-state.ts`** carries the field and the rule, once:
  `blocksOnThisDocumentsOwnEntry(state)`.
- **`apps/web/components/documents/payroll-posting-section.tsx`** renders nothing in that one state.
  A standing failure is still a banner there, exactly as in the not-yet-loaded branch.

**What I deliberately did NOT take.** ADV-02's required fix also asked for silence on
`verdict === 'ready'`. I kept it, with a cell of its own: *"Payroll run … is ready to post but no
entry exists yet — re-file the payslip to post it."* is TRUE, it is the remedy, and the entries list
above can only show that nothing stands. Silencing it would remove real information to fix a defect
it does not have. The three new component cells are the posted state (silent), another document's
entry on the same rung (still spoken — that IS the re-upload the sentence was written for), and the
ready state (still spoken).

### ADV-03 — the family census rested on "STABLE, therefore it cannot write" · **FIXED**

**Reproduced**, on `clara_c01`, inside a transaction that was rolled back
(`scratchpad/adv03_repro.sql`): `clara._adv03_volatile_writer(uuid,text)` VOLATILE, and
`clara.wake_record_firm_standing_instruction(uuid,text)` declared `stable security definer`, owner
`clara_fn_owner`, revoked from public, granted to `clara_agent_ro` alone, calling it. The shipped
census answered `{proname: wake_record_firm_standing_instruction, is_read: true, agent: true,
writers: false}` — so `unlawful` was empty and the cell stayed green — and the same STABLE door
returned a new instruction id with `rows_written = 1`. Rolled back; `leftover = 0`.

**Fix** (`packages/db/tests/prepayment-close-standing-instruction.test.mjs`, `p1050.doors.shape`). The
false sentence is gone. The filter is now a **named permit-list** of the one lawful machine signature
*with its argument list*, keeping the three catalog facts beside it:

```js
const LAWFUL_MACHINE_SIGNATURES = new Map([
  ["wake_get_firm_standing_instruction", "p_instruction_key text"],
]);
```

A permit-list does not go stale on this file's 0338 frontier: where 0362 has not applied the family is
empty and there is nothing to refuse. Naming the ARGUMENTS also closes **SPEC-08**'s residue — a later
`wake_get_firm_standing_instruction_for(firm uuid)` now fails here, not only in #1147's behavioural
cell.

**Vacuity control** (WORK-ORDER rule 4). The write twin was planted **for real**, the cell was seen
RED naming it by signature —
`[{"proname":"wake_record_firm_standing_instruction","args":"p_firm uuid, p_reason text",…}]` — then
both functions were dropped (`leftover 0`, zero rows written) and the file re-run **18/18 green**.

### ADV-05 — the tail's ACL check was a four-name denylist · **FIXED**

**Reproduced**, inside a rolled-back transaction: after
`grant execute on function clara.wake_get_firm_standing_instruction(text) to clara_freeform_ro`,
**neither** arm of 0362's tail fired (`shipped_check2_fires = f`, `shipped_check2b_fires = f`) while
`has_function_privilege('clara_freeform_ro', …) = t`. This cluster carries 20 `clara%` roles; the
denylist named four patterns, and one name it did name — `clara_agent_chat_ro` — does not exist here.

**Fix**, in both places, in 0363's own `p1148.acl.census` shape: read every `clara\_%` role off
`pg_roles`, add PUBLIC, ask `has_function_privilege` one at a time (which also catches a privilege
arriving through PUBLIC, where an ACL string would have to be parsed), and require the reached set to
be **exactly `{clara_agent_ro}`**; `clara_fn_owner` is excluded because it owns the body.

**Both halves were DRIVEN against the defect.** With the grant planted for real: `p1147.read.acl`
went RED — *"the read door is reached by clara_agent_ro, clara_freeform_ro"* — and a redo of 0362
refused and rolled back:

```
migrate: FAIL — migration 0362_standing_instruction_agent_read failed and was rolled back:
0362 tail: clara_freeform_ro also reach(es) the read door, which is clara_agent_ro's alone
(acl clara_fn_owner=X/clara_fn_owner|clara_agent_ro=X/clara_fn_owner|clara_freeform_ro=X/clara_fn_owner)
```

The grant was then revoked and both went green.

### ADV-04 — the withdrawal / `close_prep` race · **FIXED AS FAR AS THIS TICKET REACHES**

**Confirmed mechanically**: `clara._prepayment_schedule_core`'s wake arm, read off the installed body
on `clara_c01`, resolves the live instruction with a plain

```sql
select fsi.id, fsi.recorded_by into v_si_id, v_directing
  from clara.firm_standing_instructions fsi
 where fsi.firm_id = p_firm and fsi.instruction_key = 'prepayment_schedule_at_close'
   and fsi.withdrawn_at is null
 limit 1;
```

— no `for share`, no `for update` — while the withdraw door's own `for update` is on the instruction
row. Nothing serialises them; the adversarial round drove it with two real connections (plan
`92c820ab…` committed after a receipt that had answered 0).

**What I did not do, and why.** Serialising them means recutting a schedule core. The closing plan
groups L1 explicitly so that it "recuts neither" (§ Risks 4), and #1147's own *Out of scope* forbids
changing what withdrawal does. So the lock is a **successor item** (§4 below), not a change here.

**What this ticket owns is the sentence, and the sentence promised a future.** The `=0` arm of
`standingWithdrawnPlans` read *"Nothing was running under it, so nothing keeps posting."* It now
reads **"No schedule opened under it was running when you took it back."** — exactly what was
measured, at the moment it was measured. The `one` and `other` arms are unchanged (an undercount
there is not a false statement). The always-shown `standingWithdrawalStopNote` still tells a person
where a running schedule is paused or ended. The card cell for the zero arm now also refuses the
promise by name (`doesNotMatch(/nothing keeps posting/i)`), so a later reword cannot put it back.
0362 §B's header, which claimed the count reports "the world the withdrawal leaves behind", was
corrected in the same round.

### SPEC-03 — the owner ruling is not on the ticket · **STAYS, and it is not the lane's to close**

The ticket asks for the question to be recorded ON #1147. WORK-ORDER rule 2 and this worker's own
prompt both forbid writing to GitHub ("never comment on or close a GitHub issue", "never write to
GitHub"). The question is written out in full in `packages/db/README.md`'s 0362 section (*should a
firm that let Clara amortise its prepayments thereby also let Clara recognise its deferred revenue*,
and *should withdrawal pause the plans it authorised*), in `reports/waveK-lane01-ticket1147.md`
follow-up 2, and in the migration header. **Orchestrator action owed**: post it as a comment on
#1147, or file it as an owner-ruling ticket, before the wave closes.

### SPEC-04 — the from-scratch chain · **STAYS, and it is the integrator's**

`CLOSING-PLAN.md` risk 1: *"Nobody runs a second from-scratch chain on this cluster; the from-scratch
proof is the integrator's, on a disposable cluster."* Four lanes share `rl02` and `0154` pins the
cluster-wide role count. What the lane CAN prove, it re-proved after the edits — see §3.

### SPEC-05, SPEC-06, SPEC-07, ADV-06 — notes · **no change, by the reviewers' own reading**

- **SPEC-05** (no viewer-rank check in the wake read): the reachable floor is the credential's, which
  is strictly narrower. `p1147.read.floor_is_the_credential` drives both halves. Nothing to fix.
- **SPEC-06** (the third refusal `CLR10 / not_a_payroll_summary`): kept, and carried in the successor
  contract so the chat tool never renders it as a firm-facing sentence.
- **SPEC-07** (`document_id` as a sixth key): the caller's own argument, echoed back. Still true; the
  key set is now seven, and `p1148.read.projection` pins it.
- **ADV-06** (`recorded_by` is a uuid no wake door resolves): recorded in the successor contract
  below. Projecting a display name is a later cut's business.

---

## 2 · Migration handling

Both files are this lane's own and unmerged, so both were edited. `CLARA_MIGRATION_REDO` (#957)
admits only the **highest applied** version, so the frontier was lowered first by deleting the
unmerged ledger row above the target — the route lanes 01, 05 and 08 of wave 2 recorded — and the
ordinary apply re-landed it. **339 ledger rows before and after every cycle.**

| cycle | what ran | result |
|---|---|---|
| 1 | delete 0363's row → `CLARA_MIGRATION_REDO=0362…` → ordinary `migrate` | 0362 redone (`cba07bdb…`), 0363 re-applied, 339 total |
| 2 | `CLARA_MIGRATION_REDO=0363…` (0363 was the frontier) | 0363 redone (`58a3ac5a…`) |
| 3 | grant planted → delete 0363's row → redo 0362 | **refused by the new tail and rolled back** (the ADV-05 drive) |
| 4 | grant revoked → redo 0362 → ordinary `migrate` | 0362 redone (`dea2860e…`), 0363 re-applied, 339 total |

Final ledger: `0362_standing_instruction_agent_read` =
`dea2860efae88070261b722e89d0b28fda78f57ae721f048a9ca3f2aebe2aa6e`,
`0363_payroll_posting_state_read` =
`58a3ac5a8cb082fc946b54d37737f2bba605f57f6f357a469274124c6c5132e0`. A plain `migrate` afterwards
reports **0 new applied · 339 total**, no drift.

**Prestate pins — unchanged, and re-verified.** No pinned pre-image moved: 0362 still pins
`clara.withdraw_firm_standing_instruction` at `c63c1fd09bc9…` (0338 §G), 0363 still pins
`clara._payroll_posting_verdict` at `4c350623e415…`, `clara._human_ctx` at `d1a8a1940ffe…` and
`clara.role_rank` at `5ced25aed03f…`. **Post-images, re-measured for the integrator:**

| body | post-image sha256(prosrc) |
|---|---|
| `clara.withdraw_firm_standing_instruction(text,text,text)` | `1d057b74827f665baef0aedf7266cebff7194238224e4a0d268fe75f94642df9` |
| `clara.wake_get_firm_standing_instruction(text)` | `f69794dae2da194d08561526aa09c33f57536095eb91768a624e0bb607e07e46` |
| `clara.get_payroll_posting_state(uuid)` | `c846456ffd80e51e23d02fbd652f1aebaeab822ac8ae012c961b2c03a3b1c26d` |

**The FIRST-APPLY branch of both prestates was re-proved after the edits** (wave-3 addendum: a redo
only ever takes the "my own body is already live" branch). Inside one transaction that was rolled
back: 0338 §G's own `create or replace` statement was re-run to restore the pre-image (measured back
as `c63c1fd09bc9…`), the new read door was dropped, and 0362's §0 block was run **verbatim** →
`NOTICE: 0362 prestate OK -- read door FIRST, withdraw door FIRST`. The same for 0363: door dropped,
§0 run verbatim → `NOTICE: 0363 prestate: OK -- the read door is FIRST APPLY; the verdict is at its
measured pre-image and ungranted`. Both rolled back; the live catalog afterwards reads 339 files and
the three post-images above.

No migration number was taken: the fix round stayed inside `0362` and `0363`, so nothing from the
`0380` overflow block was requested.

---

## 3 · Gates, with counts

Database env throughout: `PGHOST=127.0.0.1 PGPORT=55742 PGUSER=postgres PGDATABASE=clara_c01
CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1`. No reset flag was ever set.

| gate | command | result |
|---|---|---|
| the three touched db files | `node --test --test-concurrency=1 <154 preintegration gates> tests/standing-instruction-agent-read.test.mjs tests/payroll-posting-state-read.test.mjs tests/prepayment-close-standing-instruction.test.mjs` | **35 tests / 35 pass / 0 fail / 0 skipped** (9 + 8 + 18) |
| rule 8's two estate gates | same chain, `tests/operation-census.test.mjs tests/rig-isolation.test.mjs` | **33 / 32 pass / 0 fail / 1 skipped** |
| the touched web files + rule (d)'s corpus | `node --import ./test/bootstrap.mjs --import tsx --test components/documents/payroll-posting-section.test.tsx lib/documents/payroll-posting-state.test.ts components/firm-admin/standing-instructions-card.test.tsx lib/firm/standing-instructions.test.ts tests/firm-scope-db-pins.test.ts` | **53 / 53 pass / 0 fail** (8 + 6 + 11 + 6 + 22) |
| whole web unit suite | `node scripts/run-tests.mjs` from `apps/web` | **5273 tests / 142 suites / 5271 pass / 0 fail / 2 skipped** (143.8 s) |
| typecheck | `pnpm typecheck` | Done — `apps/web` and `packages/runtime`, no errors |
| lint | `pnpm lint` | **exit 0** |
| lint as the runner sees it | `CI=true GITHUB_ACTIONS=true pnpm lint` | **exit 0** |
| frozen law (rule (a)) | `node scripts/check-frozen-workflows.mjs` | OK — **347** frozen files verified, append-only vs `origin/main`; 60 `"use workflow"` modules all frozen+registered |
| frozen law, the diff | `git diff --stat ffb629d73...HEAD -- packages/runtime` | **empty** |
| migration ledger | `pnpm --filter @clara/db migrate` | 0 new applied · 339 total · no drift |

**Rule (d), stated with the run rather than assumed**: `apps/web/tests/firm-scope-db-pins.test.ts`
ran 22/22 green and **no barrier entry is owed** — `grep -c pg_get_functiondef` is **0** in both
`0362_standing_instruction_agent_read.sql` and `0363_payroll_posting_state_read.sql`, so
`firm-scope-db-pins.corpus.ts` is untouched by this round.

**Browser walks**: none touched, and none exists over either surface — `grep -rln` across
`apps/web/e2e/` for `payroll-posting` / `payrollPosting` / `payroll_posting` and for
`standingWithdrawnPlans` / `take this back` returns nothing. No `pnpm --filter @clara/web e2e` run was
owed on the 3600/3601/3602 triple.

**Shared files.** `apps/web/messages/en.json`: one line changed, in my own key, at its existing
sorted position (`git diff --stat` = 1 insertion / 1 deletion); an independent, non-`JSON.parse`
scanner reports `standingWithdrawnPlans`, `standingWithdrawalStopNote` and `payrollPosting` occurring
exactly once each. `apps/web/test/manifest.txt`, `packages/db/package.json` (`$GATES`) and
`packages/db/tests/rig-meta.mjs` were **not** touched by this round — no test file was added and no
new catalog name was minted. `packages/db/README.md`: only this lane's own `## 0362` and `## 0363`
sections. `CONTEXT.md`: untouched.

---

## 4 · Successor contracts and items for a later cut

1. **`read_firm_standing_instruction` (chat tool, over `clara.wake_get_firm_standing_instruction`)** —
   unchanged by this round except that the projection's `recorded_by` is a **bare user uuid** and no
   `clara.wake_get_%` door in the catalog resolves a uuid to a person (ADV-06, measured: 0 of 11).
   The successor tool must therefore say *that* an instruction stands and *when*, and must NOT attempt
   to name the member, until a later cut projects a display name beside the uuid.
2. **`read_payroll_posting_state` (chat tool, over `clara.get_payroll_posting_state`)** — the answer
   now carries **seven** keys: `document_id`, `sentence`, `verdict`, `rung`, `reason`,
   `completeness`, **`duplicate_scope`**. A model-lane twin must project `duplicate_scope` too, and
   must apply the same rule the page applies: when `rung = 'no_duplicate_entry'` and
   `duplicate_scope = 'same_document'`, the verdict's sentence is about the document the caller is
   already holding and must not be repeated back as a reason it "did not post". Refusals:
   `CLR11` for a document that is not this firm's AND for one that does not exist (one message, no
   oracle), `CLR04` at the viewer floor, and `CLR10 / not_a_payroll_summary`, which a surface answers
   with silence and a chat tool must never render as a firm-facing sentence.
3. **A share lock on the instruction row in the wake arm** (ADV-04). To make `plans_still_posting` a
   statement about the world after the withdrawal rather than about the withdrawing transaction's
   snapshot, `clara._prepayment_schedule_core`'s wake arm needs `for key share` on the instruction row
   it resolves. That is a recut of a schedule core, which this lane was grouped specifically not to
   do. Worth a ticket.

---

## 5 · Follow-ups worth filing

1. **The owner ruling on #1147 is still unrecorded on the ticket** (SPEC-03). Orchestrator action; see
   §1.
2. **The from-scratch chain through 0363** (SPEC-04). Integrator, disposable cluster; both tickets'
   AC7 stays open until it runs.
3. **The `same_document` / draft case reads oddly, though not falsely.** When the entry standing on
   the document is a DRAFT, 0343's sentence is *"Payroll run … is drafted (…) and waiting for a
   checker to approve it. Nothing was posted again."* The panel is silent there too, under the one
   rule, and the draft's status is visible in the entries list immediately above. If a firm wants the
   "waiting for a checker" line on the document page, that is a sentence the page would own — a
   product decision, not a defect.

---

## 6 · Unverified

- **Hosted evidence: none.** Everything above is local, on `clara_c01`.
- **The from-scratch chain: NOT run here** (closing plan risk 1 assigns it to the integrator).
- **The ADV-04 race was not re-driven with two connections in this round.** Its mechanism was
  re-confirmed off the installed body (no share lock in the wake arm's resolving statement) and the
  two-connection drive is the adversarial report's, with the plan id it produced. My change to it is
  a sentence, and that sentence is covered by a cell.
- **No browser walk was run**, because none touches either surface (measured, §3).
