"use server";

import { revalidatePath } from "next/cache";
import { adminOrNull } from "@/lib/admin";

/** Saves the daily meme's mix through admin_set_chain_mix(), which checks it adds up to 4. */
export async function saveMix(mix: Record<string, number>): Promise<{ ok: boolean; message: string }> {
  const admin = await adminOrNull();
  if (!admin) return { ok: false, message: "Superadmins only." };
  const clean = Object.fromEntries(
    Object.entries(mix)
      .filter(([slug]) => /^[a-z0-9-]{2,60}$/.test(slug))
      .map(([slug, n]) => [slug, Math.max(0, Math.min(4, Math.round(Number(n) || 0)))]),
  );
  const { error } = await admin.supabase.rpc("admin_set_chain_mix", { p_mix: clean });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/chains");
  return { ok: true, message: "Saved. Tonight's daily meme will use this mix." };
}
