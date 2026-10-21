/** The caption styles of the main app (kept in sync with its lib/battle.ts). */
export const VOICES = {
  groupchat: {
    emoji: "💬",
    label: "Group chat",
    example: "not the pigeon commuting better than me",
    prompt:
      "Casual Gen Z group-chat energy. Mostly lowercase, internet slang used naturally (not in every line), reads like a viral post caption. At most one emoji across all four captions.",
  },
  sarcastic: {
    emoji: "🙄",
    label: "Sarcastic",
    example: "Ah yes, another “quick” ride on the 1 train.",
    prompt:
      "Dry, sarcastic, and unimpressed, like a lifelong New Yorker who has seen it all. Understated, a little put-upon; rent, the MTA, tourists, and slow walkers are fair game.",
  },
  wholesome: {
    emoji: "🥹",
    label: "Wholesome",
    example: "This little guy is doing his best, and honestly, so am I.",
    prompt:
      "Warm, wholesome, and a little goofy. Earnest and kind, like a friendly kid from the Midwest who's delighted by everything in the big city. No sarcasm.",
  },
  dramatic: {
    emoji: "🎭",
    label: "Dramatic",
    example: "I have never been more betrayed than by this dining hall pizza.",
    prompt:
      "Wildly over the top and theatrical. Treat small, everyday things like epic tragedies or historic triumphs. Big words, bigger feelings.",
  },
} as const;

export type VoiceId = keyof typeof VOICES;

export function isVoice(value: unknown): value is VoiceId {
  return typeof value === "string" && value in VOICES;
}

export function voiceLabel(id: string | null) {
  return id && isVoice(id) ? `${VOICES[id].emoji} ${VOICES[id].label}` : (id ?? "—");
}

export const MOODS: Record<string, string> = {
  meaner: "😈 Meaner",
  funnier: "😂 Funnier",
  relatable: "🫠 Relatable",
};
