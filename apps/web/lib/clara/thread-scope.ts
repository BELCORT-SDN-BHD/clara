import type { ChatSessionRow } from "@/lib/firm-admin/chat-sharing";

/** A client URL may render only a positively-seen session at that same altitude. */
export function sessionBelongsToClient(
  session: ChatSessionRow | null,
  clientId: string,
): session is ChatSessionRow {
  return session !== null && session.client_id === clientId;
}
