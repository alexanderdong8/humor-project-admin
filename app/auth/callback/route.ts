import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Google → Supabase → here with a one-time `code`. Trading it for a session
 * sets the auth cookies; the proxy then decides between the dashboard and
 * /denied based on profiles.is_superadmin.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  if (!code) {
    // A brand-new Google account that isn't on the sign-up allowlist is refused by the database.
    const notAllowed = /saving new user|signup_not_allowed/i.test(searchParams.get("error_description") ?? "");
    return NextResponse.redirect(`${origin}/login?error=${notAllowed ? "not_allowed" : "signin_failed"}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("[auth/callback] code exchange failed", error.message);
    return NextResponse.redirect(`${origin}/login?error=signin_failed`);
  }
  return NextResponse.redirect(`${origin}/`);
}
