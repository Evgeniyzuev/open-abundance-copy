import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/lib/database.types";

type ReinvestRequest = {
  reinvestPercent?: number;
};

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Supabase server environment variables are missing." }, { status: 500 });
  }

  if (!accessToken) {
    return NextResponse.json({ error: "Sign in to update reinvest." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as ReinvestRequest;
  const reinvestPercent = Number(body.reinvestPercent);

  if (!Number.isFinite(reinvestPercent) || reinvestPercent < 0 || reinvestPercent > 100) {
    return NextResponse.json({ error: "Reinvest must be between 0 and 100." }, { status: 400 });
  }

  const normalizedPercent = Math.round(reinvestPercent * 100) / 100;
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

  const { data: core, error: updateError } = await supabase
    .from("core_accounts")
    .update({ reinvest_percent: normalizedPercent, updated_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .select("*")
    .maybeSingle();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (!core) {
    return NextResponse.json({ error: "Core is not created yet." }, { status: 404 });
  }

  return NextResponse.json({
    debug: {
      supabaseProjectRef: getSupabaseProjectRef(supabaseUrl),
      serverReadAt: new Date().toISOString()
    },
    userId: user.id,
    core,
    needsClientRefresh: true // <<< Новый флаг для принудительного обновления клиента
  });
}

function getSupabaseProjectRef(supabaseUrl: string): string {
  try {
    return new URL(supabaseUrl).hostname.split(".")[0] ?? "unknown";
  } catch {
    return "unknown";
  }
}
