import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";

import { ClaraVisualPrototype } from "./prototype-client";

export const metadata: Metadata = {
  title: "Clara visual prototype",
};

export default function ClaraVisualPrototypePage() {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.CLARA_E2E_MONEY_INPUT_HARNESS !== "1"
  ) {
    notFound();
  }
  return (
    <Suspense fallback={<main aria-label="正在打开视觉原型" className="min-h-dvh bg-background p-6"><Skeleton className="h-14 w-full" /><div className="mt-6 grid gap-4 sm:grid-cols-2"><Skeleton className="h-52" /><Skeleton className="h-52" /></div></main>}>
      <ClaraVisualPrototype />
    </Suspense>
  );
}
