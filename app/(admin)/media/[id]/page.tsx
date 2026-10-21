import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatTile } from "@/components/charts";
import { fullName, requireAdmin } from "@/lib/admin";
import { formatDateTime, plural, timeAgo, winRate } from "@/lib/format";
import { MOODS, VOICES } from "@/lib/voices";
import { CaptionEditor, DeleteMedia, MediaForm } from "./editors";
import ui from "@/components/ui.module.css";
import styles from "../media.module.css";

export const metadata: Metadata = { title: "Media" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Media = {
  id: string;
  user_id: string | null;
  kind: "member" | "daily";
  status: "draft" | "published";
  author_name: string | null;
  image_url: string;
  image_path: string;
  theme: string | null;
  voice: string;
  prompt: string;
  model: string | null;
  caption_id: string | null;
  battle_wins: number;
  battle_losses: number;
  photo_credit: string | null;
  photo_source_url: string | null;
  daily_for: string | null;
  published_at: string | null;
  created_at: string;
  captions: {
    id: string;
    position: number;
    text: string;
    upvotes: number;
    downvotes: number;
    duel_wins: number;
    duel_losses: number;
    remix: { mood: string } | null;
  }[];
};

export default async function MediaDetailPage(props: PageProps<"/media/[id]">) {
  const { supabase } = await requireAdmin();
  const [{ id }, searchParams] = await Promise.all([props.params, props.searchParams]);
  if (!UUID.test(id)) notFound();

  const { data: media } = await supabase
    .from("generations")
    .select(
      "*, captions:captions!captions_generation_id_fkey(id, position, text, upvotes, downvotes, duel_wins, duel_losses, remix:caption_remixes(mood))",
    )
    .eq("id", id)
    .order("position", { referencedTable: "captions" })
    .maybeSingle<Media>();
  if (!media) notFound();

  const [{ data: owner }, { data: battles }, { count: duelCount }] = await Promise.all([
    media.user_id
      ? supabase.from("profiles").select("id, first_name, last_name, email").eq("id", media.user_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("post_battles")
      .select("id, user_id, winner, post_a, post_b, created_at")
      .or(`post_a.eq.${id},post_b.eq.${id}`)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("caption_duels").select("id", { count: "exact", head: true }).eq("generation_id", id),
  ]);

  const chosen = media.captions.find((c) => c.id === media.caption_id) ?? null;
  const rate = winRate(media.battle_wins, media.battle_losses);
  const isDaily = media.kind === "daily";

  return (
    <>
      <Link href="/media" className={ui.back}>
        ← All media
      </Link>
      {searchParams.created === "1" && (
        <p className={ui.notice} role="status">
          Created. {media.status === "published" ? "It's live in Punchline's Vote and leaderboard." : "It's saved as a draft."}
        </p>
      )}
      <header className={ui.head}>
        <div>
          <p className={ui.kicker}>
            {isDaily ? `Daily AI meme · ${media.daily_for}` : media.status === "published" ? "Live upload" : "Draft upload"}
          </p>
          <h1 className={ui.title}>{media.theme ?? "Untitled"}</h1>
          <p className={ui.lede}>
            {isDaily ? "Made by the nightly job" : "Uploaded"} {timeAgo(media.created_at)} by{" "}
            {owner ? (
              <Link href={`/users/${owner.id}`} className={ui.link}>
                {fullName(owner)}
              </Link>
            ) : (
              (media.author_name ?? "Punchline AI")
            )}
            .
          </p>
        </div>
        <span className={media.status === "published" ? "pill pill-good" : "pill pill-warn"}>
          {media.status === "published" ? "● Live" : "◐ Draft"}
        </span>
      </header>

      <div className={styles.detail}>
        <div className={ui.stack}>
          <figure className={styles.photo}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={media.image_url} alt="" />
            {chosen && <figcaption className={styles.photoCaption}>{chosen.text}</figcaption>}
          </figure>
          <div className={ui.tiles}>
            {isDaily ? (
              <StatTile label="Caption picks" value={duelCount ?? 0} note="members choosing between pairs" />
            ) : (
              <StatTile
                label="Vote record"
                value={`${media.battle_wins}W–${media.battle_losses}L`}
                note={rate === null ? "no votes yet" : `${rate}% win rate`}
              />
            )}
            <StatTile label="Captions" value={media.captions.length} note={isDaily ? "all four stay in play" : "only the winner stays when live"} />
          </div>
        </div>

        <div className={ui.stack}>
          <section className={ui.card}>
            <div className={ui.cardHead}>
              <div>
                <h2 className={ui.cardTitle}>Details</h2>
                <p className={ui.cardSub}>Theme, style, credit, and which caption is shown.</p>
              </div>
            </div>
            <MediaForm
              id={media.id}
              theme={media.theme ?? ""}
              voice={media.voice}
              author={media.author_name ?? ""}
              captionId={media.caption_id}
              isDraft={media.status === "draft"}
              isDaily={isDaily}
              captions={media.captions.map((c) => ({ id: c.id, label: `#${c.position} · ${c.text}` }))}
              voices={Object.entries(VOICES).map(([value, v]) => ({ value, label: `${v.emoji} ${v.label}` }))}
            />
          </section>

          <section className={ui.card}>
            <div className={ui.cardHead}>
              <div>
                <h2 className={ui.cardTitle}>Captions</h2>
                <p className={ui.cardSub}>Edit any caption&apos;s text. Positions are the order Gemini wrote them in.</p>
              </div>
            </div>
            <ul className={styles.captions}>
              {media.captions.map((c) => (
                <li key={c.id} className={styles.captionRow} data-chosen={c.id === media.caption_id || undefined}>
                  <span className={styles.position}>{c.position}</span>
                  <div className={styles.captionEdit}>
                    <CaptionEditor captionId={c.id} mediaId={media.id} text={c.text} />
                    <span className={styles.captionStats}>
                      {c.id === media.caption_id && <span className="pill pill-good">✓ Shown on photo</span>}
                      {c.remix && <span className="pill">{MOODS[c.remix.mood] ?? c.remix.mood} remix</span>}
                      {c.duel_wins + c.duel_losses > 0 && (
                        <span className="mono">
                          {c.duel_wins}W–{c.duel_losses}L in caption picks
                        </span>
                      )}
                      {c.upvotes + c.downvotes > 0 && (
                        <span className="mono">
                          ▲{c.upvotes} ▼{c.downvotes}
                        </span>
                      )}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {!isDaily && (
            <section className={ui.card}>
              <div className={ui.cardHead}>
                <div>
                  <h2 className={ui.cardTitle}>Recent votes</h2>
                  <p className={ui.cardSub}>Upload-vs-upload matchups this post was in.</p>
                </div>
                <Link href="/votes" className={ui.link}>
                  All votes →
                </Link>
              </div>
              {(battles ?? []).length === 0 ? (
                <div className={ui.empty}>No votes yet.</div>
              ) : (
                <ol className={styles.timeline}>
                  {(battles ?? []).map((b) => {
                    const opponent = b.post_a === id ? b.post_b : b.post_a;
                    return (
                      <li key={b.id}>
                        <span className={`${styles.when} mono`}>{timeAgo(b.created_at)}</span>
                        <span>
                          {b.winner === id ? "Won" : "Lost"} against{" "}
                          <Link href={`/media/${opponent}`} className={ui.link}>
                            another upload
                          </Link>
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          )}

          <section className={ui.card}>
            <h2 className={ui.cardTitle}>Record</h2>
            <dl className={`${ui.facts} ${styles.factsGap}`}>
              <dt>ID</dt>
              <dd className="mono">{media.id}</dd>
              <dt>Kind</dt>
              <dd>{isDaily ? "Daily AI meme" : "Member upload"}</dd>
              <dt>Created</dt>
              <dd>{formatDateTime(media.created_at)}</dd>
              <dt>Published</dt>
              <dd>{formatDateTime(media.published_at)}</dd>
              <dt>Model</dt>
              <dd className="mono">{media.model ?? "—"}</dd>
              <dt>Image</dt>
              <dd className="mono">{media.image_path}</dd>
              {media.photo_credit && (
                <>
                  <dt>Credit</dt>
                  <dd>
                    {media.photo_source_url ? (
                      <a href={media.photo_source_url} target="_blank" rel="noreferrer" className={ui.link}>
                        {media.photo_credit}
                      </a>
                    ) : (
                      media.photo_credit
                    )}
                  </dd>
                </>
              )}
            </dl>
            <details className={styles.factsGap}>
              <summary className={ui.link}>Prompt sent to the AI</summary>
              <pre className={styles.prompt}>{media.prompt}</pre>
            </details>
          </section>

          <section className={`${ui.card} ${styles.danger}`}>
            <h2 className={ui.cardTitle}>Delete</h2>
            <p className={ui.cardSub}>
              Removes the post, its {plural(media.captions.length, "caption")}, and every vote on it
              {media.image_path.includes(":") ? "" : ", plus the uploaded photo"}. This can&apos;t be undone.
            </p>
            <DeleteMedia id={media.id} />
          </section>
        </div>
      </div>
    </>
  );
}
