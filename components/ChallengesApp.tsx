"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock3, ShieldCheck, Trophy } from "lucide-react";
import { getOrCreateLocalGuest } from "@/lib/guestIdentity";
import { getBrowserSupabaseClient, signInWithGoogle } from "@/lib/supabaseClient";
import { useUserContext } from "@/components/UserProvider";
import type { AppLocale, MessageKey } from "@/lib/i18n";

type LocaleText = Record<string, string> | null;
type RewardLabel = LocaleText | string | number | null;
type ChallengeStatus = "accepted" | "completed" | "declined" | "failed";
type TFunction = (key: MessageKey, values?: Record<string, string | number>) => string;

type Challenge = {
  id: string;
  title: LocaleText;
  description: LocaleText;
  instructions: LocaleText;
  requirements: LocaleText;
  reward_label: RewardLabel;
  category: string;
  difficulty_level: number;
  duration_days: number | null;
  image_url: string | null;
  verification_type: "auto" | "manual" | "community";
  verification_logic: string | null;
  sort_order: number;
  user_challenge_status?: ChallengeStatus | null;
};

type ChallengesResponse = {
  challenges?: Challenge[];
  error?: string;
};

type CheckChallengeResponse = {
  status?: ChallengeStatus;
  completed?: boolean;
  message?: string;
  rewardAmount?: number;
  rewardAccount?: string;
  rewardClaimed?: boolean;
  error?: string;
};

const DEFAULT_USER_LEVEL = 1;

type ChallengesAppProps = {
  refreshNonce: number;
};

