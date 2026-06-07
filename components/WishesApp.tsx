"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { Archive, Check, Pencil, Plus, Trash2 } from "lucide-react";
import type { Json, Tables } from "@/lib/database.types";
import { getBrowserSupabaseClient } from "@/lib/supabaseClient";
import { useUserContext } from "@/components/UserProvider";
import type { AppLocale } from "@/lib/i18n";

type Wish = Tables<"wishes">;
type RecommendedWish = Pick<
  Tables<"recommended_wishes">,
  "id" | "title" | "description" | "image_url" | "category" | "estimated_cost" | "difficulty_level"
>;
type WishStatus = Wish["status"];
type WishVisibility = Wish["visibility"];
type LocaleText = Json;

type WishesResponse = {
  wishes?: Wish[];
  recommendedWishes?: RecommendedWish[];
  error?: string;
};

type WishMutationResponse = {
  wish?: Wish;
  deletedWishId?: string;
  error?: string;
};

type WishesAppProps = {
  refreshNonce: number;
};

type SelectedWish =
  | { type: "wish"; wish: Wish }
  | { type: "recommended"; wish: RecommendedWish };

type FormState = {
  title: string;
  description: string;
  category: string;
  imageUrl: string;
  targetAmount: string;
  targetCurrency: string;
  difficultyLevel: string;
  visibility: WishVisibility;
};

const emptyForm: FormState = {
  title: "",
  description: "",
  category: "",
  imageUrl: "",
  targetAmount: "",
  targetCurrency: "USD",
  difficultyLevel: "1",
  visibility: "private"
};

