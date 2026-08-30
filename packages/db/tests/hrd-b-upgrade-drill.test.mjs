// MED-3 (independent review, 2026-08-29) -- the POPULATED upgrade drill for the hardening-batch
// Migration B (hash-only bearer tokens, 裁-16, migration 0147). The finding: B's two data
// conversions -- §A's backfill of clara.firm_admissions.token -> token_hash, and §B2's scrub of
// legacy plaintext clara.op_receipts invite receipts -- are both VACUOUS everywhere CI currently
// exercises them:
//
//   * the deploy-onto-existing leg (.github/actions/db-estate-suite/action.yml) applies
//     origin/main's migrations then HEAD's with NO seed in between, so both tables are EMPTY when
//     B lands;
//   * the estate suite seeds AFTER the whole chain has already migrated, so every
//     firm_admissions row it creates is written hash-only by rig-fixtures.mjs' own seedAdmission,
//     and every invite receipt is written hash-only by the already-recut body.
//
// So a mutant that hashes the WRONG COLUMN or the wrong RENDERING, that skips consumed rows, or
// that drops the receipt scrub entirely stays GREEN in CI: the migration's own tail proves "zero
// rows are wrong" over a population of zero. This file supplies the missing precondition -- a
// POPULATED pre-B database -- and proves per row, against a dual derivation (Node's crypto vs
// Postgres' sha256), that the conversion is byte-correct. Its acceptance criterion is a
// ROUND-TRIP, not a storage assertion: a pre-existing token is PRESENTED to the real create_firm
// door and must be consumed. Each guard is then mutated for real and must go RED.
//
// The fixtures, baseline export, drift-guarded block copies and assertions live in
// ./hrd-b-upgrade-kit.mjs -- a module, not a collected test file.
//
// RESET-GATED (drops schema clara via reset() and replays the whole numbered chain, once per
// cell), so it SKIPS in the concurrent all-packages sweep -- run it ALONE, in its own DB:
//   CLARA_RIG_ALLOW_RESET=1 CLARA_ALLOW_DESTRUCTIVE=1 node --test tests/hrd-b-upgrade-drill.test.mjs

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, endPool } from "./rig-helpers.mjs";
import {
  skipUnlessReset, freshBaseline, seedPreState, placeMigration, placedVersion, placedStem, realText, sub,
  BACKFILL_LINE, SCRUB_UPDATE, TAIL_ZERO_BLOCK, TAIL_FLOOR_BLOCK, RECEIPTS,
  assertConvertedCorrectly, assertDuplicateHashRefused,
  assertPreExistingTokenStillWorks, assertScrubbedShapeMatchesFreshMint,
} from "./hrd-b-upgrade-kit.mjs";

after(async () => { await endPool(); });

test("hrd-b upgrade drill: a POPULATED pre-B database converts correctly, a PRE-EXISTING token still opens a firm, the scrubbed receipt matches a fresh mint byte-shape, and duplicate digests are refused", async (t) => {
  if (skipUnlessReset(t)) return;
  const { migrate, dir, version } = await freshBaseline();
  await seedPreState();
  placeMigration(dir, version, realText(), "hrd_b_real");
  await migrate({ dir, log: () => {} });
  await assertConvertedCorrectly();
  await assertDuplicateHashRefused();
  await assertPreExistingTokenStillWorks();
  await assertScrubbedShapeMatchesFreshMint();
});

