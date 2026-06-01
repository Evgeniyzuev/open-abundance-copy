import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export async function GET(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status: 401 });
    }

    const { data: existingCode, error: existingError } = await supabase
      .from("referral_codes")
      .select("code")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }

    const code = existingCode?.code ?? await createReferralCode(supabase, user.id);
    const url = new URL(request.nextUrl.origin);
    url.searchParams.set("ref", code);

    return NextResponse.json(
      { code, url: url.toString() },
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
      { error: routeError instanceof Error ? routeError.message : "Failed to load referral link." },
      { status: 500 }
    );
  }
}

async function createReferralCode(supabase: SupabaseClient<Database>, userId: string): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = randomBytes(6).toString("base64url");
    const { error } = await supabase.from("referral_codes").insert({ code, user_id: userId });

    if (!error) return code;
    if (error.code !== "23505") throw error;
  }

  throw new Error("Could not create a unique referral code.");
}
