import { ApiError, GoogleGenAI } from "@google/genai";
import type { VoiceId } from "@/lib/voices";
import { loadConfig, quietly, renderPrompt, type PipelineDb } from "@/lib/ai/pipeline";

function responseSchema(count: number) {
  return {
    type: "object",
    properties: {
      captions: { type: "array", items: { type: "string" }, minItems: count, maxItems: count },
    },
    required: ["captions"],
  };
}

export class CaptionWriterError extends Error {
  constructor(
    message: string,
    readonly userMessage: string,
  ) {
    super(message);
  }
}

export type CaptionImage = { data: string; mediaType: "image/jpeg" | "image/png" | "image/webp" };

type Input = {
  image: CaptionImage;
  voice: VoiceId;
  theme: string | null;
  count?: number;
  /** Extra framing, e.g. which meme template the image is. */
  context?: string;
  /** Where to read the pipeline's settings from (and log to). Without it, built-in defaults are used. */
  db?: PipelineDb;
  /** Log this job as a generation request with its model calls. Needs `db`. */
  log?: { source: "upload" | "remix" | "daily" | "admin"; imageUrl?: string | null };
};

function parseCaptions(text: string | undefined, count: number) {
  let raw: unknown;
  try {
    raw = (JSON.parse(text ?? "") as { captions?: unknown }).captions;
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const cleaned = raw
    .filter((c): c is string => typeof c === "string")
    .map((c) => c.trim().replace(/^["“]|["”]$/g, "").slice(0, 280))
    .filter(Boolean);
  return [...new Set(cleaned)].slice(0, count);
}

/**
 * Writes captions for a photo with Google Gemini (the main app's caption
 * writer, minus remixes). The prompt is built from the style's
 * prompt chain, examples, and terms, and models are tried in the configured
 * order. Returns the captions with the exact text prompt that was sent (the
 * photo is stored separately), the model that answered, and the id of the
 * logged generation request.
 */
export async function writeCaptions({ image, count = 4, voice, theme, context, db, log }: Input) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new CaptionWriterError("GEMINI_API_KEY is not set", "Our caption writer is offline right now.");
  }

  const config = await loadConfig(db, voice);
  const { system, user } = renderPrompt(config.steps, {
    count: String(count),
    context: context ?? "",
    examples: config.examples.map((e) => `- ${e}`).join("\n"),
    theme_instruction: theme
      ? `Theme: "${theme}". Lean into it if the photo fits; never force it.`
      : "There's no theme; caption whatever is in the photo.",
    terms: config.terms.map((t) => `- ${t.term}: ${t.definition}`).join("\n"),
  });
  const instructions = user.join("\n");
  const prompt = `[system]\n${system}\n\n[user]\n<photo>\n${instructions}`;

  const requestId =
    db && log
      ? ((await quietly(() =>
          db.rpc("log_generation_request", {
            p_source: log.source,
            p_chain: config.chain,
            p_voice: voice,
            p_mood: null,
            p_theme: theme,
            p_image_url: log.imageUrl ?? null,
          }),
        )) as string | null)
      : null;
  const logResponse = (model: string, started: number, response: string | null, error: string | null) =>
    requestId
      ? quietly(() =>
          db!.rpc("log_llm_response", {
            p_request: requestId,
            p_model: model,
            p_prompt: prompt,
            p_response: response,
            p_status: error ? "error" : "ok",
            p_error: error,
            p_latency_ms: Date.now() - started,
          }),
        )
      : null;
  const finish = (status: "succeeded" | "failed", model: string | null, captions: number, error: string | null) =>
    requestId
      ? quietly(() =>
          db!.rpc("finish_generation_request", {
            p_id: requestId,
            p_status: status,
            p_model: model,
            p_caption_count: captions,
            p_error: error,
          }),
        )
      : null;

  const ai = new GoogleGenAI({ apiKey });
  let lastError: unknown;

  for (const { api_model_id: model, temperature } of config.models) {
    const started = Date.now();
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [{ inlineData: { mimeType: image.mediaType, data: image.data } }, { text: instructions }],
          },
        ],
        config: {
          systemInstruction: system,
          responseMimeType: "application/json",
          responseJsonSchema: responseSchema(count),
          temperature,
        },
      });

      if (response.promptFeedback?.blockReason) {
        await logResponse(model, started, null, `prompt blocked: ${response.promptFeedback.blockReason}`);
        await finish("failed", model, 0, `prompt blocked: ${response.promptFeedback.blockReason}`);
        throw new CaptionWriterError(
          `prompt blocked: ${response.promptFeedback.blockReason}`,
          "We can't caption that photo. Try a different one.",
        );
      }

      const captions = parseCaptions(response.text, count);
      if (captions.length === 0) {
        await logResponse(model, started, response.text ?? null, "no captions in the response");
        lastError = new Error(`${model} returned no captions`);
        continue;
      }

      await logResponse(model, started, response.text ?? null, null);
      await finish("succeeded", model, captions.length, null);
      return { captions, model, prompt, requestId };
    } catch (error) {
      if (error instanceof CaptionWriterError) throw error;
      await logResponse(model, started, null, error instanceof Error ? error.message : String(error));
      lastError = error;
      // Overloaded or rate limited: try the next model. Anything else is not going to get better.
      if (error instanceof ApiError && (error.status === 429 || error.status >= 500)) continue;
      break;
    }
  }

  console.error("[caption-writer] all models failed", lastError);
  await finish("failed", null, 0, lastError instanceof Error ? lastError.message : String(lastError));
  if (lastError instanceof ApiError && lastError.status === 429) {
    throw new CaptionWriterError("rate limited", "Gemini is rate limiting us. Try again in a minute.");
  }
  throw new CaptionWriterError(String(lastError), "Our caption writer is having a moment. Please try again.");
}
