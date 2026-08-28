"use client";

// Fix round (rev-t2, F1 — HIGH, accounting): the signed amount field for
// equity_net/obe_plug items — where the SIGN IS the accounting direction
// (`clara._draft_opening_item_core` posts debit when amount<0, credit when
// amount>0). The prior inline field re-derived its displayed string from
// `cents` every render (`(item.amount_cents/100).toFixed(2)`), which fights
// the user mid-keystroke exactly the way staff-advance-money-input.tsx's own
// header names ("5" then "0" landed as "5.000", still 500 cents — typing "50"
// silently books RM5 instead of RM50), used `Number(x)` (imprecise, and
// accepts "1e3"), and stripped nothing — so a leading "-" parsed to NaN,
// silently became `null` via `Number.isFinite` check... except the check
// order meant "-" simply could never compose into a valid negative number: a
// negative amount was UNREACHABLE by keystroke for the one field where the
// sign is the whole point.
//
// Fix: the SAME raw-string-holding pattern staff-advance-money-input.tsx's
// `useCentsInput` already proved (never re-derive `value` from `cents` while
// the user's own last keystroke is still the source of truth), but built on
// `lib/registers/money.ts`'s `parseAmountToCents` — the shared, BigInt-based,
// SIGNED parser this repo already ships and documents as the fix for exactly
// this class of bug (that file's own header cites the identical failure).
// `parseAmountToCents` allows a leading "-", refuses "1e3" (its regex has no
// exponent arm), and returns `null` for "" or "-" alone — never coerced to 0
// (unlike the unsigned CentsInput, where "" legitimately means "no entry yet
// on a line" and 0 is a safe default; a SIGNED accounting amount has no safe
// default direction, so `null` propagates as "not a number yet", exactly
// `parseAmountToCents`'s own contract).

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { parseAmountToCents } from "@/lib/registers/money";

export function useSignedAmountInput(cents: number | null, onChange: (cents: number | null) => void) {
  const [raw, setRaw] = useState(() => (cents === null ? "" : (cents / 100).toFixed(2)));
  const lastEmitted = useRef(cents);

  useEffect(() => {
    if (cents !== lastEmitted.current) {
      setRaw(cents === null ? "" : (cents / 100).toFixed(2));
      lastEmitted.current = cents;
    }
  }, [cents]);

  function handleChange(value: string) {
    setRaw(value);
    const parsed = parseAmountToCents(value);
    lastEmitted.current = parsed;
    onChange(parsed);
  }

  return { raw, handleChange };
}

export function SignedAmountInput({
  id,
  cents,
  onChange,
}: {
  id?: string;
  cents: number | null;
  onChange: (cents: number | null) => void;
}) {
  const { raw, handleChange } = useSignedAmountInput(cents, onChange);
  return <Input id={id} inputMode="decimal" placeholder="0.00" value={raw} onChange={(e) => handleChange(e.target.value)} />;
}
