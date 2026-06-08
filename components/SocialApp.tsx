"use client";

import { Bell, BookOpen, ChevronDown, ChevronUp, Copy, Edit3, ExternalLink, Eye, EyeOff, Languages, Link, Newspaper, Save, Send, Share2, Trash2, UserRound, Users, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useUserContext } from "@/components/UserProvider";
import type { AppLocale, MessageKey } from "@/lib/i18n";
import { formatAdaptiveMoney as formatMoney } from "@/lib/moneyFormat";
import { getBrowserSupabaseClient } from "@/lib/supabaseClient";
import { DEFAULT_PROFILE_VISIBILITY_SETTINGS, PROFILE_VISIBILITY_KEYS, PROFILE_VISIBILITY_LEVELS, type ProfileVisibility, type ProfileVisibilityKey, type ProfileVisibilitySettings } from "@/lib/socialProfile";

type SocialTab = "feed" | "blog" | "profile" | "teams";
type SocialTabChange = (tab: SocialTab) => void;
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
  publicWishes: PublicWish[];
  relation: { isSelf: boolean; isContact: boolean; isTeam: boolean; isFollower: boolean };
  visibleBlocks: Record<string, boolean>;
  error?: string;
};
type PublicWish = {
  id: string;
  owner_user_id: string;
  title: string;
  description: string;
  category: string | null;
  image_url: string | null;
  target_amount: number | null;
  target_currency: string;
  difficulty_level: number;
  status: string;
  visibility: string;
  cloned_from_wish_id: string | null;
  original_wish_id: string | null;
  copied_count: number;
  completed_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  viewer_has_copy: boolean;
};
type FeedStatBlock = {
  id: string;
  post_id: string;
  snapshot_id: string;
  block_key: string;
  label: string;
  value: unknown;
  visibility: string;
  sort_order: number;
};
type FeedExternalLink = {
  id: string;
  post_id: string;
  provider: string;
  external_url: string;
  external_post_id: string | null;
  author_handle: string | null;
  title: string | null;
  caption: string | null;
  thumbnail_url: string | null;
  embed_status: string;
  relation: string;
  created_at: string;
  updated_at: string;
};
type FeedPost = {
  id: string;
  author_user_id: string;
  snapshot_id: string | null;
  post_type: string;
  status: "draft" | "published" | "archived";
  visibility: string;
  body: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  deleted_at: string | null;
  author: TeamProfile | null;
  statBlocks: FeedStatBlock[];
  externalLinks: FeedExternalLink[];
};
type FeedPayload = {
  scope: "feed" | "blog";
  author: TeamProfile | null;
  posts: FeedPost[];
  error?: string;
};
type ProfileEditorState = {
  bio: string;
  linkLabel: string;
  linkUrl: string;
  linkVisibility: ProfileVisibility;
  visibilitySettings: ProfileVisibilitySettings;
};

