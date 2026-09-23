/**
 * The migration corpus and the reviewed dynamic-SQL barrier map that
 * `firm-scope-db-pins.test.ts` walks. Split out of that test on 2026-09-05 at the
 * repo's 500-line ceiling when #552's two barrier entries were re-keyed at merge
 * prep; the test imports everything here by name and its behaviour is unchanged.
 *
 * The Map's KEY ORDER is load-bearing: the census compares it to the corpus's
 * file-sorted `blockedAt`, so entries must appear in the same order the migration
 * files sort on disk. A new entry is a review act — the `reason` records why that
 * specific barrier is understood, and the `sha256` is over the file's CONTENT
 * (never its name), so a rename at merge prep leaves it correct and only an edit
 * to the SQL moves it.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const MIGRATIONS_DIR = join(WEB_ROOT, "..", "..", "packages", "db", "migrations");

export const MIGRATION_FILES = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

export const migration = (name: string): string => readFileSync(join(MIGRATIONS_DIR, name), "utf8");

export type MigrationCorpus = {
  readonly files: readonly string[];
  readonly read: (name: string) => string;
};

export const DEFAULT_MIGRATION_CORPUS: MigrationCorpus = { files: MIGRATION_FILES, read: migration };

/** Exact, reviewed dynamic-SQL barriers. A new migration is never admitted here
 * merely because the lexer could not inspect it: adding an entry is a review act
 * and the reason records why this specific barrier is understood. */
export type ReviewedDynamicSqlBarrier = { readonly reason: string; readonly sha256: string };

