# wave 2 · lane 04 · ticket #977 — what counts as a person's instruction for an `authority_ref`, in both doors that resolve one

**Status: DONE.** Branch `riders/w2-lane04`, worktree `C:\Users\zhant\Desktop\clara-wt\651`,
database `clara_l04` (127.0.0.1:55744). Base `23cfad947b5598214168ba9c43d391b4e16aa745`.

```
git log --oneline 23cfad94..HEAD
852ce993e docs: #977 one definition of a person's instruction, and where it is written down
f3088913c test(db,runtime): #977 what must NOT have moved, and the belt rig's own instruction
2e966eb20 fix(db): #977 authorship is half the rule, not a consequence of the kind
05e64e1dd fix(db): #977 the plan door reads the same definition, on its own error class
f63b16ccb fix(db): #977 the signing door reads one shared definition of a person's instruction
bc3dd6372 docs(db): #976 the particulars completion-wall fold and its grants-table row   (#976, already landed)
e0f02845d fix(db): #976 fold the fixed-asset particulars completion wall into one routine (#976, already landed)
4a27e15a0 docs(db): #973 module docs for the leg-pairing fold, wiki-lint fix, test cleanup (#973, already landed)
75b9f0df4 fix(db): #973 restore both splices 0227 and 0042 install into the poster's live body
e71f1541e fix(db): #973 fold the depreciation leg-pairing aggregation into one routine
497d02455 test(db): #972 leave x41.s4's allow-list alone — the b3 residue is an A6 window, not an explained red
44449bcdb fix(db): #972 the fixed-asset birth honours the enrolment watermark on every firing
```

**The ticket was verified live on this branch before building.** `gh issue view 977 --comments`
returns the AI-triage body plus ONE comment, dated 2026-09-20, carrying both the **owner's ruling**
and the newest **Agent Brief** — so that comment is the contract, and it is narrower than the body's
own recommendation. The ruling: *"only the chat-lane arm of the existing resolution changes, in both
places that resolve an authority reference today, the depreciation authority signing door and the
accounting plan creation door; the Work arm needs no code change."* Nothing on this branch or on
`main` had touched either resolution: measured on `clara_l04` before writing a line, the inline
chat-lane existence test lived in exactly **three** `clara` bodies —
`sign_depreciation_authority`, `create_accounting_plan` and `_accrual_plan_core` — and both doors'
own comments still said `kind`, `status` and author are deliberately not read. The ticket was fully
live.

## Seams I tested at (written down before the first test)

The brief's "Key interfaces", one to one:

1. **`clara.sign_depreciation_authority(uuid,uuid,text,jsonb)`** — the fixed-asset lane's human
   door, ADMIN+, CLR38 axis. Driven through `signWithRef` (`humanQuery` at its own floor).
2. **`clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,int,text,date,date,jsonb,text,text)`**
   — the plan lane's human door, BOOKKEEPER+, CLR10 axis. Driven through `createAccountingPlan`
   (`humanQuery`).
3. **The catalog** (`pg_proc.prosrc`, `pg_proc.proacl`) — the repo's documented structural standard
   for a recut body and a new ungranted internal (prestate `sha256(prosrc)` pins, tail assertions,
   a `rig-meta` cohort, a shape cell). Work order rule 4 says this standard wins over "no
   structural cells", and I say so here.
4. **`CONTEXT.md`** — the shared vocabulary document the brief's third key interface names.

No test touches an internal collaborator: the one function this ticket mints
(`clara._authority_ref_refusal`) is read only off the catalog, never called directly, and it is
ungranted so no persona could call it at all.

## Acceptance criteria

