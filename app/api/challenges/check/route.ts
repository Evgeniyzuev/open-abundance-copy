import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import type { Database, Json } from "@/lib/database.types";

type CheckRequest = {
  challengeId?: string;
};

type ChallengeRow = Database["public"]["Tables"]["challenges"]["Row"];

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const authHeader = request.headers.get("authorization");
  const accessToken = authHeader?.replace(/^Bearer\s+/i, "");

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Supabase server environment variables are missing." }, { status: 500 });
  }

  if (!accessToken) {
    return NextResponse.json({ error: "Sign in to check the challenge." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as CheckRequest;
  if (!body.challengeId || !isUuid(body.challengeId)) {
    return NextResponse.json({ error: "Invalid challenge." }, { status: 400 });
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
    .eq("id", body.challengeId)
    .eq("is_active", true)
    .maybeSingle();

  if (challengeError) {
    return NextResponse.json({ error: challengeError.message }, { status: 500 });
  }

  if (!challenge) {
    return NextResponse.json({ error: "Challenge not found." }, { status: 404 });
  }

  const verification = await verifyChallenge(supabase, user.id, challenge);
  if (!verification.ok) {
    await supabase.from("user_challenges").upsert(
      {
        user_id: user.id,
        challenge_id: challenge.id,
        status: "accepted",
        updated_at: new Date().toISOString()
      },
      { onConflict: "user_id,challenge_id" }
    );

    return NextResponse.json({
      userId: user.id,
      challengeId: challenge.id,
      status: "accepted",
      completed: false,
      message: verification.reason
    });
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
  const [coreResult, walletResult] = await Promise.all([
    supabase.from("core_accounts").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("wallet_accounts").select("*").eq("user_id", user.id).maybeSingle()
  ]);

  if (coreResult.error) {
    return NextResponse.json({ error: coreResult.error.message }, { status: 500 });
  }

  if (walletResult.error) {
    return NextResponse.json({ error: walletResult.error.message }, { status: 500 });
  }

  return NextResponse.json({
    userId: user.id,
    challengeId: challenge.id,
    status: result?.challenge_status ?? "completed",
    completed: true,
    core: coreResult.data,
    wallet: walletResult.data,
    rewardClaimed: Boolean(result?.reward_claimed),
    rewardAccount: result?.rewarded_account ?? "core",
    rewardAmount: Number(result?.rewarded_amount ?? rewardAmount)
  });
}

async function verifyChallenge(
  supabase: ReturnType<typeof createClient<Database>>,
  userId: string,
  challenge: ChallengeRow
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (challenge.verification_logic === "signup") {
    const [profile, core, wallet] = await Promise.all([
      supabase.from("user_profiles").select("user_id").eq("user_id", userId).maybeSingle(),
      supabase.from("core_accounts").select("user_id").eq("user_id", userId).maybeSingle(),
      supabase.from("wallet_accounts").select("user_id").eq("user_id", userId).maybeSingle()
    ]);

    if (profile.error || core.error || wallet.error) {
      return { ok: false, reason: "Could not check the account. Try again." };
    }

    if (!profile.data) return { ok: false, reason: "Profile is not created yet. Refresh the page or sign in again." };
    if (!core.data) return { ok: false, reason: "Core is not created yet. Refresh the page or sign in again." };
    if (!wallet.data) return { ok: false, reason: "Wallet is not created yet. Refresh the page or sign in again." };

    return { ok: true };
  }

  if (challenge.verification_logic === "calculate_time_to_goal") {
    const { data: progress, error: progressError } = await supabase
      .from("user_challenges")
      .select("verification_data")
      .eq("user_id", userId)
      .eq("challenge_id", challenge.id)
      .maybeSingle();

    if (progressError) {
      return { ok: false, reason: "Could not check calculator progress. Try again." };
    }

    const verificationData = progress?.verification_data;
    if (isRecord(verificationData) && verificationData.calculated === true) {
      return { ok: true };
    }

    return { ok: false, reason: "Use the Core calculator first, then check this challenge." };
  }

  return { ok: false, reason: "Verification is not connected for this challenge yet." };
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

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
