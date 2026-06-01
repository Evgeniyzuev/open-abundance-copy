"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { claimReferralAfterAuth, claimRegistrationAfterAuth, getBrowserSupabaseClient } from "@/lib/supabaseClient";
import type { Tables } from "@/lib/database.types";
import { capturePendingReferral, getOrCreateLocalGuest, markLocalGuestClaimed, markPendingReferralClaimed } from "@/lib/guestIdentity";
import { detectBrowserLocale, normalizeLocale, translate, type AppLocale, type MessageKey } from "@/lib/i18n";

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
  locale: AppLocale;
  refreshUserData: () => Promise<void>;
  setLocale: (nextLocale: AppLocale) => Promise<void>;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
};

type UserContextResponse = {
  user: User | null;
  profile: UserProfile | null;
  core: CoreAccount | null;
  wallet: WalletAccount | null;
  error?: string;
};

const SERVER_FETCH_TIMEOUT_MS = 5_000;

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
  const [guestLocale, setGuestLocale] = useState<AppLocale>("en");

  useEffect(() => {
    setGuestLocale(detectBrowserLocale());
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const referralCode = params.get("ref");
    if (!referralCode) return;

    capturePendingReferral(referralCode, `${window.location.pathname}${window.location.search}`)
      .then(() => {
        params.delete("ref");
        const nextQuery = params.toString();
        const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash}`;
        window.history.replaceState({}, "", nextUrl);
      })
      .catch((referralError) => {
        console.warn("Failed to capture referral code.", referralError);
      });
  }, []);

  const locale = normalizeLocale(profile?.default_locale ?? guestLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const clearServerData = useCallback(() => {
    setUser(null);
    setProfile(null);
    setCore(null);
    setWallet(null);
  }, []);

  const refreshUserData = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    setProfile(null);
    setCore(null);
    setWallet(null);

    try {
      if (isOffline()) {
        clearServerData();
        return;
      }

      const supabase = getBrowserSupabaseClient();
      const {
        data: { session },
        error: sessionError
      } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      if (!session?.access_token) {
        clearServerData();
        return;
      }

      const response = await fetchWithTimeout(`/api/user/context?ts=${Date.now()}`, {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Cache-Control": "no-cache"
        }
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
      clearServerData();
      setError(refreshError instanceof Error ? refreshError.message : "Failed to refresh user data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [clearServerData]);

  useEffect(() => {
    let mounted = true;
    const supabase = getBrowserSupabaseClient();

    async function bootstrapUser() {
      if (isOffline()) {
        if (mounted) {
          clearServerData();
          setLoading(false);
        }
        return;
      }

      const guest = await getOrCreateLocalGuest();
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!mounted) return;

      if (session && !guest.claimedUserId) {
        const userId = await claimRegistrationAfterAuth();
        await markLocalGuestClaimed(userId);
        await claimReferralAfterAuth(guest.pendingReferral, guest.guestId);
        await markPendingReferralClaimed();
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
          .then(async (guest) => {
            const userId = await claimRegistrationAfterAuth();
            await markLocalGuestClaimed(userId);
            await claimReferralAfterAuth(guest.pendingReferral, guest.guestId);
            await markPendingReferralClaimed();
          })
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
  }, [clearServerData, refreshUserData]);

  useEffect(() => {
    const refreshAfterReconnect = () => {
      refreshUserData().catch((refreshError) => {
        console.warn("User reconnect refresh failed", refreshError);
      });
    };

    window.addEventListener("online", refreshAfterReconnect);
    return () => window.removeEventListener("online", refreshAfterReconnect);
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

  const setLocale = useCallback(async (nextLocale: AppLocale) => {
    const normalizedLocale = normalizeLocale(nextLocale);
    const previousProfile = profile;

    setGuestLocale(normalizedLocale);
    setProfile((current) => current ? { ...current, default_locale: normalizedLocale } : current);

    if (!user) return;

    try {
      const supabase = getBrowserSupabaseClient();
      const { error: updateError } = await supabase
        .from("user_profiles")
        .update({ default_locale: normalizedLocale, updated_at: new Date().toISOString() })
        .eq("user_id", user.id);

      if (updateError) throw updateError;
      await refreshUserData();
    } catch (localeError) {
      setProfile(previousProfile);
      setError(localeError instanceof Error ? localeError.message : "Failed to update language.");
      throw localeError;
    }
  }, [profile, refreshUserData, user]);

  const t = useCallback(
    (key: MessageKey, values?: Record<string, string | number>) => translate(locale, key, values),
    [locale]
  );

  const value = useMemo(
    () => ({
      user,
      profile,
      core,
      wallet,
      loading,
      refreshing,
      error,
      locale,
      refreshUserData,
      setLocale,
      t
    }),
    [core, error, loading, locale, profile, refreshUserData, refreshing, setLocale, t, user, wallet]
  );

  return (
    <UserContext.Provider value={value}>
      {children}
      {pendingLevelUps[0] ? (
        <LevelUpModal
          level={pendingLevelUps[0]}
          onClose={() => acknowledgeLevelUp(pendingLevelUps[0])}
          t={t}
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

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), SERVER_FETCH_TIMEOUT_MS);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function LevelUpModal({
  level,
  onClose,
  t
}: {
  level: number;
  onClose: () => void;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-sheet small level-up-modal">
        <span className="level-up-badge">Lvl {level}</span>
        <h2>{t("levelUp.title")}</h2>
        <p>{t("levelUp.description", { level })}</p>
        <button className="challenge-primary-action" type="button" onClick={onClose}>
          {t("app.common.excellent")}
        </button>
      </div>
    </div>
  );
}
