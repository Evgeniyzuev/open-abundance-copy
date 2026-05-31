import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import type { Database, Json } from "@/lib/database.types";

type ProgressRequest = {
  verificationLogic?: string;
};

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Supabase server environment variables are missing." }, { status: 500 });
  }

  if (!accessToken) {
    return NextResponse.json({ error: "Sign in to record challenge progress." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as ProgressRequest;
  if (body.verificationLogic !== "calculate_time_to_goal") {
    return NextResponse.json({ error: "Unsupported challenge progress." }, { status: 400 });
  }

  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser(accessToken);

  if (userError || !user) {
    return NextResponse.json({ error: "Session expired. Sign in again." }, { status: 401 });
  }

  const { data: challenge, error: challengeError } = await supabase
    .from("challenges")
    .select("*")
    .eq("is_active", true)
    .eq("verification_logic", body.verificationLogic)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (challengeError) {
    return NextResponse.json({ error: challengeError.message }, { status: 500 });
  }

  if (!challenge) {
    return NextResponse.json({ completed: false, reason: "Challenge not found." });
  }

  const rewardAmount = getRewardAmount(challenge.reward_label);
  const { data: completion, error: completionError } = await supabase.rpc("complete_user_challenge", {
    p_user_id: user.id,
    p_challenge_id: challenge.id,
    p_reward_account: "core",
    p_reward_amount: rewardAmount
  });

  if (completionError) {
    return NextResponse.json({ error: completionError.message }, { status: 500 });
  }

  const result = completion?.[0];
  return NextResponse.json({
    completed: true,
    rewardClaimed: Boolean(result?.reward_claimed),
    rewardAccount: result?.rewarded_account ?? "core",
    rewardAmount: Number(result?.rewarded_amount ?? rewardAmount)
  });
}

function getRewardAmount(value: Json): number {
  const raw = rewardLabelText(value);
  const amount = raw.match(/(\d+(?:[.,]\d+)?)\s*\$/)?.[1] ?? raw.match(/\+(\d+(?:[.,]\d+)?)/)?.[1] ?? raw.match(/(\d+(?:[.,]\d+)?)/)?.[1];
  return amount ? Number(amount.replace(",", ".")) : 1;
}

function rewardLabelText(value: Json): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, Json | undefined>;
    const en = record.en;
    const ru = record.ru;
    if (typeof en === "string") return en;
    if (typeof ru === "string") return ru;
  }

  return "1$";
}
