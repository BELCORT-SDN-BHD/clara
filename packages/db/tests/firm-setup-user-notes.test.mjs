// #934 — FIRM SETUP (1/2): replace the twelve engineer notes with one accountant-readable sentence
// each; `user_note` and `retire` columns on the catalogue. Migration: 0258_firm_setup_user_notes.sql.
// Frontier-gated on its own STABLE STEM (`firm_setup_user_notes$`), never its number — numbers are
// claimed at merge (packages/db/README.md) — the `firm_setup_applicability$` idiom verbatim.
//
// CONTRACT-BLIND against the migration's own tail: its `raise notice … OK` describes one apply,
// this file describes the live catalog (packages/db/README.md, "Migration and deployment
// behavior").
//
// WHAT IS UNDER TEST, one cell per acceptance criterion in the ticket's Agent Brief:
//   AC1a — `p934.notes.accountant_text` — every one of the twelve catalogue items reads the
//     owner-approved accountant sentence through `get_firm_setup()`, never the engineer's
//     provenance note (file names, line numbers) that rendered there before this migration.
//   AC1b — `p934.notes.fallback` — `get_firm_setup` PREFERS `user_note` over `note`: a catalogue
//     row carrying no user-facing note at all still renders something (its engineer note), rather
//     than a blank. Proven on a synthetic row, because none of the twelve shipped rows lacks one.
//   AC1c — `p934.notes.omits_retired` — a retired catalogue row is invisible to `get_firm_setup`
//     everywhere it could appear: `items[]`, `catalogue_total`, `required_outstanding` and both
//     sides of `counter`, even where the row is `required_for_commit`. Proven on a synthetic row,
//     because this migration retires none of the twelve.
//
// WHY SYNTHETIC ROWS RATHER THAN ONE OF THE TWELVE. `clara.firm_setup_keys` is append-only by
// trigger (0218 §A) and every one of the shipped twelve already carries a live `user_note` and a
// null `retired_at` — there is no door and no lawful DML that puts one of THEM into either state
// this file must prove. A synthetic row is planted by plain `insert` (append-only forbids UPDATE
// and DELETE, never INSERT — 0003:431-435) and removed by the SAME `withTriggerOff` idiom
// `packages/db/tests/fa-authority-sign-compat.mjs` already uses for exactly this shape of fixture
// (packages/db/tests/README.md, "A fixture that turns a trigger off does it in ONE transaction").
//
// ROLE DISCIPLINE: every door call runs through `humanQuery` as a named admin persona. The world is
// planted through the ROOT connection exactly as `clara._create_firm_core` plants a firm plan
// (0145:492-494) — the `firm-setup-applicability.test.mjs` precedent, copied verbatim.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { endPool, humanQuery, rootQuery, withActor } from "./rig-fixtures.mjs";

const STEM = "firm_setup_user_notes$";

let ready = false;
let executed = 0;
const EXPECTED_CELLS = 3;

/** True iff a migration whose version matches the stem is recorded applied. Catalog-probed
 *  against `clara.schema_migrations`, never inferred from a file listing (the
 *  `firm-setup-applicability.test.mjs` idiom, verbatim). */
async function laneReady() {
  const r = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ $1", [STEM]);
  return r.rows[0].n > 0;
}

before(async () => { ready = await laneReady(); });
after(async () => {
  if (ready) assert.equal(executed, EXPECTED_CELLS, `expected ${EXPECTED_CELLS} cells to run, ${executed} did`);
  await endPool();
});

/** A FOCUSED run (just this file, no gate preload) FAILS LOUDLY when the migration is missing.
 *  Only the package run, which preloads `firm-setup-user-notes-preintegration-gate.mjs`, turns the
 *  absence into a loud skip. */
function gate(t) {
  if (ready) return false;
  if (process.env.CLARA_ALLOW_MISSING_FIRM_SETUP_USER_NOTES === "1") {
    console.warn(`SKIP firm-setup-user-notes: no ${STEM} migration applied (explicit pre-integration run).`);
    t.skip("firm-setup-user-notes lane absent -- explicit pre-integration run");
    return true;
  }
  assert.fail(
    "the #934 firm-setup-user-notes lane is required for a focused run: apply 0258_firm_setup_user_notes.sql");
}

function cell(name, fn) {
  test(name, async (t) => {
    if (gate(t)) return;
    executed += 1;
    await fn(t);
  });
}

