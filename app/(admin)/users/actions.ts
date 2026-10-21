"use server";

import { revalidatePath } from "next/cache";
import { adminOrNull } from "@/lib/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Promotes a member to superadmin or removes it, through
 * admin_set_superadmin(), which re-checks the caller in the database and
 * refuses to let anyone remove their own access.
 */
export async function setSuperadmin(userId: string, value: boolean): Promise<{ ok: boolean; message?: string }> {
  const admin = await adminOrNull();
  if (!admin) return { ok: false, message: "Superadmins only." };
  if (!UUID.test(userId)) return { ok: false, message: "Unknown member." };

  const { error } = await admin.supabase.rpc("admin_set_superadmin", { p_user: userId, p_value: value });
  if (error) return { ok: false, message: error.message };

  revalidatePath("/users");
  revalidatePath(`/users/${userId}`);
  revalidatePath("/");
  return { ok: true };
}
