import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { waitForHook } from "@workflow/vitest";
import { getRun, resumeHook, start } from "workflow/api";
import { durableWork } from "./durable-work";

const servers: Array<ReturnType<typeof createServer>> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

async function startSseAdapter() {
  const server = createServer(async (request, response) => {
    const match = /^\/runs\/([^/]+)\/events$/.exec(request.url ?? "");
    if (!match) {
      response.writeHead(404).end();
      return;
    }

    response.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
    });
    const reader = getRun(match[1]).getReadable({ startIndex: 0 }).getReader();
    request.on("close", () => void reader.cancel());

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        response.write(`data: ${JSON.stringify({ chunk: new TextDecoder().decode(value) })}\n\n`);
      }
      response.end();
    } catch (error) {
      if (!response.destroyed) response.destroy(error as Error);
    }
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing TCP address");
  return `http://127.0.0.1:${address.port}`;
}

describe("Workflow 4 durable primitives", () => {
  it("executes a real hook and replays the Workflow stream through SSE after disconnect", async () => {
    const run = await start(durableWork, [
      {
        workId: "work-42",
        requiredAuthorityRevision: 7,
        requiredKnowledgeRevision: 12,
      },
    ]);
    expect(run.runId).toMatch(/^wrun_/);
    await waitForHook(run, { token: "answer:work-42" });

    const baseUrl = await startSseAdapter();
    const liveResponse = await fetch(`${baseUrl}/runs/${run.runId}/events`);
    expect(liveResponse.headers.get("content-type")).toContain("text/event-stream");
    const liveReader = liveResponse.body!.getReader();
    const first = await liveReader.read();
    expect(new TextDecoder().decode(first.value)).toContain("accepted");
    await liveReader.cancel();

    await resumeHook("answer:work-42", {
      answer: "synthetic answer",
      currentAuthorityRevision: 7,
      currentKnowledgeRevision: 12,
    });
    await expect(run.returnValue).resolves.toEqual({
      status: "completed",
      workId: "work-42",
      answer: "synthetic answer",
      revisionComparison: { authorityRevision: 7, knowledgeRevision: 12 },
    });
    await expect(run.status).resolves.toBe("completed");

    const replayResponse = await fetch(`${baseUrl}/runs/${run.runId}/events`);
    const replay = await replayResponse.text();
    expect(replayResponse.headers.get("content-type")).toContain("text/event-stream");
    expect(replay).toContain("accepted");
    expect(replay).toContain("completed");
    expect(replay).toContain("authorityRevision\\\":7");
    expect(replay).toContain("knowledgeRevision\\\":12");
  });
});
