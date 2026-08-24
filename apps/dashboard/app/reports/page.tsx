"use client";

// /reports -- sealed-artifact links + a snapshot list (Wave E lane theta,
// design skeleton part4 §4), a sibling of /rules: pasted-JWT dev auth
// (sessionStorage, the shared clara_dev_jwt key), PostgREST reads, no design
// system, no animation. Snapshots read from lane gamma's live registry
// (0057); sealed artifacts read from lane epsilon's clara.report_artifacts,
// which may not be deployed here yet -- that absence is rendered explicitly,
// never a crash and never a silent empty list. The UI computes no cents.
//
// ERROR HONESTY (fix-docket finding 3): reportsApi.ts's listReportArtifacts
// already rethrows everything except the one PostgREST-404 "relation absent"
// signal -- this page must not defeat that by folding every catch() back into
// available:false. A genuine 401/500/network failure renders its OWN error
// state here, distinct from "not yet deployed" and distinct from a legitimate
// DB-returned 'unknown' snapshot assessment (absence is not evidence, at the
// UI layer too).

import { useEffect, useState } from "react";
import { listClients, type ClientRow } from "../documents/api";
import { supabaseBase, runtimeBase } from "../shared/wire";
import { shortId } from "../shared/fmt";
import {
  listPeriodSnapshots, snapshotState, listReportArtifacts,
  issueReportForApproval, archiveSignedOriginal, retrieveSignedOriginal, requeueRenderJob,
  type PeriodSnapshotRow, type ReportArtifactsRead, type ReportArtifactRow, type SignedOriginalCustody,
} from "./reportsApi";
import styles from "./reports.module.css";

const TOKEN_KEY = "clara_dev_jwt"; // shared with /chat + /documents + /queue + /rules + /close

