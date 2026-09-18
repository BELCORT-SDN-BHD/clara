"use client";

import { useChat } from "@ai-sdk/react";
import { createChat } from "@shadcn/helpers/ai-sdk";
import { lastAssistantMessageIsCompleteWithToolCalls, type UIMessage } from "ai";
import {
  Bot,
  BriefcaseBusiness,
  Check,
  FileText,
  RotateCcw,
  Sparkles,
  Square,
  UserRound,
  X,
} from "lucide-react";
import * as React from "react";

import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment";
import { Badge } from "@/components/ui/badge";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import { Message, MessageAvatar, MessageContent, MessageHeader } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import {
  Questionnaire,
  QuestionnaireActions,
  QuestionnaireChoice,
  QuestionnaireChoiceDescription,
  QuestionnaireChoices,
  QuestionnaireDescription,
  QuestionnaireError,
  QuestionnaireItem,
  QuestionnaireSubmit,
  QuestionnaireTitle,
} from "@/components/ui/questionnaire";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ChatWorkItem = {
  id: string;
  title: string;
  summary: string;
};

type SupplierTools = {
  askSupplier: {
    input: {
      workId: string;
      question: string;
    };
    output: {
      supplierId: string;
      supplierName: string;
      source: "shared-work-answer";
    };
  };
};

type ClaraDemoMessage = UIMessage<unknown, Record<string, never>, SupplierTools>;

export type NativeClaraChatProps = {
  item: ChatWorkItem;
  answered: boolean;
  onAnswer: () => void;
  conversation: number;
  freshConversation: boolean;
  onNewChat?: () => void;
  onClose?: () => void;
};

const MAJU_WORK_ID = "WORK-2409";
const SUPPLIER_OUTPUT: SupplierTools["askSupplier"]["output"] = {
  supplierId: "SUP-MAJU-001",
  supplierName: "Maju Industrial Sdn. Bhd.",
  source: "shared-work-answer",
};

const supplierQuestions = [
  {
    name: "supplier",
    required: true,
    prompt: "这份账单应关联哪个供应商？",
    description:
      "来源只有简称 “Maju Industrial”，没有注册号或银行资料；当前客户知识无法唯一验证是否为同一主体。",
    choices: [
      {
        value: SUPPLIER_OUTPUT.supplierId,
        label: SUPPLIER_OUTPUT.supplierName,
        description: "现有供应商记录",
      },
      {
        value: "keep-pending",
        label: "暂时无法确认",
        description: "不提交答案，这项工作继续等待",
      },
    ],
  },
] as const;

function createMajuDemo(workId: string) {
  return createChat<ClaraDemoMessage>({
    messageIdPrefix: `clara-${workId.toLowerCase()}`,
    toolCallIdPrefix: "supplier-question",
  })
    .user("请继续处理这份 Maju Industrial 账单。", {
      id: `${workId}-demo-request`,
      files: [
        {
          filename: "Maju_Bill_1488.pdf",
          mediaType: "application/pdf",
          url: "data:application/pdf;base64,",
        },
      ],
    })
    .assistant(({ writer }) => {
      writer.text("我已核对账单和当前客户知识。 来源缺少足以唯一验证供应商身份的资料。 需要你确认一次。", {
        delayMs: 180,
      });
      writer.tool("askSupplier", {
        title: "确认供应商身份",
        input: {
          workId,
          question: supplierQuestions[0].prompt,
        },
      });
    })
    .assistant(({ writer, toolCall }) => {
      if (toolCall?.name === "askSupplier" && toolCall.output) {
        writer.text(`已采用 ${toolCall.output.supplierName} 作为这项工作的回答。`, {
          delayMs: 34,
        });
        writer.text("处理流程可以继续核对第 3 份文件；这项本地演示不会写入账簿。", {
          delayMs: 34,
        });
      }
    });
}

