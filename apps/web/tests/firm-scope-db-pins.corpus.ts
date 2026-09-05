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
]);
