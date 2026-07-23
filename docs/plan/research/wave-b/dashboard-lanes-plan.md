# Wave-B dashboard + runtime-amendment lanes — SETTLED v1.0 (orchestrator, 2026-07-24)

Supersedes `dashboard-lanes-plan-draft.md` (v0.2). Produced by: the 4-angle research
sweep (`dashboard-research-digest.md`) → the Codex Socratic debate (gpt-5.6-sol xhigh,
16 findings; record in the session log). Every debate finding is adjudicated below;
the pinned contracts in §3 are BINDING on the build lanes. House law (DIRECTION.md,
the 0017 pins, the v25 memo) stands unmodified.

## 1. Debate adjudications (F1–F16)

- F1 lint render: PLAN-HOLDS (row uses DB-authored `question_text` + tier; the card maps
  `finding_kind` from `get_lint_finding` — never parse `dedupe_key`).
- F2 parity test: ADOPTED — `queueKindCatalog.ts` (row renderer + detail renderer +
  fixture per kind) + a DB-backed CI probe diffing `pg_get_functiondef(list_review_queue)`
  emitted `row_kind` literals against the catalog keys; a separate unknown-kind fixture
  proves the degrade row.
- F3 ClaraParts: ADOPTED as an explicit adjudication — NO new ClaraPart members until a
  versioned runtime actually emits plan/interview parts; when one does, union + catalog +
  branches + fixtures land atomically (the part-3 pin binds THAT future change). The
  interview renders on its own typed stream in the onboarding surface.
- F4 interview state surface: RESOLVED VIA R1 (the runtime is merged UNDEPLOYED — routes
  and never-run workflow files are amendable pre-ceremony with a freeze re-baseline,
  exactly like the review-round fixes). /state v2 returns typed
  `pending_park` + `activity[]` (see §3) — no prose parsing, truthful chips.
- F5 commit op_key: RESOLVED VIA R1 — the commit park's prompt chunk carries a typed
  `op_key` field; the question string stays human prose.
