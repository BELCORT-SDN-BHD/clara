"use client";

// One coordinator per mounted Clara thread. The ref-backed guard closes the
// pre-render double-click window synchronously; `busy` is the shared rendered
// state every action-bearing PartSlot consumes. Caller identity is admitted
// only after an exact-one, fully shaped `clara.caller_context` read.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { getRows } from "@/lib/read";
import type { SessionTokenAccessor } from "@/lib/session";
import { useHydratedPart } from "./hooks";
import { createSingleFireGuard, runOnce as runSingleFire } from "./single-fire-guard";

const CALLER_CONTEXT_SELECT = "user_id,firm_id,firm_name,role,role_rank,is_operator";
const FIRM_ROLES = ["viewer", "bookkeeper", "admin", "owner"] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CallerContextRow = {
  user_id: string;
  firm_id: string;
  firm_name: string;
  role: string;
  role_rank: number | null;
  is_operator: boolean;
};

function isCallerContextRow(row: unknown): row is CallerContextRow {
  if (typeof row !== "object" || row === null) return false;
  const value = row as Record<string, unknown>;
  return typeof value.user_id === "string"
    && UUID_RE.test(value.user_id)
    && typeof value.firm_id === "string"
    && UUID_RE.test(value.firm_id)
    && typeof value.firm_name === "string"
    && value.firm_name.length > 0
    && typeof value.role === "string"
    && (FIRM_ROLES as readonly string[]).includes(value.role)
    && (value.role_rank === null || Number.isInteger(value.role_rank))
    && typeof value.is_operator === "boolean";
}

function loadCallerContext(session: SessionTokenAccessor): Promise<CallerContextRow[]> {
  return getRows<CallerContextRow>("caller_context", {
    select: CALLER_CONTEXT_SELECT,
    limit: 2,
    session,
  });
}

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
  const caller = useHydratedPart(session, loadCallerContext);
  const guardRef = useRef(createSingleFireGuard());
  const [busy, setBusy] = useState(false);

  const row = caller.data?.[0];
  const callerId = caller.data?.length === 1 && isCallerContextRow(row) ? row.user_id : null;

  const runOnce = useCallback(
    (fn: (trustedCallerId: string) => Promise<void>) => {
      if (callerId === null) return Promise.resolve(false);
      return runSingleFire(guardRef.current, async () => {
        setBusy(true);
        try {
          await fn(callerId);
        } finally {
          setBusy(false);
        }
      });
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
