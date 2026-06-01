import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export async function GET(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status: 401 });
    }

    const { data: membership, error: membershipError } = await supabase
      .from("team_memberships")
      .select("*")
      .eq("member_user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (membershipError) {
      return NextResponse.json({ error: membershipError.message }, { status: 500 });
    }

    const { data: directMemberships, error: membersError } = await supabase
      .from("team_memberships")
      .select("member_user_id,assigned_at")
      .eq("leader_user_id", user.id)
      .eq("is_active", true)
      .order("assigned_at", { ascending: false });

    if (membersError) {
      return NextResponse.json({ error: membersError.message }, { status: 500 });
    }

    const leaderProfile = membership?.leader_user_id
      ? await loadProfile(supabase, membership.leader_user_id)
      : null;

    const memberIds = directMemberships?.map((item) => item.member_user_id) ?? [];
    const memberProfiles = memberIds.length ? await loadProfiles(supabase, memberIds) : [];
    const directMembers = (directMemberships ?? []).map((item) => ({
      userId: item.member_user_id,
      assignedAt: item.assigned_at,
      profile: memberProfiles.find((profile) => profile.user_id === item.member_user_id) ?? null
    }));

    return NextResponse.json(
        {
          membership,
        leader: membership?.leader_user_id
          ? { type: "user", profile: leaderProfile }
          : { type: "system", profile: null },
          directMembers
        },
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
      { error: routeError instanceof Error ? routeError.message : "Failed to load team." },
      { status: 500 }
    );
  }
}

async function loadProfile(supabase: Awaited<ReturnType<typeof getAuthenticatedUser>>["supabase"], userId: string) {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("user_id,username,display_name,avatar_url,level,created_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function loadProfiles(supabase: Awaited<ReturnType<typeof getAuthenticatedUser>>["supabase"], userIds: string[]) {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("user_id,username,display_name,avatar_url,level,created_at")
    .in("user_id", userIds);

  if (error) throw error;
  return data ?? [];
}
