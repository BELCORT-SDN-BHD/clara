"use client";

// The counterparty picker for the opening carry-down (migration 0021).
//
// WHAT IT REPLACES. A bare text box labelled "counterparty id" that expected a human to
// paste a uuid. There was no way to see which parties existed and no way to create one, so
// the field was unfillable at takeover — which is when it is needed, because a client's
// opening payables are exactly the balances that predate any coded entry.
//
// TWO ACTS, KEPT SEPARATE. Selecting an existing party is a read. Minting one is a governed
// write through `create_counterparty`. They are deliberately not merged into a combobox that
// creates on blur: minting a trading partner should be something a human did on purpose, and
// the result — created, or recovered because the coding lane already knew this party — is
// reported rather than smoothed over.
//
// The DB owns identity. This component never decides that two names are the same party; it
// sends what the human typed and renders what the DB did.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  listCounterparties,
  createCounterparty,
  type CounterpartyKind,
  type CounterpartyRow,
} from "../shared/counterpartyApi";
import type { PgrestError } from "../shared/wire";
import styles from "./opening.module.css";

export function CounterpartyPicker({
  token,
  clientId,
  kind,
  value,
  onChange,
}: {
  token: string;
  clientId: string;
  /** ap_open_item names a VENDOR; ar_open_item names a CUSTOMER. The two are distinct
   *  parties even under one name — both unique indexes are kind-scoped — so the kind is
   *  passed in from the item being drafted rather than chosen here. */
  kind: CounterpartyKind;
  value: string;
  onChange: (counterpartyId: string) => void;
}) {
  const [rows, setRows] = useState<CounterpartyRow[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [reg, setReg] = useState("");
  const [tin, setTin] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadErr(null);
    try {
      setRows(await listCounterparties(token, clientId, kind));
    } catch (e) {
      setRows([]);
      setLoadErr(e instanceof Error ? e.message : "could not load counterparties");
    }
  }, [token, clientId, kind]);

  useEffect(() => { void load(); }, [load]);

  // The kind changed under us (AP -> AR), or the client did. The selected id belongs to the
  // OLD list and would silently attach a vendor to a receivable, so drop it rather than carry
  // it across. Guarded on the scope actually CHANGING, not on the effect running: an
  // unguarded version also fires on mount and would wipe a value the parent supplied.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const scope = `${kind}|${clientId}`;
  const lastScope = useRef(scope);
  useEffect(() => {
    if (lastScope.current === scope) return;
    lastScope.current = scope;
    onChangeRef.current("");
    setCreating(false); setNote(null); setErr(null);
  }, [scope]);

  async function submitNew() {
    setBusy(true); setErr(null); setNote(null);
    try {
      const res = await createCounterparty(token, {
        clientId, kind, name, registrationNo: reg, tin,
      });
      await load();
      onChange(res.counterparty_id);
      setNote(res.created
        ? `Created. ${labelKind(kind)} added to this client.`
        : `That ${labelKind(kind).toLowerCase()} already existed for this client — selected it instead of creating a duplicate.`);
      setCreating(false);
      setName(""); setReg(""); setTin("");
    } catch (e) {
      const pg = e as PgrestError;
      // Render the DB's refusal, never a paraphrase of it. CLR11 is "not in your firm";
      // CLR04 is the bookkeeper floor; CLR10 covers the argument checks.
      setErr(pg?.reason ? `${pg.clr ?? "refused"}: ${pg.reason}` : (pg?.message ?? "could not create"));
    } finally {
      setBusy(false);
    }
  }

  const noun = labelKind(kind).toLowerCase();

  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{noun}</span>
      <select
        className={styles.select}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`${labelKind(kind)} for this open item`}
      >
        <option value="">— select a {noun} —</option>
        {(rows ?? []).map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}{r.registration_no ? ` (${r.registration_no})` : ""}
          </option>
        ))}
      </select>

      {rows !== null && rows.length === 0 && !loadErr ? (
        <p className={styles.hint}>
          This client has no {noun} yet. Add the one this opening balance is owed
          {kind === "vendor" ? " to" : " by"}.
        </p>
      ) : null}
      {loadErr ? <p className={styles.errorText} role="alert">Could not load: {loadErr}</p> : null}

      {creating ? (
        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>name (as printed)</span>
            <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)}
                   aria-label={`New ${noun} name`} />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>SSM / registration no (optional)</span>
            <input className={styles.input} value={reg} onChange={(e) => setReg(e.target.value)}
                   aria-label={`New ${noun} registration number`} />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>TIN (optional)</span>
            <input className={styles.input} value={tin} onChange={(e) => setTin(e.target.value)}
                   aria-label={`New ${noun} TIN`} />
          </label>
          <div className={styles.actions}>
            <button type="button" className={styles.button} disabled={busy || name.trim() === ""}
                    onClick={() => { void submitNew(); }}>
              {busy ? "Creating…" : `Create ${noun}`}
            </button>
            <button type="button" className={styles.buttonSecondary} disabled={busy}
                    onClick={() => { setCreating(false); setErr(null); }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className={styles.buttonSecondary} onClick={() => { setCreating(true); setNote(null); }}>
          New {noun}
        </button>
      )}

      {note ? <p className={styles.hint}>{note}</p> : null}
      {err ? <p className={styles.errorText} role="alert">{err}</p> : null}
    </div>
  );
}

function labelKind(k: CounterpartyKind): string {
  return k === "vendor" ? "Supplier" : "Customer";
}
