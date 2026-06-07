import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import type { Database, Tables, TablesInsert } from "@/lib/database.types";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type FeedPostRow = Tables<"feed_posts">;
type FeedStatBlockRow = Tables<"feed_post_stat_blocks">;
type FeedExternalLinkRow = Tables<"feed_post_external_links">;
type FeedProfile = Pick<Tables<"user_profiles">, "user_id" | "username" | "display_name" | "avatar_url" | "level" | "created_at">;
type ExternalProvider = "tiktok" | "instagram" | "telegram" | "youtube" | "x" | "website" | "unknown";
type CreateExternalLinkBody = {
  url?: unknown;
};
type NormalizedExternalLink = {
  provider: ExternalProvider;
  externalUrl: string;
  externalPostId: string | null;
  authorHandle: string | null;
  title: string;
};

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
    const [profiles, statBlocks, externalLinks] = await Promise.all([
      loadProfiles(supabase, Array.from(new Set(postRows.map((post) => post.author_user_id)))),
      loadStatBlocks(supabase, postRows.map((post) => post.id), scope === "blog" && authorUserId === user.id),
      loadExternalLinks(supabase, postRows.map((post) => post.id))
    ]);

    const authorProfile = authorUserId ? profiles.find((item) => item.user_id === authorUserId) ?? null : null;

    return NextResponse.json(
      {
        scope,
        author: authorProfile,
        posts: postRows.map((post) => ({
          ...post,
          author: profiles.find((item) => item.user_id === post.author_user_id) ?? null,
          statBlocks: filterStatBlocksForViewer(post, statBlocks, user.id),
          externalLinks: externalLinks.filter((link) => link.post_id === post.id)
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

export async function POST(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const body = await readCreateExternalLinkBody(request);
    const normalized = normalizeExternalUrl(body.url);
    if (!normalized) {
      return NextResponse.json({ error: "Paste a valid http or https URL." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const existingPost = await findExistingExternalPost(supabase, user.id, normalized);
    if (existingPost) {
      return NextResponse.json({ post: existingPost, created: false }, { headers: NO_STORE_HEADERS });
    }

    const now = new Date().toISOString();
    const { data: post, error: postError } = await supabase
      .from("feed_posts")
      .insert({
        author_user_id: user.id,
        post_type: "external_link",
        status: "published",
        visibility: "public",
        body: buildExternalPostBody(normalized),
        published_at: now
      } satisfies TablesInsert<"feed_posts">)
      .select("*")
      .single();

    if (postError) return NextResponse.json({ error: postError.message }, { status: 500, headers: NO_STORE_HEADERS });

    const { data: externalLink, error: externalLinkError } = await supabase
      .from("feed_post_external_links")
      .insert({
        post_id: post.id,
        provider: normalized.provider,
        external_url: normalized.externalUrl,
        external_post_id: normalized.externalPostId,
        author_handle: normalized.authorHandle,
        title: normalized.title,
        embed_status: "link_only",
        relation: "source"
      } satisfies TablesInsert<"feed_post_external_links">)
      .select("*")
      .single();

    if (externalLinkError) {
      await supabase
        .from("feed_posts")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", post.id);
      return NextResponse.json({ error: externalLinkError.message }, { status: 500, headers: NO_STORE_HEADERS });
    }

    const profiles = await loadProfiles(supabase, [post.author_user_id]);
    return NextResponse.json(
      {
        post: {
          ...post,
          author: profiles.find((item) => item.user_id === post.author_user_id) ?? null,
          statBlocks: [],
          externalLinks: [externalLink]
        },
        created: true
      },
      { status: 201, headers: NO_STORE_HEADERS }
    );
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to create external link post." },
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

async function loadExternalLinks(supabase: SupabaseClient<Database>, postIds: string[]): Promise<FeedExternalLinkRow[]> {
  if (!postIds.length) return [];

  const { data, error } = await supabase
    .from("feed_post_external_links")
    .select("*")
    .in("post_id", postIds)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as FeedExternalLinkRow[];
}

async function findExistingExternalPost(
  supabase: SupabaseClient<Database>,
  userId: string,
  normalized: NormalizedExternalLink
): Promise<(FeedPostRow & { author: FeedProfile | null; statBlocks: FeedStatBlockRow[]; externalLinks: FeedExternalLinkRow[] }) | null> {
  const { data: links, error: linksError } = await supabase
    .from("feed_post_external_links")
    .select("*")
    .eq("provider", normalized.provider)
    .eq("external_url", normalized.externalUrl)
    .eq("relation", "source");

  if (linksError) throw linksError;
  const postIds = (links ?? []).map((link) => link.post_id);
  if (!postIds.length) return null;

  const { data: posts, error: postsError } = await supabase
    .from("feed_posts")
    .select("*")
    .in("id", postIds)
    .eq("author_user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1);

  if (postsError) throw postsError;
  const post = (posts ?? [])[0] as FeedPostRow | undefined;
  if (!post) return null;

  const profiles = await loadProfiles(supabase, [post.author_user_id]);
  return {
    ...post,
    author: profiles.find((item) => item.user_id === post.author_user_id) ?? null,
    statBlocks: [],
    externalLinks: (links ?? []).filter((link) => link.post_id === post.id) as FeedExternalLinkRow[]
  };
}

async function readCreateExternalLinkBody(request: NextRequest): Promise<CreateExternalLinkBody> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

function normalizeExternalUrl(value: unknown): NormalizedExternalLink | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  parsed.protocol = "https:";
  parsed.hash = "";
  removeTrackingParams(parsed);

  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const pathParts = parsed.pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
  const provider = detectProvider(host);
  const metadata = extractExternalMetadata(provider, parsed, pathParts);

  return {
    provider,
    externalUrl: parsed.toString(),
    externalPostId: metadata.externalPostId,
    authorHandle: metadata.authorHandle,
    title: metadata.title
  };
}

function detectProvider(host: string): ExternalProvider {
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "tiktok";
  if (host === "instagram.com" || host.endsWith(".instagram.com")) return "instagram";
  if (host === "t.me" || host === "telegram.me") return "telegram";
  if (host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com")) return "youtube";
  if (host === "x.com" || host === "twitter.com" || host.endsWith(".twitter.com")) return "x";
  return "website";
}

function extractExternalMetadata(
  provider: ExternalProvider,
  url: URL,
  pathParts: string[]
): { externalPostId: string | null; authorHandle: string | null; title: string } {
  if (provider === "tiktok") {
    const author = pathParts.find((part) => part.startsWith("@")) ?? null;
    const videoIndex = pathParts.findIndex((part) => part === "video" || part === "photo");
    return {
      externalPostId: videoIndex >= 0 ? pathParts[videoIndex + 1] ?? null : null,
      authorHandle: author,
      title: "TikTok post"
    };
  }

  if (provider === "instagram") {
    const typeIndex = pathParts.findIndex((part) => ["p", "reel", "tv"].includes(part));
    const storyIndex = pathParts.findIndex((part) => part === "stories");
    return {
      externalPostId: typeIndex >= 0 ? pathParts[typeIndex + 1] ?? null : storyIndex >= 0 ? pathParts[storyIndex + 2] ?? null : null,
      authorHandle: storyIndex >= 0 ? pathParts[storyIndex + 1] ?? null : null,
      title: "Instagram post"
    };
  }

  if (provider === "telegram") {
    return {
      externalPostId: pathParts.length >= 2 ? `${pathParts[0]}/${pathParts[1]}` : pathParts[0] ?? null,
      authorHandle: pathParts[0] ? `@${pathParts[0]}` : null,
      title: "Telegram post"
    };
  }

  if (provider === "youtube") {
    const videoId = url.hostname.toLowerCase().replace(/^www\./, "") === "youtu.be"
      ? pathParts[0] ?? null
      : url.searchParams.get("v") ?? (pathParts[0] === "shorts" || pathParts[0] === "embed" ? pathParts[1] ?? null : null);
    return {
      externalPostId: videoId,
      authorHandle: pathParts[0]?.startsWith("@") ? pathParts[0] : null,
      title: "YouTube video"
    };
  }

  if (provider === "x") {
    const statusIndex = pathParts.findIndex((part) => part === "status");
    return {
      externalPostId: statusIndex >= 0 ? pathParts[statusIndex + 1] ?? null : null,
      authorHandle: pathParts[0] ? `@${pathParts[0]}` : null,
      title: "X post"
    };
  }

  return {
    externalPostId: null,
    authorHandle: null,
    title: url.hostname.replace(/^www\./, "")
  };
}

function removeTrackingParams(url: URL) {
  Array.from(url.searchParams.keys()).forEach((key) => {
    const normalizedKey = key.toLowerCase();
    if (normalizedKey.startsWith("utm_") || ["fbclid", "gclid", "igshid", "si"].includes(normalizedKey)) {
      url.searchParams.delete(key);
    }
  });
}

function buildExternalPostBody(link: NormalizedExternalLink): string {
  const handle = link.authorHandle ? ` ${link.authorHandle}` : "";
  return `${link.title}${handle}`;
}

function filterStatBlocksForViewer(post: FeedPostRow, statBlocks: FeedStatBlockRow[], viewerUserId: string): FeedStatBlockRow[] {
  const postBlocks = statBlocks.filter((block) => block.post_id === post.id);
  if (post.status !== "published" && post.author_user_id === viewerUserId) return postBlocks;
  return postBlocks.filter((block) => block.visibility === "public");
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