export default function WishesApp({ refreshNonce }: WishesAppProps) {
  const { loading: userLoading, locale, t, user } = useUserContext();
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [recommendedWishes, setRecommendedWishes] = useState<RecommendedWish[]>([]);
  const [selectedWish, setSelectedWish] = useState<SelectedWish | null>(null);
  const [editingWish, setEditingWish] = useState<Wish | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "offline" | "unauthenticated" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const activeWishes = useMemo(() => wishes.filter((wish) => wish.status === "active"), [wishes]);
  const completedWishes = useMemo(() => wishes.filter((wish) => wish.status === "completed"), [wishes]);
  const archivedWishes = useMemo(() => wishes.filter((wish) => wish.status === "archived"), [wishes]);

  useEffect(() => {
    let mounted = true;

    async function loadWishes() {
      if (userLoading) return;
      if (!user) {
        setStatus("unauthenticated");
        setWishes([]);
        return;
      }

      if (!navigator.onLine) {
        setStatus((current) => current === "ready" ? current : "offline");
        return;
      }

      setStatus((current) => current === "ready" ? current : "loading");
      setIsRefreshing(true);
      setErrorMessage(null);

      try {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          if (mounted) setStatus("unauthenticated");
          return;
        }

        const response = await fetch(`/api/wishes?status=all&includeRecommended=true&ts=${Date.now()}`, {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Cache-Control": "no-cache"
          }
        });
        const payload = (await response.json()) as WishesResponse;

        if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load wishes.");

        if (mounted) {
          setWishes(payload.wishes ?? []);
          setRecommendedWishes(payload.recommendedWishes ?? []);
          setStatus("ready");
        }
      } catch (loadError) {
        if (mounted) {
          setErrorMessage(loadError instanceof Error ? loadError.message : t("wishes.error"));
          setStatus((current) => current === "ready" ? current : "error");
        }
      } finally {
        if (mounted) setIsRefreshing(false);
      }
    }

    void loadWishes();
    return () => {
      mounted = false;
    };
  }, [refreshNonce, t, user, userLoading]);

  async function createWish(values: FormState) {
    const wish = await sendWishRequest("/api/wishes", "POST", formToPayload(values));
    setWishes((current) => [wish, ...current]);
    setIsCreateOpen(false);
  }

  async function updateWish(wish: Wish, values: FormState) {
    const updatedWish = await sendWishRequest(`/api/wishes/${wish.id}`, "PATCH", formToPayload(values));
    replaceWish(updatedWish);
    setEditingWish(null);
    setSelectedWish({ type: "wish", wish: updatedWish });
  }

  async function setWishStatus(wish: Wish, nextStatus: WishStatus) {
    const updatedWish = await sendWishRequest(`/api/wishes/${wish.id}`, "PATCH", { status: nextStatus });
    replaceWish(updatedWish);
    setSelectedWish({ type: "wish", wish: updatedWish });
  }

  async function deleteWish(wish: Wish) {
    if (!confirm(t("wishes.deleteConfirm", { title: wish.title }))) return;
    const accessToken = await getAccessToken();
    if (!accessToken) throw new Error(t("wishes.signInFirst"));

    const response = await fetch(`/api/wishes/${wish.id}`, {
      method: "DELETE",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Cache-Control": "no-cache"
      }
    });
    const payload = (await response.json()) as WishMutationResponse;
    if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to delete wish.");

    setWishes((current) => current.filter((item) => item.id !== wish.id));
    setSelectedWish(null);
  }

  function replaceWish(nextWish: Wish) {
    setWishes((current) => current.map((item) => item.id === nextWish.id ? nextWish : item));
  }

  async function sendWishRequest(url: string, method: "POST" | "PATCH", body: unknown): Promise<Wish> {
    const accessToken = await getAccessToken();
    if (!accessToken) throw new Error(t("wishes.signInFirst"));

    const response = await fetch(url, {
      method,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "Cache-Control": "no-cache"
      },
      body: JSON.stringify(body)
    });
    const payload = (await response.json()) as WishMutationResponse;
    if (!response.ok || payload.error || !payload.wish) {
      throw new Error(payload.error ?? "Failed to save wish.");
    }

    return payload.wish;
  }

  return (
    <section className="wishes-screen">
      <header className="wishes-header">
        <div>
          <span>{t("app.nav.desires")}</span>
          <h1>{t("wishes.title")}</h1>
        </div>
        <button className="wishes-add-button" type="button" aria-label={t("wishes.add")} onClick={() => setIsCreateOpen(true)}>
          <Plus size={22} />
        </button>
      </header>

      {isRefreshing && wishes.length > 0 ? <div className="wishes-refreshing">{t("wishes.refreshing")}</div> : null}
      {status === "loading" && wishes.length === 0 ? <WishState title={t("app.common.loading")} description={t("wishes.loading.description")} /> : null}
      {status === "offline" && wishes.length === 0 ? <WishState title={t("app.common.offline")} description={t("wishes.offline.description")} /> : null}
      {status === "unauthenticated" ? <WishState title={t("wishes.authRequiredTitle")} description={t("wishes.authRequiredDescription")} /> : null}
      {status === "error" && wishes.length === 0 ? <WishState title={t("wishes.error")} description={errorMessage ?? t("wishes.errorDescription")} /> : null}

      {status !== "unauthenticated" ? (
        <>
          <WishSection title={t("wishes.mine")} emptyText={t("wishes.emptyMine")} itemsCount={activeWishes.length}>
            <button className="wish-tile wish-add-tile" type="button" onClick={() => setIsCreateOpen(true)}>
              <Plus size={28} />
              <span>{t("wishes.add")}</span>
            </button>
            {activeWishes.map((wish) => (
              <WishTile key={wish.id} title={wish.title} imageUrl={wish.image_url} badge={visibilityLabel(wish.visibility, t)} onClick={() => setSelectedWish({ type: "wish", wish })} />
            ))}
          </WishSection>

          <WishSection title={t("wishes.recommendations")} emptyText={t("wishes.emptyRecommendations")} itemsCount={recommendedWishes.length}>
            {recommendedWishes.map((wish) => (
              <WishTile
                key={wish.id}
                title={text(wish.title, locale)}
                imageUrl={wish.image_url}
                badge={t("wishes.template")}
                onClick={() => setSelectedWish({ type: "recommended", wish })}
              />
            ))}
          </WishSection>

          {completedWishes.length > 0 ? (
            <WishSection title={t("wishes.completed")} emptyText={t("wishes.emptyCompleted")} itemsCount={completedWishes.length}>
              {completedWishes.map((wish) => (
                <WishTile key={wish.id} title={wish.title} imageUrl={wish.image_url} badge={t("wishes.status.completed")} onClick={() => setSelectedWish({ type: "wish", wish })} />
              ))}
            </WishSection>
          ) : null}

          {archivedWishes.length > 0 ? (
            <WishSection title={t("wishes.archived")} emptyText={t("wishes.emptyArchived")} itemsCount={archivedWishes.length}>
              {archivedWishes.map((wish) => (
                <WishTile key={wish.id} title={wish.title} imageUrl={wish.image_url} badge={t("wishes.status.archived")} onClick={() => setSelectedWish({ type: "wish", wish })} />
              ))}
            </WishSection>
          ) : null}
        </>
      ) : null}

      {selectedWish ? (
        <WishDetailModal
          selectedWish={selectedWish}
          onArchive={(wish) => setWishStatus(wish, "archived").catch((detailError) => setErrorMessage(detailError instanceof Error ? detailError.message : t("wishes.error")))}
          onClose={() => setSelectedWish(null)}
          onComplete={(wish) => setWishStatus(wish, "completed").catch((detailError) => setErrorMessage(detailError instanceof Error ? detailError.message : t("wishes.error")))}
          onDelete={(wish) => deleteWish(wish).catch((detailError) => setErrorMessage(detailError instanceof Error ? detailError.message : t("wishes.error")))}
          onEdit={(wish) => {
            setSelectedWish(null);
            setEditingWish(wish);
          }}
          onRestore={(wish) => setWishStatus(wish, "active").catch((detailError) => setErrorMessage(detailError instanceof Error ? detailError.message : t("wishes.error")))}
        />
      ) : null}

      {isCreateOpen ? (
        <WishFormModal
          title={t("wishes.createTitle")}
          initialState={emptyForm}
          onClose={() => setIsCreateOpen(false)}
          onSave={createWish}
        />
      ) : null}

      {editingWish ? (
        <WishFormModal
          title={t("wishes.editTitle")}
          initialState={wishToForm(editingWish)}
          onClose={() => setEditingWish(null)}
          onSave={(values) => updateWish(editingWish, values)}
        />
      ) : null}
    </section>
  );
}

