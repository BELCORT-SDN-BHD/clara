// #636 — the intake batch's two GOVERNED WRITES, and why neither is a PostgREST RPC.
//
// `clara.open_intake_batch` and `clara.cancel_intake_batch` are granted to `clara_runtime` and to
// NOBODY else (0229's tail asserts it), exactly like `clara.create_document_intake`
// (0007:2780-2799). The reason is structural rather than stylistic: both take their ACTOR as an
// argument and recheck that human's live membership for themselves, because
// `clara._human_ctx` reads a JWT the runtime pool does not carry (0004:299-309). So the browser
// reaches them through the runtime's own authenticated routes, which decode the session JWT in
// Node and pass the human on — `apps/web/lib/work/api.ts:467-471` states the same thing about
// `clara.cancel_accounting_work`, and this is that rule's second instance.
//
// ONE CONFIRM PERFORMS EXACTLY ONE GOVERNED CALL. `POST /api/runtime/intake/batches/:id/cancel`
// makes ONE decision; the FAN-OUT — one `clara.cancel_accounting_work` per live child, one call
// per transaction — is the SERVER's. A dialog that issued N calls would be the shape
// `components/documents/DocumentsDoorDialog.tsx:8-9` forbids, and a half-finished N would leave a
// batch nobody could reason about.

import { safeRuntimeFetch, expectRuntimeOk } from "./runtime-wire";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import type { SessionTokenAccessor } from "@/lib/session";

type Opts = { session?: SessionTokenAccessor; signal?: AbortSignal };

async function requireToken(opts: Opts): Promise<string> {
  const session = opts.session ?? sessionTokenAccessor;
  const token = await session.getAccessToken();
  if (!token) throw new Error("not signed in — no live session");
  return token;
}

export type OpenBatchRequest = {
  label: string;
  origin?: "documents_tab" | "chat" | "firm_documents";
  sessionId?: string;
  /** ONE key per open decision, minted by the caller (`useDecisionKey`'s idiom). */
  opKey: string;
};

export type OpenBatchResponse = {
  batch_id: string;
  label: string;
  origin: string;
  state: string;
  opened_at: string | null;
  replayed?: boolean;
};

export async function openIntakeBatch(req: OpenBatchRequest, opts: Opts = {}): Promise<OpenBatchResponse> {
  const token = await requireToken(opts);
  const origin = req.origin ?? "documents_tab";
  const res = await safeRuntimeFetch(
    "/api/runtime/intake/batches",
    {
      method: "POST",
      cache: "no-store",
      redirect: "manual", // never silently follow a 307-to-/login (runtime-wire.ts's own note)
      signal: opts.signal,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        label: req.label,
        origin,
        ...(origin === "chat" ? { session_id: req.sessionId } : {}),
        opKey: req.opKey,
      }),
    },
    "open intake batch",
  );
  await expectRuntimeOk(res, "open intake batch");
  return (await res.json()) as OpenBatchResponse;
}

export type CancelBatchResponse = {
  batch_id: string;
  state: string;
  cancel_op_key: string;
  cancel_requested_by: string;
  children: { member_id: string; work_id: string }[];
  fanned_out: number;
  deferred: number;
  refused: number;
};

/** ONE press, ONE governed decision. The op key is the DECISION's identity: pressing again under
 *  the same key is a byte-identical replay, and a DIFFERENT key against a batch that is already
 *  stopping is refused CLR13 `batch_already_cancelling` by name — so a second press can never
 *  re-key the children mid-flight. */
export async function cancelIntakeBatch(
  batchId: string,
  opKey: string,
  opts: Opts = {},
): Promise<CancelBatchResponse> {
  const token = await requireToken(opts);
  const res = await safeRuntimeFetch(
    `/api/runtime/intake/batches/${encodeURIComponent(batchId)}/cancel`,
    {
      method: "POST",
      cache: "no-store",
      redirect: "manual",
      signal: opts.signal,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ opKey }),
    },
    "cancel intake batch",
  );
  await expectRuntimeOk(res, "cancel intake batch");
  return (await res.json()) as CancelBatchResponse;
}
