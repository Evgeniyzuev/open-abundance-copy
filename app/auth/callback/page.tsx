"use client";

import { useEffect, useState } from "react";
import { claimRegistrationAfterAuth, getBrowserSupabaseClient } from "@/lib/supabaseClient";
import { getOrCreateLocalGuest, markLocalGuestClaimed } from "@/lib/guestIdentity";

export default function AuthCallbackPage() {
  const [status, setStatus] = useState("Завершаем вход...");

  useEffect(() => {
    async function completeAuth() {
      const supabase = getBrowserSupabaseClient();
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;
      }

      await getOrCreateLocalGuest();
      const userId = await claimRegistrationAfterAuth();
      await markLocalGuestClaimed(userId);
      setStatus("Готово. Возвращаемся в приложение...");
      window.location.replace("/?auth=complete");
    }

    completeAuth().catch((error) => {
      console.error(error);
      setStatus("Не удалось завершить вход. Попробуйте еще раз.");
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
