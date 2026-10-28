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

/**
 * Deletes the file and its library entry. A photo that posts still show only
 * goes when the admin confirmed deleting those posts too (their captions,
 * votes, and logs cascade), so no post is ever left pointing at a missing file.
 */
export async function deleteImage(id: string, withPosts: number): Promise<ImageResult> {
  const admin = await adminOrNull();
  if (!admin) return { ok: false, message: "Superadmins only." };
  if (!UUID.test(id)) return { ok: false, message: "Unknown image." };

  const { data: image } = await admin.supabase.from("images").select("storage_path").eq("id", id).maybeSingle();
  if (!image) return { ok: false, message: "That image was already deleted." };
  const { data: posts } = await admin.supabase.from("generations").select("id").eq("image_path", image.storage_path);
  const used = posts?.length ?? 0;
  if (used !== withPosts) {
    // Something changed since the page loaded; make the admin confirm what will actually happen.
    return {
      ok: false,
      message: `This image is now in ${used} ${used === 1 ? "post" : "posts"}. Refresh the page and try again.`,
    };
  }

  if (used > 0) {
    const { error: postsError } = await admin.supabase
      .from("generations")
      .delete()
      .in("id", posts!.map((p) => p.id));
    if (postsError) return { ok: false, message: `Couldn't delete its posts: ${postsError.message}` };
  }

  const { error: storageError } = await admin.supabase.storage.from(BUCKET).remove([image.storage_path]);
  if (storageError) return { ok: false, message: `Couldn't delete the file: ${storageError.message}` };
  // Member uploads leave the library with their post (a database trigger); library images go here.
  const { error } = await admin.supabase.from("images").delete().eq("id", id);
  if (error) return { ok: false, message: error.message };

  revalidatePath("/images");
  revalidatePath("/media");
  revalidatePath("/");
  return { ok: true, message: used > 0 ? `Deleted the image and ${used} ${used === 1 ? "post" : "posts"}.` : "Deleted." };
}
