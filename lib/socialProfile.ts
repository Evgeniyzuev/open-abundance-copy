import type { Json } from "@/lib/database.types";

export const PROFILE_VISIBILITY_LEVELS = ["public", "followers", "team", "contacts", "private"] as const;
export type ProfileVisibility = (typeof PROFILE_VISIBILITY_LEVELS)[number];

export const PROFILE_VISIBILITY_KEYS = ["bio", "income", "expenses", "wishes", "achievements", "team", "posts"] as const;
export type ProfileVisibilityKey = (typeof PROFILE_VISIBILITY_KEYS)[number];
export type ProfileVisibilitySettings = Record<ProfileVisibilityKey, ProfileVisibility>;

export const DEFAULT_PROFILE_VISIBILITY_SETTINGS: ProfileVisibilitySettings = {
  bio: "public",
  income: "private",
  expenses: "private",
  wishes: "public",
  achievements: "public",
  team: "team",
  posts: "public"
};

export type ProfileLinkDraft = {
  label?: string | null;
  linkType?: string | null;
  url: string;
  visibility?: ProfileVisibility | null;
};

export function normalizeProfileVisibility(value: unknown, fallback: ProfileVisibility = "public"): ProfileVisibility {
  return typeof value === "string" && PROFILE_VISIBILITY_LEVELS.includes(value as ProfileVisibility)
    ? (value as ProfileVisibility)
    : fallback;
}

export function normalizeProfileVisibilitySettings(value: unknown): ProfileVisibilitySettings {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return PROFILE_VISIBILITY_KEYS.reduce((settings, key) => {
    settings[key] = normalizeProfileVisibility(record[key], DEFAULT_PROFILE_VISIBILITY_SETTINGS[key]);
    return settings;
  }, { ...DEFAULT_PROFILE_VISIBILITY_SETTINGS });
}

export function profileVisibilitySettingsToJson(settings: ProfileVisibilitySettings): Json {
  return PROFILE_VISIBILITY_KEYS.reduce<Record<string, string>>((json, key) => {
    json[key] = settings[key];
    return json;
  }, {});
}

export function canViewVisibility(
  visibility: ProfileVisibility,
  relation: { isSelf: boolean; isContact: boolean; isTeam: boolean; isFollower?: boolean }
): boolean {
  if (relation.isSelf) return true;
  if (visibility === "public") return true;
  if (visibility === "contacts") return relation.isContact;
  if (visibility === "team") return relation.isTeam;
  if (visibility === "followers") return Boolean(relation.isFollower);
  return false;
}
