// MODULE, not a test file (only `*.test.mjs` is collected) -- the fixtures, the baseline export,
// the drift-guarded block copies and the assertion helpers behind
// `hrd-b-upgrade-drill.test.mjs`. Split out of that file when it crossed the 500-line ceiling,
// following this directory's own convention: helpers and fixtures are modules the test files
// import, and say so in their own header.
//
// Everything here exists to make Migration B's TWO DATA CONVERSIONS -- §A's
// clara.firm_admissions.token -> token_hash backfill, and §B2's scrub of legacy plaintext
// clara.op_receipts invite receipts -- non-vacuous. See the drill's header for the finding.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, copyFileSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { rootQuery, humanQuery } from "./rig-helpers.mjs";

const RESET_OK = process.env.CLARA_RIG_ALLOW_RESET === "1";
const MIG_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

/** B's own file and the number it claimed at merge, derived from ONE constant so a future
 *  renumber is a one-line change here and nowhere else. */
export const REAL_BASENAME = "0147_db_hardening_b_hash_only_bearer_tokens.sql";
const REAL_FILE = join(MIG_DIR, REAL_BASENAME);
const REAL_VERSION = /^(\d{4})_/.exec(REAL_BASENAME)[1];

/** sha256 hex, computed in NODE -- deliberately a DIFFERENT implementation from the Postgres
 *  `sha256(convert_to(x,'UTF8'))` the migration uses, so agreement is a dual derivation rather
 *  than the same expression compared with itself. */
export const sha256hex = (s) => createHash("sha256").update(s, "utf8").digest("hex");

export function skipUnlessReset(t) {
  if (!RESET_OK) {
    t.skip("destructive (drops schema clara); set CLARA_RIG_ALLOW_RESET=1 on an ISOLATED DB to run ALONE");
    return true;
  }
  return false;
}

/** Every numbered migration on disk BELOW B's number -- the frontier B lands on. B itself is
 *  excluded EXPLICITLY (leaving it in would apply the real B during the baseline replay, before
 *  this drill ever seeds its populated pre-B state, and every cell below would then be measuring
 *  an already-migrated database), and so is EVERY SUCCESSOR: once the estate moved past B
 *  (2026-08-30, `0148`..`0153`), "everything except B" silently replayed the successors FIRST,
 *  the frontier became 0153, and placing B's copy at 0147 was refused by the runner as a
 *  late-inserted lower number -- the whole drill went red on the sweep (run 33283730630, 8/8).
 *  The successors are copied back in by placeMigration(), AFTER B or its mutant, so each cell
 *  still applies the WHOLE on-disk chain onto the populated book (.claude/rules/db-tests.md) in
 *  the order live saw it: pre-B -> B -> successors. migrate() re-verifies EVERY applied
 *  version's checksum against what is in `dir` on every subsequent call, so nothing may be
 *  omitted once applied. */
export function exportBaseline() {
  const tmp = mkdtempSync(join(tmpdir(), "clara-hrdb-baseline-"));
  let max = 0;
  let excluded = false;
  const successors = [];
  for (const f of readdirSync(MIG_DIR)) {
    const m = /^(\d{4})_.*\.sql$/.exec(f);
    if (!m) continue;
    if (f === REAL_BASENAME) { excluded = true; continue; }
    assert.notEqual(
      m[1], REAL_VERSION,
      `another migration already occupies ${REAL_VERSION} (${f}) -- B's claimed number collides and this drill would write over it`,
    );
    if (Number(m[1]) > Number(REAL_VERSION)) { successors.push(f); continue; }
    copyFileSync(join(MIG_DIR, f), join(tmp, f));
    max = Math.max(max, Number(m[1]));
  }
  assert.ok(max > 0, "no numbered migrations found — the baseline export is looking in the wrong place");
  assert.equal(max, Number(REAL_VERSION) - 1, `the pre-B baseline must end exactly one below B (${REAL_VERSION}); it ends at ${max}`);
  assert.ok(excluded, `${REAL_BASENAME} was not found in ${MIG_DIR} — this drill drives THAT file, so its absence is a broken drill, not a passing one`);
  LAST_SUCCESSORS = successors;
  return { dir: tmp, version: REAL_VERSION, successors };
}

