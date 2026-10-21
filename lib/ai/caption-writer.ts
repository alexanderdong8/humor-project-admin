import { ApiError, GoogleGenAI } from "@google/genai";
import { VOICES, type VoiceId } from "@/lib/voices";

/** Tried in order: if one model is overloaded or rate limited, the next one takes the job. */
export const MODELS = ["gemini-3.5-flash", "gemini-3.8-flash", "gemini-3.5-flash-lite"];

const SYSTEM_PROMPT = `You write captions for Punchline, a comedy site where college students in New York post photos and vote on the funniest caption.

Audience: Columbia undergrads who are chronically online, many of them new to New York, living in the dorms and exploring the city on weekends. Campus life, the subway, bodegas, dorms, dining halls, and being new to the city all land well.

Write exactly the number of captions requested, all in the requested style. Each caption:
- reacts to what is actually in the photo; specific details beat generic jokes
- takes a different angle from the others (an observation, an exaggeration, a relatable confession, an absurd twist)
- is one or two short sentences, under 120 characters
- stands on its own: no numbering, surrounding quotation marks, or hashtags

Keep it PG-13 and punch up, never down. Don't joke about anyone's body, looks, race, ethnicity, religion, gender, sexuality, disability, or age, and don't identify or guess who real people in the photo are. If people are in the photo, joke about the situation, not the person.`;

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
};

function userInstructions({ voice, theme, context, count }: Omit<Input, "image"> & { count: number }) {
  const style = VOICES[voice];
  const lines = [
    `Write ${count} captions.`,
    ...(context ? [context] : []),
    `Style: ${style.label}. ${style.prompt}`,
    `For flavor, an example in this style (don't reuse it): "${style.example}"`,
    theme
      ? `Theme: "${theme}". Lean into it if the photo fits; never force it.`
      : "There's no theme; caption whatever is in the photo.",
  ];
  return lines.join("\n");
}

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
 * Writes captions for a photo with Google Gemini, using the same prompt as the
 * main app. Returns them with the exact text prompt that was sent (the photo
 * is stored separately) and the model that answered, so both can be saved.
 */
export async function writeCaptions({ image, count = 4, ...rest }: Input) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new CaptionWriterError("GEMINI_API_KEY is not set", "Our caption writer is offline right now.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const instructions = userInstructions({ ...rest, count });
  let lastError: unknown;

  for (const model of MODELS) {
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
          systemInstruction: SYSTEM_PROMPT,
          responseMimeType: "application/json",
          responseJsonSchema: responseSchema(count),
          temperature: 1,
        },
      });

      if (response.promptFeedback?.blockReason) {
        throw new CaptionWriterError(
          `prompt blocked: ${response.promptFeedback.blockReason}`,
          "We can't caption that photo. Try a different one.",
        );
      }

      const captions = parseCaptions(response.text, count);
      if (captions.length === 0) {
        lastError = new Error(`${model} returned no captions`);
        continue;
      }

      return {
        captions,
        model,
        prompt: `[system]\n${SYSTEM_PROMPT}\n\n[user]\n<photo>\n${instructions}`,
      };
    } catch (error) {
      if (error instanceof CaptionWriterError) throw error;
      lastError = error;
      // Overloaded or rate limited: try the next model. Anything else is not going to get better.
      if (error instanceof ApiError && (error.status === 429 || error.status >= 500)) continue;
      break;
    }
  }

  console.error("[caption-writer] all models failed", lastError);
  if (lastError instanceof ApiError && lastError.status === 429) {
    throw new CaptionWriterError("rate limited", "Gemini is rate limiting us. Try again in a minute.");
  }
  throw new CaptionWriterError(String(lastError), "Our caption writer is having a moment. Please try again.");
}
