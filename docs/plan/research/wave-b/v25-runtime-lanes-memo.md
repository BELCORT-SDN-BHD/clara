# v25 runtime lanes — build record + orchestrator adjudications (2026-07-23)

Four parallel lanes (disjoint file ownership, pinned models per the dispatch law) built the
Wave-B runtime surface per design part 3 "Runtime/dashboard consumers": **A** chatTurn_v7 +
autoDraft_v3 · **B** firmInterview_v1 + clientOnboarding_v1 + routes · **C1** the
wiki_projection consumer + storage/egress/wiring · **C2** the lint belt. Each lane's
deviations were reported (never silently absorbed); the rulings below are the
orchestrator's adjudications, binding on the dashboard lanes and the WB-R18 ceremony.
Registry repoints, the freeze-manifest re-baseline (53→71, append-only verified), and the
reconciler lint wiring were orchestrator integration acts.

## Adjudications (RATIFIED as built unless marked owner-item)

1. **[A] autoDraft_v3 citation surface = the entry memo.** The sweep lane persists no
   transcript (settle_autodraft_task takes no parts), so WB-R6(4)'s "citation in visible
   reasoning" lands as the prompt instructing the model to fold the wiki citation
   (slug + title) into the drafted entry's memo when a wiki page informed the draft. The
   memo IS the sweep draft's reviewable free-text surface. Owner may re-rule at Gate W2.
2. **[A] Tool description strings stay byte-identical to v6/v2** — only the purpose
   inputSchema (z.literal('wiki_coding')) and the execute body (GUC + literal) changed.
3. **[B] Park primitive = pure WDK hooks (the typed sibling lane), NOT open_interruption.**
   agent_tasks.kind is CHECK-locked to ('chat_turn','wake'); a chat_turn interview task
   would collide with the reconciler belt and chat surfaces; wake cannot park. The
   as-built reference (§new-family registration) explicitly sanctions "open_interruption
   OR a typed sibling lane". Parks are durable WDK createHook waits with deterministic
   tokens (runId + parkIndex); durable business state = run checkpoints + the plan object
   (update_onboarding_plan), exactly P19.
4. **[B] Answer delivery = authenticated runtime route → resumeHook.** answer_interruption
   is clara_authenticated-only and needs an agent_interruptions row (unavailable without an
   agent_tasks row). The /answer route authenticates the member JWT (client scope:
   bookkeeper+ floor, plan-firm match) and delivers into the hook; the REAL boundary is
   the DB re-validating p_answered_by as an active bookkeeper+ member of the plan's firm
   (CLR04, rig-proven). Route floor-checks are defense-in-depth.
5. **[B] Firm commit = the dashboard-calls-create_firm handshake.** create_firm (+ begin/
   commit/cancel_client_onboarding, resolve_onboarding_plan_item, upsert_account) are
   clara_authenticated-ONLY (verified against 0017 grants) — the runtime structurally
   cannot call them. The workflow mints a STABLE op_key (memoized step) and surfaces it in
   the commit park; the DASHBOARD calls create_firm(name, admission_token, op_key) via
   PostgREST (O7 token-row receipt ⇒ exactly-once across retries/kills) and POSTs the
   {firm_id, plan_id} receipt back as the commit answer. The admission token never reaches
   the runtime — a STRONGER P19 posture than the design sketch. The dashboard lane owns
   this handshake surface.
6. **[B] Shared interview.v1.\* modules** (core/questions/writer/steps) are a co-versioned
   frozen sibling set imported by both interview classes (avoids duplicating ~250 lines of
   salvaged validators). A future vN forks interview.vN.* — immutability preserved; all
   six files are in the freeze manifest.
7. **[B] TIN question made non-skippable under the turnover-gated validator** (a required
   TIN at ≥RM1M turnover cannot be skipped; below it, skip→null) — a refinement of the
   salvaged "skip if exempt".
8. **[C1] The governed-egress purpose registry now lives in lib/egress.mjs**
   (GOVERNED_EGRESS_PURPOSES, first entry wiki_synthesis) — the WA2-R2 envelope descriptor
   home the pin presumed; added additively beside the OCR adapter.
9. **[C1] Model synthesis ships SAFE-but-DARK in production (fail-closed held).**
   client_egress_consents has no runtime read surface (FORCE RLS, owner-only policy, no
   clara_runtime grant; 0017 shipped wiki WRITERS only) — consent resolves 'unknown' ⇒
   held_consent + set_wiki_synthesis_hold, visible in the pack (wiki.held) and the lint
   belt. Revocation IS structurally gated. Deterministic ingest works regardless (the
   WB-R10 posture). Lighting synthesis needs a runtime consent-read surface — OWNER ITEM.
10. **[C1] document.classified ingest receipts 'skipped_unresolved_client'** — no runtime
    document→client read path exists (document_filings ungranted; extractions carry no
    client_id; the event payload none). entry.approved (carries client_id + document_id)
    is the working deterministic-ingest trigger; counterparty pages synthesize off
    counterparty.created/merged. The receipt vocabulary gains the typed
    'skipped_unresolved_client' terminal (a W4 set extension, adjudicated here).
