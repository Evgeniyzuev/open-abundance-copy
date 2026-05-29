import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, TablesInsert } from "@/lib/database.types";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

type ClaimBody = {
  referralCode?: unknown;
  guestId?: unknown;
  capturedAt?: unknown;
};

export async function POST(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status: 401 });
    }

    const body = await readJsonBody(request);
    const referralCode = normalizeReferralCode(body.referralCode);
    const guestId = normalizeUuid(body.guestId);
    const capturedAt = normalizeDate(body.capturedAt);
    const existingMembership = await getExistingMembership(supabase, user.id);

    if (existingMembership) {
      return NextResponse.json({ status: "already_assigned", membership: existingMembership });
    }

    const existingEdge = await getExistingReferralEdge(supabase, user.id);
    const referrerUserId = existingEdge?.referrer_user_id ?? await maybeCreateReferralEdge(supabase, {
      referralUserId: user.id,
      referralCode,
      guestId,
      capturedAt
    });

    const membership: TablesInsert<"team_memberships"> = referrerUserId && await canLead(supabase, referrerUserId, user.id)
      ? {
          member_user_id: user.id,
          leader_user_id: referrerUserId
        }
      : {
          member_user_id: user.id,
          leader_user_id: null
        };

    const { data: insertedMembership, error: membershipError } = await supabase
      .from("team_memberships")
      .insert(membership)
      .select("*")
      .single();

    if (membershipError) {
      if (membershipError.code === "23505") {
        const concurrentMembership = await getExistingMembership(supabase, user.id);
        return NextResponse.json({ status: "already_assigned", membership: concurrentMembership });
      }
      return NextResponse.json({ error: membershipError.message }, { status: 500 });
    }

    return NextResponse.json({
      status: insertedMembership.leader_user_id ? "assigned_to_referrer" : "assigned_to_system",
      membership: insertedMembership
    });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to claim referral." },
      { status: 500 }
    );
  }
}

async function maybeCreateReferralEdge(
  supabase: SupabaseClient<Database>,
  input: { referralUserId: string; referralCode?: string; guestId?: string; capturedAt?: string }
): Promise<string | null> {
  if (!input.referralCode) return null;

  const { data: referralCodeRow, error: codeError } = await supabase
    .from("referral_codes")
    .select("code,user_id")
    .eq("code", input.referralCode)
    .eq("is_active", true)
    .maybeSingle();

  if (codeError) throw codeError;
  if (!referralCodeRow || referralCodeRow.user_id === input.referralUserId) return null;

  const { error: edgeError } = await supabase.from("referral_edges").insert({
    referral_user_id: input.referralUserId,
    referrer_user_id: referralCodeRow.user_id,
    referral_code: referralCodeRow.code,
    guest_id: input.guestId ?? null,
    captured_at: input.capturedAt ?? null,
    source: "referral_link"
  });

  if (edgeError && edgeError.code !== "23505") throw edgeError;

  return referralCodeRow.user_id;
}

async function canLead(supabase: SupabaseClient<Database>, leaderUserId: string, memberUserId: string): Promise<boolean> {
  const [leaderProfileResult, memberProfileResult, directMembersResult] = await Promise.all([
    supabase.from("user_profiles").select("level").eq("user_id", leaderUserId).maybeSingle(),
    supabase.from("user_profiles").select("level").eq("user_id", memberUserId).maybeSingle(),
    supabase
      .from("team_memberships")
      .select("member_user_id", { count: "exact", head: true })
      .eq("leader_user_id", leaderUserId)
      .eq("is_active", true)
  ]);

  if (leaderProfileResult.error) throw leaderProfileResult.error;
  if (memberProfileResult.error) throw memberProfileResult.error;
  if (directMembersResult.error) throw directMembersResult.error;

  const leaderLevel = leaderProfileResult.data?.level ?? 0;
  const memberLevel = memberProfileResult.data?.level ?? 0;
  const usedCapacity = directMembersResult.count ?? 0;

  return leaderLevel > memberLevel && usedCapacity < leaderLevel;
}

async function getExistingMembership(supabase: SupabaseClient<Database>, userId: string) {
  const { data, error } = await supabase
    .from("team_memberships")
    .select("*")
    .eq("member_user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function getExistingReferralEdge(supabase: SupabaseClient<Database>, userId: string) {
  const { data, error } = await supabase
    .from("referral_edges")
    .select("*")
    .eq("referral_user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function readJsonBody(request: NextRequest): Promise<ClaimBody> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

function normalizeReferralCode(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return /^[A-Za-z0-9_-]{4,32}$/.test(trimmed) ? trimmed : undefined;
}

function normalizeUuid(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : undefined;
}

function normalizeDate(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}
