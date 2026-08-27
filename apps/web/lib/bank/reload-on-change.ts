"use client";

// lib/parts/hooks.ts's own documented CONSUMER CONTRACT (review note N6): "A
// NEW loader identity alone never re-triggers hydration any more — only a
// null<->present session transition does... A card whose captured ids
// CHANGE (e.g. the user picks a different document) must be React-`key`ed
// by those ids (unmount/remount), or call reload() itself on the change."
//
// Every dependent read this build's UI has (an account picker driving a
// statement list, a selected statement driving its line detail, a
// counterparty driving its open items, …) captures a changing id inside its
// loader closure — exactly the case the contract calls out. This hook is
// THAT reload() call, written once, so every dependent read applies the
// SAME fix rather than seven independent, driftable copies of the same
// effect (the review culture this repo already applies to a second copy of
// a guard, applied here to a second copy of a re-fetch trigger).
//
// Skips the very first render deliberately: the hook's OWN mount effect has
// already loaded with whatever value `dep` holds at mount — re-triggering
// immediately after would be a harmless but wasted duplicate fetch, not a
// correctness fix. Only a LATER change (the id genuinely became available,
// or the user picked something else) calls `reload()`.

import { useEffect, useRef } from "react";

// N4 fix (independent review): `dep` is a React effect dependency compared
// by `Object.is` — a primitive is exactly right, but `unknown` would also
// silently accept an array/Set/object, which `Object.is` compares by
// REFERENCE, not value, reopening the exact re-fetch-storm class this hook
// exists to close (a freshly-built array/Set is a new reference every
// render, so the effect would fire on EVERY render, not just a real
// change). Every current call site already passes a string id, so this is
// a compile-time fence, not a behaviour change.
export function useReloadOnChange(reload: () => void, dep: string | number | boolean | null | undefined): void {
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    reload();
    // `dep` is deliberately the ONLY trigger — this project's eslint config
    // does not register react-hooks/exhaustive-deps (hooks.ts's own header
    // notes the same), so no suppression comment is needed. `reload` is
    // read fresh every render via the closure, never itself a dependency
    // (it is typically a fresh `() => void hook.reload()` per render).
  }, [dep]);
}
