"use client";

// E-2 / CB-AE2E-018 (the owner: "Activity — agent task 的 component 没有内容,
// 没有交互? only cancel?"). `listCancellableAgentTasks` selects ELEVEN columns
// (lib/coding/reads.ts:137) and the panel rendered THREE — kind, status and
// created_at. The other seven were read on every load and thrown away: a
// `failed` task showed the word Failed and nothing about why, when
// `error_code` was already on the row, and no task was attributed to a client.
//
// THIS DRAWER RENDERS THOSE SEVEN AND NOTHING ELSE. Every value below is a
// column of `clara.agent_tasks_visible` (0006_runtime_core.sql:684-694 for the
// view, :138-158 for the base table). Nothing is derived, summed or inferred.
//
// TWO THINGS THE ORDER ASKED FOR THAT THIS READ CANNOT HONESTLY GIVE, both
// stated in the drawer rather than faked:
//
//   · A RECEIPT LINK. Receipts are written per agent ACT into
//     `clara.agent_receipts_visible` (a nine-arm union — lib/firm/reads.ts's
//     header), and NOTHING joins a task id to the receipts that task produced:
//     the 19-column receipt contract (0103:258-277) carries `trigger_kind` and
//     `trigger_id`, but no read exposes a task→receipt lookup and this surface
//     holds no such door. A "receipt" link would be a guess.
//   · AN ATTEMPT COUNTER. There is none. The base table carries
//     `workflow_run_id` and `origin_intent_id`, and the MASKED view publishes
//     neither (0006:684-694 — `trace_id` is explicitly withheld). So the drawer
//     names the absence once instead of rendering an always-empty row.
//
// THE CHAT THREAD IS AN IDENTIFIER, NOT A LINK, and that is fail-closed rather
// than lazy. `session_id` is a `clara.chat_sessions` id, and that table is
// "private-by-default; author-stamped" (0006:122-124) — a task started by
// another member points at a thread this caller may not be able to open, and
// nothing on this row says which. The route `/clients/<id>/clara/<threadId>`
// exists, so the link would resolve and then fail to load: exactly the
// "promises a destination it cannot deliver" shape lib/firm/needs-you-links.ts
// was written to prevent. The CLIENT link is different and is offered: clients
// are firm-scoped and every member of this firm reads the register.

import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { NotBuiltNote } from "@/components/common/not-built-note";
import { businessDateTime } from "@/lib/business-date";
import { shortId } from "@/lib/registers/money";
import type { AgentTaskErrorCode, AgentTaskRow } from "@/lib/coding/types";

/** The `error_code` CHECK, verbatim and in the base table's own order
 *  (0006_runtime_core.sql:154-156). A checked lookup, never a cast: a code
 *  outside this set renders through `errorCodeRaw` with its own raw value —
 *  honest, never a next-intl key path. */
const KNOWN_ERROR_CODES: readonly AgentTaskErrorCode[] = [
  "model_error", "tool_error", "timeout", "engine_lost", "limit", "internal",
];

function isKnownErrorCode(code: string): code is AgentTaskErrorCode {
  return (KNOWN_ERROR_CODES as readonly string[]).includes(code);
}

export function AgentTaskDetail({
  task,
  kindLabel,
  statusLabel,
}: {
  task: AgentTaskRow;
  /** The panel's OWN checked kind/status lookups, passed in rather than
   *  re-derived here — one label map per vocabulary, not two that can drift. */
  kindLabel: string;
  statusLabel: string;
}) {
  const t = useTranslations("CodingQuestionsSignals.agentTasks");
  const [open, setOpen] = useState(false);
  const code = task.error_code;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" size="sm" variant="outline" />}>
        {t("detailTrigger")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("detailTitle")}</DialogTitle>
          <DialogDescription>{t("detailDescription")}</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">{t("kindLabel")}</dt>
          <dd className="text-foreground">{kindLabel}</dd>

          <dt className="text-muted-foreground">{t("statusLabel")}</dt>
          <dd className="text-foreground">{statusLabel}</dd>

          <dt className="text-muted-foreground">{t("clientLabel")}</dt>
          <dd className="text-foreground">
            {task.client_id ? (
              <Link href={`/clients/${task.client_id}`} className="text-primary underline-offset-4 hover:underline">
                {t("clientLink")}
              </Link>
            ) : (
              <span className="text-muted-foreground">{t("clientNone")}</span>
            )}
          </dd>

          <dt className="text-muted-foreground">{t("sessionLabel")}</dt>
          <dd className="text-foreground">
            {task.session_id ? (
              <span className="font-mono text-xs">{shortId(task.session_id)}</span>
            ) : (
              <span className="text-muted-foreground">{t("sessionNone")}</span>
            )}
          </dd>

          <dt className="text-muted-foreground">{t("createdByLabel")}</dt>
          <dd className="font-mono text-xs text-foreground">{shortId(task.created_by)}</dd>

          <dt className="text-muted-foreground">{t("startedLabel")}</dt>
          <dd className="text-foreground">{businessDateTime(task.created_at)}</dd>

          <dt className="text-muted-foreground">{t("updatedLabel")}</dt>
          <dd className="text-foreground">{businessDateTime(task.updated_at)}</dd>

          {task.cancelled_at ? (
            <>
              <dt className="text-muted-foreground">{t("cancelledAtLabel")}</dt>
              <dd className="text-foreground">{businessDateTime(task.cancelled_at)}</dd>
            </>
          ) : null}
          {task.cancelled_by ? (
            <>
              <dt className="text-muted-foreground">{t("cancelledByLabel")}</dt>
              <dd className="font-mono text-xs text-foreground">{shortId(task.cancelled_by)}</dd>
            </>
          ) : null}

          <dt className="text-muted-foreground">{t("errorLabel")}</dt>
          {/* THE WHOLE POINT OF THE DRAWER: a failed task said "Failed" and
              nothing else, while `error_code` sat on the row unread. The code
              renders verbatim beside a sentence a professional can act on. */}
          <dd className="text-foreground">
            {code === null ? (
              <span className="text-muted-foreground">{t("errorNone")}</span>
            ) : (
              <>
                <span className="font-mono text-xs">{code}</span>{" "}
                {isKnownErrorCode(code) ? t(`errorCodes.${code}`) : t("errorCodeRaw", { code })}
              </>
            )}
          </dd>
        </dl>
        <p className="max-w-prose text-xs text-muted-foreground">{t("sessionNote")}</p>
        <NotBuiltNote className="text-xs">{t("receiptNotBuilt")}</NotBuiltNote>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>{t("detailClose")}</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
