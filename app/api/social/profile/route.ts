import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import type { Database, Json, TablesInsert } from "@/lib/database.types";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import {
  normalizeProfileVisibility,
  normalizeProfileVisibilitySettings,
  profileVisibilitySettingsToJson,
  type ProfileLinkDraft
} from "@/lib/socialProfile";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type ProfileBody = {
  bio?: unknown;
  visibilitySettings?: unknown;
  links?: unknown;
};

export async function GET(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const [profileResult, settingsResult, linksResult, contacts] = await Promise.all([
      supabase.from("user_profiles").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("user_profile_visibility_settings").select("*").eq("user_id", user.id).maybeSingle(),
      supabase
        .from("user_profile_links")
        .select("*")
        .eq("user_id", user.id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      loadContacts(supabase, user.id)
    ]);

    if (profileResult.error) return NextResponse.json({ error: profileResult.error.message }, { status: 500, headers: NO_STORE_HEADERS });
    if (settingsResult.error) return NextResponse.json({ error: settingsResult.error.message }, { status: 500, headers: NO_STORE_HEADERS });
    if (linksResult.error) return NextResponse.json({ error: linksResult.error.message }, { status: 500, headers: NO_STORE_HEADERS });

    return NextResponse.json(
      {
        profile: profileResult.data,
        visibilitySettings: normalizeProfileVisibilitySettings(settingsResult.data?.settings),
        links: linksResult.data ?? [],
        contacts
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to load social profile." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const body = await readJsonBody(request);
    const bio = normalizeBio(body.bio);
    const visibilitySettings = normalizeProfileVisibilitySettings(body.visibilitySettings);
    const links = normalizeLinks(body.links, user.id);
    const now = new Date().toISOString();

    const [profileResult, settingsResult] = await Promise.all([
      supabase
        .from("user_profiles")
        .update({ bio, updated_at: now })
        .eq("user_id", user.id)
        .select("*")
        .single(),
      supabase
        .from("user_profile_visibility_settings")
        .upsert(
          {
            user_id: user.id,
            settings: profileVisibilitySettingsToJson(visibilitySettings),
            updated_at: now
          },
          { onConflict: "user_id" }
        )
        .select("*")
        .single()
    ]);

    if (profileResult.error) return NextResponse.json({ error: profileResult.error.message }, { status: 500, headers: NO_STORE_HEADERS });
    if (settingsResult.error) return NextResponse.json({ error: settingsResult.error.message }, { status: 500, headers: NO_STORE_HEADERS });

    const { error: deleteLinksError } = await supabase.from("user_profile_links").delete().eq("user_id", user.id);
    if (deleteLinksError) return NextResponse.json({ error: deleteLinksError.message }, { status: 500, headers: NO_STORE_HEADERS });

    const insertedLinks = links.length ? await insertLinks(supabase, links) : [];

    return NextResponse.json(
      {
        profile: profileResult.data,
        visibilitySettings: normalizeProfileVisibilitySettings(settingsResult.data.settings),
        links: insertedLinks
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to save social profile." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

async function insertLinks(supabase: SupabaseClient<Database>, links: Array<TablesInsert<"user_profile_links">>) {
  const { data, error } = await supabase
    .from("user_profile_links")
    .insert(links)
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

async function loadContacts(supabase: SupabaseClient<Database>, userId: string) {
  const { data: contactRows, error: contactsError } = await supabase
    .from("user_contacts")
    .select("*")
    .eq("owner_user_id", userId)
    .eq("status", "active")
    .order("updated_at", { ascending: false });

  if (contactsError) throw contactsError;

  const contactIds = Array.from(new Set((contactRows ?? []).map((item) => item.contact_user_id)));
  const { data: profiles, error: profilesError } = contactIds.length
    ? await supabase
        .from("user_profiles")
        .select("user_id,username,display_name,avatar_url,level,created_at")
        .in("user_id", contactIds)
    : { data: [], error: null };

  if (profilesError) throw profilesError;

  return (contactRows ?? []).map((contact) => ({
    ...contact,
    profile: profiles.find((profile) => profile.user_id === contact.contact_user_id) ?? null
  }));
}

async function readJsonBody(request: NextRequest): Promise<ProfileBody> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

function normalizeBio(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 700) : null;
}

function normalizeLinks(value: unknown, userId: string): Array<TablesInsert<"user_profile_links">> {
  if (!Array.isArray(value)) return [];

  return value
    .map((item, index) => normalizeLink(item, userId, index))
    .filter((item): item is TablesInsert<"user_profile_links"> => Boolean(item))
    .slice(0, 5);
}

function normalizeLink(value: unknown, userId: string, sortOrder: number): TablesInsert<"user_profile_links"> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const draft = value as ProfileLinkDraft;
  const url = normalizeUrl(draft.url);
  if (!url) return null;

  return {
    user_id: userId,
    link_type: normalizePlainText(draft.linkType, 30) ?? "website",
    label: normalizePlainText(draft.label, 40),
    url,
    visibility: normalizeProfileVisibility(draft.visibility, "public"),
    sort_order: sortOrder
  };
}

function normalizeUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed.startsWith("http://") || trimmed.startsWith("https://") ? trimmed : `https://${trimmed}`);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString().slice(0, 500);
  } catch {
    return null;
  }
}

function normalizePlainText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}
