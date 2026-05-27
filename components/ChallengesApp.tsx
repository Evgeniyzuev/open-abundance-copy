"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Clock3, ShieldCheck, Trophy } from "lucide-react";
import { getOrCreateLocalGuest } from "@/lib/guestIdentity";
import { signInWithGoogle } from "@/lib/supabaseClient";
import { useUserContext } from "@/components/UserProvider";

type LocaleText = Record<string, string> | null;
type RewardLabel = LocaleText | string | number | null;

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
};

type ChallengesResponse = {
  challenges?: Challenge[];
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
  const [availableChallenges, setAvailableChallenges] = useState<Challenge[]>([]);
  const [selectedChallenge, setSelectedChallenge] = useState<Challenge | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "offline">("loading");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { user } = useUserContext();

  useEffect(() => {
    if (!selectedChallenge) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [selectedChallenge]);

  useEffect(() => {
    let mounted = true;

    async function loadChallenges() {
      const cachedAcceptedChallenges = readCachedAcceptedChallenges();

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
        const response = await fetch("/api/challenges", { cache: "no-store" });
        const payload = (await response.json()) as ChallengesResponse;

        if (!response.ok || payload.error) {
          throw new Error(payload.error ?? "Failed to load challenges.");
        }

        if (mounted) {
          const nextChallenges = payload.challenges ?? [];
          const acceptedIds = new Set(cachedAcceptedChallenges.map((challenge) => challenge.id));
          const syncedAcceptedChallenges = cachedAcceptedChallenges.map((cachedChallenge) => {
            const freshChallenge = nextChallenges.find((challenge) => challenge.id === cachedChallenge.id);
            return freshChallenge ?? cachedChallenge;
          });

          setAcceptedChallenges(syncedAcceptedChallenges);
          writeCachedAcceptedChallenges(syncedAcceptedChallenges);
          setAvailableChallenges(nextChallenges.filter((challenge) => !acceptedIds.has(challenge.id)));
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
  }, [refreshNonce]);

  function acceptChallenge(challenge: Challenge) {
    const nextAcceptedChallenges = mergeAcceptedChallenges(acceptedChallenges, challenge);
    setAcceptedChallenges(nextAcceptedChallenges);
    setAvailableChallenges((challenges) => challenges.filter((item) => item.id !== challenge.id));
    writeCachedAcceptedChallenges(nextAcceptedChallenges);
    setSelectedChallenge(null);
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
        <ChallengeSection
          challenges={acceptedChallenges}
          title="Принятые"
          onOpen={(challenge) => setSelectedChallenge(challenge)}
        />
      ) : null}

      {availableChallenges.length > 0 ? (
        <ChallengeSection
          challenges={availableChallenges}
          title="Доступные"
          onOpen={(challenge) => setSelectedChallenge(challenge)}
        />
      ) : null}

      {selectedChallenge ? (
        <ChallengeDetailModal
          challenge={selectedChallenge}
          isRegistered={Boolean(user)}
          onAccept={() => acceptChallenge(selectedChallenge)}
          onClose={() => setSelectedChallenge(null)}
        />
      ) : null}
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

  return (
    <button className={locked ? "challenge-row locked" : "challenge-row"} type="button" onClick={onOpen}>
      <span className="challenge-thumb">
        {challenge.image_url ? <img alt="" src={challenge.image_url} loading="lazy" /> : <Trophy size={24} />}
      </span>
      <span className="challenge-row-body">
        <span className="challenge-row-title">{text(challenge.title, "Челлендж")}</span>
        <small>{text(challenge.description, "")}</small>
        <span className="challenge-meta">
          <span>{rewardText(challenge.reward_label)}</span>
          <span>Lvl {challenge.difficulty_level}</span>
          {challenge.duration_days ? <span>{challenge.duration_days} дн.</span> : null}
        </span>
      </span>
    </button>
  );
}

function ChallengeDetailModal({
  challenge,
  isRegistered,
  onAccept,
  onClose
}: {
  challenge: Challenge;
  isRegistered: boolean;
  onAccept: () => void;
  onClose: () => void;
}) {
  const locked = challenge.difficulty_level > USER_LEVEL;
  const signupChallenge = challenge.verification_logic === "signup";
  const [authStatus, setAuthStatus] = useState<"idle" | "loading" | "error">("idle");

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

          {isRegistered && signupChallenge ? (
            <div className="challenge-access completed">
              <CheckCircle2 size={17} />
              Прогресс сохранен
            </div>
          ) : null}

          {!isRegistered && signupChallenge ? (
            <button className="challenge-primary-action" type="button" disabled={authStatus === "loading"} onClick={handleSignup}>
              {authStatus === "loading" ? "Открываем Google..." : "Войти через Google"}
            </button>
          ) : null}

          {!signupChallenge ? (
            <button className={locked ? "challenge-access locked" : "challenge-primary-action"} type="button" disabled={locked} onClick={onAccept}>
              {locked ? `Доступно с уровня ${challenge.difficulty_level}` : "Принять челлендж"}
            </button>
          ) : null}

          {authStatus === "error" ? <p className="challenge-error">Не удалось начать вход. Проверьте подключение и попробуйте еще раз.</p> : null}
        </div>
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
  const raw = rewardLabelText(value).trim();
  const amount = raw.match(/(\d+(?:[.,]\d+)?)\s*\$/)?.[1] ?? raw.match(/\+(\d+(?:[.,]\d+)?)/)?.[1] ?? raw.match(/(\d+(?:[.,]\d+)?)/)?.[1];
  return amount ? `${amount.replace(",", ".")}$` : "1$";
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
    window.localStorage.setItem(ACCEPTED_CHALLENGES_CACHE_KEY, JSON.stringify(challenges));
  } catch {
    // Accepted challenges remain usable even when local cache writes fail.
  }
}

function mergeAcceptedChallenges(challenges: Challenge[], challenge: Challenge): Challenge[] {
  return challenges.some((item) => item.id === challenge.id) ? challenges : [challenge, ...challenges];
}

function rewardLabelText(value: RewardLabel): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return text(value, "1$");
}
