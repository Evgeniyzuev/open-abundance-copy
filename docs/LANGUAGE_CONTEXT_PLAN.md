# Lightweight Language Context Plan

## Summary

Open Abundance uses a small in-app language context instead of a full i18n framework. The first supported locales are `ru` and `en`.

The app resolves language like this:

1. If the signed-in user has `user_profiles.default_locale = 'ru'`, show Russian.
2. Any other stored value resolves to English.
3. Guests use the browser language: `ru*` becomes Russian, everything else becomes English.
4. New registration sends the detected browser locale to `/api/auth/claim`; the server validates it to `ru | en`.

## Implementation

- `lib/i18n.ts` owns `AppLocale`, `SUPPORTED_LOCALES`, `normalizeLocale`, `detectBrowserLocale`, and the message dictionary.
- `UserProvider` is the app language source:
  - exposes `locale`, `t(key, values)`, and `setLocale(nextLocale)`;
  - updates `<html lang>` on the client;
  - optimistically updates `profile.default_locale`;
  - persists profile language with Supabase RLS.
- The Profile screen shows a language toggle button and saves the preference to `user_profiles.default_locale`.
- Challenge JSON fields still support `{ en, ru }`, but the UI chooses by current app locale and falls back to English.
- `app/layout.tsx` keeps static `lang="en"` until the client provider applies the current locale.

## Encoding Policy

- React, API, and app logic should not contain scattered Russian UI strings.
- Add new visible UI text to `lib/i18n.ts` with ASCII message keys.
- If command-line encoding corrupts Cyrillic again, keep Russian text isolated in the dictionary and convert those values to Unicode escapes.
- Server/API fallback errors should be English unless they are explicitly localized through the client.

## Database

- `user_profiles.default_locale` default is `en`.
- Valid values are restricted to `ru` and `en`.
- Existing invalid or missing locale values are normalized to `en`.

## Test Plan

- Browser `ru-RU` guest sees Russian UI.
- Browser `en-US` or any non-Russian guest sees English UI.
- New Russian-browser registration stores `default_locale = 'ru'`.
- New non-Russian registration stores `default_locale = 'en'`.
- Existing users load from `user_profiles.default_locale`.
- Profile language toggle updates the UI immediately, persists to Supabase, and survives reload.
- Challenges use selected locale for JSON text and fall back to English.
- Run `pnpm lint` and `pnpm exec tsc --noEmit`.
