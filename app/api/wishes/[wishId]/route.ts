import { NextRequest, NextResponse } from "next/server";
import type { Tables, TablesUpdate } from "@/lib/database.types";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type WishRow = Tables<"wishes">;
type WishStatus = "active" | "completed" | "archived";
type WishVisibility = "private" | "public" | "team" | "contacts";

type WishPatchBody = {
  title?: unknown;
  description?: unknown;
  category?: unknown;
  imageUrl?: unknown;
  image_url?: unknown;
  targetAmount?: unknown;
  target_amount?: unknown;
  targetCurrency?: unknown;
  target_currency?: unknown;
  difficultyLevel?: unknown;
  difficulty_level?: unknown;
  visibility?: unknown;
  status?: unknown;
};

export async function GET(request: NextRequest, { params }: { params: { wishId: string } }) {
  try {
    const wishId = normalizeUuid(params.wishId);
    if (!wishId) {
      return NextResponse.json({ error: "Invalid wish id." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const { data: wish, error: wishError } = await supabase
      .from("wishes")
      .select("*")
      .eq("id", wishId)
      .is("deleted_at", null)
      .maybeSingle();

    if (wishError) return NextResponse.json({ error: wishError.message }, { status: 500, headers: NO_STORE_HEADERS });
    if (!wish || !canReadWish(wish as WishRow, user.id)) {
      return NextResponse.json({ error: "Wish not found." }, { status: 404, headers: NO_STORE_HEADERS });
    }

    return NextResponse.json({ wish }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to load wish." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { wishId: string } }) {
  try {
    const wishId = normalizeUuid(params.wishId);
    if (!wishId) {
      return NextResponse.json({ error: "Invalid wish id." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const { data: currentWish, error: currentError } = await supabase
      .from("wishes")
      .select("*")
      .eq("id", wishId)
      .eq("owner_user_id", user.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (currentError) return NextResponse.json({ error: currentError.message }, { status: 500, headers: NO_STORE_HEADERS });
    if (!currentWish) return NextResponse.json({ error: "Wish not found." }, { status: 404, headers: NO_STORE_HEADERS });

    const body = await readJsonBody(request);
    const patch = normalizePatch(body, currentWish as WishRow);
    if (!patch) {
      return NextResponse.json({ error: "Wish title is required." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const { data, error: updateError } = await supabase
      .from("wishes")
      .update(patch)
      .eq("id", wishId)
      .eq("owner_user_id", user.id)
      .is("deleted_at", null)
      .select("*")
      .single();

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500, headers: NO_STORE_HEADERS });

    return NextResponse.json({ wish: data }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to update wish." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { wishId: string } }) {
  try {
    const wishId = normalizeUuid(params.wishId);
    if (!wishId) {
      return NextResponse.json({ error: "Invalid wish id." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const { data, error: deleteError } = await supabase
      .from("wishes")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", wishId)
      .eq("owner_user_id", user.id)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();

    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500, headers: NO_STORE_HEADERS });
    if (!data) return NextResponse.json({ error: "Wish not found." }, { status: 404, headers: NO_STORE_HEADERS });

    return NextResponse.json({ deletedWishId: wishId }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to delete wish." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

function canReadWish(wish: WishRow, viewerUserId: string): boolean {
  if (wish.owner_user_id === viewerUserId) return true;
  return wish.visibility === "public" && (wish.status === "active" || wish.status === "completed");
}

function normalizePatch(body: WishPatchBody, currentWish: WishRow): TablesUpdate<"wishes"> | null {
  const title = normalizeRequiredText(body.title, 120);
  if (body.title !== undefined && !title) return null;

  const nextStatus = body.status === undefined ? currentWish.status : normalizeStatus(body.status);
  const patch: TablesUpdate<"wishes"> = {};

  if (title !== null) patch.title = title;
  if (body.description !== undefined) patch.description = normalizeText(body.description, 1200) ?? "";
  if (body.category !== undefined) patch.category = normalizeText(body.category, 80);
  if (body.imageUrl !== undefined || body.image_url !== undefined) patch.image_url = normalizeText(body.imageUrl ?? body.image_url, 900);
  if (body.targetAmount !== undefined || body.target_amount !== undefined) patch.target_amount = normalizeAmount(body.targetAmount ?? body.target_amount);
  if (body.targetCurrency !== undefined || body.target_currency !== undefined) patch.target_currency = normalizeCurrency(body.targetCurrency ?? body.target_currency);
  if (body.difficultyLevel !== undefined || body.difficulty_level !== undefined) patch.difficulty_level = normalizeDifficulty(body.difficultyLevel ?? body.difficulty_level);
  if (body.visibility !== undefined) patch.visibility = normalizeVisibility(body.visibility);
  if (body.status !== undefined) {
    patch.status = nextStatus;
    if (nextStatus === "completed" && !currentWish.completed_at) patch.completed_at = new Date().toISOString();
    if (nextStatus !== "completed") patch.completed_at = null;
  }

  return patch;
}

function normalizeStatus(value: unknown): WishStatus {
  if (value === "completed" || value === "archived") return value;
  return "active";
}

function normalizeVisibility(value: unknown): WishVisibility {
  if (value === "public" || value === "team" || value === "contacts") return value;
  return "private";
}

function normalizeRequiredText(value: unknown, maxLength: number): string | null {
  const text = normalizeText(value, maxLength);
  return text && text.length > 0 ? text : null;
}

function normalizeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function normalizeAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.round(numeric * 100) / 100;
}

function normalizeCurrency(value: unknown): string {
  const text = normalizeText(value, 8);
  return text ? text.toUpperCase() : "USD";
}

function normalizeDifficulty(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.max(1, Math.round(numeric));
}

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value) ? value : null;
}

async function readJsonBody(request: NextRequest): Promise<WishPatchBody> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body : {};
  } catch {
    return {};
  }
}
