import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import type { Database } from "@/lib/database.types";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type ContactBody = {
  contactUserId?: unknown;
};

export async function GET(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const contacts = await loadContacts(supabase, user.id);
    return NextResponse.json({ contacts }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to load contacts." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const body = await readJsonBody(request);
    const contactUserId = normalizeUuid(body.contactUserId);
    if (!contactUserId || contactUserId === user.id) {
      return NextResponse.json({ error: "Invalid contact user id." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const { data: targetProfile, error: targetError } = await supabase
      .from("user_profiles")
      .select("user_id")
      .eq("user_id", contactUserId)
      .maybeSingle();

    if (targetError) return NextResponse.json({ error: targetError.message }, { status: 500, headers: NO_STORE_HEADERS });
    if (!targetProfile) return NextResponse.json({ error: "Profile not found." }, { status: 404, headers: NO_STORE_HEADERS });

    const { error: upsertError } = await supabase
      .from("user_contacts")
      .upsert(
        {
          owner_user_id: user.id,
          contact_user_id: contactUserId,
          source: "manual",
          status: "active",
          is_required: false,
          removed_at: null
        },
        { onConflict: "owner_user_id,contact_user_id,source" }
      );

    if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500, headers: NO_STORE_HEADERS });

    const contacts = await loadContacts(supabase, user.id);
    return NextResponse.json({ contacts }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to add contact." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const contactUserId = normalizeUuid(new URL(request.url).searchParams.get("contactUserId"));
    if (!contactUserId) {
      return NextResponse.json({ error: "Invalid contact user id." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const { error: updateError } = await supabase
      .from("user_contacts")
      .update({
        status: "removed",
        removed_at: new Date().toISOString()
      })
      .eq("owner_user_id", user.id)
      .eq("contact_user_id", contactUserId)
      .eq("source", "manual")
      .eq("is_required", false);

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500, headers: NO_STORE_HEADERS });

    const contacts = await loadContacts(supabase, user.id);
    return NextResponse.json({ contacts }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to remove contact." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

async function loadContacts(supabase: SupabaseClient<Database>, userId: string) {
  const { data: contactRows, error: contactsError } = await supabase
    .from("user_contacts")
    .select("*")
    .eq("owner_user_id", userId)
    .eq("status", "active")
    .order("updated_at", { ascending: false });

  if (contactsError) throw contactsError;

  const contactIds = Array.from(new Set((contactRows ?? []).map((item) => item.contact_user_id)));
  const { data: profiles, error: profilesError } = contactIds.length
    ? await supabase
        .from("user_profiles")
        .select("user_id,username,display_name,avatar_url,level,created_at")
        .in("user_id", contactIds)
    : { data: [], error: null };

  if (profilesError) throw profilesError;

  return (contactRows ?? []).map((contact) => ({
    ...contact,
    profile: profiles.find((profile) => profile.user_id === contact.contact_user_id) ?? null
  }));
}

async function readJsonBody(request: NextRequest): Promise<ContactBody> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
}
