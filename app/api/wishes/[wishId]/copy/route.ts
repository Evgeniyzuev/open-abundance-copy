import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables, TablesInsert } from "@/lib/database.types";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

type WishRow = Tables<"wishes">;

export async function POST(request: NextRequest, { params }: { params: { wishId: string } }) {
  try {
    const wishId = normalizeUuid(params.wishId);
    if (!wishId) {
      return NextResponse.json({ error: "Invalid wish id." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const { data: sourceWish, error: sourceError } = await supabase
      .from("wishes")
      .select("*")
      .eq("id", wishId)
      .is("deleted_at", null)
      .eq("visibility", "public")
      .in("status", ["active", "completed"])
      .maybeSingle();

    if (sourceError) return NextResponse.json({ error: sourceError.message }, { status: 500, headers: NO_STORE_HEADERS });
    if (!sourceWish) return NextResponse.json({ error: "Public wish not found." }, { status: 404, headers: NO_STORE_HEADERS });
    if (sourceWish.owner_user_id === user.id) {
      return NextResponse.json({ error: "You already own this wish." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const originalWishId = sourceWish.original_wish_id ?? sourceWish.id;
    const existingCopy = await findExistingCopy(supabase, user.id, sourceWish.id, originalWishId);
    if (existingCopy.error) return NextResponse.json({ error: existingCopy.error }, { status: 500, headers: NO_STORE_HEADERS });
    if (existingCopy.wish) {
      return NextResponse.json({ wish: existingCopy.wish, alreadyCopied: true }, { headers: NO_STORE_HEADERS });
    }

    const row: TablesInsert<"wishes"> = {
      owner_user_id: user.id,
      title: sourceWish.title,
      description: sourceWish.description,
      category: sourceWish.category,
      image_url: sourceWish.image_url,
      target_amount: sourceWish.target_amount,
      target_currency: sourceWish.target_currency,
      difficulty_level: sourceWish.difficulty_level,
      status: "active",
      visibility: "private",
      cloned_from_wish_id: sourceWish.id,
      original_wish_id: originalWishId
    };

    const { data: copiedWish, error: insertError } = await supabase
      .from("wishes")
      .insert(row)
      .select("*")
      .single();

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500, headers: NO_STORE_HEADERS });

    await incrementCopiedCount(supabase, sourceWish);

    return NextResponse.json({ wish: copiedWish, alreadyCopied: false }, { status: 201, headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to copy wish." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

async function findExistingCopy(
  supabase: SupabaseClient<Database>,
  userId: string,
  sourceWishId: string,
  originalWishId: string
): Promise<{ wish: WishRow | null; error?: string }> {
  const { data, error } = await supabase
    .from("wishes")
    .select("*")
    .eq("owner_user_id", userId)
    .is("deleted_at", null)
    .or(`cloned_from_wish_id.eq.${sourceWishId},original_wish_id.eq.${originalWishId}`)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) return { wish: null, error: error.message };
  return { wish: data?.[0] ?? null };
}

async function incrementCopiedCount(supabase: SupabaseClient<Database>, sourceWish: WishRow) {
  await supabase
    .from("wishes")
    .update({ copied_count: sourceWish.copied_count + 1 })
    .eq("id", sourceWish.id);
}

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
}
