import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import * as rig from "./rig.mjs";

const READY = await rig.documentPipelineReady();
const skip = READY ? false : "Slice-5 (0007) document pipeline surface absent";

after(() => rig.endPool());

async function finalizeFixture(owner, firm, sha = rig.sha(randomUUID())) {
  const intake = await rig.createDocumentIntakeFixture({ owner });
  const key = `firms/${firm}/docs/${sha}.pdf`;
  const lease = `attachment-fixture:${randomUUID()}`;
  await rig.asRuntime((client) => client.query(
    "select clara.claim_document_intake_upload($1,$2,$3,60,$4)",
    [intake.intake_id, intake.tokenHash, lease, rig.opk("attachment-claim")],
  ));
  await rig.asRuntime((client) => client.query(
    "select clara.mark_document_intake_received($1,$2,$3,$4,$5,$6)",
    [intake.intake_id, intake.tokenHash, lease, sha, key, rig.opk("attachment-received")],
  ));
  await rig.asRuntime((client) => client.query(
    "select clara.begin_document_intake_verification($1,$2)",
    [intake.intake_id, rig.opk("attachment-verifying")],
  ));
  await rig.asRuntime((client) => client.query(
    "select clara.verify_document_intake($1,$2,1,$3)",
    [intake.intake_id, intake.tokenHash, rig.opk("attachment-verified")],
  ));
  const fixed = await rig.rootQuery("select op_key from clara.document_intakes where id=$1", [intake.intake_id]);
  const finalized = await rig.asRuntime((client) => client.query(
    "select clara.finalize_document_intake($1,$2,$3,'{}'::jsonb,1,'none',null,null,$4) as receipt",
    [intake.intake_id, intake.tokenHash, "attachment-store:v1", fixed.rows[0].op_key],
  ));
  return {
    type: "attachment",
    intake_id: intake.intake_id,
    document_id: finalized.rows[0].receipt.document_id,
    status: finalized.rows[0].receipt.status,
  };
}

test("chat attachment admission accepts an adopted own-firm intake and rejects foreign/nonexistent/six-part inputs", { skip }, async () => {
  const a = await rig.buildFirm("attachment-admission-a");
  const duplicateSha = rig.sha(randomUUID());
  await finalizeFixture(a.owner, a.firm, duplicateSha);
  const own = await finalizeFixture(a.owner, a.firm, duplicateSha);
  assert.equal(own.status, "adopted", "an adopted intake is attachment-eligible");
  const happySession = await rig.createChatSession({ author: a.owner });
  const happy = await rig.beginChatTurn({ session: happySession, author: a.owner, parts: [{ type: "text", text: "file this" }, own] });
  assert.equal(happy.status, "queued");

  const b = await rig.buildFirm("attachment-admission-b");
  const foreign = await finalizeFixture(b.owner, b.firm);
  const foreignSession = await rig.createChatSession({ author: a.owner });
  await assert.rejects(
    rig.beginChatTurn({ session: foreignSession, author: a.owner, parts: [foreign] }),
    (err) => err.code === "CLR11",
  );

  const otherUploader = await rig.addMember(a.owner, a.firm, { role: "bookkeeper", prefix: "attachment-other" });
  const wrongUploaderSession = await rig.createChatSession({ author: otherUploader });
  await assert.rejects(
    rig.beginChatTurn({ session: wrongUploaderSession, author: otherUploader, parts: [own] }),
    (err) => err.code === "CLR11",
  );

  const nonterminal = await rig.createDocumentIntakeFixture({ owner: a.owner });
  const nonterminalSession = await rig.createChatSession({ author: a.owner });
  await assert.rejects(
    rig.beginChatTurn({
      session: nonterminalSession,
      author: a.owner,
      parts: [{ type: "attachment", intake_id: nonterminal.intake_id, document_id: randomUUID() }],
    }),
    (err) => err.code === "CLR11",
  );

  const missingSession = await rig.createChatSession({ author: a.owner });
  await assert.rejects(
    rig.beginChatTurn({
      session: missingSession,
      author: a.owner,
      parts: [{ type: "attachment", intake_id: randomUUID(), document_id: randomUUID() }],
    }),
    (err) => err.code === "CLR11",
  );

  const sixSession = await rig.createChatSession({ author: a.owner });
  await assert.rejects(
    rig.beginChatTurn({ session: sixSession, author: a.owner, parts: Array.from({ length: 6 }, () => ({ ...own })) }),
    (err) => err.code === "CLR10",
  );
});
