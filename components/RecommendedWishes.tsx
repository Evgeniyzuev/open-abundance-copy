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

export default function RecommendedWishes() {
  const [wishes, setWishes] = useState<RecommendedWish[]>([]);
  const [selectedWish, setSelectedWish] = useState<RecommendedWish | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let mounted = true;

    async function loadWishes() {
      try {
        const response = await fetch("/api/recommended-wishes", { cache: "no-store" });
        const payload = (await response.json()) as WishesResponse;

        if (!response.ok || payload.error) {
          throw new Error(payload.error ?? "Failed to load wishes.");
        }

        if (mounted) {
          setWishes(payload.wishes ?? []);
          setStatus("ready");
        }
      } catch {
        if (mounted) setStatus("error");
      }
    }

    loadWishes();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <section className="wishes-screen">
      {status === "loading" ? <div className="wishes-state">Загрузка...</div> : null}
      {status === "error" ? <div className="wishes-state">Не удалось загрузить желания.</div> : null}
      {status === "ready" ? (
        <div className="wish-grid" aria-label="Рекомендованные желания">
          {wishes.map((wish) => (
            <button className="wish-tile" key={wish.id} type="button" onClick={() => setSelectedWish(wish)}>
              <img alt="" src={wish.image_url} loading="lazy" />
              <span>{wish.title}</span>
            </button>
          ))}
        </div>
      ) : null}

      {selectedWish ? <WishDetailModal wish={selectedWish} onClose={() => setSelectedWish(null)} /> : null}
    </section>
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
