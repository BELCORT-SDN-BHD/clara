// Transcript part rendering (contract §4.8): text parts as prose; tool parts as
// a chip (name + running/ok/error); clarify parts as a distinct card that labels
// firm visibility (§0.5) and carries the answer box. Also the live-chunk reducer
// that assembles AI SDK fullStream chunks into Clara-shaped parts while streaming
// (the persisted parts from the terminal `message` event stay the authority).

import type { FormEvent } from "react";
import { useState } from "react";
import type { ClaraPart } from "./api";
import { isStatusResolverType } from "./partCatalog";
import { JeReviewCard } from "./JeReviewCard";
import { DocReviewCard } from "../shared/cards/DocReviewCard";
import { DiffCard } from "../shared/cards/DiffCard";
import { SweepReceiptCard } from "../shared/cards/SweepReceiptCard";
import { KbRuleProposalCard } from "../shared/cards/KbRuleProposalCard";
import { OpenQuestionCard } from "../shared/cards/OpenQuestionCard";
import { RulePostReceiptCard } from "../shared/cards/RulePostReceiptCard";
import { BankReconReceiptCard } from "../shared/cards/BankReconReceiptCard";
import { BankRuleProposalCard } from "../shared/cards/BankRuleProposalCard";
import { FixedAssetCard } from "../shared/cards/FixedAssetCard";
import { DepreciationRunReceiptCard } from "../shared/cards/DepreciationRunReceiptCard";
import { AdjustmentRunReceiptCard } from "../shared/cards/AdjustmentRunReceiptCard";
import { StaffAdvanceCard } from "../shared/cards/StaffAdvanceCard";
import styles from "./chat.module.css";

/** Matches CLARIFY_FRAMING in the runtime (chatTurn.prompt.ts:31) — used only for
 *  clarify parts assembled live from chunks; persisted parts carry their own. */
const CLARIFY_FRAMING_FALLBACK = "This question and its answer are visible to your firm.";

export type LiveTranscript = { parts: ClaraPart[]; textIndex: Record<string, number>; streamError: string | null };

export const emptyLive = (): LiveTranscript => ({ parts: [], textIndex: {}, streamError: null });

function firstString(...vals: unknown[]): string | null {
  for (const v of vals) if (typeof v === "string") return v;
  return null;
}

/** Fold one SSE `chunk` (an AI SDK fullStream part) into the live transcript.
 *  Defensive on field names; unknown chunk types are ignored. */
export function applyChunk(prev: LiveTranscript, raw: unknown): LiveTranscript {
  const c = (raw ?? {}) as Record<string, unknown>;
  const type = typeof c.type === "string" ? c.type : "";

  if (type === "text-delta") {
    const delta = firstString(c.delta, c.textDelta, c.text);
    if (delta === null) return prev;
    const id = firstString(c.id) ?? "_text";
    const parts = prev.parts.slice();
    const textIndex = { ...prev.textIndex };
    const at = textIndex[id];
    const existing = at !== undefined ? parts[at] : undefined;
    if (existing && existing.type === "text") {
      parts[at as number] = { type: "text", text: existing.text + delta };
    } else {
      textIndex[id] = parts.length;
      parts.push({ type: "text", text: delta });
    }
    return { ...prev, parts, textIndex };
  }

  if (type === "tool-call") {
    const tool = firstString(c.toolName) ?? "tool";
    const id = firstString(c.toolCallId) ?? `call_${prev.parts.length}`;
    const input = c.input ?? c.args ?? null;
    if (tool === "clarify") {
      const q = (input ?? {}) as { question?: unknown; context?: unknown };
      return {
        ...prev,
        parts: [
          ...prev.parts,
          {
            type: "clarify",
            tool_call_id: id,
            question: String(q.question ?? ""),
            context: typeof q.context === "string" ? q.context : undefined,
            framing: CLARIFY_FRAMING_FALLBACK,
          },
        ],
      };
    }
    return { ...prev, parts: [...prev.parts, { type: "tool_call", tool, tool_call_id: id, input }] };
  }

  if (type === "tool-result") {
    const tool = firstString(c.toolName) ?? "tool";
    const id = firstString(c.toolCallId) ?? "";
    return { ...prev, parts: [...prev.parts, { type: "tool_result", tool, tool_call_id: id, output: c.output ?? c.result ?? null }] };
  }

  if (type === "tool-error") {
    const tool = firstString(c.toolName) ?? "tool";
    const id = firstString(c.toolCallId) ?? "";
    return { ...prev, parts: [...prev.parts, { type: "tool_error", tool, tool_call_id: id, error: String(c.error ?? "tool error") }] };
  }

  if (type === "error") {
    const e = c.error;
    const msg = typeof e === "string" ? e : ((e as { message?: string })?.message ?? JSON.stringify(e ?? "stream error"));
    return { ...prev, streamError: msg };
  }

  return prev; // start/finish/step markers, reasoning, etc.
}

