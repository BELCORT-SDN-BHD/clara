# Wave 1 · Lane 07 — final report

**Branch** `riders/w1-lane07` in `C:\Users\zhant\Desktop\clara-wt\657`, cut from `origin/main`
`dd3f8f1d`. Database `clara_l07` @ 127.0.0.1:55747 (unused — no `packages/db` work in this lane).
Playwright triple `https://127.0.0.1:3560` / `3561` / `3562` (unused — no e2e spec file was
touched; see "Gates" below). Web polish lane: eight tickets, all done, `git status` clean at
hand-off, no push, no PR, no GitHub write, no other worktree touched.

```
189890b6 fix(web): #842 render settled_cents as money in the adjustment history disclosure
55fe794a fix(web): #878 stop the document-kind detail dialog offering consent_evidence
518a4d5e fix(web): #896 StateBanner forwards data-testid and other native div attributes
6bf3597f feat(web): #900 InterviewRunCard's answer textarea recomposes onto Field
6f62346e fix(web): #903 needs-you-counts comment and dead watermark field (two items)
ed85beea feat(web): #904 the document detail panel's processing tasks refresh live
93daea1f feat(web): #876 a document-set filings read, switched into intake-receipts
17b581cc fix(web): #987 the closed-fiscal-year refusal names the opening basis, not a journal entry
4619425e fix(web): #900 fix round — drop the lint-banned "#900" hex-lookalike literal
2685e25e fix(web): #896 fix round — typecheck and lint corrections
4fb562a1 fix(web): #904 fix round — drop the lint-banned "#904" hex-lookalike literal
d8501665 fix(web): #903 fix round — typecheck correction
882c4b6e fix(web): #876 fix round — typecheck correction and a stray comment fix
8d10ba83 fix(web): #987 fix round — drop the lint-banned "#987" hex-lookalike literals
```

Order built: #842, #878, #896, #900, #903, #904, #876, #987 — the lane's own listed order. All
eight were verified still live on `main` before building (`gh issue view <n> --comments`; none
carried a further 2026-09-20 owner-ruling comment beyond what the newest Agent Brief already
states). None was already satisfied; each ticket's own "already satisfied" or "still live"
determination is recorded under its own section below. The six "fix round" commits are all
gate-driven corrections found by `pnpm typecheck`/`pnpm lint` (never behavioural) — see "Gates".

---

## #842 — settled_cents rendering in the adjustment history disclosure — **DONE**

| Acceptance criterion | Evidence |
|---|---|
| A cell proves a payroll row with a stated `settled_cents` renders formatted money | `842.stated` in `apps/web/components/accounting/periodic-adjustments-table.test.tsx`: mounts `PeriodicAdjustmentsTable` with a payroll row carrying `settled_cents: 150050`, asserts the text matches `RM 1,500.50` and never contains the raw `150050`. |
| A cell proves a payroll row with `settled_cents: null` renders nothing for that key | `842.absent` in the same file — already passing before the fix (the particulars filter already dropped null/undefined/empty); kept as a guard against a future regression. |

**Verified still live:** the ticket's own triage note said half the defect (the `null` case)
already worked; only the stated-value half was live. Reproduced first: red test showed
`settled_cents150050` (raw integer) before the fix.

**Fix:** `periodic-adjustments-table.tsx`'s particulars loop now renders a `CENTS_PARTICULARS`
set (today: `settled_cents` alone) through the house `Money` component instead of `String(value)`.

**Gates:** `node --test` on the touched file — **2/2 pass** (both before-and-after states
verified: red on the stated-value cell, green after the fix; the absent-value cell green
throughout — the vacuity control for the half that already worked).

**Docs:** no README/CONTEXT.md mention of this rendering rule existed to update; none added (no
new vocabulary).

---

## #878 — `document-admin.tsx`'s classify Select still offers `consent_evidence` — **DONE**

