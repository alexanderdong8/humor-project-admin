import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AdminProfile = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  is_superadmin: boolean;
};

/**
 * The authoritative check for every admin page and server action: a Google
 * session whose profile has is_superadmin = true. Anyone else is sent away.
 * (The proxy already did this; RLS enforces it again in the database.)
 */
export const requireAdmin = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, first_name, last_name, avatar_url, is_superadmin")
    .eq("id", user.id)
    .maybeSingle<AdminProfile>();
  if (!profile?.is_superadmin) redirect("/denied");

  return { supabase, user, profile };
});

/** For server actions: same check, but returns null instead of redirecting mid-action. */
export async function adminOrNull() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("is_superadmin").eq("id", user.id).maybeSingle();
  return data?.is_superadmin === true ? { supabase, user } : null;
}

export function fullName(p: { first_name: string | null; last_name: string | null; email?: string | null }) {
  return [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email || "Unnamed member";
}