// ---------------------------------------------------------------------------
// Rendering.
// ---------------------------------------------------------------------------

export type ClarifyControls = {
  interruptionId: string | null; // null = looking it up (or PostgREST unconfigured)
  answered: boolean;
  busy: boolean;
  error: string | null;
  expiresAt: string | null;
  onAnswer: (text: string) => void;
};

// Slice-5: re-derive persisted attachment chips on hydrate (D-4/D-5). The part
// carries only ids; this optional lookup (from document_intakes_visible) enriches
// the chip with the filename + current status. Absent lookup ⇒ ids only.
export type AttachmentInfo = { filename?: string | null; status?: string | null };
export type AttachmentLookup = Map<string, AttachmentInfo>;

// Honest-state law (contract §3, INTERFACE-PINS §4): Slice-6 chatTurn_v2 PERCEIVES
// the attachment in-turn (reads the stored extraction via read_document), so the
// chip copy states that plainly. Supersedes DELTA-OWNER-2's non-perception copy
// (ADR-018(3) anticipated exactly this reversal).
export const ATTACHMENT_PERCEPTION_COPY = "Clara reads this document during this turn.";

/** The explicit fallback for an unknown/unsupported part type — closes the Slice-5
 *  silent-drop (`return null`) where a new wire type just vanished. The parity test
 *  asserts registered render types NEVER reach this. */
export const FALLBACK_UNSUPPORTED_PREFIX = "Unsupported part: ";

type ToolStatus = "running" | "ok" | "error";

/** A tool_call's chip status is resolved by a later tool_result / tool_error. */
function toolStatuses(parts: ClaraPart[]): Map<string, ToolStatus> {
  const m = new Map<string, ToolStatus>();
  for (const p of parts) {
    if (p.type === "tool_call") m.set(p.tool_call_id, "running");
    else if (p.type === "tool_result") m.set(p.tool_call_id, "ok");
    else if (p.type === "tool_error") m.set(p.tool_call_id, "error");
  }
  return m;
}

function lastClarifyIndex(parts: ClaraPart[]): number {
  for (let i = parts.length - 1; i >= 0; i--) if (parts[i]!.type === "clarify") return i;
  return -1;
}