| AC | Verdict | Evidence |
|---|---|---|
| A `chat_task` reference naming a `wake` task is refused by both doors, with a reason token distinct from the unresolved-reference one | **done** | `p977.sign.machine_task_refused` (CLR38) and `p977.plan.machine_task_refused` (CLR10), each asserting `detail.reason = authority_ref_not_human_instruction`, `≠ authority_ref_unresolved`, and `detail.kind`/`detail.id` naming the row refused. Each cell then drives a reference naming NO row and gets `authority_ref_unresolved` back, on the same door, in the same run — the two tokens are proved distinct against each other, not merely named. |
| A `chat_task` reference naming any other non-`chat_turn` kind is refused the same way, including a kind that carries an author | **done** | The same two cells' second arm drives an `autodraft` task minted **with** a named author (`mintAgentTaskRef(client, { kind: "autodraft", author: true })`) — refused identically. `p977.both.unauthored_chat_turn_refused` closes the other side: a `chat_turn` with a NULL author is refused too, at both doors. |
| A `chat_task` reference naming a `chat_turn` with a named author is accepted by both doors, exactly as today | **done** | `p977.both.person_instruction_accepted`: the signature goes `live`, the receipt AND the row both carry the instruction, the window floor is stamped; the plan is created `active` at revision 1 and its row carries the instruction. Plus the whole pre-existing fixed-asset suite, whose shared fixture now mints exactly this shape and which is green (109/109, below). |
| An `accounting_work` reference is accepted exactly as today | **done** | `p977.both.accounting_work_ref_unchanged`: accepted at both doors; another client's Work still answers `authority_ref_unresolved` (the ladder is firm AND client, unloosened). The cell first reads `clara.accounting_work.initiator`'s `attnotnull` off `pg_attribute` — the column the owner's ruling rests on — rather than taking it on trust. The migration's `accounting_work` arm is a byte-for-byte carry-through of the old `exists(...)` test. |
| Both doors resolve through the one shared definition, and each has its own test proving a machine-created row is refused | **done** | `p977.definition.one` reads both bodies off `pg_proc`: both call `clara._authority_ref_refusal(`, neither still carries the inline existence test, that inline test now survives in **exactly one** `clara` function (`_accrual_plan_core`), and **exactly** `{create_accounting_plan, sign_depreciation_authority}` read the one definition. The migration re-proves the same four facts at apply time (T.2, T.2b, T.4c, T.4d, T.4f, T.4g). Each door has its own refusal cell (AC1 row). |
| Ships as a new migration at the next free number; no already applied migration is edited | **done** | `packages/db/migrations/0250_authority_ref_human_instruction.sql`, the number reserved in the prompt. `git diff BASE..HEAD --stat -- packages/db/migrations/` shows only `0247` (#972), `0248` (#973), `0249` (#976) and `0250` (mine) **added** — nothing edited. |
| The shared domain vocabulary document states, once, what counts as proof | **done** | `CONTEXT.md`, new term **Authorising instruction**, in the house `term / _Avoid_` shape, placed beside **Accounting basis** (it is cross-lane vocabulary, not fixed-asset vocabulary). |

## The design call, and why it is a reason token rather than a boolean predicate

The brief's Key Interfaces sketch says "one shared **predicate** … answering whether the reference
names a person's instruction". Its **acceptance criteria** ask for two things a boolean cannot carry
at once: a refusal token *distinct from* the unresolved one, and each door keeping *its own existing
error class*. Two booleans (`_exists` + `_is_human_instruction`) would restore exactly the defect
this ticket exists to close — two definitions to keep in step, in a fixed order each caller must get
right. So the one definition returns the ANSWER:

```
clara._authority_ref_refusal(p_ref_kind text, p_ref_id uuid, p_firm uuid, p_client uuid) returns text
  null                                   -- it names a person's instruction: accept
  'authority_ref_unresolved'             -- it names no row of this firm AND client at all
  'authority_ref_not_human_instruction'  -- it names a real chat-lane row that is not an instruction
```

and each door maps that token to its own `raise` — CLR38 with the fixed-asset lane's sentences,
CLR10 with the plan lane's. Neither door spells the unresolved token as a literal any more: both
build their `detail` from the token the definition *returned*, so the two can never drift apart. The
migration's T.4 proves the definition still names both tokens.

It takes `(kind, id)` rather than the whole jsonb object because each door's own
`authority_ref_invalid` shape wall — object-ness, admitted kind, parsable id — is explicitly
UNCHANGED by the ticket and stays in the door; the definition receives the pair those walls have
already validated. It raises, rather than quietly answering "unresolved", on a kind neither door
admits: that line is unreachable from either door today, and it is there so a future lane that
widens the admitted kinds finds it instead of a silent refusal.

## Vertical slices (work order rule 4), with the red each one started from

1. **`p977.sign.machine_task_refused`** written first, without a frontier gate, and run against
   `clara_l04` before `0250` existed → **RED**: `p977.sign.wake: expected the refusal
   CLR38/authority_ref_not_human_instruction but the call SUCCEEDED`. A `wake` task — no author by
   construction — signed a depreciation authority. That is the defect, measured. → minted
   `clara._authority_ref_refusal` with a `kind = 'chat_turn'` chat arm and recut the signing door;
   applied 0250 (**first attempt after one tail fix**, see below); **GREEN**. Then added the
   frontier gate, the gate module, the `package.json` chain entry and the `rig-meta` cohort.
   Commit `f63b16cc`.
2. **`p977.plan.machine_task_refused`** + **`p977.definition.one`** → **RED** for their own
   reasons (`p977.plan.wake: … the call SUCCEEDED`; `clara.create_accounting_plan … reads the shared
   definition` failing). → recut the plan door in the same file; **#957 redo**; **GREEN**.
   Commit `05e64e1d`.
3. **`p977.both.unauthored_chat_turn_refused`** → **RED**: `p977.sign.unauthored_chat_turn: …
   the call SUCCEEDED` — the kind test alone let a turn nobody signed through. → the chat arm became
   the conjunction `kind = 'chat_turn' AND created_by is not null`; **#957 redo**; **GREEN**.
   Commit `2e966eb2`.
4. **The "unmoved" half** — `p977.both.person_instruction_accepted`,
   `p977.both.accounting_work_ref_unchanged` and the house shape cell `p977.definition.shape` —
   written last and green on arrival, and reported as what they are: non-regression cells pinning
   the two shapes that were accepted before the ruling and must still be. Their bite is proved by
   the two vacuity controls below, not by a red. Same commit carries the runtime belt rig's own
   fixture fix. Commit `f3088913`.
5. Docs in their own commit (`852ce993`), as rule 9 asks: `CONTEXT.md`, `packages/db/README.md`,
   `packages/db/tests/README.md`, `packages/runtime/README.md`, and the compat fixture's header.

One tail assertion had to be corrected during slice 1 before 0250 would apply at all (T.2d asserted
the signing door still names `authority_ref_unresolved` as a literal — it does not, by design, since
it raises with the returned token). The migration was rolled back cleanly by the runner, the
assertion moved onto the shared definition as T.4, and the file applied. That is recorded here
rather than hidden: it is the prestate/tail machinery doing its job on its own author.

## Migration

`packages/db/migrations/0250_authority_ref_human_instruction.sql` (664 lines) — mints
`clara._authority_ref_refusal(text,uuid,uuid,uuid)` (ungranted internal, `stable`, SECURITY DEFINER,
owned by `clara_fn_owner`, `search_path` pinned) and recuts both doors to read it. Both recut bodies
were generated FROM the live `prosrc` measured on this rig, with exactly two substitutions each
(`v_ok boolean` → `v_reason text`, and the resolution block) — a `diff` of the generated body
against the live one shows only those two hunks, so nothing else in either door moved by accident.

**Prestate `sha256(prosrc)` pins, all MEASURED on `clara_l04` before any edit, off `pg_proc.prosrc`:**

| body | sha256(prosrc) | kind |
|---|---|---|
| `clara.sign_depreciation_authority(uuid,uuid,text,jsonb)` | `25eee9776eb30aefe1b7b1f7157df2b3032daa132b12f0526ad8d8bbb4e480c3` | recut |
| `clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,int,text,date,date,jsonb,text,text)` | `06effb07798e69f8f316c2b97ab4e766cad7895f8cca45508699be31f8e5b7d3` | recut |
| `clara._accrual_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,int,text,date,date,jsonb)` | `b3bd10065ed7a117ff3a324eff7ebebfcd06adaac38300fc9d77b99ef1759da8` | unmoved (out of scope by the ruling) |
| `clara.create_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)` | `aa917dfd042be429eb62c96c7b2075003c097ac445e77d9a35501762740f506f` | unmoved (passes its ref through) |

The prestate also proves, before touching anything, that the inline chat-lane existence test lives
in **exactly three** `clara` functions — the pre-condition for calling this a fold of a duplication
rather than an independent rewrite, and the proof that the accrual lane's copy is the one the ruling
leaves alone.

**Post-image pins, measured after apply:**

| body | sha256(prosrc) |
|---|---|
| `clara._authority_ref_refusal(text,uuid,uuid,uuid)` | `c4148f6d95cd03876d6b8efe97d658e07e493e1743a075e1fe81901fd8fa61b7` |
| `clara.sign_depreciation_authority(uuid,uuid,text,jsonb)` | `d1294a8559eb8f5813b017bf71a1e747f92d94f4f1f0f375d6e3a4633a0bcf7f` |
| `clara.create_accounting_plan(…)` | `84b67058244bfe795245ee224733bd0b09940331b1cf75f4cb6654d84e88d6c4` |
| `clara._accrual_plan_core(…)` | `b3bd10065ed7a117ff3a324eff7ebebfcd06adaac38300fc9d77b99ef1759da8` (unmoved) |
| `clara.create_prepayment_schedule(…)` | `aa917dfd042be429eb62c96c7b2075003c097ac445e77d9a35501762740f506f` (unmoved) |

Migration checksum recorded in `clara.schema_migrations`:
`869abb2dd4f74b55a31213901c4e1439bfbcbc048811adc660a7588aa9e34f2c`. 233 migrations applied on this
rig.

**Redo, and I used it.** The file was applied once and then re-applied **three** times with the
supported #957 mode (`CLARA_MIGRATION_REDO=0250_authority_ref_human_instruction`, with
`CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1`): once per slice (the plan door, the author conjunct) and
once to restore the rig after the behavioural vacuity control below. Every statement in the file is
`create or replace`, and the prestate admits a redo LOUDLY on exactly one signal — the shared
definition already being live — skipping the two recut pins (whose pre-image on a redo is the file's
own prior effect) while the tail re-proves the whole post-state unconditionally.

