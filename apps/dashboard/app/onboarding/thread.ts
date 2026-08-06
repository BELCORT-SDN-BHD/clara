// Pure Activity-style thread model for the interview panel (settled dashboard plan §3.1;
// Linear-session Activity-thread adoption in the research digest). The panel keeps an
// append-only local log; /state provides only the CURRENT pending prompt (the as-built route
// returns one marker, not the full history), so the thread is seeded from the durable plan
// items (client scope) on resume + accumulated locally as the interview advances. No figure,
// no prose parsing of governed values — just the human question → your answer → echo trail.

import type { PendingPark, StatePlanItem, ActivityEntry } from "../shared/interviewApi";

export type ThreadEntry = {
  id: string;
  role: "clara" | "you";
  seg?: string;
  phase?: "q" | "c";
  text: string;
  at?: string;
};

/** Render a confirmed answer value for the "you" side of the thread. Strings pass through;
 *  objects/arrays get a compact JSON echo (never a recomputation). */
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

/** Seed the thread from the durable plan items (client scope resume): each answered/resolved
 *  item becomes a Clara question + your answer pair, in creation order. Items without a human
 *  question (or the internal binding item) are skipped. Firm scope has no plan → seed is []. */
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

/** Fold the pinned activity[] (sanitized confirmed answers) into thread entries — used when a
 *  runtime provides it (firm scope, per the pin). Client scope MAY be [] and relies on seedThread. */
export function activityThread(activity: readonly ActivityEntry[]): ThreadEntry[] {
  return activity.map((a, i) => ({ id: `act:${a.seg}:${i}`, role: "you" as const, seg: a.seg, text: a.echo, at: a.at }));
}

/** Fold the pinned activity[] into an existing thread idempotently. F-M11: a refresh restores
 *  the confirmed-answer trail (firm scope is stream-driven — no plan to seed from), and
 *  re-folding the same activity across polls never duplicates. An activity entry is skipped when
 *  it is already present by id (poll idempotency) OR already shown as an optimistic you-answer for
 *  the same seg with identical text (so the confirmed echo does not double the optimistic bubble).
 *  Returns a new array. */
export function foldActivityThread(log: readonly ThreadEntry[], activity: readonly ActivityEntry[]): ThreadEntry[] {
  const out: ThreadEntry[] = log.slice();
  for (const entry of activityThread(activity)) {
    const dup = out.some((e) => e.id === entry.id || (e.role === "you" && e.seg === entry.seg && e.text === entry.text));
    if (!dup) out.push(entry);
  }
  return out;
}

/** The Clara-side entry for a pending prompt (question or echo-confirm). Stable id per park. */
export function promptEntry(park: PendingPark): ThreadEntry {
  return { id: `p:${park.parkIndex}:${park.phase}`, role: "clara", seg: park.seg, phase: park.phase, text: park.question };
}

/** The your-side optimistic entry when you submit an answer to a park.
 *
 *  `submitId` IS A PER-SUBMIT NONCE, AND IT IS REQUIRED — no default, because a default would
 *  quietly restore the collision it exists to kill. The id used to be `a:<park>:<phase>`, i.e. one
 *  id per PARK, which is wrong twice over: a park is answered as many times as the human tries,
 *  and each try is its own event. A second, DIFFERENT answer at the same park collided with the
 *  first by id, `appendUnique` dropped it, and the human watched their retype produce nothing at
 *  all. The nonce also gives a failed submit an exact handle to roll back by (`removeEntry`) —
 *  removing "the bubble for park N" would take a neighbouring attempt with it. */
export function answerEntry(park: PendingPark, text: string, submitId: string): ThreadEntry {
  return { id: `a:${park.parkIndex}:${park.phase}:${submitId}`, role: "you", seg: park.seg, phase: park.phase, text };
}

/** The your-side breadcrumb for a TYPED delivery (the firm create_firm receipt) — same nonce
 *  discipline as `answerEntry` and for the same two reasons: a retried delivery is a second event
 *  that must render, and a failed one must be removable by its own id. */
export function noteEntry(park: PendingPark, text: string, submitId: string): ThreadEntry {
  return { id: `sys:${park.parkIndex}:${submitId}`, role: "you", seg: park.seg, text };
}

/** Append `entry` iff no entry with its id is already present (idempotent across /state polls
 *  and optimistic re-renders). Returns a new array (never mutates). */
export function appendUnique(log: readonly ThreadEntry[], entry: ThreadEntry): ThreadEntry[] {
  return log.some((e) => e.id === entry.id) ? log.slice() : [...log, entry];
}

/** Drop the entry with `id`, if present. Returns a new array (never mutates).
 *
 *  This is the OPTIMISTIC ROLLBACK. An optimistic bubble is a claim the client has not yet earned;
 *  when the submit throws, the claim is disproven and the bubble has to go, because a thread entry
 *  renders identically whether it was delivered or not — so leaving it says DELIVERED on screen
 *  while the banner beside it says the answer was refused. That contradiction is the same lie
 *  GH #152 told (a dropped answer that looked accepted), one layer up in the UI. */
export function removeEntry(log: readonly ThreadEntry[], id: string): ThreadEntry[] {
  return log.filter((e) => e.id !== id);
}
