# Slice-6 L1 migration report

## Outcome

`packages/db/migrations/0009_coding_floor.sql` is implemented as one migration
(2,695 lines). It compiles and commits on both a fresh 0001→0009 database and a
seeded 0001→0008 upgrade database. The migration's negative-control tail assertion
also aborts and rolls back the whole 0009 transaction when deliberately broken.

No interface-pin/spec contradiction was found. Implementation deviations: none.

The repository's Node test runner could not execute in this managed shell; see
**Existing battery**. PostgreSQL-level replacement drills and probes all passed.

## Object inventory

Line references below are to `0009_coding_floor.sql`.

- Role shell: creates/normalizes `clara_wake_write_login` as NOLOGIN and grants its
  sole membership, `clara_wake_interactive WITH INHERIT FALSE, SET TRUE`
  (lines 37–46, 643–657).
- Altered carriers: `coa_accounts`, `document_processing_tasks`,
  `document_extractions`, `document_regions`, `agent_tasks`, `journal_entries`, and
  `journal_lines` (lines 665–720, 752–790).
- New FORCE-RLS tables: `counterparties` (722), `entry_evidence` (791),
  `coding_tasks` (822), `coding_attempts` (869), and
  `processing_call_reservations` (892). Policies and the masked
  `coding_tasks_visible` view are at lines 1006–1037.
- Structural indexes/constraints: counterparty identity uniques (745–750), coding
  attempt unique constraints (879–891), one-open-draft preflight plus filing-keyed
  unique (921–938), and one-live-processing-lane unique (940–942).
- Internal helpers: task transition guard (56), cents normalization (89), explicit
  facts-state reader (115), shared line validator (171), counterparty resolver (234),
  evidence writer (325), supplier-bill assertion/constraint trigger (391–445), entry
  immutability replacement (449), processing-call reserve/settle/refund (491–567),
  and invoice-facts enqueue core (569).
- Recreated arity-changed writers: `_draft_entry_core` (1104), `draft_entry` (1293),
  `wake_draft_entry` (1311), and `upsert_account` (1339), following the DROP→CREATE→
  REVOKE→grant sequence starting at line 1098.
- Recreated same-signature writers: `approve_entry` (1390), `reverse_entry` (1555),
  processing claim/release/requeue (1956, 2008, 2032), filing/candidate/correction
  writers (2057, 2131, 2187).
- New lifecycle/task writers: `revise_entry` (1608), `withdraw_draft` (1692), and
  open/complete/dismiss coding task (1723, 1751, 1783).
- New invoice-facts terminal writers: persist/fail (1812, 1928).
- New SECURITY INVOKER reads: list-unassigned/get-extract/get-review/list-uncoded/
  get-entry-for (2356, 2379, 2453, 2529, 2553); runtime-only recovery read
  `get_coding_attempt` (2569).
- Coupled seven-event taxonomy addition and whole-coverage assertion (1040–1090).
- Lane grants, PUBLIC lockdown, overload/ACL/membership/taxonomy tail assertions
  (2585–2693).

## Ratified findings map

### C findings

- **C-1:** all four arity changes DROP their old signatures before CREATE; each
  recreated function is immediately revoked from PUBLIC and re-granted to its exact
  lane (1098–1383). The tail asserts one overload for every touched public writer and
  zero PUBLIC execute over the whole `clara` schema (2638–2667).
- **C-2:** `approve_entry` performs an unlocked identity read, locks the active filing
  first through `_active_document_filing(..., true)` (FOR SHARE), then locks the entry
  and reversal rows (1390–1442).
- **C-3:** payable/supplier-bill shape lives in `_assert_supplier_bill_shape` plus a
  deferred, approved-transition-only constraint trigger (391–445). Approval stamps
  payable lines (1475–1480); reversal/correction mirrors copy `counterparty_id`
  (1579–1584, 2262–2266).
- **C-4:** `revise_entry` replaces lines/evidence, re-resolves the vendor, and stamps
  `last_human_editor` while rotating the token (1608–1685).
- **C-5:** registration-dominant resolution, registered-name ambiguity, unregistered
  name reuse, and conflict refusal are centralized in `_resolve_counterparty`
  (234–321); birth occurs only inside approval (1444–1473).
- **C-6:** counterparty references use `(counterparty_id, firm_id, client_id)` and the
  counterparty/client key is composite (735–742, 815–819).