function WorkBasis({ item, answered }: { item: ChatWorkItem; answered: boolean }) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <Marker>
        <MarkerIcon>
          <BriefcaseBusiness />
        </MarkerIcon>
        <MarkerContent>当前工作 · {item.id}</MarkerContent>
      </Marker>
      <div className="flex flex-col gap-1">
        <p className="font-medium">{item.title}</p>
        <p className="text-sm leading-6 text-muted-foreground">{item.summary}</p>
      </div>
      {item.id === MAJU_WORK_ID && answered ? (
        <Marker role="status" variant="border">
          <MarkerIcon>
            <Check />
          </MarkerIcon>
          <MarkerContent>已确认事实：供应商为 {SUPPLIER_OUTPUT.supplierName}</MarkerContent>
        </Marker>
      ) : null}
      {item.id === MAJU_WORK_ID ? (
        <Attachment state="done" size="sm">
          <AttachmentMedia>
            <FileText />
          </AttachmentMedia>
          <AttachmentContent>
            <AttachmentTitle>Maju_Bill_1488.pdf</AttachmentTitle>
            <AttachmentDescription>原始账单 · 第 1 页，共 1 页</AttachmentDescription>
          </AttachmentContent>
        </Attachment>
      ) : (
        <Marker variant="border">
          <MarkerContent>来源和已完成结果仍保留在工作详情中。</MarkerContent>
        </Marker>
      )}
    </div>
  );
}

function SupplierQuestion({
  toolCallId,
  state,
  answered,
  onSubmit,
}: {
  toolCallId: string;
  state:
    | "input-streaming"
    | "input-available"
    | "approval-requested"
    | "approval-responded"
    | "output-available"
    | "output-error"
    | "output-denied";
  answered: boolean;
  onSubmit: (toolCallId: string, answer: string) => void;
}) {
  const [keptPending, setKeptPending] = React.useState(false);

  if (state === "input-streaming") {
    return (
      <Marker role="status">
        <MarkerIcon>
          <Sparkles />
        </MarkerIcon>
        <MarkerContent>正在整理需要确认的信息…</MarkerContent>
      </Marker>
    );
  }

  if (state === "output-available" || answered) {
    return (
      <Marker role="status" variant="border">
        <MarkerIcon>
          <Check />
        </MarkerIcon>
        <MarkerContent>已从同一项工作同步：{SUPPLIER_OUTPUT.supplierName}</MarkerContent>
      </Marker>
    );
  }

  if (state === "output-error" || state === "output-denied") {
    return (
      <Bubble variant="destructive">
        <BubbleContent>回答尚未保存，请在工作详情中重试。</BubbleContent>
      </Bubble>
    );
  }

  if (state === "approval-requested" || state === "approval-responded") {
    return null;
  }

  return (
    <Bubble variant="outline" className="max-w-full">
      <BubbleContent className="w-full">
        <Questionnaire
          items={supplierQuestions}
          onSubmit={(event) => {
            event.preventDefault();
            const answer = new FormData(event.currentTarget).get("supplier");
            if (answer === "keep-pending") {
              setKeptPending(true);
              return;
            }
            if (typeof answer === "string") {
              setKeptPending(false);
              onSubmit(toolCallId, answer);
            }
          }}
        >
          <QuestionnaireItem name="supplier" required>
            <QuestionnaireTitle>{supplierQuestions[0].prompt}</QuestionnaireTitle>
            <QuestionnaireDescription>{supplierQuestions[0].description}</QuestionnaireDescription>
            <QuestionnaireChoices>
              {supplierQuestions[0].choices.map((choice) => (
                <QuestionnaireChoice key={choice.value} value={choice.value}>
                  <span className="font-medium">{choice.label}</span>
                  <QuestionnaireChoiceDescription>{choice.description}</QuestionnaireChoiceDescription>
                </QuestionnaireChoice>
              ))}
            </QuestionnaireChoices>
            <QuestionnaireError />
          </QuestionnaireItem>
          <QuestionnaireActions>
            <QuestionnaireSubmit>确认选择</QuestionnaireSubmit>
          </QuestionnaireActions>
          {keptPending ? (
            <Marker role="status">
              <MarkerContent>尚未提交供应商答案；这项工作保持待答。</MarkerContent>
            </Marker>
          ) : null}
        </Questionnaire>
      </BubbleContent>
    </Bubble>
  );
}

