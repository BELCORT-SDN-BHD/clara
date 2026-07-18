// Transcript part rendering (contract §4.8): text parts as prose; tool parts as
// a chip (name + running/ok/error); clarify parts as a distinct card that labels
// firm visibility (§0.5) and carries the answer box. Also the live-chunk reducer
// that assembles AI SDK fullStream chunks into Clara-shaped parts while streaming
// (the persisted parts from the terminal `message` event stay the authority).

import type { FormEvent } from "react";
import { useState } from "react";
import type { ClaraPart } from "./api";
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

export function TranscriptParts({ parts, clarify }: { parts: ClaraPart[]; clarify?: ClarifyControls }) {
  const statuses = toolStatuses(parts);
  const clarifyAt = clarify ? lastClarifyIndex(parts) : -1;
  return (
    <>
      {parts.map((p, i) => {
        if (p.type === "text") {
          return p.text.trim() ? <p key={i} className={styles.prose}>{p.text}</p> : null;
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
        return null; // tool_result / tool_error resolve their call's chip
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
