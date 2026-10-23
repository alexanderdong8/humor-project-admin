import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** POST only, so a link or prefetch can't sign anyone out. */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  // Local scope: leave the member's Punchline sessions on other devices alone.
  await supabase.auth.signOut({ scope: "local" });
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
