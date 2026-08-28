// MED-3 (independent review, 2026-08-29) -- the POPULATED upgrade drill for the hardening-batch
// Migration B (hash-only bearer tokens, 裁-16). The finding: B's two data conversions -- §A's
// backfill of clara.firm_admissions.token -> token_hash, and §B2's scrub of legacy plaintext
// clara.op_receipts invite receipts -- are both VACUOUS everywhere CI currently exercises them:
//
//   * the deploy-onto-existing leg (.github/actions/db-estate-suite/action.yml) applies
//     origin/main's migrations then HEAD's with NO seed in between, so both tables are EMPTY when
//     B lands;
//   * the estate suite seeds AFTER the whole chain has already migrated, so every
//     firm_admissions row it creates is written hash-only by rig-fixtures.mjs' own seedAdmission,
//     and every invite receipt is written hash-only by the already-recut body.
//
// So a mutant that hashes the WRONG COLUMN, that skips consumed rows, or that drops the receipt
// scrub entirely stays GREEN in CI: the migration's own tail proves "zero rows are wrong" over a
// population of zero. This file supplies the missing precondition -- a POPULATED pre-B database --
// and then proves per row, against a dual derivation (Node's crypto vs Postgres' sha256), that the
// conversion is byte-correct. Each guard is then mutated for real and must go RED.
//
// RESET-GATED (drops schema clara via reset() and replays the whole numbered chain, once per
// cell), so it SKIPS in the concurrent all-packages sweep -- run it ALONE, in its own DB:
//   CLARA_RIG_ALLOW_RESET=1 CLARA_ALLOW_DESTRUCTIVE=1 node --test tests/hrd-b-upgrade-drill.test.mjs

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, copyFileSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { rootQuery, humanQuery, endPool } from "./rig-helpers.mjs";

after(async () => { await endPool(); });

const RESET_OK = process.env.CLARA_RIG_ALLOW_RESET === "1";
const MIG_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const REAL_FILE = join(MIG_DIR, "UNNUMBERED_db_hardening_b_hash_only_bearer_tokens.sql");

/** sha256 hex, computed in NODE -- deliberately a DIFFERENT implementation from the Postgres
 *  `sha256(convert_to(x,'UTF8'))` the migration uses, so agreement is a dual derivation rather
 *  than the same expression compared with itself. */
const sha256hex = (s) => createHash("sha256").update(s, "utf8").digest("hex");

function skipUnlessReset(t) {
  if (!RESET_OK) {
    t.skip("destructive (drops schema clara); set CLARA_RIG_ALLOW_RESET=1 on an ISOLATED DB to run ALONE");
    return true;
  }
  return false;
}

/** Every NUMBERED migration on disk (B itself is UNNUMBERED and is added by each cell, so the
 *  baseline is exactly "the frontier B will land on"). migrate() re-verifies EVERY applied
 *  version's checksum against what is in `dir` on every subsequent call, so omitting a baseline
 *  file would fail the history-integrity check before this drill's real subject is reached. */
function exportBaseline() {
  const tmp = mkdtempSync(join(tmpdir(), "clara-hrdb-baseline-"));
  let max = 0;
  for (const f of readdirSync(MIG_DIR)) {
    const m = /^(0\d{3})_.*\.sql$/.exec(f);
    if (!m) continue;
    copyFileSync(join(MIG_DIR, f), join(tmp, f));
    max = Math.max(max, Number(m[1]));
  }
  assert.ok(max > 0, "no numbered migrations found — the baseline export is looking in the wrong place");
  // B's number is claimed at MERGE, so this drill derives "one past the frontier" rather than
  // hardcoding it: the drill keeps working across every renumber.
  return { dir: tmp, nextVersion: String(max + 1).padStart(4, "0") };
}

async function freshBaseline() {
  const { reset } = await import("../scripts/reset.mjs");
  const { migrate } = await import("../scripts/migrate.mjs");
  await reset({ log: () => {} });
  const { dir, nextVersion } = exportBaseline();
  await migrate({ dir, log: () => {} });
  return { migrate, dir, nextVersion };
}

// ---------------------------------------------------------------------------------------------
// THE POPULATED PRE-B STATE. Written as the migration runner would find it on a real live
// database: plaintext admission tokens (one already consumed, carrying its receipt columns), an
// uppercase-spelled uuid, a non-ASCII note, and legacy invite_member op_receipts rows whose
// `result` still holds the plaintext token the pre-hardening body persisted.
// ---------------------------------------------------------------------------------------------
const FIRM = "00000000-0000-4000-8000-0000000000f1";
/** The actor who will PRESENT a pre-existing admission token to create_firm after the backfill.
 *  The round-trip is the real acceptance criterion: "the backfill ran" proves nothing about
 *  whether the reader can still find what it wrote. */
