import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "Supabase environment variables are missing." }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false
    }
  });

  const { data, error } = await supabase
    .from("challenges")
    .select("id,title,description,instructions,requirements,reward_label,category,difficulty_level,duration_days,image_url,verification_type,verification_logic,sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("difficulty_level", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { challenges: data },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
