import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import type { Tables } from "@/lib/database.types";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { normalizeProfileVisibility } from "@/lib/socialProfile";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type PostPatchBody = {
  action?: unknown;
  body?: unknown;
  visibility?: unknown;
  statBlocks?: unknown;
};

type FeedPostRow = Tables<"feed_posts">;

export async function PATCH(request: NextRequest, { params }: { params: { postId: string } }) {
  try {
    const postId = normalizeUuid(params.postId);
    if (!postId) {
      return NextResponse.json({ error: "Invalid post id." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const { data: currentPost, error: currentPostError } = await supabase
      .from("feed_posts")
      .select("*")
      .eq("id", postId)
      .is("deleted_at", null)
      .maybeSingle();

    if (currentPostError) return NextResponse.json({ error: currentPostError.message }, { status: 500, headers: NO_STORE_HEADERS });
    if (!currentPost) return NextResponse.json({ error: "Post not found." }, { status: 404, headers: NO_STORE_HEADERS });
    if (currentPost.author_user_id !== user.id) {
      return NextResponse.json({ error: "Only the author can update this post." }, { status: 403, headers: NO_STORE_HEADERS });
    }

    const body = await readJsonBody(request);
    const action = normalizeAction(body.action);
    const nextStatus = getNextStatus(currentPost.status, action);
    const nextBody = normalizeBody(body.body, currentPost.body);
    const nextVisibility = normalizeProfileVisibility(body.visibility, normalizeProfileVisibility(currentPost.visibility));
    const now = new Date().toISOString();

    const { data: updatedPost, error: updatePostError } = await supabase
      .from("feed_posts")
      .update({
        body: nextBody,
        visibility: nextVisibility,
        status: nextStatus,
        published_at: nextStatus === "published" ? currentPost.published_at ?? now : currentPost.published_at
      })
      .eq("id", postId)
      .select("*")
      .single();

    if (updatePostError) return NextResponse.json({ error: updatePostError.message }, { status: 500, headers: NO_STORE_HEADERS });

    const statBlockUpdates = normalizeStatBlockUpdates(body.statBlocks);
    const statBlockResults = await Promise.all(statBlockUpdates.map((item) => (
      supabase
        .from("feed_post_stat_blocks")
        .update({ visibility: item.visibility })
        .eq("post_id", postId)
        .eq("block_key", item.blockKey)
    )));
    const statBlockError = statBlockResults.find((result) => result.error)?.error;
    if (statBlockError) return NextResponse.json({ error: statBlockError.message }, { status: 500, headers: NO_STORE_HEADERS });

    const { data: statBlocks, error: statBlocksError } = await supabase
      .from("feed_post_stat_blocks")
      .select("*")
      .eq("post_id", postId)
      .order("sort_order", { ascending: true });

    if (statBlocksError) return NextResponse.json({ error: statBlocksError.message }, { status: 500, headers: NO_STORE_HEADERS });

    return NextResponse.json({ post: { ...updatedPost, statBlocks: statBlocks ?? [] } }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to update feed post." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

async function readJsonBody(request: NextRequest): Promise<PostPatchBody> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

function normalizeAction(value: unknown): "publish" | "archive" | "draft" | null {
  if (value === "publish" || value === "archive" || value === "draft") return value;
  return null;
}

function getNextStatus(currentStatus: FeedPostRow["status"], action: "publish" | "archive" | "draft" | null): FeedPostRow["status"] {
  if (action === "publish") return "published";
  if (action === "archive") return "archived";
  if (action === "draft") return "draft";
  return currentStatus;
}

function normalizeBody(value: unknown, fallback: string | null): string | null {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 700) : null;
}

function normalizeStatBlockUpdates(value: unknown): Array<{ blockKey: string; visibility: "public" | "private" }> {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      if (typeof record.blockKey !== "string") return null;
      return {
        blockKey: record.blockKey,
        visibility: record.visibility === "public" ? "public" : "private"
      };
    })
    .filter((item): item is { blockKey: string; visibility: "public" | "private" } => Boolean(item));
}

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
}