export default function ReportsPage() {
  const [token, setToken] = useState("");
  const [tokenDraft, setTokenDraft] = useState("");
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [clientId, setClientId] = useState("");
  const [snapshots, setSnapshots] = useState<PeriodSnapshotRow[] | null>(null);
  const [snapshotsError, setSnapshotsError] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<ReportArtifactsRead | null>(null);
  const [artifactsError, setArtifactsError] = useState<string | null>(null);

  useEffect(() => {
    setToken(sessionStorage.getItem(TOKEN_KEY) ?? "");
    setTokenDraft(sessionStorage.getItem(TOKEN_KEY) ?? "");
  }, []);

  useEffect(() => {
    if (token && supabaseBase()) listClients(token).then(setClients).catch(() => setClients([]));
  }, [token]);

  useEffect(() => {
    setSnapshots(null); setSnapshotsError(null);
    setArtifacts(null); setArtifactsError(null);
    if (!token || !clientId) return;
    listPeriodSnapshots(token, clientId)
      .then((rows) => { setSnapshots(rows); setSnapshotsError(null); })
      .catch((e) => { setSnapshots(null); setSnapshotsError((e as Error).message); });
    // NOTE: listReportArtifacts already returns {available:false} (not a
    // thrown error) for the one honest "not deployed" case -- so reaching
    // this .catch() at all means a REAL failure occurred, and it must render
    // as one, never be relabelled available:false a second time here.
    listReportArtifacts(token, clientId)
      .then((read) => { setArtifacts(read); setArtifactsError(null); })
      .catch((e) => { setArtifacts(null); setArtifactsError((e as Error).message); });
  }, [token, clientId]);

  const saveToken = () => {
    const t = tokenDraft.trim();
    sessionStorage.setItem(TOKEN_KEY, t); setToken(t);
    setSnapshots(null); setSnapshotsError(null);
    setArtifacts(null); setArtifactsError(null);
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Reports -- snapshots &amp; sealed artifacts</h1>
        <div className={styles.tokenBar}>
          <input className={styles.input} type="password" placeholder="Paste a Supabase session JWT" value={tokenDraft}
            onChange={(e) => setTokenDraft(e.target.value)} aria-label="Session JWT" />
          <button className={styles.buttonSecondary} onClick={saveToken}>Use token</button>
        </div>
        <p className={styles.muted}>runtime: {runtimeBase() || "same-origin proxy"} &middot; PostgREST: {supabaseBase() ?? "not configured"}</p>
      </header>

      {!token ? (
        <p className={styles.muted}>Paste a JWT above to load a client&rsquo;s reports.</p>
      ) : !supabaseBase() ? (
        <p className={styles.muted}>Set NEXT_PUBLIC_SUPABASE_URL to read reports on the human lane.</p>
      ) : (
        <>
          <div className={styles.toolbar}>
            <select className={styles.input} value={clientId} onChange={(e) => setClientId(e.target.value)} aria-label="Client">
              <option value="">Select client&hellip;</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name || c.id.slice(0, 8)}</option>)}
            </select>
          </div>

          <section className={styles.section}>
            <p className={styles.sectionTitle}>Month snapshots</p>
            {!clientId ? (
              <p className={styles.muted}>Select a client to list its snapshots.</p>
            ) : snapshotsError ? (
              <p className={styles.banner}>Could not load snapshots: {snapshotsError}</p>
            ) : snapshots === null ? (
              <p className={styles.muted}>Loading&hellip;</p>
            ) : snapshots.length === 0 ? (
              <p className={styles.muted}>No snapshots minted yet for this client (mint_month_snapshot).</p>
            ) : (
              <div className={styles.rowList}>
                {snapshots.map((s) => <SnapshotRow key={s.id} snapshot={s} token={token} />)}
              </div>
            )}
          </section>

          <section className={styles.section}>
            <p className={styles.sectionTitle}>Sealed report artifacts</p>
            {!clientId ? (
              <p className={styles.muted}>Select a client to list its sealed artifacts.</p>
            ) : artifactsError ? (
              <p className={styles.banner}>Could not load sealed artifacts: {artifactsError}</p>
            ) : artifacts === null ? (
              <p className={styles.muted}>Loading&hellip;</p>
            ) : !artifacts.available ? (
              <p className={styles.notice}>Reporting engine not yet deployed -- the sealed-artifact registry is not present in this environment yet.</p>
            ) : artifacts.rows.length === 0 ? (
              <p className={styles.muted}>No sealed artifacts yet for this client.</p>
            ) : (
              <div className={styles.rowList}>
                {artifacts.rows.map((a) => (
                  <div key={a.id} className={styles.row}>
                    <div className={styles.rowHead}>
                      <span className={styles.rowTitle}>{a.kind.replace(/_/g, " ")}</span>
                      <span className={styles.idChip}>run {shortId(a.report_run_id)}</span>
                      {a.claim_removed ? <span className={`${styles.band} ${styles.bandFlag}`}><span className={styles.glyph} aria-hidden="true">✕</span>claim removed</span> : null}
                      {a.uncertified ? <span className={`${styles.band} ${styles.bandFlag}`}><span className={styles.glyph} aria-hidden="true">!</span>uncertified</span> : null}
                    </div>
                    {/* Finding 6, closed by F-A5 PR-3 for signed_original ONLY: pre_sign still has
                        no retrieval door by design (it is not the retained artifact -- see A.5) and
                        keeps the copy-key note; a signed_original row gets the real Retrieve action. */}
                    <ArtifactKeyRow storageKey={a.storage_key} kind={a.kind} />
                    <div className={styles.rowMeta}>
                      <span className={styles.mono}>sha256 {a.sha256}</span>
                      <span className={styles.mono}>{a.byte_size.toLocaleString()} bytes</span>
                      <span className={styles.mono}>sealed {a.sealed_at} by {shortId(a.sealed_by)}</span>
                    </div>
                    {a.kind === "pre_sign" ? <PreSignDoors token={token} artifact={a} /> : null}
                    {a.kind === "signed_original" ? <RetrieveAction token={token} runId={a.report_run_id} /> : null}
                  </div>
                ))}
              </div>
            )}
          </section>

          {clientId ? <RequeueCard token={token} /> : null}
        </>
      )}
    </main>
  );
}

function ArtifactKeyRow({ storageKey, kind }: { storageKey: string; kind: ReportArtifactRow["kind"] }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(storageKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };
  return (
    <div className={styles.rowMeta}>
      <span className={styles.mono}>{storageKey}</span>
      <button className={styles.buttonSecondary} onClick={copy}>{copied ? "Copied" : "Copy storage key"}</button>
      {kind === "signed_original" ? null : (
        <span className={styles.muted}>
          {kind === "pre_sign"
            ? "This is the pre-sign draft, not the retained record -- once a signed original is archived below, retrieve THAT."
            : "No retrieval door ships for a draft -- verify by storage key + sha256 through ops tooling."}
        </span>
      )}
    </div>
  );
}