const ACTOR = "00000000-0000-4000-8000-0000000000a1";

/** The admission rows. `spelling` is what the OPERATOR typed; `canonical` is what uuid's own
 *  ::text rendering produces -- they DIFFER for the uppercase row, which is the point: the
 *  migration hashes the canonical form, and MED-2's onboard-rpr fix hashes `$1::uuid::text` for
 *  exactly this reason. */
const ADMISSIONS = [
  { note: "hrd-b drill · plain unconsumed", spelling: "11111111-1111-4111-8111-111111111111", consumed: false },
  { note: "hrd-b drill · CONSUMED with receipt", spelling: "22222222-2222-4222-8222-222222222222", consumed: true },
  { note: "hrd-b drill · UPPERCASE operator spelling (canonicalisation pin)", spelling: "AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE", consumed: false },
  { note: "hrd-b drill · 非 ASCII note · Ωμέγα · 🔐", spelling: "33333333-3333-4333-8333-333333333333", consumed: false },
];
const canonical = (spelling) => spelling.toLowerCase();

/** Legacy receipts. The pre-hardening body persisted `{invite_id, token, expires_at}` verbatim;
 *  one row carries a 64-hex token exactly as that body minted them, one carries a deliberately
 *  long multibyte string so the convert_to(...,'UTF8') spelling is proven byte-correct rather
 *  than merely ASCII-correct. */
const RECEIPTS = [
  { opKey: "hrd-b-drill-legacy-1", token: "a".repeat(32) + "b".repeat(32) },
  { opKey: "hrd-b-drill-legacy-2", token: "Ωμέγα-" + "🔐".repeat(40) + "-tail" },
];
/** A NON-invite receipt that also happens to carry a `token` key — §B2 is scoped to
 *  fn='invite_member', and this row proves that scoping is real rather than incidental. */
const FOREIGN_RECEIPT = { fn: "mint_wake_credential", opKey: "hrd-b-drill-foreign", token: "not-an-invite-token" };

async function seedPreState() {
  // The actor for the post-migration round-trip: a real, non-agent clara.users row holding no
  // active membership -- exactly what create_firm's entrance requires.
  await rootQuery(
    "insert into clara.users (id, display_name, email, is_agent) values ($1::uuid, $2, $3, false)",
    [ACTOR, "hrd-b drill owner", "hrd-b-drill-owner@rig.test"],
  );
  for (const a of ADMISSIONS) {
    await rootQuery(
      "insert into clara.firm_admissions (token, note) values ($1::uuid, $2)",
      [a.spelling, a.note],
    );
    if (a.consumed) {
      await rootQuery(
        `update clara.firm_admissions
            set consumed_at = now(), consumed_op_key = $2,
                consumed_result = jsonb_build_object('firm_id', $3::uuid, 'plan_id', $3::uuid)
          where note = $1`,
        [a.note, "hrd-b-drill-consumed-key", FIRM],
      );
    }
  }
  for (const r of [...RECEIPTS.map((r) => ({ ...r, fn: "invite_member" })), FOREIGN_RECEIPT]) {
    await rootQuery(
      `insert into clara.op_receipts (firm_id, fn, op_key, request_hash, result)
       values ($1::uuid, $2, $3, sha256(convert_to($3,'UTF8')),
               jsonb_build_object('invite_id', $1::uuid, 'token', $4::text, 'expires_at', '2099-01-01T00:00:00Z'))`,
      [FIRM, r.fn, r.opKey, r.token],
    );
  }
  // POSITIVE CONTROL on the fixture itself: the plaintext really is on disk before B runs, in
  // both places. A drill whose precondition silently failed to land would prove nothing.
  const pre = await rootQuery(
    `select (select count(*)::int from clara.firm_admissions) as adm,
            (select count(*)::int from clara.op_receipts where fn='invite_member' and result ? 'token') as legacy,
            (select count(*)::int from pg_attribute where attrelid='clara.firm_admissions'::regclass
               and attname='token' and attnum>0 and not attisdropped) as plaintext_col`,
  );
  assert.deepEqual(
    [pre.rows[0].adm, pre.rows[0].legacy, pre.rows[0].plaintext_col],
    [ADMISSIONS.length, RECEIPTS.length, 1],
    "the populated pre-B fixture must actually be on disk (plaintext admission column present, rows seeded) before the migration runs",
  );
}

