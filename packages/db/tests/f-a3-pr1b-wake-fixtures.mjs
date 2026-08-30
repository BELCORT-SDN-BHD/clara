// F-A3 PR-1b -- wake-verbs battery shared fixture CORE (NOT a test file: the name does not end
// in `.test.mjs`, so `node --test` ignores it). Split out of f-a3-pr1b-wake-verbs.test.mjs purely
// to keep it under the repo's 500-line gate (the wave-a-helpers/wave-a-fixtures split precedent,
// also used by f-a3-pr1b-fixtures.mjs and x38-match-fixtures.mjs). Every function here is
// STATELESS except where it plainly says otherwise.

import { randomUUID } from "node:crypto";
import { rootQuery } from "./a21-helpers.mjs";
import { withTxn } from "./rig-txn.mjs";
import { GUARD } from "./x38-match-fixtures.mjs";
import { wakeQuery } from "./rig-helpers.mjs";
import { hasG1Pr2a, makeBankWakeTask } from "./g1-pr-2a-fixtures.mjs";

export const WAKE_ROLE = "clara_wake_bank_login";
export const RATIONALE = "f31w battery: unattended agent judgement";
export const MODEL = { provider: "openai", model: "gpt-5.6-terra", version: "v1" };

/** Mint a real wake credential and return { id, secret } (mint_wake_credential builds no ctx,
 *  so rootQuery is fine -- the pinned shape f-a3-pr1b-agent-limb.test.mjs's f31b.f already uses).
 *
 *  G1 PR-2a -- THE WALL IMPLIES ITS FIXTURES. From that migration on, a bank_agent credential is
 *  BOUND to a live wake task: the plain mint refuses bank_agent_task_absent when the firm/client
 *  has none, and every bank act is then gated on that task's status and its bank account. So the
 *  producer's own artefacts have to exist before a bank_agent credential can. They are built HERE,
 *  once, rather than in each of the four batteries that mint one -- and CONDITIONALLY, on the
 *  gate's own EXACT SIGNATURE, so this same file still mints exactly as it always did against a
 *  pre-PR-2a chain (which is what the control side of a same-corpus pair runs). */
export async function mintCred(kind, firm, client, obo = null) {
  if (kind === "bank_agent" && client && (await hasG1Pr2a())) {
    await ensureBankWakeTaskForClient({ firm, client });
  }
  const r = await rootQuery(
    "select * from clara.mint_wake_credential($1,$2,$3,'00:15:00'::interval,$4)",
    [kind, firm, obo, client]);
  return { id: r.rows[0].id, secret: r.rows[0].secret };
}

/** The client's ONE live bank wake task, memoized per (firm, client).
 *
 *  The account it binds to is DERIVED: the client's single active bank account. That is not a
 *  guess dressed as a derivation -- these batteries build exactly one bank account per client
 *  (each buildWorld() call mints a fresh, uniquely-prefixed world, so accounts never accumulate
 *  across files), and where a client genuinely has none or several the helper binds NOTHING and
 *  lets §F's own wake_task_account_unbound refusal say so LOUDLY. Quietly picking one would make
 *  a battery pass against an account it never meant to act on. */
async function ensureBankWakeTaskForClient({ firm, client }) {
  const key = `${firm}:${client}`;
  if (_bankTaskCache.has(key)) return _bankTaskCache.get(key);
  const live = await rootQuery(
    `select id from clara.agent_tasks
      where firm_id=$1 and client_id=$2 and kind='wake' and status in ('held','running','cancel_requested')`,
    [firm, client]);
  if (live.rowCount === 1) { _bankTaskCache.set(key, live.rows[0].id); return live.rows[0].id; }
  if (live.rowCount > 1) return null;   // ambiguous by construction: let §E's own refusal name it
  const acct = await rootQuery(
    "select id from clara.bank_accounts where client_id=$1 and coalesce(status,'active')='active'", [client]);
  // EXACTLY ONE -> that one. NONE -> a synthetic id, because the account a wake task names is
  // whatever its producing event named, and a client with no bank account can only be driving the
  // four verbs that HAVE no account subject (add_bank_account, upsert_account, the staff-advance
  // booking, the identifier promotion) -- for which the value is never compared to anything.
  // SEVERAL -> null, which makes §F refuse wake_task_account_unbound out loud: a helper that
  // silently picked one would let a battery pass against an account it never meant to act on.
  const bankAccount = acct.rowCount === 1 ? acct.rows[0].id : (acct.rowCount === 0 ? randomUUID() : null);
  const made = await makeBankWakeTask({ firm, client, bankAccount, status: "running" });
  _bankTaskCache.set(key, made.taskId);
  return made.taskId;
}
const _bankTaskCache = new Map();

