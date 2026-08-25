// SHARED ROSTER MAPS for the two closed-world censuses that used to hard-equal a NUMBER.
//
// WHY THIS FILE EXISTS. `f-a2-chat-limb.test.mjs`'s c13.one-row cell asserted
// `deepEqual(interactive_client's allowlist, ['wake_open_question'])`, and
// `er9-gates-boundaries.test.mjs` asserted `machineRoles.length === 7`. Both are genuine
// closed-world walls and both are RIGHT to exist — but a bare literal makes every later
// claimant re-cut the SAME cell, and a re-cut is where a closed world quietly stops being one
// (nobody can tell an intentional widening from a merge that lost an entry). So the literal
// moves here, keyed by the OWNING migration's stem, and each entry carries its OWN presence
// probe so the cell can gate on "is this claimant's migration applied on this database?"
// rather than on a rig's `schema_migrations` contents — which is not a safe instrument for a
// lane rig, where a file may have been applied under a throwaway number or by hand.
//
// THE SHAPE IS DELIBERATE, in both directions:
//   (a) every LIVE row/role must appear in the roster — an unregistered one is a finding, which
//       is what keeps the world CLOSED; and
//   (b) every roster entry whose owning migration IS applied must be PRESENT — which is the
//       direction that can say NO. Without (b) a lost entry reads as a pass, and a read that
//       cannot say NO has a meaningless YES.
// An entry whose migration is NOT applied is neither required nor forbidden; it is simply not
// this database's business yet. That is what keeps the cells bimodal-green across frontiers.
//
// ADDING AN ENTRY IS THE POINT. A lane that adds an allowlist row or a clara_ role adds its row
// HERE, in the same PR, with a probe that is true only once its own migration has run. It never
// edits another lane's entry.

/** Probe helpers. Each takes the test's `rootQuery` and answers "is the owner applied?" by
 *  asking the CATALOG for an object that migration creates — never by reading a version table. */
const fnExists = (signature) => async (rootQuery) =>
  (await rootQuery("select to_regprocedure($1) is not null as ok", [signature])).rows[0].ok;
const roleExists = (role) => async (rootQuery) =>
  (await rootQuery("select to_regrole($1) is not null as ok", [role])).rows[0].ok;
/** For the pre-frontier estate (0002/0006/0009): the roster entry is unconditional. Every
 *  database this census runs on is past those, and the assertion below proves it by demanding
 *  the entry be present rather than by assuming it. */
const always = async () => true;

/**
 * `clara.wake_fn_allowlist` rows, per wake kind, keyed by the stem of the migration that
 * inserts them. ONLY the kinds a closed-world cell asserts are listed; a kind absent from this
 * map is asserted RELATIVELY by its own cell (e.g. "wake_post_entry holds exactly two rows"),
 * which is the right shape when the roster itself is still growing.
 */
export const WAKE_ALLOWLIST_ROSTER = {
  interactive_client: [
    {
      fn: "wake_open_question",
      stem: "f_a2_posting_grants",
      // F-A2 PR-1 part 2 is the only thing that creates this wrapper.
      applied: fnExists("clara.wake_post_entry(uuid,uuid,uuid,bigint,text,jsonb,text)"),
      why: "F-A2 D34/R-1: the pinned chat kind's ONE typed question call. It posts nothing, and "
        + "that is the whole of this kind's authority on the posting axis.",
    },
    {
      fn: "wake_freeform_read",
      stem: "f_a6_freeform_read",
      applied: fnExists("clara.wake_freeform_read(text,text,uuid,text,int)"),
      why: "F-A6 PR-1: the audited freeform read, client-pinned arm. The verb writes nothing — "
        + "its role holds SELECT on 35 relations and DML on none — so this row widens what the "
        + "pinned kind may READ and not what it may DO.",
    },
  ],
};

/**
 * Non-sanctioned `clara_` roles (the census excludes clara_authenticated + clara_fn_owner, the
 * two SANCTIONED close-verb EXECUTE holders — see the cell for why that exclusion is a
 * whitelist and not a blacklist).
 */
