"use client";

import { useEffect, useState } from "react";
import type { Tables } from "@/lib/database.types";

type RecommendedWish = Pick<
  Tables<"recommended_wishes">,
  "id" | "title" | "description" | "image_url" | "category" | "estimated_cost" | "difficulty_level"
>;

type WishesResponse = {
  wishes?: RecommendedWish[];
  error?: string;
};

const WISHES_CACHE_KEY = "open-abundance:recommended-wishes:v1";

type RecommendedWishesProps = {
  refreshNonce: number;
};

export default function RecommendedWishes({ refreshNonce }: RecommendedWishesProps) {
  const [wishes, setWishes] = useState<RecommendedWish[]>([]);
  const [selectedWish, setSelectedWish] = useState<RecommendedWish | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "offline">("loading");
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadWishes() {
      const cachedWishes = readCachedWishes();

      if (cachedWishes.length > 0) {
        setWishes(cachedWishes);
        setStatus("ready");
      }

      if (!navigator.onLine) {
        setStatus(cachedWishes.length > 0 ? "ready" : "offline");
        return;
      }

      setIsRefreshing(cachedWishes.length > 0);

      try {
        const response = await fetch("/api/recommended-wishes", { cache: "no-store" });
        const payload = (await response.json()) as WishesResponse;

        if (!response.ok || payload.error) {
          throw new Error(payload.error ?? "Failed to load wishes.");
        }

        if (mounted) {
          const nextWishes = payload.wishes ?? [];
          setWishes(nextWishes);
          writeCachedWishes(nextWishes);
          setStatus("ready");
        }
      } catch {
        if (mounted) setStatus(cachedWishes.length > 0 ? "ready" : "offline");
      } finally {
        if (mounted) setIsRefreshing(false);
      }
    }

    loadWishes();
    return () => {
      mounted = false;
    };
  }, [refreshNonce]);

  return (
    <section className="wishes-screen">
      {status === "loading" ? <WishOfflineState title="Загрузка..." description="Подготавливаем рекомендации." /> : null}
      {status === "offline" ? <WishOfflineState title="Нет подключения" description="Когда интернет появится, рекомендации загрузятся автоматически. Картинки останутся внешними и не сохраняются локально." /> : null}
      {wishes.length > 0 ? (
        <>
        {isRefreshing ? <div className="wishes-refreshing">Обновляем...</div> : null}
        <div className="wish-grid" aria-label="Рекомендованные желания">
          {wishes.map((wish) => (
            <button className="wish-tile" key={wish.id} type="button" onClick={() => setSelectedWish(wish)}>
              <img alt="" src={wish.image_url} loading="lazy" />
              <span>{wish.title}</span>
            </button>
          ))}
        </div>
        </>
      ) : null}

      {selectedWish ? <WishDetailModal wish={selectedWish} onClose={() => setSelectedWish(null)} /> : null}
    </section>
  );
}

function WishOfflineState({ title, description }: { title: string; description: string }) {
  return (
    <div className="wish-offline-state">
      <div className="wish-offline-icon">♡</div>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

type WishDetailModalProps = {
  wish: RecommendedWish;
  onClose: () => void;
};

function WishDetailModal({ wish, onClose }: WishDetailModalProps) {
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-sheet wish-modal">
        <div className="modal-header">
          <button className="text-button" type="button" onClick={onClose}>Закрыть</button>
          <h2>{wish.title}</h2>
          <span />
        </div>
        <img className="wish-modal-image" alt="" src={wish.image_url} />
        <div className="wish-modal-body">
          <strong>{wish.category}</strong>
          <p>{wish.description}</p>
          <div className="wish-meta">
            {wish.estimated_cost ? <span>{wish.estimated_cost}</span> : null}
            <span>Уровень {wish.difficulty_level}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function readCachedWishes(): RecommendedWish[] {
  try {
    const value = window.localStorage.getItem(WISHES_CACHE_KEY);
    if (!value) return [];
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as RecommendedWish[]) : [];
  } catch {
    return [];
  }
}

function writeCachedWishes(wishes: RecommendedWish[]) {
  try {
    window.localStorage.setItem(WISHES_CACHE_KEY, JSON.stringify(wishes));
  } catch {
    // Cache is a convenience layer only.
  }
}
