import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { LoginForm } from "@/components/login-form";

export async function generateMetadata() {
  const t = await getTranslations("Login");
  return { title: t("title") };
}

/**
 * "/login" — the only sign-in surface. Public (proxy.ts allowlists it).
 * `LoginForm` reads a `?next=` param (set by proxy.ts's redirect) via
 * `useSearchParams`, which Next.js requires a Suspense boundary around.
 */
export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-2 bg-shell p-6">
      <div className="w-full max-w-sm">
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