function SnapshotRow({ snapshot, token }: { snapshot: PeriodSnapshotRow; token: string }) {
  const [state, setState] = useState<string | null>(null);
  const [stateError, setStateError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setState(null); setStateError(null);
    snapshotState(token, snapshot.id)
      .then((s) => { if (!cancelled) setState(s); })
      .catch((e) => { if (!cancelled) setStateError((e as Error).message); });
    return () => { cancelled = true; };
  }, [token, snapshot.id]);

  const band = stateError ? styles.bandFlag : state === "current" ? styles.bandCurrent : state === "stale" ? styles.bandStale : styles.bandUnknown;
  const glyph = stateError ? "!" : state === "current" ? "✓" : state === "stale" ? "↻" : "?";
  const label = stateError ? "error" : state;

  return (
    <div className={styles.row}>
      <div className={styles.rowHead}>
        <span className={styles.rowTitle}>{snapshot.period_start} -- {snapshot.period_end}</span>
        <span className={styles.idChip}>{snapshot.kind.replace(/_/g, " ")}</span>
        {label ? (
          <span className={`${styles.band} ${band}`}><span className={styles.glyph} aria-hidden="true">{glyph}</span>{label}</span>
        ) : null}
      </div>
      {stateError ? <p className={styles.banner}>Could not read this snapshot's state: {stateError}</p> : null}
      <div className={styles.rowMeta}>
        <span className={styles.mono}>minted {snapshot.minted_at} by {shortId(snapshot.minted_by)}</span>
        <span className={styles.mono}>sha256 {snapshot.dataset_sha256}</span>
      </div>
    </div>
  );
}

/** F-A5 PR-3's minimal doors for a `pre_sign` row (design SS3.9, annex A.4): the ISSUE CARD
 *  (the sealed hash the approval must NAME, never recomputed here -- B.11's own law) and the
 *  ARCHIVE FORM over clara.archive_signed_original. Crude, per TA-P14 clause 2: two plain forms,
 *  no design system, no card catalog part -- the governed function is the door; this is a way to
 *  reach it. Richer UI is Wave G's (design SS3.8/A.5). */
function PreSignDoors({ token, artifact }: { token: string; artifact: ReportArtifactRow }) {
  return (
    <div className={styles.rowMeta} style={{ flexDirection: "column", alignItems: "stretch", gap: "0.5rem" }}>
      <IssueForm token={token} artifact={artifact} />
      <ArchiveForm token={token} artifact={artifact} />
    </div>
  );
}

function IssueForm({ token, artifact }: { token: string; artifact: ReportArtifactRow }) {
  const [reason, setReason] = useState("");
  const [attestation, setAttestation] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true); setResult(null); setError(null);
    try {
      // THE SHA THE APPROVAL NAMES is the ROW'S OWN sha256 -- read, never recomputed in this
      // client (0072:87-92 refuses a mismatch either way, but the honest door shows what it will
      // send, not a value the human has to retype correctly from memory).
      const out = await issueReportForApproval(token, {
        reportRunId: artifact.report_run_id, expectedArtifactSha256: artifact.sha256,
        reason, selfAttestation: attestation, opKey: `dash-issue-${artifact.id}-${Date.now()}`,
      });
      setResult(JSON.stringify(out));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.rowMeta} style={{ flexDirection: "column", alignItems: "stretch", gap: "0.35rem" }}>
      <span className={styles.mono}>Issue this pack -- names sha256 {artifact.sha256.slice(0, 16)}&hellip; (the sealed pre-sign hash, unrecomputed)</span>
      <input className={styles.input} placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Issue reason" />
      <input className={styles.input} placeholder="Self-attestation (solo firm only; agent_prepared always needs one)" value={attestation}
        onChange={(e) => setAttestation(e.target.value)} aria-label="Self-attestation text" />
      <button className={styles.buttonSecondary} disabled={busy || !reason} onClick={submit}>{busy ? "Issuing…" : "Issue"}</button>
      {result ? <span className={styles.mono}>{result}</span> : null}
      {error ? <p className={styles.banner}>{error}</p> : null}
    </div>
  );
}

