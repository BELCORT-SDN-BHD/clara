"use client";

// A controlled RM-denominated input that emits whole cents — the same state
// machine as components/journals/use-amount-input.ts (own copy, per this
// domain's file-disjointness: that hook carries no journals-specific logic,
// but keeping every write-surface input local to its own train avoids a
// cross-train import edge for a genuinely small, single-purpose piece).
//
// THE BUG THIS AVOIDS: a naive controlled input whose `value` is RE-DERIVED
// from `cents` every render fights the user mid-keystroke (React's
// `restoreStateOfTarget` resets the DOM node back to the derived string
// whenever a re-render carries the SAME cents value the last keystroke
// produced — "0.50" lands as "5.00"). The fix: hold the RAW TYPED STRING in
// local state, and resync it from `cents` only when `cents` changed for a
// reason OTHER than this component's own last emission.

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

export function useCentsInput(cents: number, onChange: (cents: number) => void) {
  const [raw, setRaw] = useState(() => (cents ? (cents / 100).toFixed(2) : ""));
  const lastEmitted = useRef(cents);

  useEffect(() => {
    if (cents !== lastEmitted.current) {
      setRaw(cents ? (cents / 100).toFixed(2) : "");
      lastEmitted.current = cents;
    }
  }, [cents]);

  function handleChange(value: string) {
    // Debit/credit/allocation cents are unconditionally non-negative — strip a
    // pasted/typed leading minus before it reaches the DB as an unlabeled
    // check-constraint failure.
    const sanitized = value.replace(/-/g, "");
    setRaw(sanitized);
    const parsed = Math.round(Number(sanitized) * 100);
    const next = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    lastEmitted.current = next;
    onChange(next);
  }

  return { raw, handleChange };
}

export function CentsInput({
  cents,
  onChange,
  ariaLabel,
  id,
}: {
  cents: number;
  onChange: (cents: number) => void;
  ariaLabel: string;
  /** Fix round (rev-t2, N2): optional — additive, backward-compatible.
   *  Threading a real `id` lets a caller's `<Label htmlFor>` associate
   *  natively instead of relying on `ariaLabel` alone; every existing
   *  caller that omits it keeps its prior (unset) `id` behaviour unchanged. */
  id?: string;
}) {
  const { raw, handleChange } = useCentsInput(cents, onChange);
  return (
    <Input
      id={id}
      aria-label={ariaLabel}
      type="number"
      step="0.01"
      min="0"
      className="text-right"
      value={raw}
      onChange={(e) => handleChange(e.target.value)}
    />
  );
}
