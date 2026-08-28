// HIGH-1 (independent review, 2026-08-29) -- the PIN PROOF for the sha256(prosrc) recut guard
// the hardening-batch Migration A (UNNUMBERED_db_hardening_a_barrier_signer_wall.sql, §0(5))
// adds to its own prestate. The finding: a marker-string census alone admits an INTERVENING
// RECUT that keeps every marker but adds real behaviour elsewhere in the body -- the
// recut-body class the estate has already paid for (PR-0 gate night; the 0136 lesson). This
// file drives the ACTUAL migration file (never a hand-copy of its logic) through the real
// migrate() runner against a mutated live body, twice:
//
//   guard-fires    -- the live sign_vendor_identity_binding body is mutated (one HARMLESS
//                      comment added; every marker string this file's prestate checks for is
//                      kept byte-identical) before the real migration applies -> migrate()
//                      must REJECT, naming the observed sha mismatch.
//   mutant-of-guard -- the SAME mutated precondition, but against a MUTANT copy of the real
//                      migration text with HIGH-1's guards removed (the §0 sha-compare AND the
//                      §K sha-pin/surgical-delta -- MEASURED, not assumed: removing only the
//                      §0 guard still refuses, because §K(4c)'s surgical-delta proof
//                      independently ALSO catches this mutation, defense in depth found by
//                      actually running the mutant) -> migrate() SUCCEEDS this time, proving
//                      HIGH-1's machinery specifically is what refused above, not the
//                      pre-existing marker/position census alone.
//
// RESET-GATED (drops schema clara via reset(), replays the whole 0001-0142 chain twice), so it
// SKIPS in the concurrent all-packages sweep -- run it ALONE:
//   CLARA_RIG_ALLOW_RESET=1 CLARA_ALLOW_DESTRUCTIVE=1 node --test tests/hrd-a-recut-guard.test.mjs

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, copyFileSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { rootQuery, endPool } from "./rig-helpers.mjs";

after(async () => { await endPool(); });

const RESET_OK = process.env.CLARA_RIG_ALLOW_RESET === "1";
const MIG_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const REAL_FILE = join(MIG_DIR, "UNNUMBERED_db_hardening_a_barrier_signer_wall.sql");

function skipUnlessReset(t) {
  if (!RESET_OK) {
    t.skip("destructive (drops schema clara); set CLARA_RIG_ALLOW_RESET=1 on an ISOLATED DB to run ALONE");
    return true;
  }
  return false;
}

/** Copy 0001-0142 (every baseline migration, NOT this file's own UNNUMBERED text) into a
 *  throwaway dir. migrate() re-verifies EVERY already-applied version's checksum against what
 *  is on disk in `dir` -- omitting any of 0001-0142 here would fail the history-integrity check
 *  before the real test (the sha-compare guard) is ever reached, not because the guard fired. */
function exportBaseline() {
  const tmp = mkdtempSync(join(tmpdir(), "clara-hrda-baseline-"));
  for (const f of readdirSync(MIG_DIR)) {
    if (/^0(00[1-9]|0[1-9][0-9]|1[0-3][0-9]|14[0-2])_.*\.sql$/.test(f)) copyFileSync(join(MIG_DIR, f), join(tmp, f));
  }
  return tmp;
}

/** Fresh reset + 0001-0142 replay. Returns the migrate() function AND the dir it replayed
 *  from, so the caller can drop the numbered 0143 copy into that SAME dir afterward (migrate()
 *  needs every already-applied file present on disk, every subsequent call). */
async function freshBaseline() {
  const { reset } = await import("../scripts/reset.mjs");
  const { migrate } = await import("../scripts/migrate.mjs");
  await reset({ log: () => {} });
  const dir = exportBaseline();
  await migrate({ dir, log: () => {} });
  return { migrate, dir };
}

/** The exact harmless mutation: one comment line added right after `begin`, keeping every
 *  marker string this file's prestate census checks for (`binding not found`,
 *  `binding_not_proposed`, `binding_expired`, `proposal_drifted`, `post_control_absent`,
 *  `_reserve_op`) byte-identical -- simulating a real intervening recut a marker-only census
 *  would NOT catch, but a whole-body sha compare DOES. */
