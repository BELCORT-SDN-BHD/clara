import type { PartClr } from "@/lib/parts/hooks";

/**
 * Renders a `useHydratedPart` cell's standing `err`/`clr` — the SAME idiom
 * PartRenderer.tsx uses for a `refusal` part (contract §3.2/§10): a governed CLR
 * refusal's code + message render VERBATIM, never re-worded, never hidden behind a
 * generic "something went wrong". An ordinary operational failure (no `clr`) still
 * shows its own message, just without the code chip.
 */
export function DoorFeedback({ err, clr }: { err: string | null; clr: PartClr }) {
  if (!err) return null;
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-error/30 bg-error-muted p-3 text-sm">
      {clr ? (
        <span className="inline-flex w-fit items-center rounded-full border border-transparent bg-error-muted px-2 py-0.5 text-xs font-medium text-error">
          {clr.code}
          {clr.reason ? ` · ${clr.reason}` : ""}
        </span>
      ) : null}
      <p className="text-error">{err}</p>
    </div>
  );
}
