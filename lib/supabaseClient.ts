import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { detectBrowserLocale, normalizeLocale, type AppLocale } from "@/lib/i18n";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://bsikxrsguwketlloflgi.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let browserClient: SupabaseClient<Database> | undefined;

export function getBrowserSupabaseClient(): SupabaseClient<Database> {
  if (!SUPABASE_ANON_KEY) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is missing.");
  }

  browserClient ??= createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });

  return browserClient;
}

export async function signInWithGoogle(): Promise<void> {
  const supabase = getBrowserSupabaseClient();
  const redirectTo = `${window.location.origin}/auth/callback`;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo }
  });

  if (error) throw error;
}

export async function claimRegistrationAfterAuth(locale: AppLocale = detectBrowserLocale()): Promise<string> {
  const supabase = getBrowserSupabaseClient();
  const {
    data: { session },
    error: sessionError
  } = await supabase.auth.getSession();

  if (sessionError) throw sessionError;
  if (!session?.access_token) throw new Error("Supabase session is missing.");

  const response = await fetch("/api/auth/claim", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`
    },
    body: JSON.stringify({ defaultLocale: normalizeLocale(locale) })
  });

  const payload = (await response.json()) as { userId?: string; error?: string };
  if (!response.ok || !payload.userId) {
    throw new Error(payload.error ?? "Failed to claim guest identity.");
  }

  return payload.userId;
}
