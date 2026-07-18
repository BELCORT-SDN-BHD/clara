import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import * as rig from "./rig.mjs";

const READY = await rig.documentPipelineReady();
const skip = READY ? false : "Slice-5 (0007) document pipeline surface absent";

after(() => rig.endPool());

function digest() {
  return randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", "");
}

async function revokeUploader(owner, firm, uploader, tag) {
  const membership = await rig.rootQuery(
    "select id from clara.firm_memberships where firm_id=$1 and user_id=$2 and status='active'",
    [firm, uploader],
  );
  await rig.humanQuery(owner, "select clara.remove_member($1,$2)", [membership.rows[0].id, rig.opk(tag)]);
}

async function assertExpiredAndRefunded(intakeId, receipt) {
  assert.equal(receipt.status, "failed");
  assert.equal(receipt.failure_code, "expired");
  const durable = await rig.readDocumentIntake(intakeId);
  assert.equal(durable.status, "failed");
  assert.equal(durable.failure_code, "expired");
  const reservation = await rig.rootQuery(
    "select state,refund_reason from clara.document_ingest_reservations where intake_id=$1",
    [intakeId],
  );
  assert.equal(reservation.rows[0].state, "refunded");
  assert.equal(reservation.rows[0].refund_reason, "expired");
}

async function claim(intake, leaseOwner, tag) {
  const out = await rig.asRuntime((client) => client.query(
    "select clara.claim_document_intake_upload($1,$2,$3,$4,$5) as receipt",
    [intake.intake_id, intake.tokenHash, leaseOwner, 60, rig.opk(tag)],
  ));
  return out.rows[0].receipt;
}

async function markReceived(intake, firm, leaseOwner, sha, tag) {
  const out = await rig.asRuntime((client) => client.query(
    "select clara.mark_document_intake_received($1,$2,$3,$4,$5,$6) as receipt",
    [intake.intake_id, intake.tokenHash, leaseOwner, sha, `firms/${firm}/docs/${sha}.pdf`, rig.opk(tag)],
  ));
  return out.rows[0].receipt;
}

test("viewer is refused at document-intake begin", { skip }, async () => {
  const { owner, firm } = await rig.buildFirm("intake-viewer-floor");
  const viewer = await rig.addMember(owner, firm, { role: "viewer", prefix: "viewer" });
  await assert.rejects(
    rig.asRuntime((client) => client.query(
      "select clara.create_document_intake($1,'documents_tab',null,$2,$3,$4,$5,$6,$7)",
      [viewer, "viewer.pdf", "application/pdf", 64, "a".repeat(64), new Date(Date.now() + 60_000).toISOString(), rig.opk("viewer-intake")],
    )),
    (err) => err.code === "CLR11",
  );
});

test("revoked uploader claim fails the intake and refunds its reservation", { skip }, async () => {
  const { owner, firm } = await rig.buildFirm("intake-revoked-uploader");
  const uploader = await rig.addMember(owner, firm, { role: "bookkeeper", prefix: "uploader" });
  const intake = await rig.createDocumentIntakeFixture({ owner: uploader });
  await revokeUploader(owner, firm, uploader, "remove-uploader");

  const claimed = await rig.asRuntime((client) => client.query(
    "select clara.claim_document_intake_upload($1,$2,$3,$4,$5) as receipt",
    [intake.intake_id, intake.tokenHash, `revoked-${randomUUID()}`, 60, rig.opk("revoked-claim")],
  ));
  await assertExpiredAndRefunded(intake.intake_id, claimed.rows[0].receipt);
});