/** Apply a (possibly mutated) copy of B's real text as the next numbered migration. */
function placeMigration(dir, nextVersion, text, stem) {
  const name = `${nextVersion}_${stem}.sql`;
  writeFileSync(join(dir, name), text ?? readFileSync(REAL_FILE, "utf8"));
  return name;
}

// ---------------------------------------------------------------------------------------------
// THE EXACT BLOCKS THIS DRILL MUTATES. Copy-pasted from the real file and asserted present on
// every run, so a drift in the migration silently turning a mutant into a no-op is caught HERE
// (a mutant that does not mutate is a false green — the lesson this whole file exists for).
// ---------------------------------------------------------------------------------------------
const BACKFILL_LINE =
  "update clara.firm_admissions set token_hash = sha256(convert_to(token::text, 'UTF8')) where token_hash is null;";

const SCRUB_UPDATE = `  update clara.op_receipts
     set result = (result - 'token')
                  || jsonb_build_object('token_hash',
                       encode(sha256(convert_to(result ->> 'token', 'UTF8')), 'hex'))
   where fn = 'invite_member' and jsonb_typeof(result) = 'object' and result ? 'token';`;

/** MEASURED HAZARD, not theoretical (this drill's own first run): `String.prototype.replace`
 *  interprets `$$` in a REPLACEMENT STRING as an escaped single `$`, so a replacement carrying a
 *  dollar-quoted SQL block silently loses one `$` per pair and the migration lexer then rejects
 *  the mutant with "unterminated dollar quote" -- a mutant that never reached its subject, read
 *  as a red for the wrong reason. Every substitution below therefore passes a FUNCTION, which
 *  disables `$` interpretation entirely. */
const sub = (text, from, to) => text.replace(from, () => to);

const TAIL_ZERO_BLOCK = `  select count(*)::int into v_n
    from clara.op_receipts where fn = 'invite_member' and jsonb_typeof(result) = 'object' and result ? 'token';
  if v_n > 0 then
    raise exception 'hrd-b tail: % invite_member op_receipts row(s) STILL carry a plaintext \`token\` -- a replay of those op_keys would re-surface the credential 裁-16a removes from the body', v_n
      using errcode = 'CLR10';
  end if;`;

/** The token_hash FLOOR, kept as its OWN constant rather than tacked onto the block above: the
 *  two checks are adjacent in the migration but a comment between them is enough to break a
 *  single contiguous copy, and a drift guard that fires on a comment edit trains its reader to
 *  widen the match instead of re-copying it. */
const TAIL_FLOOR_BLOCK = `  select count(*)::int into v_n
    from clara.op_receipts where fn = 'invite_member' and jsonb_typeof(result) = 'object' and result ? 'token_hash';
  if v_n < (select v::int from _hrd_b_pre where k = 'op_receipts.legacy_plaintext') then`;

function realText() {
  const text = readFileSync(REAL_FILE, "utf8");
  for (const [label, block] of [
    ["BACKFILL_LINE", BACKFILL_LINE],
    ["SCRUB_UPDATE", SCRUB_UPDATE],
    ["TAIL_ZERO_BLOCK", TAIL_ZERO_BLOCK],
    ["TAIL_FLOOR_BLOCK", TAIL_FLOOR_BLOCK],
  ]) {
    assert.equal(
      text.split(block).length - 1, 1,
      `${label} must appear EXACTLY once in the real migration text — if this fires, the migration was edited and this drill's copy has drifted from it (fix: re-copy the block from the file, never widen the match)`,
    );
  }
  return text;
}

// ---------------------------------------------------------------------------------------------

