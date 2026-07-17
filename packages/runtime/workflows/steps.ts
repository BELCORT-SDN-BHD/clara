// Durable steps for the example workflow. A `"use step"` body is memoized by
// the engine: on replay it is NOT re-executed (proven in the Slice-0 spike).
// Real steps (Slice 4+) call audited DB functions and carry idempotency keys;
// this skeleton step has no side-effects.

export async function recordExample(opKey: string): Promise<{ opKey: string; recordedAt: string }> {
  "use step";
  return { opKey, recordedAt: new Date().toISOString() };
}
