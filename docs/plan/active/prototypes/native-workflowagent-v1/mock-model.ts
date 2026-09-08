import { WORKFLOW_DESERIALIZE, WORKFLOW_SERIALIZE } from "@ai-sdk/provider-utils";
import { convertArrayToReadableStream, MockLanguageModelV4 } from "ai/test";

type Response =
  | { type: "tool-call"; toolName: string; input: string; finishReason?: "tool-calls" | "content-filter" }
  | { type: "text"; text: string };

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

class SerializableSequenceModel extends MockLanguageModelV4 {
  static [WORKFLOW_SERIALIZE](model: SerializableSequenceModel) {
    return { responses: model.responses };
  }

  static [WORKFLOW_DESERIALIZE](value: { responses: Response[] }) {
    return new SerializableSequenceModel(value.responses);
  }

  constructor(private readonly responses: Response[]) {
    super({
      provider: "clara-comparator",
      modelId: "scripted-no-provider",
      doStream: async options => {
        const index = Math.min(
          options.prompt.filter(message => message.role === "assistant").length,
          responses.length - 1,
        );
        const response = responses[index];
        const prefix: any[] = [
          { type: "stream-start", warnings: [] },
          { type: "response-metadata", id: `response-${index}`, modelId: "scripted-no-provider", timestamp: new Date(0) },
        ];
        const parts: any[] = response.type === "tool-call"
          ? [
              ...prefix,
              { type: "tool-call", toolCallId: `call-${index}`, toolName: response.toolName, input: response.input },
              { type: "finish", finishReason: { unified: response.finishReason ?? "tool-calls", raw: undefined }, usage },
            ]
          : [
              ...prefix,
              { type: "text-start", id: `text-${index}` },
              { type: "text-delta", id: `text-${index}`, delta: response.text },
              { type: "text-end", id: `text-${index}` },
              { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
            ];
        return { stream: convertArrayToReadableStream(parts) };
      },
    });
  }
}

export function scriptedModel(responses: Response[]) {
  return new SerializableSequenceModel(responses);
}
