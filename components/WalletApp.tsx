"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Calculator, Check, ChevronDown, ChevronUp, RefreshCw, RotateCcw, TrendingUp } from "lucide-react";
import { type CoreAccount, useUserContext } from "@/components/UserProvider";
import { calculateDailyIncome, calculateFutureCore, coreRequiredForDailyIncome, daysFromTerm, findDaysToTarget, formatDurationParts, normalizePercent } from "@/lib/coreCalculator";
import type { AppLocale } from "@/lib/i18n";
import { formatAdaptiveMoney, formatMoney } from "@/lib/moneyFormat";
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
type WalletHistoryRow = {
  id: string;
  operation_date: string;
  kind: "daily_core_payout";
  amount: number;
  daily_rate: number;
  gross_amount: number;
  reinvest_percent: number;
  created_at: string;
};
type CalculatorMode = "future" | "target";
type TargetKind = "core" | "daily";
type TermUnit = "days" | "months" | "years";

export default function WalletApp({ activeTab, refreshNonce, onRefresh }: { activeTab: WalletTab; refreshNonce: number; onRefresh: () => Promise<void> }) {
  const { core, wallet, user, loading, refreshing, error, locale, applyServerData, t } = useUserContext();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRows, setHistoryRows] = useState<CoreAccrualRow[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [walletHistoryOpen, setWalletHistoryOpen] = useState(false);
  const [walletHistoryRows, setWalletHistoryRows] = useState<WalletHistoryRow[] | null>(null);
  const [walletHistoryLoading, setWalletHistoryLoading] = useState(false);
  const [walletHistoryError, setWalletHistoryError] = useState<string | null>(null);
  const [reinvestValue, setReinvestValue] = useState("0");
  const [reinvestSaving, setReinvestSaving] = useState(false);
  const [reinvestError, setReinvestError] = useState<string | null>(null);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [calculatorMode, setCalculatorMode] = useState<CalculatorMode>("future");
  const [targetKind, setTargetKind] = useState<TargetKind>("core");
  const [useCurrentCore, setUseCurrentCore] = useState(true);
  const [startCore, setStartCore] = useState("0");
  const [dailyAdditions, setDailyAdditions] = useState("10");
  const [simulationReinvest, setSimulationReinvest] = useState("0");
  const [termValue, setTermValue] = useState("30");
  const [termUnit, setTermUnit] = useState<TermUnit>("years");
  const [targetCore, setTargetCore] = useState("10000");
  const [targetDailyIncome, setTargetDailyIncome] = useState("10");
  const [targetCalculationTouched, setTargetCalculationTouched] = useState(false);

  useEffect(() => {
    if (activeTab !== "core") setHistoryOpen(false);
    if (activeTab !== "wallet") setWalletHistoryOpen(false);
  }, [activeTab]);

  useEffect(() => {
    setHistoryRows(null);
    setHistoryLoading(false);
    setHistoryError(null);
    setWalletHistoryRows(null);
    setWalletHistoryLoading(false);
    setWalletHistoryError(null);
  }, [activeTab, user?.id]);

  useEffect(() => {
    let mounted = true;

    async function loadHistory() {
      if (activeTab !== "core" || !historyOpen || !user) return;

      setHistoryError(null);

      if (!navigator.onLine) {
        setHistoryLoading(false);
        return;
      }

      setHistoryLoading(true);
      try {
        const rows = await loadCoreAccrualHistory();
        if (mounted) setHistoryRows(rows);
      } catch (loadError) {
        console.warn("Core accrual history load failed", loadError);
        if (mounted) setHistoryError(loadError instanceof Error ? loadError.message : "Failed to load core history.");
      } finally {
        if (mounted) setHistoryLoading(false);
      }
    }

    loadHistory();
    return () => {
      mounted = false;
    };
  }, [activeTab, historyOpen, refreshNonce, user]);

  useEffect(() => {
    let mounted = true;

    async function loadHistory() {
      if (activeTab !== "wallet" || !walletHistoryOpen || !user) return;

      setWalletHistoryError(null);

      if (!navigator.onLine) {
        setWalletHistoryLoading(false);
        return;
      }

      setWalletHistoryLoading(true);
      try {
        const rows = await loadWalletHistory();
        if (mounted) setWalletHistoryRows(rows);
      } catch (loadError) {
        console.warn("Wallet history load failed", loadError);
        if (mounted) setWalletHistoryError(loadError instanceof Error ? loadError.message : "Failed to load wallet history.");
      } finally {
        if (mounted) setWalletHistoryLoading(false);
      }
    }

    loadHistory();
    return () => {
      mounted = false;
    };
  }, [activeTab, refreshNonce, user, walletHistoryOpen]);

  useEffect(() => {
    if (!user) {
      setHistoryRows(null);
      setHistoryOpen(false);
      setWalletHistoryRows(null);
      setWalletHistoryOpen(false);
    }
  }, [user]);

  useEffect(() => {
    if (!core) return;
    setReinvestValue(formatInputNumber(core.reinvest_percent));
    setSimulationReinvest(formatInputNumber(core.reinvest_percent));
  }, [core?.reinvest_percent, core]);

  useEffect(() => {
    if (!core || !useCurrentCore) return;
    setStartCore(formatInputNumber(core.balance));
  }, [core?.balance, core, useCurrentCore]);

  function toggleCoreHistory() {
    const nextOpen = !historyOpen;
    setHistoryOpen(nextOpen);
    if (nextOpen) setHistoryRows(null);
  }

  function toggleWalletHistory() {
    const nextOpen = !walletHistoryOpen;
    setWalletHistoryOpen(nextOpen);
    if (nextOpen) setWalletHistoryRows(null);
  }

  async function saveReinvestPercent() {
    if (!user || !core || !isValidPercentString(reinvestValue)) return;

    setReinvestSaving(true);
    setReinvestError(null);
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/core/reinvest", {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ reinvestPercent: Number(reinvestValue) })
      });
      const payload = (await response.json()) as { core?: CoreAccount; error?: string };

      if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to save reinvest.");
      if (payload.core) applyServerData({ core: payload.core });
      await onRefresh();
    } catch (saveError) {
      setReinvestError(saveError instanceof Error ? saveError.message : "Failed to save reinvest.");
    } finally {
      setReinvestSaving(false);
    }
  }

  function resetReinvestPercent() {
    if (!core) return;
    setReinvestValue(formatInputNumber(core.reinvest_percent));
    setReinvestError(null);
  }

  function updateReinvestDraft(value: string) {
    setReinvestValue(value);
    setReinvestError(null);
  }

  function updateSimulationReinvest(value: string) {
    setSimulationReinvest(value);
  }

  async function recordCalculatorChallengeProgress() {
    if (!user) return;

    try {
      const token = await getAccessToken();
      await fetch("/api/challenges/progress", {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ verificationLogic: "calculate_time_to_goal" })
      });
    } catch (challengeError) {
      console.warn("Calculator challenge progress failed", challengeError);
    }
  }

  const savedReinvestPercent = core?.reinvest_percent ?? 0;
  const draftReinvestPercent = parseNumber(reinvestValue);
  const reinvestDraftValid = isValidPercentString(reinvestValue);
  const reinvestChanged = core ? reinvestDraftValid && Math.abs(normalizePercent(draftReinvestPercent) - normalizePercent(savedReinvestPercent)) >= 0.01 : false;
  const currentCoreBalance = core?.balance ?? 0;
  const currentDailyIncome = calculateDailyIncome(currentCoreBalance, reinvestDraftValid ? draftReinvestPercent : savedReinvestPercent);
  const simulation = {
    startCore: parseNumber(startCore),
    dailyAdditions: parseNumber(dailyAdditions),
    reinvestPercent: isValidPercentString(simulationReinvest) ? parseNumber(simulationReinvest) : savedReinvestPercent,
    days: daysFromTerm(parseNumber(termValue), termUnit)
  };
  const futureCore = calculateFutureCore(simulation);
  const futureDailyIncome = calculateDailyIncome(futureCore, simulation.reinvestPercent);
  const requestedTargetCore = targetKind === "daily" ? coreRequiredForDailyIncome(parseNumber(targetDailyIncome)) : parseNumber(targetCore);
  const targetCalculation = findDaysToTarget({ ...simulation, days: 0, targetCore: requestedTargetCore });
  const summaryGoalLabel = calculatorMode === "target" ? formatTargetSummary(targetCalculation, locale) : formatMoney(futureCore, locale);
  const summaryDailyLabel = calculatorMode === "target" ? formatMoney(requestedTargetCore, locale) : `${formatMoney(futureDailyIncome.gross, locale)}/${locale === "ru" ? "день" : "day"}`;

  return (
    <section className="finance-screen">
      <header className="finance-header">
        <div>
          <span>Finance</span>
          <h1>{t("wallet.title")}</h1>
        </div>
        <button className="finance-icon-button" type="button" aria-label={t("app.common.refresh")} disabled={refreshing} onClick={() => { void onRefresh(); }}>
          <RefreshCw size={19} className={refreshing ? "spin" : ""} />
        </button>
      </header>

      {!user && !loading ? (
        <FinanceState title={t("wallet.registration.title")} description={t("wallet.registration.description")} />
      ) : null}

      {user && activeTab === "wallet" ? (
        <>
          <BalancePanel
            title="Wallet"
            label={t("wallet.availableBalance")}
            amount={wallet?.balance ?? 0}
            locale={locale}
            meta={wallet ? t("app.common.updated", { date: formatDate(wallet.updated_at, locale) }) : t("app.common.created")}
          />
          <HistoryPanel
            title={locale === "ru" ? "История Wallet" : "Wallet history"}
            open={walletHistoryOpen}
            loading={walletHistoryLoading}
            error={walletHistoryError}
            emptyText={locale === "ru" ? "Операций пока нет." : "No operations yet."}
            loadingText={t("app.common.loading")}
            rowCount={walletHistoryRows?.length ?? 0}
            onToggle={toggleWalletHistory}
          >
            <div className="payout-list">
              {(walletHistoryRows ?? []).map((row) => (
                <article className="payout-row" key={row.id}>
                  <div>
                    <strong>{formatDay(row.operation_date, locale)}</strong>
                    <span>{locale === "ru" ? "Daily Core payout" : "Daily Core payout"}</span>
                  </div>
                  <div>
                    <strong>+{formatMoney(row.amount, locale)}</strong>
                    <span>Wallet</span>
                  </div>
                  <p>{`${locale === "ru" ? "Daily rate" : "Daily rate"} ${formatPercent(row.daily_rate * 100, locale)} · ${locale === "ru" ? "Реинвест" : "Reinvest"} ${formatPercentCompact(row.reinvest_percent, locale)}`}</p>
                </article>
              ))}
            </div>
          </HistoryPanel>
        </>
      ) : null}

      {user && activeTab === "core" ? (
        <>
          <BalancePanel
            title="Core"
            label={t("wallet.core")}
            amount={core?.balance ?? 0}
            locale={locale}
            meta={core ? t("wallet.coreMeta", { level: core.level, percent: core.reinvest_percent, date: formatDate(core.updated_at, locale) }) : t("app.common.created")}
            adaptiveAmount
          />
          <ReinvestPanel
            value={reinvestValue}
            savedPercent={savedReinvestPercent}
            dailyIncome={currentDailyIncome}
            valid={reinvestDraftValid}
            changed={reinvestChanged}
            saving={reinvestSaving}
            error={reinvestError}
            locale={locale}
            onChange={updateReinvestDraft}
            onReset={resetReinvestPercent}
            onSave={saveReinvestPercent}
          />
          <CoreCalculatorPanel
            open={calculatorOpen}
            mode={calculatorMode}
            targetKind={targetKind}
            useCurrentCore={useCurrentCore}
            startCore={startCore}
            dailyAdditions={dailyAdditions}
            simulationReinvest={simulationReinvest}
            termValue={termValue}
            termUnit={termUnit}
            targetCore={targetCore}
            targetDailyIncome={targetDailyIncome}
            futureCore={futureCore}
            futureDailyIncome={futureDailyIncome}
            targetCalculation={targetCalculation}
            requestedTargetCore={requestedTargetCore}
            summaryGoalLabel={summaryGoalLabel}
            summaryDailyLabel={summaryDailyLabel}
            locale={locale}
            onToggle={() => setCalculatorOpen((open) => !open)}
            onModeChange={setCalculatorMode}
            onTargetKindChange={setTargetKind}
            onUseCurrentCoreChange={(checked) => {
              setUseCurrentCore(checked);
              if (checked) setStartCore(formatInputNumber(currentCoreBalance));
            }}
            onStartCoreChange={(value) => {
              setUseCurrentCore(false);
              setStartCore(value);
            }}
            onDailyAdditionsChange={setDailyAdditions}
            onSimulationReinvestChange={updateSimulationReinvest}
            onTermValueChange={setTermValue}
            onTermUnitChange={setTermUnit}
            onTargetCoreChange={(value) => {
              setTargetCore(value);
              setTargetCalculationTouched(false);
            }}
            onTargetDailyIncomeChange={(value) => {
              setTargetDailyIncome(value);
              setTargetCalculationTouched(false);
            }}
            targetCalculationTouched={targetCalculationTouched}
            onCalculateTarget={() => {
              setTargetCalculationTouched(true);
              recordCalculatorChallengeProgress();
            }}
          />
          <HistoryPanel
            title={locale === "ru" ? "История Core" : "Core history"}
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
                    <strong>+{formatAdaptiveMoney(row.core_amount, locale)}</strong>
                    <span>{locale === "ru" ? "Core" : "to Core"}</span>
                  </div>
                  <p>{`${formatAdaptiveMoney(row.core_before, locale)} -> ${formatAdaptiveMoney(row.core_after, locale)} · Wallet +${formatAdaptiveMoney(row.wallet_amount, locale)}`}</p>
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

function ReinvestPanel({
  value,
  savedPercent,
  dailyIncome,
  valid,
  changed,
  saving,
  error,
  locale,
  onChange,
  onReset,
  onSave
}: {
  value: string;
  savedPercent: number;
  dailyIncome: ReturnType<typeof calculateDailyIncome>;
  valid: boolean;
  changed: boolean;
  saving: boolean;
  error: string | null;
  locale: AppLocale;
  onChange: (value: string) => void;
  onReset: () => void;
  onSave: () => void;
}) {
  const percent = valid ? normalizePercent(parseNumber(value)) : savedPercent;

  return (
    <section className="core-tool-panel reinvest-panel">
      <div className="core-tool-heading">
        <div>
          <span>{locale === "ru" ? "Реинвест" : "Reinvest"}</span>
          <strong>{formatPercentCompact(percent, locale)} {locale === "ru" ? "в Core" : "to Core"}</strong>
        </div>
        <div className="reinvest-actions">
          {changed ? (
            <button className="finance-small-icon-button" type="button" aria-label={locale === "ru" ? "Сбросить" : "Reset"} disabled={saving} onClick={onReset}>
              <RotateCcw size={16} />
            </button>
          ) : null}
          <button className="finance-small-icon-button primary" type="button" aria-label={locale === "ru" ? "Сохранить" : "Save"} disabled={!changed || !valid || saving} onClick={onSave}>
            <Check size={17} />
          </button>
        </div>
      </div>

      <div className="reinvest-control-row">
        <input
          className={valid ? "finance-number-input" : "finance-number-input invalid"}
          type="number"
          min="0"
          max="100"
          step="0.01"
          inputMode="decimal"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label={locale === "ru" ? "Процент реинвеста" : "Reinvest percent"}
        />
        <span>%</span>
        <input
          className="reinvest-slider"
          type="range"
          min="0"
          max="100"
          step="1"
          value={valid ? String(Math.round(percent)) : String(Math.round(savedPercent))}
          onChange={(event) => onChange(event.target.value)}
          aria-label={locale === "ru" ? "Ползунок реинвеста" : "Reinvest slider"}
        />
      </div>

      <div className="reinvest-split">
        <span>
          <TrendingUp size={15} />
          Core +{formatAdaptiveMoney(dailyIncome.toCore, locale)}
        </span>
        <span>Wallet +{formatAdaptiveMoney(dailyIncome.toWallet, locale)}</span>
      </div>

      {!valid ? <p className="finance-error inline">{locale === "ru" ? "Введите число от 0 до 100." : "Enter a number from 0 to 100."}</p> : null}
      {error ? <p className="finance-error inline">{error}</p> : null}
    </section>
  );
}

function CoreCalculatorPanel({
  open,
  mode,
  targetKind,
  useCurrentCore,
  startCore,
  dailyAdditions,
  simulationReinvest,
  termValue,
  termUnit,
  targetCore,
  targetDailyIncome,
  futureCore,
  futureDailyIncome,
  targetCalculation,
  requestedTargetCore,
  summaryGoalLabel,
  summaryDailyLabel,
  locale,
  onToggle,
  onModeChange,
  onTargetKindChange,
  onUseCurrentCoreChange,
  onStartCoreChange,
  onDailyAdditionsChange,
  onSimulationReinvestChange,
  onTermValueChange,
  onTermUnitChange,
  onTargetCoreChange,
  onTargetDailyIncomeChange,
  targetCalculationTouched,
  onCalculateTarget
}: {
  open: boolean;
  mode: CalculatorMode;
  targetKind: TargetKind;
  useCurrentCore: boolean;
  startCore: string;
  dailyAdditions: string;
  simulationReinvest: string;
  termValue: string;
  termUnit: TermUnit;
  targetCore: string;
  targetDailyIncome: string;
  futureCore: number;
  futureDailyIncome: ReturnType<typeof calculateDailyIncome>;
  targetCalculation: ReturnType<typeof findDaysToTarget>;
  requestedTargetCore: number;
  summaryGoalLabel: string;
  summaryDailyLabel: string;
  locale: AppLocale;
  onToggle: () => void;
  onModeChange: (mode: CalculatorMode) => void;
  onTargetKindChange: (kind: TargetKind) => void;
  onUseCurrentCoreChange: (checked: boolean) => void;
  onStartCoreChange: (value: string) => void;
  onDailyAdditionsChange: (value: string) => void;
  onSimulationReinvestChange: (value: string) => void;
  onTermValueChange: (value: string) => void;
  onTermUnitChange: (unit: TermUnit) => void;
  onTargetCoreChange: (value: string) => void;
  onTargetDailyIncomeChange: (value: string) => void;
  targetCalculationTouched: boolean;
  onCalculateTarget: () => void;
}) {
  const targetReady = targetCalculationTouched && mode === "target";
  const manualAdded = Math.max(0, parseNumber(dailyAdditions)) * daysFromTerm(parseNumber(termValue), termUnit);
  const reinvestGrowth = Math.max(0, futureCore - Math.max(0, parseNumber(startCore)) - manualAdded);

  return (
    <section className={open ? "core-tool-panel calculator-panel open" : "core-tool-panel calculator-panel"}>
      <button className="calculator-summary" type="button" onClick={onToggle}>
        <span className="calculator-title">
          <Calculator size={18} />
          {locale === "ru" ? "Калькулятор роста" : "Growth calculator"}
        </span>
        <span className="calculator-metrics">
          <span>
            <small>{mode === "target" ? (locale === "ru" ? "Цель" : "Goal") : (locale === "ru" ? "Будущий Core" : "Future Core")}</small>
            <strong>{summaryGoalLabel}</strong>
          </span>
          <span>
            <small>{mode === "target" ? (locale === "ru" ? "Core нужен" : "Required Core") : (locale === "ru" ? "Доход" : "Daily")}</small>
            <strong>{summaryDailyLabel}</strong>
          </span>
        </span>
        {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>

      {open ? (
        <div className="calculator-body">
          <div className="finance-segmented compact">
            <button className={mode === "future" ? "active" : ""} type="button" onClick={() => onModeChange("future")}>
              {locale === "ru" ? "Сумма через срок" : "Future amount"}
            </button>
            <button className={mode === "target" ? "active" : ""} type="button" onClick={() => onModeChange("target")}>
              {locale === "ru" ? "Срок до цели" : "Time to goal"}
            </button>
          </div>

          <div className="calculator-grid">
            <div className="calculator-fields">
              <label className="finance-field">
                <span>{locale === "ru" ? "Начальный Core" : "Start Core"}</span>
                <input type="number" min="0" inputMode="decimal" value={startCore} onChange={(event) => onStartCoreChange(event.target.value)} />
              </label>

              <label className="finance-check-row">
                <input type="checkbox" checked={useCurrentCore} onChange={(event) => onUseCurrentCoreChange(event.target.checked)} />
                <span>{locale === "ru" ? "Использовать текущий Core" : "Use current Core"}</span>
              </label>

              <label className="finance-field">
                <span>{locale === "ru" ? "Ежедневный прирост/Доход от челленджей" : "Daily additions/Challenge income"}</span>
                <input type="number" min="0" inputMode="decimal" value={dailyAdditions} onChange={(event) => onDailyAdditionsChange(event.target.value)} />
              </label>

              <label className="finance-field">
                <span>{locale === "ru" ? "Реинвест в сценарии" : "Scenario reinvest"}</span>
                <input type="number" min="0" max="100" step="0.01" inputMode="decimal" value={simulationReinvest} onChange={(event) => onSimulationReinvestChange(event.target.value)} />
              </label>

              {mode === "future" ? (
                <div className="term-row">
                  <label className="finance-field">
                    <span>{locale === "ru" ? "Срок" : "Term"}</span>
                    <input type="number" min="0" inputMode="decimal" value={termValue} onChange={(event) => onTermValueChange(event.target.value)} />
                  </label>
                  <div className="finance-segmented small">
                    {(["days", "months", "years"] as TermUnit[]).map((unit) => (
                      <button className={termUnit === unit ? "active" : ""} type="button" key={unit} onClick={() => onTermUnitChange(unit)}>
                        {unitLabel(unit, locale)}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <div className="finance-segmented compact">
                    <button className={targetKind === "core" ? "active" : ""} type="button" onClick={() => onTargetKindChange("core")}>
                      Core
                    </button>
                    <button className={targetKind === "daily" ? "active" : ""} type="button" onClick={() => onTargetKindChange("daily")}>
                      {locale === "ru" ? "Доход/день" : "Daily income"}
                    </button>
                  </div>
                  {targetKind === "core" ? (
                    <label className="finance-field">
                      <span>{locale === "ru" ? "Желаемый Core" : "Goal Core"}</span>
                      <input type="number" min="0" inputMode="decimal" value={targetCore} onChange={(event) => onTargetCoreChange(event.target.value)} />
                    </label>
                  ) : (
                    <label className="finance-field">
                      <span>{locale === "ru" ? "Желаемый доход в день" : "Goal daily income"}</span>
                      <input type="number" min="0" inputMode="decimal" value={targetDailyIncome} onChange={(event) => onTargetDailyIncomeChange(event.target.value)} />
                    </label>
                  )}
                  <button className="challenge-primary-action calculator-action" type="button" onClick={onCalculateTarget}>
                    {locale === "ru" ? "Рассчитать срок" : "Calculate time"}
                  </button>
                </>
              )}
            </div>

            <div className="calculator-results">
              {mode === "future" ? (
                <>
                  <MetricRow label={locale === "ru" ? "Будущий Core" : "Future Core"} value={formatMoney(futureCore, locale)} strong />
                  <MetricRow label={locale === "ru" ? "Доход в день" : "Daily income"} value={`${formatMoney(futureDailyIncome.gross, locale)}/${locale === "ru" ? "день" : "day"}`} />
                  <MetricRow label={locale === "ru" ? "Добавлено вручную" : "Added manually"} value={formatMoney(manualAdded, locale)} />
                  <MetricRow label={locale === "ru" ? "Рост от реинвеста" : "Reinvest growth"} value={formatMoney(reinvestGrowth, locale)} />
                </>
              ) : (
                <>
                  <MetricRow label={locale === "ru" ? "Нужный Core" : "Required Core"} value={formatMoney(requestedTargetCore, locale)} strong />
                  {targetReady ? <TargetResult calculation={targetCalculation} locale={locale} /> : (
                    <p className="calculator-hint">{locale === "ru" ? "Задайте цель и нажмите расчет." : "Set a target and calculate the timeline."}</p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function MetricRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={strong ? "metric-row strong" : "metric-row"}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TargetResult({ calculation, locale }: { calculation: ReturnType<typeof findDaysToTarget>; locale: AppLocale }) {
  if (calculation.kind === "reached") {
    return <MetricRow label={locale === "ru" ? "Срок" : "Time"} value={locale === "ru" ? "Уже достигнуто" : "Already reached"} strong />;
  }

  if (calculation.kind === "unreachable") {
    return <p className="calculator-hint">{locale === "ru" ? "Цель недостижима без ежедневного прироста или реинвеста." : "This target needs daily additions or reinvest to become reachable."}</p>;
  }

  if (calculation.kind === "beyond-range") {
    return <p className="calculator-hint">{locale === "ru" ? "Больше 100 лет с текущими параметрами." : "More than 100 years with current settings."}</p>;
  }

  return (
    <>
      <MetricRow label={locale === "ru" ? "Срок" : "Time"} value={formatDuration(calculation.days, locale)} strong />
      <MetricRow label={locale === "ru" ? "Дата цели" : "Target date"} value={formatTargetDate(calculation.days, locale)} />
    </>
  );
}

async function loadCoreAccrualHistory(): Promise<CoreAccrualRow[]> {
  const token = await getAccessToken();
  const response = await fetch(`/api/core/accrual-history?limit=30&ts=${Date.now()}`, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      "Cache-Control": "no-cache"
    }
  });
  const payload = (await response.json()) as { rows?: CoreAccrualRow[]; error?: string };
  if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load core history.");
  return payload.rows ?? [];
}

async function loadWalletHistory(): Promise<WalletHistoryRow[]> {
  const token = await getAccessToken();
  const response = await fetch(`/api/wallet/history?limit=30&ts=${Date.now()}`, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      "Cache-Control": "no-cache"
    }
  });
  const payload = (await response.json()) as { rows?: WalletHistoryRow[]; error?: string };
  if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load wallet history.");
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

function BalancePanel({
  title,
  label,
  amount,
  meta,
  locale,
  adaptiveAmount = false
}: {
  title: string;
  label: string;
  amount: number;
  meta: string;
  locale: AppLocale;
  adaptiveAmount?: boolean;
}) {
  return (
    <section className="balance-panel">
      <span>{title}</span>
      <small>{label}</small>
      <strong>{adaptiveAmount ? formatAdaptiveMoney(amount, locale) : formatMoney(amount, locale)}</strong>
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

function formatPercent(value: number, locale: AppLocale): string {
  return `${new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(value)}%`;
}

function formatPercentCompact(value: number, locale: AppLocale): string {
  return `${new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", { maximumFractionDigits: 2 }).format(Number.isFinite(value) ? value : 0)}%`;
}

function formatDate(value: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatDay(value: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00Z`));
}

function parseNumber(value: string): number {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function isValidPercentString(value: string): boolean {
  if (value.trim() === "") return false;
  const parsed = parseNumber(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100;
}

function formatInputNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return String(Math.round(value * 100) / 100);
}

function unitLabel(unit: TermUnit, locale: AppLocale): string {
  if (unit === "days") return locale === "ru" ? "дни" : "days";
  if (unit === "months") return locale === "ru" ? "мес" : "mo";
  return locale === "ru" ? "годы" : "yr";
}

function formatDuration(days: number, locale: AppLocale): string {
  const parts = formatDurationParts(days);
  if (parts.years <= 0 && parts.months <= 1) {
    return `${Math.max(1, Math.round(days))} ${locale === "ru" ? "дн." : "days"}`;
  }

  const values: string[] = [];
  if (parts.years > 0) values.push(`${parts.years} ${locale === "ru" ? "г." : "y"}`);
  if (parts.months > 0) values.push(`${parts.months} ${locale === "ru" ? "мес." : "mo"}`);
  if (values.length === 0 && parts.days > 0) values.push(`${parts.days} ${locale === "ru" ? "дн." : "d"}`);
  return values.join(" ");
}

function formatTargetDate(days: number, locale: AppLocale): string {
  const date = new Date(Date.now() + Math.max(0, Math.round(days)) * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function formatTargetSummary(calculation: ReturnType<typeof findDaysToTarget>, locale: AppLocale): string {
  if (calculation.kind === "reached") return locale === "ru" ? "Уже достигнуто" : "Reached";
  if (calculation.kind === "unreachable") return locale === "ru" ? "Недостижимо" : "Unreachable";
  if (calculation.kind === "beyond-range") return locale === "ru" ? ">100 лет" : ">100 years";
  return formatDuration(calculation.days, locale);
}
