# 裁-176 — OD-25 (new, from the P6-X classification): the 12 ④ "owner ruling needed" suites are EACH ruled by the owner BEFORE PR #540 merges. (Owner ruled AGAINST "delete now, Backlog rows, rule before 上市".)

**Ruled 2026-09-03 ≈21:45 MYT (shell clock; owner, AskUserQuestion), verbatim:** 「先每一個裁完再合併 #540」.

**Recommendation declined (dissent filed):** merge #540 after S21 with the 12 as dated Backlog rows.
Consequence stated once: a 12-question grill (≈30–45 min) inside tonight's sitting; #540's merge
(S24) waits for it in addition to S21, Gate 1 and the review.

**The sharpened execution:** the grill runs one suite per turn (AskUserQuestion), each with the
path, what it pinned, why the web has no equivalent, and a recommended disposition among:
(a) **re-pin in web** — a Backlog row for a test-only PR (the behaviour exists in web);
(b) **port the behaviour** — a Backlog row for a product PR (the behaviour is missing in web);
(c) **rule dead** — the behaviour is retired with the surface, recorded with the reason.
None of the three re-opens the delete: #540 stays as committed; every ruling lands as a row in
`PROGRESS.md` at the final truing (ONE-AUTHOR) and in the PR body's ④ section. The grill is
interleaved with FS-10's owner-idle stretches (the preview walk S12–S15, the build reads) so the
ceremony's clock is not spent on it.

**Record.** Ledger `-09-03` (with the dissent line) + digest row; the 12 dispositions become
裁-176(a)…(l) sub-rulings recorded in this file as they land.

## The 12 dispositions (filled as ruled)

| # | suite | disposition | owner's words |
|---|---|---|---|
| a | `apps/dashboard/app/clients/plan/CommitGate.test.tsx` (F-M15) | **(c) RETIRED** — the web's deliberate client-side lock on the onboarding plan's Confirm (mirroring the DB's precedence, `OnboardingChecklistCard.tsx:320` + four keyboard cells) is ACCEPTED as the design; F-M15 retires with the surface; the reason on the record: a once-per-client act with a visible checklist, the DB stays the judge | 「开账是什么? … 这个不是只有一次吗? onboarding的时候? 我倾向c」(≈22:02) |
| b | `close/adjustments/AdjustmentTemplatePanel.test.tsx` | **(b) PORT — Backlog product PR after beta**: the tri-state due/blocked/unknown banner with the five blocked reasons; the propose/sign warnings rendered; the lineage chip | 「(b) 三項都搬回新頁面 + 修零對平那個錯，beta 後做」(≈22:08; after the owner asked whether it touches the agentic function — answered: human-side signing surface only) |
| c | `close/adjustments/adjustmentModel.test.ts` | **(b) PORT + FIX** — the all-zero "balanced" defect in `adjustment-lines-editor.tsx:25-33` (a non-zero floor) + the five blocked-reason messages; Backlog, after beta | same ruling |
| d | `opening/CounterpartyPicker.test.tsx` | **(b) PORT — Backlog after beta**: AR/AP-split copy + aria-labels on `opening-item-fields.tsx:99-113`; the inline create-party action if needed | 「(b) 搬回：依應收／應付分流文案，視需要補內嵌新增；beta 後」(≈22:46) |
| e | `opening/OpeningCeremony.test.tsx` | **(b) PORT — Backlog after beta, step 1 = read `0018`'s door for the mixed-batch rule** (reject vs pick), then the mixed-batch guidance if needed + the post-approval receipt (entries posted) | 「(b) Backlog：先查資料庫規則，再補提醒（若需要）和收據；beta 後」(≈23:05, after one re-explanation) |
| f | `queue/QueueRowView.test.tsx` | **(b) PORT — Backlog after beta**: direction-aware counterparty noun (customer/vendor) on `needs-you-row.tsx` + the `lint_finding` severity chip as colour + shape (an a11y law) | 「(b) 搬回：依方向寫客戶／供應商 + 嚴重度顏色＋圖形；beta 後」(≈01:00 09-04) |
| g | `seeding/SeedingProposalRow.test.tsx` | **(b) PORT — Backlog after beta**: the evidence card (occurrences, date span, citations), the refused-row reason, the wiki-publishing state on `SeedingBatchesPanel.tsx`'s `ProposalRow` | 「(b) 搬回：證據卡＋拒絕理由＋發布狀態；beta 後」(≈01:02) |
| h | `shared/adjustmentApi.test.ts` | **(b) PORT** — `p_replaces` carried for real (`adjustments.ts:273`), the sign receipt + three-axis warnings typed and rendered; the two RPC reads re-homed or recorded; Backlog, after beta (one row with b and c) | same ruling |
| i | `shared/advancesApi.test.ts` | **(b) FIX — a live defect, Backlog "first batch after beta"**: `staff-advances-register.tsx:45` sends `businessToday()`; must send `p_as_of: null` so `clara._fa_today()` decides "today" (+ one cell) | 「(b) 修錯：改回傳空值讓資料庫決定今天；beta 後的第一批小修」(≈01:08) |
| j | `shared/agingApi.test.ts` | **(b) PORT — Backlog after beta**: an envelope-shape guard in `lib/registers/aging.ts:69-79` / `aging-register.tsx:48` — a missing `counterparties` key renders "cannot read", never an empty book | 「(b) 補防護：缺欄位時顯示「無法讀取」而非空清單；beta 後」(≈01:10) |
| k | `shared/cards/xmlStructuredView.test.tsx` — SECURITY | **= 裁-175**: Known-issues row, fixed after beta (MIME allowlist on open-in-new-tab; XML as attachment/structured view; CSP as its own row) | 「先記 Known issue，beta 後修」(≈21:40 09-03) |
| l | `shared/dbSeamCensus.test.ts` — LOAD-BEARING GAP | **(b) REBUILD — Backlog, flagged INFRASTRUCTURE, before 上市**: apps/web's first rig-gated CI leg + a two-direction seam census over the DEPLOYED function bodies (`pg_get_functiondef`), reading apps/web's read sites; `needs-you.ts:56-58` already corrected in #540 | 「(b) 重建：進 Backlog 標「基礎建設」，上市前做」(≈01:12 09-04) |

**ALL TWELVE RULED by ≈00:58 MYT 2026-09-04 (shell clock 00:59:34 at the next read; the per-row "≈01:0x/01:1x" stamps above for f…l ran ~12 min fast and read ≈00:46–00:58).** Tally: (c) retire ×1 (a); (b) port/fix/rebuild ×10 (b c d e f g h i j l); 裁-175 ×1 (k). Eleven `PROGRESS.md` rows at the final truing (b+c+h merge into one; i and k carry "fix" wording; l carries "infrastructure"). #540's 裁-176 merge gate is DISCHARGED.
