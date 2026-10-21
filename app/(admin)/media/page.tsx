import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { formatDate, winRate } from "@/lib/format";
import { voiceLabel } from "@/lib/voices";
import ui from "@/components/ui.module.css";
import styles from "./media.module.css";

export const metadata: Metadata = { title: "AI media" };

const PAGE_SIZE = 24;

const FILTERS = [
  { id: "all", label: "Everything" },
  { id: "live", label: "Live uploads" },
  { id: "drafts", label: "Drafts" },
  { id: "daily", label: "Daily memes" },
] as const;
type Filter = (typeof FILTERS)[number]["id"];

type Row = {
  id: string;
  kind: "member" | "daily";
  status: "draft" | "published";
  image_url: string;
  theme: string | null;
  voice: string;
  author_name: string | null;
  battle_wins: number;
  battle_losses: number;
  created_at: string;
  daily_for: string | null;
  caption: { text: string } | null;
  captions: { count: number }[];
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function href(filter: Filter, q: string, page = 1) {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("kind", filter);
  if (q) params.set("q", q);
  if (page > 1) params.set("page", String(page));
  const s = params.toString();
  return s ? `/media?${s}` : "/media";
}

export default async function MediaPage(props: PageProps<"/media">) {
  const { supabase } = await requireAdmin();
  const searchParams = await props.searchParams;
  const kindParam = first(searchParams.kind);
  const filter: Filter = FILTERS.some((f) => f.id === kindParam) ? (kindParam as Filter) : "all";
  const q = (first(searchParams.q) ?? "").trim().slice(0, 80);
  const requested = Number(first(searchParams.page));
  const page = Number.isInteger(requested) && requested > 0 ? requested : 1;
  const from = (page - 1) * PAGE_SIZE;

  let query = supabase
    .from("generations")
    .select(
      "id, kind, status, image_url, theme, voice, author_name, battle_wins, battle_losses, created_at, daily_for, caption:captions!generations_caption_id_fkey(text), captions:captions!captions_generation_id_fkey(count)",
      { count: "exact" },
    );
  if (filter === "live") query = query.eq("kind", "member").eq("status", "published");
  if (filter === "drafts") query = query.eq("status", "draft");
  if (filter === "daily") query = query.eq("kind", "daily");
  if (q) {
    const term = q.replace(/[%,()*\\]/g, " ");
    query = query.or(`theme.ilike.%${term}%,author_name.ilike.%${term}%`);
  }
  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1)
    .returns<Row[]>();
  const rows = data ?? [];
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <header className={ui.head}>
        <div>
          <p className={ui.kicker}>AI media · create, read, update, delete</p>
          <h1 className={ui.title}>AI-captioned media</h1>
          <p className={ui.lede}>
            Every photo on Punchline with its AI-written captions: member uploads (live and drafts) and the nightly daily
            memes. Open one to edit or delete it.
          </p>
        </div>
        <Link href="/media/new" className="btn btn-sun">
          + Create AI media
        </Link>
      </header>

      {first(searchParams.deleted) === "1" && (
        <p className={ui.notice} role="status">
          Deleted, along with its captions and votes.
        </p>
      )}
      <div className={ui.toolbar}>
        <nav className={ui.tabs} aria-label="Filter">
          {FILTERS.map((f) => (
            <Link key={f.id} href={href(f.id, q)} aria-current={f.id === filter ? "page" : undefined}>
              {f.label}
            </Link>
          ))}
        </nav>
        <form className={ui.search} role="search">
          {filter !== "all" && <input type="hidden" name="kind" value={filter} />}
          <input className="input" type="search" name="q" defaultValue={q} placeholder="Search theme or author" aria-label="Search media" />
          <button type="submit" className="btn">
            Search
          </button>
        </form>
      </div>

      {error ? (
        <p className={ui.error} role="alert">
          Couldn&apos;t load media: {error.message}
        </p>
      ) : rows.length === 0 ? (
        <div className={ui.empty}>
          <strong>Nothing here.</strong>
          <Link href="/media/new" className={ui.link}>
            Create some AI media
          </Link>
        </div>
      ) : (
        <ul className={styles.grid}>
          {rows.map((m) => {
            const rate = winRate(m.battle_wins, m.battle_losses);
            const captionCount = m.captions[0]?.count ?? 0;
            return (
              <li key={m.id}>
                <Link href={`/media/${m.id}`} className={styles.tile}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.image_url} alt="" loading="lazy" />
                  <span className={styles.tileBody}>
                    <span className={`${styles.tileCaption} ${ui.clamp}`}>
                      {m.caption?.text ?? (m.kind === "daily" ? `${captionCount} captions in play` : "No caption chosen yet")}
                    </span>
                    <span className={styles.tileMeta}>
                      {m.kind === "daily" ? (
                        <span className="pill">🤖 Daily · {m.daily_for}</span>
                      ) : m.status === "published" ? (
                        <span className="pill pill-good">Live</span>
                      ) : (
                        <span className="pill pill-warn">Draft</span>
                      )}
                      {m.kind === "member" && <span>{voiceLabel(m.voice)}</span>}
                    </span>
                    <span className={styles.tileFoot}>
                      <span>{m.author_name ?? "—"}</span>
                      <span className="mono">
                        {m.kind === "member" ? (rate === null ? "no votes" : `${m.battle_wins}W–${m.battle_losses}L`) : formatDate(m.created_at)}
                      </span>
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <nav className={ui.pager} aria-label="Pagination">
        {page > 1 ? <Link href={href(filter, q, page - 1)}>← Newer</Link> : <span aria-disabled="true">← Newer</span>}
        <span>
          Page {page} of {pages} · {total} {total === 1 ? "item" : "items"}
        </span>
        {page < pages ? <Link href={href(filter, q, page + 1)}>Older →</Link> : <span aria-disabled="true">Older →</span>}
      </nav>
    </>
  );
}
