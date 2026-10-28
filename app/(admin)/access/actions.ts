"use server";

import { adminOrNull } from "@/lib/admin";

/** Asks the database (the same check that runs at sign-up) whether an address could create an account. */
export async function checkSignup(email: string): Promise<{ ok: boolean; allowed?: boolean; message?: string }> {
  const admin = await adminOrNull();
  if (!admin) return { ok: false, message: "Superadmins only." };
  const value = email.trim().toLowerCase().slice(0, 200);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) return { ok: false, message: "Enter a full email address." };
  const { data, error } = await admin.supabase.rpc("email_may_sign_up", { p_email: value });
  if (error) return { ok: false, message: error.message };
  return { ok: true, allowed: data === true };
}
