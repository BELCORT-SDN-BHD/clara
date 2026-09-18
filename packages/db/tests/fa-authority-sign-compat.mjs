// #651 [0227] — THE ONE PLACE FOUR LANES SIGN A DEPRECIATION AUTHORITY.
// NOT a test file: the name does not end in `.test.mjs`, so `node --test` ignores it.
//
// WHY THIS MODULE EXISTS. 0227 makes `clara.sign_depreciation_authority`'s instruction
// reference REQUIRED, which needs a fourth argument, which (§2.2 rule 4 — one `pg_proc` row per
// name, never an overload) needs a DROP + CREATE. Four live call sites sign an authority by
// NAMED arguments and every one of them breaks the moment the arity moves:
//
//   packages/db/tests/x41-fa-fixtures.mjs          `signAuthority` — the WHOLE x41 suite
//   packages/db/tests/client-onboarding-identity.test.mjs   the annual-cadence FY-end lock cell
//   packages/db/tests/f-a4-pr1c-rungs.test.mjs              the B9 rung's ACTED half
//   packages/db/tests/x56-rest-j.test.mjs                   `liveFaAuthority`
//
// …and all four must keep working at BOTH frontiers, because `db-slice-frontiers` runs this
// package against chains that predate 0227. So the helper FEATURE-DETECTS the four-argument
// signature off `to_regprocedure` — the same instrument 0216's own prestate uses — rather than
// branching on a migration number. Below 0227 it calls the three-argument door unchanged; at or
// above it, it mints an instruction the door can RESOLVE and passes it.
//
// THE MINTED REFERENCE IS A LABELLED `rootQuery` FIXTURE INSERT, the established pattern at
// `f-a4-pr1c-fixtures.mjs:60`, `activity-feed.test.mjs:163` and `binding-proposal-pr-1.test.mjs:206`.
// It is fixture DML, never the thing under test: the battery that PROVES the resolution ladder is
// `depreciation-history.test.mjs` (`p651.authority.ref_resolves`), and it drives the real door.

import assert from "node:assert/strict";
import { rootQuery } from "./rig-helpers.mjs";

/** `true` once 0227's four-argument door is the one in the catalog. Cached per process; the
 *  arity cannot change under a running test process. */
let _four = null;
export async function signTakesAuthorityRef() {
  if (_four === null) {
    try {
      const r = await rootQuery(
        "select to_regprocedure('clara.sign_depreciation_authority(uuid,uuid,text,jsonb)') is not null as ok");
      _four = Boolean(r.rows[0].ok);
    } catch {
      _four = false;
    }
  }
  return _four;
}

/** A `{kind:'chat_task', id}` reference that RESOLVES for this client — a labelled fixture
 *  `clara.agent_tasks` row in the client's own firm.
 *
 *  THE ROW KIND IS `autodraft`, MEASURED RATHER THAN CHOSEN. `clara._tf_agent_task_insert`'s
 *  `chat_turn` arm requires a real `clara.chat_sessions` row (`chat_turn task requires
 *  session_id`) and its `wake` arm requires a `wake_intents` row; `autodraft` is the one arm whose
 *  whole precondition is "a prevalidated firm and an ACTIVE client, born queued, with a model
 *  snapshot" — the `f-a4-pr1c-fixtures.mjs:60` shape. The authority reference's own `kind` word
 *  (`chat_task`) names the RELATION the id lives in, and 0227's ladder resolves it against
 *  `clara.agent_tasks` by id, firm and client without reading `kind` — so this fixture is a real
 *  row of the real relation rather than a shape the ladder would never see in production. */
export async function mintChatTaskRef(client) {
  const c = await rootQuery("select firm_id from clara.clients where id = $1", [client]);
  const firm = c.rows[0]?.firm_id;
  assert.ok(firm, `mintChatTaskRef: client ${client} has no firm`);
  const u = await rootQuery(
    "select user_id from clara.firm_memberships where firm_id = $1 and status = 'active' order by created_at limit 1",
    [firm]);
  const insert = `insert into clara.agent_tasks(firm_id, client_id, kind, status, model_snapshot, created_by)
       values ($1, $2, 'autodraft', 'queued', 'p651-fixture', $3) returning id`;
  const params = [firm, client, u.rows[0]?.user_id ?? null];
  try {
    const t = await rootQuery(insert, params);
    return { kind: "chat_task", id: t.rows[0].id };
  } catch (e) {
    // …EXCEPT for a client that is not yet ACTIVE. Every arm of the insert trigger demands
    // something a carry-down/onboarding fixture does not have: `autodraft` and `close_prep` demand
    // an ACTIVE client, `chat_turn` a chat session, `wake` a wake intent, `accounting_work` a Work
    // row. An instruction naming a client still in onboarding is a real shape (a firm agrees the
    // depreciation policy while the client is being set up) that no audited verb can reach here, so
    // the fixture writes it directly, LABELLED, with the trigger off for exactly that statement.
    await rootQuery("alter table clara.agent_tasks disable trigger t_agent_task_insert");
    try {
      const t = await rootQuery(insert, params);
      return { kind: "chat_task", id: t.rows[0].id };
    } finally {
      await rootQuery("alter table clara.agent_tasks enable trigger t_agent_task_insert");
    }
  }
}

/** LABELLED FIXTURE DML, and the ONE shape no audited verb can reach: an authority signed in a
 *  PAST month.
 *
 *  0227's D8 stamps `authority_from` as the first day of the SIGNING month and freezes it, so a
 *  fixture that signs today can only ever produce a floor of "this month" — and since a period is
 *  due only once it has ENDED, NOTHING is ever due for such a client. That is correct product
 *  behaviour (`p651.authority.floor` proves it against the real door), and it would silently
 *  re-aim every pre-existing cell that asks the due oracle what to charge: those cells measure the
 *  ARITHMETIC, not the window.
 *
 *  `clara._tf_fa_authority_transition` refuses both a non-transition UPDATE and any write outside
 *  its sign/retire allowlist, so the trigger is disabled for exactly this one statement and
 *  re-enabled in a `finally`. This is fixture DML, never the thing under test. */
export async function backdateAuthorityFloor(authorityId, floorDate) {
  try {
    await rootQuery("alter table clara.fa_depreciation_authorities disable trigger t_fa_authorities_transition");
    await rootQuery(
      "update clara.fa_depreciation_authorities set authority_from = $2::date where id = $1",
      [authorityId, floorDate]);
  } finally {
    await rootQuery("alter table clara.fa_depreciation_authorities enable trigger t_fa_authorities_transition");
  }
  return floorDate;
}

/** Sign an authority at whichever frontier this database sits on.
 *
 *  `humanQuery` is passed in rather than imported so each lane keeps its own pool and its own
 *  persona plumbing — this module owns the SIGNATURE question and nothing else. */
export async function signAuthorityCompat(humanQuery, sub, { client, authority, opKey, ref = null }) {
  if (!(await signTakesAuthorityRef())) {
    return (await humanQuery(sub,
      "select clara.sign_depreciation_authority(p_client => $1, p_authority => $2, p_op_key => $3) as r",
      [client, authority, opKey])).rows[0].r;
  }
  const r = ref ?? (await mintChatTaskRef(client));
  return (await humanQuery(sub,
    "select clara.sign_depreciation_authority(p_client => $1, p_authority => $2, p_op_key => $3, "
    + "p_authority_ref => $4::jsonb) as r",
    [client, authority, opKey, JSON.stringify(r)])).rows[0].r;
}
