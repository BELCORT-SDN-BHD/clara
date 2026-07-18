// Authorization against the DB (contract §4.2 / §0.9). resolvePrincipal is live
// membership per request; assertSessionAccess enforces own-OR-firm-shared with an
// INDISTINGUISHABLE 404 for a foreign-private vs a nonexistent session (no oracle).

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolvePrincipal, assertSessionAccess, AuthError } from "../lib/authz.mjs";
import * as rig from "./rig.mjs";

const READY = await rig.runtimeReady();
const skip = READY ? false : "Slice-4 (0006) surface absent";

after(async () => {
  await rig.endPool();
});

test("resolvePrincipal: an active member resolves firm + role; a non-member is 403", { skip }, async () => {
  const { owner, firm } = await rig.buildFirm("az1");
  const p = await rig.asRuntime((c) => resolvePrincipal(c, owner));
  assert.equal(p.firmId, firm);
  assert.ok(p.role, "role resolved");
  await assert.rejects(
    () => rig.asRuntime((c) => resolvePrincipal(c, randomUUID())),
    (e) => e instanceof AuthError && e.status === 403,
    "a stranger has no membership",
  );
});

test("resolvePrincipal: a REVOKED member is rejected on the next request", { skip }, async () => {
  const { owner, firm } = await rig.buildFirm("az2");
  const member = await rig.addMember(owner, firm, { role: "bookkeeper" });
  await rig.asRuntime((c) => resolvePrincipal(c, member)); // works while active
  // Deactivate the membership (governed table — root).
  await rig.rootQuery("update clara.firm_memberships set status='removed' where user_id=$1 and firm_id=$2", [member, firm]);
  await assert.rejects(
    () => rig.asRuntime((c) => resolvePrincipal(c, member)),
    (e) => e instanceof AuthError && e.status === 403,
    "a removed member is rejected next request",
  );
});

test("assertSessionAccess: own private OK; firm-shared OK; foreign-private == nonexistent 404", { skip }, async () => {
  const { owner, firm, client } = await rig.buildFirm("az3");
  const member = await rig.addMember(owner, firm, { role: "bookkeeper" });
  const ownerP = await rig.asRuntime((c) => resolvePrincipal(c, owner));
  const memberP = await rig.asRuntime((c) => resolvePrincipal(c, member));

  const priv = await rig.createChatSession({ author: owner, client, visibility: "private" });
  const shared = await rig.createChatSession({ author: owner, client, visibility: "firm" });

  // Owner reaches their own private + the shared session.
  assert.ok(await rig.asRuntime((c) => assertSessionAccess(c, priv, ownerP)));
  assert.ok(await rig.asRuntime((c) => assertSessionAccess(c, shared, ownerP)));
  // Another member reaches the shared one...
  assert.ok(await rig.asRuntime((c) => assertSessionAccess(c, shared, memberP)));

  // ...but the owner's PRIVATE session is 404 to the member — identical to a random id.
  const foreignErr = await rig
    .asRuntime((c) => assertSessionAccess(c, priv, memberP))
    .then(() => null, (e) => e);
  const randomErr = await rig
    .asRuntime((c) => assertSessionAccess(c, randomUUID(), memberP))
    .then(() => null, (e) => e);
  assert.ok(foreignErr instanceof AuthError && foreignErr.status === 404, "foreign-private is 404");
  assert.ok(randomErr instanceof AuthError && randomErr.status === 404, "nonexistent is 404");
  assert.equal(foreignErr.message, randomErr.message, "the two 404s are indistinguishable");
});
