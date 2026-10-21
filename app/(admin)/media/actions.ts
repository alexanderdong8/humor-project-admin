"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CaptionWriterError, writeCaptions } from "@/lib/ai/caption-writer";
import { fetchImage, isAllowedImageUrl } from "@/lib/ai/fetch-image";
import { adminOrNull } from "@/lib/admin";
import { supabaseUrl } from "@/lib/supabase/env";
import { isVoice } from "@/lib/voices";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STORAGE_PREFIX = `${supabaseUrl}/storage/v1/object/public/caption-photos/`;

export type ActionState = { status: "idle" | "ok" | "error"; message?: string };

function text(formData: FormData, key: string, max = 280) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/**
 * Where the image lives, derived on the server rather than trusted from the
 * form: our caption-photos bucket (stored by path) or an Imgflip template.
 */
function imagePathFor(url: string) {
  if (url.startsWith(STORAGE_PREFIX)) {
    const path = decodeURIComponent(url.slice(STORAGE_PREFIX.length));
    return /^[0-9a-f-]{36}\/[\w.-]+$/i.test(path) ? path : null;
  }
  const imgflip = url.match(/^https:\/\/i\.imgflip\.com\/(\w+)\.(?:jpg|jpeg|png)$/i);
  return imgflip ? `imgflip:${imgflip[1]}` : null;
}

/** Step 2 of creating media: Gemini writes four captions for the chosen image. */
export async function generateCaptions(input: {
  imageUrl: string;
  voice: string;
  theme: string;
  templateName?: string;
}): Promise<{ ok: true; captions: string[]; prompt: string; model: string } | { ok: false; error: string }> {
  if (!(await adminOrNull())) return { ok: false, error: "Superadmins only." };
  if (!isVoice(input.voice)) return { ok: false, error: "Pick a caption style." };
  if (!isAllowedImageUrl(input.imageUrl) || !imagePathFor(input.imageUrl)) {
    return { ok: false, error: "That image isn't from an allowed source." };
  }

  try {
    const image = await fetchImage(input.imageUrl);
    const name = input.templateName?.replace(/[^\w\s'’.,!?&-]/g, "").slice(0, 80);
    const result = await writeCaptions({
      image,
      voice: input.voice,
      theme: input.theme.slice(0, 120) || null,
      context: name
        ? `The image is the "${name}" meme template. Write captions the way this meme is usually captioned.`
        : undefined,
    });
    return { ok: true, ...result };
  } catch (error) {
    if (error instanceof CaptionWriterError) return { ok: false, error: error.userMessage };
    console.error("[admin] generateCaptions failed", error);
    return { ok: false, error: "Couldn't read that image. Try another one." };
  }
}

/** Creates a post through admin_create_generation (superadmin check happens in the database too). */
export async function createMedia(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await adminOrNull();
  if (!admin) return { status: "error", message: "Superadmins only." };

  const imageUrl = text(formData, "imageUrl", 600);
  const imagePath = imagePathFor(imageUrl);
  if (!imagePath || !isAllowedImageUrl(imageUrl)) return { status: "error", message: "Choose an image first." };
  const voice = text(formData, "voice");
  if (!isVoice(voice)) return { status: "error", message: "Pick a caption style." };

  const captions = [0, 1, 2, 3].map((i) => text(formData, `caption${i}`)).filter(Boolean);
  if (captions.length === 0) return { status: "error", message: "Write or generate at least one caption." };
  const chosenRaw = Number(formData.get("chosen"));
  // The radio index refers to the four boxes; map it onto the non-empty ones.
  const boxes = [0, 1, 2, 3].map((i) => text(formData, `caption${i}`));
  if (!Number.isInteger(chosenRaw) || !boxes[chosenRaw]) {
    return { status: "error", message: "Pick which caption goes on the photo." };
  }
  const chosen = boxes.slice(0, chosenRaw + 1).filter(Boolean).length;

  const aiPrompt = text(formData, "prompt", 20_000);
  const aiModel = text(formData, "model", 80);
  const isImgflip = imagePath.startsWith("imgflip:");
  const templateName = text(formData, "templateName", 80);

  const { data: id, error } = await admin.supabase.rpc("admin_create_generation", {
    p_image_url: imageUrl,
    p_image_path: imagePath,
    p_theme: text(formData, "theme", 120),
    p_voice: voice,
    p_author_name: text(formData, "author", 60),
    p_captions: captions,
    p_chosen: chosen,
    p_publish: formData.get("publish") === "on",
    p_prompt: aiPrompt || "Captions written by hand in Punchline Backstage.",
    p_model: aiModel || "manual",
    p_photo_credit: isImgflip && templateName ? `“${templateName}” meme template · via Imgflip` : null,
    p_photo_source_url: isImgflip ? "https://imgflip.com/memetemplates" : null,
  });
  if (error || typeof id !== "string") {
    console.error("[admin] createMedia failed", error);
    return { status: "error", message: error?.message ?? "Couldn't save." };
  }

  revalidatePath("/media");
  revalidatePath("/");
  redirect(`/media/${id}?created=1`);
}

export async function updateMedia(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await adminOrNull();
  if (!admin) return { status: "error", message: "Superadmins only." };
  if (!UUID.test(id)) return { status: "error", message: "Unknown post." };

  const voice = text(formData, "voice");
  const captionId = text(formData, "captionId", 36);
  const { error } = await admin.supabase.rpc("admin_update_generation", {
    p_id: id,
    p_theme: text(formData, "theme", 120),
    p_voice: isVoice(voice) ? voice : null,
    p_author_name: text(formData, "author", 60),
    p_caption_id: UUID.test(captionId) ? captionId : null,
    p_publish: formData.get("publish") === "on",
  });
  if (error) return { status: "error", message: error.message };

  revalidatePath(`/media/${id}`);
  revalidatePath("/media");
  return { status: "ok", message: "Saved." };
}

export async function updateCaption(captionId: string, mediaId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await adminOrNull();
  if (!admin) return { status: "error", message: "Superadmins only." };
  if (!UUID.test(captionId)) return { status: "error", message: "Unknown caption." };
  const value = text(formData, "text");
  if (!value) return { status: "error", message: "A caption can't be empty." };

  const { error } = await admin.supabase.rpc("admin_update_caption", { p_id: captionId, p_text: value });
  if (error) return { status: "error", message: error.message };

  revalidatePath(`/media/${mediaId}`);
  return { status: "ok", message: "Saved." };
}

/** Deletes the post (captions, votes, and remixes cascade) and its uploaded photo. */
export async function deleteMedia(id: string): Promise<ActionState> {
  const admin = await adminOrNull();
  if (!admin) return { status: "error", message: "Superadmins only." };
  if (!UUID.test(id)) return { status: "error", message: "Unknown post." };

  const { data: post } = await admin.supabase.from("generations").select("image_path").eq("id", id).maybeSingle();
  if (!post) return { status: "error", message: "That post is already gone." };

  const { data: deleted, error } = await admin.supabase.from("generations").delete().eq("id", id).select("id");
  if (error || !deleted?.length) return { status: "error", message: error?.message ?? "Couldn't delete." };

  // Photos uploaded to our bucket are stored by path; template and stock images aren't ours to delete.
  if (post.image_path && !post.image_path.includes(":")) {
    const { error: storageError } = await admin.supabase.storage.from("caption-photos").remove([post.image_path]);
    if (storageError) console.error("[admin] photo cleanup failed", storageError);
  }

  revalidatePath("/media");
  revalidatePath("/");
  redirect("/media?deleted=1");
}