| Acceptance criterion | Evidence |
|---|---|
| The detail dialog no longer offers `consent_evidence` | `document-kind-dialog.tsx` now imports and maps `CLASSIFIABLE_DOCUMENT_KINDS` (from `document-kind-control.tsx`) instead of the full `DOCUMENT_KINDS`. Source-pinned by the new `[878]` cell in `document-kind-labels.test.tsx`: asserts the dialog's source imports `CLASSIFIABLE_DOCUMENT_KINDS` from `./document-kind-control`, maps it, and never maps the raw `DOCUMENT_KINDS`. |
| The sibling list/receipt control is unchanged | `document-kind-control.tsx` was not edited. The pre-existing `[633] fix round` cell (proving `CLASSIFIABLE_DOCUMENT_KINDS` excludes `consent_evidence` and nothing else) still passes unchanged, proving the sibling's own behaviour is untouched. |
| The dialog's comment about the full roster is corrected | The dialog's own comment no longer claims the full roster is a deliberate, permanent choice for this surface; corrected in the same commit. Source-pinned: the new test asserts the phrase `observation it would not change` no longer appears in the file. |

**Verified still live:** the ticket's own triage note confirmed the title's file was stale
(`#646` moved the control from `document-admin.tsx` to `document-kind-dialog.tsx`) but the defect
itself was live — `document-kind-dialog.tsx`'s Select mapped the full roster.

**No DOM-level enumeration of the option list**: `@base-ui`'s Select popup mounts lazily and no
test in this repo drives it open (confirmed by grep across every `.test.tsx` in the repo); the
house proof for "which roster backs this Select" — established by `[633] fix round` for the
sibling control — is the source-level constant the component imports. This file follows the same
idiom rather than inventing a DOM-driving mechanism this codebase does not otherwise use.

**Gates:** `document-kind-labels.test.tsx` — **6/6 pass** (2 pre-existing untouched, 1 comment
updated for accuracy, 1 pre-existing regression guard reconfirmed, 2 new `[878]` cells).

**Docs:** the dialog's own inline comment is the documentation for this rule; corrected in place.

---

## #896 — `StateBanner` silently drops `data-testid` — **DONE**

| Acceptance criterion | Evidence |
|---|---|
| A `data-testid` passed to `StateBanner` is queryable in the rendered DOM | `896.testid` in `apps/web/components/common/state.test.tsx`. Verified red (stashed the fix, re-ran, restored) before landing. |
| The three known call sites (work-question form, prepayment detail, firm-setup checklist) resolve their selectors | `work-question-form.tsx`'s `data-testid="work-question-failed"` was the one call site directly passing the (previously dropped) attribute to `StateBanner`; new cell in `work-question-form.test.tsx` drives a real operational failure (non-CLR 500 → WireError → `refusal.kind: "failed"`) and proves `[data-testid="work-question-failed"]` now resolves — verified red without the fix, green with it. `prepayment-detail.tsx`'s and `firm-setup-checklist.tsx`'s testids sit on an inner span / an outer wrapper div respectively (not on `StateBanner` itself) and already resolved before this change; the Desired Behaviour text itself asks for "no call-site change", so neither was touched — reconfirmed green (`prepayments-render-states.test.tsx`, `firm-setup-checklist.test.tsx`). |
| No other rendered output of any `StateBanner` call site changes | `896.no-drift` cell: title/code/action/silent/tone all render identically; this cell was ALREADY GREEN before the fix (a true additive-change guard, not a red-then-green cell). `896.precedence` cell proves the rest-spread lands BEFORE the component's own computed `role`/`className`/`tabIndex`, so a caller can never override them. |

**Fix:** `StateBanner` now accepts `Omit<ComponentPropsWithoutRef<"div">, keyof StateBannerOwnProps>`
spread onto its root, ahead of its own computed attributes.

**Gates:** `state.test.tsx` (3/3), `work-question-form.test.tsx` (23/23, includes the new cell),
`p6-3-a11y.test.tsx` (DS-03 CONTROL section unaffected) — **all green**.

**Docs:** none needed (an internal component-typing fix; no new vocabulary).

---

## #900 — `InterviewRunCard` is still pre-`Field` — **DONE**

Owner ruling (2026-09-18, ticket comment): only the field-shaped part (the answer textarea) moves
onto `Field`; the card's chrome (upload queue, terminal chips, cancel dialog, card structure)
stays.

