"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Clock3, ShieldCheck, Trophy } from "lucide-react";
import { getOrCreateLocalGuest } from "@/lib/guestIdentity";
import { getBrowserSupabaseClient, signInWithGoogle } from "@/lib/supabaseClient";
import { useUserContext } from "@/components/UserProvider";

type LocaleText = Record<string, string> | null;
type RewardLabel = LocaleText | string | number | null;
type ChallengeStatus = "accepted" | "completed" | "declined" | "failed";

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

const ACCEPTED_CHALLENGES_CACHE_KEY = "open-abundance:accepted-challenges:v1";
const LOCALE = "ru";
const USER_LEVEL = 0;

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
  const { user, refreshUserData } = useUserContext();

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

    async function loadChallenges() {
      const cachedAcceptedChallenges = readCachedAcceptedChallenges().filter(isActiveChallenge);

      if (cachedAcceptedChallenges.length > 0) {
        setAcceptedChallenges(cachedAcceptedChallenges);
        setStatus("ready");
      }

      if (!navigator.onLine) {
        setAvailableChallenges([]);
        setStatus(cachedAcceptedChallenges.length > 0 ? "ready" : "offline");
        return;
      }

      setIsRefreshing(cachedAcceptedChallenges.length > 0);

      try {
        const supabase = getBrowserSupabaseClient();
        const {
          data: { session }
        } = await supabase.auth.getSession();
        const response = await fetch("/api/challenges", {
          cache: "no-store",
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined
        });
        const payload = (await response.json()) as ChallengesResponse;

        if (!response.ok || payload.error) {
          throw new Error(payload.error ?? "Failed to load challenges.");
        }

        if (mounted) {
          const nextChallenges = payload.challenges ?? [];
          const serverCompletedChallenges = nextChallenges.filter(isCompletedChallenge);
          const serverAcceptedChallenges = nextChallenges.filter(isActiveChallenge);
          const mergedAcceptedChallenges = mergeChallengeLists(cachedAcceptedChallenges, serverAcceptedChallenges);
          const acceptedIds = new Set(mergedAcceptedChallenges.map((challenge) => challenge.id));
          const completedIds = new Set(serverCompletedChallenges.map((challenge) => challenge.id));
          const syncedAcceptedChallenges = mergedAcceptedChallenges.map((cachedChallenge) => {
            const freshChallenge = nextChallenges.find((challenge) => challenge.id === cachedChallenge.id);
            return freshChallenge ? { ...cachedChallenge, ...freshChallenge } : cachedChallenge;
          }).filter(isActiveChallenge);

          setAcceptedChallenges(syncedAcceptedChallenges);
          setCompletedChallenges(serverCompletedChallenges);
          writeCachedAcceptedChallenges(syncedAcceptedChallenges);
          setAvailableChallenges(nextChallenges.filter((challenge) => !acceptedIds.has(challenge.id) && !completedIds.has(challenge.id)));
          setStatus("ready");
        }
      } catch {
        if (mounted) {
          setAvailableChallenges([]);
          setStatus(cachedAcceptedChallenges.length > 0 ? "ready" : "offline");
        }
      } finally {
        if (mounted) setIsRefreshing(false);
      }
    }

    loadChallenges();
    return () => {
      mounted = false;
    };
  }, [refreshNonce, user]);

  function acceptChallenge(challenge: Challenge) {
    const acceptedChallenge: Challenge = { ...challenge, user_challenge_status: "accepted" };
    const nextAcceptedChallenges = mergeAcceptedChallenges(acceptedChallenges, acceptedChallenge);
    setAcceptedChallenges(nextAcceptedChallenges);
    setAvailableChallenges((challenges) => challenges.filter((item) => item.id !== challenge.id));
    writeCachedAcceptedChallenges(nextAcceptedChallenges);
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
    writeCachedAcceptedChallenges(nextAcceptedChallenges);
    setSelectedChallenge(completedChallenge);
    setCompletionReward(reward);
  }

  if (completedOpen) {
    return (
      <>
        <ChallengeArchiveScreen
          challenges={completedChallenges}
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
            onAccept={() => acceptChallenge(selectedChallenge)}
            onClose={() => setSelectedChallenge(null)}
            onComplete={completeChallenge}
            onRefreshUserData={refreshUserData}
          />
        ) : null}

        {completionReward ? <ChallengeCompleteModal reward={completionReward} onClose={() => setCompletionReward(null)} /> : null}
      </>
    );
  }

  return (
    <section className="challenges-screen">
      <header className="challenges-header">
        <div>
          <span>Challenges</span>
          <h1>Челленджи</h1>
        </div>
        {isRefreshing ? <small>Обновляем...</small> : null}
      </header>

      {status === "loading" ? <ChallengeState title="Загрузка..." description="Готовим челленджи." /> : null}
      {status === "offline" ? <ChallengeState title="Нет подключения" description="Доступные челленджи видны только онлайн. Принятые появятся здесь после синхронизации." /> : null}

      {acceptedChallenges.length > 0 ? (
        <ChallengeSection challenges={acceptedChallenges} title="Принятые" onOpen={(challenge) => setSelectedChallenge(challenge)} />
      ) : null}

      {availableChallenges.length > 0 ? (
        <ChallengeSection challenges={availableChallenges} title="Доступные" onOpen={(challenge) => setSelectedChallenge(challenge)} />
      ) : null}

      {completedChallenges.length > 0 ? (
        <section className="challenge-section">
          <button className="challenge-archive-link" type="button" onClick={() => setCompletedOpen(true)}>
            <span>{"\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u043d\u044b\u0435"}</span>
            <strong>{completedChallenges.length}</strong>
          </button>
        </section>
      ) : null}

      {selectedChallenge ? (
        <ChallengeDetailModal
          challenge={selectedChallenge}
          isRegistered={Boolean(user)}
          onAccept={() => acceptChallenge(selectedChallenge)}
          onClose={() => setSelectedChallenge(null)}
          onComplete={completeChallenge}
          onRefreshUserData={refreshUserData}
        />
      ) : null}

      {completionReward ? <ChallengeCompleteModal reward={completionReward} onClose={() => setCompletionReward(null)} /> : null}
    </section>
  );
}

