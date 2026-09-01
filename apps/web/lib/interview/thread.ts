// Pure Activity-thread fold for the durable interview. Every entry handed to
// the UI comes from a /state read: plan items for client scope, sanitized
// activity when supplied, and the runtime's current pending prompt.

import type { ActivityEntry, PendingPark, StatePlanItem } from "./api";

export type ThreadEntry = {
  id: string;
  role: "clara" | "you";
  seg?: string;
  phase?: "q" | "c";
  text: string;
  at?: string;
};

/** Render a confirmed answer value. Strings pass through; objects/arrays get
 *  a compact JSON echo. This never recomputes or interprets a governed value. */
export function echoAnswer(answer: unknown): string {
  if (answer == null) return "—";
  if (typeof answer === "string") return answer;
  if (typeof answer === "number" || typeof answer === "boolean") return String(answer);
  try {
    return JSON.stringify(answer);
  } catch {
    return String(answer);
  }
}

const INTERNAL_ITEM_KEYS = new Set(["interview_run"]);

/** Seed from durable client-plan items in their runtime-provided order. */
export function seedThread(items: readonly StatePlanItem[]): ThreadEntry[] {
  const out: ThreadEntry[] = [];
  for (const it of items) {
    if (INTERNAL_ITEM_KEYS.has(it.item_key)) continue;
    if (it.state !== "answered" && it.state !== "resolved") continue;
    if (it.question) out.push({ id: `iq:${it.item_key}`, role: "clara", seg: it.item_key, text: it.question });
    out.push({ id: `ia:${it.item_key}`, role: "you", seg: it.item_key, text: echoAnswer(it.answer) });
  }
  return out;
}

/** Fold sanitized, confirmed activity into thread entries. */
export function activityThread(activity: readonly ActivityEntry[]): ThreadEntry[] {
  return activity.map((a, i) => ({
    id: `act:${a.seg}:${i}`,
    role: "you" as const,
    seg: a.seg,
    text: a.echo,
    at: a.at,
  }));
}

/** Idempotent across polls and across the plan-item/activity projections. */
export function foldActivityThread(log: readonly ThreadEntry[], activity: readonly ActivityEntry[]): ThreadEntry[] {
  const out: ThreadEntry[] = log.slice();
  for (const entry of activityThread(activity)) {
    const dup = out.some((e) => e.id === entry.id || (e.role === "you" && e.seg === entry.seg && e.text === entry.text));
    if (!dup) out.push(entry);
  }
  return out;
}

/** Clara-side entry for the currently open runtime park. */
export function promptEntry(park: PendingPark): ThreadEntry {
  return {
    id: `p:${park.parkIndex}:${park.phase}`,
    role: "clara",
    seg: park.seg,
    phase: park.phase,
    text: park.question,
  };
}

/** Append once by stable id. Always returns a new array. */
export function appendUnique(log: readonly ThreadEntry[], entry: ThreadEntry): ThreadEntry[] {
  return log.some((e) => e.id === entry.id) ? log.slice() : [...log, entry];
}
