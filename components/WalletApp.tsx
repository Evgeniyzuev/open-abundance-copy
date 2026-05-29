"use client";

import { useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { useUserContext } from "@/components/UserProvider";
import type { AppLocale } from "@/lib/i18n";

type WalletTab = "wallet" | "core";

export default function WalletApp({ activeTab, refreshNonce }: { activeTab: WalletTab; refreshNonce: number }) {
  const { core, wallet, user, loading, refreshing, error, locale, refreshUserData, t } = useUserContext();

  useEffect(() => {
    refreshUserData().catch((refreshError) => {
      console.warn("Wallet refresh failed", refreshError);
    });
  }, [activeTab, refreshNonce, refreshUserData]);

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
        <BalancePanel
          title="Core"
          label={t("wallet.core")}
          amount={core?.balance ?? 0}
          locale={locale}
          meta={core ? t("wallet.coreMeta", { level: core.level, percent: core.reinvest_percent, date: formatDate(core.updated_at, locale) }) : t("app.common.created")}
        />
      ) : null}

      {error ? <p className="finance-error">{error}</p> : null}
    </section>
  );
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

function formatDate(value: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
