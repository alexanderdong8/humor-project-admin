import type { SupabaseClient } from "@supabase/supabase-js";
import { VOICES, type VoiceId } from "@/lib/voices";

/**
 * The caption pipeline's settings live in the database and are managed in
 * Backstage (this app): prompt chain steps per style, example
 * captions, local terms, and which models to call in what order. Everything
 * is read and logged through security-definer functions (supabase/pipeline.sql).
 * Kept in sync with the main app's lib/ai/pipeline.ts.
 */

/** Calls a database function by name with named arguments. */
export type PipelineDb = { rpc(fn: string, args: Record<string, unknown>): Promise<unknown> };

export function supabaseDb(supabase: SupabaseClient): PipelineDb {
  return {
    async rpc(fn, args) {
      const { data, error } = await supabase.rpc(fn, args);
      if (error) throw new Error(`${fn}: ${error.message}`);
      return data;
    },
  };
}

export type ChainStep = { position: number; name: string; role: "system" | "user"; template: string };
export type PipelineModel = { api_model_id: string; provider: string; temperature: number; supports_images: boolean };

export type PipelineConfig = {
  chain: string;
  steps: ChainStep[];
  examples: string[];
  terms: { term: string; definition: string }[];
  models: PipelineModel[];
  /** False when the database couldn't be read and the built-in defaults were used. */
  fromDatabase: boolean;
};

/** Providers this code knows how to call. Other providers can be listed in Backstage but are skipped. */
const SUPPORTED_PROVIDERS = new Set(["google"]);

export const DEFAULT_MODELS = ["gemini-3.5-flash", "gemini-3.8-flash", "gemini-3.5-flash-lite"];

export const SYSTEM_PROMPT = `You write captions for Punchline, a comedy site where college students in New York post photos and vote on the funniest caption.

Audience: Columbia undergrads who are chronically online, many of them new to New York, living in the dorms and exploring the city on weekends. Campus life, the subway, bodegas, dorms, dining halls, and being new to the city all land well.

Write exactly the number of captions requested, all in the requested style. Each caption:
- reacts to what is actually in the photo; specific details beat generic jokes
- takes a different angle from the others (an observation, an exaggeration, a relatable confession, an absurd twist)
- is one or two short sentences, under 120 characters
- stands on its own: no numbering, surrounding quotation marks, or hashtags

Keep it PG-13 and punch up, never down. Don't joke about anyone's body, looks, race, ethnicity, religion, gender, sexuality, disability, or age, and don't identify or guess who real people in the photo are. If people are in the photo, joke about the situation, not the person.`;

export const chainFor = (voice: VoiceId) => `caption-${voice}`;

/** The same steps the database is seeded with, for when it can't be reached. */
export function defaultConfig(voice: VoiceId): PipelineConfig {
  const style = VOICES[voice];
  return {
    chain: chainFor(voice),
    steps: [
      { position: 1, name: "Ground rules", role: "system", template: SYSTEM_PROMPT },
      { position: 2, name: "Task", role: "user", template: "Write {{count}} captions." },
      { position: 3, name: "Image context", role: "user", template: "{{context}}" },
      { position: 4, name: "Style", role: "user", template: `Style: ${style.label}. ${style.prompt}` },
      {
        position: 5,
        name: "Examples",
        role: "user",
        template: "For flavor, examples in this style (don't reuse them or their jokes):\n{{examples}}",
      },
      { position: 6, name: "Theme", role: "user", template: "{{theme_instruction}}" },
    ],
    examples: [style.example],
    terms: [],
    models: DEFAULT_MODELS.map((api_model_id) => ({
      api_model_id,
      provider: "google",
      temperature: 1,
      supports_images: true,
    })),
    fromDatabase: false,
  };
}

/** Loads one style's chain from the database, falling back to the built-in defaults. */
export async function loadConfig(db: PipelineDb | undefined, voice: VoiceId): Promise<PipelineConfig> {
  const fallback = defaultConfig(voice);
  if (!db) return fallback;
  try {
    const data = (await db.rpc("caption_pipeline", { p_chain: chainFor(voice) })) as {
      chain: { slug: string } | null;
      steps: ChainStep[];
      examples: string[];
      terms: { term: string; definition: string }[];
      models: PipelineModel[];
    } | null;
    if (!data?.chain || data.steps.length === 0) return fallback;
    const models = data.models.filter((m) => SUPPORTED_PROVIDERS.has(m.provider) && m.supports_images);
    if (models.length === 0) console.warn("[pipeline] no usable active models; using the built-in list");
    return {
      chain: data.chain.slug,
      steps: data.steps,
      examples: data.examples,
      terms: data.terms,
      models: models.length > 0 ? models.map((m) => ({ ...m, temperature: Number(m.temperature) })) : fallback.models,
      fromDatabase: true,
    };
  } catch (error) {
    console.warn("[pipeline] couldn't load settings; using built-in defaults", error);
    return fallback;
  }
}

/**
 * Fills a chain's step templates. A step is left out when any placeholder in
 * it has no value (no theme, no examples, no terms...).
 */
export function renderPrompt(steps: ChainStep[], vars: Record<string, string>) {
  const rendered = steps
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((step) => {
      let missing = false;
      const text = step.template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
        const value = vars[key]?.trim();
        if (!value) missing = true;
        return value ?? "";
      });
      return missing ? null : { role: step.role, text: text.trim() };
    })
    .filter((s): s is { role: "system" | "user"; text: string } => Boolean(s?.text));
  return {
    system: rendered.filter((s) => s.role === "system").map((s) => s.text).join("\n\n"),
    user: rendered.filter((s) => s.role === "user").map((s) => s.text),
  };
}

/** Logging never gets in the way of writing captions. */
export async function quietly<T>(work: () => Promise<T>): Promise<T | null> {
  try {
    return await work();
  } catch (error) {
    console.warn("[pipeline] logging failed", error);
    return null;
  }
}