**Tail T.1–T.5.** T.1/T.1b: the definition exists, `stable`, definer, owned by `clara_fn_owner`,
`search_path` pinned, zero grants beyond the owner's own. T.2/T.2b/T.2c: the signing door reads it,
no longer carries the inline existence test, and branches on the new token. T.3–T.3d: the signing
door keeps ONE `pg_proc` row, its owner, its definer flag, its pinned `search_path`, no PUBLIC
EXECUTE, and `clara_authenticated` still holding EXECUTE. T.4/T.4b/T.4b2: the definition names BOTH
tokens and reads BOTH the task's kind and its author, and requires the author. T.4c–T.4e: the same
three facts for the plan door. T.4f: the inline existence test now lives in exactly
`{_accrual_plan_core}` — named, so neither zero nor a third copy passes. T.4g: exactly
`{create_accounting_plan, sign_depreciation_authority}` read the definition. T.4h–T.4k: the plan
door's own shape and grants. T.5: the two out-of-scope bodies are byte-for-byte unmoved.

**`rig-meta.mjs` cohort.** `_authority_ref_refusal` is a brand-new ungranted internal, so it gets its
own bimodal cohort `AUTHORITY_REF_HUMAN_INSTRUCTION_0250_COHORT` plus its gated `cohortFailures(...)`
call, exactly as 0248's and 0249's do — folding it into an older cohort would report that cohort
PARTIAL on every database between the two frontiers.

