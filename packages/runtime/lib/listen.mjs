// Shared LISTEN-loop helpers for the dedicated control + leader connections
// (Slice 4). Both hold ONE long-lived clara_runtime session that LISTENs on a
// channel and polls; this module is their common connection-error classifier +
// NOTIFY-or-timeout waiter (deduped from control.mjs / leader.mjs).

/** True when an error means the connection is gone (⇒ discard + reconnect). */
export function isConnErr(err) {
  if (!err) return false;
  const code = err.code;
  if (code && ["57P01", "08000", "08001", "08003", "08004", "08006", "ECONNRESET", "EPIPE"].includes(code)) return true;
  return /terminat|connection (?:closed|terminated|reset|refused)|server closed the connection/i.test(String(err.message || ""));
}

/**
 * Resolve on the next NOTIFY on the client's listened channel, OR after `ms`, OR
 * when a stop is signalled (stopRef.wake is set to the finisher so a signal handler
 * can cut the wait short). Single-shot per call.
 * @param {import("pg").ClientBase} client
 * @param {number} ms
 * @param {{wake: null | (() => void)}} stopRef
 */
export function waitForNudge(client, ms, stopRef) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      client.removeListener("notification", onNotif);
      stopRef.wake = null;
      resolve();
    };
    const onNotif = () => finish();
    const timer = setTimeout(finish, ms);
    client.once("notification", onNotif);
    stopRef.wake = finish;
  });
}