- **C-7:** facts completion inserts its own versioned `invoice_facts` extraction with
  the pinned engine and physical `page_polygon` regions (1852–1905). Reads select an
  explicit completed engine-kind/version (115–169, 2390–2447).
- **C-8:** approval re-reads facts while holding the filing lock and verifies amounts,
  source-region hash, and evidence tier (1481–1520); facts persistence locks filings
  then entries and rotates open-draft tokens (1837–1845, 1910–1917).
- **C-9:** evidence is required for document drafts and is verified/persisted in the
  draft transaction with extraction↔region↔document congruence and a recoverable source
  hash (325–389, 791–814). Tier A accepts a primary-source citation only when its
  normalized amount agrees with the separate completed facts total.
- **C-10:** pages-only second-pass reservation arithmetic sums ingest and facts
  carriers under the same firm advisory lock (491–567, 892–919); persist/fail settle
  or refund (1906, 1947). Facts branches never alter `documents.extraction_status`
  (1812–1954, 1956–2053).
- **C-11:** client-pinned SECURITY INVOKER reads and aggregate character budgeting are
  at 2356–2567; the bare `get_journal_entry(uuid)` agent grant is removed at 2589.
- **C-12:** `coding_attempts` has composite tenant FKs and structural uniques
  `(task_id, filing_id)` / `(entry_id)` (869–891); the core writes the attempt atomically
  with the draft (1259–1276), and the recovery read is runtime-only (2569–2578, 2621–
  2629).
- **C-13:** the migration provides the versioned facts task/extraction persistence
  required by `invoiceFacts_v1` (569–641, 1812–1954). Workflow registration/freeze
  files are correctly outside L1 scope.
- **C-14:** `coding_tasks` has the open→done|dismissed-only matrix, composite filing/
  result FKs, correction uniqueness, masked view, proof-bearing completion, and
  reason-bearing dismissal (822–868, 1033–1037, 1723–1810). Correction creates its
  task after filing/retention work and carries its id through notification, receipt,
  audit, and event (2287–2349).
- **C-15:** deploy-safe one-open-draft law is keyed to active filing (921–938);
  `_draft_entry_core` refuses approved-unreversed or duplicate coding (1134–1152), and
  `list_uncoded_filings` checks the same filing for both drafts and unreversed approved
  entries (2529–2551).
- **C-16:** account-code grammar is exactly
  `^[0-9]{4,8}$|^[0-9]{3}-[0-9A-Z]{2,4}$` (665–675); `upsert_account` carries and
  request-hashes `p_account_class` (1339–1383).
- **C-17:** DB support for the onboarding augmentation is the widened chart plus
  explicit payable classification/upsert above. The manifest/owner-confirmation
  workflow is outside L1 scope.
- **C-18:** the database half of the third-pool law is the guarded NOLOGIN role shell
  and single membership (37–46, 643–657), with a tail catalog assertion (2669–2682).
  Operator password/login ceremony remains outside the migration.
- **C-19:** the atomic attempt carrier stores the canonical part payload in the draft
  transaction (1259–1276, 869–891). Runtime part promotion remains outside L1 scope.
- **C-20:** the DB-layer SQLSTATE/constraint map is the migration header (lines 11–30);
  every CLR21 DB raise uses one of the five pinned JSON DETAIL reason tokens.

### NEW findings

- **NEW-1:** facts persistence locks active filings in UUID order FOR UPDATE, then open
  entries in id order, then explicitly rotates tokens/updated timestamps; approval
  retains the 0007 FOR SHARE filing lock order (1390–1421, 1832–1845, 1910–1917).
- **NEW-2:** immutable `coding_kind='supplier_bill'` carrier and its shape trigger are
  at 752–789 and 391–449; `coding_kind` is absent from every transition allow-set.
- **NEW-3:** full persisted fingerprint objects, fresh approval comparison, ambiguity
  refusal, and revise-as-rematch are at 234–321, 1444–1473, and 1608–1685.
- **NEW-4:** lawful task-keyed, pages-only `processing_call_reservations` carrier and
  combined AB-6 arithmetic are at 491–567 and 892–919.
- **NEW-5:** all five agent-granted reads use an agent-only nested `wake_firm()` check
  and raise CLR03 when unbound, without requiring that helper on the human lane
  (2356–2567). Lazy runtime mint/refusal shaping is outside L1.
- **NEW-6:** `p_coding` is hash-covered by the recreated core and its attempt is
  inserted in the same transaction as entry/evidence (1104–1127, 1161–1178,
  1259–1276).
