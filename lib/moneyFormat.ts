import type { AppLocale } from "@/lib/i18n";

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

  const decimals = safeValue >= 1 ? 2 : Math.min(6, Math.max(2, firstNonZeroDecimalPosition(safeValue) + 2));
  return `${new Intl.NumberFormat(localeCode(locale), { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(safeValue)} $`;
}

function firstNonZeroDecimalPosition(value: number): number {
  let scaled = Math.abs(value);
  for (let position = 1; position <= 6; position += 1) {
    scaled *= 10;
    if (Math.floor(scaled) > 0) return position;
  }
  return 4;
}