async function assertConvertedCorrectly() {
  const cols = await rootQuery(
    "select attname from pg_attribute where attrelid='clara.firm_admissions'::regclass and attnum>0 and not attisdropped",
  );
  const names = cols.rows.map((r) => r.attname);
  assert.ok(!names.includes("token"), "the plaintext admission column must be GONE after B");
  assert.ok(names.includes("token_hash"), "token_hash must exist after B");
  assert.ok(names.includes("id"), "the surrogate id must exist after B");

  const rows = await rootQuery(
    "select note, encode(token_hash,'hex') as hash, id is not null as has_id, consumed_op_key, consumed_result->>'firm_id' as receipt_firm from clara.firm_admissions order by note",
  );
  assert.equal(rows.rows.length, ADMISSIONS.length, "the backfill must preserve the row count exactly");
  for (const a of ADMISSIONS) {
    const row = rows.rows.find((r) => r.note === a.note);
    assert.ok(row, `the seeded row ${JSON.stringify(a.note)} must survive the migration`);
    // DUAL DERIVATION: Node's sha256 of the CANONICAL uuid rendering, compared against what
    // Postgres actually stored. The uppercase row is the one that separates "hashed the canonical
    // uuid" from "hashed the operator's spelling" — they are different strings, so only one of
    // the two possible implementations can match here.
    assert.equal(
      row.hash, sha256hex(canonical(a.spelling)),
      `${a.note}: token_hash must be sha256 of the CANONICAL uuid::text rendering of the seeded plaintext`,
    );
    if (a.spelling !== canonical(a.spelling)) {
      assert.notEqual(
        row.hash, sha256hex(a.spelling),
        `${a.note}: and it must NOT be sha256 of the operator's raw uppercase spelling — this is the pin behind onboard-rpr.mjs' $1::uuid::text fix`,
      );
    }
    assert.equal(row.has_id, true, `${a.note}: every row must carry the surrogate id`);
    if (a.consumed) {
      assert.equal(row.consumed_op_key, "hrd-b-drill-consumed-key", `${a.note}: the consumed receipt columns must survive untouched`);
      assert.equal(row.receipt_firm, FIRM, `${a.note}: the consumed_result receipt must survive untouched`);
    } else {
      assert.equal(row.consumed_op_key, null, `${a.note}: an unconsumed row must stay unconsumed`);
    }
  }

  const receipts = await rootQuery(
    "select op_key, fn, result from clara.op_receipts order by op_key",
  );
  for (const r of RECEIPTS) {
    const row = receipts.rows.find((x) => x.op_key === r.opKey);
    assert.ok(row, `legacy receipt ${r.opKey} must survive the scrub`);
    assert.equal(row.result.token, undefined, `${r.opKey}: the plaintext token must be GONE from op_receipts.result`);
    assert.equal(row.result.token_hash, sha256hex(r.token), `${r.opKey}: token_hash must be sha256 of the plaintext that was there`);
    assert.equal(row.result.invite_id, FIRM, `${r.opKey}: every other receipt key must survive the rewrite`);
    assert.equal(row.result.expires_at, "2099-01-01T00:00:00Z", `${r.opKey}: every other receipt key must survive the rewrite`);
  }
  const foreign = receipts.rows.find((x) => x.op_key === FOREIGN_RECEIPT.opKey);
  assert.ok(foreign, "the non-invite receipt must survive");
  assert.equal(
    foreign.result.token, FOREIGN_RECEIPT.token,
    "§B2 is scoped to fn='invite_member' — a DIFFERENT verb's receipt carrying its own `token` key must be left exactly as it was",
  );
}

/** THE ROUND-TRIP — the acceptance criterion the storage assertions cannot supply. A backfill can
 *  write a NOT NULL, unique, perfectly-shaped hash of the WRONG string and every structural check
 *  in the migration's own tail still passes; the token is then permanently unfindable and the
 *  damage is silent and irreversible. So: PRESENT a pre-existing admission token to the real
 *  `create_firm` door and require it to be consumed. Deliberately the UPPERCASE-minted one, since
 *  that is the row where "hashed the canonical rendering" and "hashed the operator's spelling"
 *  disagree. Returns the created firm id. */
async function assertPreExistingTokenStillWorks() {
  const upper = ADMISSIONS.find((a) => a.spelling !== canonical(a.spelling));
  assert.ok(upper, "the fixture must contain a non-canonically-spelled token for this proof");
  const r = await humanQuery(
    ACTOR,
    "select clara.create_firm($1, $2::uuid, $3) as receipt",
    ["HRD-B Drill Firm", upper.spelling, "hrd-b-drill-roundtrip"],
  );
  const receipt = r.rows[0].receipt;
  assert.ok(receipt?.firm_id, "create_firm must ACCEPT a token minted before the migration — if this fails, the backfill hashed something the reader cannot reproduce and every pre-existing token is now dead");
  const consumed = await rootQuery(
    "select consumed_at, consumed_op_key from clara.firm_admissions where note = $1", [upper.note],
  );
  assert.ok(consumed.rows[0].consumed_at != null, "the presented token must be stamped consumed");
  assert.equal(consumed.rows[0].consumed_op_key, "hrd-b-drill-roundtrip", "and stamped with the op_key that consumed it");
  return receipt.firm_id;
}