function WishSection({ children, emptyText, itemsCount, title }: { children: ReactNode; emptyText: string; itemsCount: number; title: string }) {
  return (
    <section className="wish-section">
      <h2>{title}</h2>
      {itemsCount === 0 ? <div className="wish-empty">{emptyText}</div> : null}
      <div className="wish-grid" aria-label={title}>{children}</div>
    </section>
  );
}

function WishTile({ badge, imageUrl, onClick, title }: { badge?: string; imageUrl: string | null; onClick: () => void; title: string }) {
  return (
    <button className="wish-tile" type="button" onClick={onClick}>
      {imageUrl ? <img alt="" src={imageUrl} loading="lazy" /> : <div className="wish-tile-placeholder">OA</div>}
      {badge ? <em>{badge}</em> : null}
      <span>{title}</span>
    </button>
  );
}

function WishState({ title, description }: { title: string; description: string }) {
  return (
    <div className="wish-offline-state">
      <div className="wish-offline-icon">OA</div>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

function WishDetailModal({
  onArchive,
  onClose,
  onComplete,
  onDelete,
  onEdit,
  onRestore,
  selectedWish
}: {
  selectedWish: SelectedWish;
  onArchive: (wish: Wish) => void;
  onClose: () => void;
  onComplete: (wish: Wish) => void;
  onDelete: (wish: Wish) => void;
  onEdit: (wish: Wish) => void;
  onRestore: (wish: Wish) => void;
}) {
  const { locale, t } = useUserContext();
  const isPersonal = selectedWish.type === "wish";
  const title = isPersonal ? selectedWish.wish.title : text(selectedWish.wish.title, locale);
  const description = isPersonal ? selectedWish.wish.description : text(selectedWish.wish.description, locale);
  const imageUrl = selectedWish.wish.image_url;
  const category = selectedWish.wish.category;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="modal-sheet wish-modal" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <button className="text-button" type="button" onClick={onClose}>{t("app.common.close")}</button>
          <h2>{title}</h2>
          <span />
        </div>
        {imageUrl ? <img className="wish-modal-image" alt="" src={imageUrl} /> : <div className="wish-modal-placeholder">OA</div>}
        <div className="wish-modal-body">
          {category ? <strong>{category}</strong> : null}
          {description ? <p>{description}</p> : null}
          <div className="wish-meta">
            {isPersonal && selectedWish.wish.target_amount ? <span>{formatAmount(selectedWish.wish.target_amount, selectedWish.wish.target_currency)}</span> : null}
            {!isPersonal && selectedWish.wish.estimated_cost ? <span>{selectedWish.wish.estimated_cost}</span> : null}
            <span>{t("wishes.level", { level: selectedWish.wish.difficulty_level })}</span>
            {isPersonal ? <span>{visibilityLabel(selectedWish.wish.visibility, t)}</span> : <span>{t("wishes.template")}</span>}
          </div>
          {isPersonal ? (
            <div className="wish-detail-actions">
              <button className="secondary-button" type="button" onClick={() => onEdit(selectedWish.wish)}>
                <Pencil size={16} />
                {t("app.common.edit")}
              </button>
              {selectedWish.wish.status === "completed" || selectedWish.wish.status === "archived" ? (
                <button className="secondary-button" type="button" onClick={() => onRestore(selectedWish.wish)}>
                  <Plus size={16} />
                  {t("wishes.restore")}
                </button>
              ) : (
                <button className="secondary-button" type="button" onClick={() => onComplete(selectedWish.wish)}>
                  <Check size={16} />
                  {t("wishes.complete")}
                </button>
              )}
              {selectedWish.wish.status !== "archived" ? (
                <button className="secondary-button" type="button" onClick={() => onArchive(selectedWish.wish)}>
                  <Archive size={16} />
                  {t("wishes.archiveAction")}
                </button>
              ) : null}
              <button className="danger-button" type="button" onClick={() => onDelete(selectedWish.wish)}>
                <Trash2 size={16} />
                {t("app.common.delete")}
              </button>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function WishFormModal({
  initialState,
  onClose,
  onSave,
  title
}: {
  initialState: FormState;
  onClose: () => void;
  onSave: (values: FormState) => Promise<void>;
  title: string;
}) {
  const { t } = useUserContext();
  const [form, setForm] = useState<FormState>(initialState);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.title.trim()) {
      setError(t("wishes.titleRequired"));
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await onSave(form);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("wishes.error"));
    } finally {
      setIsSaving(false);
    }
  }

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <form className="modal-sheet wish-form-modal" onSubmit={handleSubmit} onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <button className="text-button" type="button" onClick={onClose}>{t("app.common.cancel")}</button>
          <h2>{title}</h2>
          <button className="text-button primary" type="submit" disabled={isSaving}>{isSaving ? t("wishes.saving") : t("app.common.done")}</button>
        </div>
        <div className="wish-form-grid">
          <label className="finance-field">
            <span>{t("wishes.titleLabel")}</span>
            <input value={form.title} placeholder={t("wishes.titlePlaceholder")} onChange={(event) => updateField("title", event.target.value)} />
          </label>
          <label className="finance-field">
            <span>{t("wishes.descriptionLabel")}</span>
            <textarea value={form.description} placeholder={t("wishes.descriptionPlaceholder")} onChange={(event) => updateField("description", event.target.value)} />
          </label>
          <div className="term-row">
            <label className="finance-field">
              <span>{t("wishes.categoryLabel")}</span>
              <input value={form.category} placeholder={t("wishes.categoryPlaceholder")} onChange={(event) => updateField("category", event.target.value)} />
            </label>
            <label className="finance-field">
              <span>{t("wishes.imageUrlLabel")}</span>
              <input value={form.imageUrl} placeholder={t("wishes.imageUrlPlaceholder")} onChange={(event) => updateField("imageUrl", event.target.value)} />
            </label>
          </div>
          <div className="term-row">
            <label className="finance-field">
              <span>{t("wishes.targetAmountLabel")}</span>
              <input inputMode="decimal" value={form.targetAmount} onChange={(event) => updateField("targetAmount", event.target.value)} />
            </label>
            <label className="finance-field">
              <span>{t("wishes.targetCurrencyLabel")}</span>
              <input value={form.targetCurrency} onChange={(event) => updateField("targetCurrency", event.target.value.toUpperCase())} />
            </label>
          </div>
          <div className="term-row">
            <label className="finance-field">
              <span>{t("wishes.difficultyLabel")}</span>
              <input inputMode="numeric" value={form.difficultyLevel} onChange={(event) => updateField("difficultyLevel", event.target.value)} />
            </label>
            <label className="finance-field">
              <span>{t("wishes.visibilityLabel")}</span>
              <select value={form.visibility} onChange={(event) => updateField("visibility", event.target.value as WishVisibility)}>
                <option value="private">{t("wishes.visibility.private")}</option>
                <option value="public">{t("wishes.visibility.public")}</option>
                <option value="team">{t("wishes.visibility.team")}</option>
                <option value="contacts">{t("wishes.visibility.contacts")}</option>
              </select>
            </label>
          </div>
          {form.imageUrl ? <img className="wish-form-preview" alt="" src={form.imageUrl} /> : null}
          {error ? <p className="finance-error inline">{error}</p> : null}
        </div>
      </form>
    </div>
  );
}

async function getAccessToken(): Promise<string | null> {
  const supabase = getBrowserSupabaseClient();
  const {
    data: { session },
    error
  } = await supabase.auth.getSession();

  if (error) throw error;
  return session?.access_token ?? null;
}

function formToPayload(form: FormState) {
  return {
    title: form.title,
    description: form.description,
    category: form.category,
    imageUrl: form.imageUrl,
    targetAmount: form.targetAmount,
    targetCurrency: form.targetCurrency,
    difficultyLevel: form.difficultyLevel,
    visibility: form.visibility
  };
}

function wishToForm(wish: Wish): FormState {
  return {
    title: wish.title,
    description: wish.description,
    category: wish.category ?? "",
    imageUrl: wish.image_url ?? "",
    targetAmount: wish.target_amount === null ? "" : String(wish.target_amount),
    targetCurrency: wish.target_currency,
    difficultyLevel: String(wish.difficulty_level),
    visibility: wish.visibility
  };
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

function formatAmount(amount: number, currency: string): string {
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`;
}

function visibilityLabel(visibility: WishVisibility, t: ReturnType<typeof useUserContext>["t"]): string {
  if (visibility === "public") return t("wishes.visibility.public");
  if (visibility === "team") return t("wishes.visibility.team");
  if (visibility === "contacts") return t("wishes.visibility.contacts");
  return t("wishes.visibility.private");
}