function ArchiveForm({ token, artifact }: { token: string; artifact: ReportArtifactRow }) {
  const [sha, setSha] = useState("");
  const [byteSize, setByteSize] = useState("");
  const [signer, setSigner] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true); setResult(null); setError(null);
    try {
      const out = await archiveSignedOriginal(token, {
        reportRunId: artifact.report_run_id, sha256: sha.trim().toLowerCase(),
        byteSize: Number(byteSize), signatureEvidence: { kind: "wet_signature", signer_name: signer },
        answersPreSignSha256: artifact.sha256, opKey: `dash-archive-${artifact.id}-${Date.now()}`,
      });
      setResult(JSON.stringify(out));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.rowMeta} style={{ flexDirection: "column", alignItems: "stretch", gap: "0.35rem" }}>
      <span className={styles.mono}>Archive the signed original that answers this pre-sign</span>
      <input className={styles.input} placeholder="Signed PDF sha256" value={sha} onChange={(e) => setSha(e.target.value)} aria-label="Signed PDF sha256" />
      <input className={styles.input} placeholder="Byte size" value={byteSize} onChange={(e) => setByteSize(e.target.value)} aria-label="Byte size" />
      <input className={styles.input} placeholder="Signer name" value={signer} onChange={(e) => setSigner(e.target.value)} aria-label="Signer name" />
      <button className={styles.buttonSecondary} disabled={busy || !sha || !byteSize || !signer} onClick={submit}>
        {busy ? "Archiving…" : "Archive"}
      </button>
      {result ? <span className={styles.mono}>{result}</span> : null}
      {error ? <p className={styles.banner}>{error}</p> : null}
    </div>
  );
}

/** The retrieval door for a `signed_original` row (design SS3.8/annex A.5). A null result is the
 *  door's own honest "nothing archived yet", rendered as a state -- never mistaken for an error. */
function RetrieveAction({ token, runId }: { token: string; runId: string }) {
  const [busy, setBusy] = useState(false);
  const [custody, setCustody] = useState<SignedOriginalCustody | null>(null);
  const [error, setError] = useState<string | null>(null);

  const retrieve = async () => {
    setBusy(true); setError(null);
    try {
      setCustody(await retrieveSignedOriginal(token, runId));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.rowMeta} style={{ flexDirection: "column", alignItems: "stretch", gap: "0.35rem" }}>
      <button className={styles.buttonSecondary} disabled={busy} onClick={retrieve}>{busy ? "Retrieving…" : "Retrieve"}</button>
      {custody === null && !busy ? null : custody ? (
        <>
          <span className={styles.mono}>{custody.storage_key}</span>
          <span className={styles.mono}>sha256 {custody.sha256} &middot; {custody.byte_size.toLocaleString()} bytes</span>
          <span className={styles.muted}>{custody.retrieval_note}</span>
        </>
      ) : null}
      {error ? <p className={styles.banner}>{error}</p> : null}
    </div>
  );
}

/** F-A5 PR-3's requeue door (design annex A.4): the human's own drift checkbox, over
 *  clara.requeue_render_job -- the SAME verb behind the render lane's incident-recovery runbook
 *  (docs/ops/DR-render.md), not a new gate. Crude: a job id typed in, not a picked row -- the run
 *  list above names no failed job ids yet, and inventing a second listing here is Wave G's job. */
function RequeueCard({ token }: { token: string }) {
  const [jobId, setJobId] = useState("");
  const [reason, setReason] = useState("");
  const [acceptDrift, setAcceptDrift] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true); setResult(null); setError(null);
    try {
      const out = await requeueRenderJob(token, { jobId, reason, acceptDrift });
      setResult(JSON.stringify(out));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.section}>
      <p className={styles.sectionTitle}>Requeue a failed render job</p>
      <div className={styles.rowMeta} style={{ flexDirection: "column", alignItems: "stretch", gap: "0.35rem" }}>
        <input className={styles.input} placeholder="Failed render job id" value={jobId} onChange={(e) => setJobId(e.target.value)} aria-label="Render job id" />
        <input className={styles.input} placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Requeue reason" />
        <label className={styles.muted}>
          <input type="checkbox" checked={acceptDrift} onChange={(e) => setAcceptDrift(e.target.checked)} />
          {" "}I accept that the re-derived manifest may differ from the failed job's (CLR43 requeue_manifest_drifted otherwise refuses)
        </label>
        <button className={styles.buttonSecondary} disabled={busy || !jobId || !reason} onClick={submit}>{busy ? "Requeuing…" : "Requeue"}</button>
        {result ? <span className={styles.mono}>{result}</span> : null}
        {error ? <p className={styles.banner}>{error}</p> : null}
      </div>
    </section>
  );
}
