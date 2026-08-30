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
 *
 * MOVED into the `(entry)` route group by P4-3. A route group adds no URL
 * segment, so this page still answers on **/login** — unchanged for every
 * `?next=` redirect proxy.ts writes and every link that points here.
 * `tests/firm-scope-surfaces.test.ts` asserts that URL by resolving the tree,
 * not by trusting this sentence.
 *
 * The identity-canvas ground, the centred column and the 裁-2 4a card shadow all
 * moved UP to `app/(entry)/layout.tsx`, which is why this page renders no
 * `<main>` of its own — one `<main>` landmark for the group, not four.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