/** The two renderings must be the SAME digest in the SAME shape: what §B2 wrote into a SCRUBBED
 *  legacy receipt, and what the recut body writes into a FRESHLY MINTED one. Measured by minting
 *  a real invite through the real door on this rig, not by reading the migration text. */
async function assertScrubbedShapeMatchesFreshMint() {
  const fresh = await humanQuery(
    ACTOR,
    "select clara.invite_member($1, $2, $3) as receipt",
    ["hrd-b-drill-invitee@rig.test", "viewer", "hrd-b-drill-invite"],
  );
  const minted = fresh.rows[0].receipt;
  assert.equal(typeof minted.token, "string", "a fresh mint still returns the plaintext to its caller, exactly once");
  const persisted = await rootQuery(
    "select result from clara.op_receipts where fn = 'invite_member' and op_key = $1", ["hrd-b-drill-invite"],
  );
  const freshHash = persisted.rows[0].result.token_hash;
  const scrubbed = await rootQuery(
    "select result from clara.op_receipts where fn = 'invite_member' and op_key = $1", [RECEIPTS[0].opKey],
  );
  const legacyHash = scrubbed.rows[0].result.token_hash;
  assert.equal(persisted.rows[0].result.token, undefined, "a fresh mint persists no plaintext");
  assert.equal(freshHash, sha256hex(minted.token), "the freshly-minted receipt's token_hash is hex sha256 of the token that was returned");
  for (const [label, h] of [["fresh", freshHash], ["scrubbed legacy", legacyHash]]) {
    assert.equal(typeof h, "string", `${label} token_hash must be a jsonb STRING`);
    assert.match(h, /^[0-9a-f]{64}$/, `${label} token_hash must be 64 lowercase hex characters — the receipt rendering, not the bytea the firm_invites COLUMN stores`);
  }
}

/** LOW-5's behavioural half: the unique index must actually REFUSE a duplicate digest, or a
 *  single-use bearer credential quietly becomes multi-use. Asserted through the owner role, which
 *  is the only role that can write this table at all. */
async function assertDuplicateHashRefused() {
  const h = "hrd-b-drill-duplicate-probe";
  await rootQuery(
    "insert into clara.firm_admissions (token_hash, note) values (sha256(convert_to($1,'UTF8')), $2)",
    [h, "hrd-b drill · duplicate probe 1"],
  );
  await assert.rejects(
    () => rootQuery(
      "insert into clara.firm_admissions (token_hash, note) values (sha256(convert_to($1,'UTF8')), $2)",
      [h, "hrd-b drill · duplicate probe 2"],
    ),
    (err) => {
      assert.equal(err.code, "23505", `a second row with the same token_hash must be refused by the unique index, got ${err.code}: ${err.message}`);
      return true;
    },
    "without a UNIQUE index a single-use admission credential can be minted twice and consumed twice",
  );
  await rootQuery("delete from clara.firm_admissions where note like 'hrd-b drill · duplicate probe%'");
}

test("hrd-b upgrade drill: a POPULATED pre-B database converts correctly, a PRE-EXISTING token still opens a firm, the scrubbed receipt matches a fresh mint byte-shape, and duplicate digests are refused", async (t) => {
  if (skipUnlessReset(t)) return;
  const { migrate, dir, nextVersion } = await freshBaseline();
  await seedPreState();
  placeMigration(dir, nextVersion, realText(), "hrd_b_real");
  await migrate({ dir, log: () => {} });
  await assertConvertedCorrectly();
  await assertDuplicateHashRefused();
  await assertPreExistingTokenStillWorks();
  await assertScrubbedShapeMatchesFreshMint();
});

