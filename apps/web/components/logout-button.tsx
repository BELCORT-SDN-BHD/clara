"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { StateBanner } from "@/components/common/state";

/**
 * Posts to "/logout" (app/logout/route.ts) — a Route Handler, not a client-
 * side `supabase.auth.signOut()` call, so the session cookie is cleared
 * server-side even if a future change makes it httpOnly.
 *
 * NAVIGATES ONLY ON A SUCCESSFUL RESPONSE (cross-model security review
 * 2026-08-27, finding 11). The old version fired the POST, ignored the
 * result, and pushed to /login regardless — so a failed sign-out looked
 * exactly like a successful one and the user walked away believing a live
 * session was closed. `same-origin` credentials + the route's own Origin
 * check are what make the POST acceptable to the server.
 *
 * TWO PRESENTATIONS, ONE IMPLEMENTATION (P4-3). The firm shell renders it as
 * right-aligned `ghost` chrome; the holding page (`components/entry/
 * holding-card.tsx`) renders it as a full-width `outline` button, because
 * there it is not chrome at all — it is THE ONE ACTION on the screen, and the
 * only way out of /pending for a session with no firm (Mobbin grounding §1,
 * takeaway 3: map Airwallex's single-CTA idiom to a secondary-variant button,
 * never a fabricated "back to dashboard").
 *
 * The props below shape ONLY the presentation. Forking a second component for
 * the holding page would have duplicated the POST, the failure branch and the
 * navigate-only-on-success rule — three things this file was security-reviewed
 * for, and three things a copy is free to drift on.
 */
export function LogoutButton({
  variant = "ghost",
  align = "end",
  fullWidth = false,
}: {
  variant?: "ghost" | "outline";
  align?: "end" | "stretch";
  fullWidth?: boolean;
} = {}) {
  const t = useTranslations("Logout");
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogout() {
    setIsLoading(true);
    setError(null);

    let response: Response;
    try {
      response = await fetch("/logout", {
        method: "POST",
        credentials: "same-origin",
      });
    } catch {
      setError(t("failed"));
      setIsLoading(false);
      return;
    }

    if (!response.ok) {
      setError(t("failed"));
      setIsLoading(false);
      return;
    }

    router.push("/login");
    router.refresh();
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-1",
        align === "end" ? "items-end" : "items-stretch",
      )}
    >
      <Button
        variant={variant}
        className={cn(fullWidth && "w-full")}
        onClick={() => void handleLogout()}
        disabled={isLoading}
      >
        {isLoading ? t("submitting") : t("submit")}
      </Button>
      {error && <StateBanner tone="error" className="text-xs">{error}</StateBanner>}
    </div>
  );
}
