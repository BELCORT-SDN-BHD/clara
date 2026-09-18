// THROWAWAY COMPATIBILITY PROOF. All inputs and state are synthetic.
import { createHook, getWritable } from "workflow";

export type ResumeAnswer = {
  answer: string;
  currentAuthorityRevision: number;
  currentKnowledgeRevision: number;
};

export async function durableWork(input: {
  workId: string;
  requiredAuthorityRevision: number;
  requiredKnowledgeRevision: number;
}) {
  "use workflow";

  await emit({ type: "accepted", workId: input.workId });

  using answerHook = createHook<ResumeAnswer>({ token: `answer:${input.workId}` });
  const answer = await answerHook;

  const revisionComparison = await compareResumePayloadRevisions(input, answer);
  await emit({ type: "completed", workId: input.workId, revisionComparison });
  await closeOutput();

  return {
    status: "completed",
    workId: input.workId,
    answer: answer.answer,
    revisionComparison,
  };
}

async function compareResumePayloadRevisions(
  input: {
    requiredAuthorityRevision: number;
    requiredKnowledgeRevision: number;
  },
  answer: ResumeAnswer,
) {
  "use step";

  if (
    answer.currentAuthorityRevision !== input.requiredAuthorityRevision ||
    answer.currentKnowledgeRevision !== input.requiredKnowledgeRevision
  ) {
    throw new Error("resume state is stale; re-open the work with current authority and knowledge");
  }
  return {
    authorityRevision: answer.currentAuthorityRevision,
    knowledgeRevision: answer.currentKnowledgeRevision,
  };
}

async function emit(event: unknown) {
  "use step";
  const writer = getWritable<Uint8Array>().getWriter();
  try {
    await writer.write(new TextEncoder().encode(`${JSON.stringify(event)}\n`));
  } finally {
    writer.releaseLock();
  }
}

async function closeOutput() {
  "use step";
  const writer = getWritable<Uint8Array>().getWriter();
  await writer.close();
}
