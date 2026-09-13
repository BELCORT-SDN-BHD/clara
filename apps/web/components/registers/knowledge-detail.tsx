"use client";

// The client Knowledge register — C13's DETAIL half (#644, migration
// 0192_client_knowledge_records.sql).
//
// WHAT A DETAIL IS FOR HERE: the current value with everything that qualifies it
// (kind, scope, trust, applicability, effective window, source), the REVISION
// TIMELINE that says who changed it and why, and the two governed acts that
// produce the next revision — Correct and Withdraw.
//
// A CORRECTION IS A REVISION, NOT AN EDIT, and this surface is built around that
// fact rather than decorating it: there is no "edit" affordance, the reason is a
// required field (the door refuses a blank one, CLR10
// `knowledge_reason_required`), and the prior value never leaves the page — it
// moves down into the timeline.
//
// HYDRATE-NEVER-TRUST: every act reloads BOTH reads afterwards and renders what
// came back; nothing here paints the value it just sent.

import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DataState, ErrorMessage } from "@/components/firm/data-state";
import { StateBanner } from "@/components/common/state";
import { SectionHeader } from "@/components/common/section-header";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { businessDateTime } from "@/lib/business-date";
import {
  correctKnowledge,
  loadKnowledgeHistory,
  loadKnowledgeRecord,
  withdrawKnowledge,
  type KnowledgeRecordRow,
} from "@/lib/registers/knowledge";
import { ArApCounterpartyDoorDialog } from "./ArApCounterpartyDoorDialog";
import {
  KnowledgeApplicability,
  KnowledgeBadges,
  KnowledgeProvenance,
  KnowledgeSourceBlock,
  knowledgeValueText,
} from "./knowledge-shared";

/** Parse what the human typed back into the jsonb shape the CATALOG types this
 *  key as. The shape comes from the database's own `value_shape`, never from
 *  guessing at the current value — a key is typed whether or not a record of it
 *  exists yet.
 *
 *  Returns the parsed value, or an error TOKEN (never a thrown exception and
 *  never a coerced value): appendix C's field rule is "preserve user input; do
 *  not change amount/date semantics to make validation pass". */
export function parseKnowledgeValue(shape: string, raw: string): { ok: true; value: unknown } | { ok: false; reason: "number" | "boolean" | "json" | "empty" } {
  const text = raw.trim();
  if (text === "") return { ok: false, reason: "empty" };
  if (shape === "number") {
    const n = Number(text);
    return Number.isFinite(n) ? { ok: true, value: n } : { ok: false, reason: "number" };
  }
  if (shape === "boolean") {
    if (text === "true" || text === "false") return { ok: true, value: text === "true" };
    return { ok: false, reason: "boolean" };
  }
  if (shape === "object") {
    try {
      const parsed: unknown = JSON.parse(text);
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, reason: "json" };
      return { ok: true, value: parsed };
    } catch {
      return { ok: false, reason: "json" };
    }
  }
  return { ok: true, value: text };
}

/** The value as the correction field should first show it — the CURRENT value,
 *  in the spelling the field parses back. */
export function knowledgeValueDraft(shape: string, value: unknown): string {
  if (shape === "object") return JSON.stringify(value ?? {}, null, 2);
  if (value === null || value === undefined) return "";
  return String(value);
}

