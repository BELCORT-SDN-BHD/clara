// Dead-man's-switch (healthchecks.io) — the ONLY alarm that fires on the ABSENCE of
// a backup (laptop/app off, job crashed, upload silently failed). The job pings on
// SUCCESS; no ping within the grace window (26h per docs/ops/DR.md §7) ⇒ the switch
// alerts tools@belcort.com. The manifest-age check (the optional CF Worker, deploy/
// cf-worker/) is corroboration, not the primary alarm.
//
// The ping URL carries a UUID → low-power secret: it is read from env/file by the
// orchestrator and NEVER logged verbatim (only a redacted host/…).

function redact(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}/…`;
  } catch {
    return "(unparseable ping url)";
  }
}

async function hit(url, { method = "POST", body } = {}) {
  const res = await fetch(url, { method, body, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`ping ${redact(url)} -> HTTP ${res.status}`);
}

/** Signal a start (optional; lets healthchecks measure job duration). */
export async function pingStart(url, { log = console.log } = {}) {
  if (!url) return;
  try {
    await hit(`${url.replace(/\/$/, "")}/start`);
    log(`ping: start -> ${redact(url)}`);
  } catch (e) {
    log(`ping: start FAILED (non-fatal) — ${e.message}`);
  }
}

/** Signal success — the run completed and the bundle is uploaded. */
export async function pingSuccess(url, { body, log = console.log } = {}) {
  if (!url) {
    log("ping: no ping URL configured — SKIPPING success ping (the dead-man's-switch will not see this run).");
    return;
  }
  await hit(url, { body });
  log(`ping: success -> ${redact(url)}`);
}

/** Signal failure — fire the alarm promptly rather than waiting out the grace window. */
export async function pingFailure(url, { body, log = console.log } = {}) {
  if (!url) return;
  try {
    await hit(`${url.replace(/\/$/, "")}/fail`, { body });
    log(`ping: failure -> ${redact(url)}`);
  } catch (e) {
    log(`ping: failure ping FAILED (non-fatal) — ${e.message}`);
  }
}
