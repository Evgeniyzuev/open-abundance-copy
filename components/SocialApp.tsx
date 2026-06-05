"use client";

import { Bell, ChevronDown, ChevronUp, Copy, Edit3, ExternalLink, Languages, Link, RefreshCw, Save, Share2, Trash2, UserRound, Users, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useUserContext } from "@/components/UserProvider";
import type { AppLocale, MessageKey } from "@/lib/i18n";
import { formatAdaptiveMoney as formatMoney } from "@/lib/moneyFormat";
import { getBrowserSupabaseClient } from "@/lib/supabaseClient";
import { DEFAULT_PROFILE_VISIBILITY_SETTINGS, PROFILE_VISIBILITY_KEYS, PROFILE_VISIBILITY_LEVELS, type ProfileVisibility, type ProfileVisibilityKey, type ProfileVisibilitySettings } from "@/lib/socialProfile";

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
type TeamRewardDay = {
  bonus_date: string;
  reward_amount: number;
  source_count: number;
  created_at: string;
};
type CoreNotificationRow = {
  accrual_date: string;
  core_amount: number;
  wallet_amount: number;
  created_at: string;
};
type PayoutNotification = {
  id: string;
  title: string;
  body: string;
};
type ProfileLinkRow = {
  id: string;
  user_id: string;
  link_type: string;
  label: string | null;
  url: string;
  visibility: string;
  sort_order: number;
};
type ContactRow = {
  owner_user_id: string;
  contact_user_id: string;
  source: string;
  status: string;
  is_required: boolean;
  profile: TeamProfile | null;
};
type SocialProfilePayload = {
  profile: { bio: string | null } | null;
  visibilitySettings: ProfileVisibilitySettings;
  links: ProfileLinkRow[];
  contacts: ContactRow[];
  error?: string;
};
type PublicProfilePayload = {
  profile: {
    user_id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    level: number;
    bio: string | null;
    created_at: string;
  };
  links: ProfileLinkRow[];
  relation: { isSelf: boolean; isContact: boolean; isTeam: boolean; isFollower: boolean };
  visibleBlocks: Record<string, boolean>;
  error?: string;
};
type ProfileEditorState = {
  bio: string;
  linkLabel: string;
  linkUrl: string;
  linkVisibility: ProfileVisibility;
  visibilitySettings: ProfileVisibilitySettings;
};