- **NEW-7:** final public function names/signatures, filing keys, and the coding-task
  v1 state matrix are represented by 822–891, 1098–1383, and 1723–1810.
- **NEW-8:** the required database-side drill/probe qualifications were retained in
  the validation below; the full companion probe battery remains owned by its lane.

## Validation

Connections used only `PGHOST=127.0.0.1`, `PGPORT=5544`, `PGUSER=postgres`, and
`PGDATABASE=clara_test`. No DSN literal was used. PostgreSQL is 16 with trust auth.

### Upgrade drill

Because `pnpm`/Corepack could not run in this managed shell, I executed the same SQL
shape directly with `psql -X -v ON_ERROR_STOP=1 -1`: reset Clara, apply 0001–0008 in
filename order (one transaction each), apply both seeds, then apply only 0009 in one
transaction. Final output:

```text
upgrade_final|t
active_taxonomy|2
seed_clients|3
public_exec|0
```

### Fresh drill

Reset Clara; apply 0001–0009 in filename order (one transaction each); apply both
seeds. Final output:

```text
fresh_final|176
public_exec|0
```

The `176` is the resulting count of `clara` routines. Taxonomy inspection on the
fresh schema returned v1=13 rows and active v2=25 rows.

### Tail-assert negative control

Temporarily changed the final expected new taxonomy-pair count from 7 to 8, applied
0009 over a seeded 0001–0008 baseline, and observed:

```text
broken_migration_exit=3
ERROR: 0009 active taxonomy pair assertion failed: 7/7
counterparties_after_abort|t
```

`counterparties_after_abort|t` proves the 0009 transaction rolled back. Restored the
assertion to 7 and reapplied successfully (`upgrade_reapply_ok|t`, active taxonomy 2).
The migration currently contains only the restored `v_count<>7` assertion.

### Catalog and behavior probes

- PUBLIC execute: 0; no touched public writer had more than one overload.
- `clara_wake_write_login`: NOLOGIN; exactly one membership, interactive with
  `inherit_option=false`, `set_option=true`; no proactive membership.
- All five FORCE-RLS tables reported both RLS and FORCE RLS true.
- Granted-function matrix matched the pinned lanes; the three internal helpers had no
  app-role EXECUTE, and `get_coding_attempt` was runtime-only.
- Human-lane calls executed all five new reads; all five agent-lane calls without a
  credential raised CLR03; a valid interactive agent credential read successfully.
- Governed payable approval probe: approved, one payable line stamped, proposal and
  fingerprint cleared (rolled back).
- Tier-A probe: separate facts extraction count=1, primary citation tier=`verified`,
  supplier bill approved (rolled back).
- Lifecycle probe: draft→revise token rotation→withdraw succeeded (rolled back).
- Coding-task probe: open→dismissed with required reason succeeded (rolled back).

## Existing battery

The requested command could not reach the tests in this environment:

1. `pnpm --filter @clara/db test` — `pnpm` is not installed/on PATH.
2. `corepack pnpm --filter @clara/db test` with `COREPACK_HOME` redirected to
   `C:\tmp\clara-l1-corepack` — sandbox denied the cache mkdir with `EPERM`.
3. Direct equivalent `node --test packages/db/tests/` — Node failed every test-file
   launch before module evaluation with `EPERM: lstat 'C:\Users\zhant'`. Result was
   0 semantic tests run; the 36 reported failures are launcher/sandbox failures, not
   assertion results.

No `CLARA_RIG_ALLOW_RESET` variable was set. The orchestrator must rerun the exact
pnpm battery in a Node process allowed to traverse the workspace parent.

## Deviations

Implementation deviations: **none**. The direct-`psql` drill is a validation-tooling
substitution forced by the shell's Node/Corepack filesystem denial; SQL order,
transaction boundaries, seeds, and PG environment match the requested drills.

## Open questions / orchestrator adjudication

1. Rerun `pnpm --filter @clara/db test` outside this managed Node traversal denial.
2. The visible Slice-6 probe file `s6-counterparty.test.mjs` contains mutually
   exclusive expectations: its §2(2) correctly requires CLR23 for a normalized-name
   match with a different non-null registration, while its later §2(5) expects the
   same case to birth two rows. The ratified design/pins require CLR23; 0009 implements
   that law.
3. The visible `s6-schema.test.mjs` event query references `event_types.event_type`,
   while the shipped 0005 table and all ratified SQL use `event_types.name`. The
   migration preserves the shipped column and adds the seven coupled rows through
   `name`.

