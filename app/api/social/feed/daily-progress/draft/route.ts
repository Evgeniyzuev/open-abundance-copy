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
type DailyGrowthContext = {
  levelBefore: number;
  levelAfter: number;
  teamBonusAmount: number;
  teamStrength: number;
  teamMemberCount: number;
};

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

    const row = accrual as DailyCoreAccrual;
    const context = await loadDailyGrowthContext(user.id, row);
    const snapshot = await upsertSnapshot(user.id, row, context);
    const post = await getOrCreatePost(user.id, snapshot.id, row);
    const statBlocks = await syncStatBlocks(post, snapshot.id, row, context);

    return NextResponse.json({ post: { ...post, statBlocks } }, { headers: NO_STORE_HEADERS });

    async function upsertSnapshot(userId: string, row: DailyCoreAccrual, context: DailyGrowthContext): Promise<Tables<"progress_snapshots">> {
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
            payload: buildSnapshotPayload(row, context)
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
      if (existingPost) {
        const nextBody = shouldRefreshDefaultBody(existingPost.body) ? buildDefaultBody(row) : existingPost.body;
        if (nextBody !== existingPost.body) {
          const { data: updatedPost, error: updatePostError } = await supabase
            .from("feed_posts")
            .update({ body: nextBody })
            .eq("id", existingPost.id)
            .select("*")
            .single();

          if (updatePostError) throw updatePostError;
          return updatedPost;
        }

        return existingPost;
      }

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

    async function syncStatBlocks(post: FeedPostRow, snapshotId: string, row: DailyCoreAccrual, context: DailyGrowthContext): Promise<FeedStatBlockRow[]> {
      const { data: existingBlocks, error: existingBlocksError } = await supabase
        .from("feed_post_stat_blocks")
        .select("*")
        .eq("post_id", post.id)
        .order("sort_order", { ascending: true });

      if (existingBlocksError) throw existingBlocksError;

      const blocks = buildStatBlocks(post.id, snapshotId, row, context);
      const desiredKeys = blocks.map((block) => block.block_key);
      const obsoleteBlockIds = (existingBlocks ?? [])
        .filter((block) => !desiredKeys.includes(block.block_key))
        .map((block) => block.id);

      if (obsoleteBlockIds.length) {
        const { error: deleteObsoleteError } = await supabase
          .from("feed_post_stat_blocks")
          .delete()
          .in("id", obsoleteBlockIds);

        if (deleteObsoleteError) throw deleteObsoleteError;
      }

      const { data, error: upsertBlocksError } = await supabase
        .from("feed_post_stat_blocks")
        .upsert(blocks, { onConflict: "post_id,block_key" })
        .select("*")
        .order("sort_order", { ascending: true });

      if (upsertBlocksError) throw upsertBlocksError;
      return data ?? [];
    }

    async function loadDailyGrowthContext(userId: string, row: DailyCoreAccrual): Promise<DailyGrowthContext> {
      const [teamBonusAmount, teamStrength] = await Promise.all([
        loadTeamBonusAmount(userId, row.accrual_date),
        loadTeamStrength(userId)
      ]);
      const totalCoreAfter = Number(row.core_after) + teamBonusAmount;
      const [levelBefore, levelAfter] = await Promise.all([
        calculateCoreLevel(Number(row.core_before)),
        calculateCoreLevel(totalCoreAfter)
      ]);

      return {
        levelBefore,
        levelAfter,
        teamBonusAmount,
        teamStrength: teamStrength.levelSum,
        teamMemberCount: teamStrength.memberCount
      };
    }

    async function loadTeamBonusAmount(userId: string, date: string): Promise<number> {
      const { data, error: rewardsError } = await supabase
        .from("team_core_growth_rewards")
        .select("reward_amount")
        .eq("leader_user_id", userId)
        .eq("bonus_date", date);

      if (rewardsError) throw rewardsError;
      return (data ?? []).reduce((sum, row) => sum + Number(row.reward_amount), 0);
    }

    async function loadTeamStrength(userId: string): Promise<{ levelSum: number; memberCount: number }> {
      const { data: memberships, error: membershipsError } = await supabase
        .from("team_memberships")
        .select("member_user_id")
        .eq("leader_user_id", userId)
        .eq("is_active", true);

      if (membershipsError) throw membershipsError;

      const memberIds = (memberships ?? []).map((membership) => membership.member_user_id);
      if (!memberIds.length) return { levelSum: 0, memberCount: 0 };

      const { data: profiles, error: profilesError } = await supabase
        .from("user_profiles")
        .select("level")
        .in("user_id", memberIds);

      if (profilesError) throw profilesError;

      return {
        levelSum: (profiles ?? []).reduce((sum, profile) => sum + Number(profile.level ?? 0), 0),
        memberCount: memberIds.length
      };
    }

    async function calculateCoreLevel(balance: number): Promise<number> {
      const { data, error: levelError } = await supabase.rpc("calculate_core_level", { core_balance: balance });
      if (levelError) throw levelError;
      return Number(data ?? 0);
    }
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to create daily draft." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

function buildStatBlocks(postId: string, snapshotId: string, row: DailyCoreAccrual, context: DailyGrowthContext): Array<TablesInsert<"feed_post_stat_blocks">> {
  const totalCoreGrowth = Number(row.core_amount) + context.teamBonusAmount;

  return [
    {
      post_id: postId,
      snapshot_id: snapshotId,
      block_key: "level",
      label: "LVL",
      value: {
        levelBefore: context.levelBefore,
        levelAfter: context.levelAfter,
        leveledUp: context.levelAfter > context.levelBefore
      } as Json,
      visibility: "public",
      sort_order: 0
    },
    {
      post_id: postId,
      snapshot_id: snapshotId,
      block_key: "total_core_growth",
      label: "Total Core Growth",
      value: {
        amount: totalCoreGrowth,
        coreInterestAmount: row.core_amount,
        teamBonusAmount: context.teamBonusAmount,
        pendingSources: ["challenge_rewards", "manual_core_topups"]
      } as Json,
      visibility: "public",
      sort_order: 1
    },
    {
      post_id: postId,
      snapshot_id: snapshotId,
      block_key: "team_strength",
      label: "Team Strength",
      value: {
        levelSum: context.teamStrength,
        memberCount: context.teamMemberCount
      } as Json,
      visibility: "public",
      sort_order: 2
    }
  ];
}

function buildSnapshotPayload(row: DailyCoreAccrual, context: DailyGrowthContext): Json {
  return {
    source: "daily_core_accruals",
    accrualDate: row.accrual_date,
    sourceCreatedAt: row.created_at,
    teamBonusAmount: context.teamBonusAmount,
    levelBefore: context.levelBefore,
    levelAfter: context.levelAfter,
    teamStrength: context.teamStrength,
    teamMemberCount: context.teamMemberCount
  };
}

function buildDefaultBody(row: DailyCoreAccrual): string {
  return `My Growth: ${formatGrowthDate(row.accrual_date)}`;
}

function shouldRefreshDefaultBody(value: string | null): boolean {
  return !value || value.startsWith("Daily Core progress for ");
}

function formatGrowthDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "long",
    timeZone: "UTC"
  }).format(new Date(`${value}T00:00:00Z`));
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
