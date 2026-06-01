"use client";

import { useEffect, useState } from "react";
import type { Json, Tables } from "@/lib/database.types";
import { useUserContext } from "@/components/UserProvider";
import type { AppLocale } from "@/lib/i18n";

type RecommendedWish = Pick<
  Tables<"recommended_wishes">,
  "id" | "title" | "description" | "image_url" | "category" | "estimated_cost" | "difficulty_level"
>;

type WishesResponse = {
  wishes?: RecommendedWish[];
  error?: string;
};

type LocaleText = Json;

const WISHES_CACHE_KEY = "open-abundance:recommended-wishes:v2";

type RecommendedWishesProps = {
  refreshNonce: number;
};

export default function RecommendedWishes({ refreshNonce }: RecommendedWishesProps) {
  const { locale, t } = useUserContext();
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
      {status === "loading" ? <WishOfflineState title={t("app.common.loading")} description={t("wishes.loading.description")} /> : null}
      {status === "offline" ? <WishOfflineState title={t("app.common.offline")} description={t("wishes.offline.description")} /> : null}
      {wishes.length > 0 ? (
        <>
        {isRefreshing ? <div className="wishes-refreshing">{t("wishes.refreshing")}</div> : null}
        <div className="wish-grid" aria-label={t("wishes.gridLabel")}>
          {wishes.map((wish) => (
            <button className="wish-tile" key={wish.id} type="button" onClick={() => setSelectedWish(wish)}>
              <img alt="" src={wish.image_url} loading="lazy" />
              <span>{text(wish.title, locale)}</span>
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
      <div className="wish-offline-icon">OA</div>
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
  const { locale, t } = useUserContext();

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-sheet wish-modal">
        <div className="modal-header">
          <button className="text-button" type="button" onClick={onClose}>{t("app.common.close")}</button>
          <h2>{text(wish.title, locale)}</h2>
          <span />
        </div>
        <img className="wish-modal-image" alt="" src={wish.image_url} />
        <div className="wish-modal-body">
          <strong>{wish.category}</strong>
          <p>{text(wish.description, locale)}</p>
          <div className="wish-meta">
            {wish.estimated_cost ? <span>{wish.estimated_cost}</span> : null}
            <span>{t("wishes.level", { level: wish.difficulty_level })}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function text(value: LocaleText, locale: AppLocale): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, Json | undefined>;
    const localized = record[locale];
    const english = record.en;
    if (typeof localized === "string") return localized;
    if (typeof english === "string") return english;
  }

  return "";
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
