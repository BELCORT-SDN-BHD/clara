"use client";

// FIX-3 (independent review): extracted out of entry-lines-editor.tsx's
// AmountInput so the actual state machine — not just the JSX wrapper — is
// independently testable via test/hookHarness.ts (see
// use-amount-input.test.ts's own header for the property this proves).
//
// THE BUG THIS EXISTS TO KILL: a naive controlled input whose `value` is
// RE-DERIVED from `cents` on every render (`(cents/100).toFixed(2)`) fights
// the user mid-keystroke — React's `restoreStateOfTarget` resets the DOM node
// back to the derived string whenever the parent re-renders with the SAME
// cents value the last keystroke produced, discarding every digit after the
// first (typing "0.50" lands as "5.00"; "1234.56" lands as "1.00" — an
// internally-balanced but silently WRONG entry that passes every DB gate,
// since the DB only checks balance, never "did this look like what the human
// meant"). The fix: hold the RAW TYPED STRING in local state, and resync it
// from `cents` ONLY when `cents` changed for a reason OTHER than this
// component's own last emission (`lastEmitted` ref) — e.g. the parent reset
// the whole line array (FIX-5's revision-token key).

import { useEffect, useRef, useState } from "react";

export function useAmountInput(cents: number, onChange: (cents: number) => void) {
  const [raw, setRaw] = useState(() => (cents ? (cents / 100).toFixed(2) : ""));
  const lastEmitted = useRef(cents);

  useEffect(() => {
    if (cents !== lastEmitted.current) {
      setRaw(cents ? (cents / 100).toFixed(2) : "");
      lastEmitted.current = cents;
    }
  }, [cents]);

  function handleChange(value: string) {
    // N9 (independent review): strip a pasted/typed leading minus BEFORE it
    // ever reaches the DB — debit/credit cents are unconditionally >= 0
    // (0003_books_core.sql's `ck_jl_one_side`); a raw negative would surface
    // as an unlabeled Postgres check-constraint failure instead of an honest
    // client-side non-event.
    const sanitized = value.replace(/-/g, "");
    setRaw(sanitized);
    const parsed = Math.round(Number(sanitized) * 100);
    const next = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    lastEmitted.current = next;
    onChange(next);
  }

  return { raw, handleChange };
}
