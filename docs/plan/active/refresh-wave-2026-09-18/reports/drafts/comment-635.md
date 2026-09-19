`/settings/firm` now reads the firm's real legal, commercial and usage state — merged to `main` at `ede1df83` (PR #954, "Wave 2026-09-18"), migration `packages/db/migrations/0233_firm_commercial_settings.sql` (three new doors + one recut: `get_firm_legal_standing`, `get_firm_commercial_state`, `get_firm_ai_usage`, recut `get_llm_usage_summary`). **All evidence below is LOCAL; hosted evidence pending — stays open until the hosted release.**

## AC / historical rows

| Row | Disposition | Evidence |
|---|---|---|
| AC1 rank-shaped routing + membership lifecycle | verify-only (routing) + done (commercial half) | `tree.ts`/`components/admin/*` untouched; `p635.web.rank_shaping`; legs(1)(4) |
| AC2 versioned legal; plan/payment/invoice/usage w/ source, range, freshness | done | migration 0233; `p635.db.legal_standing_*`(8), `commercial_*`(5), `usage_*`(8); `usage-csv.test.ts`; legs(1)(2)(3)(6)(7) |
| AC3 absence/failure/empty explained, never synthetic | done † | `p635.web.no_numeral_when_unruled`/`no_billing_control`/`commercial_absent_named_zero`, leg(1); † fixround: `commercial_no_current_plan`, `usage_not_a_table`, `usage_dropped_rows` |
| AC4 rank separation; immediate revocation | done, both holes closed † | `p635.db.usage_base_floor_added`; `revocation_clears`+leg(8); † A1 closed split-acceptance dead end; residual: `firm_document_limits` has no writer |
| AC5 plan/history/usage/keyboard/redirects/Settings | partial | redirects verify-only (closed #614); rest done; `accept_replay`; legs(7)(9) |
| AC6 state ladder, 320px/200%/SR/URL/drafts | done † | `firm-settings-a11y.test.tsx`; legs(2)(6)(9); † A2 period-change, A5 focus vs. trigger, A9 one-sign money; no draft on page (stated) |
| AC7 production-facing, real least-privileged roles | done | 24-cell battery via `humanQuery` personas; no Workflow leg (none invoked); admin rank not walked in browser |
| CB-AE2E-012/H-18/H-19 | descoped (authority) | `0195:35-37` replaced UI-28/29; accept dialog is 3rd recovery path |
| C-01/C-56 pricing is owner decision | descoped (authority) | rendered as fact; `no_numeral_when_unruled` |
| C-02 recover metering/billing | done (the surface) | reader `llm_usage_events` via `get_llm_usage_summary`; census in `635-final.md` |
| C-09/C77.8 webhook assertions | verify-only, outside boundary | owned by `stripeRoutes.ts` |
| F-02 opt-in switch | descoped (authority) | nothing to restore |
| C55.21 usage dashboard discovery | done — discovery IS the recut | `usage_base_floor_added`+`usage_base_firm_wall_intact` |
| C83.10 dup of C55.21 | verify-only | folded |
| C81.5 Supavisor headroom | descoped (authority) | ops measurement; `firm_document_limits`(4 nums) shown, `max_concurrent_runs` deliberately not |
| C88.2 retirement census | verify-only — "do not drop here" | census in `635-final.md`; card reads `llm_usage_events` |

## Rulings that shaped it

- **D1 (§0)** — no price ever shown; "Beta, not yet priced", gated on `amounts_ruled`.
- **D2 (§0)** — only the owner may accept new legal terms in-app (new read door + existing `accept_legal_document`).
- **D3 (§0)** — usage in tokens/calls always; USD shown labelled vendor pricing, never converted; UTC window as-returned; admin wall added to the usage door.
- **§6.1** — corrected §2.2: 0233 needs a real four-name `rig-meta.mjs` cohort, not comment-only.
- **§6.2.1** — `get_firm_ai_usage` stays `volatile` (A10, left) — ratified, reconfirmed by recheck-1.
- **§6.3/§6.4** — no #635-specific ruling; 0233 has no clock token, untouched by the book-day re-point.

## Integration and successor cut

No `chatTurn_v21`/`claraWork_v5` cut applies — WAVE-DIGEST §4: "no cut needed" (three governed reads + one existing write; no Workflow; `packages/runtime` no diff; parts-parity green). Merge #10 (`b255e0e9`) landed `impl/635` tip `a9d2d964` last, 6 conflicted files (`rig-meta.mjs`, `en.json`, `package.json` gate chain — resolved by union; `FirmSettings` namespace byte-for-byte). Re-run at the integration head: **24/0/0**.

## Named residuals (to be filed)

- Governed write door for `firm_document_limits` (no writer today).
- Ops measurement of Supavisor/pool headroom at release (C81.5).
- Ask owner whether a hosted-only consumer of `get_llm_usage_summary` exists (none in-repo).
- Any later recut of `get_current_legal_documents`/`accept_legal_document(text,integer,text,text)`/`_accounting_work_egress_live` below 0233 must re-measure 0233's pins in that commit.
- Admin rank not walked in browser (no rank-2 persona; proven at DB level).
- Revocation layer is focus-driven; a tab never refocused has no trigger.

## Blueprint drift (for #683)

1. PRD:126's shared-AI-usage clause now has a real surface; PRD text is stale.
2. ARCHITECTURE has no §10 though `0195:21`/`0186:7` cite one; content is in §5.E.
3. ARCHITECTURE §7's accepted-but-unimplemented table has no commercial row.
4. ARCHITECTURE:372's "no export route" names only `work_execution_traces`; the usage CSV makes that ambiguous.

## Verify locally

```sh
node --test --test-concurrency=1 packages/db/tests/firm-commercial-settings.test.mjs   # 24/24
node scripts/run-tests.mjs   # apps/web whole manifest, 4216 tests
pnpm --filter @clara/web e2e firm-commercial-walk firm-navigation-walk shell-migration-walk  # 49/49
pnpm db:migrate   # 0233 applies cleanly on the current frontier
```

**Integration evidence:** merge `b255e0e9` (tip `a9d2d964`) into `integration/wave-2026-09-18`, then `ede1df83`/PR #954 into `main`. Hosted evidence: none yet.