export function callWrapper(name, specs) {
  return `select clara.${name}(${specs.map((s, i) => `${s.name} => $${i + 1}${s.cast ? `::${s.cast}` : ""}`).join(", ")}) as r`;
}

/** H2 (cross-model review, HEAD d5e5dc6): p_inputs_digest now must name a REAL, prior
 *  clara._agent_get_bank_pack_core read for the client (bank_agent_receipts.act_kind=
 *  'pack_read'), or every consuming core refuses inputs_digest_unverified before its own
 *  judgement logic runs. Every cell below that reaches a judgement rung must fetch one of these
 *  FIRST and pass its digest through, exactly as a real agent lane would.
 *
 *  MEMOIZED per (client, bankAccount): bank_agent_receipts' own partial unique index --
 *  (act_kind, subject_id) WHERE outcome='admitted' -- allows at most ONE admitted pack_read
 *  receipt ever, for a given bank account (the same "at most one admitted act per subject" law
 *  every OTHER judgement act uses, Annex A.3). A real agent reads the pack once and acts on
 *  several judgements from it in the SAME session; re-fetching a fresh pack per cell would hit
 *  that constraint on the second call for the same account and is not the shape a real caller
 *  takes anyway -- multiple judgements citing the SAME pack read is the normal case, not a bug
 *  to route around per-cell. */
const _digestCache = new Map();
export async function realDigest(secret, client, bankAccount, opKey) {
  const key = `${client}:${bankAccount}`;
  if (_digestCache.has(key)) return _digestCache.get(key);
  const r = await wakeQuery(WAKE_ROLE, secret,
    callWrapper("wake_get_bank_pack", [
      { name: "p_client", cast: "uuid" }, { name: "p_bank_account", cast: "uuid" },
      { name: "p_rationale" }, { name: "p_model", cast: "jsonb" }, { name: "p_op_key" }]),
    [client, bankAccount, RATIONALE, JSON.stringify(MODEL), opKey]);
  const digest = r.rows[0].r.digest;
  _digestCache.set(key, digest);
  return digest;
}

/** A plain APPROVED 2-leg entry (Dr bankCoa / Cr other, both = cents), the draft -> lines ->
 *  approve order every real writer uses (`_tf_lines_immutable` refuses a lines write once the
 *  entry is anything but 'draft', INCLUDING the entry's very first insert if it is born
 *  'approved' directly -- rig-replay-caught by this file's own battery, f31w.h/i/j). ONE
 *  transaction (db-tests.md's withTxn rule): a deferred balance trigger fires on the entry alone
 *  otherwise. Returns the entry id. */
export async function approvedEntry({ client, actor, postingDate, memo, bankCoa, otherCoa, cents }) {
  return withTxn(async (c) => {
    await c.query(GUARD);
    const draft = await c.query(
      `insert into clara.journal_entries(client_id, status, posting_date, memo, origin, maker_actor)
         values ($1,'draft',$2,$3,'manual',$4) returning id`,
      [client, postingDate, memo, actor]);
    const entryId = draft.rows[0].id;
    await c.query(
      `insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents, credit_cents)
         values ($1,1,$2,$4,0),($1,2,$3,0,$4)`,
      [entryId, bankCoa, otherCoa, cents]);
    await c.query(
      `update clara.journal_entries set status='approved', checker_actor=$2, approved_at=now() where id=$1`,
      [entryId, actor]);
    return entryId;
  });
}