export default function ChallengesApp({ refreshNonce }: ChallengesAppProps) {
  const [acceptedChallenges, setAcceptedChallenges] = useState<Challenge[]>([]);
  const [completedChallenges, setCompletedChallenges] = useState<Challenge[]>([]);
  const [availableChallenges, setAvailableChallenges] = useState<Challenge[]>([]);
  const [selectedChallenge, setSelectedChallenge] = useState<Challenge | null>(null);
  const [completionReward, setCompletionReward] = useState<{ amount: number; account: string; claimed: boolean } | null>(null);
  const [completedOpen, setCompletedOpen] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "offline">("loading");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { user, profile, core, locale, refreshUserData, t } = useUserContext();
  const userLevel = core?.level ?? profile?.level ?? DEFAULT_USER_LEVEL;

  const loadChallenges = useCallback(async ({ isMounted = () => true }: { isMounted?: () => boolean } = {}) => {
    if (!navigator.onLine) {
      setAvailableChallenges([]);
      setAcceptedChallenges([]);
      setCompletedChallenges([]);
      setStatus("offline");
      return;
    }

    setIsRefreshing(true);

    try {
      const supabase = getBrowserSupabaseClient();
      const {
        data: { session }
      } = await supabase.auth.getSession();
      const headers = new Headers({
        "Cache-Control": "no-cache"
      });

      if (session?.access_token) {
        headers.set("Authorization", `Bearer ${session.access_token}`);
      }

      const response = await fetch(`/api/challenges?ts=${Date.now()}`, {
        cache: "no-store",
        headers
      });
      const payload = (await response.json()) as ChallengesResponse;

      if (!response.ok || payload.error) {
        throw new Error(payload.error ?? "Failed to load challenges.");
      }

      if (!isMounted()) return;

      const nextChallenges = payload.challenges ?? [];
      const serverCompletedChallenges = nextChallenges.filter(isCompletedChallenge);
      const serverAcceptedChallenges = nextChallenges.filter(isActiveChallenge);
      const acceptedIds = new Set(serverAcceptedChallenges.map((challenge) => challenge.id));
      const completedIds = new Set(serverCompletedChallenges.map((challenge) => challenge.id));

      setAcceptedChallenges(serverAcceptedChallenges);
      setCompletedChallenges(serverCompletedChallenges);
      setAvailableChallenges(nextChallenges.filter((challenge) => !acceptedIds.has(challenge.id) && !completedIds.has(challenge.id)));
      setStatus("ready");
    } catch {
      if (isMounted()) {
        setAvailableChallenges([]);
        setAcceptedChallenges([]);
        setCompletedChallenges([]);
        setStatus("offline");
      }
    } finally {
      if (isMounted()) setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedChallenge && !completionReward) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [completionReward, selectedChallenge]);

  useEffect(() => {
    let mounted = true;

    loadChallenges({ isMounted: () => mounted });
    return () => {
      mounted = false;
    };
  }, [loadChallenges, refreshNonce, user?.id]);

  useEffect(() => {
    let mounted = true;

    const refreshVisibleChallenges = () => {
      if (document.visibilityState === "visible") {
        loadChallenges({ isMounted: () => mounted });
      }
    };

    window.addEventListener("focus", refreshVisibleChallenges);
    document.addEventListener("visibilitychange", refreshVisibleChallenges);

    return () => {
      mounted = false;
      window.removeEventListener("focus", refreshVisibleChallenges);
      document.removeEventListener("visibilitychange", refreshVisibleChallenges);
    };
  }, [loadChallenges]);

  function acceptChallenge(challenge: Challenge) {
    const acceptedChallenge: Challenge = { ...challenge, user_challenge_status: "accepted" };
    const nextAcceptedChallenges = mergeAcceptedChallenges(acceptedChallenges, acceptedChallenge);
    setAcceptedChallenges(nextAcceptedChallenges);
    setAvailableChallenges((challenges) => challenges.filter((item) => item.id !== challenge.id));
    setSelectedChallenge(null);
  }

  function completeChallenge(challenge: Challenge, reward: { amount: number; account: string; claimed: boolean }) {
    const completedChallenge: Challenge = {
      ...challenge,
      user_challenge_status: "completed"
    };
    const nextAcceptedChallenges = acceptedChallenges.filter((item) => item.id !== completedChallenge.id);
    const nextCompletedChallenges = [completedChallenge, ...completedChallenges.filter((item) => item.id !== completedChallenge.id)];

    setAcceptedChallenges(nextAcceptedChallenges);
    setCompletedChallenges(nextCompletedChallenges);
    setAvailableChallenges((challenges) => challenges.filter((item) => item.id !== challenge.id));
    setSelectedChallenge(completedChallenge);
    setCompletionReward(reward);
  }

  if (completedOpen) {
    return (
      <>
        <ChallengeArchiveScreen
          challenges={completedChallenges}
          locale={locale}
          userLevel={userLevel}
          t={t}
          onBack={() => {
            setCompletedOpen(false);
            setSelectedChallenge(null);
          }}
          onOpen={(challenge) => setSelectedChallenge(challenge)}
        />

        {selectedChallenge ? (
          <ChallengeDetailModal
            challenge={selectedChallenge}
            isRegistered={Boolean(user)}
            locale={locale}
            userLevel={userLevel}
            t={t}
            onAccept={() => acceptChallenge(selectedChallenge)}
            onClose={() => setSelectedChallenge(null)}
            onComplete={completeChallenge}
            onRefreshUserData={refreshUserData}
          />
        ) : null}

        {completionReward ? <ChallengeCompleteModal reward={completionReward} t={t} onClose={() => setCompletionReward(null)} /> : null}
      </>
    );
  }

  return (
    <section className="challenges-screen">
      <header className="challenges-header">
        <div>
          <span>Challenges</span>
          <h1>{t("challenges.title")}</h1>
        </div>
        {isRefreshing ? <small>{t("wishes.refreshing")}</small> : null}
      </header>

      {status === "loading" ? <ChallengeState title={t("app.common.loading")} description={t("challenges.loading.description")} /> : null}
      {status === "offline" ? <ChallengeState title={t("app.common.offline")} description={t("challenges.offline.description")} /> : null}

      <ChallengeSection challenges={availableChallenges} emptyMessage={t("challenges.emptyArchive")} locale={locale} title={t("challenges.available")} userLevel={userLevel} t={t} onOpen={(challenge) => setSelectedChallenge(challenge)} />

      <ChallengeSection challenges={acceptedChallenges} emptyMessage={t("challenges.emptyArchive")} locale={locale} title={t("challenges.accepted")} userLevel={userLevel} t={t} onOpen={(challenge) => setSelectedChallenge(challenge)} />

      <section className="challenge-section">
        <button className="challenge-archive-link" type="button" onClick={() => {
          loadChallenges();
          setCompletedOpen(true);
        }}>
          <span>{t("challenges.completedPlural")}</span>
          <strong>{completedChallenges.length}</strong>
        </button>
      </section>

      {selectedChallenge ? (
        <ChallengeDetailModal
          challenge={selectedChallenge}
          isRegistered={Boolean(user)}
          locale={locale}
          userLevel={userLevel}
          t={t}
          onAccept={() => acceptChallenge(selectedChallenge)}
          onClose={() => setSelectedChallenge(null)}
          onComplete={completeChallenge}
          onRefreshUserData={refreshUserData}
        />
      ) : null}

      {completionReward ? <ChallengeCompleteModal reward={completionReward} t={t} onClose={() => setCompletionReward(null)} /> : null}
    </section>
  );
}

function ChallengeArchiveScreen({
  challenges,
  locale,
  userLevel,
  t,
  onBack,
  onOpen
}: {
  challenges: Challenge[];
  locale: AppLocale;
  userLevel: number;
  t: TFunction;
  onBack: () => void;
  onOpen: (challenge: Challenge) => void;
}) {
  return (
    <section className="challenges-screen challenge-archive-screen">
      <header className="task-archive-topbar">
        <button className="back-button" type="button" onClick={onBack}>{"\u2039"}</button>
        <h1>{t("challenges.completedPlural")}</h1>
      </header>

      {challenges.length === 0 ? (
        <div className="task-empty">{t("challenges.emptyArchive")}</div>
      ) : (
        <div className="challenge-list">
          {challenges.map((challenge) => (
            <ChallengeRow challenge={challenge} key={challenge.id} locale={locale} userLevel={userLevel} t={t} onOpen={() => onOpen(challenge)} />
          ))}
        </div>
      )}
    </section>
  );
}

function ChallengeSection({
  challenges,
  emptyMessage,
  locale,
  title,
  userLevel,
  t,
  onOpen
}: {
  challenges: Challenge[];
  emptyMessage: string;
  locale: AppLocale;
  title: string;
  userLevel: number;
  t: TFunction;
  onOpen: (challenge: Challenge) => void;
}) {
  return (
    <section className="challenge-section">
      <h2>{title}</h2>
      {challenges.length === 0 ? (
        <div className="task-empty">{emptyMessage}</div>
      ) : (
        <div className="challenge-list">
          {challenges.map((challenge) => (
            <ChallengeRow challenge={challenge} key={challenge.id} locale={locale} userLevel={userLevel} t={t} onOpen={() => onOpen(challenge)} />
          ))}
        </div>
      )}
    </section>
  );
}

function ChallengeRow({ challenge, locale, userLevel, t, onOpen }: { challenge: Challenge; locale: AppLocale; userLevel: number; t: TFunction; onOpen: () => void }) {
  const accepted = isActiveChallenge(challenge);
  const completed = challenge.user_challenge_status === "completed";
  const locked = !accepted && !completed && challenge.difficulty_level > userLevel;

  return (
    <button className={locked ? "challenge-row locked" : "challenge-row"} type="button" onClick={onOpen}>
      <span className="challenge-thumb">
        {challenge.image_url ? <img alt="" src={challenge.image_url} loading="lazy" /> : <Trophy size={24} />}
      </span>
      <span className="challenge-row-body">
        <span className="challenge-row-title">{text(challenge.title, t("challenges.challenge"), locale)}</span>
        <small>{completed ? t("challenges.completed") : text(challenge.description, "", locale)}</small>
        <span className="challenge-meta">
          <span>{rewardText(challenge.reward_label, locale)}</span>
          <span className={locked ? "challenge-level locked-level" : "challenge-level"}>Lvl {challenge.difficulty_level}</span>
          {challenge.duration_days ? <span>{challenge.duration_days} {t("app.common.days.short")}</span> : null}
          {completed ? <span>{t("challenges.done")}</span> : null}
        </span>
      </span>
    </button>
  );
}

function ChallengeDetailModal({
  challenge,
  isRegistered,
  locale,
  userLevel,
  t,
  onAccept,
  onClose,
  onComplete,
  onRefreshUserData
}: {
  challenge: Challenge;
  isRegistered: boolean;
  locale: AppLocale;
  userLevel: number;
  t: TFunction;
  onAccept: () => void;
  onClose: () => void;
  onComplete: (challenge: Challenge, reward: { amount: number; account: string; claimed: boolean }) => void;
  onRefreshUserData: () => Promise<void>;
}) {
  const signupChallenge = challenge.verification_logic === "signup";
  const completed = challenge.user_challenge_status === "completed";
  const accepted = isActiveChallenge(challenge);
  const locked = !accepted && challenge.difficulty_level > userLevel;
  const [authStatus, setAuthStatus] = useState<"idle" | "loading" | "error">("idle");
  const [checkStatus, setCheckStatus] = useState<"idle" | "loading" | "error">("idle");
  const [checkMessage, setCheckMessage] = useState<string | null>(null);

  async function handleSignup() {
    setAuthStatus("loading");
    try {
      await getOrCreateLocalGuest();
      await signInWithGoogle();
    } catch (error) {
      console.error(error);
      setAuthStatus("error");
    }
  }

  async function handleCheck() {
    setCheckStatus("loading");
    setCheckMessage(null);
    try {
      const supabase = getBrowserSupabaseClient();
      const {
        data: { session },
        error
      } = await supabase.auth.getSession();

      if (error) throw error;
      if (!session?.access_token) {
        setCheckMessage(t("challenges.signInFirst"));
        setCheckStatus("idle");
        return;
      }

      const response = await fetch("/api/challenges/check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ challengeId: challenge.id })
      });
      const payload = (await response.json()) as CheckChallengeResponse;

      if (!response.ok || payload.error) {
        throw new Error(payload.error ?? t("challenges.checkFailed"));
      }

      if (!payload.completed) {
        setCheckMessage(payload.message ?? t("challenges.checkPending"));
        setCheckStatus("idle");
        return;
      }

      const reward = {
        amount: payload.rewardAmount ?? rewardAmount(challenge.reward_label, locale),
        account: payload.rewardAccount ?? "core",
        claimed: Boolean(payload.rewardClaimed)
      };
      onComplete(challenge, reward);
      await onRefreshUserData();
      setCheckStatus("idle");
    } catch (error) {
      console.error(error);
      setCheckMessage(error instanceof Error ? error.message : t("challenges.checkFailed"));
      setCheckStatus("error");
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-sheet challenge-modal">
        <div className="modal-header">
          <button className="text-button" type="button" onClick={onClose}>{t("app.common.close")}</button>
          <h2>{t("challenges.challenge")}</h2>
          <span />
        </div>

        {challenge.image_url ? <img className="challenge-modal-image" alt="" src={challenge.image_url} /> : null}

        <div className="challenge-modal-body">
          <div>
            <strong>{challenge.category}</strong>
            <h3>{text(challenge.title, t("challenges.challenge"), locale)}</h3>
            <p>{text(challenge.description, "", locale)}</p>
          </div>

          <div className="challenge-detail-grid">
            <span>
              <Trophy size={17} />
              {rewardText(challenge.reward_label, locale)}
            </span>
            <span>
              <ShieldCheck size={17} />
              {getVerificationLabel(challenge.verification_type, t)}
            </span>
            {challenge.duration_days ? (
              <span>
                <Clock3 size={17} />
                {challenge.duration_days} {t("app.common.days.short")}
              </span>
            ) : null}
          </div>

          {text(challenge.requirements, "", locale) ? (
            <section>
              <h4>{t("challenges.requirements")}</h4>
              <p>{text(challenge.requirements, "", locale)}</p>
            </section>
          ) : null}

          {text(challenge.instructions, "", locale) ? (
            <section>
              <h4>{t("challenges.instructions")}</h4>
              <p>{text(challenge.instructions, "", locale)}</p>
            </section>
          ) : null}

          {completed ? (
            <div className="challenge-access completed">
              <CheckCircle2 size={17} />
              {t("challenges.completed")}
            </div>
          ) : null}

          {!completed && locked ? (
            <div className="challenge-access locked">
              {t("challenges.availableFrom", { level: challenge.difficulty_level })}
            </div>
          ) : null}

          {!completed && !locked && !isRegistered && signupChallenge ? (
            <button className="challenge-primary-action" type="button" disabled={authStatus === "loading"} onClick={handleSignup}>
              {authStatus === "loading" ? t("challenges.openingGoogle") : t("challenges.signInGoogle")}
            </button>
          ) : null}

          {!completed && !locked && accepted ? (
            <button className="challenge-primary-action" type="button" disabled={checkStatus === "loading"} onClick={handleCheck}>
              {checkStatus === "loading" ? t("challenges.checking") : t("challenges.check")}
            </button>
          ) : null}

          {!completed && !locked && !accepted && (!signupChallenge || isRegistered) ? (
            <button className="challenge-primary-action" type="button" onClick={onAccept}>
              {t("challenges.accept")}
            </button>
          ) : null}

          {authStatus === "error" ? <p className="challenge-error">{t("challenges.authError")}</p> : null}
          {checkMessage ? <p className={checkStatus === "error" ? "challenge-error" : "challenge-note"}>{checkMessage}</p> : null}
        </div>
      </div>
    </div>
  );
}

function ChallengeCompleteModal({ reward, t, onClose }: { reward: { amount: number; account: string; claimed: boolean }; t: TFunction; onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-sheet small challenge-complete-modal">
        <span className="streak-complete-icon">OK</span>
        <h2>{t("challenges.completeTitle")}</h2>
        <p>{reward.claimed ? t("challenges.rewardClaimed", { amount: reward.amount, account: reward.account === "core" ? "Core" : "Wallet" }) : t("challenges.rewardAlreadyClaimed")}</p>
        <button className="challenge-primary-action" type="button" onClick={onClose}>{t("app.common.excellent")}</button>
      </div>
    </div>
  );
}

function ChallengeState({ title, description }: { title: string; description: string }) {
  return (
    <div className="challenge-state">
      <Trophy size={34} />
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

function text(value: LocaleText, fallback: string, locale: AppLocale): string {
  return value?.[locale] ?? value?.en ?? fallback;
}

function rewardText(value: RewardLabel, locale: AppLocale): string {
  const amount = rewardAmount(value, locale);
  return amount ? `${amount}$` : "1$";
}

function rewardAmount(value: RewardLabel, locale: AppLocale): number {
  const raw = rewardLabelText(value, locale).trim();
  const amount = raw.match(/(\d+(?:[.,]\d+)?)\s*\$/)?.[1] ?? raw.match(/\+(\d+(?:[.,]\d+)?)/)?.[1] ?? raw.match(/(\d+(?:[.,]\d+)?)/)?.[1];
  return amount ? Number(amount.replace(",", ".")) : 1;
}

function getVerificationLabel(type: Challenge["verification_type"], t: TFunction): string {
  if (type === "auto") return t("challenges.verification.auto");
  if (type === "community") return t("challenges.verification.community");
  return t("challenges.verification.manual");
}

function isActiveChallenge(challenge: Challenge): boolean {
  return challenge.user_challenge_status === "accepted" || challenge.user_challenge_status === "failed";
}

function isCompletedChallenge(challenge: Challenge): boolean {
  return challenge.user_challenge_status === "completed";
}

function mergeAcceptedChallenges(challenges: Challenge[], challenge: Challenge): Challenge[] {
  return challenges.some((item) => item.id === challenge.id) ? challenges : [challenge, ...challenges];
}

function rewardLabelText(value: RewardLabel, locale: AppLocale): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return text(value, "1$", locale);
}
