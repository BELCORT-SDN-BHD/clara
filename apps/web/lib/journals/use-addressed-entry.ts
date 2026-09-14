"use client";

// #719 — THE ADDRESSED ENTRY, the journals half of the lesson `components/work/use-addressed-work.ts`
// already made mechanical for the Work list.
//
// A `?entry=<id>` deep link names ONE journal entry the caller arrived pointing at: a correction
// chain's other side, a conflict refusal's subject, an Activity row. The workbench's browse read is
// the 1,000 newest by `created_at` (lib/journals/api.ts's `FETCH_CAP`, unchanged by this ticket), so
// an entry older than that page was never in the table's rows at all and the surface could only say
// "that entry is outside this page" — an honest sentence about an entry the database has and this
// caller may read. This hook fetches it beside the browse read.
//
// IT FETCHES ONLY WHEN THE PAGE CANNOT ALREADY ANSWER. `skip` covers the three states where a read
// would be noise rather than information: the addressed entry is already on the page (a second read
// of a record we are holding would be a second source of truth for it), there is no address at all,
// or the browse read itself has not answered yet.
//
// FOUR HONEST OUTCOMES, never collapsed:
//
//   loading    the read is in flight — the addressed region says so rather than flashing the
//              not-found sentence at every arrival.
//   entry      the entry and its own lines, in the same shapes the browse read returns, ready to
//              merge into the table's rows.
//   notFound   ZERO rows came back. An id that never existed, one belonging to another firm (RLS
//              scopes by firm, so it simply is not there), and one belonging to another CLIENT of
//              this firm all land here — the caller checks `client_id` itself, because merging a
//              foreign client's entry into this client's table would be a worse answer than the
//              honest state. No oracle is offered, and none is available: `getJournalEntryById`'s
//              own header says why.
//   error      anything else — a transport failure or a refused read. Kept distinct from notFound
//              because "we could not ask" says nothing about whether the entry exists.
//
// THE #746 REF PATTERN, the same one `use-addressed-work.ts` and `lib/work/use-work-detail.ts` use:
// the loader and the id are read through refs, the effect keys on plain scalars, and `epochRef`
// gates which answer is committed so a slow read for a previous id can never overwrite a newer one.

import { useCallback, useEffect, useRef, useState } from "react";

import { sessionTokenAccessor } from "@/lib/session-accessor";
import { getJournalEntryById } from "./api";
import type { JournalEntryRow, JournalLineRow } from "./types";

export type AddressedEntry = { entry: JournalEntryRow; lines: JournalLineRow[] };

export type AddressedEntryState = {
  addressed: AddressedEntry | null;
  loading: boolean;
  notFound: boolean;
  error: unknown | null;
};

export type UseAddressedEntryArgs = {
  /** The `?entry=` id off the URL, or null/"" when nothing is addressed. */
  entryId: string | null;
  /** TRUE when the surface can already answer for this id, or must not ask at all. */
  skip: boolean;
  /** Injected by the cells; production reads the entry itself. */
  load?: (entryId: string) => Promise<AddressedEntry | null>;
};

const IDLE: AddressedEntryState = { addressed: null, loading: false, notFound: false, error: null };

export function useAddressedEntry(args: UseAddressedEntryArgs): AddressedEntryState {
  const [state, setState] = useState(IDLE);

  const entryIdRef = useRef(args.entryId);
  entryIdRef.current = args.entryId;
  const loadRef = useRef(args.load);
  loadRef.current = args.load;
  const epochRef = useRef(0);

  const read = useCallback(async () => {
    const epoch = ++epochRef.current;
    const entryId = entryIdRef.current;
    if (entryId === null || entryId === "") {
      setState(IDLE);
      return;
    }
    setState({ ...IDLE, loading: true });
    try {
      const loader = loadRef.current;
      const found = loader
        ? await loader(entryId)
        : await getJournalEntryById(sessionTokenAccessor, entryId);
      if (epoch !== epochRef.current) return; // superseded by a later read
      setState({ addressed: found, loading: false, notFound: found === null, error: null });
    } catch (error) {
      if (epoch !== epochRef.current) return;
      setState({ addressed: null, loading: false, notFound: false, error });
    }
  }, []);

  // The effect keys on the two SCALARS that decide whether a read is owed. `read` reads both
  // through refs and has a stable identity, so a state update never re-arms it (#746).
  useEffect(() => {
    if (args.skip || args.entryId === null || args.entryId === "") {
      // An addressed entry the page itself can now answer for stops being this hook's business:
      // clearing here is what stops a stale merge surviving the read that overtook it.
      epochRef.current += 1;
      setState(IDLE);
      return;
    }
    void read();
  }, [args.entryId, args.skip, read]);

  return state;
}
