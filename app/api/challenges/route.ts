import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/lib/database.types";
import { NO_STORE_HEADERS } from "@/lib/httpCache";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "Supabase environment variables are missing." }, { status: 500, headers: NO_STORE_HEADERS });
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false
    }
  });

  const { data: challenges, error } = await supabase
    .from("challenges")
    .select("id,title,description,instructions,requirements,reward_label,category,difficulty_level,duration_days,image_url,verification_type,verification_logic,sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("difficulty_level", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE_HEADERS });
  }

  let userChallengeMap = new Map<string, { status: string }>();

  if (accessToken) {
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser(accessToken);

    if (userError) {
      return NextResponse.json({ error: "Session expired. Sign in again." }, { status: 401, headers: NO_STORE_HEADERS });
    }

    if (user) {
      const { data: userChallenges, error: userChallengesError } = await supabase
        .from("user_challenges")
        .select("challenge_id,status")
        .eq("user_id", user.id);

      if (userChallengesError) {
        return NextResponse.json({ error: userChallengesError.message }, { status: 500, headers: NO_STORE_HEADERS });
      }

      userChallengeMap = new Map(
        (userChallenges ?? []).map((item) => [
          item.challenge_id,
          { status: String(item.status ?? "").trim().toLowerCase() }
        ])
      );
    }
  }

  const data = (challenges ?? []).map((challenge) => {
    const userChallenge = userChallengeMap.get(challenge.id);
    return {
      ...challenge,
      user_challenge_status: userChallenge?.status ?? null
    };
  });

  return NextResponse.json(
    { challenges: data },
    {
      headers: NO_STORE_HEADERS
    }
  );
}