## The vacuity controls I ran (not just described)

1. **Behavioural anchor.** Replaced `clara._authority_ref_refusal`'s chat arm with the PRE-#977
   existence-only resolution (a direct `create or replace` as `clara_fn_owner`, outside the
   migration) and re-ran the battery: **3 of 7 cells reddened, each for the right reason** —
   `p977.sign.machine_task_refused` (`p977.sign.wake: … the call SUCCEEDED`),
   `p977.plan.machine_task_refused` (same, CLR10) and `p977.both.unauthored_chat_turn_refused`.
   `p977.both.person_instruction_accepted` and `p977.both.accounting_work_ref_unchanged` stayed
   **green**, which is exactly right: those pin what did NOT move. `p977.definition.one` stayed
   green too, and that is honest rather than a gap — it measures STRUCTURE (one definition, read by
   two doors), and the broken body was still that one definition. Restored with the #957 redo;
   re-measured `sha256(prosrc)` afterwards: `c4148f6d…`, identical to the post-image pin above.
2. **ACL anchor.** `grant execute … to public` on the definition (a direct grant, outside the
   migration): `p977.definition.shape` reddened immediately. Revoked; green again;
   `select proacl` reads exactly `{clara_fn_owner=X/clara_fn_owner}`, matching the post-migration
   state.