test("revocation at every post-claim intake transition terminalizes and refunds", { skip }, async () => {
  const transitions = [
    {
      name: "mark-received",
      prepare: async ({ intake, leaseOwner }) => claim(intake, leaseOwner, "prepare-mark"),
      invoke: ({ intake, firm, leaseOwner, sha }) => markReceived(intake, firm, leaseOwner, sha, "revoked-mark"),
    },
    {
      name: "begin-verification",
      prepare: async ({ intake, firm, leaseOwner, sha }) => {
        await claim(intake, leaseOwner, "prepare-begin-claim");
        await markReceived(intake, firm, leaseOwner, sha, "prepare-begin-mark");
      },
      invoke: async ({ intake }) => (await rig.asRuntime((client) => client.query(
        "select clara.begin_document_intake_verification($1,$2) as receipt",
        [intake.intake_id, rig.opk("revoked-begin")],
      ))).rows[0].receipt,
    },
    {
      name: "verify",
      prepare: async ({ intake, firm, leaseOwner, sha }) => {
        await claim(intake, leaseOwner, "prepare-verify-claim");
        await markReceived(intake, firm, leaseOwner, sha, "prepare-verify-mark");
        await rig.asRuntime((client) => client.query(
          "select clara.begin_document_intake_verification($1,$2)",
          [intake.intake_id, rig.opk("prepare-verify-begin")],
        ));
      },
      invoke: async ({ intake }) => (await rig.asRuntime((client) => client.query(
        "select clara.verify_document_intake($1,$2,$3,$4) as receipt",
        [intake.intake_id, intake.tokenHash, 1, rig.opk("revoked-verify")],
      ))).rows[0].receipt,
    },
    {
      name: "fail",
      prepare: async ({ intake, firm, leaseOwner, sha }) => {
        await claim(intake, leaseOwner, "prepare-fail-claim");
        await markReceived(intake, firm, leaseOwner, sha, "prepare-fail-mark");
      },
      invoke: async ({ intake }) => (await rig.asRuntime((client) => client.query(
        "select clara.fail_document_intake($1,$2,$3) as receipt",
        [intake.intake_id, "bad_type", rig.opk("revoked-fail")],
      ))).rows[0].receipt,
    },
    {
      name: "finalize",
      prepare: async ({ intake, firm, leaseOwner, sha }) => {
        await claim(intake, leaseOwner, "prepare-finalize-claim");
        await markReceived(intake, firm, leaseOwner, sha, "prepare-finalize-mark");
        await rig.asRuntime((client) => client.query(
          "select clara.begin_document_intake_verification($1,$2)",
          [intake.intake_id, rig.opk("prepare-finalize-begin")],
        ));
        await rig.asRuntime((client) => client.query(
          "select clara.verify_document_intake($1,$2,$3,$4)",
          [intake.intake_id, intake.tokenHash, 1, rig.opk("prepare-finalize-verify")],
        ));
      },
      invoke: async ({ intake }) => (await rig.asRuntime((client) => client.query(
        "select clara.finalize_document_intake($1,$2,'fixture-engine','{}'::jsonb,1,'ocr',null,null,$3) as receipt",
        [intake.intake_id, intake.tokenHash, rig.opk("revoked-finalize")],
      ))).rows[0].receipt,
    },
  ];

  for (const transition of transitions) {
    const { owner, firm } = await rig.buildFirm(`intake-revoked-${transition.name}`);
    const uploader = await rig.addMember(owner, firm, { role: "bookkeeper", prefix: transition.name });
    const intake = await rig.createDocumentIntakeFixture({ owner: uploader });
    const context = { owner, firm, uploader, intake, leaseOwner: `${transition.name}-${randomUUID()}`, sha: digest() };
    await transition.prepare(context);
    await revokeUploader(owner, firm, uploader, `remove-${transition.name}`);
    await assertExpiredAndRefunded(intake.intake_id, await transition.invoke(context));
  }
});

test("a bookkeeper may attach through a firm-shared session but not another user's private session", { skip }, async () => {
  const { owner, firm } = await rig.buildFirm("intake-shared-session");
  const member = await rig.addMember(owner, firm, { role: "bookkeeper", prefix: "shared-member" });
  const shared = await rig.createChatSession({ author: owner, visibility: "firm" });
  const admitted = await rig.createDocumentIntakeFixture({ owner: member, origin: "chat", session: shared });
  assert.equal(admitted.status, "uploading");

  const privateSession = await rig.createChatSession({ author: owner, visibility: "private" });
  await assert.rejects(
    rig.createDocumentIntakeFixture({ owner: member, origin: "chat", session: privateSession }),
    (err) => err.code === "CLR11",
  );
});