export default function SocialApp({
  activeTab,
  refreshNonce,
  onTabChange
}: {
  activeTab: SocialTab;
  refreshNonce: number;
  onTabChange: SocialTabChange;
}) {
  const { user, profile, core, loading, error, locale, setLocale, t } = useUserContext();
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
  const [copyingWishId, setCopyingWishId] = useState<string | null>(null);
  const [contactSavingId, setContactSavingId] = useState<string | null>(null);
  const [feedPayload, setFeedPayload] = useState<FeedPayload | null>(null);
  const [blogPayload, setBlogPayload] = useState<FeedPayload | null>(null);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedSaving, setFeedSaving] = useState(false);
  const [dailyDraft, setDailyDraft] = useState<FeedPost | null>(null);
  const [externalLinkUrl, setExternalLinkUrl] = useState("");
  const [selectedBlogAuthorId, setSelectedBlogAuthorId] = useState<string | null>(null);
  const [selectedPost, setSelectedPost] = useState<FeedPost | null>(null);

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
    setCopyingWishId(null);
    setContactSavingId(null);
    setFeedPayload(null);
    setBlogPayload(null);
    setFeedLoading(false);
    setFeedSaving(false);
    setDailyDraft(null);
    setExternalLinkUrl("");
    setSelectedBlogAuthorId(null);
    setSelectedPost(null);
  }, [user?.id]);

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

  const loadFeed = useCallback(async () => {
    if (!user) return;
    setFeedLoading(true);
    try {
      const token = await getAccessToken();
      const response = await fetch(`/api/social/feed?scope=feed&ts=${Date.now()}`, {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${token}`,
          "Cache-Control": "no-cache"
        }
      });
      const payload = (await response.json()) as FeedPayload;
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load feed.");
      setFeedPayload(payload);
    } finally {
      setFeedLoading(false);
    }
  }, [user]);

  const loadBlog = useCallback(async () => {
    if (!user) return;
    setFeedLoading(true);
    try {
      const token = await getAccessToken();
      const params = new URLSearchParams({ scope: "blog", ts: String(Date.now()) });
      if (selectedBlogAuthorId) params.set("authorUserId", selectedBlogAuthorId);
      const response = await fetch(`/api/social/feed?${params.toString()}`, {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${token}`,
          "Cache-Control": "no-cache"
        }
      });
      const payload = (await response.json()) as FeedPayload;
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load blog.");
      setBlogPayload(payload);
    } finally {
      setFeedLoading(false);
    }
  }, [selectedBlogAuthorId, user]);

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

    const load = activeTab === "feed" ? loadFeed : activeTab === "blog" ? loadBlog : activeTab === "teams" ? loadTeamContext : loadProfileTab;
    setSocialError(null);
    load().catch((loadError) => {
      console.warn("Social data load failed", loadError);
      setSocialError(loadError instanceof Error ? loadError.message : "Failed to load social data.");
    });
  }, [activeTab, loadBlog, loadFeed, loadProfileTab, loadTeamContext, refreshNonce, user]);

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

  async function copyPublicWishToMine(wish: PublicWish) {
    setCopyingWishId(wish.id);
    setSocialError(null);
    try {
      const token = await getAccessToken();
      const response = await fetch(`/api/wishes/${wish.id}/copy`, {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({})
      });
      const payload = (await response.json()) as { wish?: PublicWish; alreadyCopied?: boolean; error?: string };
      if (!response.ok || payload.error || !payload.wish) throw new Error(payload.error ?? "Failed to copy wish.");

      setPublicProfile((current) => current
        ? {
            ...current,
            publicWishes: current.publicWishes.map((item) => item.id === wish.id
              ? {
                  ...item,
                  viewer_has_copy: true,
                  copied_count: item.copied_count + (payload.alreadyCopied ? 0 : 1)
                }
              : item)
          }
        : current);
    } catch (copyError) {
      console.warn("Public wish copy failed", copyError);
      setSocialError(copyError instanceof Error ? copyError.message : "Failed to copy wish.");
    } finally {
      setCopyingWishId(null);
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

  async function createDailyDraft() {
    setFeedSaving(true);
    setSocialError(null);
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/social/feed/daily-progress/draft", {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({})
      });
      const payload = (await response.json()) as { post?: FeedPost; error?: string };
      if (!response.ok || payload.error || !payload.post) throw new Error(payload.error ?? "Failed to create daily draft.");
      setDailyDraft(payload.post);
      await Promise.all([loadFeed(), loadBlog()]);
    } catch (draftError) {
      console.warn("Daily draft create failed", draftError);
      setSocialError(draftError instanceof Error ? draftError.message : "Failed to create daily draft.");
    } finally {
      setFeedSaving(false);
    }
  }

  async function createExternalLinkPost() {
    const url = externalLinkUrl.trim();
    if (!url) return;

    setFeedSaving(true);
    setSocialError(null);
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/social/feed", {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ url })
      });
      const payload = (await response.json()) as { post?: FeedPost; error?: string };
      if (!response.ok || payload.error || !payload.post) throw new Error(payload.error ?? "Failed to add external link.");
      setExternalLinkUrl("");
      await Promise.all([loadFeed(), loadBlog()]);
    } catch (linkError) {
      console.warn("External link post create failed", linkError);
      setSocialError(linkError instanceof Error ? linkError.message : "Failed to add external link.");
    } finally {
      setFeedSaving(false);
    }
  }

  async function publishPost(post: FeedPost) {
    setFeedSaving(true);
    setSocialError(null);
    try {
      const token = await getAccessToken();
      const response = await fetch(`/api/social/feed/posts/${post.id}`, {
        method: "PATCH",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          action: "publish",
          body: post.body,
          visibility: post.visibility,
          statBlocks: post.statBlocks.map((block) => ({
            blockKey: block.block_key,
            visibility: block.visibility === "public" ? "public" : "private"
          }))
        })
      });
      const payload = (await response.json()) as { post?: FeedPost; error?: string };
      if (!response.ok || payload.error || !payload.post) throw new Error(payload.error ?? "Failed to publish post.");
      const updatedPost = payload.post;
      setDailyDraft((current) => current?.id === updatedPost.id ? updatedPost : current);
      setSelectedPost((current) => current?.id === updatedPost.id ? updatedPost : current);
      await Promise.all([loadFeed(), loadBlog()]);
    } catch (publishError) {
      console.warn("Feed post publish failed", publishError);
      setSocialError(publishError instanceof Error ? publishError.message : "Failed to publish post.");
    } finally {
      setFeedSaving(false);
    }
  }

  async function deletePost(post: FeedPost) {
    if (!window.confirm(t("social.post.deleteConfirm", { title: post.body ?? t("social.post.detail") }))) return;

    setFeedSaving(true);
    setSocialError(null);
    try {
      const token = await getAccessToken();
      const response = await fetch(`/api/social/feed/posts/${post.id}`, {
        method: "DELETE",
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` }
      });
      const payload = (await response.json()) as { deletedPostId?: string; error?: string };
      if (!response.ok || payload.error || !payload.deletedPostId) throw new Error(payload.error ?? "Failed to delete post.");
      setDailyDraft((current) => current?.id === post.id ? null : current);
      setSelectedPost((current) => current?.id === post.id ? null : current);
      await Promise.all([loadFeed(), loadBlog()]);
    } catch (deleteError) {
      console.warn("Feed post delete failed", deleteError);
      setSocialError(deleteError instanceof Error ? deleteError.message : "Failed to delete post.");
    } finally {
      setFeedSaving(false);
    }
  }

  function updateDailyDraftBody(body: string) {
    setDailyDraft((current) => current ? { ...current, body } : current);
  }

  function toggleDailyDraftBlock(blockKey: string) {
    setDailyDraft((current) => current ? {
      ...current,
      statBlocks: current.statBlocks.map((block) => block.block_key === blockKey
        ? { ...block, visibility: block.visibility === "public" ? "private" : "public" }
        : block)
    } : current);
  }

  function openAuthorBlog(authorUserId: string) {
    setSelectedBlogAuthorId(authorUserId === user?.id ? null : authorUserId);
    onTabChange("blog");
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
      {activeTab === "feed" && !user && !loading ? (
        <section className="profile-panel">
          <div className="profile-avatar placeholder">
            <Newspaper size={34} />
          </div>
          <strong>{t("social.feed.title")}</strong>
          <p>{t("profile.registrationRequired")}</p>
        </section>
      ) : null}

      {activeTab === "feed" && user ? (
        <FeedView
          currentUserId={user.id}
          dailyDraft={dailyDraft}
          externalLinkUrl={externalLinkUrl}
          feedPayload={feedPayload}
          loading={feedLoading}
          saving={feedSaving}
          locale={locale}
          t={t}
          onCreateDraft={createDailyDraft}
          onCreateExternalLink={createExternalLinkPost}
          onDraftBodyChange={updateDailyDraftBody}
          onExternalLinkUrlChange={setExternalLinkUrl}
          onOpenAuthor={openPublicProfile}
          onOpenBlog={openAuthorBlog}
          onOpenPost={setSelectedPost}
          onDeletePost={deletePost}
          onPublish={publishPost}
          onToggleDraftBlock={toggleDailyDraftBlock}
        />
      ) : null}

      {activeTab === "blog" && !user && !loading ? (
        <section className="profile-panel">
          <div className="profile-avatar placeholder">
            <BookOpen size={34} />
          </div>
          <strong>{t("social.blog.title")}</strong>
          <p>{t("profile.registrationRequired")}</p>
        </section>
      ) : null}

      {activeTab === "blog" && user ? (
        <BlogView
          blogPayload={blogPayload}
          currentUserId={user.id}
          loading={feedLoading}
          locale={locale}
          saving={feedSaving}
          selectedBlogAuthorId={selectedBlogAuthorId}
          t={t}
          onOpenAuthor={openPublicProfile}
          onOpenOwnBlog={() => setSelectedBlogAuthorId(null)}
          onOpenPost={setSelectedPost}
          onDeletePost={deletePost}
          onPublish={publishPost}
        />
      ) : null}

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
            {publicProfile.publicWishes.length ? (
              <PublicWishesPanel
                copyingWishId={copyingWishId}
                isSelf={publicProfile.relation.isSelf}
                locale={locale}
                t={t}
                wishes={publicProfile.publicWishes}
                onCopy={copyPublicWishToMine}
              />
            ) : null}
          </section>
        </div>
      ) : null}
      {selectedPost ? (
        <PostDetailModal
          currentUserId={user?.id ?? null}
          locale={locale}
          post={selectedPost}
          t={t}
          onClose={() => setSelectedPost(null)}
          onDeletePost={deletePost}
          onOpenAuthor={openPublicProfile}
          onOpenBlog={openAuthorBlog}
        />
      ) : null}
    </section>
  );
}

function PublicWishesPanel({
  copyingWishId,
  isSelf,
  locale,
  t,
  wishes,
  onCopy
}: {
  copyingWishId: string | null;
  isSelf: boolean;
  locale: AppLocale;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  wishes: PublicWish[];
  onCopy: (wish: PublicWish) => void;
}) {
  return (
    <section className="public-wishes-panel">
      <h3>{t("wishes.publicTitle")}</h3>
      <div className="public-wish-list">
        {wishes.map((wish) => (
          <article className="public-wish-card" key={wish.id}>
            {wish.image_url ? <img alt="" src={wish.image_url} /> : <span className="public-wish-placeholder">{wish.title.slice(0, 1)}</span>}
            <div>
              <strong>{wish.title}</strong>
              {wish.description ? <p>{wish.description}</p> : null}
              <div className="public-wish-meta">
                {wish.category ? <span>{wish.category}</span> : null}
                {wish.target_amount ? <span>{formatWishAmount(wish, locale)}</span> : null}
                <span>{t("wishes.level", { level: wish.difficulty_level })}</span>
                <span>{t("wishes.copiedCount", { count: wish.copied_count })}</span>
              </div>
            </div>
            {!isSelf ? (
              <button
                className="secondary-button"
                type="button"
                disabled={copyingWishId === wish.id || wish.viewer_has_copy}
                onClick={() => onCopy(wish)}
              >
                <Copy size={15} />
                {wish.viewer_has_copy ? t("wishes.addedToMine") : copyingWishId === wish.id ? t("wishes.saving") : t("wishes.addToMine")}
              </button>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function FeedView({
  currentUserId,
  dailyDraft,
  externalLinkUrl,
  feedPayload,
  loading,
  saving,
  locale,
  t,
  onCreateDraft,
  onCreateExternalLink,
  onDraftBodyChange,
  onExternalLinkUrlChange,
  onOpenAuthor,
  onOpenBlog,
  onOpenPost,
  onDeletePost,
  onPublish,
  onToggleDraftBlock
}: {
  currentUserId: string;
  dailyDraft: FeedPost | null;
  externalLinkUrl: string;
  feedPayload: FeedPayload | null;
  loading: boolean;
  saving: boolean;
  locale: AppLocale;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  onCreateDraft: () => void;
  onCreateExternalLink: () => void;
  onDraftBodyChange: (body: string) => void;
  onExternalLinkUrlChange: (url: string) => void;
  onOpenAuthor: (userId: string) => void;
  onOpenBlog: (userId: string) => void;
  onOpenPost: (post: FeedPost) => void;
  onDeletePost: (post: FeedPost) => void;
  onPublish: (post: FeedPost) => void;
  onToggleDraftBlock: (blockKey: string) => void;
}) {
  const posts = feedPayload?.posts ?? [];

  return (
    <section className="feed-layout">
      <section className="feed-composer">
        <div className="section-heading-row">
          <span>{t("social.feed.dailyDraft")}</span>
          <button className="secondary-button" type="button" disabled={saving} onClick={onCreateDraft}>
            <Newspaper size={16} />
            {t("social.feed.createDraft")}
          </button>
        </div>
        {dailyDraft ? (
          <DailyDraftEditor
            locale={locale}
            post={dailyDraft}
            saving={saving}
            t={t}
            onBodyChange={onDraftBodyChange}
            onPublish={() => onPublish(dailyDraft)}
            onToggleBlock={onToggleDraftBlock}
          />
        ) : null}
        <ExternalLinkComposer
          saving={saving}
          t={t}
          url={externalLinkUrl}
          onSubmit={onCreateExternalLink}
          onUrlChange={onExternalLinkUrlChange}
        />
      </section>
      <PostList
        currentUserId={currentUserId}
        emptyText={t("social.feed.empty")}
        loading={loading}
        locale={locale}
        posts={posts}
        showBlogAction={true}
        t={t}
        onOpenAuthor={onOpenAuthor}
        onOpenBlog={onOpenBlog}
        onOpenPost={onOpenPost}
        onDeletePost={onDeletePost}
        onPublish={onPublish}
      />
    </section>
  );
}

function ExternalLinkComposer({
  saving,
  t,
  url,
  onSubmit,
  onUrlChange
}: {
  saving: boolean;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  url: string;
  onSubmit: () => void;
  onUrlChange: (url: string) => void;
}) {
  return (
    <form className="external-link-composer" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
      <label htmlFor="external-link-url">{t("social.feed.externalLink")}</label>
      <div>
        <input
          id="external-link-url"
          inputMode="url"
          maxLength={1000}
          placeholder={t("social.feed.externalLinkPlaceholder")}
          type="url"
          value={url}
          onChange={(event) => onUrlChange(event.target.value)}
        />
        <button className="finance-small-icon-button primary" type="submit" disabled={saving || !url.trim()} aria-label={t("social.feed.addExternalLink")}>
          <ExternalLink size={15} />
        </button>
      </div>
    </form>
  );
}

function BlogView({
  blogPayload,
  currentUserId,
  loading,
  locale,
  saving,
  selectedBlogAuthorId,
  t,
  onOpenAuthor,
  onOpenOwnBlog,
  onOpenPost,
  onDeletePost,
  onPublish
}: {
  blogPayload: FeedPayload | null;
  currentUserId: string;
  loading: boolean;
  locale: AppLocale;
  saving: boolean;
  selectedBlogAuthorId: string | null;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  onOpenAuthor: (userId: string) => void;
  onOpenOwnBlog: () => void;
  onOpenPost: (post: FeedPost) => void;
  onDeletePost: (post: FeedPost) => void;
  onPublish: (post: FeedPost) => void;
}) {
  const posts = blogPayload?.posts ?? [];
  const author = blogPayload?.author ?? posts[0]?.author ?? null;
  const title = selectedBlogAuthorId ? formatProfileName(author, selectedBlogAuthorId) : t("social.blog.mine");

  return (
    <section className="feed-layout">
      <section className="blog-heading">
        <div>
          <span>{t("social.blog.title")}</span>
          <strong>{title}</strong>
        </div>
        {selectedBlogAuthorId && selectedBlogAuthorId !== currentUserId ? (
          <button className="secondary-button" type="button" onClick={onOpenOwnBlog}>
            <UserRound size={16} />
            {t("social.blog.mine")}
          </button>
        ) : null}
      </section>
      <PostList
        currentUserId={currentUserId}
        emptyText={t("social.blog.empty")}
        loading={loading}
        locale={locale}
        posts={posts}
        saving={saving}
        showBlogAction={false}
        t={t}
        onOpenAuthor={onOpenAuthor}
        onOpenBlog={onOpenAuthor}
        onOpenPost={onOpenPost}
        onDeletePost={onDeletePost}
        onPublish={onPublish}
      />
    </section>
  );
}

function DailyDraftEditor({
  locale,
  post,
  saving,
  t,
  onBodyChange,
  onPublish,
  onToggleBlock
}: {
  locale: AppLocale;
  post: FeedPost;
  saving: boolean;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  onBodyChange: (body: string) => void;
  onPublish: () => void;
  onToggleBlock: (blockKey: string) => void;
}) {
  return (
    <div className="daily-draft-editor">
      <textarea value={post.body ?? ""} maxLength={700} onChange={(event) => onBodyChange(event.target.value)} />
      <div className="stat-block-picker-heading">
        <span>{t("social.post.visibilitySettings")}</span>
      </div>
      <div className="stat-block-picker">
        {post.statBlocks.map((block) => {
          const isPublic = block.visibility === "public";
          const blockLabel = t(statBlockLabelKey(block.block_key));
          return (
            <button
              aria-label={t(isPublic ? "social.post.hideBlock" : "social.post.showBlock", { block: blockLabel })}
              aria-pressed={isPublic}
              className={statBlockClassName(block, "stat-block-toggle", isPublic)}
              type="button"
              key={block.id}
              onClick={() => onToggleBlock(block.block_key)}
            >
              <span>{blockLabel}</span>
              <strong>{formatStatBlockValue(block, locale)}</strong>
              <small>
                {isPublic ? <Eye size={13} /> : <EyeOff size={13} />}
                {t(isPublic ? "social.post.publicBlock" : "social.post.privateBlock")}
              </small>
            </button>
          );
        })}
      </div>
      <button className="secondary-button primary-social-action" type="button" disabled={saving || post.status === "published"} onClick={onPublish}>
        <Send size={16} />
        {t("social.feed.publish")}
      </button>
    </div>
  );
}

function PostList({
  currentUserId,
  emptyText,
  loading,
  locale,
  posts,
  saving,
  showBlogAction,
  t,
  onOpenAuthor,
  onOpenBlog,
  onOpenPost,
  onDeletePost,
  onPublish
}: {
  currentUserId: string;
  emptyText: string;
  loading: boolean;
  locale: AppLocale;
  posts: FeedPost[];
  saving?: boolean;
  showBlogAction: boolean;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  onOpenAuthor: (userId: string) => void;
  onOpenBlog: (userId: string) => void;
  onOpenPost: (post: FeedPost) => void;
  onDeletePost: (post: FeedPost) => void;
  onPublish: (post: FeedPost) => void;
}) {
  if (loading) return <p className="finance-error neutral">{t("app.common.loading")}</p>;
  if (!posts.length) return <p className="feed-empty">{emptyText}</p>;

  return (
    <div className="feed-post-list">
      {posts.map((post) => (
        <PostCard
          currentUserId={currentUserId}
          key={post.id}
          locale={locale}
          post={post}
          saving={Boolean(saving)}
          showBlogAction={showBlogAction}
          t={t}
          onOpenAuthor={onOpenAuthor}
          onOpenBlog={onOpenBlog}
          onOpenPost={onOpenPost}
          onDeletePost={onDeletePost}
          onPublish={onPublish}
        />
      ))}
    </div>
  );
}

function PostCard({
  currentUserId,
  locale,
  post,
  saving,
  showBlogAction,
  t,
  onOpenAuthor,
  onOpenBlog,
  onOpenPost,
  onDeletePost,
  onPublish
}: {
  currentUserId: string;
  locale: AppLocale;
  post: FeedPost;
  saving: boolean;
  showBlogAction: boolean;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  onOpenAuthor: (userId: string) => void;
  onOpenBlog: (userId: string) => void;
  onOpenPost: (post: FeedPost) => void;
  onDeletePost: (post: FeedPost) => void;
  onPublish: (post: FeedPost) => void;
}) {
  const canDelete = post.author_user_id === currentUserId;

  return (
    <article className="feed-post-card">
      <header>
        <button className="feed-author" type="button" onClick={() => { void onOpenAuthor(post.author_user_id); }}>
          <span className="feed-author-avatar">
            {post.author?.avatar_url ? <img alt="" src={post.author.avatar_url} /> : <UserRound size={18} />}
          </span>
          <span>{formatProfileName(post.author, post.author_user_id)}</span>
        </button>
        <small>{formatPostDate(post, locale)}</small>
      </header>
      <button className="feed-post-body" type="button" onClick={() => onOpenPost(post)}>
        <p>{post.body ?? t("social.post.detail")}</p>
        <StatBlockGrid blocks={post.statBlocks} locale={locale} t={t} />
      </button>
      <ExternalLinkPreview post={post} />
      <footer>
        <span className={`post-status ${post.status}`}>{t(postStatusLabelKey(post.status))}</span>
        <div className="feed-card-actions">
          {showBlogAction ? (
            <button className="finance-small-icon-button" type="button" aria-label={t("social.feed.openBlog")} onClick={() => onOpenBlog(post.author_user_id)}>
              <BookOpen size={15} />
            </button>
          ) : null}
          {post.status === "draft" ? (
            <button className="finance-small-icon-button primary" type="button" disabled={saving} aria-label={t("social.feed.publish")} onClick={() => onPublish(post)}>
              <Send size={15} />
            </button>
          ) : null}
          {canDelete ? (
            <button className="finance-small-icon-button danger" type="button" disabled={saving} aria-label={t("social.post.delete")} onClick={() => onDeletePost(post)}>
              <Trash2 size={15} />
            </button>
          ) : null}
        </div>
      </footer>
    </article>
  );
}

function PostDetailModal({
  currentUserId,
  locale,
  post,
  t,
  onClose,
  onDeletePost,
  onOpenAuthor,
  onOpenBlog
}: {
  currentUserId: string | null;
  locale: AppLocale;
  post: FeedPost;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  onClose: () => void;
  onDeletePost: (post: FeedPost) => void;
  onOpenAuthor: (userId: string) => void;
  onOpenBlog: (userId: string) => void;
}) {
  const canDelete = post.author_user_id === currentUserId;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="modal-sheet post-detail-modal" role="dialog" aria-modal="true" aria-label={t("social.post.detail")} onClick={(event) => event.stopPropagation()}>
        <button className="modal-close" type="button" aria-label={t("app.common.close")} onClick={onClose}>
          <X size={18} />
        </button>
        <button className="feed-author detail-author" type="button" onClick={() => { void onOpenAuthor(post.author_user_id); }}>
          <span className="feed-author-avatar">
            {post.author?.avatar_url ? <img alt="" src={post.author.avatar_url} /> : <UserRound size={18} />}
          </span>
          <span>{formatProfileName(post.author, post.author_user_id)}</span>
        </button>
        <h2>{post.body ?? t("social.post.detail")}</h2>
        <span className={`post-status ${post.status}`}>{t(postStatusLabelKey(post.status))} - {formatPostDate(post, locale)}</span>
        <StatBlockGrid blocks={post.statBlocks} locale={locale} t={t} />
        <ExternalLinkPreview post={post} />
        <div className="post-detail-actions">
          <button className="secondary-button" type="button" onClick={() => onOpenBlog(post.author_user_id)}>
            <BookOpen size={16} />
            {t("social.feed.openBlog")}
          </button>
          {canDelete ? (
            <button className="finance-small-icon-button danger" type="button" aria-label={t("social.post.delete")} onClick={() => onDeletePost(post)}>
              <Trash2 size={15} />
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function ExternalLinkPreview({ post }: { post: FeedPost }) {
  const externalLink = post.externalLinks?.[0];
  if (!externalLink) return null;

  return (
    <a className="external-link-preview" href={externalLink.external_url} target="_blank" rel="noreferrer">
      <span>{formatProviderLabel(externalLink.provider)}</span>
      <strong>{externalLink.title ?? externalLink.external_url}</strong>
      {externalLink.author_handle ? <small>{externalLink.author_handle}</small> : null}
      <ExternalLink size={15} />
    </a>
  );
}

function StatBlockGrid({ blocks, locale, t }: { blocks: FeedStatBlock[]; locale: AppLocale; t: (key: MessageKey, values?: Record<string, string | number>) => string }) {
  if (!blocks.length) return null;
  return (
    <div className="post-stat-grid">
      {blocks.map((block) => (
        <span className={statBlockClassName(block, "post-stat-block")} key={block.id}>
          <small>{t(statBlockLabelKey(block.block_key))}</small>
          <strong>{formatStatBlockValue(block, locale)}</strong>
        </span>
      ))}
    </div>
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

function postStatusLabelKey(status: FeedPost["status"]): MessageKey {
  if (status === "published") return "social.post.published";
  if (status === "archived") return "social.post.archived";
  return "social.post.draft";
}

function statBlockLabelKey(blockKey: string): MessageKey {
  if (blockKey === "level") return "social.post.level";
  if (blockKey === "total_core_growth") return "social.post.totalCoreGrowth";
  if (blockKey === "team_strength") return "social.post.teamStrength";
  if (blockKey === "core_growth") return "social.post.coreGrowth";
  if (blockKey === "wallet_income") return "social.post.walletIncome";
  if (blockKey === "daily_rate") return "social.post.dailyRate";
  if (blockKey === "reinvest") return "social.post.reinvest";
  return "social.post.detail";
}

function formatPostDate(post: FeedPost, locale: AppLocale): string {
  return formatDate(post.published_at ?? post.created_at, locale);
}

function formatWishAmount(wish: PublicWish, locale: AppLocale): string {
  return `${formatMoney(wish.target_amount ?? 0, locale)} ${wish.target_currency}`;
}

function formatProviderLabel(provider: string): string {
  if (provider === "tiktok") return "TikTok";
  if (provider === "instagram") return "Instagram";
  if (provider === "telegram") return "Telegram";
  if (provider === "youtube") return "YouTube";
  if (provider === "x") return "X";
  return "Website";
}

function formatStatBlockValue(block: FeedStatBlock, locale: AppLocale): string {
  if (block.block_key === "level") {
    const levelAfter = readValueNumber(block.value, "levelAfter");
    const levelBefore = readValueNumber(block.value, "levelBefore");
    const leveledUp = Boolean(readValue(block.value, "leveledUp"));
    if (!Number.isFinite(levelAfter)) return "Lvl 0";
    return leveledUp && Number.isFinite(levelBefore) ? `Lvl ${levelBefore} -> ${levelAfter}` : `Lvl ${levelAfter}`;
  }

  if (block.block_key === "total_core_growth") {
    const amount = readValueNumber(block.value, "amount");
    return `+${formatMoney(Number.isFinite(amount) ? amount : 0, locale)}`;
  }

  if (block.block_key === "team_strength") {
    const levelSum = readValueNumber(block.value, "levelSum");
    const memberCount = readValueNumber(block.value, "memberCount");
    const members = Number.isFinite(memberCount) ? memberCount : 0;
    const strength = Number.isFinite(levelSum) ? levelSum : 0;
    return `${strength} LVL / ${members}`;
  }

  if (block.block_key === "daily_rate" || block.block_key === "reinvest") {
    const percent = readValueNumber(block.value, "percent");
    return Number.isFinite(percent) ? formatPercentValue(percent) : "0%";
  }

  const amount = readValueNumber(block.value, "amount");
  return formatMoney(Number.isFinite(amount) ? amount : 0, locale);
}

function statBlockClassName(block: FeedStatBlock, baseClassName: string, active = false): string {
  const classNames = [baseClassName];
  if (active) classNames.push("active");
  if (block.block_key === "level" && Boolean(readValue(block.value, "leveledUp"))) classNames.push("level-up");
  return classNames.join(" ");
}

function readValue(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return (value as Record<string, unknown>)[key];
}

function readValueNumber(value: unknown, key: string): number {
  const raw = readValue(value, key);
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function formatPercentValue(value: number): string {
  const percent = Math.abs(value) <= 1 ? value * 100 : value;
  return `${percent.toLocaleString("en-US", { maximumFractionDigits: 4 })}%`;
}

function readableHost(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}