function ChatMessage({
  message,
  answered,
  onQuestionSubmit,
}: {
  message: ClaraDemoMessage;
  answered: boolean;
  onQuestionSubmit: (toolCallId: string, answer: string) => void;
}) {
  const isUser = message.role === "user";
  const files = message.parts.filter((part) => part.type === "file");

  return (
    <Message align={isUser ? "end" : "start"}>
      <MessageAvatar aria-hidden="true">{isUser ? <UserRound /> : <Bot />}</MessageAvatar>
      <MessageContent>
        <MessageHeader>{isUser ? "你" : "Clara"}</MessageHeader>
        {message.parts.map((part, index) => {
          if (part.type === "text") {
            return (
              <Bubble key={`${message.id}-text-${index}`} variant={isUser ? "default" : "muted"} align={isUser ? "end" : "start"}>
                <BubbleContent>{part.text}</BubbleContent>
              </Bubble>
            );
          }

          if (part.type === "tool-askSupplier") {
            return (
              <SupplierQuestion
                key={part.toolCallId}
                toolCallId={part.toolCallId}
                state={part.state}
                answered={answered}
                onSubmit={onQuestionSubmit}
              />
            );
          }

          return null;
        })}
        {files.length > 0 ? (
          <AttachmentGroup>
            {files.map((part, index) => (
              <Attachment key={`${message.id}-file-${index}`} state="done" size="xs">
                <AttachmentMedia>
                  <FileText />
                </AttachmentMedia>
                <AttachmentContent>
                  <AttachmentTitle>{part.filename ?? "账单附件"}</AttachmentTitle>
                  <AttachmentDescription>{part.mediaType}</AttachmentDescription>
                </AttachmentContent>
              </Attachment>
            ))}
          </AttachmentGroup>
        ) : null}
      </MessageContent>
    </Message>
  );
}

