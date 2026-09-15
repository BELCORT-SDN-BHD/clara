// #798 — the shared pass-bounded condition poll.
//
// Hoisted out of the per-file copies already proven by commit 16cb8c85
// (thread-live-clarify.test.tsx, the onboarding-checklist trio and
// document-facts-table.test.tsx): a `settle()` hop is one real macrotask, and
// polling a named CONDITION across a bounded number of hops reaches an
// arrival the instant it is true, and reads a stall as a stall — never a
// guess about how many hops a mount/door chain needs, and never a wall-clock
// deadline that a slower host or a bigger message bundle can tip (the defect
// #643 hit and #798 exists to retire from the remaining copies).
//
// The bound is on WORK, not on wall-clock time. Every call site keeps its own
// `maxPasses` argument (with a one-line justification at the call site) —
// this file does not silently replace the 200 / 400 pass budgets already
// justified where the idiom was first proven.

export async function settleUntil(
  h: { settle: () => Promise<void> },
  condition: () => boolean,
  label: string,
  maxPasses: number,
  dump?: () => string,
): Promise<void> {
  for (let pass = 0; pass < maxPasses; pass += 1) {
    if (condition()) return;
    await h.settle();
  }
  if (condition()) return;
  throw new Error(
    `${label} never arrived within ${maxPasses} settle passes (a bound on WORK, not on `
    + `wall-clock time — read a red here as a stall, never as a slow host)`
    + (dump ? `\n--- rendered ---\n${dump()}` : ""),
  );
}
