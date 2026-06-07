import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import type { Json, Tables, TablesInsert } from "@/lib/database.types";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type DailyCoreAccrual = Pick<
  Tables<"daily_core_accruals">,
  "accrual_date" | "core_before" | "daily_rate" | "gross_amount" | "reinvest_percent" | "core_amount" | "wallet_amount" | "core_after" | "created_at"
>;
type FeedPostRow = Tables<"feed_posts">;
type FeedStatBlockRow = Tables<"feed_post_stat_blocks">;

export async function POST(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const body = await readJsonBody(request);
    const requestedDate = normalizeDate(body.date);

    let accrualQuery = supabase
      .from("daily_core_accruals")
      .select("accrual_date,core_before,daily_rate,gross_amount,reinvest_percent,core_amount,wallet_amount,core_after,created_at")
      .eq("user_id", user.id)
      .order("accrual_date", { ascending: false })
      .limit(1);

    if (requestedDate) {
      accrualQuery = accrualQuery.eq("accrual_date", requestedDate);
    }

    const { data: accrual, error: accrualError } = await accrualQuery.maybeSingle();
    if (accrualError) return NextResponse.json({ error: accrualError.message }, { status: 500, headers: NO_STORE_HEADERS });
    if (!accrual) {
      return NextResponse.json({ error: "Daily Core accrual was not found." }, { status: 404, headers: NO_STORE_HEADERS });
    }

    const snapshot = await upsertSnapshot(user.id, accrual as DailyCoreAccrual);
    const post = await getOrCreatePost(user.id, snapshot.id, accrual as DailyCoreAccrual);
    const statBlocks = await getOrCreateStatBlocks(post, snapshot.id, accrual as DailyCoreAccrual);

    return NextResponse.json({ post: { ...post, statBlocks } }, { headers: NO_STORE_HEADERS });

    async function upsertSnapshot(userId: string, row: DailyCoreAccrual): Promise<Tables<"progress_snapshots">> {
      const { data, error: snapshotError } = await supabase
        .from("progress_snapshots")
        .upsert(
          {
            user_id: userId,
            source_type: "daily_core_accrual",
            source_date: row.accrual_date,
            core_before: row.core_before,
            daily_rate: row.daily_rate,
            gross_amount: row.gross_amount,
            reinvest_percent: row.reinvest_percent,
            core_amount: row.core_amount,
            wallet_amount: row.wallet_amount,
            core_after: row.core_after,
            payload: buildSnapshotPayload(row)
          },
          { onConflict: "user_id,source_type,source_date" }
        )
        .select("*")
        .single();

      if (snapshotError) throw snapshotError;
      return data;
    }

    async function getOrCreatePost(userId: string, snapshotId: string, row: DailyCoreAccrual): Promise<FeedPostRow> {
      const { data: existingPost, error: existingError } = await supabase
        .from("feed_posts")
        .select("*")
        .eq("author_user_id", userId)
        .eq("snapshot_id", snapshotId)
        .is("deleted_at", null)
        .maybeSingle();

      if (existingError) throw existingError;
      if (existingPost) return existingPost;

      const { data, error: insertError } = await supabase
        .from("feed_posts")
        .insert({
          author_user_id: userId,
          snapshot_id: snapshotId,
          post_type: "daily_progress",
          status: "draft",
          visibility: "public",
          body: buildDefaultBody(row)
        })
        .select("*")
        .single();

      if (insertError) throw insertError;
      return data;
    }

    async function getOrCreateStatBlocks(post: FeedPostRow, snapshotId: string, row: DailyCoreAccrual): Promise<FeedStatBlockRow[]> {
      const { data: existingBlocks, error: existingBlocksError } = await supabase
        .from("feed_post_stat_blocks")
        .select("*")
        .eq("post_id", post.id)
        .order("sort_order", { ascending: true });

      if (existingBlocksError) throw existingBlocksError;
      if (existingBlocks?.length) return existingBlocks;

      const blocks = buildStatBlocks(post.id, snapshotId, row);
      const { data, error: insertBlocksError } = await supabase
        .from("feed_post_stat_blocks")
        .insert(blocks)
        .select("*")
        .order("sort_order", { ascending: true });

      if (insertBlocksError) throw insertBlocksError;
      return data ?? [];
    }
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to create daily draft." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

function buildStatBlocks(postId: string, snapshotId: string, row: DailyCoreAccrual): Array<TablesInsert<"feed_post_stat_blocks">> {
  return [
    {
      post_id: postId,
      snapshot_id: snapshotId,
      block_key: "core_growth",
      label: "Core growth",
      value: { amount: row.core_amount, before: row.core_before, after: row.core_after } as Json,
      visibility: "private",
      sort_order: 0
    },
    {
      post_id: postId,
      snapshot_id: snapshotId,
      block_key: "wallet_income",
      label: "Wallet income",
      value: { amount: row.wallet_amount } as Json,
      visibility: "private",
      sort_order: 1
    },
    {
      post_id: postId,
      snapshot_id: snapshotId,
      block_key: "daily_rate",
      label: "Daily rate",
      value: { percent: row.daily_rate } as Json,
      visibility: "private",
      sort_order: 2
    },
    {
      post_id: postId,
      snapshot_id: snapshotId,
      block_key: "reinvest",
      label: "Reinvest",
      value: { percent: row.reinvest_percent } as Json,
      visibility: "private",
      sort_order: 3
    }
  ];
}

function buildSnapshotPayload(row: DailyCoreAccrual): Json {
  return {
    source: "daily_core_accruals",
    accrualDate: row.accrual_date,
    sourceCreatedAt: row.created_at
  };
}

function buildDefaultBody(row: DailyCoreAccrual): string {
  return `Daily Core progress for ${row.accrual_date}`;
}

async function readJsonBody(request: NextRequest): Promise<{ date?: unknown }> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

function normalizeDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}
