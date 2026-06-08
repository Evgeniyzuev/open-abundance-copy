import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables, TablesInsert } from "@/lib/database.types";

type FeedPostRow = Tables<"feed_posts">;
type WishRow = Tables<"wishes">;

const DAILY_WISH_POST_LIMIT = 3;

export type WishFeedPublishResult = {
  notice?: string;
  post: FeedPostRow | null;
};

export async function publishWishToFeed(
  supabase: SupabaseClient<Database>,
  userId: string,
  wish: WishRow
): Promise<WishFeedPublishResult> {
  if (!canPublishWish(wish, userId)) {
    return { post: null, notice: "Only your public active wishes can be published." };
  }

  const existingPost = await findExistingWishPost(supabase, userId, wish.id);
  if (existingPost) return { post: existingPost };

  const count = await countTodayWishPosts(supabase, userId);
  if (count >= DAILY_WISH_POST_LIMIT) {
    return { post: null, notice: "Wish saved. Daily wish post limit reached." };
  }

  const now = new Date().toISOString();
  const { data: post, error: postError } = await supabase
    .from("feed_posts")
    .insert({
      author_user_id: userId,
      post_type: "wish",
      status: "published",
      visibility: "public",
      body: wish.title,
      published_at: now
    } satisfies TablesInsert<"feed_posts">)
    .select("*")
    .single();

  if (postError) throw postError;

  const { error: entityError } = await supabase
    .from("feed_post_entities")
    .insert({
      post_id: post.id,
      entity_type: "wish",
      entity_id: wish.id,
      relation: "primary"
    } satisfies TablesInsert<"feed_post_entities">);

  if (!entityError) return { post };

  await supabase
    .from("feed_posts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", post.id);

  const racedPost = await findExistingWishPost(supabase, userId, wish.id);
  if (racedPost) return { post: racedPost };
  throw entityError;
}

function canPublishWish(wish: WishRow, userId: string): boolean {
  return (
    wish.owner_user_id === userId
    && wish.deleted_at === null
    && wish.visibility === "public"
    && (wish.status === "active" || wish.status === "completed")
  );
}

async function findExistingWishPost(supabase: SupabaseClient<Database>, userId: string, wishId: string): Promise<FeedPostRow | null> {
  const { data: entities, error: entitiesError } = await supabase
    .from("feed_post_entities")
    .select("post_id")
    .eq("entity_type", "wish")
    .eq("entity_id", wishId)
    .eq("relation", "primary")
    .limit(1);

  if (entitiesError) throw entitiesError;
  const postIds = (entities ?? []).map((entity) => entity.post_id);
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
  return posts?.[0] ?? null;
}

async function countTodayWishPosts(supabase: SupabaseClient<Database>, userId: string): Promise<number> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  const { count, error } = await supabase
    .from("feed_posts")
    .select("id", { count: "exact", head: true })
    .eq("author_user_id", userId)
    .eq("post_type", "wish")
    .eq("status", "published")
    .is("deleted_at", null)
    .gte("published_at", start.toISOString())
    .lt("published_at", end.toISOString());

  if (error) throw error;
  return count ?? 0;
}