| Acceptance criterion | Evidence |
|---|---|
| The answer input renders through `Field` with the same label, help and error behaviour the sibling surfaces show | `interview-run-field-composition.test.tsx`'s `900` cell: a real `<label for=…>` now associates with the answer control (was `aria-label` only), the `FieldDescription` text renders. `aria-label` is KEPT alongside the new `FieldLabel` (deliberately redundant) because two existing cells (`interview-run-keyboard.test.tsx`, `onboarding-progress-sync.test.tsx`) already key off it — this is a labelling recomposition, not an accessible-name change. No `FieldError`: `submitAnswer` has no field-scoped refusal shape today (every failure becomes the card's existing `run.error` banner — chrome, out of scope here); inventing one would be inventing an error state the door does not produce. |
| The card's existing cells (upload queue, cancel dialog, terminal chips) stay green | `900 — no drift` cell: Send, the cancel trigger and the card's own `aria-label` are unchanged; exactly one `<label>` exists in the tree (the run chrome grew none of its own). |
| No transport change in the upload-queue or intake modules | Not touched; `useUploadQueue` and its callers are unedited. |

New message key `Interview.answer.fieldDescription` ("Sent to Clara as your answer to the open
question above."), following the `resolveFieldDescription` precedent `OnboardingItemRow.tsx` set
for the same composition (appendix D #28).

**Gates:** new file (2/2), regression sweep across
`interview-run-keyboard.test.tsx` + `onboarding-progress-sync.test.tsx` +
`interview-run-a11y.test.tsx` + `onboarding-field-composition.test.tsx` +
`thread-live-regions/thread-live-tool-states/thread-menu.test.tsx` — **37/37 green**.

**Docs:** no README mention existed for this control; new message key is its own documentation.

---

## #903 — `needs-you-counts.tsx` and `use-review-queue.ts` small polish (two items) — **DONE**

**Item 1 — the comment**: `needs-you-counts.tsx`'s FIX-4 comment said the live envelope carries
EIGHT counts; nine chips render (`work_questions`, added by #629, after that comment was
written). Corrected the comment to name nine and explain the third addition.

**Item 2 — `watermark`**: `ReviewQueueEnvelope.watermark` was typed but never read — not by
`use-review-queue.ts`, not by `needs-you.ts`'s `listReviewQueue`, not rendered anywhere. Deleted
the field (the ticket's own triage called deletion the evidence-backed default).

| Acceptance criterion | Evidence |
|---|---|
| The comment matches the rendered chip count | `needs-you-counts.test.tsx`'s `903.chips` (9 chips render, one per `ReviewQueueCounts` key — a vacuity guard on an already-correct render) and `903.comment` (source-pins the corrected text; verified red against "EIGHT counts, not six" before the fix). |
| `watermark` is either fully wired to a renderer or fully absent from the types; a grep proves no dangling reference | `use-review-queue.test.ts`'s new `903` cell source-pins `watermark`'s absence from both `needs-you.ts` and `use-review-queue.ts`. |
| The web unit suite stays green | Every fixture explicitly typed `: ReviewQueueEnvelope` had its `watermark` key removed (compile-breaking otherwise): `use-review-queue.test.ts`, `compliance-watch-affordance.test.tsx`, `compliance-watch-receipt.test.tsx`, `needs-you-a11y.test.tsx` (4 spots), `firm-admin-a11y.test.tsx` (1 typed + 2 untyped siblings cleaned for consistency). `needs-you.test.ts` and `client-workspace-overview.test.tsx`'s untyped raw-JSON mock bodies were left untouched (no type to break, and they stand in for whatever the live wire still sends — the DB function itself was not touched). |

**Verified NOT contradicting CONTEXT.md**: line ~164's "Attention source freshness" entry names
"the review queue's mutation watermark" — checked against the actual source
(`0231_firm_portfolio_pack.sql:585`, `get_firm_portfolio_pack`): that is a hardcoded
`sources.review_queue.signal = 'watermark'` freshness-KIND label, unrelated to the dead
front-end field. No CONTEXT.md edit needed.

**Gates:** `needs-you-counts.test.tsx` (2/2), `use-review-queue.test.ts` (6/6),
`needs-you-a11y.test.tsx` + `firm-admin-a11y.test.tsx` +
`compliance-watch-affordance/receipt.test.tsx` + `needs-you.test.ts` +
`client-workspace-overview.test.tsx` + `firm-home-board.test.tsx` — **72/72 green**.

---

## #904 — Client Documents workbench still stays "running" until reload — **DONE**

| Acceptance criterion | Evidence |
|---|---|
| A cell proves a running-to-done transition appears without reload | `document-detail-live-refresh.test.tsx`'s cell 2: mocks `document_processing_tasks_visible` to flip from `running` to `done` on the poll's own re-read; the panel's text moves from "Extracting…" to "Extraction complete" with no `reload()` call from the test. |
| A cell proves polling stops once every task is terminal | Same cell, second half: once terminal, `document_processing_tasks_visible`'s read count is frozen across 100 further settles. Cell 3 proves an ALREADY-terminal document is never polled at all (`enabled` false from mount). |
| The intake-receipts settle poll is unaffected | Cell 4: the tasks poll's own reads never touch `document_intakes_visible` (a distinct `useSettlePoll` call, distinct `resetKey`). |

**Fix:** `document-detail.tsx` now runs a second, independent `useSettlePoll` — `enabled: any task
queued/held_egress/running`, `onTick: reload()` (the panel's own whole-bundle reload, safe here
because the render gates on `loading && !data`, never bare `loading`, so a background reload never
blanks a panel that already has data) — reusing the SAME bounded/backed-off/hidden-tab-paused
primitive `documents-workbench.tsx` already runs for the receipts list, rather than inventing a
second one. `DocumentDetail` takes an optional `settlePoll` timing override (same shape
`documents-workbench.tsx` already accepts), forwarded from the workbench.

**Fix round (test robustness, not behaviour):** a fixed 30-settle loop was flaky under the FULL
`components/documents/*.test.tsx` directory run (163 tests sharing one process's timer queue) —
the same 30 settles that always caught a tick in isolation sometimes caught zero under
contention. Replaced with a real-deadline `settleUntil`, matching
`onboarding-field-composition.test.tsx`'s own idiom. Reran the full 163-file battery **three
times clean** after the fix.

**Gates:** new file (4/4), full `components/documents/*.test.tsx` — **163/163 green, three
consecutive runs**.

---

## #876 — `document_filings` has no list-form read for a set of documents — **DONE**

| Acceptance criterion | Evidence |
|---|---|
| A cell asserts the new read issues one request whose filter names exactly the requested ids, and none for an empty set | `reads.test.ts`: `listActiveFilingsForDocuments([])` never calls fetch; dedupes ids and builds `document_id=in.(doc-1,doc-2)&retired_at=is.null`; same projected columns (`select=`) as `listActiveFilingsForClient`. |
| A cell asserts the intake-receipts load no longer issues a client-wide filings request on mount | `receipts.test.ts`: the mount-time `document_filings` URL never contains `client_id=eq.`, and is scoped to exactly the intake rows' own document ids (`document_id=in.(doc-1)`); verified red (raw `client_id=eq.client-1&retired_at=is.null` URL) before the switch. An empty intake list issues no filings request at all (the new read's own short-circuit). |
| The settle-poll refresh still issues none of the mount-time reads | `receipts.test.ts` control cell: `refreshIntakeReceipts` still issues zero `document_filings`/`list_unassigned_documents`/`caller_context`/`documents` reads — untouched, exactly as FIX ROUND 1 (#633) established. |
| The documents and Work web suites stay green | Full `components/documents/*.test.tsx` (386 combined with `lib/documents/*.test.ts`), plus `lib/work/evidence.test.ts` + `lib/registers/opening-source.ts`'s own test (the two OTHER callers of the client-wide read, left unswitched per the ticket's own scoping) — **402 tests total, all green**. |

**Correctness finding made while implementing (not in the AC, but load-bearing):**
`document_filings` is RLS-scoped to the FIRM, not the client
(`listActiveFilingsForClient`'s own header, `0007_document_pipeline.sql:780-781`), so the new
generic bounded-set read can legitimately return a filing to a DIFFERENT client than the one being
viewed. The original client-wide query's "filed to THIS client" meaning had to move client-side —
`.filter(f => f.client_id === clientId)` on the bounded result — or a foreign client's filed
document would leak into this client's receipts as `filedHere: true`. Verified red (removed the
filter, reran, restored) with a dedicated cell before landing.

**Switched only the intake-receipts load**, per the ticket's own scoping ("The client-wide read
stays for surfaces whose question is genuinely client-wide"); the filed-document list
(`loaders.ts`) and the Work evidence picker (`evidence.ts`) are unedited.

**Gates:** `reads.test.ts` (16/16), `receipts.test.ts` (6/6, new file), full
`components/documents/*.test.tsx` + `lib/documents/*.test.ts` (386), `lib/work/evidence.test.ts` +
`lib/registers/opening-source.test.ts` (16) — **all green**.

**Out of scope, confirmed untouched:** no new SQL door or migration; the per-document
filing-history read (`listFilingsForDocument`); what counts as an active filing.

---

## #987 — closed-fiscal-year refusal on an opening draft, in the opening basis's own words — **DONE**

| Acceptance criterion | Evidence |
|---|---|
| Drafting an opening item into a closed fiscal year still refuses on the same rule, the same refusal code, and at the same point (draft, never approval) | Not touched — this is a pure client-side wording substitution, no DB migration in this wave-1 lane. `opening-refusal-and-staleness.test.tsx`'s new `987` cell asserts `CLR19` and `write_into_closed_period` still surface in the rendered chip. |
| The message a person sees for this specific refusal, inside the opening-basis flow, names the opening basis rather than a raw journal-entry id | Same cell: mocks `draft_opening_item`'s real CLR19 response shape (`clara._tf_period_wall_lines`, `0056_wave_e_close_model.sql:746-749`) with a fabricated entry id; asserts the raw entry id and the raw "sits in closed fiscal year" sentence never render, and the substituted message names "opening basis". Verified red (raw sentence + entry id rendering via the page-level `<ErrorMessage>`, since `DraftItemDialog` wires no `refusal` prop of its own) before the fix. |
| Every caller of the same period-wall refusal outside the opening lane is unaffected | Not touched: `toDialogRefusal`, `ErrorMessage`, `StateBanner` are all untouched; the substitution lives entirely in `opening-seed-workbench.tsx`'s own derived `openingClosedPeriodRefusal`/`dialogRefusal`. Reran `components/prepayments/*.test.tsx` (21, incl. its own `explainClosedPeriod` cell), `components/close/close-components.test.tsx` + `components/work/work-detail.test.tsx` (76) — all green, unchanged. The SAME file's own F6 cell (a CLR10 refusal on the same door) still renders verbatim, unaffected by the new branch. |
| The approval step (`approve_opening_seed` or its successor) still has no period guard of its own | Not touched; no migration, no new check added anywhere. |

**Wording chosen deliberately to avoid conflating concepts**: this screen already has its own
"Reopen seed" action (a different door, a different concept — reopening the opening SEED
registry, not the closed FISCAL YEAR). The new message ("This opening basis is dated into a
fiscal year that is now closed, so it cannot be drafted here. Date it into an open fiscal year,
or have that year reopened, before trying again.") deliberately never references a specific
on-screen control by name.

New message key `OpeningCarryDown.seed.closedPeriodRefusal`.

**Gates:** `opening-refusal-and-staleness.test.tsx` (5/5), full
`components/registers/opening-*.test.tsx` (63/63) — **all green**.

---

## Gates (whole-repo), with counts

- **Every test file added or touched**: run individually per ticket above (all green), then in
  wider sweeps per ticket, then in the full suite below.
- **`pnpm typecheck`** (repo root): **clean** (`apps/web` + `packages/runtime` both report
  "Done", 0 errors) after the fix-round corrections listed in the commit log (a
  `createElement`-vs-JSX typing gap for `data-*` props, a `Record<string, number>`/`Record<string,
  unknown>` indexing guard in three new test files — none behavioural).
- **`pnpm lint`** (repo root): **clean**, exit 0 — `eslint .`, `check-token-contrast.mjs`,
  `check-test-manifest.mjs` (+ its own selftest), `check-message-keys.mjs` (+ its own selftest),
  `check-ui-add-guard.selftest.mjs` all pass. The lint pass caught six ticket-number string
  literals ("#900"/"#896"/"#904"/"#987") that apps/web's `NO_RAW_COLOR_VALUES` rule reads as hex
  colours (three valid hex digits behind a hash) — the same class `fa-row-actions.test.tsx`'s own
  header already documents; fixed by dropping the hash from test names/assert messages (the
  surrounding `//` comments, unaffected by this AST-level rule, still name the tickets).
- **Whole `apps/web` unit suite** (`node scripts/run-tests.mjs`, every manifest path in one `node
  --test` run): **4659 tests, 4657 pass, 0 fail, 0 cancelled, 2 skipped, 0 todo**
  (`duration_ms: 85149`). The 2 skips are pre-existing and unrelated to this lane:
  `CLARA_LIVE_SUPABASE_AUTH_URL`/`CLARA_LIVE_SUPABASE_AUTH_ANON_KEY` not configured (live-provider
  auth verification; mocked coverage lives elsewhere in the same file per its own skip message).
  Ran three times during the #904 fix round specifically (flakiness fix), once as the final
  whole-repo gate — all four runs clean.
- **`packages/runtime`/`packages/db`**: not touched by this lane; `check-frozen-workflows.mjs` and
  `operation-census.test.mjs`/`rig-isolation.test.mjs` do not apply (no file in a frozen closure,
  no `packages/db/tests` file touched).
- **Browser walks (Playwright)**: **none run.** No `.spec.ts` e2e file was edited by this lane, and
  rule 8 scopes the e2e gate to "each browser walk you touched" — none was. This is a residual: the
  lane's changes (document-kind-dialog, InterviewRunCard, the documents workbench, the opening
  workbench) are all surfaces existing e2e walks exercise, and a full real-browser confirmation
  was not run. The 4659-test unit/a11y/component suite is the evidence in hand; a live e2e pass
  on this lane's touched surfaces is unverified.

## Docs updated

- `document-kind-dialog.tsx`'s own inline comment (#878).
- `needs-you-counts.tsx`'s FIX-4 header comment (#903).
- `apps/web/messages/en.json`: `Interview.answer.fieldDescription` (#900),
  `OpeningCarryDown.seed.closedPeriodRefusal` (#987).
- No module README carried a section on any of these eight surfaces that needed correcting or
  extending; none was edited. No new domain vocabulary was introduced (Field composition, the
  document-set filings read and the period-wall message substitution are all applications of
  house patterns already named in CONTEXT.md/READMEs), so no CONTEXT.md edit was made.

## Successor contracts

None. No ticket in this lane needed a new Work-lane or chat-lane tool, a new frozen-workflow
successor, or a new SQL door.

## Follow-ups worth filing

- **`DraftItemDialog` (opening-items-panel.tsx) wires no `refusal` prop of its own** — every
  refusal from `draft_opening_item` (including #987's own substituted one) surfaces at the
  page-level `<ErrorMessage>`/banner, BEHIND the open dialog's modal backdrop, rather than inside
  the dialog beside the fields the person is correcting — the exact defect class CB-AE2E-004
  fixed for every OTHER opening dialog in this same file. Found while tracing #987's refusal path;
  out of scope for #987 (a wording ticket, not a refusal-placement ticket) and left unfixed. One
  paragraph: wire `refusal={dialogRefusal}` into `<DraftItemDialog>`'s own `<OpeningDoorDialog>`
  call, the same one-line addition every sibling dialog in `opening-seed-workbench.tsx` already
  has.
- **e2e confirmation for this lane's touched surfaces** (see "Gates" above) — no `.spec.ts` was
  edited, so none was run under rule 8's letter, but a live-browser pass over
  `document-correction-walk.spec.ts` (document-kind-dialog), the interview-run e2e walk
  (InterviewRunCard), and any documents-workbench walk would be the natural follow-up before this
  wave's own release ceremony.

## Anything unverified

- The e2e/browser-walk confirmation named above.
- Hosted evidence: not this lane's to claim (local-only verification, per the work order's own
  convention).
