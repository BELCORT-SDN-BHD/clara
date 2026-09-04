"use client";

// One coordinator per mounted Clara thread. The ref-backed guard closes the
// pre-render double-click window synchronously; `busy` is the shared rendered
// state every action-bearing PartSlot consumes. Caller identity is admitted
// only after an exact-one, fully shaped `clara.caller_context` read;
// ../../components/parts/v16-action-round2.test.tsx:282 pins `limit=2` so an
// ambiguous context remains observable instead of being truncated into one.
//
// P6-5: the read, the shape guard and the `limit=2` exact-one rule now live in
// lib/identity/caller-context.ts, shared with the ⌘K "Do" allowlist. Two independently
// typed copies of an identity guard is the failure review law 3 exists to catch — one
// widens, the other does not, and the one that widened is the one that grants an act.
// Nothing about this provider's behaviour changed: same relation, same select, same
// `limit=2`, same exact-one-or-null verdict.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { exactlyOneCallerContext, loadCallerContextRows } from "@/lib/identity/caller-context";
import type { SessionTokenAccessor } from "@/lib/session";
import { useHydratedPart } from "./hooks";
import { createSingleFireGuard, runOnce as runSingleFire } from "./single-fire-guard";

type ThreadActionCoordinator = {
  busy: boolean;
  callerId: string | null;
  runOnce: (fn: (callerId: string) => Promise<void>) => Promise<boolean>;
};

const unavailableCoordinator: ThreadActionCoordinator = {
  busy: false,
  callerId: null,
  runOnce: async () => false,
};

const ThreadActionContext = createContext<ThreadActionCoordinator>(unavailableCoordinator);

export function ThreadActionCoordinatorProvider({
  session,
  children,
}: {
  session: SessionTokenAccessor;
  children: ReactNode;
}) {
  const caller = useHydratedPart(session, loadCallerContextRows);
  const guardRef = useRef(createSingleFireGuard());
  const [busy, setBusy] = useState(false);

  const callerId = exactlyOneCallerContext(caller.data ?? [])?.user_id ?? null;

  const runOnce = useCallback(
    (fn: (trustedCallerId: string) => Promise<void>) => {
      if (callerId === null) return Promise.resolve(false);
      // CB-AE2E-004 widened `runOnce` to report `{ran, value}`; this coordinator's
      // own contract is unchanged — it reports RE-ENTRANCY (`ran`), which is the
      // only fact its callers (the thread action cards) read.
      return runSingleFire(guardRef.current, async () => {
        setBusy(true);
        try {
          await fn(callerId);
        } finally {
          setBusy(false);
        }
      }).then((outcome) => outcome.ran);
    },
    [callerId],
  );

  const value = useMemo(() => ({ busy, callerId, runOnce }), [busy, callerId, runOnce]);
  return <ThreadActionContext.Provider value={value}>{children}</ThreadActionContext.Provider>;
}

export function useThreadActionCoordinator(): ThreadActionCoordinator {
  return useContext(ThreadActionContext);
}

export type ThreadActionName =
  | "resolve-firm-question"
  | "dismiss-firm-question"
  | "adopt-close-proposal"
  | "withdraw-close-proposal"
  | "acknowledge-sweep-run";

export function normalizeThreadActionText(value: string): string {
  return value.trim();
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Stateless operation identity. Human prose appears only inside the first
 * SHA-256 input; the returned key embeds no reason/resolution text. The second
 * digest binds the positively read actor, object, action and intent digest.
 */
export async function threadActionOpKey(args: {
  callerId: string;
  objectType: "firm-question" | "close-proposal" | "sweep-run";
  objectId: string;
  action: ThreadActionName;
  intent?: readonly (string | null)[];
}): Promise<string> {
  const normalizedIntent = (args.intent ?? []).map((value) =>
    typeof value === "string" ? normalizeThreadActionText(value) : null,
  );
  const intentDigest = await sha256Hex(JSON.stringify(normalizedIntent));
  const operationDigest = await sha256Hex(JSON.stringify([
    args.callerId,
    args.objectType,
    args.objectId,
    args.action,
    intentDigest,
  ]));
  return `thread:${args.action}:${operationDigest}`;
}
