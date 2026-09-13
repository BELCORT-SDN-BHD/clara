"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * FOCUS LANDS ON THE FAILURE BANNER, never wherever a state transition
 * dropped it. Extracted (#622 review round) from the identical
 * `bannerRef`/`focusBanner`/`useEffect` triplet that was copy-pasted across
 * `components/login-form.tsx`, `components/entry/password-recovery-form.tsx`
 * and `components/entry/password-reset-form.tsx` — all three disable every
 * input while a submit is pending (appendix D's pending-submit-identity
 * gap), which can silently drop the browser's focus onto `<body>` if the
 * person was still focused in a field when the pending state committed; a
 * failed submit must not leave a keyboard/screen-reader user stranded
 * there.
 *
 * WHY AN EFFECT, NOT A DIRECT `.focus()` CALL FROM THE SUBMIT HANDLER. The
 * target element (a `StateBanner` rendered only on failure) does not exist
 * in the DOM until React commits the render that shows it — calling
 * `.focus()` synchronously inside the submit handler runs before that
 * commit and hits nothing. `requestFocus()` asks for the move as STATE; the
 * effect below carries it out once React has actually painted the target,
 * then resets the flag so a SECOND, later failure re-triggers it (an effect
 * keyed on a boolean that never flips back to `false` would not fire again
 * on a repeat failure).
 *
 * THE SAME SHAPE `signup-legal-stage.tsx`'s own "focus lands on the
 * receipt" rule uses for its accepted-agreement banner — that component
 * keeps its own hand-written copy rather than this hook, because it targets
 * ONE OF SEVERAL banners (a `Map<LegalKind, HTMLDivElement | null>`), which
 * this single-target hook does not shape.
 *
 * Callers keep their own tests: the OBSERVABLE behaviour (focus lands on
 * the banner, not on `<body>`, after a failed submit) is what each
 * component's own test file already pins, and nothing about extracting the
 * mechanism changes what a test can see.
 */
export function useFocusOnFlag<T extends HTMLElement = HTMLDivElement>(): {
  readonly ref: RefObject<T | null>;
  readonly requestFocus: () => void;
} {
  const ref = useRef<T>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!pending) return;
    ref.current?.focus();
    setPending(false);
  }, [pending]);
  return { ref, requestFocus: () => setPending(true) };
}
