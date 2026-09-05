# PROGRESS archive — 2026-09, part 2

*Opened on **2026-09-06**, at the production ceremony's clock-out, for the same reason part 1 was:
`PROGRESS.md` could not take the new "all three arms deployed" posture block without breaching the
repo's 500-line document ceiling.*

*It holds the **"THE REPAIR SESSION LANDED / NOTHING IS DEPLOYED YET" posture block of
`PROGRESS.md` as it stood immediately before the 2026-09-06 ceremony truing** — the merge table of
all nineteen PRs and the three-arm deploy plan — moved BYTE-FOR-BYTE and verified present here
before `PROGRESS.md` lost it. Its claim "NOTHING IS DEPLOYED" was true when written and is now
superseded; the deploy is recorded in
[`docs/ops/runtime-deploy-2026-09-05-v75-and-db-0165-0176.md`](../../ops/runtime-deploy-2026-09-05-v75-and-db-0165-0176.md).*

**md5 of the moved block, computed on both sides of the move:**
`e467b7c8894622471ce78a4267eda705` (84 lines, 7881 bytes).

---

**⇢ 2026-09-05 — THE REPAIR SESSION LANDED (superseded above: it is now deployed).** The session the owner opened
at ≈09:00 MYT on 2026-09-04 ran to ≈17:00 MYT on 2026-09-05 and put **eighteen pull requests,
#543…#560**, through the ladder against issue **#541**'s authenticated e2e audit, the owner's own
UIUX flaws list and the beta handover's rows. **All eighteen are merged**, the last three on
2026-09-05 — #556 `autoDraft` v10 at 09:19Z, #557 firm and client home at 12:04Z, #559 the rulings
docs at 12:55Z. Read a PR's verdict from
`gh pr list --state merged --search "merged:>=2026-09-04"`, never from this paragraph.

**What landed, by area** (merge shas from `gh`, times converted from the UTC stamps at UTC+8):

| area | PR | merge | what it closed |
|---|---|---|---|
| entry / signup | #544 | `e9dbf094` | confirm-code link, honest pending copy, password policy, Stripe key-class gate, `customer_email` — H-35 · H-38 · CB-AE2E-003/006 |
| statement lane | #545 | `a2d098f2` | `statementFacts` **v3** — period from the statement date with a stated basis, witness→roster institution normalisation, task settlement on step failure — H-02 · H-03 · H-05 |
| journals | #548 | `144f0a8f` | entries data table, one Approve plus a Posted legend, clarification question text — CB-AE2E-021/022 · H-32 · H-33 · 裁-187 |
| onboarding | #546 | `aa5fef4a` | typed answers, settled receipt, scope invalidation, add-client, dialog scroll — H-26/27/28/29/30/50/51 · CB-AE2E-008/023/024 |
| chat rail | #547 | `d1b12f9b` | Enter-to-send, thread menu, typed bank act and pack cards, tool-call status — H-24 · 裁-117 · C6 |
| firm space | #550 | `c21f26c3` | needs-you what/why/next/when, agent task detail, capability-gated admin controls (**the high-stakes threshold control removed, 裁-187**) — CB-AE2E-014/018/025/026/033 · H-25 |
| bank / close / registers | #549 | `90b59cc1` | statement header pair, dialogs that stay open on refusal across 15 wrappers, four opening gates, restart close — H-06 · H-11 · H-16 · H-34 · H-54/56 · seven CB-AE2E rows |
| shell | #553 | `80e42bf7` | responsive firm shell (drawer, overflow nav, overlay rail), favicon, rank-shaped ⌘K — CB-AE2E-019 · H-31 · C-43 |
| documents | #555 | `6bad969b` | MIME-gated open-in-new-tab plus report-only CSP, page-overlay evidence viewer, tiered extraction — **C-07** · D1/D2/D3 · CB-AE2E-022 |
| documents e2e | #560 | `2f736758` | the overlay measurement reads the overlay layer, not the first hidden svg |
| runtime ops | #558 | `2060c762` | per-lane boot probe, the pool error contract (裁-149 · **ARCHITECTURE §4.3**), pooler CA in the image, `/build-info`, classifier recall harness — H-48 · C-04 · H-43 · CB-AE2E-035 · H-04 |
| DB — close and documents | #551 | `d28b6a75` | document-kind codeability table, honest close gates, classification resolved on `set_document_kind`, `apply_coa_template` refuses an open plan (**裁-193**) — H-12 · H-22 · H-29 · H-53 · H-55 |
| DB — reads and doors | #552 | `5007bbcc` | own DPA signature, client egress state, firm timeline, chat archive, counterparty identifiers, build frontier, DR canary registry — CB-AE2E-007/018/035 · H-09 · H-49 |
| docs | #543 · #554 | `dbaf9056` · `0f2f44de` | 裁-186…190 and ADR-0078; 裁-191 · 裁-192 |
| autoDraft v10 | #556 | `9ed75f49` | exact constraint-name error map (no masked CLR23), kind-scoped alias unique, owner-floored sales-lane activation — H-17 · H-19 · CB-AE2E-012 |
| firm + client home | #557 | `127c4513` | firm home dashboard and client workspace situation board, tax tab — E-1 · F-1 · CB-AE2E-032 |
| rulings docs | #559 | `f57f6af4` | 裁-193…197 and the 裁-149 clause-2 erratum |

