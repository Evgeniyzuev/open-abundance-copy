"use client";

import { useEffect, useState } from "react";
import { Landmark, RefreshCw, Wallet } from "lucide-react";
import { useUserContext } from "@/components/UserProvider";

type WalletTab = "wallet" | "core";

export default function WalletApp({ refreshNonce }: { refreshNonce: number }) {
  const { core, wallet, user, loading, refreshing, error, refreshUserData } = useUserContext();
  const [activeTab, setActiveTab] = useState<WalletTab>("wallet");

  useEffect(() => {
    refreshUserData().catch((refreshError) => {
      console.warn("Wallet refresh failed", refreshError);
    });
  }, [refreshNonce, refreshUserData]);

  return (
    <section className="finance-screen">
      <header className="finance-header">
        <div>
          <span>Finance</span>
          <h1>Кошелек</h1>
        </div>
        <button className="finance-icon-button" type="button" aria-label="Обновить" disabled={refreshing} onClick={() => refreshUserData()}>
          <RefreshCw size={19} className={refreshing ? "spin" : ""} />
        </button>
      </header>

      <div className="segmented-tabs">
        <button className={activeTab === "wallet" ? "active" : ""} type="button" onClick={() => setActiveTab("wallet")}>
          <Wallet size={17} />
          Wallet
        </button>
        <button className={activeTab === "core" ? "active" : ""} type="button" onClick={() => setActiveTab("core")}>
          <Landmark size={17} />
          Core
        </button>
      </div>

      {!user && !loading ? (
        <FinanceState title="Нужна регистрация" description="Пройдите челлендж регистрации, чтобы создать Wallet и Core." />
      ) : null}

      {user && activeTab === "wallet" ? (
        <BalancePanel
          title="Wallet"
          label="Доступный баланс"
          amount={wallet?.balance ?? 0}
          meta={wallet ? `Обновлено ${formatDate(wallet.updated_at)}` : "Создаем счет..."}
        />
      ) : null}

      {user && activeTab === "core" ? (
        <BalancePanel
          title="Core"
          label="Ядро"
          amount={core?.balance ?? 0}
          meta={core ? `Уровень ${core.level} · реинвест ${core.reinvest_percent}% · ${formatDate(core.updated_at)}` : "Создаем счет..."}
        />
      ) : null}

      {error ? <p className="finance-error">{error}</p> : null}
    </section>
  );
}

function BalancePanel({ title, label, amount, meta }: { title: string; label: string; amount: number; meta: string }) {
  return (
    <section className="balance-panel">
      <span>{title}</span>
      <small>{label}</small>
      <strong>{formatMoney(amount)}</strong>
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

function formatMoney(value: number): string {
  return `${new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} $`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