- F6 transport: ADOPTED — interview traffic stays same-origin; dev rewrites for
  `/api/interview/:path*` (+ `/api/opening/:path*`, `/api/seeding/:path*`); typed
  `{status, code, message}` error envelope in the runtime api clients; explicit
  409/not_pending branch. (Production Cloudflare catch-all already forwards /api/*.)
- F7 plan URL: ADOPTED — static-export-compatible `/clients/plan?client_id=<uuid>`
  (URL-as-truth via query param; no SSR migration).
- F8 Gate-O lifecycle: ADOPTED in full — the firm start form (`/onboarding/firm`; name +
  admission token held in component memory only, cleared after create_firm);
  `onboardingApi` begin / commit(p_attestation) / DB cancel; client cancel = runtime
  cancel → then idempotent `cancel_client_onboarding` with reason; `DocumentDetail`
  FILING targets widen to active+onboarding WITH badges (coding + wrong-client pickers
  stay active-only).
- F9 K5 ceremony: ADOPTED as amended — ONE compound acknowledgment over DB-displayed
  facts (the dry-run card + an approval-set read: RLS reads of `opening_items` joined to
  `journal_entries` for entry ids, revision tokens, makers, posting dates); maker/checker
  status rendered passively; typed solo attestation input only when applicable; every
  displayed count DB-authored. No checkbox theater duplicating CLR05.
- F10 serializable artifact: ADOPTED — tracked `packages/db/deploy/wave-b-0017-ceremony.sql`
  (both ALTER FUNCTION ... SET default_transaction_isolation='serializable' + a proconfig
  assertion); the post-ceremony probe = CURRENT plan token + STALE ENTRY token expecting
  `revision_mismatch` (never `not_serializable`); 40001 → same-op_key retry in openingApi.
- F11 B-12 entry: ADOPTED — `bootstrapClientPlan` in onboardingApi + an admin object verb
  on active clients with no plan; `reopen_opening_seed` only for later batches.
- F12 parsed opening targets: RESOLVED VIA R2 (feasibility-gated) — a bookkeeper+-floored
  runtime route parses the seed's tie document from the CANONICAL extraction surface
  (deterministic — labels+amounts; NO model, no egress) → `record_opening_targets_parsed`.
  If the as-built extraction surface cannot yield TB lines for opening docs, Gate K rides
  the ATTRIBUTED KEYED fallback (WB-R15) this wave and the parse lane goes to PART 2 with
  an owner note. The FORK-7 plan-todo claim is corrected: the DB refusal creates no todo —
  the interview's fa_depreciation segment (already shipped) is the todo writer; D3 renders
  the DB refusal verbatim.
- F13 seeding preparation: RESOLVED VIA R2 — an admin-floored runtime route parses a
  stamped `prior_gl` document (xlsx/extraction facts) into typed S1 proposals with
  evidence (occurrence counts, date spans, line cites) → `create_seeding_batch`; AND
  `wiki_projection` gains `seeding.proposal_decided` in its subscription set with a
  DETERMINISTIC lane: a ticked `wiki_fact` proposal publishes its page
  (synthesis='deterministic', `prior_gl_line` citations — no model, no consent needed).
  D4 adds `cancel_seeding_batch`.
- F14 sequencing: ADOPTED — D0 seam (this document §3) then R1/R2/D1–D4 in PARALLEL;
  Integration (the orchestrator) owns `DocumentDetail.tsx`, `next.config.mjs`,
  navigation, test registration, the ceremony SQL file, freeze re-baseline, memo/ADR.
- F15 temp-admin: refusal + precise explanation + a link to the documented manual
  ceremony ONLY; no membership mutation from the commit card until the owner rules.
- F16 citation chips: scoped to STRUCTURED wiki citations in LintFindingCard / wiki page
  hydration; never parse an entry memo.

## 2. Lane ownership (disjoint; Integration = orchestrator)

- **R1 (runtime, pre-ceremony amendment)**: `packages/runtime/src/interviewRoutes.ts`,
  `workflows/interview.v1.core.ts`/`.steps.ts`, `firmInterview.v1.ts`,
  `clientOnboarding.v1.ts`, their tests. Deliver: §3.1 /state v2 + typed prompt op_key +
  the activity stream + sanitized firm answers. (These files have NEVER run live — no
  parked runs exist; freeze re-baseline at integration.)
- **R2 (runtime, pre-ceremony amendment)**: NEW `src/openingRoutes.ts`,
  `src/seedingRoutes.ts`, `lib/opening-parse.mjs`, `lib/seeding-parse.mjs`,
  `lib/wiki-projection.mjs` (subscription + the wiki_fact deterministic lane),
  `src/index.ts` (additive mounts), tests. Deliver §3.3/§3.4 + the F13 dispatch.
- **D1 (dashboard)**: `app/queue/*` (types additive), `app/shared/queueKindCatalog.ts`
  (NEW), `app/shared/cards/LintFindingCard.tsx` (NEW), the parity probe test,
  `app/shared/reviewTypes.ts` (additive), lint verb in `reviewApi.ts` (additive).
- **D2 (dashboard)**: NEW `app/shared/onboardingApi.ts`, `app/shared/interviewApi.ts`,
  `app/clients/plan/page.tsx` (+ plan components), `app/onboarding/*` (firm + client
  interview surfaces), badges in client pickers it owns, tests/fixtures.
- **D3 (dashboard)**: NEW `app/shared/openingApi.ts`, `app/opening/*` (the carry-down
  workbench), `app/shared/cards/OpeningDryRunCard.tsx` (NEW; D2 consumes — contract §3.2),
  tests/fixtures.
- **D4 (dashboard)**: NEW `app/shared/seedingApi.ts`, `app/seeding/*` (batch + tick UI +
  cancel/complete), tests/fixtures.

## 3. Pinned contracts (BINDING; build against these, not against each other's WIP)

### 3.1 Interview /state v2 (R1 implements; D2 consumes)
GET `/api/interview/state?runId&scope[&planId]` →
`{ run_id, scope, status: 'running'|'complete'|'cancelled'|'unknown',
   pending_park: { parkIndex, seg, phase, question, expects?, op_key? } | null,
   terminal: { outcome, ... } | null,
   activity: Array<{ kind:'answered', seg, phase, echo, at? }>,   // sanitized CONFIRMED answers (firm scope: from the run stream; client scope MAY be [] — the plan page is the answer surface)
   plan, items }`.
Derived chip law: pending_park && !terminal ⇒ `awaiting_you`; status 'running' with no
pending_park ⇒ `working`; terminal ⇒ its outcome. The commit park carries
`expects:'create_firm_receipt'` AND typed `op_key`. The stream chunks gain
`{type:'interview_activity', seg, phase, echo}` emitted at each confirmed answer
(validated values only — never a raw unvalidated submission, never a secret).

### 3.2 OpeningDryRunCard (D3 implements; D2 embeds)
`<OpeningDryRunCard token={jwt} seedId={uuid} mode={'workbench'|'commit-gate'} />` —
self-hydrating on `get_opening_dryrun`; renders per-line computed-vs-document deltas
(DB figures verbatim), OBE net, unmapped labels, missing must-asks; `commit-gate` mode
is read-only compact.

### 3.3 Opening parse route (R2)
POST `/api/opening/parse-targets` `{seedId}` (Bearer; bookkeeper+ of the seed's firm) →
202 `{status:'parsed', lines:n}` | 409 typed refusal | 422 `{status:'unparseable',
reason}` (the keyed-fallback signal D3 surfaces). Deterministic extraction-surface read →
`record_opening_targets_parsed`; op_key `openingparse:<seed>:<document>`.

### 3.4 Seeding prepare route (R2)
POST `/api/seeding/prepare` `{clientId, documentId}` (Bearer; admin of the client's
firm) → 202 `{status:'created', batchId, proposals:{...counts}}` | 409 (open batch
exists → `{existing:true, batchId}`) | 422 unparseable. Parses a stamped `prior_gl`
document → typed proposals with evidence → `create_seeding_batch`; op_key
`seedprep:<client>:<sha>`.

### 3.5 Shared client + error envelope
Runtime api clients throw `RuntimeApiError {status, code, message}`; PostgREST errors
keep the existing wire.ts shape. All new dashboard reads/writes: reads = PostgREST
table reads or DEFINER fns per 0017 grants; writes = rpc with fresh op_key; NO figure
computed client-side; counts DB-authored.

### 3.6 queueKindCatalog (D1)
`Record<row_kind, { Row: renderer, Detail: renderer, fixture: QueueRow }>` + the
unknown-kind degrade fixture; the CI probe compares catalog keys against the literals
in `pg_get_functiondef('clara.list_review_queue'::regprocedure)` on the migrated rig DB.

## 3b. Post-build dual-review round (2026-07-24; adjudicated)

Native opus: MERGEABLE, 4 minor notes (one doc tidy applied). Codex gpt-5.6-sol:
NOT-MERGEABLE, 17 findings — adjudicated: FIXED on-branch = C1 (the keyed attribution
mint becomes an EXPLICIT once-per-seed human act — the file-to-client precedent; never a
draft-click side effect) · C3 (UI blocks mixed correction+additive approval) · H4 (keyed
seeds refuse the fixed-asset kind honestly — `seed_fixed_asset` takes no resolution and
derives one only from a tie document, so keyed FA is structurally CLR01 as-built; FORK-7
todo + B-12 is the shipped path) · H5 (strict all-or-422 parses — no silent partial
authority) · H6 (no zero-coercion; unavailable state; tie verdict withheld) · H7
(revocation re-check at the mutation boundary) · H8 (the parity probe runs in CI —
CLARA_RIG_DB=1 — and fails closed on unparsed row_kind projections) · H9 (counts bound
verbatim {proposal_count, refused_count}) · M10–M14, M15 (no local gate ever disables a
governed verb), M16 (typed-only commit op_key). ACCEPTED-WITH-RECORD = C2 (the
deploy-lock bootstrap window: exactly this PR — the 53 live hashes verified unchanged by
the native pass — and the post-deploy pre-lock-PR window, both governed and documented) ·
M17 (JWT-in-sessionStorage is the standing house dev-auth pattern, not a regression —
the HttpOnly-cookie migration is a recorded hardening follow-on).

**The 0018-candidate list (owner-ruled, one future micro-migration):** the consent
read-surface + document→client resolver (v25 memo) · monotonic `projected_from_seq`
guard · subject-bound keyed resolutions + `assert_client_resolved` binding check ·
`seed_fixed_asset` gains `p_resolution` (unblocks keyed FA) · `approve_opening_correction`
rejects outstanding non-correction drafts before finalizing · typed reason tokens on the
commit-refusal CLR10s.

## 4. Verification bar (every lane)

Lane tests green (dashboard: vitest/jest per app conventions + fixtures; runtime: the
node --test rig discipline w/ CLARA_RIG_DB) · `pnpm typecheck` + dashboard build green ·
no frozen file touched except R1's owned set · the two ceremonies stay visually/verbally
distinct (tick-list vs one-txn approval) · the agent-native acceptance test holds on
every new surface. Integration then: freeze re-baseline, full-tree gates, full rig
battery, dual cross-model review (native + codex), PR, merge on green+clean.
