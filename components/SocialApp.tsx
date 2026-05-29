"use client";

import { Copy, Languages, Link, RefreshCw, Share2, UserRound, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useUserContext } from "@/components/UserProvider";
import type { AppLocale } from "@/lib/i18n";
import { getBrowserSupabaseClient } from "@/lib/supabaseClient";

type SocialTab = "profile" | "teams";
type ReferralLink = { code: string; url: string };
type TeamProfile = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  level: number;
  created_at: string;
};
type TeamContext = {
  membership: {
    member_user_id: string;
    leader_user_id: string | null;
    assigned_at: string;
    is_active: boolean;
  } | null;
  leader: { type: "system"; profile: null } | { type: "user"; profile: TeamProfile | null };
  directMembers: Array<{ userId: string; assignedAt: string; profile: TeamProfile | null }>;
  error?: string;
};

export default function SocialApp({ activeTab, refreshNonce }: { activeTab: SocialTab; refreshNonce: number }) {
  const { user, profile, loading, refreshing, error, locale, refreshUserData, setLocale, t } = useUserContext();
  const [referralLink, setReferralLink] = useState<ReferralLink | null>(null);
  const [teamContext, setTeamContext] = useState<TeamContext | null>(null);
  const [socialError, setSocialError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    refreshUserData().catch((refreshError) => {
      console.warn("Profile refresh failed", refreshError);
    });
  }, [activeTab, refreshNonce, refreshUserData]);

  const loadReferralLink = useCallback(async () => {
    if (!user) return;
    const session = await getAccessToken();
    const response = await fetch("/api/referrals/me", {
      cache: "no-store",
      headers: { Authorization: `Bearer ${session}` }
    });
    const payload = (await response.json()) as ReferralLink & { error?: string };
    if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load referral link.");
    setReferralLink({ code: payload.code, url: payload.url });
  }, [user]);

  const loadTeamContext = useCallback(async () => {
    if (!user) return;
    const session = await getAccessToken();
    const response = await fetch("/api/teams/me", {
      cache: "no-store",
      headers: { Authorization: `Bearer ${session}` }
    });
    const payload = (await response.json()) as TeamContext;
    if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load team.");
    setTeamContext(payload);
  }, [user]);

  useEffect(() => {
    if (!user) {
      setReferralLink(null);
      setTeamContext(null);
      return;
    }

    const load = activeTab === "teams" ? loadTeamContext : loadReferralLink;
    load().catch((loadError) => {
      console.warn("Social data load failed", loadError);
      setSocialError(loadError instanceof Error ? loadError.message : "Failed to load social data.");
    });
  }, [activeTab, loadReferralLink, loadTeamContext, user]);

  const displayName = profile?.display_name ?? user?.email ?? t("profile.guest");
  const handle = profile?.username ? `@${profile.username}` : user?.email ?? t("profile.localMode");
  const nextLocale: AppLocale = locale === "ru" ? "en" : "ru";
  const combinedError = error ?? socialError;

  async function copyReferralLink() {
    if (!referralLink) return;
    await navigator.clipboard.writeText(referralLink.url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function shareReferralLink() {
    if (!referralLink) return;
    if (navigator.share) {
      await navigator.share({
        title: "Open Abundance",
        text: t("profile.referral.shareText"),
        url: referralLink.url
      });
      return;
    }
    await copyReferralLink();
  }

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
          {!user && !loading ? <p>{t("profile.registrationRequired")}</p> : null}
          {user ? (
            <>
              <div className="team-summary">
                <span>{t("profile.teams.leader")}</span>
                <strong>{formatLeader(teamContext, locale)}</strong>
                <p>{teamContext?.membership ? t("profile.teams.assigned", { date: formatDate(teamContext.membership.assigned_at, locale) }) : t("profile.teams.pending")}</p>
              </div>
              <div className="team-summary">
                <span>{t("profile.teams.members")}</span>
                <strong>{teamContext?.directMembers.length ?? 0}</strong>
                <p>{teamContext?.directMembers.length ? teamContext.directMembers.map((member) => formatProfileName(member.profile, member.userId)).join(", ") : t("profile.teams.emptyMembers")}</p>
              </div>
            </>
          ) : null}
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
          <div className="referral-box">
            <span><Link size={15} />{t("profile.referral.title")}</span>
            <p>{referralLink?.url ?? t("app.common.loading")}</p>
            <div className="referral-actions">
              <button className="secondary-button" type="button" disabled={!referralLink} onClick={copyReferralLink}>
                <Copy size={16} />
                {copied ? t("profile.referral.copied") : t("profile.referral.copy")}
              </button>
              <button className="secondary-button" type="button" disabled={!referralLink} onClick={shareReferralLink}>
                <Share2 size={16} />
                {t("profile.referral.share")}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {combinedError ? <p className="finance-error">{combinedError}</p> : null}
    </section>
  );
}

async function getAccessToken(): Promise<string> {
  const supabase = getBrowserSupabaseClient();
  const {
    data: { session },
    error
  } = await supabase.auth.getSession();

  if (error) throw error;
  if (!session?.access_token) throw new Error("Supabase session is missing.");
  return session.access_token;
}

function formatDate(value: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function formatLeader(teamContext: TeamContext | null, locale: AppLocale): string {
  if (!teamContext?.membership) return locale === "ru" ? "Система" : "System";
  if (teamContext.leader.type === "system") return locale === "ru" ? "Система" : "System";
  return formatProfileName(teamContext.leader.profile, teamContext.membership.leader_user_id ?? "");
}

function formatProfileName(profile: TeamProfile | null, fallback: string): string {
  return profile?.display_name ?? (profile?.username ? `@${profile.username}` : fallback.slice(0, 8));
}
