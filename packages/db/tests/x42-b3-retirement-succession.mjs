// F-A3 PR-3 RETIREMENT SUCCESSION (migration 0129, this train) — split out of
// x42-split-upgrade-kit.mjs to keep that file under the repo's 500-line cap.
//
// 0129 drops the whole eleven-verb bank-rules machine outright (packages/db/migrations/
// 0129_f_a3_pr3_retirement_parity_doors.sql lines 387-397, SS1) — `accept_bank_rule_suggestion`
// among them, the exact producer x42-split-upgrade-kit.mjs's assertB3Floor() used to pin. A
// closed-wave drill applies the WHOLE on-disk chain onto its populated book, so at any frontier
// at or past 0129 the pre-retirement producer-grant claim is no longer true BY DESIGN, not by
// drift — the floor must ask "did 0129 run at this frontier?" and assert the world that
// actually obtains, in EITHER direction, rather than assume the pre-retirement world forever.
//
// BRANCH KEY, TWO WITNESSES, post-arm if EITHER says retired (review finding F1). The catalog
// witness is exact-signature, never by bare name (law 3, "spelling is not identity" — a bare
// `proname` match cannot tell two overloads apart, exactly the failure mode
// match_bank_line/settle_from_bank_line's rule-arity vs human-arity overloads would hit), probed
// via `to_regprocedure` (resolves to exactly one oid or NULL for an exact signature string — the
// SAME instrument 0129's own prestate/tail do-blocks use on themselves): a body 0129 ITSELF
// CREATES (SS3's identifier-promotion confirm door, no prior body at ANY earlier frontier) and
// never one of the eleven DROPPED verbs — probing a DROPPED verb's absence to prove "0129 ran"
// would be circular (a verb can be absent because 0129 dropped it, or because the frontier never
// created it in the first place — the two are indistinguishable from the drop side alone).
//
// A LIVE catalog object is not forever, though: PROGRESS.md:186 already ledgers a forward
// consolidation in this exact neighbourhood (wake_propose_bank_identifier_promotion onto pi's
// _identifier_promotion_core), and a future PR could rename or fold the human confirm door the
// same way, silently blinding the catalog witness back to "looks pre-retirement". The migration-
// STEM probe is the durable second leg: `clara.schema_migrations` is APPLIED HISTORY, immutable
// once recorded (db-migrations.md's own law), so `^[0-9]{4}_f_a3_pr3_retirement_parity_doors$`
// having a row is a permanent fact regardless of what any later PR does to 0129's own bodies —
// the SAME two-site estate precedent (x42b2-r8-tails.test.mjs's `pr3Landed`,
// x42-producer.test.mjs's `producerRetired()`) and the kit's own V_B0..V_B2 pattern. THIS PROBE
// IS NOT CIRCULAR — unlike probing a dropped verb, a migration-stem match is not one of the two
// facts it is trying to distinguish; it is a THIRD, independent fact (the runner's own ledger)
// that settles the question the catalog witness alone could go blind on.

import assert from "node:assert/strict";
import { rootQuery, noteLane } from "./x41-fa-world.mjs";

export const RETIREMENT_WITNESS_SIG = "clara.confirm_bank_identifier_promotion(uuid,text)";
export const RETIREMENT_STEM_RE = "^[0-9]{4}_f_a3_pr3_retirement_parity_doors$";

/** The eleven bodies 0129 SS1 drops outright, at their exact pinned signatures (0129 lines
 *  387-397 — the same eleven that file's own prestate sha256-pins before dropping). */
export const RETIRED_BANK_RULE_SIGS = [
  "clara.propose_bank_rule(uuid,text,jsonb,jsonb,text)",
  "clara.sign_bank_rule(uuid,text)",
  "clara.retire_bank_rule(uuid,text,text)",
  "clara.accept_bank_rule_suggestion(uuid,uuid,uuid,text)",
  "clara._bank_rule_sightings(uuid,text,jsonb)",
  "clara._bank_rule_pattern_norm(jsonb)",
  "clara.list_bank_rule_candidates(uuid)",
  "clara.list_bank_rules(uuid)",
  "clara.list_bank_line_suggestions(uuid)",
  "clara.match_bank_line(uuid,jsonb,jsonb,jsonb,boolean,text,uuid)",
  "clara.settle_from_bank_line(uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,text,uuid)",
];

/** `match_bank_line` and `settle_from_bank_line` are OVERLOADED: 0129 drops only the rule-arity
 *  overload of each (above) — the human-arity (PR-1a-extracted) overload of each SURVIVES,
 *  confirmed by 0129's own tail (lines 1195-1200: "the /6 human arity of match_bank_line and the
 *  /12 human arity of settle_from_bank_line … are untouched — this file drops ONLY the rule
 *  arities"). Enumerated here at exact signature, not guessed — read off the same tail. */
export const SURVIVING_BANK_LINE_SIGS = [
  "clara.match_bank_line(uuid,jsonb,jsonb,jsonb,boolean,text)",
  "clara.settle_from_bank_line(uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,text)",
];

