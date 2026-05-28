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

type UserContextResponse = {
  user: User | null;
  profile: UserProfile | null;
  core: CoreAccount | null;
  wallet: WalletAccount | null;
  error?: string;
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
  const [pendingLevelUps, setPendingLevelUps] = useState<number[]>([]);

  const refreshUserData = useCallback(async () => {
    const supabase = getBrowserSupabaseClient();
    setRefreshing(true);
    setError(null);

    try {
      const {
        data: { session },
        error: sessionError
      } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      if (!session?.access_token) {
        setUser(null);
        setProfile(null);
        setCore(null);
        setWallet(null);
        return;
      }

      const response = await fetch("/api/user/context", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      const payload = (await response.json()) as UserContextResponse;

      if (!response.ok || payload.error) {
        throw new Error(payload.error ?? "Failed to refresh user data.");
      }

      setUser(payload.user);
      setProfile(payload.profile);
      setCore(payload.core);
      setWallet(payload.wallet);
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

  useEffect(() => {
    if (!core || core.level <= core.last_seen_level) {
      setPendingLevelUps([]);
      return;
    }

    const levels = Array.from({ length: core.level - core.last_seen_level }, (_, index) => core.last_seen_level + index + 1);
    setPendingLevelUps(levels);
  }, [core]);

  function acknowledgeLevelUp(level: number) {
    const supabase = getBrowserSupabaseClient();

    setPendingLevelUps((levels) => levels.filter((item) => item > level));
    setCore((current) => current ? { ...current, last_seen_level: Math.max(current.last_seen_level, Math.min(level, current.level)) } : current);

    try {
      supabase.auth.getSession()
        .then(async ({ data: { session }, error: sessionError }) => {
          if (sessionError) throw sessionError;
          if (!session?.access_token) throw new Error("Supabase session is missing.");

          const response = await fetch("/api/core/level-seen", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ level })
          });
          const payload = (await response.json()) as { error?: string };

          if (!response.ok || payload.error) {
            throw new Error(payload.error ?? "Failed to mark level as seen.");
          }

          await refreshUserData();
        })
        .catch((levelError) => {
          console.warn("Failed to mark level-up as seen.", levelError);
        });
    } catch (levelError) {
      console.warn("Failed to mark level-up as seen.", levelError);
    }
  }

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

  return (
    <UserContext.Provider value={value}>
      {children}
      {pendingLevelUps[0] ? (
        <LevelUpModal
          level={pendingLevelUps[0]}
          onClose={() => acknowledgeLevelUp(pendingLevelUps[0])}
        />
      ) : null}
    </UserContext.Provider>
  );
}

export function useUserContext(): UserContextValue {
  const value = useContext(UserContext);
  if (!value) throw new Error("useUserContext must be used inside UserProvider.");
  return value;
}

function LevelUpModal({ level, onClose }: { level: number; onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-sheet small level-up-modal">
        <span className="level-up-badge">Lvl {level}</span>
        <h2>Новый уровень</h2>
        <p>Ваш Core достиг порога уровня {level}. Открываются новые возможности и челленджи.</p>
        <button className="challenge-primary-action" type="button" onClick={onClose}>
          Отлично
        </button>
      </div>
    </div>
  );
}
