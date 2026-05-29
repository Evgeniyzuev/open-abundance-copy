import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/lib/database.types";

type LevelSeenRequest = {
  level?: number;
};

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const authHeader = request.headers.get("authorization");
  const accessToken = authHeader?.replace(/^Bearer\s+/i, "");

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Supabase server environment variables are missing." }, { status: 500 });
  }

  if (!accessToken) {
    return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as LevelSeenRequest;
  const requestedLevel = Number(body.level);
  if (!Number.isInteger(requestedLevel) || requestedLevel < 0) {
    return NextResponse.json({ error: "Invalid level." }, { status: 400 });
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

  const { data: core, error: coreError } = await supabase
    .from("core_accounts")
    .select("level,last_seen_level")
    .eq("user_id", user.id)
    .maybeSingle();

  if (coreError) {
    return NextResponse.json({ error: coreError.message }, { status: 500 });
  }

  if (!core) {
    return NextResponse.json({ error: "Core is not created yet." }, { status: 404 });
  }

  const nextSeenLevel = Math.max(core.last_seen_level, Math.min(requestedLevel, core.level));
  const { error: updateError } = await supabase
    .from("core_accounts")
    .update({ last_seen_level: nextSeenLevel })
    .eq("user_id", user.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ lastSeenLevel: nextSeenLevel, level: core.level });
}