export function TranscriptParts({
  parts,
  clarify,
  attachments,
  token,
}: {
  parts: ClaraPart[];
  clarify?: ClarifyControls;
  attachments?: AttachmentLookup;
  token?: string | null; // je_review actions need the human-lane JWT (omitted in the parity test)
}) {
  const statuses = toolStatuses(parts);
  const clarifyAt = clarify ? lastClarifyIndex(parts) : -1;
  return (
    <>
      {parts.map((p, i) => {
        if (p.type === "text") {
          return p.text.trim() ? <p key={i} className={styles.prose}>{p.text}</p> : null;
        }
        if (p.type === "attachment") {
          const info = attachments?.get(p.intake_id);
          const label = info?.filename || "Attached document";
          return (
            <div key={i} className={styles.attachmentChip}>
              <div className={styles.attachmentRow}>
                <span className={styles.attachmentIcon} aria-hidden>📎</span>
                <span className={styles.attachmentName}>{label}</span>
                {info?.status ? <span className={styles.attachmentStatus}>{info.status}</span> : null}
              </div>
              <p className={styles.attachmentNote}>{ATTACHMENT_PERCEPTION_COPY}</p>
            </div>
          );
        }
        if (p.type === "tool_call") {
          const s = statuses.get(p.tool_call_id) ?? "running";
          return (
            <span key={i} className={`${styles.chip} ${styles[`chip_${s}`]}`}>
              {p.tool} · {s}
            </span>
          );
        }
        if (p.type === "clarify") {
          return <ClarifyCard key={i} question={p.question} context={p.context ?? null} framing={p.framing} controls={i === clarifyAt ? clarify : undefined} />;
        }
        if (p.type === "clarify_closed") {
          return (
            <div key={i} className={styles.clarifyCard}>
              <div className={styles.clarifyBadge}>Visible to your firm</div>
              <p className={styles.clarifyClosed}>Clarify {p.reason}. {p.framing}</p>
            </div>
          );
        }
        if (p.type === "je_review") {
          // Hydration law (§6): the card carries ids only and re-derives authoritative
          // state via get_draft_review. No live-chunk branch is needed — the card
          // renders from the authoritative terminal message (N-F16).
          return <JeReviewCard key={`je:${p.entry_id}:${i}`} token={token ?? null} part={p} />;
        }
        if (p.type === "refusal") {
          // A typed terminal refusal (C-19): the code + message render VERBATIM; the
          // card never re-derives (there is no draft to hydrate).
          return (
            <div key={i} className={styles.refusalCard}>
              <div className={styles.refusalBadge}>{p.code}{p.reason ? ` · ${p.reason}` : ""}</div>
              <p className={styles.refusalMessage}>{p.message}</p>
            </div>
          );
        }
        // Wave-A parts (contract §9): identifier-only; each card hydrates on mount.
        if (p.type === "doc_review") {
          return <DocReviewCard key={`doc_review:${p.entry_id}:${i}`} token={token ?? null} part={p} />;
        }
        if (p.type === "diff") {
          return <DiffCard key={`diff:${p.entry_id}:${i}`} token={token ?? null} part={p} />;
        }
        if (p.type === "sweep_receipt") {
          return <SweepReceiptCard key={`sweep:${p.run_id}:${i}`} token={token ?? null} part={p} />;
        }
        if (p.type === "kb_rule_proposal") {
          return <KbRuleProposalCard key={`rule:${p.rule_id}:${i}`} token={token ?? null} part={p} />;
        }
        if (p.type === "open_question") {
          return <OpenQuestionCard key={`question:${p.question_id}:${i}`} token={token ?? null} part={p} />;
        }
        // Wave-A2 (contract §6.4/§7): the posted-by-rule receipt; identifier-only, the
        // card hydrates the rule_post_runs receipt on mount (like sweep_receipt).
        if (p.type === "rule_post_receipt") {
          return <RulePostReceiptCard key={`rulepost:${p.run_id}:${i}`} token={token ?? null} part={p} />;
        }
        // Wave C-c (design v2.1 §7): identifier-only; each card hydrates on mount
        // (bank_recon_receipt keys on statement_id — parts.ts explains why).
        if (p.type === "bank_recon_receipt") {
          return <BankReconReceiptCard key={`recon:${p.statement_id}:${i}`} token={token ?? null} part={p} />;
        }
        if (p.type === "bank_rule_proposal") {
          return <BankRuleProposalCard key={`bankrule:${p.rule_id}:${i}`} token={token ?? null} part={p} />;
        }
        // Wave D-a (design v2.1 §6/§7): identifier-only; each card hydrates on
        // mount via get_fixed_asset / get_depreciation_run.
        if (p.type === "fixed_asset") {
          return <FixedAssetCard key={`fa:${p.asset_id}:${i}`} token={token ?? null} part={p} />;
        }
        if (p.type === "depreciation_run_receipt") {
          return <DepreciationRunReceiptCard key={`farun:${p.run_id}:${i}`} token={token ?? null} part={p} />;
        }
        // Wave D-b (design §2.7/§2.8/§3.4/§7): identifier-only; each card
        // hydrates on mount via get_adjustment_run / get_staff_advance.
        if (p.type === "adjustment_run_receipt") {
          return <AdjustmentRunReceiptCard key={`adjrun:${p.run_id}:${i}`} token={token ?? null} part={p} />;
        }
        if (p.type === "staff_advance") {
          return <StaffAdvanceCard key={`adv:${p.advance_id}:${i}`} token={token ?? null} part={p} />;
        }
        // tool_result / tool_error resolve their call's chip — render nothing (the
        // one place this is declared is partCatalog's STATUS_RESOLVER_TYPES).
        if (isStatusResolverType(p.type)) return null;
        // Explicit fallback: an unknown/unsupported part type is made VISIBLE (closes
        // the Slice-5 silent-drop). The parity test asserts registered render types
        // never reach here.
        return (
          <span key={i} className={styles.unsupportedChip}>
            {FALLBACK_UNSUPPORTED_PREFIX}{(p as { type?: string }).type ?? "?"}
          </span>
        );
      })}
    </>
  );
}

function ClarifyCard({ question, context, framing, controls }: { question: string; context: string | null; framing: string; controls?: ClarifyControls }) {
  const [text, setText] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (controls && text.trim()) controls.onAnswer(text.trim());
  };
  return (
    <div className={styles.clarifyCard}>
      <div className={styles.clarifyBadge}>Visible to your firm</div>
      <p className={styles.clarifyQuestion}>{question}</p>
      {context ? <p className={styles.clarifyContext}>{context}</p> : null}
      <p className={styles.clarifyFraming}>{framing}</p>
      {controls ? (
        controls.answered ? (
          <p className={styles.clarifyClosed}>Answer submitted — Clara is resuming.</p>
        ) : controls.interruptionId ? (
          <form onSubmit={submit} className={styles.clarifyForm}>
            <textarea
              className={styles.clarifyInput}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Your answer (visible to your firm)"
              rows={2}
            />
            <button type="submit" className={styles.button} disabled={controls.busy || !text.trim()}>
              {controls.busy ? "Sending…" : "Answer"}
            </button>
            {controls.expiresAt ? <span className={styles.muted}>expires {new Date(controls.expiresAt).toLocaleString()}</span> : null}
            {controls.error ? <span className={styles.errorText}>{controls.error}</span> : null}
          </form>
        ) : (
          <p className={styles.muted}>Looking up the pending question… (needs NEXT_PUBLIC_SUPABASE_URL)</p>
        )
      ) : null}
    </div>
  );
}
