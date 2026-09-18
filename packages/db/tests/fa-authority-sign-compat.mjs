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
 *  `clara.agent_tasks` row in the client's own firm. `kind='chat_turn'` is the chat lane's own
 *  value in `ck_agent_tasks_kind_0011`; the authority ref's `kind` word (`chat_task`) names the
 *  RELATION the id lives in, which is what 0193:1500-1510's ladder resolves against. */
export async function mintChatTaskRef(client) {
  const c = await rootQuery("select firm_id from clara.clients where id = $1", [client]);
  const firm = c.rows[0]?.firm_id;
  assert.ok(firm, `mintChatTaskRef: client ${client} has no firm`);
  const u = await rootQuery(
    "select user_id from clara.firm_memberships where firm_id = $1 and status = 'active' order by created_at limit 1",
    [firm]);
  const t = await rootQuery(
    `insert into clara.agent_tasks(firm_id, client_id, kind, status, model_snapshot, created_by)
       values ($1, $2, 'chat_turn', 'completed', 'p651-fixture', $3) returning id`,
    [firm, client, u.rows[0]?.user_id ?? null]);
  return { kind: "chat_task", id: t.rows[0].id };
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
