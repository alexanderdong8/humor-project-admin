/** Labels shared by the request and response pages. */
export const SOURCE_LABEL: Record<string, string> = {
  upload: "📸 Upload",
  remix: "🔀 Remix",
  daily: "🤖 Daily meme",
  admin: "🎛️ Backstage",
};

/** Status as a word with an icon, never color alone. */
export function StatusPill({ status }: { status: string }) {
  if (status === "succeeded") return <span className="pill pill-good">✓ Succeeded</span>;
  if (status === "failed") return <span className="pill pill-warn">✕ Failed</span>;
  return <span className="pill">… Pending</span>;
}

/** Pretty-prints JSON responses; anything else is shown as-is. */
export function prettyResponse(text: string | null) {
  if (!text) return "(no response body)";
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}
