import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/lib/database.types";

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const authHeader = request.headers.get("authorization");
  const accessToken = authHeader?.replace(/^Bearer\s+/i, "");

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Supabase server environment variables are missing." }, { status: 500 });
  }

  if (!accessToken) {
    return NextResponse.json({ error: "Missing Supabase access token." }, { status: 401 });
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
    return NextResponse.json({ error: "Invalid Supabase access token." }, { status: 401 });
  }

  const fullName = textMetadata(user.user_metadata.full_name) ?? textMetadata(user.user_metadata.name);
  const givenName = textMetadata(user.user_metadata.given_name);
  const familyName = textMetadata(user.user_metadata.family_name);
  const googleName = [givenName, familyName].filter(Boolean).join(" ");
  const displayName = fullName ?? (googleName || user.email || null);
  const avatarUrl = textMetadata(user.user_metadata.avatar_url) ?? textMetadata(user.user_metadata.picture);
  const now = new Date().toISOString();

  const { error: profileError } = await supabase.from("user_profiles").upsert(
    {
      user_id: user.id,
      username: textMetadata(user.user_metadata.user_name) ?? null,
      first_name: givenName ?? null,
      last_name: familyName ?? null,
      display_name: displayName,
      avatar_url: avatarUrl ?? null,
      default_locale: "ru",
      onboarding_state: { registrationChallenge: "completed" },
      updated_at: now
    },
    { onConflict: "user_id" }
  );

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  const { error: coreError } = await supabase.from("core_accounts").upsert(
    {
      user_id: user.id,
      updated_at: now
    },
    { onConflict: "user_id" }
  );

  if (coreError) {
    return NextResponse.json({ error: coreError.message }, { status: 500 });
  }

  const { error: walletError } = await supabase.from("wallet_accounts").upsert(
    {
      user_id: user.id,
      updated_at: now
    },
    { onConflict: "user_id" }
  );

  if (walletError) {
    return NextResponse.json({ error: walletError.message }, { status: 500 });
  }

  return NextResponse.json({ userId: user.id });
}

function textMetadata(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