3. **The absent-migration red.** Slice 1's cell was written and run BEFORE `0250` existed, without
   the frontier gate, so the red it produced was the door's real pre-change behaviour rather than
   the gate's "migration absent" message. The gate was added afterwards and the focused shape
   (gate module NOT preloaded) is what every count below reports, at ZERO skips.

## Gates, with counts

| gate | command | result |
|---|---|---|
| new db test file, FULL gate chain (54 `--import`) | `node --test --test-concurrency=1 $GATES tests/authority-ref-human-instruction.test.mjs` | **7 pass · 0 fail · 0 skip** |
| new db test file, focused (gate module NOT preloaded — final acceptance shape) | `node --test --test-concurrency=1 tests/authority-ref-human-instruction.test.mjs` | **7 pass · 0 fail · 0 skip** |
| every db test that rides the changed shared fixture, plus the FA lane, FULL gate chain | `… $GATES tests/client-onboarding-identity … depreciation-history … f-a4-pr1c-rungs … fa-depreciation-leg-fold … x41-depreciation … x56-rest-j … fa-particulars-completion-fold … fa-birth-watermark … x41-wave-d-a-fa … x41b0-surface … fixed-asset-acquisition` | **109 pass · 0 fail · 0 skip** |
| the plan / prepayment / accrual lanes + gate-chain census + redo battery, FULL gate chain | `… $GATES tests/accounting-plans … accounting-plan-occurrences … prepayment-schedule … prepayment-occurrences … accrual-adjustments … knowledge-firm-defaults … preintegration-gate-chain … migrate-redo` | **119 pass · 0 fail · 0 skip** |
| SQL-function gates (this ticket adds a function) | `node --test --test-concurrency=1 tests/operation-census.test.mjs tests/rig-isolation.test.mjs` | **33 tests · 32 pass · 0 fail · 1 skip** (T19 destructive; reset flags NEVER set) |
| WHOLE `packages/db` suite, once | `pnpm test` (from `packages/db`) | **5223 tests · 5125 pass · 3 fail · 95 skip** — all THREE failures attributed to **#972**, not to #977; see "Three whole-suite reds, and whose they are" |
| runtime test touched | `node --test tests/reconcile-fa.test.mjs` (from `packages/runtime`) | **1 pass · 0 fail · 0 skip** |
| frozen workflows | `node scripts/check-frozen-workflows.mjs` | **OK** — 312 frozen files verified, 55 `"use workflow"` modules all frozen+registered, no manifest diff |
| parts parity | `node packages/runtime/scripts/check-parts-parity.mjs` | **OK** |
| `pnpm lint` (worktree root) | — | **exit 0**; `check-wiki-dynamic-sql`: **1413** clara function definitions (was 1412 after #976 — exactly the one new function) and **212** change-of-record patches (unchanged: this migration uses plain `create or replace`, never a `pg_get_functiondef`+`execute` splice) |
| `pnpm typecheck` (worktree root) | — | **FAILS, inherited from BASE, in `apps/web`** (see below); `packages/runtime` alone: **exit 0** |
| `apps/web` unit suite / browser walks | not run | this branch touches **no** `apps/web` file — `git diff 23cfad94..HEAD --stat -- apps/web` is empty |

### Three whole-suite reds, and whose they are (a finding for the integrator)

The work order scopes db gates to the files a ticket touches; I ran the WHOLE `packages/db` suite
once anyway, because #977 recuts two doors the estate reaches from many lanes. It surfaced **three**
failures. **None is #977's**, and the evidence for each is below. I did not fix them: they belong to
a sibling ticket's files and rule 5 forbids widening. They are, however, reds the integrator will
hit, and the earlier tickets' own reports did not run a whole-suite pass.

1. **`x41.s4` (`tests/x41-round35-tie.test.mjs:243`) — #972's recorded lane-rig residue,
   reproduced byte for byte.** The failure names client `x41_b3_12b745`, account `200-D41`,
   `cost_diff=77000`, `accum_diff=0`, `pre_cost=77000`. #972's own report names the same two
   clients (`x41_b3_12b745`, `x41_b3_e58a5a`) with the same figures, and its commit
   `497d02455` is the deliberate decision to leave `ALLOWED_RED` alone. `x41-round35-tie.test.mjs`
   is byte-identical to BASE (`git diff 23cfad94..HEAD -- <that file>` is empty), and my own cells
   build `p651_…` and `w623_…` clients, which that sweep does not see.

2 & 3. **`x42.r7.s5c.5` (`tests/x42b2-r7-s5-clock.test.mjs:140`) and `x42.s5c.6`
   (`tests/x42b2-s5c-clock.test.mjs:369`) — #972's migration 0247 put a clock token into a body
   whose roster says it has none.** Both cells re-derive arm (D)'s "bare-token" roster from the
   live catalog and compare it with a pinned measurement. The diff between `actual` and `expected`
   is **exactly one name**: `_tf_fa_acquisition_birth`. `0247_fa_birth_watermark.sql` splices
   `coalesce(new.approved_at, now())` into that trigger (its own marker constant, `0247:78` and
   `0247:262`), and `packages/db/tests/x42-s5-helpers.mjs:1161-1166` still states in prose that the
   birth trigger "copies columns and takes its dates from the entry it fires for" and therefore
   carries no clock — so the roster was never updated for 0247. Both x42 test files and
   `x42-s5-helpers.mjs` are byte-identical to BASE on this branch.
   **`_authority_ref_refusal` appears in NEITHER list**, which is the direct proof that #977's new
   function contributes nothing here: it is `stable` and reads no clock at all.

The 95 skips are the suite's standing set, not mine: 42 destructive cells (`CLARA_RIG_ALLOW_RESET`
never set, per RIG.md), ~26 F-A2 PR-3 retired-subject cells, 8 bank-substrate-absent cells, and
frontier gates. **My own battery counts ZERO skips in both the focused and the full-gate-chain
shapes.**

