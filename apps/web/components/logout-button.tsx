"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
 */
export function LogoutButton() {
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
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="ghost"
        onClick={() => void handleLogout()}
        disabled={isLoading}
      >
        {isLoading ? t("submitting") : t("submit")}
      </Button>
      {error && <StateBanner tone="error" className="text-xs">{error}</StateBanner>}
    </div>
  );
}
