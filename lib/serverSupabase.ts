import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";

export function createServiceSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase server environment variables are missing.");
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

export async function getAuthenticatedUser(request: NextRequest) {
  const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!accessToken) {
    return { supabase: createServiceSupabaseClient(), user: null, error: "Missing Supabase access token." };
  }

  const supabase = createServiceSupabaseClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser(accessToken);

  if (error || !user) {
    return { supabase, user: null, error: "Invalid Supabase access token." };
  }

  return { supabase, user, error: null };
}
