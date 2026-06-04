import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/lib/database.types";
import { NO_STORE_HEADERS } from "@/lib/httpCache";

export const dynamic = "force-dynamic";

type ChallengeProgress = {
  status: string | null;
  updated_at?: string | null;
  user_id?: string | null;
};

type ChallengeWithProgress = Pick<
  Database["public"]["Tables"]["challenges"]["Row"],
  "id" | "title" | "description" | "instructions" | "requirements" | "reward_label" | "category" | "difficulty_level" | "duration_days" | "image_url" | "verification_type" | "verification_logic" | "sort_order"
> & {
  user_challenges?: ChallengeProgress[] | null;
};

export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const authRequired = request.nextUrl.searchParams.get("auth") === "required";

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "Supabase environment variables are missing." }, { status: 500, headers: NO_STORE_HEADERS });
  }

  if (authRequired && !accessToken) {
    return NextResponse.json({ error: "Missing Supabase access token.", authenticated: false }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false
    }
  });

  let viewerUserId: string | null = null;

  if (accessToken) {
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser(accessToken);

    if (userError) {
      return NextResponse.json({ error: "Session expired. Sign in again." }, { status: 401, headers: NO_STORE_HEADERS });
    }

    if (user) {
      viewerUserId = user.id;
    }
  }

  const query = supabase
    .from("challenges")
    .select(
      viewerUserId
        ? "id,title,description,instructions,requirements,reward_label,category,difficulty_level,duration_days,image_url,verification_type,verification_logic,sort_order,user_challenges(status,updated_at,user_id)"
        : "id,title,description,instructions,requirements,reward_label,category,difficulty_level,duration_days,image_url,verification_type,verification_logic,sort_order"
    )
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("difficulty_level", { ascending: true });

  if (viewerUserId) {
    query.eq("user_challenges.user_id", viewerUserId);
  }

  const { data: challenges, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE_HEADERS });
  }

  let userChallengeCount = 0;
  const data = ((challenges ?? []) as unknown as ChallengeWithProgress[]).map((challenge) => {
    const [userChallenge] = challenge.user_challenges ?? [];
    if (userChallenge?.status) userChallengeCount += 1;
    const { user_challenges: _userChallenges, ...publicChallenge } = challenge;

    return {
      ...publicChallenge,
      user_challenge_status: userChallenge?.status ? String(userChallenge.status).trim().toLowerCase() : null
    };
  });

  return NextResponse.json(
    {
      debug: {
        supabaseProjectRef: getSupabaseProjectRef(supabaseUrl),
        serverReadAt: new Date().toISOString()
      },
      authenticated: Boolean(viewerUserId),
      viewerUserId,
      userChallengeCount,
      challenges: data
    },
    {
      headers: NO_STORE_HEADERS
    }
  );
}

function getSupabaseProjectRef(supabaseUrl: string): string {
  try {
    return new URL(supabaseUrl).hostname.split(".")[0] ?? "unknown";
  } catch {
    return "unknown";
  }
}