/** The successor list of the most recent exportBaseline() -- read by placeMigration(). */
let LAST_SUCCESSORS = [];

/** The files ABOVE B on disk, copied into `dir` so the chain B-or-mutant -> successors applies
 *  in one migrate() call. Idempotent (a second call re-copies the same bytes). */
export function placeSuccessors(dir, successors) {
  for (const f of successors) copyFileSync(join(MIG_DIR, f), join(dir, f));
  return successors.length;
}

export async function freshBaseline() {
  const { reset } = await import("../scripts/reset.mjs");
  const { migrate } = await import("../scripts/migrate.mjs");
  const { sweepChainMintedRoles } = await import("./rig-cluster-reset.mjs");
  // Cluster-wide role survival: this file calls freshBaseline() once per test cell (8
  // cells, one process), and each successful replay reaches the real frontier via the
  // successors copied in by placeMigration() — roles are cluster-wide, so a role a
  // PRIOR cell's replay minted survives into the NEXT cell's reset() (review-518-r2
  // F1; see tests/rig-cluster-reset.mjs's header). Requires CLARA_RIG_ALLOW_ROLE_SWEEP=1
  // (set by the action on this step).
  await reset({ log: () => {} });
  await sweepChainMintedRoles({ log: () => {} });
  const { dir, version } = exportBaseline();
  await migrate({ dir, log: () => {} });
  return { migrate, dir, version };
}

// ---------------------------------------------------------------------------------------------
// THE POPULATED PRE-B STATE, written as the migration runner would find it on a real live
// database: plaintext admission tokens (one already consumed, carrying its receipt columns), an
// uppercase-spelled uuid, a non-ASCII note, and legacy invite_member op_receipts rows whose
// `result` still holds the plaintext token the pre-hardening body persisted.
// ---------------------------------------------------------------------------------------------
export const FIRM = "00000000-0000-4000-8000-0000000000f1";
/** The actor who PRESENTS a pre-existing admission token to create_firm after the backfill. */
export const ACTOR = "00000000-0000-4000-8000-0000000000a1";

/** `spelling` is what the OPERATOR typed; `canonical()` is uuid's own ::text rendering. They
 *  DIFFER for the uppercase row, which is the point: the migration hashes the canonical form. */
export const ADMISSIONS = [
  { note: "hrd-b drill · plain unconsumed", spelling: "11111111-1111-4111-8111-111111111111", consumed: false },
  { note: "hrd-b drill · CONSUMED with receipt", spelling: "22222222-2222-4222-8222-222222222222", consumed: true },
  { note: "hrd-b drill · UPPERCASE operator spelling (canonicalisation pin)", spelling: "AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE", consumed: false },
  { note: "hrd-b drill · 非 ASCII note · Ωμέγα · 🔐", spelling: "33333333-3333-4333-8333-333333333333", consumed: false },
];
export const canonical = (spelling) => spelling.toLowerCase();

/** The pre-hardening body persisted `{invite_id, token, expires_at}` verbatim; one row carries a
 *  64-hex token exactly as it minted them, one a long multibyte string so the
 *  convert_to(...,'UTF8') spelling is proven byte-correct rather than merely ASCII-correct. */
export const RECEIPTS = [
  { opKey: "hrd-b-drill-legacy-1", token: "a".repeat(32) + "b".repeat(32) },
  { opKey: "hrd-b-drill-legacy-2", token: "Ωμέγα-" + "🔐".repeat(40) + "-tail" },
];
/** A NON-invite receipt that also carries a `token` key — §B2 is scoped to fn='invite_member',
 *  and this row proves that scoping is real rather than incidental. */
