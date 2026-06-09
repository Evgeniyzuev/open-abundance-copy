"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Calculator, Check, ChevronDown, ChevronUp, RotateCcw, TrendingUp } from "lucide-react";
import { type CoreAccount, useUserContext } from "@/components/UserProvider";
import { calculateDailyIncome, calculateFutureCore, coreRequiredForDailyIncome, daysFromTerm, findDaysToTarget, formatDurationParts, normalizePercent } from "@/lib/coreCalculator";
import type { AppLocale, MessageKey } from "@/lib/i18n";
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
type ChallengeProgressResponse = {
  error?: string;
};
type CalculatorMode = "future" | "target";
type TargetKind = "core" | "daily";
type TermUnit = "days" | "months" | "years";
type TFunction = (key: MessageKey, values?: Record<string, string | number>) => string;

export default function WalletApp({ active, activeTab, refreshNonce, onRefresh }: { active: boolean; activeTab: WalletTab; refreshNonce: number; onRefresh: () => Promise<void> }) {
  const { core, wallet, user, loading, error, locale, applyServerData, t } = useUserContext();
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
  const [targetCore, setTargetCore] = useState("1000000");
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
  }, [user?.id]);

  useEffect(() => {
    let mounted = true;

    async function loadHistory() {
      if (!active || activeTab !== "core" || !historyOpen || !user) return;

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
  }, [active, activeTab, historyOpen, refreshNonce, user]);

  useEffect(() => {
    let mounted = true;

    async function loadHistory() {
      if (!active || activeTab !== "wallet" || !walletHistoryOpen || !user) return;

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
  }, [active, activeTab, refreshNonce, user, walletHistoryOpen]);

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
  }

  function toggleWalletHistory() {
    const nextOpen = !walletHistoryOpen;
    setWalletHistoryOpen(nextOpen);
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
      const response = await fetch("/api/challenges/progress", {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ verificationLogic: "calculate_time_to_goal" })
      });
      const payload = (await response.json().catch(() => ({}))) as ChallengeProgressResponse;
      if (!response.ok || payload.error) {
        throw new Error(payload.error ?? "Failed to record calculator challenge progress.");
      }
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
  const summaryGoalLabel = calculatorMode === "target" ? formatTargetSummary(targetCalculation, t) : formatMoney(futureCore, locale);
  const summaryDailyLabel = calculatorMode === "target" ? formatMoney(requestedTargetCore, locale) : `${formatMoney(futureDailyIncome.gross, locale)}/${t("app.common.day")}`;

  return (
    <section className="finance-screen">
      {!user && !loading ? (
        <FinanceState title={t("wallet.registration.title")} description={t("wallet.registration.description")} />
      ) : null}

      {user && activeTab === "wallet" ? (
        <>
          <BalancePanel
            title={t("wallet.wallet")}
            label={t("wallet.availableBalance")}
            amount={wallet?.balance ?? 0}
            locale={locale}
            meta={wallet ? t("app.common.updated", { date: formatDate(wallet.updated_at, locale) }) : t("app.common.created")}
            adaptiveAmount
          />
          <HistoryPanel
            title={t("wallet.history.wallet")}
            open={walletHistoryOpen}
            loading={walletHistoryLoading}
            error={walletHistoryError}
            emptyText={t("wallet.history.empty")}
            loadingText={t("app.common.loading")}
            rowCount={walletHistoryRows?.length ?? 0}
            onToggle={toggleWalletHistory}
          >
            <div className="payout-list">
              {(walletHistoryRows ?? []).map((row) => (
                <article className="payout-row" key={row.id}>
                  <div>
                    <strong>{formatDay(row.operation_date, locale)}</strong>
                    <span>{t("wallet.history.dailyCorePayout")}</span>
                  </div>
                  <div>
                    <strong>+{formatAdaptiveMoney(row.amount, locale)}</strong>
                    <span>{t("wallet.wallet")}</span>
                  </div>
                  <p>{`${t("wallet.dailyRate")} ${formatPercent(row.daily_rate * 100, locale)} · ${t("wallet.reinvest")} ${formatPercentCompact(row.reinvest_percent, locale)}`}</p>
                </article>
              ))}
            </div>
          </HistoryPanel>
        </>
      ) : null}

      {user && activeTab === "core" ? (
        <>
          {/* <BalancePanel
            title={t("wallet.core")}
            label={t("wallet.core")}
            amount={core?.balance ?? 0}
            locale={locale}
            meta={core ? t("wallet.coreMeta", { level: core.level, percent: core.reinvest_percent, date: formatDate(core.updated_at, locale) }) : t("app.common.created")}
            adaptiveAmount
          /> */}
          {core ? <CoreLevelProgress core={core} locale={locale} t={t} /> : null}
          <ReinvestPanel
            value={reinvestValue}
            savedPercent={savedReinvestPercent}
            dailyIncome={currentDailyIncome}
            valid={reinvestDraftValid}
            changed={reinvestChanged}
            saving={reinvestSaving}
            error={reinvestError}
            locale={locale}
            t={t}
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
            t={t}
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
            title={t("wallet.history.core")}
            open={historyOpen}
            loading={historyLoading}
            error={historyError}
            emptyText={t("wallet.history.coreEmpty")}
            loadingText={t("app.common.loading")}
            rowCount={historyRows?.length ?? 0}
            onToggle={toggleCoreHistory}
          >
            <div className="payout-list">
              {(historyRows ?? []).map((row) => (
                <article className="payout-row" key={`${row.accrual_date}-${row.created_at}`}>
                  <div>
                    <strong>{formatDay(row.accrual_date, locale)}</strong>
                    <span>{t("wallet.dailyRate")} {formatPercent(row.daily_rate * 100, locale)}</span>
                  </div>
                  <div>
                    <strong>+{formatAdaptiveMoney(row.core_amount, locale)}</strong>
                    <span>{t("wallet.toCore")}</span>
                  </div>
                  <p>{`${formatAdaptiveMoney(row.core_before, locale)} -> ${formatAdaptiveMoney(row.core_after, locale)} · ${t("wallet.wallet")} +${formatAdaptiveMoney(row.wallet_amount, locale)}`}</p>
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
  const hasRows = rowCount > 0;

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
          {!error && hasRows ? children : null}
          {!loading && !error && !hasRows ? <p>{emptyText}</p> : null}
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
  t,
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
  t: TFunction;
  onChange: (value: string) => void;
  onReset: () => void;
  onSave: () => void;
}) {
  const percent = valid ? normalizePercent(parseNumber(value)) : savedPercent;

  return (
    <section className="core-tool-panel reinvest-panel">
      <div className="core-tool-heading">
        <div>
          <span>{t("wallet.reinvest")}</span>
          <strong>{formatPercentCompact(percent, locale)} {t("wallet.toCore")}</strong>
        </div>
        <div className="reinvest-actions">
          {changed ? (
            <button className="finance-small-icon-button" type="button" aria-label={t("app.common.reset")} disabled={saving} onClick={onReset}>
              <RotateCcw size={16} />
            </button>
          ) : null}
          <button className="finance-small-icon-button primary" type="button" aria-label={t("app.common.save")} disabled={!changed || !valid || saving} onClick={onSave}>
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
          aria-label={t("wallet.reinvest.percent")}
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
          aria-label={t("wallet.reinvest.slider")}
        />
      </div>

      <div className="reinvest-split">
        <span>
          <TrendingUp size={15} />
          {t("wallet.core")} +{formatAdaptiveMoney(dailyIncome.toCore, locale)}
        </span>
        <span>{t("wallet.wallet")} +{formatAdaptiveMoney(dailyIncome.toWallet, locale)}</span>
      </div>

      {!valid ? <p className="finance-error inline">{t("wallet.reinvest.invalidPercent")}</p> : null}
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
  t,
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
  t: TFunction;
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
          {t("wallet.calculator.title")}
        </span>
        <span className="calculator-metrics">
          <span>
            <small>{mode === "target" ? t("wallet.calculator.goal") : t("wallet.calculator.futureCore")}</small>
            <strong>{summaryGoalLabel}</strong>
          </span>
          <span>
            <small>{mode === "target" ? t("wallet.calculator.requiredCore") : t("wallet.calculator.daily")}</small>
            <strong>{summaryDailyLabel}</strong>
          </span>
        </span>
        {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>

      {open ? (
        <div className="calculator-body">
          <div className="finance-segmented compact">
            <button className={mode === "future" ? "active" : ""} type="button" onClick={() => onModeChange("future")}>
              {t("wallet.calculator.futureAmount")}
            </button>
            <button className={mode === "target" ? "active" : ""} type="button" onClick={() => onModeChange("target")}>
              {t("wallet.calculator.timeToGoal")}
            </button>
          </div>

          <div className="calculator-grid">
            <div className="calculator-fields">
              <label className="finance-field">
                <span>{t("wallet.calculator.startCore")}</span>
                <input type="number" min="0" inputMode="decimal" value={startCore} onChange={(event) => onStartCoreChange(event.target.value)} />
              </label>

              <label className="finance-check-row">
                <input type="checkbox" checked={useCurrentCore} onChange={(event) => onUseCurrentCoreChange(event.target.checked)} />
                <span>{t("wallet.calculator.useCurrentCore")}</span>
              </label>

              <label className="finance-field">
                <span>{t("wallet.calculator.dailyAdditions")}</span>
                <input type="number" min="0" inputMode="decimal" value={dailyAdditions} onChange={(event) => onDailyAdditionsChange(event.target.value)} />
              </label>

              <label className="finance-field">
                <span>{t("wallet.calculator.scenarioReinvest")}</span>
                <input type="number" min="0" max="100" step="0.01" inputMode="decimal" value={simulationReinvest} onChange={(event) => onSimulationReinvestChange(event.target.value)} />
              </label>

              {mode === "future" ? (
                <div className="term-row">
                  <label className="finance-field">
                    <span>{t("wallet.calculator.term")}</span>
                    <input type="number" min="0" inputMode="decimal" value={termValue} onChange={(event) => onTermValueChange(event.target.value)} />
                  </label>
                  <div className="finance-segmented small">
                    {(["days", "months", "years"] as TermUnit[]).map((unit) => (
                      <button className={termUnit === unit ? "active" : ""} type="button" key={unit} onClick={() => onTermUnitChange(unit)}>
                        {unitLabel(unit, t)}
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
                      {t("wallet.calculator.dailyIncomeShort")}
                    </button>
                  </div>
                  {targetKind === "core" ? (
                    <label className="finance-field">
                      <span>{t("wallet.calculator.goalCore")}</span>
                      <input type="number" min="0" inputMode="decimal" value={targetCore} onChange={(event) => onTargetCoreChange(event.target.value)} />
                    </label>
                  ) : (
                    <label className="finance-field">
                      <span>{t("wallet.calculator.goalDailyIncome")}</span>
                      <input type="number" min="0" inputMode="decimal" value={targetDailyIncome} onChange={(event) => onTargetDailyIncomeChange(event.target.value)} />
                    </label>
                  )}
                  <button className="challenge-primary-action calculator-action" type="button" onClick={onCalculateTarget}>
                    {t("wallet.calculator.calculateTime")}
                  </button>
                </>
              )}
            </div>

            <div className="calculator-results">
              {mode === "future" ? (
                <>
                  <MetricRow label={t("wallet.calculator.futureCore")} value={formatMoney(futureCore, locale)} strong />
                  <MetricRow label={t("wallet.calculator.dailyIncome")} value={`${formatMoney(futureDailyIncome.gross, locale)}/${t("app.common.day")}`} />
                  <MetricRow label={t("wallet.calculator.addedManually")} value={formatMoney(manualAdded, locale)} />
                  <MetricRow label={t("wallet.calculator.reinvestGrowth")} value={formatMoney(reinvestGrowth, locale)} />
                </>
              ) : (
                <>
                  <MetricRow label={t("wallet.calculator.requiredCore")} value={formatMoney(requestedTargetCore, locale)} strong />
                  {targetReady ? <TargetResult calculation={targetCalculation} locale={locale} t={t} /> : (
                    <p className="calculator-hint">{t("wallet.calculator.targetHint")}</p>
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

function TargetResult({ calculation, locale, t }: { calculation: ReturnType<typeof findDaysToTarget>; locale: AppLocale; t: TFunction }) {
  if (calculation.kind === "reached") {
    return <MetricRow label={t("wallet.calculator.time")} value={t("wallet.calculator.alreadyReached")} strong />;
  }

  if (calculation.kind === "unreachable") {
    return <p className="calculator-hint">{t("wallet.calculator.unreachableHint")}</p>;
  }

  if (calculation.kind === "beyond-range") {
    return <p className="calculator-hint">{t("wallet.calculator.beyondRangeHint")}</p>;
  }

  return (
    <>
      <MetricRow label={t("wallet.calculator.time")} value={formatDuration(calculation.days, t)} strong />
      <MetricRow label={t("wallet.calculator.targetDate")} value={formatTargetDate(calculation.days, locale)} />
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

function CoreLevelProgress({
  core,
  locale,
  t
}: {
  core: CoreAccount;
  locale: AppLocale;
  t: TFunction;
}) {
  const threshold = Number.isFinite(core.next_level_threshold ?? NaN) && (core.next_level_threshold ?? 0) > 0 ? core.next_level_threshold ?? null : null;
  const progress = threshold ? clamp((core.balance / threshold) * 100, 0, 100) : 100;
  const displayProgress = Math.round(progress);
  const nextLevel = threshold ? core.level + 1 : core.level;

  return (
    <section className="core-level-panel" aria-label={t("wallet.coreProgress.aria")}>
      <div className="core-level-head">
        <span>{t("app.common.level")} {core.level}</span>
        <strong>{threshold ? `${formatAdaptiveMoney(core.balance, locale)} / ${formatAdaptiveMoney(threshold, locale)}` : t("wallet.coreProgress.max")}</strong>
      </div>
      <div
        className="core-level-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={threshold ?? Math.max(1, core.balance)}
        aria-valuenow={threshold ? Math.min(core.balance, threshold) : Math.max(1, core.balance)}
      >
        <div className="core-level-fill" style={{ width: `${displayProgress}%` }} />
      </div>
      <div className="core-level-meta">
        <span>{displayProgress}%</span>
        <span>{threshold ? `${t("app.common.level")} ${nextLevel}` : t("wallet.coreProgress.max")}</span>
      </div>
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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

function unitLabel(unit: TermUnit, t: TFunction): string {
  if (unit === "days") return t("app.common.days");
  if (unit === "months") return t("app.common.months.short");
  return t("app.common.years");
}

function formatDuration(days: number, t: TFunction): string {
  const parts = formatDurationParts(days);
  if (parts.years <= 0 && parts.months <= 1) {
    return `${Math.max(1, Math.round(days))} ${t("app.common.days.short")}`;
  }

  const values: string[] = [];
  if (parts.years > 0) values.push(`${parts.years} ${t("app.common.years.short")}`);
  if (parts.months > 0) values.push(`${parts.months} ${t("app.common.months.short")}`);
  if (values.length === 0 && parts.days > 0) values.push(`${parts.days} ${t("app.common.days.short")}`);
  return values.join(" ");
}

function formatTargetDate(days: number, locale: AppLocale): string {
  const date = new Date(Date.now() + Math.max(0, Math.round(days)) * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function formatTargetSummary(calculation: ReturnType<typeof findDaysToTarget>, t: TFunction): string {
  if (calculation.kind === "reached") return t("wallet.calculator.reached");
  if (calculation.kind === "unreachable") return t("wallet.calculator.unreachable");
  if (calculation.kind === "beyond-range") return t("wallet.calculator.beyondRange");
  return formatDuration(calculation.days, t);
}
