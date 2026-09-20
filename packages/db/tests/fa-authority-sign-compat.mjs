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
import { rootQuery, withActor } from "./rig-helpers.mjs";

/** ONE CONNECTION, ONE TRANSACTION, for every fixture that has to turn a trigger off.
 *
 *  `alter table … disable trigger` is DDL: inside a transaction it takes ACCESS EXCLUSIVE and the
 *  guard is off only for THIS transaction, so a concurrent session blocks instead of writing past
 *  a disabled trigger, and a process killed mid-fixture rolls the disable back instead of leaving
 *  the rig permanently unguarded. Run as three autocommitted `rootQuery` calls — which is how both
 *  fixtures below were first written (adversarial review ADV-651-7) — the window is open to EVERY
 *  session on the cluster, and `--test-concurrency=1` bounds it only within this package while the
 *  estate runs real-DB cells from `packages/runtime` against the same database.
 *
 *  Migration 0227 does the same manoeuvre correctly for the same reason, inside the migration
 *  runner's own per-migration transaction (0227:338-342, and its comment says so). */
const withTriggerOff = (table, trigger, fn) =>
  withActor({ transaction: true }, async (c) => {
    await c.query(`alter table ${table} disable trigger ${trigger}`);
    try {
      return await fn(c);
    } finally {
      await c.query(`alter table ${table} enable trigger ${trigger}`);
    }
  });

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

/** THE FIRM MEMBER a fixture stamps as an author — the first live active membership of this
 *  client's own firm. Null only for a firm with no active member at all, which every world
 *  builder in this package rules out. */
async function firstActiveMember(firm) {
  const u = await rootQuery(
    "select user_id from clara.firm_memberships where firm_id = $1 and status = 'active' order by created_at limit 1",
    [firm]);
  return u.rows[0]?.user_id ?? null;
}

/** A labelled fixture `clara.agent_tasks` row of a NAMED kind, in this client's own firm and
 *  client, returned as the `{kind:'chat_task', id}` reference shape both authority doors take.
 *
 *  ONE MINTER, FOUR SHAPES, because #977 makes the row's OWN kind and author the thing under
 *  test rather than an irrelevance:
 *
 *    `chat_turn` + author  — A PERSON'S INSTRUCTION. The only shape #977's doors accept. Needs a
 *                            real `clara.chat_sessions` row (the insert trigger's chat arm reads
 *                            the session for the firm and client it stamps on the task), which is
 *                            also why it works for a client that is NOT yet active: a session
 *                            only asks that its client be IN the firm.
 *    `chat_turn` no author — a turn row nobody signed. Refused by #977: authorship is half the
 *                            predicate, and this is the arm that proves the other half is read.
 *    `autodraft`           — AN AGENT RUN THAT CARRIES AN AUTHOR. Refused by #977 for its KIND,
 *                            not for a missing author: a run is not an instruction. Its own
 *                            trigger arm demands a prevalidated firm and an ACTIVE client.
 *    `wake`                — the estate enqueuing work for itself; carries no author BY
 *                            CONSTRUCTION. Its trigger arm demands a real `wake_intents` row
 *                            resolving through `clara.domain_events`, and a wake task's firm and
 *                            client are stamped FROM that event — so a fixture that needs the
 *                            task to land on a NAMED client writes it directly, LABELLED, with
 *                            the insert trigger off for exactly that statement, inside ONE
 *                            transaction on ONE connection (see `withTriggerOff` above). The
 *                            reference under test is the DOOR's business, not the task's birth.
 *
 *  This is fixture DML, never the thing under test: the battery that PROVES the resolution ladder
 *  is `authority-ref-human-instruction.test.mjs` (#977) and `depreciation-history.test.mjs`
 *  (`p651.authority.ref_resolves`), and both drive the real doors. */
export async function mintAgentTaskRef(client, { kind = "chat_turn", author = true } = {}) {
  const c = await rootQuery("select firm_id from clara.clients where id = $1", [client]);
  const firm = c.rows[0]?.firm_id;
  assert.ok(firm, `mintAgentTaskRef: client ${client} has no firm`);
  const member = await firstActiveMember(firm);
  const createdBy = author ? member : null;

  if (kind === "chat_turn") {
    assert.ok(member, `mintAgentTaskRef: firm ${firm} has no active member to author a chat session`);
    const s = await rootQuery(
      "insert into clara.chat_sessions(firm_id, client_id, created_by) values ($1, $2, $3) returning id",
      [firm, client, member]);
    const t = await rootQuery(
      `insert into clara.agent_tasks(session_id, kind, status, model_snapshot, created_by)
         values ($1, 'chat_turn', 'queued', 'p651-fixture', $2) returning id`,
      [s.rows[0].id, createdBy]);
    return { kind: "chat_task", id: t.rows[0].id };
  }

  if (kind === "autodraft") {
    const t = await rootQuery(
      `insert into clara.agent_tasks(firm_id, client_id, kind, status, model_snapshot, created_by)
         values ($1, $2, 'autodraft', 'queued', 'p651-fixture', $3) returning id`,
      [firm, client, createdBy]);
    return { kind: "chat_task", id: t.rows[0].id };
  }

  assert.equal(kind, "wake", `mintAgentTaskRef: unsupported fixture kind ${kind}`);
  return withTriggerOff("clara.agent_tasks", "t_agent_task_insert", async (c2) => {
    const t = await c2.query(
      `insert into clara.agent_tasks(firm_id, client_id, kind, status, created_by)
         values ($1, $2, 'wake', 'held', $3) returning id`,
      [firm, client, createdBy]);
    return { kind: "chat_task", id: t.rows[0].id };
  });
}

/** A `{kind:'chat_task', id}` reference that RESOLVES for this client — the shape #977's doors
 *  accept: a `chat_turn` agent task carrying a named author, in the client's own firm and client.
 *
 *  IT WAS AN `autodraft` UNTIL #977. 0227's ladder resolved a chat-lane reference by a bare
 *  existence test, so any task kind satisfied it and `autodraft` was the cheapest arm to mint
 *  (`chat_turn` needs a chat session, `wake` a wake intent). #977 is the ruling that closed that
 *  gap — a machine-enqueued row is no longer an instruction — so the fixture now mints the shape
 *  a person's instruction actually has. Every caller below keeps working unchanged. */
export async function mintChatTaskRef(client) {
  return mintAgentTaskRef(client, { kind: "chat_turn", author: true });
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
 *  `clara._tf_fa_authority_transition` refuses a non-transition UPDATE, any write outside its
 *  sign/retire allowlist, and — since 0227 §B.2 — any SECOND write to an already-stamped
 *  `authority_from`, which is precisely the move below. So the trigger is disabled for exactly
 *  this one statement, inside ONE transaction, and re-enabled before it commits. This is fixture
 *  DML, never the thing under test: the enabled path is `p651.authority.floor_frozen`. */
export async function backdateAuthorityFloor(authorityId, floorDate) {
  await withTriggerOff("clara.fa_depreciation_authorities", "t_fa_authorities_transition", (c) =>
    c.query("update clara.fa_depreciation_authorities set authority_from = $2::date where id = $1",
      [authorityId, floorDate]));
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
