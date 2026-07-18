"use client";

// The Slice-4 plumbing chat page (contract §4.8). EXPLICITLY not the Phase-4
// design build — plain, unstyled-but-tidy proof of the wire format end-to-end.
// Dev auth: a pasted Supabase session JWT (sessionStorage only), sent as Bearer
// to both lanes. Governance acts (answer/cancel/share) go dashboard → PostgREST,
// never through the runtime (§4.2 governance law).

import { useCallback, useEffect, useRef, useState } from "react";
import {
  answerInterruption,
  cancelTask,
  createSession,
  getMessages,
  jwtSub,
  listSessions,
  liveTasks,
  pendingInterruption,
  postTurn,
  runtimeBase,
  shareSession,
  streamTask,
  supabaseBase,
  taskById,
  type ClaraPart,
  type MessageRow,
  type SessionRow,
} from "./api";
import { applyChunk, emptyLive, TranscriptParts, type ClarifyControls, type LiveTranscript } from "./parts";
import styles from "./chat.module.css";

const TOKEN_KEY = "clara_dev_jwt";
const TERMINAL = new Set(["completed", "failed", "cancelled", "expired"]);

type Live = { taskId: string; status: string; t: LiveTranscript };
type Clarify = { interruptionId: string | null; answered: boolean; busy: boolean; error: string | null; expiresAt: string | null };

