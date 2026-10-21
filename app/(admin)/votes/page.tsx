import type { Metadata } from "next";
import Link from "next/link";
import { StatTile } from "@/components/charts";
import { fullName, requireAdmin } from "@/lib/admin";
import { formatDateTime } from "@/lib/format";
import ui from "@/components/ui.module.css";
import styles from "./votes.module.css";

export const metadata: Metadata = { title: "Votes & ratings" };

const PAGE_SIZE = 50;

const TABS = [
  { id: "uploads", label: "Upload vs. upload", table: "post_battles" },
  { id: "daily", label: "Daily-meme picks", table: "caption_duels" },
  { id: "ratings", label: "Up/down ratings", table: "caption_votes" },
] as const;
type Tab = (typeof TABS)[number]["id"];

type Person = { id: string; first_name: string | null; last_name: string | null; email: string | null };
type PostInfo = { id: string; image_url: string; author_name: string | null; caption: { text: string } | null };
type CaptionInfo = { id: string; text: string; generation_id: string };

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function href(tab: Tab, page = 1) {
  return `/votes?tab=${tab}${page > 1 ? `&page=${page}` : ""}`;
}

export default async function VotesPage(props: PageProps<"/votes">) {
  const { supabase } = await requireAdmin();
  const searchParams = await props.searchParams;
  const tabParam = first(searchParams.tab);
  const tab: Tab = TABS.some((t) => t.id === tabParam) ? (tabParam as Tab) : "uploads";
  const requested = Number(first(searchParams.page));
  const page = Number.isInteger(requested) && requested > 0 ? requested : 1;
  const from = (page - 1) * PAGE_SIZE;

  const head = (table: string) => supabase.from(table).select("*", { count: "exact", head: true });
  const [{ count: battleCount }, { count: duelCount }, { count: upCount }, { count: downCount }] = await Promise.all([
    head("post_battles"),
    head("caption_duels"),
    supabase.from("caption_votes").select("*", { count: "exact", head: true }).eq("value", 1),
    supabase.from("caption_votes").select("*", { count: "exact", head: true }).eq("value", -1),
  ]);
  const counts: Record<Tab, number> = {
    uploads: battleCount ?? 0,
    daily: duelCount ?? 0,
    ratings: (upCount ?? 0) + (downCount ?? 0),
  };
  const ratingTotal = (upCount ?? 0) + (downCount ?? 0);

  // Rows for the selected tab, then everything they point at in a few batched reads.
  const current = TABS.find((t) => t.id === tab)!;
  const { data: rawRows, error } = await supabase
    .from(current.table)
    .select("*")
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  const rows = (rawRows ?? []) as Record<string, string | number>[];

  const userIds = [...new Set(rows.map((r) => r.user_id as string))];
  const postIds = tab === "uploads" ? [...new Set(rows.flatMap((r) => [r.post_a as string, r.post_b as string]))] : [];
  const captionIds =
    tab === "daily"
      ? [...new Set(rows.flatMap((r) => [r.caption_a as string, r.caption_b as string]))]
      : tab === "ratings"
        ? [...new Set(rows.map((r) => r.caption_id as string))]
        : [];

  const [{ data: people }, { data: posts }, { data: captions }] = await Promise.all([
    userIds.length
      ? supabase.from("profiles").select("id, first_name, last_name, email").in("id", userIds).returns<Person[]>()
      : Promise.resolve({ data: [] as Person[] }),
    postIds.length
      ? supabase
          .from("generations")
          .select("id, image_url, author_name, caption:captions!generations_caption_id_fkey(text)")
          .in("id", postIds)
          .returns<PostInfo[]>()
      : Promise.resolve({ data: [] as PostInfo[] }),
    captionIds.length
      ? supabase.from("captions").select("id, text, generation_id").in("id", captionIds).returns<CaptionInfo[]>()
      : Promise.resolve({ data: [] as CaptionInfo[] }),
  ]);
  const personBy = new Map((people ?? []).map((p) => [p.id, p]));
  const postBy = new Map((posts ?? []).map((p) => [p.id, p]));
  const captionBy = new Map((captions ?? []).map((c) => [c.id, c]));
  const total = counts[tab];
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const voter = (id: string) => {
    const p = personBy.get(id);
    return p ? (
      <Link href={`/users/${id}`} className={ui.link}>
        {fullName(p)}
      </Link>
    ) : (
      <span className={ui.muted}>Deleted user</span>
    );
  };

  const postCell = (id: string, won: boolean) => {
    const p = postBy.get(id);
    return (
      <Link href={`/media/${id}`} className={styles.post} data-won={won || undefined}>
        {p && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.image_url} alt="" className={ui.thumb} loading="lazy" />
        )}
        <span className={styles.postText}>
          <span className={`${styles.verdict} ${won ? styles.won : styles.lost}`}>{won ? "▲ Picked" : "▽ Passed"}</span>
          <span className={ui.clamp}>{p?.caption?.text ?? "Deleted post"}</span>
        </span>
      </Link>
    );
  };

  const captionCell = (id: string, won: boolean) => (
    <span className={styles.post} data-won={won || undefined}>
      <span className={styles.postText}>
        <span className={`${styles.verdict} ${won ? styles.won : styles.lost}`}>{won ? "▲ Picked" : "▽ Passed"}</span>
        <span className={ui.clamp}>{captionBy.get(id)?.text ?? "Deleted caption"}</span>
      </span>
    </span>
  );

  return (
    <>
      <header className={ui.head}>
        <div>
          <p className={ui.kicker}>Votes &amp; ratings · read only</p>
          <h1 className={ui.title}>Every vote, as cast</h1>
          <p className={ui.lede}>
            Punchline has three ways to vote: picking the funnier of two uploads, picking the funnier of two daily-meme
            captions, and (from the first version) thumbs up or down on a caption.
          </p>
        </div>
      </header>

      <div className={ui.tiles}>
        <StatTile label="Upload vs. upload votes" value={counts.uploads} />
        <StatTile label="Daily-meme caption picks" value={counts.daily} />
        <StatTile label="Upvotes" value={upCount ?? 0} note={ratingTotal ? `${Math.round(((upCount ?? 0) / ratingTotal) * 100)}% of ratings` : undefined} />
        <StatTile label="Downvotes" value={downCount ?? 0} />
      </div>

      <div className={`${ui.toolbar} ${styles.toolbar}`}>
        <nav className={ui.tabs} aria-label="Vote type">
          {TABS.map((t) => (
            <Link key={t.id} href={href(t.id)} aria-current={t.id === tab ? "page" : undefined}>
              {t.label}
              <small>{counts[t.id]}</small>
            </Link>
          ))}
        </nav>
      </div>

      {error ? (
        <p className={ui.error} role="alert">
          Couldn&apos;t load votes: {error.message}
        </p>
      ) : rows.length === 0 ? (
        <div className={ui.empty}>
          <strong>No votes of this kind yet.</strong>
          {tab === "uploads" && "They appear here as members use Vote in Punchline."}
        </div>
      ) : (
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Voter</th>
                {tab === "ratings" ? (
                  <>
                    <th scope="col">Rating</th>
                    <th scope="col">Caption</th>
                  </>
                ) : (
                  <>
                    <th scope="col">{tab === "uploads" ? "Upload A" : "Caption A"}</th>
                    <th scope="col">{tab === "uploads" ? "Upload B" : "Caption B"}</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const key = String(r.id ?? `${r.caption_id}:${r.user_id}`);
                return (
                  <tr key={key}>
                    <td className={`${ui.nowrap} ${ui.muted}`}>{formatDateTime(r.created_at as string)}</td>
                    <td className={ui.nowrap}>{voter(r.user_id as string)}</td>
                    {tab === "uploads" && (
                      <>
                        <td>{postCell(r.post_a as string, r.winner === r.post_a)}</td>
                        <td>{postCell(r.post_b as string, r.winner === r.post_b)}</td>
                      </>
                    )}
                    {tab === "daily" && (
                      <>
                        <td>{captionCell(r.caption_a as string, r.winner === r.caption_a)}</td>
                        <td>{captionCell(r.caption_b as string, r.winner === r.caption_b)}</td>
                      </>
                    )}
                    {tab === "ratings" && (
                      <>
                        <td className={ui.nowrap}>
                          {Number(r.value) > 0 ? (
                            <span className="pill pill-good">▲ Up</span>
                          ) : (
                            <span className="pill pill-warn">▼ Down</span>
                          )}
                        </td>
                        <td>
                          {captionBy.get(r.caption_id as string) ? (
                            <Link href={`/media/${captionBy.get(r.caption_id as string)!.generation_id}`} className={ui.link}>
                              {captionBy.get(r.caption_id as string)!.text}
                            </Link>
                          ) : (
                            <span className={ui.muted}>Deleted caption</span>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <nav className={ui.pager} aria-label="Pagination">
        {page > 1 ? <Link href={href(tab, page - 1)}>← Newer</Link> : <span aria-disabled="true">← Newer</span>}
        <span>
          Page {page} of {pages}
        </span>
        {page < pages ? <Link href={href(tab, page + 1)}>Older →</Link> : <span aria-disabled="true">Older →</span>}
      </nav>
    </>
  );
}
