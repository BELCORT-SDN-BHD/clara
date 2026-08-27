"use client";

// A THIN observer around lib/parts/hooks.ts's useHydratedPart — NOT a second
// hydrate-never-trust implementation. useHydratedPart's own PartHydrationState
// only ever carries a message STRING for a plain ReadError/DoorError (its
// `clr` field is reserved for a real governed DoorRefusal) — the coarse
// `WireErrorKind` (no_session/forbidden/not_found/…) a read failed with is
// discarded before it ever reaches a card. This build's mission asks for
// DISTINCT no_session/forbidden/not_found renderings, which needs that kind —
// so this module wraps a loader to CAPTURE it via `instanceof` (never by
// pattern-matching the message text — AGENTS.md's "spelling is not
// identity") and re-throws the SAME error unchanged, so useHydratedPart's own
// mount/reload/act mechanism, its err/clr state, and its sticky-refusal
// behaviour are all completely untouched.

import { useCallback, useState } from "react";
import { isReadError } from "../read";
import { isDoorError } from "../doors";
import type { WireErrorKind } from "../wire-error-kind";

export function useReadErrKind(): {
  kind: WireErrorKind | null;
  wrap: <T>(loader: () => Promise<T>) => Promise<T>;
} {
  const [kind, setKind] = useState<WireErrorKind | null>(null);

  const wrap = useCallback(<T,>(loader: () => Promise<T>): Promise<T> => {
    return loader().then(
      (v) => {
        setKind(null);
        return v;
      },
      (e: unknown) => {
        if (isReadError(e) || isDoorError(e)) setKind(e.kind);
        else setKind(null);
        throw e; // unchanged — useHydratedPart classifies it exactly as before
      },
    );
  }, []);

  return { kind, wrap };
}
