"use client";

import { useEffect, useState } from "react";
import { claimRegistrationAfterAuth, getBrowserSupabaseClient } from "@/lib/supabaseClient";
import { getOrCreateLocalGuest, markLocalGuestClaimed } from "@/lib/guestIdentity";
import { detectBrowserLocale, translate } from "@/lib/i18n";

export default function AuthCallbackPage() {
  const [status, setStatus] = useState("Finishing sign-in...");

  useEffect(() => {
    async function completeAuth() {
      const locale = detectBrowserLocale();
      const supabase = getBrowserSupabaseClient();
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;
      }

      await getOrCreateLocalGuest();
      const userId = await claimRegistrationAfterAuth(locale);
      await markLocalGuestClaimed(userId);
      setStatus(translate(locale, "app.common.ready"));
      window.location.replace("/?auth=complete");
    }

    completeAuth().catch((error) => {
      console.error(error);
      setStatus("Could not finish sign-in. Try again.");
    });
  }, []);

  return (
    <main className="auth-callback-screen">
      <section>
        <strong>{status}</strong>
      </section>
    </main>
  );
}