export const FOREIGN_RECEIPT = { fn: "mint_wake_credential", opKey: "hrd-b-drill-foreign", token: "not-an-invite-token" };

export async function seedPreState() {
  await rootQuery(
    "insert into clara.users (id, display_name, email, is_agent) values ($1::uuid, $2, $3, false)",
    [ACTOR, "hrd-b drill owner", "hrd-b-drill-owner@rig.test"],
  );
  for (const a of ADMISSIONS) {
    await rootQuery("insert into clara.firm_admissions (token, note) values ($1::uuid, $2)", [a.spelling, a.note]);
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
  for (const r of [...RECEIPTS.map((x) => ({ ...x, fn: "invite_member" })), FOREIGN_RECEIPT]) {
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

/** Apply a (possibly mutated) copy of B's real text at B's OWN claimed number -- and place the
 *  successors beside it, so the next migrate() applies B-or-mutant and then everything the
 *  estate shipped after B, exactly as live saw it (see exportBaseline).
 *
 *  THE FILE IS WRITTEN UNDER B'S REAL BASENAME, whatever `stem` says. The successors carry
 *  STEM WITNESSES on B (`0154_binding_proposal_pr_1` refuses "frontier mismatch" unless
 *  `0147_db_hardening_b_hash_only_bearer_tokens` is in `clara.schema_migrations` -- the
 *  succession pattern of .claude/rules/db-tests.md, which is correct and immutable once applied),
 *  so a copy applied under `0147_hrd_b_mutant_x` is invisible to them and every cell that reaches
 *  the successors reds at 0154 (sweep run 33288656180: 3 pass / 5 fail -- exactly the cells where B
 *  or its mutant APPLIED). The mutant identity lives in `stem`, recorded here for the cells' own
 *  `schema_migrations` reads (`placedVersion()`), never in the version string the estate reads. */
export function placeMigration(dir, version, text, stem) {
  LAST_STEM = stem;
  writeFileSync(join(dir, REAL_BASENAME), text ?? readFileSync(REAL_FILE, "utf8"));
  placeSuccessors(dir, LAST_SUCCESSORS);
}

/** The version string the placed B-or-mutant records in clara.schema_migrations -- always B's own
 *  real version (see placeMigration); `placedStem()` says WHICH copy the cell placed. */
export function placedVersion() {
  return REAL_BASENAME.replace(/\.sql$/, "");
}
export function placedStem() {
  return LAST_STEM;
}
let LAST_STEM = null;

// ---------------------------------------------------------------------------------------------
// THE EXACT BLOCKS THIS DRILL MUTATES. Copy-pasted from the real file and asserted present on
// every run, so a drift in the migration silently turning a mutant into a no-op is caught HERE
// (a mutant that does not mutate is a false green — the lesson this whole drill exists for).
// ---------------------------------------------------------------------------------------------
export const BACKFILL_LINE =
  "update clara.firm_admissions set token_hash = sha256(convert_to(token::text, 'UTF8')) where token_hash is null;";

export const SCRUB_UPDATE = `  update clara.op_receipts
     set result = (result - 'token')
                  || jsonb_build_object('token_hash',
                       encode(sha256(convert_to(result ->> 'token', 'UTF8')), 'hex'))
   where fn = 'invite_member' and jsonb_typeof(result) = 'object' and result ? 'token';`;

export const TAIL_ZERO_BLOCK = `  select count(*)::int into v_n
    from clara.op_receipts where fn = 'invite_member' and jsonb_typeof(result) = 'object' and result ? 'token';
  if v_n > 0 then
    raise exception 'hrd-b tail: % invite_member op_receipts row(s) STILL carry a plaintext \`token\` -- a replay of those op_keys would re-surface the credential 裁-16a removes from the body', v_n
      using errcode = 'CLR10';
  end if;`;

/** The token_hash FLOOR, kept as its OWN constant rather than tacked onto the block above: the
 *  two checks are adjacent in the migration but a comment between them is enough to break a
 *  single contiguous copy, and a drift guard that fires on a comment edit trains its reader to
 *  widen the match instead of re-copying it. */
export const TAIL_FLOOR_BLOCK = `  select count(*)::int into v_n
    from clara.op_receipts where fn = 'invite_member' and jsonb_typeof(result) = 'object' and result ? 'token_hash';
  if v_n < (select v::int from _hrd_b_pre where k = 'op_receipts.legacy_plaintext') then`;

/** MEASURED HAZARD, not theoretical (this drill's own first run): `String.prototype.replace`
 *  interprets `$$` in a REPLACEMENT STRING as an escaped single `$`, so a replacement carrying a
 *  dollar-quoted SQL block silently loses one `$` per pair and the migration lexer then rejects
 *  the mutant with "unterminated dollar quote" -- a mutant that never reached its subject, read
 *  as a red for the wrong reason. Every substitution passes a FUNCTION, which disables `$`
 *  interpretation entirely. */
export const sub = (text, from, to) => text.replace(from, () => to);

export function realText() {
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
// ASSERTIONS
// ---------------------------------------------------------------------------------------------

export async function assertConvertedCorrectly() {
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
    // DUAL DERIVATION: Node's sha256 of the CANONICAL uuid rendering vs what Postgres stored. The
    // uppercase row separates "hashed the canonical uuid" from "hashed the operator's spelling" —
    // different strings, so only one of the two possible implementations can match here.
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

  const receipts = await rootQuery("select op_key, fn, result from clara.op_receipts order by op_key");
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
 *  `create_firm` door and require it to be consumed. Deliberately the UPPERCASE-minted one. */
export async function assertPreExistingTokenStillWorks() {
  const upper = ADMISSIONS.find((a) => a.spelling !== canonical(a.spelling));
  assert.ok(upper, "the fixture must contain a non-canonically-spelled token for this proof");
  const r = await humanQuery(
    ACTOR, "select clara.create_firm($1, $2::uuid, $3) as receipt",
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
export async function assertScrubbedShapeMatchesFreshMint() {
  const fresh = await humanQuery(
    ACTOR, "select clara.invite_member($1, $2, $3) as receipt",
    ["hrd-b-drill-invitee@rig.test", "viewer", "hrd-b-drill-invite"],
  );
  const minted = fresh.rows[0].receipt;
  assert.equal(typeof minted.token, "string", "a fresh mint still returns the plaintext to its caller, exactly once");
  const persisted = await rootQuery(
    "select result from clara.op_receipts where fn = 'invite_member' and op_key = $1", ["hrd-b-drill-invite"],
  );
  const scrubbed = await rootQuery(
    "select result from clara.op_receipts where fn = 'invite_member' and op_key = $1", [RECEIPTS[0].opKey],
  );
  const freshHash = persisted.rows[0].result.token_hash;
  const legacyHash = scrubbed.rows[0].result.token_hash;
  assert.equal(persisted.rows[0].result.token, undefined, "a fresh mint persists no plaintext");
  assert.equal(freshHash, sha256hex(minted.token), "the freshly-minted receipt's token_hash is hex sha256 of the token that was returned");
  for (const [label, h] of [["fresh", freshHash], ["scrubbed legacy", legacyHash]]) {
    assert.equal(typeof h, "string", `${label} token_hash must be a jsonb STRING`);
    assert.match(h, /^[0-9a-f]{64}$/, `${label} token_hash must be 64 lowercase hex characters — the receipt rendering, not the bytea the firm_invites COLUMN stores`);
  }
}

/** LOW-5's behavioural half: the unique index must actually REFUSE a duplicate digest, or a
 *  single-use bearer credential quietly becomes multi-use. */
export async function assertDuplicateHashRefused() {
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
