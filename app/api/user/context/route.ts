import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import type { Database } from "@/lib/database.types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Supabase server environment variables are missing." }, { status: 500, headers: NO_STORE_HEADERS });
  }

  if (!accessToken) {
    return NextResponse.json({ user: null, profile: null, core: null, wallet: null }, { headers: NO_STORE_HEADERS });
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
    return NextResponse.json({ error: "Session expired. Sign in again." }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const [profileResult, coreResult, walletResult] = await Promise.all([
    supabase.from("user_profiles").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("core_accounts").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("wallet_accounts").select("*").eq("user_id", user.id).maybeSingle()
  ]);

  if (profileResult.error) return NextResponse.json({ error: profileResult.error.message }, { status: 500, headers: NO_STORE_HEADERS });
  if (coreResult.error) return NextResponse.json({ error: coreResult.error.message }, { status: 500, headers: NO_STORE_HEADERS });
  if (walletResult.error) return NextResponse.json({ error: walletResult.error.message }, { status: 500, headers: NO_STORE_HEADERS });

  return NextResponse.json(
    {
      debug: {
        supabaseProjectRef: getSupabaseProjectRef(supabaseUrl),
        serverReadAt: new Date().toISOString()
      },
      user,
      profile: profileResult.data,
      core: coreResult.data,
      wallet: walletResult.data
    },
    { headers: NO_STORE_HEADERS }
  );
}

function getSupabaseProjectRef(supabaseUrl: string): string {
  try {
    return new URL(supabaseUrl).hostname.split(".")[0] ?? "unknown";
  } catch {
    return "unknown";
  }
}
