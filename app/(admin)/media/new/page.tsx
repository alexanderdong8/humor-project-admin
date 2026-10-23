import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { newYorkDate } from "@/lib/format";
import { VOICES } from "@/lib/voices";
import { CreateForm, type Template } from "./create-form";
import ui from "@/components/ui.module.css";

export const metadata: Metadata = { title: "Create AI media" };

// Caption writing can fall back across Gemini models; give its server action room.
export const maxDuration = 120;

/** Imgflip's 100 most-captioned meme templates (cached for a day). */
async function getTemplates(): Promise<Template[]> {
  try {
    const res = await fetch("https://api.imgflip.com/get_memes", { next: { revalidate: 86_400 } });
    const body = (await res.json()) as { success: boolean; data?: { memes: Template[] } };
    return body.success ? (body.data?.memes ?? []).filter((m) => /^https:\/\/i\.imgflip\.com\//.test(m.url)) : [];
  } catch {
    return [];
  }
}

export default async function NewMediaPage() {
  const { supabase, user } = await requireAdmin();
  const [templates, { data: theme }] = await Promise.all([
    getTemplates(),
    supabase.from("daily_themes").select("theme").eq("day", newYorkDate()).maybeSingle(),
  ]);

  return (
    <>
      <Link href="/media" className={ui.back}>
        ← All media
      </Link>
      <header className={ui.head}>
        <div>
          <p className={ui.kicker}>AI media · create</p>
          <h1 className={ui.title}>Create AI media</h1>
          <p className={ui.lede}>
            Pick an image, let Gemini write four captions with the same prompt members get, then choose the one that
            goes on the photo. Published media shows up in Punchline&apos;s Vote and leaderboard like any upload.
          </p>
        </div>
      </header>
      <CreateForm
        userId={user.id}
        templates={templates}
        defaultTheme={theme?.theme ?? ""}
        defaultAuthor="Punchline AI"
        voices={Object.entries(VOICES).map(([value, v]) => ({ value, label: `${v.emoji} ${v.label}`, example: v.example }))}
      />
    </>
  );
}
