import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

type WalletHistoryRow = {
  id: string;
  operation_date: string;
  kind: "daily_core_payout";
  amount: number;
  daily_rate: number;
  gross_amount: number;
  reinvest_percent: number;
  created_at: string;
};

type DailyCoreAccrualRow = {
  accrual_date: string;
  daily_rate: number;
  gross_amount: number;
  reinvest_percent: number;
  wallet_amount: number;
  created_at: string;
};

export async function GET(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status: 401 });
    }

    const limit = clampLimit(request.nextUrl.searchParams.get("limit"));

    const { data, error: historyError } = await supabase
      .from("daily_core_accruals")
      .select("accrual_date,daily_rate,gross_amount,reinvest_percent,wallet_amount,created_at")
      .eq("user_id", user.id)
      .gt("wallet_amount", 0)
      .order("accrual_date", { ascending: false })
      .limit(limit);

    if (historyError) {
      return NextResponse.json({ error: historyError.message }, { status: 500 });
    }

    const rows: WalletHistoryRow[] = ((data ?? []) as DailyCoreAccrualRow[]).map((row) => ({
      id: `daily-core:${row.accrual_date}`,
      operation_date: row.accrual_date,
      kind: "daily_core_payout",
      amount: Number(row.wallet_amount),
      daily_rate: Number(row.daily_rate),
      gross_amount: Number(row.gross_amount),
      reinvest_percent: Number(row.reinvest_percent),
      created_at: row.created_at
    }));

    return NextResponse.json(
      { rows },
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
      { error: routeError instanceof Error ? routeError.message : "Failed to load wallet history." },
      { status: 500 }
    );
  }
}

function clampLimit(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 30;
  return Math.max(1, Math.min(90, Math.floor(parsed)));
}