async function mutateLiveBody() {
  const row = await rootQuery(
    "select prosrc from pg_proc where oid = 'clara.sign_vendor_identity_binding(uuid,text)'::regprocedure",
  );
  const original = row.rows[0].prosrc;
  const marker = "\nbegin\n";
  assert.ok(original.includes(marker), "the live body's own `begin` line must be found -- the mutation anchor has drifted");
  const mutated = original.replace(
    marker,
    "\nbegin\n  -- HARMLESS INTERVENING COMMENT (this test's own mutation, simulating a real recut that keeps every marker string)\n",
  );
  assert.notEqual(mutated, original, "the mutation must actually change the body");
  await rootQuery("set role clara_fn_owner");
  await rootQuery(
    `create or replace function clara.sign_vendor_identity_binding(p_binding uuid, p_op_key text) returns jsonb
       language plpgsql security definer set search_path to clara,pg_temp
       as $hrda_mutant$${mutated}$hrda_mutant$`,
  );
  await rootQuery("reset role");
}

/** The EXACT sha-compare block, copy-pasted from the real migration file (verified present via
 *  the assertion below on every run, so a drift in the real file's text is caught HERE rather
 *  than silently no-op'ing the mutant). */
const GUARD_BLOCK = `  v_prosrc_sha := encode(sha256(convert_to(v_src, 'UTF8')), 'hex');
  if v_prosrc_sha <> 'bff40d61c1df2db40062f592b1c5c65b468934f5796cb0c8a3d4be4a7594312e' then
    raise exception 'hrd-a prestate: sign_vendor_identity_binding''s live prosrc sha256 does not match the pinned pre-image -- observed % (instrument: encode(sha256(convert_to(prosrc,''UTF8'')),''hex'')), expected bff40d61c1df2db40062f592b1c5c65b468934f5796cb0c8a3d4be4a7594312e. An intervening recut may have changed behaviour while keeping every marker string (the class this pin exists to catch) -- re-read the LIVE catalog, re-derive the delta this file means to apply, and re-pin both this hash and the tail''s post-image hash before re-authoring. Refusing rather than guessing.', v_prosrc_sha
      using errcode = 'CLR10';
  end if;
`;