// ---------------------------------------------------------------------------------------------
// THE WORLD. Minted through the root connection, `firm-setup-applicability.test.mjs`'s own
// precedent: the subject is one read door, and going through create_firm/claim_paid_firm would
// only add ways to fail for reasons that are not the subject.
// ---------------------------------------------------------------------------------------------
async function firmSetupWorld(tag) {
  const suffix = `${tag}_${randomUUID().slice(0, 8)}`;
  const firm = (await rootQuery("insert into clara.firms(name) values ($1) returning id", [`fsun_${suffix}`]))
    .rows[0].id;
  const admin = randomUUID();
  await rootQuery(
    "insert into clara.users(id, display_name, email, is_agent) values ($1,$2,$3,false)",
    [admin, `fsun admin ${suffix}`, `fsun_admin_${suffix}@rig.test`]);
  await rootQuery(
    "insert into clara.firm_memberships(firm_id, user_id, role, status) values ($1,$2,'admin','active')",
    [firm, admin]);
  /** The firm-scope plan exactly as `clara._create_firm_core` opens one (0145:492-494). */
  const plan = (await rootQuery(
    `insert into clara.onboarding_plans(firm_id, scope_kind, review_maker, reviewed_at, contributors)
     values ($1,'firm',$2, now(), array[$2]::uuid[]) returning id`,
    [firm, admin])).rows[0].id;
  await rootQuery(
    `insert into clara.onboarding_plan_revisions(plan_id, revision_n, snapshot)
     values ($1, 1, clara._onboarding_plan_snapshot($1))`,
    [plan]);
  return { firm, admin, plan };
}

const readSetup = (sub) =>
  humanQuery(sub, "select clara.get_firm_setup() as r", []).then((r) => r.rows[0].r);

const itemOf = (env, key) => env.items.find((i) => i.item_key === key);

/** `packages/db/tests/fa-authority-sign-compat.mjs`'s `withTriggerOff`, copied verbatim: ONE
 *  transaction takes the ACCESS EXCLUSIVE lock for the whole disable/act/enable window, so a
 *  concurrent session blocks rather than writing past a briefly-disabled append-only guard, and a
 *  killed process rolls the disable back with it (packages/db/tests/README.md). */
async function withTriggerOff(table, trigger, fn) {
  return withActor({ transaction: true }, async (c) => {
    await c.query(`alter table ${table} disable trigger ${trigger}`);
    try {
      return await fn(c);
    } finally {
      await c.query(`alter table ${table} enable trigger ${trigger}`);
    }
  });
}

// =============================================================================================
// AC1a — every catalogue item reads the owner-approved accountant sentence.
// =============================================================================================

/** The twelve, EXACTLY as the owner approved them (ticket #934, ruling comment 2026-09-20) — an
 *  INDEPENDENT source of truth transcribed from the ticket, never re-derived from the migration's
 *  own seed literals. The Chinese gloss beside each in the ticket is for review only and is not
 *  part of the stored value (ticket: "English is the catalogue's language"). */
const ACCOUNTANT_NOTES = {
  legal_name: "Enter the name exactly as on the SSM certificate. It appears on every report and letter Clara produces for the firm.",
  ssm: "The registration number as printed by SSM. Clara does not validate the format here.",
  entity_type: "Sdn Bhd, LLP, partnership or sole proprietorship. Some later questions only apply to a Sdn Bhd.",
  address: "The registered address as filed with SSM, not the office you work from.",
  mia: "Optional. The firm's MIA registration number, if it has one; skip with a reason if none.",
  turnover: "The firm's own annual turnover band. It decides whether the TIN question below is required.",
  // #1032 (riders wave 4, lane 06): recut by 0311_firm_setup_tin_required.sql's own backfill --
  // "skip with a reason" is no longer true (tin is answerable, never inapplicable, once #1032
  // lands), so the sentence changed with the behaviour it describes.
  tin: "The firm's MyInvois TIN. Required once the firm's turnover makes MyInvois mandatory (RM1 million or more); optional below that, and you may still record it if the firm has registered for MyInvois voluntarily.",
  fye: "The month the firm's own financial year ends, 1 to 12. Clients keep their own year-end on their client record.",
  mpers_eligibility: "Applies to a Sdn Bhd only: whether the CA 2016 s.244 private-entity test lets the firm apply MPERS. Skip with a reason if the firm is not a Sdn Bhd.",
  framework: "MPERS or MFRS. This becomes the firm-wide default framework; a client can keep its own exception in Knowledge.",
  accounting_basis: "Accrual, cash receipts-and-payments, modified cash or other. This becomes the firm-wide default basis; a client can keep its own exception.",
  currency: "The currency the firm keeps its own books in, as a three-letter code. Client books carry their own currency.",
};