export const CLARA_ROLE_ROSTER = [
  { role: "clara_agent_ro", stem: "0002_foundation", applied: always },
  { role: "clara_runtime", stem: "0002_foundation", applied: always },
  { role: "clara_wake_interactive", stem: "0002_foundation", applied: always },
  { role: "clara_wake_proactive", stem: "0002_foundation", applied: always },
  { role: "clara_agent_read_login", stem: "0006_runtime_core", applied: always },
  { role: "clara_runtime_login", stem: "0006_runtime_core", applied: always },
  { role: "clara_wake_write_login", stem: "0009_coding_floor", applied: always },
  {
    role: "clara_freeform_ro",
    stem: "f_a6_freeform_read",
    applied: fnExists("clara.wake_freeform_read(text,text,uuid,text,int)"),
    why: "F-A6 TA-P9 A(2): the free read executes as a NEW role, never on clara_agent_ro's "
      + "accumulated grants — its permissive p_*_agent policies would OR past the receipt gate.",
  },
  {
    role: "clara_freeform_login",
    stem: "f_a6_freeform_read",
    applied: roleExists("clara_freeform_ro"),
    why: "F-A6 survey F7: the fourth login. The read pool's transactions are read-only at "
      + "SESSION level, so the receipt could not be written there.",
  },
  // The next three landed on main WHILE F-A6 PR-1 was building — registered here rather than
  // left for a fifth bare-count re-bump (er9-gates-boundaries.test.mjs's own merge-true note).
  {
    role: "clara_wake_bank",
    stem: "f_a3_pr1b_agent_limb",
    applied: fnExists("clara.wake_unmatch_bank_match(uuid,uuid,text,text,jsonb,text,text)"),
    why: "F-A3/PR-1b DDL 7: the bank-agency agent limb's own EXECUTE surface, granted the wake_* "
      + "bank wrappers alone — the human /bank verbs stay off it.",
  },
  {
    role: "clara_wake_bank_login",
    stem: "f_a3_pr1b_agent_limb",
    applied: roleExists("clara_wake_bank"),
    why: "F-A3/PR-1b DDL 7 completion: the login shell PR-2's DSN/pool wiring reaches, member of "
      + "clara_wake_bank alone.",
  },
  {
    role: "clara_wake_filing",
    stem: "f_a7_beta_filing_verb",
    applied: fnExists("clara.wake_file_document(uuid,uuid,jsonb,text,jsonb,uuid,text)"),
    why: "F-A7 beta SS2.1: the filing wake kind's own group role — group only, no login shell "
      + "and no postgres membership (reached via wake_credentials rows alone).",
  },
];

/** Resolve a roster to the entries whose owning migration is applied on THIS database. */
export async function appliedEntries(roster, rootQuery) {
  const out = [];
  for (const entry of roster) {
    if (await entry.applied(rootQuery)) out.push(entry);
  }
  return out;
}

/** The two-direction comparison both cells share. Returns [] when the world is closed. */
export function rosterFailures(label, live, expected, allKnown) {
  const failures = [];
  const liveSet = new Set(live);
  const expectedSet = new Set(expected);
  const knownSet = new Set(allKnown);
  for (const x of live) {
    if (!knownSet.has(x)) {
      failures.push(
        `${label}: ${x} is LIVE but appears in no roster entry. A closed world stays closed by `
        + "registration: add it to packages/db/tests/fixtures/wake-allowlist-roster.mjs in the "
        + "PR that creates it, with a probe that is true only once that migration has applied.",
      );
    }
  }
  for (const x of expected) {
    if (!liveSet.has(x)) {
      failures.push(
        `${label}: ${x} is rostered AND its owning migration is applied, but it is NOT live. `
        + "This is the direction that can say NO — a lost row or a dropped role reads here as a "
        + "failure instead of as a pass.",
      );
    }
  }
  // Registered-but-unapplied entries are neither required nor forbidden; naming them keeps the
  // bimodal gate honest rather than silent.
  const dormant = allKnown.filter((x) => !expectedSet.has(x) && !liveSet.has(x));
  return { failures, dormant };
}
