// SHARED FIXTURES for the invite courier's two batteries — deliberately NOT a
// `.test.ts` file.
//
// `tests/invite-courier.test.ts` (the ORDERING) and
// `tests/invite-courier-egress.test.ts` (WHAT MAY LEAVE THE PROCESS) drive the
// same handler through the same seams. Importing one test file from the other
// would RE-RUN its cases inside the importer, inflating every count and hiding
// which file actually proved what — the same reasoning
// `components/admin/members-fixtures.ts` records. `scripts/check-test-manifest.mjs`
// globs `*.test.{ts,tsx,js,jsx,mjs,cjs}` and correctly ignores this one, so it
// stays out of the manifest and out of the runner.

import type { CourierDeps } from "../lib/members/courier";
import type { InviteMailer } from "../lib/members/invite-mail";
import type { SessionTokenAccessor } from "@/lib/session";
import type { ServerSession } from "../lib/supabase/server-session";

export const ORIGIN = "http://localhost";
export const PLAINTEXT = "a".repeat(32) + "b".repeat(32);
export const HASHED = "supabase-hashed-token";
export const INVITE_ID = "11111111-1111-4111-8111-111111111111";
export const EXPIRES = "2026-09-06T00:00:00Z";
export const FIRM_A = "f-aaaaaaa";
export const FIRM_B = "f-bbbbbbb";

// The two secret-shaped values are the literal token `PLACEHOLDER`, which is
// what `scripts/check-leaks.mjs` accepts as an EXPLICIT placeholder
// (`SECRET_PLACEHOLDER`, `check-leaks.mjs:40`). A plausible-looking fake like
// "resend-key-for-this-test-only" trips `generic-key-assignment` — correctly, and
// this lane tripped it: a scanner that has to judge whether a key is real is a
// scanner that will one day let a real one through.
export const FULL_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://rig.supabase.test",
  SUPABASE_SERVICE_ROLE_KEY: "PLACEHOLDER",
  RESEND_API_KEY: "PLACEHOLDER",
  INVITE_MAIL_FROM: "Clara <invites@example.test>",
};

// P4-2's fold replaced the lazy accessor with a ONCE-resolved `ServerSession` —
// the raw token plus the subject verified from that same token — so the courier
// calls the door with exactly the bytes step 3 checked. `CALLER_BYTES` is what
// the principal cells assert actually reached the door and the firm read.
export const CALLER_BYTES = "caller-session-bytes";
export const CALLER_SUBJECT = "11111111-1111-4111-8111-111111111111";

export const liveSession = async (): Promise<ServerSession | null> => ({
  accessToken: CALLER_BYTES,
  subject: CALLER_SUBJECT,
});
export const deadSession = async (): Promise<ServerSession | null> => null;

export function post(body: unknown, headers: Record<string, string> = {}, url = `${ORIGIN}/api/invite`): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      origin: ORIGIN,
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** THE OBSERVER. One object records every capability check, every mint and every
 *  send, so "no mail" is a measured zero rather than an absence nobody looked
 *  for. `mintChecks` is the FIND-1 half: the pre-door question is asked with the
 *  same address the door would have been given. */
export type Observer = {
  mintChecks: string[];
  mints: string[];
  sends: { to: string; subject: string; html: string }[];
  mailer: InviteMailer;
};

export function observer(
  opts: {
    sendThrows?: Error;
    mintThrows?: Error;
    /** FIND-1's answer. Default: the address is free. */
    canMint?: { ok: true } | { ok: false; reason: "already_registered" };
    canMintThrows?: Error;
    /** Built from the message the transport was actually handed — the only way to
     *  make a thrown value carry the REAL secrets rather than a lookalike. */
    sendThrowsFrom?: (message: { to: string; subject: string; html: string }) => Error;
  } = {},
): Observer {
  const mintChecks: string[] = [];
  const mints: string[] = [];
  const sends: { to: string; subject: string; html: string }[] = [];
  return {
    mintChecks,
    mints,
    sends,
    mailer: {
      async canMintFor(email: string) {
        mintChecks.push(email);
        if (opts.canMintThrows) throw opts.canMintThrows;
        return opts.canMint ?? { ok: true };
      },
      async mintSupabaseTokenHash(email: string): Promise<string> {
        mints.push(email);
        if (opts.mintThrows) throw opts.mintThrows;
        return HASHED;
      },
      async send(message): Promise<void> {
        sends.push(message);
        if (opts.sendThrowsFrom) throw opts.sendThrowsFrom(message);
        if (opts.sendThrows) throw opts.sendThrows;
      },
    },
  };
}

/** Every door call, INCLUDING its third argument. The `opts` capture is what
 *  turns "a door was called" into "the door was called AS THIS CALLER" — the
 *  egress battery's principal cells read `opts.session` and assert the EXACT
 *  bytes, so a courier that handed the door a second, differently-resolved
 *  accessor cannot pass. */
export type DoorCall = {
  fn: string;
  args: Record<string, unknown>;
  opts: { session: SessionTokenAccessor };
};

export type Rig = {
  deps: CourierDeps;
  calls: DoorCall[];
  /** The token `readFirmContext` was invoked with, once per call. */
  firmReads: string[];
};

export function deps(
  obs: Observer,
  door: { resolve?: unknown; reject?: unknown },
  overrides: Partial<CourierDeps> = {},
): Rig {
  const calls: DoorCall[] = [];
  const firmReads: string[] = [];
  return {
    calls,
    firmReads,
    deps: {
      env: FULL_ENV,
      resolveSession: liveSession,
      newOpKey: () => "op-key-pinned",
      newCorrelationId: () => "corr-pinned",
      readFirmContext: async (s) => {
        firmReads.push((await s.getAccessToken()) ?? "<none>");
        return { firm_id: FIRM_A, firm_name: "ROME PROPERTIES" };
      },
      mailerFor: () => obs.mailer,
      callDoor: async <T,>(
        fn: string,
        args: Record<string, unknown>,
        opts: { session: SessionTokenAccessor },
      ): Promise<T> => {
        calls.push({ fn, args, opts });
        if (door.reject) throw door.reject;
        return door.resolve as T;
      },
      ...overrides,
    },
  };
}

/** TODAY'S REAL RECEIPT. `_finish_op` (`0004:62`) returns `invite_member`'s
 *  `p_result` verbatim, and `0147:421` builds it from `{invite_id, token_hash,
 *  expires_at}` — there is NO `firm_id` in it, which is exactly why the courtesy
 *  firm name is omitted in production (LOW-8). */
export const OK_RECEIPT = {
  invite_id: INVITE_ID,
  token_hash: "not-read-by-the-courier",
  expires_at: EXPIRES,
  token: PLAINTEXT,
};

/** The same receipt as it would look IF the door started naming its firm. Kept
 *  as a separate fixture rather than folded into the one above, so no cell can
 *  quietly assert a field the shipped door does not return. */
export const OK_RECEIPT_WITH_FIRM = { ...OK_RECEIPT, firm_id: FIRM_A };

export async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}
