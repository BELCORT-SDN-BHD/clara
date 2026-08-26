"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * Posts to "/logout" (app/logout/route.ts) — a Route Handler, not a client-
 * side `supabase.auth.signOut()` call, so the session cookie is cleared
 * server-side even if a future change makes it httpOnly.
 */
export function LogoutButton() {
  const t = useTranslations("Logout");
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  async function handleLogout() {
    setIsLoading(true);
    await fetch("/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <Button variant="ghost" onClick={handleLogout} disabled={isLoading}>
      {isLoading ? t("submitting") : t("submit")}
    </Button>
  );
}