export default function ChatPage() {
  const [token, setToken] = useState("");
  const [tokenDraft, setTokenDraft] = useState("");
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [live, setLive] = useState<Live | null>(null);
  const [clarify, setClarify] = useState<Clarify | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState("");
  const [creating, setCreating] = useState(false);
  const streamAbort = useRef<AbortController | null>(null);
  const mySub = token ? jwtSub(token) : null;

  useEffect(() => {
    const t = sessionStorage.getItem(TOKEN_KEY) ?? "";
    setToken(t);
    setTokenDraft(t);
  }, []);

  useEffect(() => () => streamAbort.current?.abort(), []);

  const refreshSessions = useCallback(async (tok: string) => {
    try {
      setSessions(await listSessions(tok));
    } catch (err) {
      setSessions([]);
      setBanner((err as Error).message);
    }
  }, []);

  useEffect(() => {
    if (token) void refreshSessions(token);
  }, [token, refreshSessions]);

  const refreshMessages = useCallback(
    async (sessionId: string) => {
      try {
        setMessages(await getMessages(token, sessionId));
      } catch (err) {
        setBanner((err as Error).message);
      }
    },
    [token],
  );

  // The interruption id is discovered on the HUMAN lane (agent_interruptions is
  // firm-readable). Written slightly after the clarify chunk streams, so retry.
  const refreshClarify = useCallback(
    async (taskId: string) => {
      setClarify({ interruptionId: null, answered: false, busy: false, error: null, expiresAt: null });
      if (!supabaseBase()) return;
      for (let i = 0; i < 5; i++) {
        try {
          const row = await pendingInterruption(token, taskId);
          if (row) {
            setClarify({ interruptionId: row.id, answered: false, busy: false, error: null, expiresAt: row.expires_at });
            return;
          }
        } catch (err) {
          setClarify((c) => c && { ...c, error: (err as Error).message });
          return;
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
    },
    [token],
  );

  const finishTurn = useCallback(
    async (taskId: string, sessionId: string, status: string, errorCode?: string | null) => {
      let code = errorCode ?? null;
      if (status !== "completed" && code === null && supabaseBase()) {
        code = (await taskById(token, taskId).catch(() => null))?.error_code ?? null;
      }
      setNote(status === "completed" ? null : `Task ${status}${code ? ` (${code})` : ""}.`);
      setLive(null);
      setClarify(null);
      await refreshMessages(sessionId);
    },
    [token, refreshMessages],
  );

  const attachStream = useCallback(
    async (taskId: string, sessionId: string) => {
      streamAbort.current?.abort();
      const ctrl = new AbortController();
      streamAbort.current = ctrl;
      setLive({ taskId, status: "streaming", t: emptyLive() });
      try {
        for await (const ev of streamTask(token, taskId, ctrl.signal)) {
          if (ctrl.signal.aborted) return;
          if (ev.event === "chunk") {
            const c = ev.data as { type?: string; toolName?: string };
            if (c?.type === "tool-call" && c.toolName === "clarify") void refreshClarify(taskId);
            setLive((l) => (l && l.taskId === taskId ? { ...l, t: applyChunk(l.t, ev.data) } : l));
          } else if (ev.event === "message") {
            const d = ev.data as { status?: string; parts?: ClaraPart[] | null };
            setLive((l) =>
              l && l.taskId === taskId
                ? { ...l, status: d.status ?? l.status, t: d.parts ? { parts: d.parts, textIndex: {}, streamError: l.t.streamError } : l.t }
                : l,
            );
          } else if (ev.event === "done") {
            const status = (ev.data as { status?: string })?.status ?? "completed";
            await finishTurn(taskId, sessionId, status);
            return;
          }
        }
        // Stream ended without the terminal event (proxy drop / server max-duration):
        // check the task on the human lane; reattach guidance otherwise.
        const t = supabaseBase() ? await taskById(token, taskId).catch(() => null) : null;
        if (t && TERMINAL.has(t.status)) await finishTurn(taskId, sessionId, t.status, t.error_code);
        else setBanner("The stream ended without a terminal event — reopen the session to reattach.");
      } catch (err) {
        if (!ctrl.signal.aborted) setBanner(`stream error: ${(err as Error).message}`);
      }
    },
    [token, refreshClarify, finishTurn],
  );

  // Reattach path: find the session's live task via agent_tasks_visible (§4.8),
  // then attach — the server replays the full stream history (S4-P2).
  const discoverAndAttach = useCallback(
    async (sessionId: string) => {
      if (!supabaseBase()) return;
      try {
        const t = (await liveTasks(token, sessionId))[0];
        if (t) {
          if (t.status === "awaiting_input") void refreshClarify(t.id);
          void attachStream(t.id, sessionId);
        }
      } catch (err) {
        setBanner((err as Error).message);
      }
    },
    [token, attachStream, refreshClarify],
  );

  const openSession = useCallback(
    async (id: string) => {
      streamAbort.current?.abort();
      setSelected(id);
      setMessages([]);
      setLive(null);
      setClarify(null);
      setBanner(null);
      setNote(null);
      await refreshMessages(id);
      await discoverAndAttach(id);
    },
    [refreshMessages, discoverAndAttach],
  );

  const send = useCallback(async () => {
    if (!selected || !text.trim() || sending) return;
    // A fresh turn_key per send — the idempotency key of THIS submission (§3.5).
    const turnKey = crypto.randomUUID();
    setSending(true);
    setBanner(null);
    setNote(null);
    const r = await postTurn(token, selected, text.trim(), turnKey);
    setSending(false);
    if (r.kind === "accepted") {
      setText("");
      await refreshMessages(selected);
      void attachStream(r.taskId, selected);
    } else if (r.kind === "conflict") {
      setBanner("A turn is already running in this session.");
      void discoverAndAttach(selected);
    } else if (r.kind === "limit") {
      // The server's copy VERBATIM — it names which limit + the UTC reset (§0.4).
      setBanner([r.message, r.resetCopy].filter(Boolean).join(" "));
    } else {
      setBanner(r.message);
    }
  }, [selected, text, sending, token, refreshMessages, attachStream, discoverAndAttach]);

  const onAnswer = useCallback(
    async (answer: string) => {
      const id = clarify?.interruptionId;
      if (!id) return;
      setClarify((c) => c && { ...c, busy: true, error: null });
      try {
        await answerInterruption(token, id, answer);
        setClarify((c) => c && { ...c, busy: false, answered: true });
      } catch (err) {
        setClarify((c) => c && { ...c, busy: false, error: (err as Error).message });
      }
    },
    [token, clarify],
  );

  const onCancel = useCallback(async () => {
    if (!live) return;
    try {
      await cancelTask(token, live.taskId);
      setBanner("Cancel requested.");
    } catch (err) {
      setBanner((err as Error).message);
    }
  }, [token, live]);

  const onShare = useCallback(
    async (id: string) => {
      try {
        await shareSession(token, id);
        await refreshSessions(token);
      } catch (err) {
        setBanner((err as Error).message);
      }
    },
    [token, refreshSessions],
  );

  const onCreate = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    setBanner(null);
    try {
      const id = await createSession(token, { title: title.trim(), clientId: clientId.trim() });
      setTitle("");
      setClientId("");
      await refreshSessions(token);
      await openSession(id);
    } catch (err) {
      setBanner((err as Error).message);
    } finally {
      setCreating(false);
    }
  }, [creating, token, title, clientId, refreshSessions, openSession]);

  const saveToken = () => {
    const t = tokenDraft.trim();
    sessionStorage.setItem(TOKEN_KEY, t);
    setToken(t);
    setSelected(null);
    setMessages([]);
    setLive(null);
    setClarify(null);
    setBanner(null);
  };

  const clarifyControls: ClarifyControls | undefined = clarify
    ? { ...clarify, onAnswer: (t: string) => void onAnswer(t) }
    : undefined;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Clara chat — Slice 4 plumbing</h1>
        <div className={styles.tokenBar}>
          <input
            className={styles.input}
            type="password"
            placeholder="Paste a Supabase session JWT"
            value={tokenDraft}
            onChange={(e) => setTokenDraft(e.target.value)}
          />
          <button className={styles.button} onClick={saveToken}>Use token</button>
        </div>
        <p className={styles.muted}>
          Dev auth surface: the pasted JWT lives in sessionStorage only and is sent as Bearer to the runtime and PostgREST.
          Real auth wiring is a later slice.
        </p>
        <p className={styles.muted}>
          runtime: {runtimeBase() || "same-origin proxy"} · PostgREST: {supabaseBase() ?? "not configured"}
        </p>
        {banner ? <p className={styles.banner}>{banner}</p> : null}
      </header>

      {!token ? (
        <p className={styles.prose}>Paste a JWT above to begin.</p>
      ) : (
        <div className={styles.layout}>
          <aside className={styles.sidebar}>
            <div className={styles.newSession}>
              <input className={styles.input} placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
              <input className={styles.input} placeholder="Client id (optional uuid)" value={clientId} onChange={(e) => setClientId(e.target.value)} />
              <button className={styles.button} onClick={() => void onCreate()} disabled={creating}>
                {creating ? "Creating…" : "New session"}
              </button>
            </div>
            <ul className={styles.sessionList}>
              {(sessions ?? []).map((s) => (
                <li key={s.id}>
                  <button
                    className={`${styles.sessionItem} ${selected === s.id ? styles.sessionActive : ""}`}
                    onClick={() => void openSession(s.id)}
                  >
                    <span className={styles.sessionTitle}>{s.title || "Untitled"}</span>
                    <span className={styles.muted}>
                      {s.visibility}
                      {mySub && s.created_by === mySub ? " · mine" : ""}
                    </span>
                  </button>
                  {s.visibility === "private" && mySub === s.created_by ? (
                    <button className={styles.linkButton} onClick={() => void onShare(s.id)}>share to firm</button>
                  ) : null}
                </li>
              ))}
              {sessions !== null && sessions.length === 0 ? <li className={styles.muted}>No sessions yet.</li> : null}
            </ul>
          </aside>

          <section className={styles.pane}>
            {!selected ? (
              <p className={styles.muted}>Select or create a session.</p>
            ) : (
              <>
                <div className={styles.transcript}>
                  {messages.map((m) => (
                    <div key={m.id} className={m.role === "user" ? styles.userMsg : styles.assistantMsg}>
                      <div className={styles.roleLabel}>{m.role}</div>
                      <TranscriptParts parts={m.parts ?? []} />
                    </div>
                  ))}
                  {live ? (
                    <div className={styles.assistantMsg}>
                      <div className={styles.roleLabel}>
                        assistant · streaming
                        <button className={styles.linkButton} onClick={() => void onCancel()}>cancel</button>
                      </div>
                      <TranscriptParts parts={live.t.parts} clarify={clarifyControls} />
                      {live.t.streamError ? <p className={styles.errorText}>{live.t.streamError}</p> : null}
                    </div>
                  ) : null}
                  {note ? <p className={styles.note}>{note}</p> : null}
                </div>
                <form
                  className={styles.composer}
                  onSubmit={(e) => {
                    e.preventDefault();
                    void send();
                  }}
                >
                  <textarea
                    className={styles.composerInput}
                    rows={2}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Ask Clara (read-only advisor)"
                  />
                  <button className={styles.button} type="submit" disabled={sending || !text.trim()}>
                    {sending ? "Sending…" : "Send"}
                  </button>
                </form>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