// MEASURED, NOT THEORETICAL (fix-round finding): the §K(4c) surgical-delta byte-strip proof is
// an INDEPENDENT second guard against this exact recut-body class -- when this test's
// mutant-of-the-guard cell first removed ONLY the §0 sha-compare, migrate() STILL refused,
// because §K(4c) compares the CoR's fixed new-body text (stripped of the wall block) against
// the prestate-stashed (mutated) body and finds them unequal. Defense in depth, discovered by
// actually running the mutant, not assumed -- so a true "remove HIGH-1 entirely" mutant must
// neutralize BOTH the §0 prestate guard AND the §K(4b)/(4c) tail guards to isolate what the
// ORIGINAL (pre-HIGH-1) marker/position census alone would have let through.
const TAIL_GUARD_BLOCK = `  -- (4b) HIGH-1: the new body's WHOLE sha256 (same instrument: encode(sha256(convert_to(prosrc,
  --      'UTF8')),'hex')) equals the pinned post-image -- re-derived on the same fresh
  --      0001-0142+this-file rig the pre-image was pinned against, 2026-08-29.
  v_prosrc_sha := encode(sha256(convert_to(v_src_now, 'UTF8')), 'hex');
  if v_prosrc_sha <> '5285581ec371856d525fb47d2cfabc6e72b3a37285b291390e8c7aa34034e941' then
    raise exception 'hrd-a tail: sign_vendor_identity_binding''s new prosrc sha256 does not match the pinned expected post-image (instrument: encode(sha256(convert_to(prosrc,''UTF8'')),''hex'')) -- observed %, expected 5285581ec371856d525fb47d2cfabc6e72b3a37285b291390e8c7aa34034e941', v_prosrc_sha
      using errcode = 'CLR10';
  end if;

  -- (4c) HIGH-1: THE SURGICAL-DELTA PROOF. Strip the EXACT inserted block (byte-for-byte the
  --      same text §B's CoR adds -- copy-pasted here, not re-derived, so a mismatch here means
  --      THIS check's own copy has drifted from §B, not that the live body is wrong) from the
  --      new body; the result must equal the OLD (prestate-stashed) body byte-for-byte. This is
  --      independent of, and strictly stronger than, the marker/position census in (5)-(6)
  --      below: a marker census can be fooled by a recut that keeps every marker AND adds the
  --      wall AND changes something else nearby; this cannot -- removing exactly the wall block
  --      must reproduce the pre-image with NOTHING else different, or it raises.
  v_inserted_block := $blk$  -- 裁-18a (owner-ruled 2026-08-28, mohe-grill-rulings): separation of duties on an authority
  -- that lets Clara auto-post a vendor's invoices with no human eye on the document again --
  -- the signer must not be the same person who proposed the binding. STRICT (裁-18c): no
  -- relaxation for a single-admin firm -- unconditional on b.created_by vs c.actor, never
  -- gated on the firm's admin headcount. FAIL-CLOSED ON NULL (LOW-5, PROVEN BY EXECUTION,
  -- independent review 2026-08-29): a bare \`b.created_by = c.actor\` evaluates to NULL (not
  -- TRUE) whenever created_by is NULL, so a nullable-drift row would silently sign LIVE with
  -- no separation of duties at all -- measured for real on a rig with created_by nulled. The
  -- explicit \`is null\` arm refuses that case too, never relying on NOT NULL alone. The refusal
  -- names both lawful ways out in the OWNER'S OWN RULED WORDS (裁-18c's verbatim text) and
  -- carries a stable DETAIL reason token (MED-3, the estate's typed-refusal shape, the SAME
  -- idiom this body already uses below for post_control_absent) so a caller can discriminate
  -- this wall from any other CLR04 without parsing the message text.
  if b.created_by is null or b.created_by = c.actor then
    raise exception 'the signer cannot be the same person who proposed this binding; let Clara propose it, or add a second admin' using errcode='CLR04',detail='{"reason":"signer_is_proposer"}';
  end if;
$blk$;
  v_stripped := replace(v_src_now, v_inserted_block, '');
  if v_stripped <> (select v from _hrd_a_pre where k = 'svib.prosrc') then
    raise exception 'hrd-a tail: stripping the exactly-one-inserted-block from the new body does not reproduce the OLD (prestate) body byte-for-byte -- the recut touched something beyond the wall, or the block text this check compares against has drifted from §B''s own text' using errcode = 'CLR10';
  end if;
`;

/** A MUTANT copy of the real migration text with ALL of HIGH-1's new machinery neutralized --
 *  the §0 prestate sha-compare AND the §K(4b)/(4c) tail sha-pin + surgical-delta proof -- so
 *  only the ORIGINAL (pre-HIGH-1) marker/position census remains. Every OTHER check (family
 *  census, viewdef/ACL byte-comparison, marker/position, DETAIL-reason, NULL-safe-arm) is left
 *  byte-identical. Written into `dir` as the next numbered file. */
function writeGuardlessMutant(dir, filename) {
  const text = readFileSync(REAL_FILE, "utf8");
  assert.ok(
    text.includes(GUARD_BLOCK),
    "GUARD_BLOCK must match the real migration file's text EXACTLY -- if this assertion fires, "
    + "the real file's prestate guard was edited and this test's copy has drifted from it (fix: "
    + "re-copy the block from the file, do not just widen the match)",
  );
  assert.ok(
    text.includes(TAIL_GUARD_BLOCK),
    "TAIL_GUARD_BLOCK must match the real migration file's text EXACTLY -- if this assertion "
    + "fires, the real file's tail guards were edited and this test's copy has drifted from "
    + "them (fix: re-copy the block from the file, do not just widen the match)",
  );
  let mutantText = text.replace(
    GUARD_BLOCK,
    "  -- [MUTANT: hrd-a-recut-guard.test.mjs removed the §0 sha-compare guard here on purpose]\n",
  );
  mutantText = mutantText.replace(
    TAIL_GUARD_BLOCK,
    "  -- [MUTANT: hrd-a-recut-guard.test.mjs removed the §K sha-pin + surgical-delta guards here on purpose]\n",
  );
  writeFileSync(join(dir, filename), mutantText);
}

