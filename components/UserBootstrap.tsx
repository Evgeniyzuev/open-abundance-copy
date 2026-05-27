"use client";

import { useEffect } from "react";
import { claimRegistrationAfterAuth, getBrowserSupabaseClient } from "@/lib/supabaseClient";
import { getOrCreateLocalGuest, markLocalGuestClaimed } from "@/lib/guestIdentity";

export default function UserBootstrap() {
  useEffect(() => {
    let mounted = true;

    async function bootstrapUser() {
      const guest = await getOrCreateLocalGuest();
      const supabase = getBrowserSupabaseClient();
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!mounted || !session || guest.claimedUserId) return;

      const userId = await claimRegistrationAfterAuth();
      if (mounted) await markLocalGuestClaimed(userId);
    }

    bootstrapUser().catch((error) => {
      console.warn("User bootstrap failed", error);
    });

    const supabase = getBrowserSupabaseClient();
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN") return;

      getOrCreateLocalGuest()
        .then(() => claimRegistrationAfterAuth())
        .then((userId) => markLocalGuestClaimed(userId))
        .catch((error) => {
          console.warn("Guest claim failed", error);
        });
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return null;
}
