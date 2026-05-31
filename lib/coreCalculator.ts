export const DAILY_CORE_RATE = 0.000633;
export const MAX_TARGET_DAYS = 36525;

export type FutureCoreInput = {
  startCore: number;
  dailyAdditions: number;
  reinvestPercent: number;
  days: number;
};

export type DailyIncomeBreakdown = {
  gross: number;
  toCore: number;
  toWallet: number;
};

export type TargetCalculation =
  | { kind: "reached"; days: 0; targetCore: number }
  | { kind: "unreachable"; targetCore: number }
  | { kind: "beyond-range"; targetCore: number; maxDays: number }
  | { kind: "estimated"; days: number; targetCore: number };

export function normalizePercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value * 100) / 100));
}

export function calculateFutureCore(input: FutureCoreInput): number {
  const startCore = Math.max(0, finiteNumber(input.startCore));
  const dailyAdditions = Math.max(0, finiteNumber(input.dailyAdditions));
  const days = Math.max(0, finiteNumber(input.days));
  const rate = DAILY_CORE_RATE * (normalizePercent(input.reinvestPercent) / 100);

  if (rate <= 0) {
    return startCore + dailyAdditions * days;
  }

  const multiplier = Math.pow(1 + rate, days);
  return startCore * multiplier + dailyAdditions * ((multiplier - 1) / rate);
}

export function calculateDailyIncome(coreBalance: number, reinvestPercent: number): DailyIncomeBreakdown {
  const gross = Math.max(0, finiteNumber(coreBalance)) * DAILY_CORE_RATE;
  const toCore = gross * (normalizePercent(reinvestPercent) / 100);
  return {
    gross,
    toCore,
    toWallet: Math.max(0, gross - toCore)
  };
}

export function findDaysToTarget(input: FutureCoreInput & { targetCore: number; maxDays?: number }): TargetCalculation {
  const targetCore = Math.max(0, finiteNumber(input.targetCore));
  const startCore = Math.max(0, finiteNumber(input.startCore));
  const dailyAdditions = Math.max(0, finiteNumber(input.dailyAdditions));
  const reinvestPercent = normalizePercent(input.reinvestPercent);
  const maxDays = Math.max(1, Math.floor(finiteNumber(input.maxDays ?? MAX_TARGET_DAYS)));

  if (targetCore <= startCore) return { kind: "reached", days: 0, targetCore };
  if (dailyAdditions <= 0 && reinvestPercent <= 0) return { kind: "unreachable", targetCore };

  const valueAtMax = calculateFutureCore({ startCore, dailyAdditions, reinvestPercent, days: maxDays });
  if (valueAtMax < targetCore) return { kind: "beyond-range", targetCore, maxDays };

  let left = 0;
  let right = maxDays;

  while (right - left > 1) {
    const mid = Math.floor((left + right) / 2);
    const midValue = calculateFutureCore({ startCore, dailyAdditions, reinvestPercent, days: mid });
    if (midValue >= targetCore) {
      right = mid;
    } else {
      left = mid;
    }
  }

  return { kind: "estimated", days: right, targetCore };
}

export function coreRequiredForDailyIncome(dailyIncome: number): number {
  return Math.max(0, finiteNumber(dailyIncome)) / DAILY_CORE_RATE;
}

export function daysFromTerm(value: number, unit: "days" | "months" | "years"): number {
  const normalized = Math.max(0, finiteNumber(value));
  if (unit === "years") return normalized * 365.25;
  if (unit === "months") return normalized * 30.4375;
  return normalized;
}

export function formatDurationParts(days: number): { years: number; months: number; days: number } {
  const wholeDays = Math.max(0, Math.round(finiteNumber(days)));
  const years = Math.floor(wholeDays / 365.25);
  const daysAfterYears = Math.max(0, wholeDays - Math.floor(years * 365.25));
  const months = Math.floor(daysAfterYears / 30.4375);
  const remainingDays = Math.max(0, Math.round(daysAfterYears - months * 30.4375));
  return { years, months, days: remainingDays };
}

function finiteNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}