11. **[C1] Deterministic-ingest op_key is document-stable ('wikiingest:<client>:<doc>')**
    so re-approvals of the same source replay instead of duplicating; model synthesis
    keeps the pinned seq-embedded 'wikiproj:<client>:<seq>'.
12. **[C1] Deterministic-ingest pages are DB-only** (record_wiki_source_ingest computes
    sha/key, uploads nothing); model pages are Storage-backed (put→verify→publish).
    Strict-P17 replay for deterministic pages re-derives from the source documents.
13. **[C2] Lint cadence default 24h** (CLARA_LINT_RECONCILE_MS, finite-guarded) —
    sibling-identical to the SST/autopost belts, satisfies WB-R8 "lint daily". Per-client
    op_key 'lintsweep:<iso>:<client>', receipt op_key 'lintsweep:<iso>:receipt'.
    reconciler.mjs consumption of deps.lintBelt was wired by the orchestrator (the lane
    correctly refused to edit outside ownership).

## Ceremony checklist additions (WB-R18 — beyond the design part-3 list)

- Storage RLS policy pair for firms/{firm}/wiki/{client}/{sha}.md (Supabase SQL editor —
  NOT in the migration; without it every wiki put 403s in prod) + one put/verify probe.
- relay_checkpoints seed at head for consumer 'wiki_projection' (module-header SQL).
- `node scripts/relay.mjs wiki-backfill --sources <pairs.json>` (deterministic ingest over
  pre-0017 finalized documents; the ceremony supplies {clientId,documentId} pairs — there
  is no runtime document→client link) then `relay.mjs wiki-repair` to convergence.
- Supavisor headroom re-verify: the walked session count is now **27** dedicated+pooled
  (was ≈26; wiki_projection +1; lint belt + interviews +0) against the 60 ceiling.
- Egress registry: GOVERNED_EGRESS_PURPOSES.wiki_synthesis rides the image; no live config.

## Cross-model review round (2026-07-24 — native opus reviewer + Codex gpt-5.6-sol, both NOT-MERGEABLE first pass; all blockers fixed on-branch)

Convergent findings, FIXED: the client-interview TIN/turnover segment order (the <RM1M
exemption was unreachable — native HIGH-1 / codex 12; reordered + regression-locked) ·
the wiki consumer's cold start (native HIGH-2 / codex 3; the loop now self-gates DORMANT
until the 0017 surface exists AND the ceremony checkpoint seed has run — consumer-level
exists-check, deliberately not per-firm so a post-ceremony new firm still starts at 0;
`wikiColdStartReady` + interruptible dormancy) · the run-binding/authz cluster (native
MEDIUM-1 / codex 1-CRITICAL, 2, 5, 7, 8; fixed as: the plan-item `interview_run` binding
+ the streamed owner marker + route-side bind-before-act on answer/cancel/state, the
pre-firm floor on /firm/start, idempotent /client/start, the workflow-side receipt
verification — scope_kind='firm' + owner membership — and route-side commit-receipt
shape-filtering accepting both snake/camel, so no secret can reach durable run history) ·
the CAS blind-retry overwrite (codex 6; retry only when the revision bump came from OTHER
items, else `stale_conflict` → re-echo) · the redrive recency race (codex 9; an in-txn
re-check makes an older event a checkpoint-only no-op over a newer published seq).

Fix-lane deviations, RATIFIED: membership checks ride `clara.resolve_chat_principal`
(clara_runtime cannot read `firm_memberships` — 0006 §8; same security property, DB-legal)
· `/client/start` floors at bookkeeper+ (the binding write's `answered_by` would CLR04 a
viewer mid-run otherwise) · the firm plan's single post-commit write retries bounded (≤3)
on `stale_conflict` instead of re-echoing (no interactive point exists post-commit; the
plan is freshly minted so same-key conflicts are practically impossible) · the
receipt-verify step carries an attempt nonce so WDK memoization never replays a stale
verdict.

Accepted residuals (documented, not fixed this wave): storage BLOB orphans from
model-lane retries and cap-refusals-after-upload (codex 4's real kernel — inert
content-addressed garbage in the private bucket; a ceremony-time key-vs-versions sweep is
the follow-on; `wiki-repair` converges dead-letters/lag, not blobs) · the ms-window
double-writer residue under the in-txn recency check (the DB-side monotonic
`projected_from_seq` guard is a 0018-candidate alongside the consent read surface) · the
409-on-replay answer contract (a retried answer reads 409 not_pending; clients treat it
as already-delivered + refresh /state — documented in the route header) · interview
EXPIRY is dashboard/ops-driven this wave (the cancel verb is the vehicle; no ambient
timer — the WB-R17 cancellation/expiry rig gate runs through cancel).

- **The projection consumer's runtime READ surface** (consent state + document→client):
  0017 shipped the wiki writers only. Until a follow-on grant/DEFINER-fn migration (an
  0018-class micro-change needing an owner ruling against WB-R18's one-migration pin),
  model synthesis stays fail-closed dark and document.classified ingest self-skips.
  Gates W2/L remain reachable via deterministic + counterparty paths.
- entry.approved → treatment/recurring_pattern synthesis (the pin's eventual intent)
  needs an entry→counterparty runtime read — deferred with the same follow-on.
- The commit-lane shape ruling (PART 2, unchanged) now also shapes the dashboard commit
  surface; the interview family is commit-agnostic either way.
