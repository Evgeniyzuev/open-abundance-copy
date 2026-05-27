"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { claimRegistrationAfterAuth, getBrowserSupabaseClient } from "@/lib/supabaseClient";
import type { Tables } from "@/lib/database.types";
import { getOrCreateLocalGuest, markLocalGuestClaimed } from "@/lib/guestIdentity";

export type UserProfile = Tables<"user_profiles">;
export type CoreAccount = Tables<"core_accounts">;
export type WalletAccount = Tables<"wallet_accounts">;

type UserContextValue = {
  user: User | null;
  profile: UserProfile | null;
  core: CoreAccount | null;
  wallet: WalletAccount | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refreshUserData: () => Promise<void>;
};

const UserContext = createContext<UserContextValue | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [core, setCore] = useState<CoreAccount | null>(null);
  const [wallet, setWallet] = useState<WalletAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshUserData = useCallback(async () => {
    const supabase = getBrowserSupabaseClient();
    setRefreshing(true);
    setError(null);

    try {
      const {
        data: { user: currentUser },
        error: userError
      } = await supabase.auth.getUser();

      if (userError) throw userError;

      setUser(currentUser ?? null);

      if (!currentUser) {
        setProfile(null);
        setCore(null);
        setWallet(null);
        return;
      }

      const [profileResult, coreResult, walletResult] = await Promise.all([
        supabase.from("user_profiles").select("*").eq("user_id", currentUser.id).maybeSingle(),
        supabase.from("core_accounts").select("*").eq("user_id", currentUser.id).maybeSingle(),
        supabase.from("wallet_accounts").select("*").eq("user_id", currentUser.id).maybeSingle()
      ]);

      if (profileResult.error) throw profileResult.error;
      if (coreResult.error) throw coreResult.error;
      if (walletResult.error) throw walletResult.error;

      setProfile(profileResult.data);
      setCore(coreResult.data);
      setWallet(walletResult.data);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Failed to refresh user data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const supabase = getBrowserSupabaseClient();

    async function bootstrapUser() {
      const guest = await getOrCreateLocalGuest();
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!mounted) return;

      if (session && !guest.claimedUserId) {
        const userId = await claimRegistrationAfterAuth();
        await markLocalGuestClaimed(userId);
      }

      if (mounted) await refreshUserData();
    }

    bootstrapUser().catch((bootstrapError) => {
      console.warn("User bootstrap failed", bootstrapError);
      if (mounted) {
        setError(bootstrapError instanceof Error ? bootstrapError.message : "User bootstrap failed.");
        setLoading(false);
      }
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        getOrCreateLocalGuest()
          .then(() => claimRegistrationAfterAuth())
          .then((userId) => markLocalGuestClaimed(userId))
          .then(() => refreshUserData())
          .catch((claimError) => {
            console.warn("Registration claim failed", claimError);
            setError(claimError instanceof Error ? claimError.message : "Registration claim failed.");
          });
      }

      if (event === "SIGNED_OUT") {
        setUser(null);
        setProfile(null);
        setCore(null);
        setWallet(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [refreshUserData]);

  const value = useMemo(
    () => ({
      user,
      profile,
      core,
      wallet,
      loading,
      refreshing,
      error,
      refreshUserData
    }),
    [core, error, loading, profile, refreshUserData, refreshing, user, wallet]
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUserContext(): UserContextValue {
  const value = useContext(UserContext);
  if (!value) throw new Error("useUserContext must be used inside UserProvider.");
  return value;
}
