# #647 — fix round 1 (review verdicts: STANDARDS, SPEC, adversarial migration + accounting safety)

**Branch** `impl/647-counterparty-identity` · **worktree** `C:\Users\zhant\Desktop\clara-wt\647` · rig PG17
`127.0.0.1:55506` / `clara_647` · Playwright `3280/3281/3282`. Reviewed HEAD `e7b905e4`; fix round HEAD
**`bda62a1d`**. All evidence is **local**; **hosted evidence pending**.

```
bda62a1d docs(db): #647 — 0200's tail says what the two deeper source FKs now are
850f2b65 fix(db,web,runtime): #647 review round 1 — the identity lane's lock order, the pin trio, and the closed kind vocabulary
```

Migration `0200` changed, so the rig was **rolled back and re-applied from a true prestate**: the PG17
cluster `rig647` was recreated (`mkrig.sh rig647 55506` — a dropped *database* is not enough, 0154 pins the
**cluster-wide** `clara%` role count and a second chain on a live cluster fails "the clara role count moved
from 14 to 18"), `clara_647` recreated, then `pnpm db:migrate` → **194 new / 194 total**, `identity prestate
(substrate) OK` + `identity prestate (privilege) OK` + `identity tail: OK`, `pnpm db:seed` → 2 files, and a
second `pnpm db:migrate` → **0 new / 194 total** (no checksum drift). Done three times in this round; the
numbers below are from the **last** one, whose bytes are the committed ones.

## Finding → what I did → evidence

| Finding (lens, severity) | What I did | Evidence |
|---|---|---|
| **647-A1 revision-lock-deadlock** (adversarial, **blocker**) | Red cell first: `p647.revisions.lock_order` races `retire_counterparty_alias` against `rename_counterparty` on a party whose current name is also a live alias (A→TMP→A), 10 rounds. Then **two** fixes, because the first was not enough: (1) `clara._append_counterparty_identity_revision` no longer chooses `revision_n` under `clara.counterparties … for update`; it chooses optimistically against `uq_cir_counterparty_revision` and retries a `unique_violation` in its own subtransaction, bounded at 5, exhausting into a retryable `40001` (the 0059:235 idiom). (2) `fk_cir_counterparty` is **dropped**: an FK check takes `FOR KEY SHARE` on the counterparty row, so the foreign key was re-taking the very lock I had just removed. Tenant congruence is now a **lock-free** `exists()` assertion inside that one ungranted writer (no application role holds DML on the relation). `fk_cir_alias` stays a real FK — its KEY SHARE is always a self-lock. | **Red:** 6/10 rounds `40P01`, with the victim's own PL/pgSQL context captured: `while locking tuple in relation "counterparties" … FOR KEY SHARE` inside the revision insert, and `while inserting index tuple in relation "counterparty_aliases"` inside `rename_counterparty` line 36. **After fix (1) alone: 7/10 rounds still deadlocked** — recorded in the migration header. **Green:** 0/10, cell runs in 452 ms. Also: the DETAIL is why `merge_counterparties` (a 0149 splice this ticket may not recut) would have kept the class open if only `rename_counterparty` had been repointed. |
| **647-A2 client-identifier-kind** (adversarial, **blocker**) | Red cell first: `client-identity-section.test.tsx` → "the Kind control is the DATABASE's own closed vocabulary". `AddClientIdentifierDialog` now renders `kind` as the `NativeSelect` idiom `AddCounterpartyAliasDialog` already uses for `origin`, offering exactly `ssm` / `tin` / `bank_account` with their own labels; `kindHint` no longer names `sst` (a kind `client_identifiers_kind_check` refuses); the required-field error for `kind` is gone because a closed select cannot be empty. The Playwright walk drives it with `selectOption`. | **Red** (pre-fix files restored from HEAD): `expected: 'SELECT', actual: 'INPUT'`. **Green:** the cell asserts the three option values in order, that no copy anywhere on the face matches `/sst/i`, and that the door receives `p_kind: "tin"` from the control. Walk: **17/17**. |
| **en-json-third-namespace** (STANDARDS, should) / **SPEC-1** (SPEC, should) | Folded the whole block into `ArApCounterparty.clientIdentifiers` and repointed the two `useTranslations` call sites. `en.json` now has **two** siblings where the review measured three. | `grep -n '^  "ArApCounterparty"\|^  "ClientIdentifiers"\|^  "ClientKnowledge"' apps/web/messages/en.json` → only `ClientKnowledge` (2530) and `ArApCounterparty` (3818). `pnpm lint` → `[check-message-keys] 2966 static t("…") key(s) in apps/web all resolve`. No test hardcoded the namespace, and the rendered strings are unchanged (the walk and the 9 jsdom cells assert the same sentences). |
| **SPEC-2 AC6 loading / partial-stale** (SPEC, should) | Two new cells in `client-identity-section.test.tsx`: **loading** holds every read until the cell releases it, asserts `Loading…` is on screen and that no half is painted as a successful empty while in flight, then asserts the face is terminal once the reads land; **partial** fails `list_counterparty_merge_corrections` with a 500 while the other two answer, and asserts the identifiers and counterparty halves still render with their real counts, that the failure is reported where it failed, and that it is never shown as "no counterparty of this client has been merged". | Both green on the first run — the production code already renders three independent `DataState`s, so this finding was missing **coverage**, not a defect; it is now celled rather than claimed. File: **9/9**. |
| **647-A3 source-pin-coherence** (adversarial, should) | Red arms first, added to `p647.provenance.source_pins` (its title now names them). Then **both** halves of the wall: structurally, the extraction and region pins ride the **triple-key** house pattern (`uq_document_extractions_id_firm_document`, `uq_document_regions_id_firm_extraction` already existed for exactly this), and in the door, `clara.add_counterparty_alias` raises typed `CLR10 source_extraction_not_of_document` / `source_region_not_of_extraction`. `ALIAS_REFUSAL_MESSAGES` in the runtime carrier gained both. | **Red:** `an extraction of ANOTHER CLIENT's document may not ride this client's document` — the call was **accepted**. **Green:** three door refusals (another client's extraction, the same client's *other* document's extraction, another extraction's region) all `CLR10` with the named reason, plus two direct-insert refusals at `23503` for a writer that never goes through a door. |
| **647-A4 carrier-diverges-from-door** (adversarial, note) | Aligned the carrier to the door rather than keeping it stricter: `localAliasRefusal` no longer refuses a **document-only** pin on a non-extracted origin, because neither `0200 §7.1` nor `ck_counterparty_aliases_extraction_pins` mentions `source_document_id`. The unit cell is inverted and says why. | `packages/runtime`: **5/5**. The two new refusal keys are asserted in `ci.5`'s roster. |
| **647-A5 dead-wire-field** (adversarial, note) | Deleted `AgingItem.recorded_counterparty_name` and its jsdoc. | `grep -rn "recorded_counterparty_name" apps/web packages` → no hits. `lib/registers/aging.test.ts` + the touched web files: **100/100**. |
| **647-A6 alias-dialog-stale-draft** (adversarial, note) | `AddCounterpartyAliasDialog` now discards `alias` + `origin` + `basis` when `onSubmit` resolves true, and all three door dialogs' headers now state the one rule they share: a draft **survives a refusal** and is **discarded on success**; `SetCounterpartyIdentifiersDialog` re-seeds on open instead, because its fields are the party's current values rather than a new fact. | Behaviour change only — **no dedicated cell**, stated below under "what I left", and filed as follow-up 5 in the final report. |
| **647-A7 h34-count-provenance** (adversarial, note) | Reworded the final report's H-34 row to "derived from a read that RAN — aggregated in SQL on the list, counted over the returned collections on the detail", and put the same sentence beside the three detail counts in `counterparty-identity-panel.tsx`. | `647-final.md` H-34 row; `counterparty-identity-panel.tsx:325`. |
| **dead-sourcekind-key** (STANDARDS, note) | Deleted the unreachable `ClientKnowledge.sourceKind.counterparty_alias` string. | `grep -rn 'sourceKind\.' apps/web` still resolves only `document_extraction` / `user_statement` from `counterparty-identity-panel.tsx:130`; lint green. |
| **SPEC-3 knowledge-shared exports** (SPEC, note) | Added Assumption 4 to the final report naming the deviation and the vocabulary mismatch that justifies it (`ClientKnowledge.kind.*` / `trust.*` have no counterpart in the identity domain; an alias carries no trust at all in 0200). | `647-final.md` → Assumptions 4. |
| **647-A8 rigs-left-running** (adversarial, note) | Housekeeping, recorded not acted on beyond my own lane: I recreated **my** cluster `rig647` (55506) three times and left it holding the shipped chain. The reviewer's `rig647r` (55606) and `rig647z` (55706) are **still running** and are the orchestrator's to drop (`pg_dropcluster --stop 17 rig647r` / `rig647z`) at wave close; I did not touch them beyond one read-only catalog query on 55606. | `pg_lsclusters` lists rig647 / rig647r / rig647z online. |

## Commands and counts (all local, on the shipped bytes)

| Command | Result |
|---|---|
| `pnpm db:migrate` on a recreated cluster + fresh `clara_647` | **194 new / 194 total**, prestate (substrate + privilege) OK, `identity tail: OK`; re-run **0 new / 194 total**; `pnpm db:seed` 2 files |
| `node --test --test-concurrency=1 $GATES tests/counterparty-identity.test.mjs` (the 29 gate `--import`s) | **19 / 19 pass / 0 fail / 0 skip** (was 18; `p647.revisions.lock_order` is new) |
| same gates × the battery **and** the nine neighbours (`counterparty-merge-pr-1`, `counterparty-alias-kind`, `wave-a-aliases`, `wave-a2-counterparty-kind`, `s6-counterparty`, `p4t2-counterparty-aliases`, `debt-human-read-surfaces`, `knowledge-records`, `knowledge-onboarding-promotion`) | **150 / 150 pass / 0 fail** |
| `tests/operation-census.test.mjs` + `tests/rig-isolation.test.mjs` (no reset flags) | **31 / 30 pass / 0 fail / 1 skip** (T19 destructive) |
| `node packages/db/scripts/operation-census.mjs --strict` | **exit 0** — `called_missing 0/0`, `called_ungranted 2/0`, `frontier_mismatch 0/0`, `named_arg_mismatch 0/0`, `public_execute 0/0`, `unattributed 0/0`, `granted_uncalled 172/172`. **No waiver moved** |
| `node --test tests/counterparty-identity-unit.test.mjs` (packages/runtime) | **5 / 5 pass** |
| `node scripts/check-frozen-workflows.mjs` | **OK — 281 frozen files, 51 `"use workflow"` modules**, exit 0 |
| `node packages/runtime/scripts/check-parts-parity.mjs` | **OK — reader ⊇ emittable**, exit 0 |
| touched web units (`client-identity-section`, `counterparty-identity-panel`, `counterparty-identity-correct`, `counterparty-hygiene-kinds`, `counterparty-hygiene-keyboard`, `aging`, `counterparty`, `counterparty-doors`, `tree`, `routes`) | **100 / 100 pass / 0 fail** |
| `node scripts/run-tests.mjs` (whole `apps/web`), run alone | **3748 tests / 3746 pass / 0 fail / 2 skipped**, exit 0 (+3 cells vs the reviewed run; the reviewed run's `use-clara-thread-stop` load flake did not recur) |
| `pnpm --filter @clara/web e2e counterparty-identity` on 3280/3281/3282, run alone | **17 passed (59.8 s), exit 0** |
| `pnpm typecheck` / `pnpm lint` (worktree root) | **exit 0 / exit 0** — lint: 369 manifest files in order, 2966 static message keys all resolve, token contrast clean |

No run in this round failed for a reason outside my own lane, so there is **no host-contention pair to report**:
every stack named `clara-wt\647` and nothing vanished on a solo re-run.

## What I deliberately left

1. **No cell for 647-A6.** The draft rule is now written in all three dialogs and the behaviour matches the
   sibling that *is* celled, but there is no test that reopens the alias dialog after a successful add. It is
   follow-up 5 in the final report rather than an unstated gap.
2. **`clara.merge_counterparties` is still counterparty-then-alias.** DECISIONS §1.3 forbids recutting it (a
   0149 `pg_get_functiondef` splice), and after this round nothing in the identity lane takes the opposite
   order, so no cycle exists. It is follow-up 4 in the final report so the next owner of that lane inherits
   the rule rather than rediscovering it.
3. **The revision relation's counterparty key is a writer check, not a foreign key.** That is a real trade and
   it is stated in the migration, in the report's Assumptions 5, and here: a counterparty is never deleted by
   any door (retire/merge only), the sole writer is ungranted, and no application role holds DML on the
   relation — but a future direct `delete from clara.counterparties` by the owner would orphan revisions where
   the FK would have refused. **Ratification requested** from the orchestrator on that trade, since the
   alternative (keeping the FK) re-opens a measured deadlock between two shipped human doors.
4. **Nothing hosted.** Every number above is this machine. Hosted evidence pending.
5. **Known Windows-only reds #707 / #693 untouched.**