**The inherited typecheck red — the same one #972's, #973's and #976's reports name.**
`apps/web/components/documents/document-kind-dialog.tsx(95,22): error TS2552: Cannot find name
'DOCUMENT_KINDS'` and `(95,42): error TS7006: Parameter 'k' implicitly has an 'any' type`. Verified
inherited rather than mine: that file's last change is `4b1376f40 merge: riders wave 1 lane 08`,
at or before BASE, and `git diff 23cfad94..HEAD -- <that file>` is empty. This is the wave's
integrated head not typechecking, not #977.

## Docs

- **`CONTEXT.md`** — new term **Authorising instruction** (house `term / _Avoid_` shape, `<!-- #977 -->`
  fenced like #721's), beside **Accounting basis**: what proves a person and not a process gave an
  instruction, that a Work is proof as it stands, that a turn is proof only when a person typed it
  and it names its author, that a run the workspace started for itself is not an instruction even
  when it names the person it was started for, and that the two refusals are distinct. It is
  cross-lane vocabulary, which is why it sits with the general terms rather than in the fixed-asset
  block.
- **`packages/db/README.md`** — a grants-table row for `clara._authority_ref_refusal`; the
  `fa_depreciation_authorities.authority_ref` column row amended to name the new rule and its token;
  and a paragraph on the ruling itself (why the `accounting_work` arm is unchanged, why the accrual
  lane's third copy is deliberately untouched and pinned unmoved, why `create_prepayment_schedule`
  needed no line).
- **`packages/db/tests/README.md`** — the six `p977.*` cells, why the battery is cross-lane and
  imports each lane's own world rather than building a third, why `refusedWith` is stricter than
  `refuses`, the fixture that had to move, and the gate module's migration-order position.
- **`packages/runtime/README.md`** — the `chatTurn_v20` prepayment successor's
  `{kind:"chat_task", id: ctx.taskId}` authority now carries a REQUIREMENT rather than a convention.
- **`packages/db/tests/fa-authority-sign-compat.mjs`** header — the residual it used to name is
  recorded as CLOSED, pointing at the battery that now proves the rule.

## The fixture that had to move (and why it is evidence, not collateral)

`fa-authority-sign-compat.mjs`'s `mintChatTaskRef` minted an **`autodraft`** task — and #651's own
comment on that helper says why: the ladder proved PROVENANCE, not authorship, so any kind resolved
and `autodraft` was the cheapest arm to mint. That is the defect, live in the repo's own fixtures:
**the entire fixed-asset suite signed its authorities with a machine-created row, and the door
accepted every one.** It now mints a `chat_turn` carrying an author through a real
`clara.chat_sessions` row — which also removed the trigger-off fallback the old helper needed for a
not-yet-active client, because a chat session only asks that its client be IN the firm.
`mintAgentTaskRef` beside it mints the four shapes the refusal cells need (`chat_turn` ±author,
`autodraft`, and `wake` as LABELLED fixture DML with the insert trigger off for exactly one
statement inside one transaction, because a wake task's firm and client are stamped FROM its
intent's event and the cell needs the row on a named client).
`packages/runtime/tests/reconcile-fa.test.mjs` inlines the same change for the belt rig (that lane
keeps its own pool and deliberately does not import across packages).

## Successor contract

**Nothing is OWED to a frozen body — but one frozen-adjacent contract changes meaning, and here it
is in full.**

No frozen chat or Work body is edited, and none needs an edit: no door gained or lost a signature,
an argument, a grant or an error class. What changed is what one existing argument must now name.

- **Name:** `clara.create_prepayment_schedule(p_client, p_source_entry, p_expense_account,
  p_expense_basis, p_purpose, p_authority_ref, p_op_key)` — the door
  `packages/runtime/lib/prepayment-schedule-basis.ts`'s `prepaymentDoorPayload` builds for the
  not-yet-cut `chatTurn_v20` tool `start_prepayment_schedule_work`. It passes `p_authority_ref`
  straight through to `clara.create_accounting_plan`, so #977's rule applies to it unchanged.
- **Zod input:** `startPrepaymentScheduleWorkInputSchema` — **unchanged**. It deliberately accepts
  no authority reference at all ("a tool that accepted an authority id would let a model name the
  instruction that authorises it"), which is exactly what keeps this contract safe.
- **Door call, argument order:** unchanged, named arguments, as
  `packages/runtime/lib/prepayment-schedule-basis.ts` already writes it; `p_authority_ref` is
  `{ kind: "chat_task", id: ctx.taskId }`.
- **Refusal mapping:** ONE new token, in two places that each already carry its sibling.
  `packages/runtime/lib/prepayment-schedule-basis.ts`'s `PREPAYMENT_REFUSAL` (line 112) today ends
  its authority family at `authorityRefUnresolved: "authority_ref_unresolved"`; it gains
  `authorityRefNotHumanInstruction: "authority_ref_not_human_instruction"`, with the sentence
  *"That reference names a run, not an instruction somebody gave."* (CLR10 axis).
  `packages/runtime/lib/depreciation-run.ts`'s `DEPRECIATION_REFUSAL_MESSAGES` today carries
  `"CLR38:authority_ref_invalid"` and `"CLR38:authority_ref_unresolved"`; it gains
  `"CLR38:authority_ref_not_human_instruction"` → *"The instruction this authority cites is a run
  this workspace started, not something a person asked for."* Both are forward-looking rows in
  modules whose own headers already say so — neither lane's tool can raise them today — and
  neither module is frozen, so a later cut adds them as ordinary edits.
- **Part kind:** unchanged (`prepayment_schedule_configured`).
- **Prompt stanza:** one sentence, for whichever `chatTurn_vN` cut ships the tool: *"The instruction
  that authorises a schedule is the conversation you are in — never a run, a wake or an autodraft.
  You do not name it; the tool supplies it."*
- **Why the contract still stands:** `ctx.taskId` in a chat-lane run IS a `chat_turn` carrying an
  author — `clara.begin_chat_turn` inserts `created_by = p_author` after checking that author is a
  live active member of the firm (`0006_runtime_core.sql:988`, and the membership check just above
  it). A successor that called either door from a **wake** or **autodraft** run would now be
  refused, and that is the ruling working, not a defect.

## Follow-ups worth filing

0. **#972's 0247 left two x42 clock-roster cells red** (see the finding above). `clara._tf_fa_acquisition_birth` now carries `now()` and belongs in arm (D)'s bare-token roster; `packages/db/tests/x42-s5-helpers.mjs`'s `FA_ACQUISITION_0216_CLOCK_NAMES` comment still asserts the opposite in prose. One name added to the roster plus a corrected comment fixes both cells. It is #972's file and #972's migration, so I left it alone — but it is a lane red, not a Windows-only one, and the integrator will hit it.

1. **The accrual lane's third copy.** `clara._accrual_plan_core` (0222) still resolves an
   `authority_ref` by the bare existence test, for `clara.create_accrual_adjustment`. The owner's
   ruling of 2026-09-20 names two doors and the brief puts every other lane out of scope, so it is
   untouched and PINNED unmoved (prestate and T.5) rather than quietly left behind. It is now the
   only `clara` body carrying that fragment — T.4f asserts that by name, so the day somebody adopts
   the shared definition there, this migration's own tail tells them. **This is the one place where
   the firm can still get two meanings for one word, and it should be a ticket.**
2. **The three doors' shape walls are still three copies.** The `authority_ref_invalid`
   object/kind/id wall is duplicated verbatim in `sign_depreciation_authority`,
   `create_accounting_plan` and `_accrual_plan_core`. #977 explicitly leaves it alone (each door
   keeps its own `authority_ref_invalid` refusal); folding it is the natural sequel to (1).
3. **The web surface still offers `chat_task` as a free-text instruction kind.**
   `apps/web/components/registers/fa-authority-ceremony.tsx:204` lets a human pick `chat_task` and
   type an id. After #977 more of those ids will be refused, with a NEW token the surface has no
   message for. Out of this ticket's scope (no `apps/web` file is touched), but a ticket should give
   that token a sentence in `apps/web/messages/en.json` and, better, replace the free-text id with a
   picker over the client's own turns.

## Anything unverified

- **Hosted: nothing.** Every figure here is local, on `clara_l04` at 127.0.0.1:55744.
- The **from-scratch** proof of 0250 (a chain 0001→0250 on a disposable cluster) is the
  integrator's; RIG.md forbids a second from-scratch chain on a lane cluster, so I did not run one.
  My prestate pins were measured on THIS rig's live catalog (0001..0234 + 0247 + 0248 + 0249 + this
  branch's own commits), which is the closest a lane worker can get.
- I did **not** verify that no OTHER `clara.agent_tasks` row in a hosted database is currently cited
  as an authority by a row written before 0250. The ruling is forward-looking and 0250 backfills
  nothing: `clara.fa_depreciation_authorities.authority_ref` and
  `clara.accounting_plans.authority_ref` are immutable once stamped, so any historical row that
  cited a machine-created task keeps citing it. Whether that wants a survey (or a report) is a
  question for the owner, not something this ticket's brief asks for.
- The claim that a chat-lane `ctx.taskId` always carries an author is read off
  `clara.begin_chat_turn`'s source (`0006:975-995`) and the kind-vocabulary migrations, not from a
  live census of hosted `agent_tasks` rows.
