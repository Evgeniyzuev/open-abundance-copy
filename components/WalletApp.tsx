"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { useUserContext } from "@/components/UserProvider";
import type { AppLocale } from "@/lib/i18n";
import { getBrowserSupabaseClient } from "@/lib/supabaseClient";

type WalletTab = "wallet" | "core";
type CoreAccrualRow = {
  accrual_date: string;
  core_before: number;
  daily_rate: number;
  gross_amount: number;
  reinvest_percent: number;
  core_amount: number;
  wallet_amount: number;
  core_after: number;
  created_at: string;
};

export default function WalletApp({ activeTab, refreshNonce }: { activeTab: WalletTab; refreshNonce: number }) {
  const { core, wallet, user, loading, refreshing, error, locale, refreshUserData, t } = useUserContext();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRows, setHistoryRows] = useState<CoreAccrualRow[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    refreshUserData().catch((refreshError) => {
      console.warn("Wallet refresh failed", refreshError);
    });
  }, [activeTab, refreshNonce, refreshUserData]);

  useEffect(() => {
    if (activeTab !== "core") setHistoryOpen(false);
  }, [activeTab]);

  useEffect(() => {
    if (!user) {
      setHistoryRows(null);
      setHistoryOpen(false);
    }
  }, [user]);

  async function toggleCoreHistory() {
    const nextOpen = !historyOpen;
    setHistoryOpen(nextOpen);
    if (!nextOpen || historyRows || historyLoading) return;

    setHistoryLoading(true);
    setHistoryError(null);
    try {
      setHistoryRows(await loadCoreAccrualHistory());
    } catch (loadError) {
      console.warn("Core accrual history load failed", loadError);
      setHistoryError(loadError instanceof Error ? loadError.message : "Failed to load core history.");
    } finally {
      setHistoryLoading(false);
    }
  }

  return (
    <section className="finance-screen">
      <header className="finance-header">
        <div>
          <span>Finance</span>
          <h1>{t("wallet.title")}</h1>
        </div>
        <button className="finance-icon-button" type="button" aria-label={t("app.common.refresh")} disabled={refreshing} onClick={() => refreshUserData()}>
          <RefreshCw size={19} className={refreshing ? "spin" : ""} />
        </button>
      </header>

      {!user && !loading ? (
        <FinanceState title={t("wallet.registration.title")} description={t("wallet.registration.description")} />
      ) : null}

      {user && activeTab === "wallet" ? (
        <BalancePanel
          title="Wallet"
          label={t("wallet.availableBalance")}
          amount={wallet?.balance ?? 0}
          locale={locale}
          meta={wallet ? t("app.common.updated", { date: formatDate(wallet.updated_at, locale) }) : t("app.common.created")}
        />
      ) : null}

      {user && activeTab === "core" ? (
        <>
          <BalancePanel
            title="Core"
            label={t("wallet.core")}
            amount={core?.balance ?? 0}
            locale={locale}
            meta={core ? t("wallet.coreMeta", { level: core.level, percent: core.reinvest_percent, date: formatDate(core.updated_at, locale) }) : t("app.common.created")}
          />
          <HistoryPanel
            title={locale === "ru" ? "История начислений Core" : "Core payout history"}
            open={historyOpen}
            loading={historyLoading}
            error={historyError}
            emptyText={locale === "ru" ? "Начислений пока нет." : "No payouts yet."}
            loadingText={t("app.common.loading")}
            rowCount={historyRows?.length ?? 0}
            onToggle={toggleCoreHistory}
          >
            <div className="payout-list">
              {(historyRows ?? []).map((row) => (
                <article className="payout-row" key={`${row.accrual_date}-${row.created_at}`}>
                  <div>
                    <strong>{formatDay(row.accrual_date, locale)}</strong>
                    <span>{locale === "ru" ? "Daily rate" : "Daily rate"} {formatPercent(row.daily_rate * 100, locale)}</span>
                  </div>
                  <div>
                    <strong>+{formatMoney(row.core_amount, locale)}</strong>
                    <span>{locale === "ru" ? "Core" : "to Core"}</span>
                  </div>
                  <p>{`${formatMoney(row.core_before, locale)} -> ${formatMoney(row.core_after, locale)} · Wallet +${formatMoney(row.wallet_amount, locale)}`}</p>
                </article>
              ))}
            </div>
          </HistoryPanel>
        </>
      ) : null}

      {error ? <p className="finance-error">{error}</p> : null}
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

async function loadCoreAccrualHistory(): Promise<CoreAccrualRow[]> {
  const token = await getAccessToken();
  const response = await fetch("/api/core/accrual-history?limit=30", {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` }
  });
  const payload = (await response.json()) as { rows?: CoreAccrualRow[]; error?: string };
  if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load core history.");
  return payload.rows ?? [];
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

function BalancePanel({ title, label, amount, meta, locale }: { title: string; label: string; amount: number; meta: string; locale: AppLocale }) {
  return (
    <section className="balance-panel">
      <span>{title}</span>
      <small>{label}</small>
      <strong>{formatMoney(amount, locale)}</strong>
      <p>{meta}</p>
    </section>
  );
}

function FinanceState({ title, description }: { title: string; description: string }) {
  return (
    <div className="finance-state">
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

function formatMoney(value: number, locale: AppLocale): string {
  return `${new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} $`;
}

function formatPercent(value: number, locale: AppLocale): string {
  return `${new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(value)}%`;
}

function formatDate(value: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatDay(value: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00Z`));
}
