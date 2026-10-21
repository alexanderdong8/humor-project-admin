import type { SupabaseClient } from "@supabase/supabase-js";

/** The shape admin_stats() returns (see supabase/admin.sql). */
export type Stats = {
  today: string;
  totals: {
    members: number;
    admins: number;
    published: number;
    drafts: number;
    daily: number;
    captions: number;
    remixes: number;
    post_votes: number;
    duels: number;
    upvotes: number;
    downvotes: number;
    jokes: number;
    themes: number;
  };
  activity: { day: string; uploads: number; votes: number; signups: number }[];
  heatmap: { dow: number; hour: number; n: number }[];
  positions: { position: number; n: number }[];
  remix_winners: number;
  voices: { voice: string; posts: number; wins: number; losses: number }[];
  moods: { mood: string; remixes: number; wins: number }[];
  models: { model: string; n: number }[];
  trend_sources: { source: string; n: number }[];
  daily_memes: {
    id: string;
    day: string;
    image_url: string;
    theme: string | null;
    photo_credit: string | null;
    duels: number;
    leader: string | null;
  }[];
  caption_lengths: { id: string; words: number; wins: number; losses: number; text: string }[];
  people: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
    uploads: number;
    votes: number;
  }[];
  hall_of_fame: {
    id: string;
    image_url: string;
    author_name: string | null;
    battle_wins: number;
    battle_losses: number;
    caption: string | null;
  }[];
};

export async function getStats(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc("admin_stats");
  if (error) throw new Error(`admin_stats failed: ${error.message}`);
  return data as Stats;
}

export const TREND_SOURCES: Record<string, string> = {
  x: "X (Twitter) trends",
  "google-trends": "Google Trends",
  fallback: "Built-in rotation",
};