test("hrd-a HIGH-1 guard: an intervening recut that keeps every marker string is REFUSED by the sha256(prosrc) prestate pin", async (t) => {
  if (skipUnlessReset(t)) return;
  const { migrate, dir } = await freshBaseline();
  await mutateLiveBody();
  copyFileSync(REAL_FILE, join(dir, "0143_hrd_a_guarded.sql"));

  await assert.rejects(
    () => migrate({ dir, log: () => {} }),
    (err) => {
      assert.match(
        err.message,
        /prosrc sha256 does not match the pinned pre-image/,
        `expected the sha-mismatch refusal, got: ${err.message}`,
      );
      return true;
    },
    "the real migration must refuse over a body it does not recognise, even though every marker string still matches byte-for-byte",
  );

  // POSITIVE CONTROL for this cell's own instrument: the mutated body must NOT have been
  // overwritten by the refused migration (a refusal that still silently landed the CoR would
  // be worse than useless).
  const still = await rootQuery(
    "select position('HARMLESS INTERVENING COMMENT' in prosrc) > 0 as still_mutated, "
    + "position('let Clara propose it, or add a second admin' in prosrc) > 0 as has_wall "
    + "from pg_proc where oid = 'clara.sign_vendor_identity_binding(uuid,text)'::regprocedure",
  );
  assert.equal(still.rows[0].still_mutated, true, "the mutated body must survive the refused migration untouched");
  assert.equal(still.rows[0].has_wall, false, "the refused migration must NOT have applied the wall");
});

test("hrd-a HIGH-1 mutant-of-the-guard: the SAME mutated precondition passes SILENTLY once ALL of HIGH-1's guards (§0 sha-compare + §K sha-pin/surgical-delta) are removed -- proving THOSE checks, not the pre-existing marker census, are what refused the cell above", async (t) => {
  if (skipUnlessReset(t)) return;
  const { migrate, dir } = await freshBaseline();
  await mutateLiveBody();
  writeGuardlessMutant(dir, "0143_hrd_a_guardless_mutant.sql");

  // No assert.rejects here -- a throw would FAIL this test, which is exactly the point: without
  // ANY of HIGH-1's machinery, this migration silently CoRs over the mutated body it does not
  // recognise. MEASURED (fix-round finding): removing ONLY the §0 sha-compare is not enough on
  // its own to demonstrate this -- the §K(4c) surgical-delta proof independently ALSO refuses
  // the same mutation (it compares the CoR's fixed new-body text, stripped of the wall block,
  // against the prestate-stashed MUTATED body, and finds them unequal) -- so this mutant
  // neutralizes both layers to isolate what the pre-existing marker/position census alone
  // would have let through.
  await migrate({ dir, log: () => {} });

  // CORRECTED CLAIM (fix-round finding, the first draft of this cell asserted something
  // structurally impossible and had to be re-derived): `CREATE OR REPLACE FUNCTION` is a full
  // literal OVERWRITE, never a patch -- it replaces the live body with §B's exact hardcoded
  // text regardless of what was live before, so the "HARMLESS INTERVENING COMMENT" mutation
  // can NEVER survive inside the post-CoR body, guard present or absent. That is exactly why a
  // marker/position census (which only inspects the NEW body) cannot detect an intervening
  // recut on its own -- it has nothing left to compare against. The actual danger HIGH-1's
  // guards close is silent, unreported PROCEEDING: without them, this migration commits
  // successfully (recorded in clara.schema_migrations, no error, no operator warning) despite
  // the live pre-image never having matched what this file was authored against -- an
  // intervening recut's OWN behavioural change (whatever it was) is silently discarded with
  // zero record that it ever existed. The guarded cell above proves the alternative: the same
  // scenario REFUSES, loudly, naming the observed hash, before any of that can happen.
  const after = await rootQuery(
    "select position('let Clara propose it, or add a second admin' in prosrc) > 0 as has_wall "
    + "from pg_proc where oid = 'clara.sign_vendor_identity_binding(uuid,text)'::regprocedure",
  );
  assert.equal(after.rows[0].has_wall, true, "the guardless mutant migration DID commit the CoR silently (the wall landed, unconditionally) -- proving the guard's absence lets an unrecognised pre-image through with no refusal and no record");
  const recorded = await rootQuery(
    "select 1 from clara.schema_migrations where version = '0143_hrd_a_guardless_mutant'",
  );
  assert.equal(recorded.rowCount, 1, "the guardless mutant migration is recorded as successfully, silently applied -- no error, no operator-visible warning that the pre-image had drifted");
});
