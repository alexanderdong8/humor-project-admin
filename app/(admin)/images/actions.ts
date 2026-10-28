"use server";

import { revalidatePath } from "next/cache";
import { adminOrNull } from "@/lib/admin";

const BUCKET = "caption-photos";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ImageResult = { ok: boolean; message?: string };

function cleanDescription(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 300) || null;
}

/**
 * Step 2 of an upload: the browser has put the file in the admin's own folder
 * of the bucket; this records it in the image library.
 */
export async function registerImage(path: string, description: string): Promise<ImageResult> {
  const admin = await adminOrNull();
  if (!admin) return { ok: false, message: "Superadmins only." };
  if (!new RegExp(`^${admin.user.id}/library-[0-9a-f-]{36}\\.(jpg|png|webp)$`).test(path)) {
    return { ok: false, message: "That upload path isn't valid." };
  }
  const publicUrl = admin.supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  const { error } = await admin.supabase.from("images").insert({
    storage_path: path,
    public_url: publicUrl,
    description: cleanDescription(description),
    source: "library",
    uploaded_by: admin.user.id,
  });
  if (error) {
    await admin.supabase.storage.from(BUCKET).remove([path]);
    return { ok: false, message: error.message };
  }
  revalidatePath("/images");
  return { ok: true, message: "Uploaded." };
}

export async function updateImage(id: string, description: string): Promise<ImageResult> {
  const admin = await adminOrNull();
  if (!admin) return { ok: false, message: "Superadmins only." };
  if (!UUID.test(id)) return { ok: false, message: "Unknown image." };
  const { data, error } = await admin.supabase
    .from("images")
    .update({ description: cleanDescription(description) })
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, message: error.message };
  if (!data?.length) return { ok: false, message: "That image no longer exists." };
  revalidatePath("/images");
  return { ok: true, message: "Saved." };
}

/** Deletes the file and its library entry, unless a post still shows it. */
export async function deleteImage(id: string): Promise<ImageResult> {
  const admin = await adminOrNull();
  if (!admin) return { ok: false, message: "Superadmins only." };
  if (!UUID.test(id)) return { ok: false, message: "Unknown image." };

  const { data: image } = await admin.supabase.from("images").select("storage_path").eq("id", id).maybeSingle();
  if (!image) return { ok: false, message: "That image was already deleted." };
  const { count } = await admin.supabase
    .from("generations")
    .select("id", { count: "exact", head: true })
    .eq("image_path", image.storage_path);
  if (count) {
    return { ok: false, message: `${count} ${count === 1 ? "post uses" : "posts use"} this image. Delete ${count === 1 ? "it" : "them"} in AI media first.` };
  }

  const { error: storageError } = await admin.supabase.storage.from(BUCKET).remove([image.storage_path]);
  if (storageError) return { ok: false, message: `Couldn't delete the file: ${storageError.message}` };
  const { error } = await admin.supabase.from("images").delete().eq("id", id);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/images");
  return { ok: true, message: "Deleted." };
}
