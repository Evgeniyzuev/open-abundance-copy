import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

type CoreAccrualRow = {
  accrual_date: string;
  core_before: number;
  daily_rate: number;
  gross_amount: number;
  reinvest_percent: number;
  core_amount: number;
  wallet_amount: number;
  core_after: number;
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
      .from("daily_core_accruals")
      .select("accrual_date,core_before,daily_rate,gross_amount,reinvest_percent,core_amount,wallet_amount,core_after,created_at")
      .eq("user_id", user.id)
      .order("accrual_date", { ascending: false })
      .limit(limit);

    if (since) {
      query = query.gt("created_at", since);
    }

    const { data, error: historyError } = await query;

    if (historyError) {
      return NextResponse.json({ error: historyError.message }, { status: 500 });
    }

    return NextResponse.json(
      { rows: (data ?? []) as CoreAccrualRow[] },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
          "CDN-Cache-Control": "no-store",
          "Pragma": "no-cache"
        }
      }
    );
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to load core accrual history." },
      { status: 500 }
    );
  }
}

function clampLimit(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 30;
  return Math.max(1, Math.min(90, Math.floor(parsed)));
}