function ChallengeArchiveScreen({
  challenges,
  onBack,
  onOpen
}: {
  challenges: Challenge[];
  onBack: () => void;
  onOpen: (challenge: Challenge) => void;
}) {
  return (
    <section className="challenges-screen challenge-archive-screen">
      <header className="task-archive-topbar">
        <button className="back-button" type="button" onClick={onBack}>{"\u2039"}</button>
        <h1>{"\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u043d\u044b\u0435"}</h1>
      </header>

      {challenges.length === 0 ? (
        <div className="task-empty">{"\u0417\u0434\u0435\u0441\u044c \u043f\u043e\u043a\u0430 \u043d\u0438\u0447\u0435\u0433\u043e \u043d\u0435\u0442."}</div>
      ) : (
        <div className="challenge-list">
          {challenges.map((challenge) => (
            <ChallengeRow challenge={challenge} key={challenge.id} userLevel={USER_LEVEL} onOpen={() => onOpen(challenge)} />
          ))}
        </div>
      )}
    </section>
  );
}

function ChallengeSection({ challenges, title, onOpen }: { challenges: Challenge[]; title: string; onOpen: (challenge: Challenge) => void }) {
  return (
    <section className="challenge-section">
      <h2>{title}</h2>
      <div className="challenge-list">
        {challenges.map((challenge) => (
          <ChallengeRow challenge={challenge} key={challenge.id} userLevel={USER_LEVEL} onOpen={() => onOpen(challenge)} />
        ))}
      </div>
    </section>
  );
}

function ChallengeRow({ challenge, userLevel, onOpen }: { challenge: Challenge; userLevel: number; onOpen: () => void }) {
  const locked = challenge.difficulty_level > userLevel;
  const completed = challenge.user_challenge_status === "completed";

  return (
    <button className={locked ? "challenge-row locked" : "challenge-row"} type="button" onClick={onOpen}>
      <span className="challenge-thumb">
        {challenge.image_url ? <img alt="" src={challenge.image_url} loading="lazy" /> : <Trophy size={24} />}
      </span>
      <span className="challenge-row-body">
        <span className="challenge-row-title">{text(challenge.title, "Челлендж")}</span>
        <small>{completed ? "Завершено" : text(challenge.description, "")}</small>
        <span className="challenge-meta">
          <span>{rewardText(challenge.reward_label)}</span>
          <span>Lvl {challenge.difficulty_level}</span>
          {challenge.duration_days ? <span>{challenge.duration_days} дн.</span> : null}
          {completed ? <span>Готово</span> : null}
        </span>
      </span>
    </button>
  );
}

