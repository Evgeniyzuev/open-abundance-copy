import { NextRequest, NextResponse } from "next/server";
import type { TablesInsert } from "@/lib/database.types";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type WishStatus = "active" | "completed" | "archived";
type WishVisibility = "private" | "public" | "team" | "contacts";

type WishPostBody = {
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
  sourceRecommendedWishId?: unknown;
  source_recommended_wish_id?: unknown;
};

export async function GET(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const { searchParams } = new URL(request.url);
    const status = normalizeStatusParam(searchParams.get("status"));
    const includeRecommended = searchParams.get("includeRecommended") !== "false";

    let wishesQuery = supabase
      .from("wishes")
      .select("*")
      .eq("owner_user_id", user.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (status === "all") {
      wishesQuery = wishesQuery.in("status", ["active", "completed", "archived"]);
    } else {
      wishesQuery = wishesQuery.eq("status", status);
    }

    const [wishesResult, recommendedResult] = await Promise.all([
      wishesQuery,
      includeRecommended
        ? supabase
          .from("recommended_wishes")
          .select("id,title,description,image_url,category,estimated_cost,difficulty_level")
          .order("difficulty_level", { ascending: true })
        : Promise.resolve({ data: [], error: null })
    ]);

    if (wishesResult.error) {
      return NextResponse.json({ error: wishesResult.error.message }, { status: 500, headers: NO_STORE_HEADERS });
    }

    if (recommendedResult.error) {
      return NextResponse.json({ error: recommendedResult.error.message }, { status: 500, headers: NO_STORE_HEADERS });
    }

    return NextResponse.json(
      {
        wishes: wishesResult.data ?? [],
        recommendedWishes: recommendedResult.data ?? []
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to load wishes." },
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
    const title = normalizeRequiredText(body.title, 120);
    if (!title) {
      return NextResponse.json({ error: "Wish title is required." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const row: TablesInsert<"wishes"> = {
      owner_user_id: user.id,
      title,
      description: normalizeText(body.description, 1200) ?? "",
      category: normalizeText(body.category, 80),
      image_url: normalizeText(body.imageUrl ?? body.image_url, 900),
      target_amount: normalizeAmount(body.targetAmount ?? body.target_amount),
      target_currency: normalizeCurrency(body.targetCurrency ?? body.target_currency),
      difficulty_level: normalizeDifficulty(body.difficultyLevel ?? body.difficulty_level),
      visibility: normalizeVisibility(body.visibility),
      source_recommended_wish_id: normalizeUuid(body.sourceRecommendedWishId ?? body.source_recommended_wish_id)
    };

    const { data, error: insertError } = await supabase
      .from("wishes")
      .insert(row)
      .select("*")
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500, headers: NO_STORE_HEADERS });
    }

    return NextResponse.json({ wish: data }, { status: 201, headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to create wish." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

function normalizeStatusParam(value: string | null): WishStatus | "all" {
  if (value === "completed" || value === "archived" || value === "all") return value;
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

async function readJsonBody(request: NextRequest): Promise<WishPostBody> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body : {};
  } catch {
    return {};
  }
}
