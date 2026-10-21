const TZ = "America/New_York";

export function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { timeZone: TZ, month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    timeZone: TZ,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "3 min ago", "yesterday", "Oct 12". */
export function timeAgo(iso: string | null | undefined) {
  if (!iso) return "—";
  const seconds = (Date.now() - Date.parse(iso)) / 1000;
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} h ago`;
  if (seconds < 172_800) return "yesterday";
  if (seconds < 7 * 86_400) return `${Math.floor(seconds / 86_400)} days ago`;
  return formatDate(iso);
}

/** 1,284 / 12.9K / 4.2M */
export function compact(n: number) {
  return new Intl.NumberFormat("en-US", { notation: n >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(n);
}

export function plural(n: number, word: string, many = `${word}s`) {
  return `${compact(n)} ${n === 1 ? word : many}`;
}

export function winRate(wins: number, losses: number) {
  const total = wins + losses;
  return total === 0 ? null : Math.round((wins / total) * 100);
}

/** Today's date in New York as YYYY-MM-DD. */
export function newYorkDate(at = new Date()) {
  return at.toLocaleDateString("en-CA", { timeZone: TZ });
}
