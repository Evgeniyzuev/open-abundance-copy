"use client";

import { RefreshCw, UserRound, Users } from "lucide-react";
import { useEffect } from "react";
import { useUserContext } from "@/components/UserProvider";

type SocialTab = "profile" | "teams";

export default function SocialApp({ activeTab, refreshNonce }: { activeTab: SocialTab; refreshNonce: number }) {
  const { user, profile, loading, refreshing, error, refreshUserData } = useUserContext();

  useEffect(() => {
    refreshUserData().catch((refreshError) => {
      console.warn("Profile refresh failed", refreshError);
    });
  }, [activeTab, refreshNonce, refreshUserData]);

  const displayName = profile?.display_name ?? user?.email ?? "Гость";
  const handle = profile?.username ? `@${profile.username}` : user?.email ?? "Локальный режим";

  return (
    <section className="social-screen">
      <header className="social-header">
        <div>
          <span>Social</span>
          <h1>Профиль</h1>
        </div>
        <button className="finance-icon-button" type="button" aria-label="Обновить" disabled={refreshing} onClick={() => refreshUserData()}>
          <RefreshCw size={19} className={refreshing ? "spin" : ""} />
        </button>
      </header>

      {activeTab === "teams" ? (
        <section className="profile-panel">
          <div className="profile-avatar placeholder">
            <Users size={34} />
          </div>
          <strong>Teams</strong>
          <p>Команды появятся здесь позже.</p>
        </section>
      ) : null}

      {activeTab === "profile" && !user && !loading ? (
        <section className="profile-panel">
          <div className="profile-avatar placeholder">
            <UserRound size={34} />
          </div>
          <strong>Гость</strong>
          <p>Пройдите челлендж регистрации, чтобы создать профиль.</p>
        </section>
      ) : null}

      {activeTab === "profile" && user ? (
        <section className="profile-panel">
          <div className="profile-avatar">
            {profile?.avatar_url ? <img alt="" src={profile.avatar_url} /> : <UserRound size={34} />}
          </div>
          <strong>{displayName}</strong>
          <p>{handle}</p>
          <div className="profile-facts">
            <span>Lvl {profile?.level ?? 0}</span>
            <span>Профиль создан {profile ? formatDate(profile.created_at) : "..."}</span>
            <span>{profile?.default_locale ?? "ru"}</span>
          </div>
        </section>
      ) : null}

      {error ? <p className="finance-error">{error}</p> : null}
    </section>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}
