# Slice-5 as-built review — native lane, sub-report: DATA-CORRECTNESS + verdict

All live-verified on clara_blind_test (127.0.0.1:5544), rollback transactions.

## Probes — every one PASSED
- **§3.0 blast-radius, all 9 steps** on the migrated schema: client_id DROPPED;
  filing_id + withdrawn columns; pair-CHECK + filing FK both VALIDATED; congruence
  trigger rewritten filings-any-status; retired CLR13 stubs + core dropped + allowlist
  row deleted; status CHECK draft|approved|withdrawn; filing-based indexes;
  taxonomy_active=2.
- **§3.7 freshness four-quadrant matrix** (assert_books_current, token before each
  single event): Q1 unassigned-doc ingest → stales NOBODY · Q2 extraction on a doc
  filed to A → stales EXACTLY A (sibling fresh) · Q3 correction_applied aggregate →
  EXEMPT · Q4 non-document null-client → firm-wide. CLR12 exactly where designed.
- **Metering arithmetic** (real writers, tight limits): declared-ceiling reserve;
  at-limit admission CLR14; resize excludes-self; settle uses actuals; daily formula
  settled-else-reserved; refund idempotent; settle-after-refund CLR18; adoption
  REFUNDS the duplicate, upgrade charges fresh — one charge per physical ingest.
  Duplicate→adopt: 1 document / 1 task / 1 ingested event / 1 active charge.
- **Retention math:** FY-missing conservative floor (date_trunc(year)+10y−1d);
  anchor on first filing; floor-never-shorten CLR17; retire-all → unanchored with
  retain_until PERSISTED; re-anchor holds the floor. NOTE: MAX-across-filings is
  structurally present but non-differentiating (client-independent date fn — AB-4).
- Belt-and-suspenders: legacy UPGRADE exactly-once carve-out (re-verify CLR15,
  storage_path CLR15, sha CLR08, delete CLR08); belt-vs-correction commit; withdrawn
  sweep; grant matrix (masked views only; record_rule_resolution runtime-login-only;
  correction writers human-only); freeze-lint; taxonomy full coverage; FORCE RLS ×14;
  intake state machine CLR16 transitions + terminal immutability.

## Findings (both MED, both RESOLVED in the fix round)
- **DC-1 — identifier normalization asymmetry (confirmed live):** add_client_identifier
  stored lower(btrim()) while the lane-1 predicate compares strip-ALL-whitespace — a
  spaced bank account/TIN could NEVER match (safe direction: abstain). FIXED: the write
  side now strips all whitespace (0007 add_client_identifier, hash + stored value);
  pinned by a regression test (spaced identifier → stored stripped → lane-1 resolves
  against a space-free OCR hit).
- **DC-2 — stale lane-2 comment + untested default reader:** matcher.mjs claimed the
  lane-2 reads were ungranted (pre-0008 reality) and no test drove the DEFAULT
  readMatchInputs. FIXED: comments updated to the 0008/AB-1 reality (the 42501 latch
  retained as a mis-deploy fail-safe); a new test drives the default reader LIVE
  (candidates computed from the real SQL) + proves firm hard-scoping (a sibling firm's
  same-name text yields no candidate).

## CONSOLIDATED NATIVE VERDICT
**APPROVE-WITH-NITS.** Migration 0007/0008 is data-correct: all four structural
invariants hold under the filing-bound shape; freshness/metering/retention/correction
behave exactly as contracted under live probing; governance is enforced in the DB.
No HIGH from any of the three angles (wire-truth MED-1 fixed; spec gaps G1–G7 + two
§8 edges in the fix lane; G8 + closed-period vacuity stand as AB-4 residuals; DC-1/
DC-2 fixed as above).