test("hrd-b upgrade drill MUTANT E (backfill hashes upper(token::text)): the migration applies CLEAN, its own tail says OK — and every pre-existing admission token is silently, permanently dead. Only the round-trip sees it", async (t) => {
  if (skipUnlessReset(t)) return;
  const { migrate, dir, nextVersion } = await freshBaseline();
  await seedPreState();
  const mutant = sub(realText(), BACKFILL_LINE,
    "update clara.firm_admissions set token_hash = sha256(convert_to(upper(token::text), 'UTF8')) where token_hash is null;");
  placeMigration(dir, nextVersion, mutant, "hrd_b_mutant_upper_backfill");

  // NOT rejected: NOT NULL holds, the unique index holds, the row count is preserved, the
  // plaintext column is gone. Every structural claim the migration makes about itself is TRUE.
  await migrate({ dir, log: () => {} });
  const applied = await rootQuery(
    "select 1 from clara.schema_migrations where version = $1", [`${nextVersion}_hrd_b_mutant_upper_backfill`],
  );
  assert.equal(applied.rowCount, 1, "the wrong-rendering backfill commits silently — no error, no operator-visible warning");

  // Either shape counts as the round-trip catching it: the door REFUSES the token outright
  // (CLR04 'invalid or consumed admission token' — what actually happens, since the stored digest
  // no longer matches what create_firm computes), or it returns no receipt and this drill's own
  // assertion fires. Both are the same finding; pinning only one would be pinning the accident.
  await assert.rejects(
    async () => { await assertPreExistingTokenStillWorks(); },
    /invalid or consumed admission token|create_firm must ACCEPT a token minted before the migration/,
    "the ROUND-TRIP is the instrument that catches a hash the reader cannot reproduce",
  );
});

test("hrd-b upgrade drill MUTANT A (hash the WRONG COLUMN): backfilling token_hash from `note` instead of the token migrates GREEN — only this drill's per-row dual-derivation catches it", async (t) => {
  if (skipUnlessReset(t)) return;
  const { migrate, dir, nextVersion } = await freshBaseline();
  await seedPreState();
  const mutant = sub(realText(), BACKFILL_LINE,
    "update clara.firm_admissions set token_hash = sha256(convert_to(note::text, 'UTF8')) where token_hash is null;");
  placeMigration(dir, nextVersion, mutant, "hrd_b_mutant_wrong_column");

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
  const { migrate, dir, nextVersion } = await freshBaseline();
  await seedPreState();
  const mutant = sub(realText(), BACKFILL_LINE,
    "update clara.firm_admissions set token_hash = sha256(convert_to(token::text, 'UTF8')) where token_hash is null and consumed_at is null;");
  placeMigration(dir, nextVersion, mutant, "hrd_b_mutant_skip_consumed");

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
  const { migrate, dir, nextVersion } = await freshBaseline();
  // deliberately NO seedPreState() — this is CI's deploy-onto-existing shape
  const mutant = sub(realText(), BACKFILL_LINE,
    "update clara.firm_admissions set token_hash = sha256(convert_to(token::text, 'UTF8')) where token_hash is null and consumed_at is null;");
  placeMigration(dir, nextVersion, mutant, "hrd_b_mutant_skip_consumed_empty");
  await migrate({ dir, log: () => {} });   // a throw here would fail the test — that is the point
  const applied = await rootQuery(
    "select 1 from clara.schema_migrations where version = $1",
    [`${nextVersion}_hrd_b_mutant_skip_consumed_empty`],
  );
  assert.equal(applied.rowCount, 1, "the broken backfill applies silently over an empty table — this is why the populated drill above has to exist");
});

test("hrd-b upgrade drill MUTANT C (drop the legacy receipt scrub): the migration's own §K(3b) zero-assertion REFUSES it, on a populated database only", async (t) => {
  if (skipUnlessReset(t)) return;
  const { migrate, dir, nextVersion } = await freshBaseline();
  await seedPreState();
  const mutant = sub(realText(), SCRUB_UPDATE,
    "  -- [MUTANT: hrd-b-upgrade-drill.test.mjs removed §B2's scrub UPDATE on purpose, so the\n"
    + "  --  guard downstream is what has to catch the surviving plaintext.]\n"
    + "  perform 1;");
  placeMigration(dir, nextVersion, mutant, "hrd_b_mutant_no_scrub");

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
  const { migrate, dir, nextVersion } = await freshBaseline();
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
  placeMigration(dir, nextVersion, mutant, "hrd_b_mutant_no_scrub_no_guard");

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
    "and this drill's own receipt assertion is the instrument that sees it",
  );
});

test("hrd-b upgrade drill MUTANT D (a same-named NON-unique index): the tail's pg_index property census REFUSES it, where a name-only census would have passed", async (t) => {
  if (skipUnlessReset(t)) return;
  const { migrate, dir, nextVersion } = await freshBaseline();
  await seedPreState();
  const mutant = sub(realText(),
    "create unique index uq_firm_admissions_token_hash on clara.firm_admissions (token_hash);",
    "create index uq_firm_admissions_token_hash on clara.firm_admissions (token_hash);");
  placeMigration(dir, nextVersion, mutant, "hrd_b_mutant_nonunique_index");

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