export function KnowledgeDetail({ clientId, recordId }: { clientId: string; recordId: string }) {
  const t = useTranslations("ClientKnowledge");
  const detail = useAsyncRead(() => loadKnowledgeRecord(recordId, { session: sessionTokenAccessor }));
  const history = useAsyncRead(() => loadKnowledgeHistory(recordId, { session: sessionTokenAccessor }));
  const record = detail.data?.record ?? null;
  const shape = detail.data?.key.value_shape ?? "string";

  const [draft, setDraft] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [withdrawReason, setWithdrawReason] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);

  const value = draft ?? (record ? knowledgeValueDraft(shape, record.value) : "");

  async function runCorrection(): Promise<boolean> {
    if (!record) return false;
    const parsed = parseKnowledgeValue(shape, value);
    if (!parsed.ok) {
      // The field error sits BY the control and the typed text survives — the
      // door is never called with something it would only refuse.
      setFieldError(t(`valueError.${parsed.reason}` as "valueError.json"));
      return false;
    }
    setFieldError(null);
    const ok = await detail.act(async () => {
      await correctKnowledge(
        { recordId: record.record_id, value: parsed.value, reason },
        { session: sessionTokenAccessor },
      );
    });
    await history.reload();
    if (ok) { setDraft(null); setReason(""); }
    return ok;
  }

  async function runWithdrawal(): Promise<boolean> {
    if (!record) return false;
    const ok = await detail.act(async () => {
      await withdrawKnowledge(
        { recordId: record.record_id, reason: withdrawReason },
        { session: sessionTokenAccessor },
      );
    });
    await history.reload();
    if (ok) setWithdrawReason("");
    return ok;
  }

  return (
    <div className="flex flex-col gap-4">
      <Link className="w-fit text-xs underline underline-offset-4" href={`/clients/${clientId}/knowledge`}>
        {t("backToRegister")}
      </Link>

      <DataState loading={detail.loading} error={detail.error} isEmpty={false} emptyMessage={t("empty")}>
        {record ? (
          <div className="flex flex-col gap-4">
            <section className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-card-foreground">{record.knowledge_key}</span>
                <KnowledgeBadges record={record} />
              </div>
              {detail.data?.key.description ? (
                <p className="text-xs text-muted-foreground">{detail.data.key.description}</p>
              ) : null}
              <p className="text-base text-card-foreground">{knowledgeValueText(record.value)}</p>
              {record.state === "withdrawn" ? (
                <StateBanner tone="neutral" title={t("withdrawnTitle")}>
                  {t("withdrawnBody", { reason: record.revision_reason ?? "" })}
                </StateBanner>
              ) : null}
              <KnowledgeApplicability record={record} />
              <KnowledgeProvenance record={record} />
              <KnowledgeSourceBlock clientId={clientId} source={record.source} sourceKind={record.source_kind} />
              <p className="text-xs text-muted-foreground">
                {t("versionLabel", { version: String(record.knowledge_version ?? 0) })}
              </p>
            </section>

            {/* The standing refusal lives OUTSIDE the dialogs, so it survives one
                closing and the reload that always follows (doors.ts's law). */}
            {detail.error ? <ErrorMessage error={detail.error} /> : null}

            {record.state === "withdrawn" ? null : (
              <div className="flex flex-wrap gap-2">
                <ArApCounterpartyDoorDialog
                  triggerLabel={t("correctTrigger")}
                  title={t("correctTitle", { key: record.knowledge_key })}
                  description={t("correctDescription")}
                  confirmLabel={t("correctConfirm")}
                  busy={detail.busy}
                  confirmDisabled={reason.trim() === ""}
                  onConfirm={runCorrection}
                >
                  <div className="flex flex-col gap-2">
                    <label className="flex flex-col gap-1 text-xs" htmlFor="knowledge-correct-value">
                      {t("correctValueLabel")}
                      {shape === "object" ? (
                        <Textarea
                          id="knowledge-correct-value"
                          aria-label={t("correctValueLabel")}
                          aria-invalid={fieldError !== null}
                          value={value}
                          onChange={(e) => { setDraft(e.target.value); setFieldError(null); }}
                        />
                      ) : (
                        <Input
                          id="knowledge-correct-value"
                          aria-label={t("correctValueLabel")}
                          aria-invalid={fieldError !== null}
                          value={value}
                          onChange={(e) => { setDraft(e.target.value); setFieldError(null); }}
                        />
                      )}
                    </label>
                    {fieldError ? <p className="text-xs text-error">{fieldError}</p> : null}
                    <label className="flex flex-col gap-1 text-xs" htmlFor="knowledge-correct-reason">
                      {t("correctReasonLabel")}
                      <Textarea
                        id="knowledge-correct-reason"
                        aria-label={t("correctReasonLabel")}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                    </label>
                  </div>
                </ArApCounterpartyDoorDialog>

                <ArApCounterpartyDoorDialog
                  triggerLabel={t("withdrawTrigger")}
                  triggerVariant="destructive"
                  title={t("withdrawTitle", { key: record.knowledge_key })}
                  description={t("withdrawDescription")}
                  confirmLabel={t("withdrawConfirm")}
                  confirmVariant="destructive"
                  busy={detail.busy}
                  confirmDisabled={withdrawReason.trim() === ""}
                  onConfirm={runWithdrawal}
                >
                  <label className="flex flex-col gap-1 text-xs" htmlFor="knowledge-withdraw-reason">
                    {t("withdrawReasonLabel")}
                    <Textarea
                      id="knowledge-withdraw-reason"
                      aria-label={t("withdrawReasonLabel")}
                      value={withdrawReason}
                      onChange={(e) => setWithdrawReason(e.target.value)}
                    />
                  </label>
                </ArApCounterpartyDoorDialog>
              </div>
            )}
          </div>
        ) : null}
      </DataState>

      <section className="flex flex-col gap-2">
        <SectionHeader level={2}>{t("historyHeading")}</SectionHeader>
        <DataState
          loading={history.loading}
          error={history.error}
          isEmpty={(history.data?.revisions ?? []).length === 0}
          emptyMessage={t("historyEmpty")}
        >
          <ol className="flex flex-col gap-2">
            {(history.data?.revisions ?? []).map((rev) => (
              <RevisionRow key={rev.revision_id} rev={rev} />
            ))}
          </ol>
        </DataState>
      </section>
    </div>
  );
}

function RevisionRow({ rev }: { rev: KnowledgeRecordRow }) {
  const t = useTranslations("ClientKnowledge");
  return (
    <li className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-medium">{t("revisionLabel", { n: rev.revision_n })}</span>
        <span className="text-xs text-muted-foreground">
          {t(`revisionKind.${rev.revision_kind}` as "revisionKind.capture")}
        </span>
        <span className="text-card-foreground">{knowledgeValueText(rev.value)}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("revisionBy", {
          who: rev.asserted_by_name ?? rev.asserted_by,
          at: businessDateTime(rev.recorded_at),
        })}
      </p>
      {rev.revision_reason ? (
        <p className="text-xs text-muted-foreground">{t("revisionReason", { reason: rev.revision_reason })}</p>
      ) : null}
    </li>
  );
}
