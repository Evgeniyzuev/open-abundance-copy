import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import type { Database, Tables } from "@/lib/database.types";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import {
  canViewVisibility,
  normalizeProfileVisibility,
  normalizeProfileVisibilitySettings
} from "@/lib/socialProfile";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type PublicWish = Tables<"wishes"> & { viewer_has_copy: boolean };

export async function GET(request: NextRequest, { params }: { params: { userId: string } }) {
  try {
    const targetUserId = normalizeUuid(params.userId);
    if (!targetUserId) {
      return NextResponse.json({ error: "Invalid user id." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const [profileResult, settingsResult, relation, linksResult] = await Promise.all([
      supabase
        .from("user_profiles")
        .select("user_id,username,display_name,avatar_url,level,bio,created_at")
        .eq("user_id", targetUserId)
        .maybeSingle(),
      supabase
        .from("user_profile_visibility_settings")
        .select("settings")
        .eq("user_id", targetUserId)
        .maybeSingle(),
      loadRelation(supabase, targetUserId, user.id),
      supabase
        .from("user_profile_links")
        .select("*")
        .eq("user_id", targetUserId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
    ]);

    if (profileResult.error) return NextResponse.json({ error: profileResult.error.message }, { status: 500, headers: NO_STORE_HEADERS });
    if (settingsResult.error) return NextResponse.json({ error: settingsResult.error.message }, { status: 500, headers: NO_STORE_HEADERS });
    if (linksResult.error) return NextResponse.json({ error: linksResult.error.message }, { status: 500, headers: NO_STORE_HEADERS });
    if (!profileResult.data) return NextResponse.json({ error: "Profile not found." }, { status: 404, headers: NO_STORE_HEADERS });

    const visibilitySettings = normalizeProfileVisibilitySettings(settingsResult.data?.settings);
    const canViewWishes = canViewVisibility(visibilitySettings.wishes, relation);
    const profile = {
      ...profileResult.data,
      bio: canViewVisibility(visibilitySettings.bio, relation) ? profileResult.data.bio : null
    };
    const links = (linksResult.data ?? []).filter((link) => canViewVisibility(normalizeProfileVisibility(link.visibility), relation));
    const publicWishes = canViewWishes ? await loadPublicWishes(supabase, targetUserId, user.id) : [];

    return NextResponse.json(
      {
        profile,
        links,
        publicWishes,
        relation,
        visibleBlocks: {
          bio: canViewVisibility(visibilitySettings.bio, relation),
          income: canViewVisibility(visibilitySettings.income, relation),
          expenses: canViewVisibility(visibilitySettings.expenses, relation),
          wishes: canViewWishes,
          achievements: canViewVisibility(visibilitySettings.achievements, relation),
          team: canViewVisibility(visibilitySettings.team, relation),
          posts: canViewVisibility(visibilitySettings.posts, relation)
        }
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to load public profile." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

async function loadRelation(supabase: SupabaseClient<Database>, targetUserId: string, viewerUserId: string) {
  const isSelf = targetUserId === viewerUserId;
  const [contactResult, teamResult] = await Promise.all([
    isSelf
      ? { count: 1, error: null }
      : supabase
          .from("user_contacts")
          .select("owner_user_id", { count: "exact", head: true })
          .eq("owner_user_id", targetUserId)
          .eq("contact_user_id", viewerUserId)
          .eq("status", "active"),
    isSelf
      ? { count: 1, error: null }
      : supabase
          .from("team_memberships")
          .select("member_user_id", { count: "exact", head: true })
          .eq("is_active", true)
          .or(
            `and(member_user_id.eq.${targetUserId},leader_user_id.eq.${viewerUserId}),and(member_user_id.eq.${viewerUserId},leader_user_id.eq.${targetUserId})`
          )
  ]);

  if (contactResult.error) throw contactResult.error;
  if (teamResult.error) throw teamResult.error;

  return {
    isSelf,
    isContact: isSelf || Boolean(contactResult.count),
    isTeam: isSelf || Boolean(teamResult.count),
    isFollower: false
  };
}

async function loadPublicWishes(supabase: SupabaseClient<Database>, targetUserId: string, viewerUserId: string): Promise<PublicWish[]> {
  const { data, error } = await supabase
    .from("wishes")
    .select("*")
    .eq("owner_user_id", targetUserId)
    .eq("visibility", "public")
    .in("status", ["active", "completed"])
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(6);

  if (error) throw error;

  const wishes = (data ?? []) as Tables<"wishes">[];
  if (!wishes.length) return [];
  if (targetUserId === viewerUserId) {
    return wishes.map((wish) => ({ ...wish, viewer_has_copy: true }));
  }

  const sourceWishIds = wishes.map((wish) => wish.id);
  const originalWishIds = Array.from(new Set(wishes.map((wish) => wish.original_wish_id ?? wish.id)));
  const [directCopies, originalCopies] = await Promise.all([
    supabase
      .from("wishes")
      .select("cloned_from_wish_id")
      .eq("owner_user_id", viewerUserId)
      .is("deleted_at", null)
      .in("cloned_from_wish_id", sourceWishIds),
    supabase
      .from("wishes")
      .select("original_wish_id")
      .eq("owner_user_id", viewerUserId)
      .is("deleted_at", null)
      .in("original_wish_id", originalWishIds)
  ]);

  if (directCopies.error) throw directCopies.error;
  if (originalCopies.error) throw originalCopies.error;

  const copiedSourceIds = new Set((directCopies.data ?? []).map((wish) => wish.cloned_from_wish_id).filter(Boolean));
  const copiedOriginalIds = new Set((originalCopies.data ?? []).map((wish) => wish.original_wish_id).filter(Boolean));

  return wishes.map((wish) => {
    const originalWishId = wish.original_wish_id ?? wish.id;
    return {
      ...wish,
      viewer_has_copy: copiedSourceIds.has(wish.id) || copiedOriginalIds.has(originalWishId)
    };
  });
}

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
}