function ChallengeDetailModal({
  challenge,
  isRegistered,
  onAccept,
  onClose,
  onComplete,
  onRefreshUserData
}: {
  challenge: Challenge;
  isRegistered: boolean;
  onAccept: () => void;
  onClose: () => void;
  onComplete: (challenge: Challenge, reward: { amount: number; account: string; claimed: boolean }) => void;
  onRefreshUserData: () => Promise<void>;
}) {
  const locked = challenge.difficulty_level > USER_LEVEL;
  const signupChallenge = challenge.verification_logic === "signup";
  const completed = challenge.user_challenge_status === "completed";
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
        setCheckMessage("Сначала войдите в аккаунт.");
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
        throw new Error(payload.error ?? "Не удалось проверить челлендж.");
      }

      if (!payload.completed) {
        setCheckMessage(payload.message ?? "Проверка пока не прошла.");
        setCheckStatus("idle");
        return;
      }

      const reward = {
        amount: payload.rewardAmount ?? rewardAmount(challenge.reward_label),
        account: payload.rewardAccount ?? "core",
        claimed: Boolean(payload.rewardClaimed)
      };
      onComplete(challenge, reward);
      await onRefreshUserData();
      setCheckStatus("idle");
    } catch (error) {
      console.error(error);
      setCheckMessage(error instanceof Error ? error.message : "Не удалось проверить челлендж.");
      setCheckStatus("error");
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-sheet challenge-modal">
        <div className="modal-header">
          <button className="text-button" type="button" onClick={onClose}>Закрыть</button>
          <h2>Челлендж</h2>
          <span />
        </div>

        {challenge.image_url ? <img className="challenge-modal-image" alt="" src={challenge.image_url} /> : null}

        <div className="challenge-modal-body">
          <div>
            <strong>{challenge.category}</strong>
            <h3>{text(challenge.title, "Челлендж")}</h3>
            <p>{text(challenge.description, "")}</p>
          </div>

          <div className="challenge-detail-grid">
            <span>
              <Trophy size={17} />
              {rewardText(challenge.reward_label)}
            </span>
            <span>
              <ShieldCheck size={17} />
              {getVerificationLabel(challenge.verification_type)}
            </span>
            {challenge.duration_days ? (
              <span>
                <Clock3 size={17} />
                {challenge.duration_days} дн.
              </span>
            ) : null}
          </div>

          {text(challenge.requirements, "") ? (
            <section>
              <h4>Требования</h4>
              <p>{text(challenge.requirements, "")}</p>
            </section>
          ) : null}

          {text(challenge.instructions, "") ? (
            <section>
              <h4>Инструкция</h4>
              <p>{text(challenge.instructions, "")}</p>
            </section>
          ) : null}

          {completed ? (
            <div className="challenge-access completed">
              <CheckCircle2 size={17} />
              Завершено
            </div>
          ) : null}

          {!completed && !isRegistered && signupChallenge ? (
            <button className="challenge-primary-action" type="button" disabled={authStatus === "loading"} onClick={handleSignup}>
              {authStatus === "loading" ? "Открываем Google..." : "Войти через Google"}
            </button>
          ) : null}

          {!completed && isRegistered ? (
            <button className="challenge-primary-action" type="button" disabled={locked || checkStatus === "loading"} onClick={handleCheck}>
              {checkStatus === "loading" ? "Проверяем..." : "Проверить и завершить"}
            </button>
          ) : null}

          {!completed && !signupChallenge && !isRegistered ? (
            <button className={locked ? "challenge-access locked" : "challenge-primary-action"} type="button" disabled={locked} onClick={onAccept}>
              {locked ? `Доступно с уровня ${challenge.difficulty_level}` : "Принять челлендж"}
            </button>
          ) : null}

          {authStatus === "error" ? <p className="challenge-error">Не удалось начать вход. Проверьте подключение и попробуйте еще раз.</p> : null}
          {checkMessage ? <p className={checkStatus === "error" ? "challenge-error" : "challenge-note"}>{checkMessage}</p> : null}
        </div>
      </div>
    </div>
  );
}

function ChallengeCompleteModal({ reward, onClose }: { reward: { amount: number; account: string; claimed: boolean }; onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-sheet small challenge-complete-modal">
        <span className="streak-complete-icon">✓</span>
        <h2>Челлендж завершен</h2>
        <p>{reward.claimed ? `Награда ${reward.amount}$ зачислена в ${reward.account === "core" ? "Core" : "Wallet"}.` : "Награда уже была получена ранее."}</p>
        <button className="challenge-primary-action" type="button" onClick={onClose}>Отлично</button>
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

function text(value: LocaleText, fallback: string): string {
  return value?.[LOCALE] ?? value?.en ?? fallback;
}

function rewardText(value: RewardLabel): string {
  const amount = rewardAmount(value);
  return amount ? `${amount}$` : "1$";
}

function rewardAmount(value: RewardLabel): number {
  const raw = rewardLabelText(value).trim();
  const amount = raw.match(/(\d+(?:[.,]\d+)?)\s*\$/)?.[1] ?? raw.match(/\+(\d+(?:[.,]\d+)?)/)?.[1] ?? raw.match(/(\d+(?:[.,]\d+)?)/)?.[1];
  return amount ? Number(amount.replace(",", ".")) : 1;
}

function getVerificationLabel(type: Challenge["verification_type"]): string {
  if (type === "auto") return "Автопроверка";
  if (type === "community") return "Проверка сообществом";
  return "Ручная проверка";
}

function readCachedAcceptedChallenges(): Challenge[] {
  try {
    const value = window.localStorage.getItem(ACCEPTED_CHALLENGES_CACHE_KEY);
    if (!value) return [];
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as Challenge[]) : [];
  } catch {
    return [];
  }
}

function writeCachedAcceptedChallenges(challenges: Challenge[]) {
  try {
    window.localStorage.setItem(ACCEPTED_CHALLENGES_CACHE_KEY, JSON.stringify(challenges.filter(isActiveChallenge)));
  } catch {
    // Accepted challenges remain usable even when local cache writes fail.
  }
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

function mergeChallengeLists(first: Challenge[], second: Challenge[]): Challenge[] {
  const merged = [...first];
  second.forEach((challenge) => {
    const index = merged.findIndex((item) => item.id === challenge.id);
    if (index >= 0) {
      merged[index] = { ...merged[index], ...challenge };
    } else {
      merged.push(challenge);
    }
  });
  return merged;
}

function rewardLabelText(value: RewardLabel): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return text(value, "1$");
}
