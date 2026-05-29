"use client";

import { Languages, RefreshCw, UserRound, Users } from "lucide-react";
import { useEffect } from "react";
import { useUserContext } from "@/components/UserProvider";
import type { AppLocale } from "@/lib/i18n";

type SocialTab = "profile" | "teams";

export default function SocialApp({ activeTab, refreshNonce }: { activeTab: SocialTab; refreshNonce: number }) {
  const { user, profile, loading, refreshing, error, locale, refreshUserData, setLocale, t } = useUserContext();

  useEffect(() => {
    refreshUserData().catch((refreshError) => {
      console.warn("Profile refresh failed", refreshError);
    });
  }, [activeTab, refreshNonce, refreshUserData]);

  const displayName = profile?.display_name ?? user?.email ?? t("profile.guest");
  const handle = profile?.username ? `@${profile.username}` : user?.email ?? t("profile.localMode");
  const nextLocale: AppLocale = locale === "ru" ? "en" : "ru";

  return (
    <section className="social-screen">
      <header className="social-header">
        <div>
          <span>Social</span>
          <h1>{t("profile.title")}</h1>
        </div>
        <button className="finance-icon-button" type="button" aria-label={t("app.common.refresh")} disabled={refreshing} onClick={() => refreshUserData()}>
          <RefreshCw size={19} className={refreshing ? "spin" : ""} />
        </button>
      </header>

      {activeTab === "teams" ? (
        <section className="profile-panel">
          <div className="profile-avatar placeholder">
            <Users size={34} />
          </div>
          <strong>Teams</strong>
          <p>{t("profile.teams.empty")}</p>
        </section>
      ) : null}

      {activeTab === "profile" && !user && !loading ? (
        <section className="profile-panel">
          <div className="profile-avatar placeholder">
            <UserRound size={34} />
          </div>
          <strong>{t("profile.guest")}</strong>
          <p>{t("profile.registrationRequired")}</p>
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
            <span>{t("profile.created", { date: profile ? formatDate(profile.created_at, locale) : "..." })}</span>
            <span>{locale.toUpperCase()}</span>
          </div>
          <button className="secondary-button" type="button" aria-label={t("profile.language.toggle")} onClick={() => setLocale(nextLocale)}>
            <Languages size={16} />
            {t(nextLocale === "ru" ? "profile.language.ru" : "profile.language.en")}
          </button>
        </section>
      ) : null}

      {error ? <p className="finance-error">{error}</p> : null}
    </section>
  );
}

function formatDate(value: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}
