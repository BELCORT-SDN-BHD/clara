Landed in `impl/655-invoice-bill`, merged via PR #954 ("Wave 2026-09-18", merge commit `ede1df83`, 2026-09-19T13:59Z). Migration `0225_trade_invoices.sql`. All evidence below is **LOCAL**; hosted evidence pending — this ticket stays open until the hosted release.

**AC / historical rows**

| Row | State | Evidence |
|---|---|---|
| AC1 typed intent + facts | done | `0225` §A/B; `p655.post.bill_one_commit`, `p655.due.stated` |
| AC2 atomic object+JE+item+receipt, least privilege | done | `p655.post.bill_one_commit`, `p655.atomic.no_partial`, `p655.authority.floors`; World leg 1; integration added `p655.birth.abort_is_atomic` |
| AC3 four entrances | partial (named residual) | Direct UI + document-cited built/walked; upload parity `p655.parity.source_vs_direct`; **chat arm ships as the `chatTurn_v21` contract** (`start_trade_invoice_work`), not running yet |
| AC4 dup/lost/restart → ONE receipt; park | partial (2 residuals) | `p655.replay.one_receipt`, `p655.replay.race` (round 1 closed a raced-loser blocker); park half not driven (World harness lacks an `ask_question` model); same-bill-number dup deliberately not probed — measured by `p655.duplicate.same_reference_is_NOT_probed` |
| AC5 mutual links after reload | done | `clara.get_trade_invoice`; walk leg 2; `work-detail.test.tsx` `655 AC5/AC12` (round 1 fixed a dead `total` key and a missing `domain.ap/ar` key) |
| AC6 capture, invent nothing | done | `0225` §A; `p655.due.stated`/`.terms_fallback`/`.absent`/`.anchor_document_date` (fix round 2, R-A) |
| AC7 same operation | partial, boundary stated | `p655.parity.source_vs_direct`; the ONE known divergence (due-date anchor) pinned by name in `p655.due.anchor_document_date`; #665 owns the cutover |
| AC8 links + tie-out, no 2nd approval | done | `p655.tieout.control`, `p655.grants` (no `p_attestation`) |
| AC9 undated/locked/stale/denied/duplicate | done except correction | `p655.due.absent`, `p655.authority.floors`, `p655.reversal.unwinds`; posted-effect correction is #676's, not built |
| AC10 fixtures/parity/replay/tie-out/a11y | done | 29-cell battery + 3 web files + walk legs 9-11 |
| AC11 polarity + recognition | done | `p655.polarity.matrix` (typed CLR10, never bare 23514) |
| AC12 UX ladder | done | `trade-invoice-form.test.tsx`(13)/`-a11y`(7)/`-keyboard`(7)/`-draft.test.ts`(6); walk legs 6-12; fix round 1 fixed raw-sen money render |
| AC13 real roles + real World | done | Battery via `humanQuery` personas; World leg on `clara_655` |
| CB-AE2E-013 | verify-only | `p655.grants` + `0225` tail T.10: `p_attestation` unreachable |
| C08.5 direction-aware noun | done — first-cut evidence was wrong, corrected | `work-detail.test.tsx` asserts the word + no leaked key; walk leg 2 |
| C08.8 discovery | done, recorded verbatim | Direct UI and upload lanes do **not** reach the same operation; bounded repair is 0225 |
| C33.7 re-census | verify-only | `p655.replay.one_receipt`, World leg 3; C-40 stays #657/#667/#662's |

**Rulings.** D11 — recut the posting core narrowly, for a trade invoice's control leg only; **ratified as THREE bodies (§6.2.1)**: `_record_journal_entry_core` (6th copy), `_subledger_classify_entry` (LADDER 3T), `_tf_subledger_item_belt` — closes recheck-1's F1 blocker. D12 — due date: stated wins, terms fallback, else "absent"; credit shape refused this wave. **§6.2.0 R-A** overrules the first cut: terms fallback anchors on the **document** date, not posting date; the legacy upload lane's posting-date anchor is its own defect, owned by #665. **§6.3 row 1** ruled `t_je_open_item_birth` Tier = **ABORT**.

**Integration/successor cut.** `chatTurn_v21` carries `start_trade_invoice_work` (schema in `trade-invoice-basis.ts`, 18 refusal tokens, no `WORK_ACCEPTED_PURPOSES` widening) — AC3's chat-arm delivery vehicle. Integration fix round 1 (`ca7491a9`) registered the birth trigger's ABORT tier in `f-a2-tier-d.test.mjs` and added `p655.birth.abort_is_atomic` via an owner-level fixture (no door reaches the failure). CI gained `trade-invoice-e2e` as a World leg, PASS. The merge grafted #655's link block into `work-detail.tsx` per §3's #658→#655→#636 sequence.

**Residuals → follow-ups (to be filed).** Drive AC4's park half + a commit-window cancel. Retire `lib/wire.ts`'s `reason`-only refusal passthrough. A same-document-number duplicate probe, with an owner (#662 likely). Resolve counterparty by TIN or stop advertising it. #665's cutover to retire the legacy anchor and reconcile the two invoice-recognition lanes.

**Blueprint drift (#683).** `ARCHITECTURE:232-235` marked [已实现] that confirming an invoice writes GL+open item in one transaction; measured: before 0225 the Work lane could not confirm an invoice at all. `ARCHITECTURE:529-530` — line items "planned"; `lines` here are journal-basis lines, never extracted invoice line items (#782's boundary). `PRD:65`, `:79` — grouped citation, not separately argued.

**Verify locally.**
```
cd packages/db && node --test --test-concurrency=1 <41 gate flags> tests/trade-invoice.test.mjs   # 29 pass / 0 fail
cd packages/runtime && node --test tests/trade-invoice-unit.test.mjs                                # 23 pass / 0 fail
cd packages/runtime && node tests/trade-invoice-e2e.mjs                                             # World leg, all 5 legs PASS
pnpm --filter @clara/web e2e trade-invoice                                                          # 12 passed
```
