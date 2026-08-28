// P4 tranche-1 (invite/RBAC) rig fixtures -- NOT a test file (does not end in `.test.mjs`).
// Wraps the shared rig-helpers/rig-fixtures core with the one thing this tranche needs that the
// Slice-2 rig never carried: a JWT claims blob that includes `email`, since claim_identity and
// accept_invite read it from request.jwt.claims -> 'email', never a client argument (design §3 /
// annex 1 §D).

import { randomUUID } from "node:crypto";
import { getPool, rootQuery, namedCall } from "./rig-helpers.mjs";

/** Like asHuman, but the JWT claims blob also carries `email` (session-level, autocommit calls). */
export async function asHumanEmail(sub, email, fn) {
  const client = await getPool().connect();
  try {
    await client.query("set role clara_authenticated");
    await client.query("select set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({ sub, role: "authenticated", email }),
    ]);
    return await fn(client);
  } finally {
    try {
      await client.query("rollback");
    } catch {
      /* no open txn */
    }
    try {
      await client.query("reset role");
    } catch {
      /* best-effort */
    }
    try {
      await client.query("reset all");
    } catch {
      /* best-effort */
    }
    client.release();
  }
}

export const humanEmailQuery = (sub, email, sql, params) => asHumanEmail(sub, email, (c) => c.query(sql, params));

/** A fresh, never-provisioned persona: a real Supabase auth session with NO clara.users row yet --
 *  the exact identity-gap shape (design §3). Never insertUser()'d. */
export function freshPersona(tag) {
  const sub = randomUUID();
  const email = `p4t1_${tag}_${sub.slice(0, 8)}@rig.test`;
  return { sub, email };
}

export async function claimIdentity(sub, email, { displayName, opKey }) {
  const r = await humanEmailQuery(
    sub,
    email,
    namedCall("claim_identity", [{ name: "p_display_name" }, { name: "p_op_key" }]),
    [displayName, opKey],
  );
  return r.rows[0].result;
}

export async function inviteMember(sub, { email, role, opKey }) {
  const r = await (await import("./rig-helpers.mjs")).humanQuery(
    sub,
    namedCall("invite_member", [{ name: "p_email" }, { name: "p_role" }, { name: "p_op_key" }]),
    [email, role, opKey],
  );
  return r.rows[0].result;
}

export async function acceptInvite(sub, email, { token, displayName, opKey }) {
  const r = await humanEmailQuery(
    sub,
    email,
    namedCall("accept_invite", [{ name: "p_token" }, { name: "p_display_name" }, { name: "p_op_key" }]),
    [token, displayName, opKey],
  );
  return r.rows[0].result;
}

export async function revokeInvite(sub, { invite, opKey }) {
  const r = await (await import("./rig-helpers.mjs")).humanQuery(
    sub,
    namedCall("revoke_invite", [{ name: "p_invite" }, { name: "p_op_key" }]),
    [invite, opKey],
  );
  return r.rows[0].result;
}

/** Force an invite's expires_at into the past (root; superuser bypasses RLS) -- the rig cannot
 *  wait 7 real days, so expiry is proven by manipulating the stamped column, not the clock. */
export async function expireInvite(inviteId) {
  await rootQuery("update clara.firm_invites set expires_at = now() - interval '1 minute' where id = $1", [inviteId]);
}

/** Read an invite row directly (root) for assertions the masked view/receipt would not carry
 *  (e.g. token_hash, to prove the raw token is never stored in the base table). */
export async function rawInvite(inviteId) {
  const r = await rootQuery("select * from clara.firm_invites where id = $1", [inviteId]);
  return r.rows[0] ?? null;
}
