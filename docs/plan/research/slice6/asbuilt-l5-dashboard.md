# REPORT L5 — dashboard lane (archived by the orchestrator from the lane's final message;
# the lane's environment blocked report-file writes)

STATUS: COMPLETE — all gates green. Orchestrator independently re-ran: parity test 11/11
PASS, `tsc --noEmit` clean. File scope verified via git status: apps/dashboard/** only.

GATES: typecheck PASS · lint PASS · build PASS (/chat + /documents compiled) · new `test`
script PASS 11/11. All files under the 500-line cap (api.ts split — below).

INVENTORY
New: app/chat/review.ts (je_review RPC wrappers + toDraftReview — the single 0009-jsonb
reconciliation point), app/chat/partCatalog.ts (registry + compile-time exhaustiveness
asserts), app/chat/JeReviewCard.tsx (card + edit panel), app/chat/partCatalog.test.tsx
(parity/reachability, 11 tests), app/documents/CodingSections.tsx, test/bootstrap.mjs,
tsconfig.test.json.
Edited: app/chat/api.ts (union +je_review +refusal per pins §3; pgrestError surfaces the
CLR code + DETAIL reason token; rpc exported), app/chat/parts.tsx (persisted branches +
explicit fallback chip + token prop + ATTACHMENT_PERCEPTION_COPY), app/chat/page.tsx,
app/documents/api.ts (4 coding wrappers), app/documents/page.tsx (mount CodingSections),
both CSS modules.

THREE-PLACE EXTENSION: api.ts union both types; applyChunk deliberately ZERO branches
(N-F16 — cards render from the authoritative terminal message); TranscriptParts persisted
branches for both + explicit "Unsupported part:" fallback chip (silent-drop closed),
status-resolver types still render nothing.

PARITY TEST: single registry consumed by parts.tsx AND the test; compile-time
conditional-type asserts force every ClaraPart type into render-or-resolver; runtime
renders each fixture through the REAL TranscriptParts (react-dom/server), asserts
non-empty and not-the-fallback; unknown type → fallback. NEGATIVE CONTROL: disabling the
je_review branch failed exactly test #6, restored. Runner: zero new deps — node --test +
workspace tsx + a bootstrap (TSX_TSCONFIG_PATH react-jsx tsconfig; CSS module stub via
Module._extensions, not flagged __esModule). No lockfile change.

RPC WRAPPERS (pinned §1 sigs, human lane, fresh op_key/click, re-fetch, no optimistic UI):
get_draft_review, approve_entry (0007 unchanged), revise_entry 6-arg → chains approve with
the NEW token, withdraw_draft, list_uncoded_filings, coding_tasks_visible read,
complete_coding_task, dismiss_coding_task.

CARD: hydration law (re-derive on mount + after every action); vendor
new/matched/suspected badges; tier-labelled cited quotes with region ids; uncertainty +
alternatives; high-stakes loud + CLR05 note; approve gates on status==='draft' &&
!amount_exception; errors verbatim; CLR21 amount_conflict → exception panel (both values +
regions, approve disabled, resolution = governed revise override, HIGH-STAKES stated);
CLR06 → "draft changed — re-review" + re-fetch. /documents: uncoded-bills +
coding-tasks (Done/Dismiss); Promise.allSettled so masked-column mismatches surface inline.

SANCTIONED DEVIATIONS: 6-arg revise_entry (pins §1 + companion §8 govern; contract §5's
5-arg is an abbreviation); api.ts split into review.ts for the 500-line cap.

INTEGRATION CLOSE-OUT: all four reconcile points resolved against the ACTUAL 0009 —
toDraftReview reads the nested entry row + derives tier from evidence + maps vendor
disposition from counterparty.current_outcome (null ⇒ "new vendor"/birth); the
amount-exception panel COMPOSES CLR21 amount_conflict with getMachineTotal() over
get_document_extract's regions[] (engine_kind='invoice_facts', field_path=
'invoice.total', latest done version_n → monetary_cents + engine_confidence + region
id — exact parse, defensive sweep removed); CODING_TASK_COLS matched to the actual
view (closed_reason, no open-reason, no firm_id); uncoded mapper already matched.
Gates green after each round (typecheck, test 11/11, lint, build). Lane CLOSED with
zero remaining assumptions.

ORIGINAL INTEGRATION-RECONCILE POINTS (as flagged at lane close, all now resolved):
- get_draft_review jsonb keys ↔ toDraftReview (review.ts): lines[].account_class/
  is_payable, vendor.disposition, evidence[], amount_exception{proposed_cents,
  machine_total_cents,*_region}, high_stakes, eligible_checker_count.
- coding_tasks_visible masked columns ↔ CODING_TASK_COLS; list_uncoded_filings keys ↔ the
  uncoded mapper.
- CLR21 DETAIL {"reason": token} must actually be emitted by L1 (DB) and preserved by L3.
- N-F18 realized WITHOUT a dedicated inbox (none exists as-built): coding-tasks list shows
  origin='correction' recodes + taskId filter for future notification deep-links →
  recorded as PIN-AB-5 in the pins register for the as-built review.
