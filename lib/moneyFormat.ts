import type { AppLocale } from "@/lib/i18n";

const ADAPTIVE_SIGNIFICANT_DIGITS = 3;
const MAX_ADAPTIVE_DECIMALS = 12;

function localeCode(locale: AppLocale): string {
  return locale === "ru" ? "ru-RU" : "en-US";
}

export function formatMoney(value: number, locale: AppLocale): string {
  const safeValue = Number.isFinite(value) ? value : 0;
  return `${new Intl.NumberFormat(localeCode(locale), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(safeValue)} $`;
}

export function formatAdaptiveMoney(value: number, locale: AppLocale): string {
  const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
  if (safeValue === 0) return formatMoney(0, locale);

  if (safeValue >= 1) {
    return `${new Intl.NumberFormat(localeCode(locale), { minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(safeValue)} $`;
  }

  const decimals = Math.min(
    MAX_ADAPTIVE_DECIMALS,
    Math.max(2, firstNonZeroDecimalPosition(safeValue) + ADAPTIVE_SIGNIFICANT_DIGITS - 1)
  );
  return `${new Intl.NumberFormat(localeCode(locale), { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(safeValue)} $`;
}

function firstNonZeroDecimalPosition(value: number): number {
  let scaled = Math.abs(value);
  for (let position = 1; position <= MAX_ADAPTIVE_DECIMALS; position += 1) {
    scaled *= 10;
    if (Math.floor(scaled) > 0) return position;
  }
  return 4;
}