export const REVIEWED_DYNAMIC_SQL_BARRIERS = new Map<string, ReviewedDynamicSqlBarrier>([
  [
    "0146_ninth_rowkind_seeding_proposal.sql",
    {
      reason: "Reviewed splice of clara.list_review_queue() from pg_get_functiondef; it cannot replace either P4 scope view.",
      sha256: "561ede4d64af78cbc150894b8ca6014f7b1514d45fa5d313ef6681012d2398a6",
    },
  ],
  [
    "0147_db_hardening_b_hash_only_bearer_tokens.sql",
    {
      reason: "Reviewed ALTER TABLE formatter drops the discovered firm_admissions primary-key constraint; it emits no view definition.",
      sha256: "28cfc3f7d83e28818e455c96849efe61ab87008bd7482239dfab41d0499f8121",
    },
  ],
  [
    "0149_counterparty_merge_pr_1.sql",
    {
      reason: "Reviewed pg_get_functiondef splices recut four named counterparty functions only; neither P4 scope view is a target.",
      sha256: "e44758a0a931122c1be8452fa4f4866d29e180bbffa0cff1ea3c9a9a94425cb5",
    },
  ],
  [
    "0151_f_a9_pr_1b_brake_census.sql",
    {
      reason: "Reviewed pg_get_functiondef loop recuts the explicit F-A9 function roster only; neither P4 scope view is a target.",
      sha256: "f6d093e5b5e6037386522581ec07fab6ad955b4944f3871fc5a31b2635173b7b",
    },
  ],
  // Re-keyed from UNNUMBERED_dba4_… when #551 claimed 0165–0173 at merge (2026-09-05); the
  // sha256 did not move, because a rename changes no bytes.
  [
    "0168_coding_lane_kind_exclusion.sql",
    {
      reason: "Reviewed pg_get_functiondef splices recut exactly two FUNCTIONS — clara.list_uncoded_filings(uuid) and clara.list_review_queue(jsonb,jsonb,integer) — each read at a literal signature and re-installed with one appended WHERE conjunct; the block emits no view definition at all, so neither P4 scope view can be a target. Same family as 0146's splice of the same queue function.",
      sha256: "c6f3b99a27f554650982893bc6288f7de33953824e5b930fc862f02c1e42b8d4",
    },
  ],
  // The two 裁-190 web-reads/doors files, re-keyed when #552 claimed 0174/0175 at merge prep
  // (2026-09-05). As UNNUMBERED_* files the statement file sorted first ('s' < 'w'); numbered,
  // web-reads (0174) sorts before the statement file (0175), so their relative order flipped
  // here to match the corpus. The sha256 values did not change — the hash is over CONTENT.
  [
    "0174_web_reads_and_small_doors.sql",
    {
      reason: "Reviewed pg_get_functiondef splices recut exactly two TRIGGER functions by name — clara._tf_chat_session_update() and clara._tf_counterparty_update_0011(). Both are `returns trigger`, so neither can emit a view definition of any kind, let alone either P4 scope view; each splice re-reads its own single oid and postchecks the installed body. The file's only other object creation is static DDL the lexer inspects directly.",
      sha256: "db3ef4f06061a83e9d6feee802cb5daf25947b9c7154189d37d8e461d3cdcad1",
    },
  ],
  [
    "0175_stmt_witness_totals_and_institution_code.sql",
    {
      reason: "Reviewed pg_get_functiondef splice recuts ONE named function, clara._persist_statement_core_v2(...), read by its exact oid; it returns jsonb and emits no view definition, so neither P4 scope view is reachable. Its postcheck additionally proves the legacy sibling core is byte-untouched by sha256.",
      sha256: "59c49ce96ef534f04958cbd831e5e6d0e02e4dca47b80385daf0d1c16cc99493",
    },
  ],
  // #606 (2026-09-09): the classify-after-extraction gate is the same 0175 splice family.
  [
    "0177_classify_after_extraction.sql",
    {
      reason: "Reviewed pg_get_functiondef splice recuts ONE named function, clara._enqueue_invoice_facts_core(uuid), read by its exact oid and re-installed with one early `awaiting_extraction` return inserted at a single anchor; it returns jsonb and emits no view definition, so neither P4 scope view is reachable. Its prestate pins the pre-image body sha256 and owner, and its postcheck pins the post-image sha256, the unchanged ACL, SECURITY DEFINER and search_path.",
      sha256: "2f33b837f22a331593f23a36972d7804268cfaa3a8b47483e36be433f7dece52",
    },
  ],
  // #623 (2026-09-10): the accounting-work lane widens the two agent_tasks guard bodies by the
  // same splice family. TWO executes in one DO block, not one — both recut a TRIGGER function.
  // Re-pinned the same day after the integration review recut 0178 itself (receipt-aware settle,
  // initiator-bound posting, client-scoped intent keys, basis caps). The migration had never
  // shipped, so it was edited in place; the barrier below is unchanged in KIND — the same two
  // splices, one of them now replacing a slightly longer anchor — and only the CONTENT hash moved.
  // Re-pinned AGAIN the same day for the residual finding: clara.settle_work_run now carries the
  // estate's own pending-clarify cascade (S4-D6). That is a plain `update clara.agent_interruptions`
  // inside a static function body plus one more catalog assertion in the tail — it adds NO dynamic
  // SQL and moves neither splice, so again only the CONTENT hash moved.
  [
    "0178_accounting_work_journal_successor.sql",
    {
      reason: "Reviewed pg_get_functiondef splice recuts TWO named trigger functions, clara._tf_agent_task_insert() and clara._tf_agent_task_update(), each read by its exact regprocedure and re-installed with one counted anchor replaced; both return trigger and emit no view definition, so neither P4 scope view is reachable. Each splice pins its pre-image prosrc sha256 and asserts its anchor occurs EXACTLY once before replacing, and the migration's tail re-reads both bodies to prove every pre-existing task kind survived.",
      sha256: "6fc68dd9df656731d43e861846de987ed1879a4c35726102a6171e74458b7f3a",
    },
  ],
  // #629 (0180) — the same family as 0146 and 0168 above: one reviewed splice of the SAME queue
  // function.
  [
    "0180_work_questions.sql",
    {
      reason: "Reviewed pg_get_functiondef splice recuts exactly ONE FUNCTION — clara.list_review_queue(jsonb,jsonb,integer), read at a literal signature and re-installed with one added CTE, one union arm, one counts aggregate and one counts key. The block emits no view definition at all, so neither P4 scope view can be a target, and its own postcheck re-derives every pre-existing row-kind marker at its prestate count. Same family as 0146's and 0168's splices of the same queue function.",
      sha256: "6ca91d9850c4623996baaea7225143ab7885f216311edefa1014aaef576625ff",
    },
  ],
  // #624 (0191) — the capability registry's ONE splice, the same 0175/0177 family: a
  // pg_get_functiondef recut of a single named function by its exact signature.
  [
    "0191_document_capability_registry.sql",
    {
      reason: "Reviewed pg_get_functiondef splice recuts ONE named function, clara.persist_document_extraction(uuid,text,integer,jsonb,jsonb,text,text,text), read by its exact regprocedure and re-installed with one `perform clara._assert_field_path(...)` inserted at a single counted anchor at the top of its region loop; it returns jsonb and emits no view definition, so neither P4 scope view is reachable. Its prestate pins the pre-image body sha256 and owner AND refuses the cutover while any stored document_regions.field_path would fail the new grammar; its postcheck pins the INSTALLED BODY's own sha256 as well as the assertion's single occurrence, every pre-existing gate, the unchanged owner/ACL, SECURITY DEFINER and search_path -- the substring probes say the splice did the right things, only the whole-body hash says it did nothing else. Every other object this file creates is static DDL the lexer inspects directly.",
      sha256: "26ae1b702b415f88c4f6e388e0040bcef7a8e19ece37c35da02717051db1ab8b",
    },
  ],
  // #778 (0201) — the same 0177/0191 family, except TWO splices in one file rather than one.
  // Admitted at the 2026-09-15 riders-batch integration: the migration landed on its own worker
  // branch without this entry, so the successor census red until the barrier was reviewed here.
  [
    "0201_document_regions_unique_field_path.sql",
    {
      reason:
        "Reviewed pg_get_functiondef splices recut exactly TWO named functions — clara.persist_document_extraction(uuid,text,integer,jsonb,jsonb,text,text,text) and clara.persist_invoice_facts(uuid,jsonb,text,text,integer,jsonb) — each read by its exact regprocedure literal and re-installed with ONE counted anchor replaced by an `on conflict (extraction_id,field_path) ... do nothing` arm (plus, in persist_invoice_facts, the absorbed-element re-raise of its own conflicting-duplicate forfeiture). Both return jsonb, and the file contains no `create view` of any spelling at all — static or spliced — so neither P4 scope view is reachable. Each splice asserts its anchor occurs EXACTLY once before replacing, and each postcheck pins the INSTALLED BODY's own sha256 as well as the unchanged owner, ACL, SECURITY DEFINER and search_path: the substring probes say the splices did the right things, only the whole-body hashes say they did nothing else. Every other object this file creates is static DDL the lexer inspects directly.",
      sha256: "b89e03f9ca77d6409412f690b7e020e02c6b162831bfd1773fd4596c5ad88a0d",
    },
  ],
  // #639 (0216) — the fixed-asset acquisition lane. Its ONE dynamic-SQL block is a GRANT loop, not
  // a splice: the same `execute format('revoke all on function %s from public' …)` idiom
  // 0041:4400-4423 uses, over a literal array of six function signatures written in the file
  // itself. It calls `pg_get_functiondef` nowhere and recuts nothing by discovery.
  [
    "0216_fixed_asset_acquisition.sql",
    {
      reason: "Reviewed grant loop only: `execute format(...)` over a LITERAL array of six function signatures spelled in this file (two recut FA reads, the runtime particulars overload and four ungranted internals), emitting revoke/grant/alter-owner statements alone. No pg_get_functiondef, no discovered target, and no `create [or replace] view` anywhere in the file — so neither P4 scope view is reachable, by construction rather than by inspection of a rendered string. Every other object this migration creates (one column, two foreign keys, one index, one deferred constraint trigger and six function bodies, two of them `create or replace` at literal signatures) is static DDL the lexer inspects directly, and the file's own prestate pins the pre-image sha256 of both recut bodies while its tail re-reads the installed grant matrix grantee by grantee.",
      sha256: "b0e7bb8b94ff7b2cc85da610a87d25105287a61ed1cfcb060ff0fa206830e93c",
    },
  ],
  // #657 (0226) — the bank match-evidence lane. Its dynamic SQL is the 0129 caller-loop family:
  // pg_get_functiondef splices that recut a CLOSED, LITERAL roster of named FUNCTIONS, each read
  // by its exact regprocedure and re-installed with one counted anchor replaced.
  [
    "0226_bank_match_evidence.sql",
    {
      reason:
        "Reviewed pg_get_functiondef splices recut a CLOSED literal roster of named functions: clara._match_bank_line_core(...) (its terminal _finish_op payload, one counted anchor), clara._agent_bank_receipt(...) (two counted anchors — the INSERT column list and the VALUES tail), and the THIRTEEN clara._agent_*_core bodies spelled out in this file own v_sigs array, exactly as 0129:1063-1106 does. Every target is read by its exact pinned signature, every anchor is asserted to occur EXACTLY once before replacing, and every body returns jsonb, uuid or void — the file contains no `create [or replace] view` of any spelling, static or spliced, so neither P4 scope view is reachable by construction rather than by inspection of a rendered string. Its two new functions, the recut clara.list_bank_match_candidates and the whole-body recut of clara._agent_get_bank_pack_core are all STATIC DDL the lexer inspects directly (a first cut spliced the pack body dynamically and was reverted for exactly that reason). The file's own prestate pins the pre-image prosrc sha256 of all five recut bodies plus two non-regression pins, and its tail re-reads owner, SECURITY DEFINER, search_path, ACL and a single-pg_proc-row census over every name it installs and recuts.",
      sha256: "55b6e27952393d9a5327c1ae4ced980494facfffe93623765de232c342511b50",
    },
  ],
  // #651 (0227) — the depreciation-history lane, the same 0201 splice family and the largest of
  // them: SIX splices in one file rather than one or two.
  [
    "0227_depreciation_history.sql",
    {
      reason:
        "Reviewed pg_get_functiondef splices recut exactly NINE named functions across TEN blocks, each read at its own LITERAL regprocedure signature spelled in this file — clara._tf_fa_authority_transition() TWICE (§B.1 widens its write allowlist, §B.2 splices the write-once wall for the two sign-time columns on its own anchor), clara.retire_depreciation_authority(uuid,uuid,text,text) (§B.3 stamps the window floor by coalesce, without which this file's own ck_fa_authorities_window would refuse the lawful withdrawal of a never-signed authority as a raw 23514), clara._fa_validate_particulars(jsonb), clara.complete_fixed_asset_particulars(uuid,uuid,jsonb,text), clara._fa_complete_particulars_core(uuid,uuid,uuid,uuid,jsonb,text,text), clara.revise_fixed_asset_particulars(uuid,uuid,jsonb,date,text), clara._fa_run_period_core(uuid,date,date,text,uuid,uuid,text), clara._fa_oldest_unmet_period(uuid) and clara._fa_asset_json(uuid,date). Eight return jsonb/boolean/record and the ninth returns trigger, so none can emit a view definition of any kind, and the file contains no `create view` of any spelling at all — static or spliced — so neither P4 scope view is reachable, by construction rather than by inspection of a rendered string. Every splice counts its anchor and refuses unless it occurs EXACTLY once; the two 0042-era bodies additionally re-run 0042 S5.15c/S5.15d's own marker censuses as their prestate AND their postcheck, including S5.15c's ordering law. The file's prestate pins the pre-image body sha256 of every recut target measured off pg_proc.prosrc, and its tail re-proves owner, ACL, SECURITY DEFINER and pinned search_path for each one. Every other object this migration creates (five columns, three CHECK constraints, one backfill UPDATE and four function bodies at literal signatures) is static DDL the lexer inspects directly.",
      sha256: "d55113b5b956f69bc0fc07f2688a91916442408b13238bbb557a4ce5b636e424",
    },
  ],
  // #660 [0232] — the client financial pack's own RLS loop, appended at the sorted position.
  [
    "0232_client_financial_pack.sql",
    {
      reason:
        "Reviewed: the ONLY dynamic SQL in 0232 is a two-iteration do-block that enables and FORCES row level security and creates an owner policy and a firm-scoped human policy on the file's OWN two new relations (clara.cash_account_set_versions, clara.cash_account_set_members) — the same execute-format loop 0003:505-518 uses for the core tables. It emits ALTER TABLE and CREATE POLICY only and contains no CREATE VIEW of any kind, so neither P4 scope view can be a target; the two relation names it interpolates are string literals in the array beside it. Re-read in fix round 1 and again in fix round 2: the loop itself is byte-unchanged; the file's sha moved because the pack's comparison, composition, coverage-reason and disclosure arms were corrected (round 1) and because the publish door now re-reads the current version after its `select … for update` returns nothing (round 2, recheck NF-1) — none of which is dynamic SQL. Re-read a THIRD time in INTEGRATION fix round 2 (DECISIONS 6.4 row 1): the sha moved again because the two SECURITY INVOKER reads now take their money as-of from the house book-day authority through a new one-line SECURITY DEFINER delegate, clara.book_today(), which this file creates with STATIC `create function` DDL and a static `grant`/`revoke` pair — the do-block above is still byte-unchanged and is still the only dynamic SQL in the file.",
      sha256: "4240e93328d0e9a3174fae476ed99a9fa41da6b2379cafc9d66d2ac2b3a667dd",
    },
  ],
  // #1008 [0234] — the platform legal enforcement mode, appended at the sorted position. Same
  // splice family as 0177/0191/0201/0226: pg_get_functiondef recuts of a CLOSED literal roster of
  // named FUNCTIONS, each read at its exact signature.
  [
    "0234_legal_enforcement_mode.sql",
    {
      reason:
        "Reviewed pg_get_functiondef splices recut a CLOSED literal roster of exactly THREE named functions, each read at its own literal regprocedure spelled in this file — clara.prepare_egress_dispatch(uuid,uuid,text,bigint,text,text) (three counted anchors: the mint arm's consent VALUES list, its clara._audit payload and its egress.purpose_consent_derived payload), clara.restore_client_egress_purpose(uuid,text,text) (three counted anchors of the same shape) and clara.get_firm_legal_standing() (one counted anchor on its RETURN object). Two return jsonb and the third returns jsonb as well, so none can emit a view definition of any kind, and the file contains no `create view` of any spelling at all — static or spliced — so neither P4 scope view is reachable, by construction rather than by inspection of a rendered string. Each block asserts the split at the AS $function$ boundary, counts every anchor and refuses unless it occurs EXACTLY once, and then goes further than the family usually does: after installing, it re-reads the COMMITTED body and applies the REVERSE substitution, requiring the remainder to hash to the pinned pre-image byte for byte — so a smuggled change anywhere else in the spliced body reds the migration rather than the census. Every other object this migration creates (one relation with its RLS, policy, two triggers and seed row, three function bodies at literal signatures including the whole-body recut of clara._accounting_work_egress_live, and the grant/revoke/comment matrix) is STATIC DDL the lexer inspects directly. The file's prestate pins the pre-image prosrc sha256 of all four recut bodies plus two non-regression pins (clara.consume_egress_dispatch and clara.set_admission_capacity), and its tail re-reads owner, SECURITY DEFINER, pinned search_path, ACL and a single-pg_proc-row census over every name it installs.",
      sha256: "ed995a59f88e4369dc02c654ea1ebb2dcdfc7f7e3bec4dedbdd802acb4ccec25",
    },
  ],
  // #898 [0240] — the financial year-end DAY, appended at the sorted position. Same splice family
  // as 0146/0177/0191/0201/0226: one pg_get_functiondef recut of ONE named FUNCTION, read at its
  // exact signature.
  [
    "0240_financial_year_end_day.sql",
    {
      reason:
        "Reviewed: the ONLY dynamic SQL in 0240 is a single do-block that recuts ONE named function, clara._knowledge_assert_value(text,jsonb), harvested from the LIVE catalog with pg_get_functiondef at its exact regprocedure literal spelled in this file and re-installed with ONE counted anchor (the `shape_only` arm) replaced by the new `range:day_1_31` arm in front of it. That function RETURNS VOID and its body contains no CREATE VIEW of any spelling (measured on the live catalog, not argued), and the file itself contains no `create view` of any spelling at all — static or spliced — so neither P4 scope view is reachable, by construction rather than by inspection of a rendered string. The block counts its anchor and refuses unless it occurs EXACTLY once, and it is a guarded no-op under the #957 redo path when the body already carries the marker, so a redo cannot duplicate the arm. §0 pins the pre-image prosrc sha256 the splice assumes, and §Z re-reads the COMMITTED body to prove the prestate sha is gone, that `range:day_1_31` occurs exactly once, that every prior label's arm survived at its own original occurrence count, and that SECURITY DEFINER, the pinned search_path and the ACL (revoked from PUBLIC, granted to no application role) are byte-identical to prestate. Every other object this migration creates (one clara.knowledge_keys row, one clara.knowledge_plan_item_map row and their tail censuses) is static DML the lexer inspects directly.",
      sha256: "c75d8d8e388452174af4227c2773fc4a65b69245fefc6a1fbdf4e43529bcd67d",
    },
  ],
  // riders wave 2, lane 05 (document intake) — three files of the SAME 0177/0191/0201/0226/0234
  // splice family, appended at the sorted position. Added in this lane's fix round: the first
  // generation shipped all three without an entry, so this census threw
  // "unreviewed dynamic-SQL barrier at 0252_document_ingest_window_myt.sql" and the walk stopped
  // there — which is also why only 0252 was named while all three needed one.
  [
    "0252_document_ingest_window_myt.sql",
    {
      reason:
        "Reviewed pg_get_functiondef splices recut a CLOSED literal roster of exactly FIVE named functions, each read at its own literal regprocedure spelled in this file — clara._reserve_document_ingest(uuid,uuid,integer,timestamptz), clara._resize_document_reservation(uuid,uuid,integer), clara._settle_document_reservation(uuid,uuid,integer) and clara.settle_ingest_reservation(uuid,integer,text) each on ONE anchor (the daily window clause, moved from a UTC calendar day to Asia/Kuala_Lumpur), and clara.get_intake_batch(uuid,integer) on TWO (its capacity descriptor's explanatory comment and the jsonb literal beside it). Four return uuid, void or jsonb and the fifth returns jsonb, so none can emit a view definition of any kind, and the file contains no `create view` of any spelling at all — static or spliced — so neither P4 scope view is reachable, by construction rather than by inspection of a rendered string. Every block asserts the split at the AS $function$ boundary, counts its anchor and refuses unless it occurs EXACTLY once, then re-reads the COMMITTED body and applies the REVERSE substitution, requiring the remainder to hash to the pinned pre-image byte for byte. The file creates no relation, no function and no grant: its only other statements are one `comment on function` and its prestate/tail assertion blocks, which additionally census every clara body reading document_ingest_reservations and pages_per_day for either spelling of the retired UTC idiom and require that set to be empty.",
      sha256: "44f6326f5d528702e7319192b1ebfdd8c7cc6c794ed1933f2a549424f164b728",
    },
  ],
  [
    "0253_batch_cancel_reissue.sql",
    {
      reason:
        "Reviewed pg_get_functiondef splice recuts exactly ONE named function, clara.cancel_intake_batch(uuid,uuid,text), read at its own literal regprocedure spelled in this file, on TWO counted anchors — the refusal-on-duplicate guard, which gains one named exception for a stopping batch whose stored canceller holds no active bookkeeper-or-above membership OF THAT FIRM, and the state-transition block, which gains the re-issue's own elsif branch. It returns jsonb, so it cannot emit a view definition of any kind, and the file contains no `create view` of any spelling at all — static or spliced — so neither P4 scope view is reachable, by construction rather than by inspection of a rendered string. The block asserts the split at the AS $function$ boundary, counts both anchors and refuses unless each occurs EXACTLY once, then re-reads the COMMITTED body and applies the REVERSE substitution, requiring the remainder to hash to the pinned 0229 pre-image byte for byte. The file creates no relation, no function and no grant: its only other statements are one `comment on function` and its prestate/tail assertion blocks, which re-read the ACL byte-identically and prove exactly one batch_already_cancelling raise site survives.",
      sha256: "c8ad1b9c5645f660f4f80fb711a10b71b9a9457a155357cfc358c7603520a462",
    },
  ],
  [
    "0254_intake_refusal_record.sql",
    {
      reason:
        "Reviewed pg_get_functiondef splice recuts exactly ONE named function, clara.create_document_intake(uuid,text,uuid,text,text,bigint,text,timestamptz,text), read at its own literal regprocedure spelled in this file, on TWO counted anchors — the declare line, which gains the refusal flag, and the single clara._reserve_document_ingest call, which gains an `exception when sqlstate 'CLR18'` arm committing the already-inserted intake row at failed/limit and returning a refusal outcome. It returns jsonb, so it cannot emit a view definition of any kind, and the file contains no `create view` of any spelling at all — static or spliced — so neither P4 scope view is reachable, by construction rather than by inspection of a rendered string. The block asserts the split at the AS $function$ boundary, counts both anchors and refuses unless each occurs EXACTLY once, then re-reads the COMMITTED body and applies the REVERSE substitution, requiring the remainder to hash to the pinned 0007 pre-image byte for byte. The file creates no relation, no function and no grant: its only other statements are one `comment on function` and its prestate/tail assertion blocks, which re-read the ACL byte-identically, count the audit calls and prove the reservation helper and the batch read are untouched.",
      sha256: "e233d61e67d33c19a339b15612f6973e0461da88bd10af4f18c51af420e1f3ef",
    },
  ],
  // #974 [0260] (riders wave 2, lane 07) — the eleventh Needs-you row kind, the same
  // 0146/0168/0180 splice family: ONE pg_get_functiondef splice of the SAME queue function.
  [
    "0260_depreciation_authority_pending_rowkind.sql",
    {
      reason:
        "Reviewed pg_get_functiondef splice recuts exactly ONE FUNCTION — clara.list_review_queue(jsonb,jsonb,integer), read at a literal signature and re-installed with one added CTE (authority_rows), one union arm and one row-json builder gate (authority_id, the asset_id/advance_id case-when idiom). The block emits no view definition at all, so neither P4 scope view can be a target, and its own postcheck re-derives every one of the ten pre-existing row-kind markers at their prestate counts. Same family as 0146's, 0168's and 0180's splices of the same queue function. The file's separate tail (a second do-block) runs a behavioural probe through the real propose/retire doors inside a forced-rollback subtransaction — no dynamic SQL of its own, just direct calls to already-reviewed functions.",
      sha256: "d84659c80b4aee33f46038660ee97e2f322a7e6861cdc5874ebfb79507cde81f",
    },
  ],
  // #932 [0277] (riders wave 3, lane 04) — the fixed-asset default depreciation policy. NOT the
  // pg_get_functiondef splice family: its three recut function bodies (the acquisition birth
  // trigger, clara._fa_on_approve and clara._fa_asset_json) are each written out as a whole
  // literal `create or replace function … as $$ … $$`, static DDL the lexer reads directly. This
  // file's dynamic SQL is confined to TWO closed, literal EXECUTE sites, neither of which is a
  // pg_get_functiondef discovery and neither of which can emit a CREATE [OR REPLACE] VIEW of any
  // spelling.
  [
    "0277_fa_default_depreciation_policy.sql",
    {
      reason:
        "Reviewed: the file's only dynamic SQL is (1) a guarded ALTER TABLE do-block adding clara.fixed_assets.depreciation_policy_id/depreciation_policy_version and their tenant-congruence foreign key — two EXECUTE calls on single string literals and one on a three-piece `||` concatenation of literal ALTER TABLE text, no interpolated identifier or discovered body — and (2) the standard 0038:8056-8064 / 0041:4404-4423 bulk-ACL idiom, `execute format('revoke|grant|alter function owner …', f)` looped over a two-element literal array naming this file's own two new doors, clara.set_fa_depreciation_policy and clara.retire_fa_depreciation_policy. Both sites emit ALTER TABLE / GRANT / REVOKE / ALTER FUNCTION OWNER statements only; neither calls pg_get_functiondef, reads a live catalog body, or interpolates a relation name, so neither can produce a CREATE OR REPLACE VIEW of any kind by construction, and the file contains no `create view` of any spelling — static or spliced — at all. Every other object this migration creates (one new table with its RLS/policies/triggers, two new columns, one new foreign key and index, and the three recut function bodies) is STATIC DDL the lexer inspects directly; the recut bodies' own prestate pins the LIVE pre-image sha256 measured on the lane-04 rig and the tail re-reads the installed bodies' sha256, ACL and owner.",
      sha256: "90656f46a5a89cc64e97938694c0e5139ab0d5eb6e8ab9cdeb8022a4cb380acb",
    },
  ],
  // #975 [0279] (riders wave 3, lane 04) — the closed-year arrears question. Same family as
  // 0277's entry directly above: every recut body is written out as a whole literal
  // `create or replace function … as $$ … $$`, static DDL the lexer reads directly, and the file's
  // ONLY dynamic SQL is the standard bulk-ACL loop over its own one new door.
  [
    "0279_fa_closed_year_arrears.sql",
    {
      reason:
        "Reviewed: the file's only dynamic SQL is the standard 0038:8056-8064 / 0041:4404-4423 bulk-ACL idiom, `execute format('revoke|grant|alter function owner …', f)` looped over a ONE-element literal array naming this file's own new door, clara.record_fa_arrears_resolution. That site emits GRANT / REVOKE / ALTER FUNCTION OWNER statements only; it never calls pg_get_functiondef, never reads a live catalog body and never interpolates a relation name, so it cannot produce a CREATE [OR REPLACE] VIEW of any spelling by construction, and the file contains no `create view` of any spelling — static or spliced — at all. Everything else this migration installs is STATIC DDL the lexer inspects directly: one new table (clara.fa_arrears_resolutions) with its indexes, RLS policies and two triggers, one new ungranted internal (clara._fa_closed_arrears), one new door, and four whole recut function bodies (clara._fa_run_period_core, clara._fa_oldest_unmet_period, clara.preview_depreciation_run, clara.run_depreciation_period_for). The recut bodies' prestate pins each LIVE pre-image sha256 measured on the lane-04 rig, and the tail re-reads the installed bodies' markers, volatility, ACL and owner.",
      sha256: "ca9ede2bd4b065a8d3b4e67bde07b5afffbe937b2c1c083e580baf563de5a640",
    },
  ],
  // Ticket 1012 [0288] (riders wave 3, lane 07) — the SAME 0146/0168/0180/0260 splice family,
  // run in reverse for the first time: a row kind is REMOVED from the queue rather than added.
  [
    "0288_seeding_lane_retired.sql",
    {
      reason:
        "Reviewed pg_get_functiondef splice recuts exactly ONE FUNCTION — clara.list_review_queue(jsonb,jsonb,integer), read at a literal signature and re-installed with its `seeding_rows` CTE and that CTE's union arm REMOVED (a gravestone comment in their place), because ticket 1012 retires the prior-GL seeding lane the row kind chased. The spliced text is built by boundary-anchored substring surgery between two literal CTE openers, each asserted to occur exactly once, plus one exact-count `replace()` of the union arm; the block emits no view definition at all, so neither P4 scope view can be a target, and its own postcheck re-derives every one of the TEN surviving row-kind markers at their prestate counts and asserts the removed kind's marker is gone. Same family as 0146's, 0168's, 0180's and 0260's splices of the same queue function. The file's OTHER sections use no dynamic SQL: three `create or replace function` statements at literal signatures recut the retired doors to one typed refusal, two `update clara.document_capabilities` statements republish seven prior_gl rows and raise the registry version, and the prestate/tail blocks read the catalog and drive the real doors inside a forced-rollback subtransaction.",
      sha256: "6b6c5d031e2fe33de52c935befe35a4efcc8c4e321b53c4c2943f99ca34857bc",
    },
  ],
  // #889 [0289] (riders wave 3, lane 07) — the SAME 0149 read-splice-prove family, appended at
  // the sorted position. Added in this lane's FIX round: the first generation shipped without an
  // entry, so this census threw "unreviewed dynamic-SQL barrier at 0289_merge_alias_lane.sql".
  [
    "0289_merge_alias_lane.sql",
    {
      reason:
        "Reviewed read-splice-prove of exactly ONE FUNCTION — clara.merge_counterparties(uuid,uuid,uuid,text,text), read with pg_get_functiondef at that literal regprocedure spelled in this file and re-installed with TWO boundary-anchored substitutions: its residue alias insert gains the recorded_via column and the literal 'human_ui', and its combined firm/client guard is split so a counterparty outside the caller's firm answers CLR11 not-found rather than the CLR23 cross_client that made the door a cross-tenant existence oracle. Both images are derived branch-free, one replace() per top-level assignment, from that one pg_get_functiondef base; each anchor is asserted to occur EXACTLY once on whichever branch it belongs to, and S2 re-reads the COMMITTED body, applies the REVERSE of both substitutions and requires the remainder to equal the pre-image byte for byte plus a pinned post-splice prosrc sha256. The function returns jsonb, so it cannot emit a view definition of any kind, and the file contains no `create view` of any spelling at all — static or spliced — so neither P4 scope view is reachable, by construction rather than by inspection of a rendered string. The file creates no relation, no function (only a pg_temp anchor-count helper) and no grant; its other statements are the prestate, which pins the recorded_via CHECK and five witness bodies by sha, and the closed-world census of application-reachable clara.counterparty_aliases writers.",
      sha256: "2832301cfc379c493fefa5a7e88fe7752fc2e5b74033bd9f1f0895bce2c68e9e",
    },
  ],
  // #990 [0291] (riders wave 3, lane 08) — the bank-statement line source-citation lane, the same
  // 0175/0177/0191/0201/0226/0234 splice family: pg_get_functiondef recuts of a CLOSED literal
  // roster of named FUNCTIONS, each read at its own literal regprocedure signature.
  [
    "0291_bank_statement_line_citation.sql",
    {
      reason:
        "Reviewed pg_get_functiondef splices recut a CLOSED literal roster of exactly TWO named functions, each read at its own literal regprocedure spelled in this file — clara._persist_statement_core_v2(uuid,uuid,uuid,jsonb,text,uuid,uuid,uuid,text,text) on TWO counted anchors (the reader2-wrong-lane guard block, which gains a sibling citation-shape guard, and the atomic INSERT into clara.bank_statement_lines, which gains three citation columns sourced from a LEFT JOIN onto reader1's raw payload) and clara.get_bank_line_matching_context(uuid) on ONE counted anchor (the line jsonb_build_object's closing tuple, which gains citation_page). Both return jsonb, so neither can emit a view definition of any kind, and the file contains no `create view` of any spelling at all — static or spliced — so neither P4 scope view (clara.caller_context, clara.firm_registration_requests_visible) is reachable, by construction rather than by inspection of a rendered string. Each splice asserts its anchor occurs EXACTLY once before replacing, and each postcheck re-reads the INSTALLED body for the literal marker (citation_extraction_id / citation_page) it just spliced in. Every other object this migration creates (three nullable columns plus four CHECK/FK constraints on clara.bank_statement_lines) is static DDL the lexer inspects directly, and the file's own prestate pins the pre-image prosrc sha256 of all three bodies it reasons about (the two splice targets plus the untouched neighbour clara._stmt_lines_norm) MEASURED live on the lane database, per the wave-3 rig rule.",
      sha256: "45235f2dab6652a3faa15abff761ea953993ecf4636fcbfcab8ad2a6637505b3",
    },
  ],
  // #938 [0302] (riders wave 4, lane 03) — the twelfth Needs-you row kind, the SAME
  // 0146/0168/0180/0260/0288 splice family: ONE pg_get_functiondef splice of the SAME queue
  // function, plus one plain `create function` (clara.skip_plan_occurrence) that is static DDL
  // the lexer inspects directly and carries no dynamic SQL of its own.
  [
    "0302_accrual_bill_conflict.sql",
    {
      reason:
        "Reviewed pg_get_functiondef splice recuts exactly ONE FUNCTION — clara.list_review_queue(jsonb,jsonb,integer), read at a literal signature and re-installed with one added CTE (bill_rows), one union arm, and NO new row-json builder gate (this row's `id` mirrors the PLAN id directly rather than a dedicated column, unlike asset_id/advance_id/authority_id). The block emits no view definition at all, so neither P4 scope view (clara.caller_context, clara.firm_registration_requests_visible) can be a target, and its own postcheck re-derives every one of the ELEVEN pre-existing row-kind markers at their prestate counts. Same family as 0146's, 0168's, 0180's, 0260's and 0288's splices of the same queue function. The file's other section, clara.skip_plan_occurrence, is a single `create function` at a literal signature with no dynamic SQL of any kind, and the prestate/tail blocks read the catalog and drive real functions inside a forced-rollback subtransaction.",
      sha256: "181460d90c55555b6119bf541bd3b344d2617f078c4f687c45c2003990a9e73f",
    },
  ],
]);
