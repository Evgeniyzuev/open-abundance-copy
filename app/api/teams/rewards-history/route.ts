import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

type TeamRewardRow = {
  bonus_date: string;
  reward_amount: number;
  source_count: number;
  created_at: string;
};

type RawRewardRow = {
  bonus_date: string;
  source_user_id: string;
  reward_amount: number;
  created_at: string;
};

export async function GET(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status: 401 });
    }

    const limit = clampLimit(request.nextUrl.searchParams.get("limit"));
    const since = request.nextUrl.searchParams.get("since");

    let query = supabase
      .from("team_core_growth_rewards")
      .select("bonus_date,source_user_id,reward_amount,created_at")
      .eq("leader_user_id", user.id)
      .order("bonus_date", { ascending: false })
      .limit(limit * 20);

    if (since) {
      query = query.gt("created_at", since);
    }

    const { data, error: rewardsError } = await query;

    if (rewardsError) {
      return NextResponse.json({ error: rewardsError.message }, { status: 500 });
    }

    return NextResponse.json({ rows: aggregateByDate((data ?? []) as RawRewardRow[]).slice(0, limit) }, { headers: { "Cache-Control": "no-store" } });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to load team rewards history." },
      { status: 500 }
    );
  }
}

function aggregateByDate(rows: RawRewardRow[]): TeamRewardRow[] {
  const days = new Map<string, TeamRewardRow & { sources: Set<string> }>();

  for (const row of rows) {
    const current = days.get(row.bonus_date) ?? {
      bonus_date: row.bonus_date,
      reward_amount: 0,
      source_count: 0,
      created_at: row.created_at,
      sources: new Set<string>()
    };

    current.reward_amount += Number(row.reward_amount);
    current.sources.add(row.source_user_id);
    current.source_count = current.sources.size;
    if (row.created_at > current.created_at) current.created_at = row.created_at;
    days.set(row.bonus_date, current);
  }

  return Array.from(days.values())
    .map(({ sources: _sources, ...day }) => ({ ...day, reward_amount: roundCents(day.reward_amount) }))
    .sort((left, right) => right.bonus_date.localeCompare(left.bonus_date));
}

function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

function clampLimit(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 30;
  return Math.max(1, Math.min(90, Math.floor(parsed)));
}