/** Exact-signature existence / grant probes — the overload-safe twins of the kit's own
 *  `fnExists`/`grantedTo`, which key on bare `proname` and so cannot distinguish
 *  match_bank_line's two live overloads from each other. `to_regprocedure` on a signature
 *  string is either exactly one oid or NULL; `has_function_privilege` on a NULL oid answers
 *  NULL (STRICT), never throws, so `sigGrantedTo` of an absent signature is honestly `false`,
 *  not an error. */
export const sigExists = async (sig) => (await rootQuery(
  "select to_regprocedure($1) is not null as e", [sig])).rows[0].e === true;
export const sigGrantedTo = async (sig, role) => (await rootQuery(
  "select has_function_privilege($2, to_regprocedure($1), 'EXECUTE') as g", [sig, role])).rows[0].g === true;

/** assertB3Floor()'s producer-claim branch, in either world. `deps` carries the kit's own
 *  `fnExists`/`grantedTo`/`appliedCount` and its `V_B2` migration-name regex — passed in rather
 *  than re-implemented here, so there is exactly one definition of each catalog probe. */
export async function assertB3ProducerSuccession({ fnExists, grantedTo, appliedCount, V_B2 }) {
  const stemApplied = (await appliedCount(RETIREMENT_STEM_RE)) > 0;
  const catalogWitness = await sigExists(RETIREMENT_WITNESS_SIG);
  if (stemApplied || catalogWitness) {
    // POST-RETIREMENT: the eleven bodies are GONE by DESIGN, checked at EXACT signature (law 3
    // — a bare-name probe can't tell match_bank_line's two overloads apart).
    for (const sig of RETIRED_BANK_RULE_SIGS) {
      assert.equal(await sigExists(sig), false,
        `[D-b3 floor, post-0129 retirement] ${sig} must be GONE — the F-A3 PR-3 retirement (0129) drops it`);
    }
    // Positive controls (review law 2, absence alone is not evidence): LIVE non-dropped bodies
    // must still resolve and keep their grants, proving the eleven absences above are measured,
    // not an always-"gone" probe. resolve_and_book_bank_line is not in 0129's drop list; the
    // human-arity overload of match_bank_line/settle_from_bank_line SURVIVES (only the rule-arity
    // overload of each dies, per 0129's own tail) — checked by exact signature, F3, so a survivor
    // sharing a name with a dead rule-arity sibling can't borrow its grant by accident.
    assert.equal(await fnExists("resolve_and_book_bank_line"), true,
      "[D-b3 floor, post-0129 retirement] positive control: clara.resolve_and_book_bank_line (not in 0129's drop list) still exists");
    assert.equal(await grantedTo("resolve_and_book_bank_line", "clara_authenticated"), true,
      "[D-b3 floor, post-0129 retirement] …and keeps its clara_authenticated EXECUTE grant");
    for (const sig of SURVIVING_BANK_LINE_SIGS) {
      assert.equal(await sigExists(sig), true,
        `[D-b3 floor, post-0129 retirement] the surviving overload ${sig} must still resolve`);
      assert.equal(await sigGrantedTo(sig, "clara_authenticated"), true,
        `[D-b3 floor, post-0129 retirement] …and the surviving overload ${sig} keeps its clara_authenticated EXECUTE grant`);
    }
    noteLane(`[D-b3 floor] POST-retirement arm (stem=${stemApplied} witness=${catalogWitness}) — eleven absences + six positive controls`);
    return;
  }
  // PRE-RETIREMENT (neither witness fires here) — the ORIGINAL assertions, verbatim: 0044
  // creates accept_bank_rule_suggestion, revoked from PUBLIC, grant WITHHELD until D-b2 ships the
  // account-role door it depends on (S2.9-b3); asserted BOTH WAYS so the deferral is a claim.
  for (const fn of ["resolve_and_book_bank_line", "accept_bank_rule_suggestion"]) {
    assert.equal(await fnExists(fn), true, `[D-b3 floor, pre-0129] clara.${fn} exists`);
  }
  assert.equal(await grantedTo("resolve_and_book_bank_line", "clara_authenticated"), true,
    "[D-b3 floor, pre-0129] the AF-2 composite is executable by clara_authenticated");
  const producerGranted = await grantedTo("accept_bank_rule_suggestion", "clara_authenticated");
  const d2Applied = (await appliedCount(V_B2)) > 0;
  if (d2Applied) {
    assert.equal(producerGranted, true,
      "[D-b3 floor, pre-0129, with D-b2 applied] the withheld producer grant lands with D-b2 (S2.9-b3)");
  } else {
    assert.equal(producerGranted, false,
      "[D-b3 floor, pre-0129, at the D-b3 frontier] the producer is created but NOT granted — the phantom-staff-advance door stays shut until D-b2 ships");
  }
  noteLane(`[D-b3 floor] PRE-retirement arm (stem=${stemApplied} witness=${catalogWitness}) — producer exists, AF-2 composite granted, producer grant ${d2Applied ? "landed with D-b2" : "withheld"}`);
}