cell("p934.notes.accountant_text every one of the twelve catalogue items renders the owner-approved accountant sentence, never the engineer note", async () => {
  const w = await firmSetupWorld("t1");
  const env = await readSetup(w.admin);
  // #935 landed three education tips beside the twelve accountant-note rows this cell is about;
  // this cell's own subject is unaffected, so it only re-measures fifteen rather than pinning a
  // second, unrelated invariant here.
  assert.equal(env.items.length, 15, "the twelve accountant-note rows plus #935's three tips, none retired");
  for (const [key, note] of Object.entries(ACCOUNTANT_NOTES)) {
    const item = itemOf(env, key);
    assert.ok(item, `catalogue item ${key} is missing from get_firm_setup`);
    assert.equal(item.note, note, `${key} must render the accountant sentence, not the engineer note`);
  }
});

// =============================================================================================
// AC1b — `get_firm_setup` PREFERS `user_note` over `note`: a row with none falls back.
// =============================================================================================

cell("p934.notes.fallback a catalogue row with no user-facing note falls back to its engineer note", async () => {
  const w = await firmSetupWorld("t2");
  const key = `zz_test_fallback_${randomUUID().slice(0, 8)}`;
  await rootQuery(
    `insert into clara.firm_setup_keys
       (item_key, knowledge_key, item_kind, required_for_commit, min_role, group_key,
        answer_shape, answer_options, answer_field, question, note, sort_order)
     values ($1, null, 'capture', false, 'admin', 'identity', 'text', '[]'::jsonb, null,
             'test-only synthetic question -- p934.notes.fallback', 'test-only engineer note -- p934.notes.fallback', 9999)`,
    [key]);
  try {
    const env = await readSetup(w.admin);
    const item = itemOf(env, key);
    assert.ok(item, "the synthetic row must still be a live, unretired catalogue item");
    assert.equal(item.note, "test-only engineer note -- p934.notes.fallback",
      "with no user_note, get_firm_setup must fall back to the catalogue's own engineer note rather than a blank");
  } finally {
    await withTriggerOff("clara.firm_setup_keys", "t_firm_setup_keys_append_only", async (c) => {
      await c.query("delete from clara.firm_setup_keys where item_key = $1", [key]);
    });
  }
});

// =============================================================================================
// AC1c — a retired catalogue row is invisible to `get_firm_setup` on every surface it touches.
// =============================================================================================

cell("p934.notes.omits_retired a retired catalogue row is excluded from items, catalogue_total, required_outstanding and both sides of counter", async () => {
  const w = await firmSetupWorld("t3");
  const key = `zz_test_retired_${randomUUID().slice(0, 8)}`;
  const before = await readSetup(w.admin);
  const baselineRequiredTotal = before.counter.required_total;
  const baselineCatalogueTotal = before.catalogue_total;

  // Required AND retired, deliberately: the harder of the two cases -- a row that WOULD inflate
  // both `required_outstanding` and `counter` if the retirement filter were missing anywhere.
  await rootQuery(
    `insert into clara.firm_setup_keys
       (item_key, knowledge_key, item_kind, required_for_commit, min_role, group_key,
        answer_shape, answer_options, answer_field, question, note, user_note, retired_at, sort_order)
     values ($1, null, 'must_ask', true, 'admin', 'identity', 'text', '[]'::jsonb, null,
             'test-only synthetic required question -- p934.notes.omits_retired',
             'test-only engineer note -- p934.notes.omits_retired',
             'test-only user note -- p934.notes.omits_retired', now(), 9998)`,
    [key]);
  try {
    const env = await readSetup(w.admin);
    assert.equal(itemOf(env, key), undefined, "a retired row must never appear in items[]");
    assert.equal(env.catalogue_total, baselineCatalogueTotal, "catalogue_total must exclude a retired row");
    assert.ok(!env.required_outstanding.includes(key),
      "a retired row must never appear as outstanding, even though it is required_for_commit");
    assert.equal(env.counter.required_total, baselineRequiredTotal,
      "a retired, required row must not inflate the required denominator");
  } finally {
    await withTriggerOff("clara.firm_setup_keys", "t_firm_setup_keys_append_only", async (c) => {
      await c.query("delete from clara.firm_setup_keys where item_key = $1", [key]);
    });
  }
});