**The database sets.** `packages/db/migrations` now carries **0165…0175** on `main` (eleven files,
counted by `ls`), with **0176** riding #556. **SIX bodies owe a D1 write-quiesce window** across five
of those files, named in their own headers: `clara.set_document_kind` (`0169`),
`clara._gate_outstanding_items` (`0172`), `clara.apply_coa_template` (`0173`),
`clara._tf_chat_session_update()` and `clara._tf_counterparty_update_0011()` (`0174`), and
`clara._persist_statement_core_v2` (`0175`, which asks for the `statement_facts` lane to be quiesced
specifically). `0166`, `0167`, `0168`, `0170` and `0171` state in their headers that no window is
owed.

**What it proved.** The three sources reconciled into one register and every item was anchored to
code before a lane opened, so the fixes landed against measured coordinates rather than descriptions.
**裁-187's abolition is now visible in the product** — the Admin high-stakes threshold control is
gone (#550) and the journals surface shows one Approve (#548). **The statement lane, the coder and
the close gates — three of the four failures the 裁-184 walk found — have code on `main`.**

**What it did NOT do. NOTHING IS DEPLOYED.** No as-run record under `docs/plan/completed/` carries a
2026-09-05 date, and the deploy ceremonies of **裁-189** have not run — **裁-198 opens them the
evening of 2026-09-05**, once the chain has landed (it has) and a hand-dispatched sweep on the FINAL
`main` is green on all 13 jobs, read from `gh run view --json jobs`. The order is fixed and it is
not optional:

1. **The DB ceremony for `0165`…`0176`** from merged `main`, with the six D1 write-quiesce bodies
   above. **裁-198's shape: backup first and verified · ONE write-quiesce window with the runtime
   STOPPED, not six narrow ones · per-step rollback recorded step by step.** Stopping the runtime is
   what makes `0175`'s "quiesce the `statement_facts` lane" unconditional. **`0174` adds
   `clara.chat_sessions.archived_at` and widens the chat-session update trigger, and `apps/web`
   already ships code that reads it**
   (`apps/web/components/clara/ClaraThreadMenu.tsx`, `apps/web/lib/clara/useActiveThread.ts`) —
   **so the Worker must not be promoted before this ceremony, or
   every session list 500s.**
2. **Runtime v75** from merged `main`. It clears H-01, the v71↔schema skew that logs every ~2 s.
   **Gated by 裁-199's floor:** per-KIND recall with the new prompt ≥ the live prompt's, kind by kind,
   **and zero new rows the new prompt gets wrong at confidence ≥ 0.8 — one blocks the image.**
3. **The web Worker**, last. There is no repoint rollback (裁-156); a broken Worker is fixed forward
   by re-promoting a walked version.

**ALL THREE RAN on 2026-09-05 evening — see the posture block above.** The 裁-199 gate result and
its caveat, and the nine deviations, are in the as-run.

**Nine tickets are queued and not started**, in the order the orchestrator will open them: **(1)**
DB-D, H-21 the onboarding interview's captures projection · **(2)** the consent lane (裁-186, the
firm-level DPA-stage declaration) · **(3)** DB-C, the wall-removal lane (裁-188) · **(4)** L10
`chatTurn` v18 (H-07 · H-08) · **(5)** the web copy sweep, which runs last among the web lanes ·
**(6)** reporting H-15 · **(7)** the required browser-smoke CI job (裁-192, CB-AE2E-036) · **(8)**
H-47, the re-migration preflight and runbooks · **(9)** CB-001, the Terms document kind, which needs
an owner sitting. **Then the three chat tickets of 裁-197, in the ruled order (iii) → (ii) → (i):**
chatTurn tools and cards for the five gaps ≈1.5 units → real readers for the nine ids-only part kinds
≈1 unit → provisional streaming text in the rail ≈0.7 unit.

**The owner's own list, unchanged and still owed:** the favicon assets · the Stripe dashboard edits
(H-37 the product description, H-39 the duplicate webhook endpoint) · the two Supabase auth decisions
(H-40) · the Resend cap read (H-45) · the two role-password rotations (H-42, 裁-178 accepted) ·
**DPA v2 and the lawyer's pass** (H-36, 裁-125/166).
