import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import type { Database, Tables } from "@/lib/database.types";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type FeedPostRow = Tables<"feed_posts">;
type FeedStatBlockRow = Tables<"feed_post_stat_blocks">;
type FeedProfile = Pick<Tables<"user_profiles">, "user_id" | "username" | "display_name" | "avatar_url" | "level" | "created_at">;

export async function GET(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const scope = request.nextUrl.searchParams.get("scope") === "blog" ? "blog" : "feed";
    const requestedAuthorId = normalizeUuid(request.nextUrl.searchParams.get("authorUserId"));
    const authorUserId = scope === "blog" ? requestedAuthorId ?? user.id : null;
    const limit = clampLimit(request.nextUrl.searchParams.get("limit"));

    let query = supabase
      .from("feed_posts")
      .select("id,author_user_id,snapshot_id,post_type,status,visibility,body,created_at,updated_at,published_at,deleted_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (scope === "feed") {
      query = query.eq("status", "published").eq("visibility", "public");
    } else if (authorUserId === user.id) {
      query = query.eq("author_user_id", authorUserId);
    } else if (authorUserId) {
      query = query
        .eq("author_user_id", authorUserId)
        .eq("status", "published")
        .eq("visibility", "public");
    }

    const { data: posts, error: postsError } = await query;
    if (postsError) return NextResponse.json({ error: postsError.message }, { status: 500, headers: NO_STORE_HEADERS });

    const postRows = (posts ?? []) as FeedPostRow[];
    const [profiles, statBlocks] = await Promise.all([
      loadProfiles(supabase, Array.from(new Set(postRows.map((post) => post.author_user_id)))),
      loadStatBlocks(supabase, postRows.map((post) => post.id), scope === "blog" && authorUserId === user.id)
    ]);

    const authorProfile = authorUserId ? profiles.find((item) => item.user_id === authorUserId) ?? null : null;

    return NextResponse.json(
      {
        scope,
        author: authorProfile,
        posts: postRows.map((post) => ({
          ...post,
          author: profiles.find((item) => item.user_id === post.author_user_id) ?? null,
          statBlocks: statBlocks.filter((block) => block.post_id === post.id)
        }))
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to load social feed." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

async function loadProfiles(supabase: SupabaseClient<Database>, userIds: string[]): Promise<FeedProfile[]> {
  if (!userIds.length) return [];
  const { data, error } = await supabase
    .from("user_profiles")
    .select("user_id,username,display_name,avatar_url,level,created_at")
    .in("user_id", userIds);

  if (error) throw error;
  return (data ?? []) as FeedProfile[];
}

async function loadStatBlocks(
  supabase: SupabaseClient<Database>,
  postIds: string[],
  includePrivate: boolean
): Promise<FeedStatBlockRow[]> {
  if (!postIds.length) return [];

  let query = supabase
    .from("feed_post_stat_blocks")
    .select("*")
    .in("post_id", postIds)
    .order("sort_order", { ascending: true });

  if (!includePrivate) {
    query = query.eq("visibility", "public");
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as FeedStatBlockRow[];
}

function clampLimit(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 30;
  return Math.max(1, Math.min(60, Math.floor(parsed)));
}

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
}