test("hrd-b upgrade drill MUTANT E (backfill hashes upper(token::text)): the migration applies CLEAN, its own tail says OK — and every pre-existing admission token is silently, permanently dead. Only the round-trip sees it", async (t) => {
  if (skipUnlessReset(t)) return;
  const { migrate, dir, version } = await freshBaseline();
  await seedPreState();
  const mutant = sub(realText(), BACKFILL_LINE,
    "update clara.firm_admissions set token_hash = sha256(convert_to(upper(token::text), 'UTF8')) where token_hash is null;");
  placeMigration(dir, version, mutant, "hrd_b_mutant_upper_backfill");

  // NOT rejected: NOT NULL holds, the unique index holds, the row count is preserved, the
  // plaintext column is gone. Every structural claim the migration makes about itself is TRUE.
  await migrate({ dir, log: () => {} });
  // The mutant is applied under B's REAL version string (the successors' stem witnesses read it --
  // see placeMigration); the cell placed the mutant, and placedStem() says so.
  assert.equal(placedStem(), "hrd_b_mutant_upper_backfill");
  const applied = await rootQuery(
    "select 1 from clara.schema_migrations where version = $1", [placedVersion()],
  );
  assert.equal(applied.rowCount, 1, "the wrong-rendering backfill commits silently — no error, no operator-visible warning");

  // Either shape counts as the round-trip catching it: the door REFUSES the token outright
  // (CLR04 'invalid or consumed admission token' — what actually happens, since the stored digest
  // no longer matches what create_firm computes), or it returns no receipt and the kit's own
  // assertion fires. Both are the same finding; pinning only one would be pinning the accident.
  await assert.rejects(
    async () => { await assertPreExistingTokenStillWorks(); },
    /invalid or consumed admission token|create_firm must ACCEPT a token minted before the migration/,
    "the ROUND-TRIP is the instrument that catches a hash the reader cannot reproduce",
  );
});

test("hrd-b upgrade drill MUTANT A (hash the WRONG COLUMN): backfilling token_hash from `note` instead of the token migrates GREEN — only this drill's per-row dual-derivation catches it", async (t) => {
  if (skipUnlessReset(t)) return;
  const { migrate, dir, version } = await freshBaseline();
  await seedPreState();
  const mutant = sub(realText(), BACKFILL_LINE,
    "update clara.firm_admissions set token_hash = sha256(convert_to(note::text, 'UTF8')) where token_hash is null;");
  placeMigration(dir, version, mutant, "hrd_b_mutant_wrong_column");

  // The migration itself does NOT refuse: token_hash is NOT NULL and unique either way, so every
  // structural check in its own tail passes. That is precisely the gap MED-3 named.
  await migrate({ dir, log: () => {} });
  await assert.rejects(
    async () => { await assertConvertedCorrectly(); },
    /token_hash must be sha256 of the CANONICAL uuid::text rendering/,
    "the drill's per-row hash assertion is what must catch a wrong-column backfill",
  );
});

test("hrd-b upgrade drill MUTANT B (skip CONSUMED rows): a backfill scoped to unconsumed rows is REFUSED by the migration's own NOT NULL, on a populated database only", async (t) => {
  if (skipUnlessReset(t)) return;
  const { migrate, dir, version } = await freshBaseline();
  await seedPreState();
  const mutant = sub(realText(), BACKFILL_LINE,
    "update clara.firm_admissions set token_hash = sha256(convert_to(token::text, 'UTF8')) where token_hash is null and consumed_at is null;");
  placeMigration(dir, version, mutant, "hrd_b_mutant_skip_consumed");

  await assert.rejects(
    () => migrate({ dir, log: () => {} }),
    (err) => {
      assert.match(
        err.message,
        /contains null values|not-null constraint/i,
        `expected the NOT NULL refusal over the consumed row, got: ${err.message}`,
      );
      return true;
    },
    "a backfill that skips consumed rows must not be able to land",
  );
  // The instrument that refused is only ARMED by a populated database: with zero consumed rows
  // (CI's shape today) this same mutant applies cleanly. Proven, not asserted, in the cell below.
});

test("hrd-b upgrade drill MUTANT B CONTROL (the vacuity MED-3 named): the SAME skip-consumed mutant applies CLEANLY against an EMPTY pre-B database — which is exactly the shape CI has today", async (t) => {
  if (skipUnlessReset(t)) return;
  const { migrate, dir, version } = await freshBaseline();
  // deliberately NO seedPreState() — this is CI's deploy-onto-existing shape
  const mutant = sub(realText(), BACKFILL_LINE,
    "update clara.firm_admissions set token_hash = sha256(convert_to(token::text, 'UTF8')) where token_hash is null and consumed_at is null;");
  placeMigration(dir, version, mutant, "hrd_b_mutant_skip_consumed_empty");
  await migrate({ dir, log: () => {} });   // a throw here would fail the test — that is the point
  assert.equal(placedStem(), "hrd_b_mutant_skip_consumed_empty");
  const applied = await rootQuery(
    "select 1 from clara.schema_migrations where version = $1",
    [placedVersion()],
  );
  assert.equal(applied.rowCount, 1, "the broken backfill applies silently over an empty table — this is why the populated drill above has to exist");
});

