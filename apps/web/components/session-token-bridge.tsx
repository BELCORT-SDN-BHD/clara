"use client";

import { useEffect } from "react";

import { getSessionToken } from "@/lib/session";
import { configureSessionTokenSource } from "@/lib/session-accessor";

/**
 * P2 FOLD SEAM F: plugs the real Supabase session (`lib/session.ts`'s
 * `getSessionToken`) into the blessed `sessionTokenAccessor` singleton
 * (`lib/session-accessor.ts`) exactly once, at app-wiring time — every
 * card/rail/wire call site that imports that singleton reads through this from
 * here on. Mounted in the ROOT layout so every surface (pre- and post-auth) is
 * covered; renders nothing itself.
 */
export function SessionTokenBridge() {
  useEffect(() => {
    configureSessionTokenSource(getSessionToken);
  }, []);

  return null;
}