function NativeClaraChatSession({
  item,
  answered,
  onAnswer,
  conversation,
  freshConversation,
  onNewChat,
  onClose,
}: NativeClaraChatProps) {
  const demo = React.useMemo(() => createMajuDemo(item.id), [item.id]);
  const resolvedToolCalls = React.useRef(new Set<string>());
  const { messages, sendMessage, addToolOutput, status, stop, error } = useChat<ClaraDemoMessage>({
    id: `local-${item.id}-${conversation}`,
    messages: demo.get(0),
    transport: demo.transport({ delayMs: 34 }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  });
  const isBusy = status === "submitted" || status === "streaming";
  const nextMessage = demo.next(messages);
  const pendingSupplierCall = messages
    .flatMap((message) => message.parts)
    .find((part) => part.type === "tool-askSupplier" && part.state === "input-available");

  const submitToolOutput = React.useCallback(
    (toolCallId: string) => {
      if (resolvedToolCalls.current.has(toolCallId)) return;
      resolvedToolCalls.current.add(toolCallId);
      void addToolOutput({
        tool: "askSupplier",
        toolCallId,
        output: SUPPLIER_OUTPUT,
      });
    },
    [addToolOutput],
  );

  React.useEffect(() => {
    if (answered && pendingSupplierCall?.type === "tool-askSupplier") {
      submitToolOutput(pendingSupplierCall.toolCallId);
    }
  }, [answered, pendingSupplierCall, submitToolOutput]);

  const handleQuestionSubmit = React.useCallback(
    (toolCallId: string, answer: string) => {
      if (
        answer !== SUPPLIER_OUTPUT.supplierId ||
        answered ||
        resolvedToolCalls.current.has(toolCallId)
      ) {
        return;
      }
      resolvedToolCalls.current.add(toolCallId);
      onAnswer();
      void addToolOutput({
        tool: "askSupplier",
        toolCallId,
        output: SUPPLIER_OUTPUT,
      });
    },
    [addToolOutput, answered, onAnswer],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border p-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-medium">
            <Bot />
            <span>Clara</span>
            <Badge variant="outline">交互原型 · 合成数据</Badge>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">对话 {conversation} · {item.id}</p>
        </div>
        <div className="flex items-center gap-1">
          {onNewChat ? (
            <Button variant="ghost" size="sm" onClick={onNewChat}>
              <RotateCcw data-icon="inline-start" />
              新对话
            </Button>
          ) : null}
          {onClose ? (
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="关闭 Clara">
              <X />
            </Button>
          ) : null}
        </div>
      </div>

      <Tabs defaultValue="conversation" className="min-h-0 flex-1 gap-0">
        <TabsList variant="line" aria-label="Clara 侧栏视图" className="mx-4 mt-2">
          <TabsTrigger value="conversation">对话</TabsTrigger>
          <TabsTrigger value="basis">工作依据</TabsTrigger>
        </TabsList>
        <TabsContent value="conversation" className="min-h-0">
          <div className="flex h-full min-h-0 flex-col">
            <MessageScrollerProvider autoScroll defaultScrollPosition="end" scrollPreviousItemPeek={48}>
              <MessageScroller className="min-h-0 flex-1">
                <MessageScrollerViewport>
                  <MessageScrollerContent className="p-4">
                    <MessageScrollerItem messageId={`${item.id}-context`}>
                      <Marker variant="separator">
                        <MarkerContent>
                          {freshConversation
                            ? `新对话已开始；${item.id} 的工作依据和回答仍保留。`
                            : `当前关联 ${item.id}；对话不会替代工作记录。`}
                        </MarkerContent>
                      </Marker>
                    </MessageScrollerItem>
                    {messages.map((message) => (
                      <MessageScrollerItem
                        key={message.id}
                        messageId={message.id}
                        scrollAnchor={message.role === "user"}
                      >
                        <ChatMessage
                          message={message}
                          answered={answered}
                          onQuestionSubmit={handleQuestionSubmit}
                        />
                      </MessageScrollerItem>
                    ))}
                    {isBusy ? (
                      <MessageScrollerItem messageId={`${item.id}-streaming`}>
                        <Marker role="status">
                          <MarkerIcon>
                            <Sparkles />
                          </MarkerIcon>
                          <MarkerContent>Clara 正在回复…</MarkerContent>
                        </Marker>
                      </MessageScrollerItem>
                    ) : null}
                    {error ? (
                      <MessageScrollerItem messageId={`${item.id}-error`}>
                        <Bubble variant="destructive">
                          <BubbleContent>演示回复中断了，请开始新的对话后重试。</BubbleContent>
                        </Bubble>
                      </MessageScrollerItem>
                    ) : null}
                  </MessageScrollerContent>
                </MessageScrollerViewport>
                <MessageScrollerButton aria-label="跳到最新消息" />
              </MessageScroller>
            </MessageScrollerProvider>

            <div className="border-t border-border p-3">
              {isBusy ? (
                <Button variant="outline" className="w-full" onClick={() => void stop()}>
                  <Square data-icon="inline-start" />
                  停止回复
                </Button>
              ) : item.id === MAJU_WORK_ID && nextMessage ? (
                <Button className="w-full" onClick={() => void sendMessage(nextMessage)}>
                  <Sparkles data-icon="inline-start" />
                  继续处理
                </Button>
              ) : (
                <p className="text-center text-xs leading-5 text-muted-foreground">
                  {answered ? "当前问题已在同一项工作中回答。" : "可在工作详情中继续处理这项工作。"}
                </p>
              )}
            </div>
          </div>
        </TabsContent>
        <TabsContent value="basis" className="min-h-0 overflow-y-auto">
          <WorkBasis item={item} answered={answered} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function NativeClaraChat(props: NativeClaraChatProps) {
  return <NativeClaraChatSession key={`${props.item.id}:${props.conversation}`} {...props} />;
}