test("hrd-b upgrade drill MUTANT C (drop the legacy receipt scrub): the migration's own §K(3b) zero-assertion REFUSES it, on a populated database only", async (t) => {
  if (skipUnlessReset(t)) return;
  const { migrate, dir, version } = await freshBaseline();
  await seedPreState();
  const mutant = sub(realText(), SCRUB_UPDATE,
    "  -- [MUTANT: hrd-b-upgrade-drill.test.mjs removed §B2's scrub UPDATE on purpose, so the\n"
    + "  --  guard downstream is what has to catch the surviving plaintext.]\n"
    + "  perform 1;");
  placeMigration(dir, version, mutant, "hrd_b_mutant_no_scrub");

  await assert.rejects(
    () => migrate({ dir, log: () => {} }),
    (err) => {
      assert.match(
        err.message,
        /STILL carry a plaintext `token`/,
        `expected §K(3b)'s zero-assertion to refuse, got: ${err.message}`,
      );
      return true;
    },
    "a migration that leaves legacy plaintext receipts behind must not be able to land",
  );
});

test("hrd-b upgrade drill MUTANT C2 (drop the scrub AND its tail assertion): plaintext invite tokens SURVIVE the deploy and a replay would re-surface them — the exact HIGH-1 defect, caught here and nowhere else", async (t) => {
  if (skipUnlessReset(t)) return;
  const { migrate, dir, version } = await freshBaseline();
  await seedPreState();
  let mutant = sub(realText(), SCRUB_UPDATE,
    "  -- [MUTANT: §B2's scrub UPDATE removed on purpose]\n  perform 1;");
  mutant = sub(mutant, TAIL_ZERO_BLOCK,
    "  -- [MUTANT: §K(3b)'s plaintext zero-assertion removed on purpose]");
  // The FLOOR would also fire on this mutant (zero receipts carry token_hash once the scrub is
  // gone), so it has to be neutralized too for the migration to reach the state this cell is
  // about. Rewritten to a condition that is never true rather than deleted, so the surrounding
  // if/end-if structure stays valid SQL.
  mutant = sub(mutant, TAIL_FLOOR_BLOCK,
    `  select count(*)::int into v_n
    from clara.op_receipts where fn = 'invite_member' and jsonb_typeof(result) = 'object' and result ? 'token_hash';
  if false then`);
  placeMigration(dir, version, mutant, "hrd_b_mutant_no_scrub_no_guard");

  await migrate({ dir, log: () => {} });   // it lands silently, which is the finding

  const left = await rootQuery(
    "select count(*)::int as n from clara.op_receipts where fn='invite_member' and result ? 'token'",
  );
  assert.equal(
    left.rows[0].n, RECEIPTS.length,
    "with both guards gone the legacy plaintext tokens are STILL AT REST after the hardening migration committed — no error, no warning: HIGH-1 exactly as reported",
  );
  await assert.rejects(
    async () => { await assertConvertedCorrectly(); },
    /the plaintext token must be GONE from op_receipts.result/,
    "and the kit's own receipt assertion is the instrument that sees it",
  );
});

test("hrd-b upgrade drill MUTANT D (a same-named NON-unique index): the tail's pg_index property census REFUSES it, where a name-only census would have passed", async (t) => {
  if (skipUnlessReset(t)) return;
  const { migrate, dir, version } = await freshBaseline();
  await seedPreState();
  const mutant = sub(realText(),
    "create unique index uq_firm_admissions_token_hash on clara.firm_admissions (token_hash);",
    "create index uq_firm_admissions_token_hash on clara.firm_admissions (token_hash);");
  placeMigration(dir, version, mutant, "hrd_b_mutant_nonunique_index");

  await assert.rejects(
    () => migrate({ dir, log: () => {} }),
    (err) => {
      assert.match(
        err.message,
        /NOT unique, not valid\/ready, or is not a single-column index over token_hash/,
        `expected the pg_index property refusal, got: ${err.message}`,
      );
      return true;
    },
    "an index with the right NAME and the wrong PROPERTIES must be refused (law 3: spelling is not identity)",
  );
});