export default function SocialApp({ activeTab, refreshNonce, onRefresh }: { activeTab: SocialTab; refreshNonce: number; onRefresh: () => Promise<void> }) {
  const { user, profile, core, loading, refreshing, error, locale, setLocale, t } = useUserContext();
  const [referralLink, setReferralLink] = useState<ReferralLink | null>(null);
  const [teamContext, setTeamContext] = useState<TeamContext | null>(null);
  const [socialError, setSocialError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [teamRewardsOpen, setTeamRewardsOpen] = useState(false);
  const [teamRewards, setTeamRewards] = useState<TeamRewardDay[] | null>(null);
  const [teamRewardsLoading, setTeamRewardsLoading] = useState(false);
  const [teamRewardsError, setTeamRewardsError] = useState<string | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<PayoutNotification[] | null>(null);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [socialProfile, setSocialProfile] = useState<SocialProfilePayload | null>(null);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [profileEditor, setProfileEditor] = useState<ProfileEditorState>(() => createProfileEditorState(null));
  const [profileSaving, setProfileSaving] = useState(false);
  const [publicProfile, setPublicProfile] = useState<PublicProfilePayload | null>(null);
  const [publicProfileLoading, setPublicProfileLoading] = useState(false);
  const [contactSavingId, setContactSavingId] = useState<string | null>(null);

  useEffect(() => {
    setSocialError(null);
    setCopied(false);
    setReferralLink(null);
    setTeamContext(null);
    setTeamRewards(null);
    setTeamRewardsOpen(false);
    setTeamRewardsLoading(false);
    setTeamRewardsError(null);
    setNotifications(null);
    setNotificationsOpen(false);
    setNotificationsLoading(false);
    setSocialProfile(null);
    setProfileEditorOpen(false);
    setProfileEditor(createProfileEditorState(null));
    setProfileSaving(false);
    setPublicProfile(null);
    setPublicProfileLoading(false);
    setContactSavingId(null);
  }, [activeTab, user?.id]);

  const loadReferralLink = useCallback(async () => {
    if (!user) return;
    const session = await getAccessToken();
    const response = await fetch(`/api/referrals/me?ts=${Date.now()}`, {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${session}`,
        "Cache-Control": "no-cache"
      }
    });
    const payload = (await response.json()) as ReferralLink & { error?: string };
    if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load referral link.");
    setReferralLink({ code: payload.code, url: payload.url });
  }, [user]);

  const loadTeamContext = useCallback(async () => {
    if (!user) return;
    const session = await getAccessToken();
    const response = await fetch(`/api/teams/me?ts=${Date.now()}`, {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${session}`,
        "Cache-Control": "no-cache"
      }
    });
    const payload = (await response.json()) as TeamContext;
    if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load team.");
    setTeamContext(payload);
  }, [user]);

  const loadSocialProfile = useCallback(async () => {
    if (!user) return;
    const token = await getAccessToken();
    const response = await fetch(`/api/social/profile?ts=${Date.now()}`, {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        "Cache-Control": "no-cache"
      }
    });
    const payload = (await response.json()) as SocialProfilePayload;
    if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load social profile.");
    setSocialProfile(payload);
    setProfileEditor((current) => profileEditorOpen ? current : createProfileEditorState(payload));
  }, [profileEditorOpen, user]);

  const loadProfileTab = useCallback(async () => {
    await Promise.all([loadReferralLink(), loadSocialProfile()]);
  }, [loadReferralLink, loadSocialProfile]);

  useEffect(() => {
    if (!user) {
      setReferralLink(null);
      setTeamContext(null);
      setTeamRewards(null);
      setTeamRewardsOpen(false);
      setNotifications(null);
      setNotificationsOpen(false);
      return;
    }

    if (!navigator.onLine) {
      return;
    }

    const load = activeTab === "teams" ? loadTeamContext : loadProfileTab;
    setSocialError(null);
    load().catch((loadError) => {
      console.warn("Social data load failed", loadError);
      setSocialError(loadError instanceof Error ? loadError.message : "Failed to load social data.");
    });
  }, [activeTab, loadProfileTab, loadTeamContext, refreshNonce, user]);

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

  function openProfileEditor() {
    setProfileEditor(createProfileEditorState(socialProfile));
    setProfileEditorOpen(true);
  }

  async function saveProfileEditor() {
    setProfileSaving(true);
    setSocialError(null);
    try {
      const token = await getAccessToken();
      const links = profileEditor.linkUrl.trim()
        ? [{
            label: profileEditor.linkLabel,
            url: profileEditor.linkUrl,
            visibility: profileEditor.linkVisibility
          }]
        : [];
      const response = await fetch("/api/social/profile", {
        method: "PUT",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          bio: profileEditor.bio,
          visibilitySettings: profileEditor.visibilitySettings,
          links
        })
      });
      const payload = (await response.json()) as SocialProfilePayload;
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to save profile.");
      await loadSocialProfile();
      setProfileEditorOpen(false);
    } catch (saveError) {
      console.warn("Social profile save failed", saveError);
      setSocialError(saveError instanceof Error ? saveError.message : "Failed to save profile.");
    } finally {
      setProfileSaving(false);
    }
  }

  async function openPublicProfile(userId: string) {
    setPublicProfileLoading(true);
    setSocialError(null);
    try {
      const token = await getAccessToken();
      const response = await fetch(`/api/social/profile/${userId}?ts=${Date.now()}`, {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${token}`,
          "Cache-Control": "no-cache"
        }
      });
      const payload = (await response.json()) as PublicProfilePayload;
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load profile.");
      setPublicProfile(payload);
    } catch (profileError) {
      console.warn("Public profile load failed", profileError);
      setSocialError(profileError instanceof Error ? profileError.message : "Failed to load profile.");
    } finally {
      setPublicProfileLoading(false);
    }
  }

  async function removeManualContact(contactUserId: string) {
    setContactSavingId(contactUserId);
    setSocialError(null);
    try {
      const token = await getAccessToken();
      const response = await fetch(`/api/social/contacts?contactUserId=${encodeURIComponent(contactUserId)}`, {
        method: "DELETE",
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` }
      });
      const payload = (await response.json()) as { contacts?: ContactRow[]; error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to remove contact.");
      setSocialProfile((current) => current ? { ...current, contacts: payload.contacts ?? [] } : current);
    } catch (contactError) {
      console.warn("Contact remove failed", contactError);
      setSocialError(contactError instanceof Error ? contactError.message : "Failed to remove contact.");
    } finally {
      setContactSavingId(null);
    }
  }

  async function toggleTeamRewards() {
    const nextOpen = !teamRewardsOpen;
    setTeamRewardsOpen(nextOpen);
    if (!nextOpen || teamRewards || teamRewardsLoading) return;

    setTeamRewardsLoading(true);
    setTeamRewardsError(null);
    try {
      setTeamRewards(await loadTeamRewardsHistory());
    } catch (loadError) {
      console.warn("Team rewards history load failed", loadError);
      setTeamRewardsError(loadError instanceof Error ? loadError.message : "Failed to load team rewards.");
    } finally {
      setTeamRewardsLoading(false);
    }
  }

  async function openPayoutNotifications() {
    if (!user) return;
    const nextOpen = !notificationsOpen;
    setNotificationsOpen(nextOpen);
    if (!nextOpen) return;

    setNotificationsLoading(true);
    setNotifications(null);
    setSocialError(null);
    try {
      const [coreRows, rewardRows] = await Promise.all([
        loadCoreNotifications(),
        loadTeamRewardsHistory()
      ]);
      setNotifications(buildPayoutNotifications(coreRows, rewardRows, locale));
    } catch (loadError) {
      console.warn("Payout notifications load failed", loadError);
      setSocialError(loadError instanceof Error ? loadError.message : "Failed to load notifications.");
    } finally {
      setNotificationsLoading(false);
    }
  }

  return (
    <section className="social-screen">
      <header className="social-header">
        <div>
          <span>Social</span>
          <h1>{t("profile.title")}</h1>
        </div>
        <button className="finance-icon-button" type="button" aria-label={t("app.common.refresh")} disabled={refreshing} onClick={() => { void onRefresh(); }}>
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
                {teamContext?.leader.type === "user" && teamContext.membership?.leader_user_id ? (
                  <button className="inline-profile-button" type="button" onClick={() => { void openPublicProfile(teamContext.membership?.leader_user_id ?? ""); }}>
                    {formatLeader(teamContext, locale)}
                  </button>
                ) : (
                  <strong>{formatLeader(teamContext, locale)}</strong>
                )}
                <p>{teamContext?.membership ? t("profile.teams.assigned", { date: formatDate(teamContext.membership.assigned_at, locale) }) : t("profile.teams.pending")}</p>
              </div>
              <div className="team-summary">
                <span>{t("profile.teams.members")}</span>
                <strong>{teamContext?.directMembers.length ?? 0}</strong>
                {teamContext?.directMembers.length ? (
                  <div className="compact-profile-list">
                    {teamContext.directMembers.map((member) => (
                      <button className="compact-profile-button" type="button" key={member.userId} onClick={() => { void openPublicProfile(member.userId); }}>
                        {formatProfileName(member.profile, member.userId)}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p>{t("profile.teams.emptyMembers")}</p>
                )}
              </div>
              <HistoryPanel
                title={locale === "ru" ? "История лидерских бонусов" : "Team bonus history"}
                open={teamRewardsOpen}
                loading={teamRewardsLoading}
                error={teamRewardsError}
                emptyText={locale === "ru" ? "Лидерских бонусов пока нет." : "No team bonuses yet."}
                loadingText={t("app.common.loading")}
                rowCount={teamRewards?.length ?? 0}
                onToggle={toggleTeamRewards}
              >
                <div className="payout-list">
                  {(teamRewards ?? []).map((row) => (
                    <article className="payout-row" key={`${row.bonus_date}-${row.created_at}`}>
                      <div>
                        <strong>{formatDay(row.bonus_date, locale)}</strong>
                        <span>{locale === "ru" ? "Участников" : "Members"}: {row.source_count}</span>
                      </div>
                      <div>
                        <strong>+{formatMoney(row.reward_amount, locale)}</strong>
                        <span>{locale === "ru" ? "в Core" : "to Core"}</span>
                      </div>
                    </article>
                  ))}
                </div>
              </HistoryPanel>
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
            <span>Lvl {core?.level ?? profile?.level ?? 0}</span>
            <span>{t("profile.created", { date: profile ? formatDate(profile.created_at, locale) : "..." })}</span>
            <span>{locale.toUpperCase()}</span>
          </div>
          <button className="secondary-button" type="button" aria-label={t("profile.language.toggle")} onClick={() => setLocale(nextLocale)}>
            <Languages size={16} />
            {t(nextLocale === "ru" ? "profile.language.ru" : "profile.language.en")}
          </button>
          <section className="public-profile-box">
            <div className="section-heading-row">
              <span>{t("profile.public.title")}</span>
              <button className="finance-small-icon-button" type="button" aria-label={t("profile.public.edit")} onClick={openProfileEditor}>
                <Edit3 size={16} />
              </button>
            </div>
            {profileEditorOpen ? (
              <div className="profile-editor">
                <label className="finance-field">
                  <span>{t("profile.public.bio")}</span>
                  <textarea value={profileEditor.bio} maxLength={700} onChange={(event) => setProfileEditor((current) => ({ ...current, bio: event.target.value }))} />
                </label>
                <div className="term-row">
                  <label className="finance-field">
                    <span>{t("profile.public.linkLabel")}</span>
                    <input value={profileEditor.linkLabel} maxLength={40} onChange={(event) => setProfileEditor((current) => ({ ...current, linkLabel: event.target.value }))} />
                  </label>
                  <label className="finance-field">
                    <span>{t("profile.public.linkUrl")}</span>
                    <input value={profileEditor.linkUrl} maxLength={500} inputMode="url" onChange={(event) => setProfileEditor((current) => ({ ...current, linkUrl: event.target.value }))} />
                  </label>
                </div>
                <label className="finance-field">
                  <span>{t("profile.public.linkVisibility")}</span>
                  <select value={profileEditor.linkVisibility} onChange={(event) => setProfileEditor((current) => ({ ...current, linkVisibility: event.target.value as ProfileVisibility }))}>
                    {PROFILE_VISIBILITY_LEVELS.map((visibility) => (
                      <option value={visibility} key={visibility}>{t(visibilityLabelKey(visibility))}</option>
                    ))}
                  </select>
                </label>
                <div className="visibility-grid">
                  {PROFILE_VISIBILITY_KEYS.map((key) => (
                    <label className="finance-field" key={key}>
                      <span>{t(profileVisibilityKeyLabel(key))}</span>
                      <select
                        value={profileEditor.visibilitySettings[key]}
                        onChange={(event) => setProfileEditor((current) => ({
                          ...current,
                          visibilitySettings: {
                            ...current.visibilitySettings,
                            [key]: event.target.value as ProfileVisibility
                          }
                        }))}
                      >
                        {PROFILE_VISIBILITY_LEVELS.map((visibility) => (
                          <option value={visibility} key={visibility}>{t(visibilityLabelKey(visibility))}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                <div className="referral-actions">
                  <button className="secondary-button" type="button" disabled={profileSaving} onClick={saveProfileEditor}>
                    <Save size={16} />
                    {t("app.common.done")}
                  </button>
                  <button className="secondary-button" type="button" disabled={profileSaving} onClick={() => setProfileEditorOpen(false)}>
                    <X size={16} />
                    {t("app.common.cancel")}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {socialProfile?.profile?.bio ? <p>{socialProfile.profile.bio}</p> : <p>{t("profile.public.emptyBio")}</p>}
                {socialProfile?.links.length ? (
                  <div className="profile-links">
                    {socialProfile.links.map((item) => (
                      <a href={item.url} target="_blank" rel="noreferrer" key={item.id}>
                        <ExternalLink size={15} />
                        {item.label ?? readableHost(item.url)}
                      </a>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </section>
          <section className="public-profile-box">
            <div className="section-heading-row">
              <span>{t("profile.contacts.title")}</span>
              <strong>{socialProfile?.contacts.length ?? 0}</strong>
            </div>
            {socialProfile?.contacts.length ? (
              <div className="contact-list">
                {socialProfile.contacts.map((contact) => (
                  <article className="contact-row" key={`${contact.contact_user_id}-${contact.source}`}>
                    <button type="button" onClick={() => { void openPublicProfile(contact.contact_user_id); }}>
                      <span>{formatProfileName(contact.profile, contact.contact_user_id)}</span>
                      <small>{t(contactSourceLabelKey(contact.source))}</small>
                    </button>
                    {contact.source === "manual" && !contact.is_required ? (
                      <button className="finance-small-icon-button" type="button" disabled={contactSavingId === contact.contact_user_id} aria-label={t("profile.contacts.remove")} onClick={() => { void removeManualContact(contact.contact_user_id); }}>
                        <Trash2 size={15} />
                      </button>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : (
              <p>{t("profile.contacts.empty")}</p>
            )}
          </section>
          <div className="profile-notifications">
            <button className="finance-icon-button" type="button" aria-label={locale === "ru" ? "Уведомления" : "Notifications"} onClick={openPayoutNotifications}>
              <Bell size={18} />
            </button>
            {notificationsOpen ? (
              <div className="notification-panel">
                {notificationsLoading ? <p>{t("app.common.loading")}</p> : null}
                {!notificationsLoading && notifications?.length ? notifications.map((item) => (
                  <article className="notification-row" key={item.id}>
                    <strong>{item.title}</strong>
                    <p>{item.body}</p>
                  </article>
                )) : null}
                {!notificationsLoading && notifications && notifications.length === 0 ? (
                  <p>{locale === "ru" ? "Новых поступлений нет." : "No new payouts."}</p>
                ) : null}
              </div>
            ) : null}
          </div>
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
      {publicProfileLoading ? <p className="finance-error neutral">{t("app.common.loading")}</p> : null}
      {publicProfile ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setPublicProfile(null)}>
          <section className="modal-sheet public-profile-modal" role="dialog" aria-modal="true" aria-label={t("profile.public.title")} onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" aria-label={t("app.common.close")} onClick={() => setPublicProfile(null)}>
              <X size={18} />
            </button>
            <div className="profile-avatar">
              {publicProfile.profile.avatar_url ? <img alt="" src={publicProfile.profile.avatar_url} /> : <UserRound size={34} />}
            </div>
            <strong>{formatProfileName(publicProfile.profile, publicProfile.profile.user_id)}</strong>
            <div className="profile-facts">
              <span>Lvl {publicProfile.profile.level}</span>
              {publicProfile.relation.isTeam ? <span>{t("profile.visibility.team")}</span> : null}
              {publicProfile.relation.isContact ? <span>{t("profile.visibility.contacts")}</span> : null}
            </div>
            {publicProfile.profile.bio ? <p>{publicProfile.profile.bio}</p> : null}
            {publicProfile.links.length ? (
              <div className="profile-links">
                {publicProfile.links.map((item) => (
                  <a href={item.url} target="_blank" rel="noreferrer" key={item.id}>
                    <ExternalLink size={15} />
                    {item.label ?? readableHost(item.url)}
                  </a>
                ))}
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </section>
  );
}

function HistoryPanel({
  title,
  open,
  loading,
  error,
  emptyText,
  loadingText,
  rowCount,
  onToggle,
  children
}: {
  title: string;
  open: boolean;
  loading: boolean;
  error: string | null;
  emptyText: string;
  loadingText: string;
  rowCount: number;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="history-section">
      <button className="history-toggle" type="button" onClick={onToggle}>
        <span>{title}</span>
        {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
      {open ? (
        <div className="history-body">
          {loading ? <p>{loadingText}</p> : null}
          {error ? <p className="finance-error">{error}</p> : null}
          {!loading && !error && rowCount > 0 ? children : null}
          {!loading && !error && rowCount === 0 ? <p>{emptyText}</p> : null}
        </div>
      ) : null}
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

async function loadTeamRewardsHistory(since?: string): Promise<TeamRewardDay[]> {
  const token = await getAccessToken();
  const params = new URLSearchParams({ limit: "30", ts: String(Date.now()) });
  if (since) params.set("since", since);
  const response = await fetch(`/api/teams/rewards-history?${params.toString()}`, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      "Cache-Control": "no-cache"
    }
  });
  const payload = (await response.json()) as { rows?: TeamRewardDay[]; error?: string };
  if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load team rewards.");
  return payload.rows ?? [];
}

async function loadCoreNotifications(since?: string): Promise<CoreNotificationRow[]> {
  const token = await getAccessToken();
  const params = new URLSearchParams({ limit: "30", ts: String(Date.now()) });
  if (since) params.set("since", since);
  const response = await fetch(`/api/core/accrual-history?${params.toString()}`, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      "Cache-Control": "no-cache"
    }
  });
  const payload = (await response.json()) as { rows?: CoreNotificationRow[]; error?: string };
  if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load core payouts.");
  return payload.rows ?? [];
}

function buildPayoutNotifications(coreRows: CoreNotificationRow[], rewardRows: TeamRewardDay[], locale: AppLocale): PayoutNotification[] {
  const notifications: PayoutNotification[] = [];
  const coreAmount = coreRows.reduce((sum, row) => sum + Number(row.core_amount), 0);
  const walletAmount = coreRows.reduce((sum, row) => sum + Number(row.wallet_amount), 0);
  const teamAmount = rewardRows.reduce((sum, row) => sum + Number(row.reward_amount), 0);

  if (coreRows.length) {
    notifications.push({
      id: "core-payouts",
      title: locale === "ru" ? "Daily rate начислен" : "Daily rate received",
      body: `${locale === "ru" ? "Core" : "Core"} +${formatMoney(coreAmount, locale)} · Wallet +${formatMoney(walletAmount, locale)}`
    });
  }

  if (teamAmount > 0) {
    notifications.push({
      id: "team-bonus",
      title: locale === "ru" ? "Лидерский бонус начислен" : "Team bonus received",
      body: `+${formatMoney(teamAmount, locale)} ${locale === "ru" ? "в Core" : "to Core"}`
    });
  }

  return notifications;
}

function formatDate(value: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function formatDay(value: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00Z`));
}

function formatLeader(teamContext: TeamContext | null, locale: AppLocale): string {
  if (!teamContext?.membership) return locale === "ru" ? "Система" : "System";
  if (teamContext.leader.type === "system") return locale === "ru" ? "Система" : "System";
  return formatProfileName(teamContext.leader.profile, teamContext.membership.leader_user_id ?? "");
}

function formatProfileName(profile: TeamProfile | null, fallback: string): string {
  return profile?.display_name ?? (profile?.username ? `@${profile.username}` : fallback.slice(0, 8));
}

function createProfileEditorState(payload: SocialProfilePayload | null): ProfileEditorState {
  const firstLink = payload?.links[0];
  return {
    bio: payload?.profile?.bio ?? "",
    linkLabel: firstLink?.label ?? "",
    linkUrl: firstLink?.url ?? "",
    linkVisibility: (firstLink?.visibility as ProfileVisibility | undefined) ?? "public",
    visibilitySettings: payload?.visibilitySettings ?? { ...DEFAULT_PROFILE_VISIBILITY_SETTINGS }
  };
}

function visibilityLabelKey(visibility: ProfileVisibility): MessageKey {
  return `profile.visibility.${visibility}` as MessageKey;
}

function profileVisibilityKeyLabel(key: ProfileVisibilityKey): MessageKey {
  return `profile.visibilityBlock.${key}` as MessageKey;
}

function contactSourceLabelKey(source: string): MessageKey {
  if (source === "team_leader") return "profile.contacts.sourceLeader";
  if (source === "team_member") return "profile.contacts.sourceMember";
  return "profile.contacts.sourceManual";
}

function readableHost(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}
