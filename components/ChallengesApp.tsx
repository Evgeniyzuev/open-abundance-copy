"use client";

import { useEffect, useState } from "react";
import { Clock3, ShieldCheck, Trophy } from "lucide-react";

type LocaleText = Record<string, string> | null;

type Challenge = {
  id: string;
  title: LocaleText;
  description: LocaleText;
  instructions: LocaleText;
  requirements: LocaleText;
  reward_label: LocaleText;
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

      {selectedChallenge ? <ChallengeDetailModal challenge={selectedChallenge} onClose={() => setSelectedChallenge(null)} /> : null}
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
        <span className="challenge-row-title">
          {text(challenge.title, "Челлендж")}
          <em>Lvl {challenge.difficulty_level}</em>
          {locked ? <em>Locked</em> : null}
        </span>
        <small>{text(challenge.description, "")}</small>
        <span className="challenge-meta">
          <span>{rewardText(challenge.reward_label)}</span>
          {challenge.duration_days ? <span>{challenge.duration_days} дн.</span> : null}
        </span>
      </span>
    </button>
  );
}

function ChallengeDetailModal({ challenge, onClose }: { challenge: Challenge; onClose: () => void }) {
  const locked = challenge.difficulty_level > USER_LEVEL;

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

          <div className={locked ? "challenge-access locked" : "challenge-access"}>
            {locked ? `Доступно с уровня ${challenge.difficulty_level}` : "Доступно на вашем уровне"}
          </div>
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

function rewardText(value: LocaleText): string {
  const raw = text(value, "⚛️+1$").trim();
  const amount = raw.match(/(\d+)\s*\$/)?.[1] ?? raw.match(/\+(\d+)/)?.[1];
  return amount ? `⚛️+${amount}$` : "⚛️+1$";
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
