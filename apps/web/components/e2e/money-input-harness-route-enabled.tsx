import { MoneyInputE2EHarness } from "@/components/e2e/money-input-e2e-harness";

/** Build-only face selected by CLARA_E2E_MONEY_INPUT_HARNESS=1. */
export function MoneyInputHarnessRoute() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-4 p-6">
      <h1 className="font-serif text-2xl text-foreground">Money input browser harness</h1>
      <MoneyInputE2EHarness />
    </main>
  );
}
