"use client";

// RE-EXPORT ONLY. The implementation moved to `lib/parts/read-err-kind.ts` — beside the hook it
// observes — when a second surface (the Documents detail read) needed the same capture. A hook
// about a taxonomy no single domain owns does not belong inside one domain's folder. The name
// stays importable from here because every bank call site already reads it from this path, and
// moving ten import lines would have been churn with no behavioural meaning.

export { useReadErrKind } from "../parts/read-err-kind";
