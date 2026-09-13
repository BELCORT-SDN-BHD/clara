"use client";

// #641 — THE ADDRESSED ROW, and #719's own lesson made mechanical.
//
// A `?work=<id>` deep link names ONE Work the caller arrived pointing at. It may be three pages
// down, or excluded outright by the very filters the same URL carries — in which case a surface
// that could only see its current page would either say nothing at all (the row silently missing
// from a list the person was sent a link to) or render a not-found for a row they are perfectly
// entitled to read. `clara.get_accounting_work_row` (0189) exists for exactly this and answers the
// SAME projection a list row carries, addressed by id alone; this hook is the one place the web
// calls it.
//
// IT FETCHES ONLY WHEN THE PAGE CANNOT ALREADY ANSWER. When the addressed row IS on the current
// page, the caller passes `skip` and this hook reads nothing: the row is already on screen, and a
// second read of a record we are holding would be a second source of truth for it. `skip` also
// covers the two states where a fetch would be noise rather than information — the first page read
// is still in flight, or the list itself was DENIED (in which case this door would refuse
// identically and the surface would carry two banners saying one thing).
//
// FOUR HONEST OUTCOMES, never collapsed:
//
//   loading    the read is in flight — the addressed region says so rather than flashing empty.
//   row        the Work, in the list's own projection.
//   notFound   the door's CLR11 `accounting_work_not_found`: an id that never existed, one that
//              belongs to another firm, and one this caller may not read all refuse the SAME way
//              (0189 gives no oracle, and neither does this). The surface says "no such work, or
//              it is not yours" — never a silent drop, which is the failure this whole file is
//              about.
//   error      anything else — a transport failure or a refusal that is not CLR11. Kept distinct
//              from notFound because "we could not ask" says nothing about whether the row exists.
//
// THE #746 REF PATTERN, the same one `lib/work/use-work-detail.ts` was hardened into: the loader
// and the id are read through refs, the effect keys on plain scalars, and `epochRef` gates which
// answer is committed so a slow read for a previous id can never overwrite a newer one.

import { useCallback, useEffect, useRef, useState } from "react";

import { isDoorRefusal } from "@/lib/doors";
import { getAccountingWorkRow, type WorkListRow } from "@/lib/work/work-list";

export type AddressedWorkState = {
  row: WorkListRow | null;
  loading: boolean;
  notFound: boolean;
  error: unknown | null;
  reload: () => void;
};

export type UseAddressedWorkArgs = {
  /** The `?work=` id off the URL, already shape-checked by `parseWorkListUrlState`. */
  workId: string | null;
  /** TRUE when the surface can already answer for this id, or must not ask at all. */
  skip: boolean;
  /** Injected by the cells; production reads the door. */
  load?: (workId: string) => Promise<WorkListRow>;
};

const IDLE: Omit<AddressedWorkState, "reload"> = {
  row: null, loading: false, notFound: false, error: null,
};

export function useAddressedWork(args: UseAddressedWorkArgs): AddressedWorkState {
  const [state, setState] = useState(IDLE);

  const workIdRef = useRef(args.workId);
  workIdRef.current = args.workId;
  const loadRef = useRef(args.load);
  loadRef.current = args.load;
  const epochRef = useRef(0);

  const read = useCallback(async () => {
    const epoch = ++epochRef.current;
    const workId = workIdRef.current;
    if (workId === null) {
      setState(IDLE);
      return;
    }
    setState({ ...IDLE, loading: true });
    try {
      const loader = loadRef.current;
      const row = loader ? await loader(workId) : await getAccountingWorkRow(workId);
      if (epoch !== epochRef.current) return; // superseded by a later read
      setState({ row, loading: false, notFound: false, error: null });
    } catch (error) {
      if (epoch !== epochRef.current) return;
      // CLR11 is the door's ONE answer for absent, foreign and unreadable alike. Anything else is
      // a failure to ask, which is a different sentence.
      const notFound = isDoorRefusal(error) && error.code === "CLR11";
      setState({ row: null, loading: false, notFound, error: notFound ? null : error });
    }
  }, []);

  // The effect keys on the two SCALARS that decide whether a read is owed. `read` reads both
  // through refs and has a stable identity, so a state update never re-arms it (#746).
  useEffect(() => {
    if (args.skip || args.workId === null) {
      // An addressed row that the page itself can now answer for stops being this hook's business:
      // clearing here is what stops a stale callout surviving the page that overtook it.
      epochRef.current += 1;
      setState(IDLE);
      return;
    }
    void read();
  }, [args.workId, args.skip, read]);

  return { ...state, reload: () => void read() };
}
