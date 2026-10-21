import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatTile } from "@/components/charts";
import { fullName, requireAdmin } from "@/lib/admin";
import { formatDate, formatDateTime, plural, timeAgo, winRate } from "@/lib/format";
import { voiceLabel } from "@/lib/voices";
import ui from "@/components/ui.module.css";
import styles from "../../media/media.module.css";

export const metadata: Metadata = { title: "Member" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Activity = { at: string; what: string; href?: string };

export default async function UserPage(props: PageProps<"/users/[id]">) {
  const { supabase } = await requireAdmin();
  const { id } = await props.params;
  if (!UUID.test(id)) notFound();

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
  if (!profile) notFound();

  const [{ data: posts }, { data: battles }, { data: duels }, { data: ratings }, { data: remixes }] = await Promise.all([
    supabase
      .from("generations")
      .select("id, status, image_url, voice, theme, battle_wins, battle_losses, created_at, caption:captions!generations_caption_id_fkey(text)")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .returns<
        {
          id: string;
          status: string;
          image_url: string;
          voice: string;
          theme: string | null;
          battle_wins: number;
          battle_losses: number;
          created_at: string;
          caption: { text: string } | null;
        }[]
      >(),
    supabase.from("post_battles").select("id, winner, created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(50),
    supabase.from("caption_duels").select("id, generation_id, created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(50),
    supabase.from("caption_votes").select("caption_id, value, created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(50),
    supabase.from("caption_remixes").select("id, generation_id, mood, created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(50),
  ]);

  const name = fullName(profile);
  const live = (posts ?? []).filter((p) => p.status === "published");
  const votesCast = (battles?.length ?? 0) + (duels?.length ?? 0) + (ratings?.length ?? 0);

  // One timeline of everything this member did, newest first.
  const activity: Activity[] = [
    ...(posts ?? []).map((p) => ({ at: p.created_at, what: `Uploaded a photo (${p.status})`, href: `/media/${p.id}` })),
    ...(battles ?? []).map((b) => ({ at: b.created_at, what: "Voted in an upload matchup", href: `/media/${b.winner}` })),
    ...(duels ?? []).map((d) => ({ at: d.created_at, what: "Picked a daily-meme caption", href: `/media/${d.generation_id}` })),
    ...(ratings ?? []).map((r) => ({ at: r.created_at, what: r.value > 0 ? "Upvoted a caption" : "Downvoted a caption" })),
    ...(remixes ?? []).map((r) => ({ at: r.created_at, what: `Remixed a caption (${r.mood})`, href: `/media/${r.generation_id}` })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 25);

  return (
    <>
      <Link href="/users" className={ui.back}>
        ← All users
      </Link>
      <header className={ui.head}>
        <div className={ui.person}>
          {profile.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.avatar_url} alt="" className={styles.bigAvatar} />
          ) : (
            <span className={`${ui.avatar} ${styles.bigAvatar}`} aria-hidden="true">
              {name.slice(0, 1)}
            </span>
          )}
          <div>
            <p className={ui.kicker}>Member · read only</p>
            <h1 className={ui.title}>{name}</h1>
          </div>
        </div>
        {profile.is_superadmin ? <span className="pill pill-sun">★ Superadmin</span> : <span className="pill">Member</span>}
      </header>

      <div className={ui.tiles}>
        <StatTile label="Live uploads" value={live.length} note={`${plural((posts?.length ?? 0) - live.length, "draft")}`} />
        <StatTile label="Votes cast" value={votesCast} note={`${battles?.length ?? 0} uploads · ${duels?.length ?? 0} daily · ${ratings?.length ?? 0} ratings`} />
        <StatTile label="Remixes" value={remixes?.length ?? 0} />
        <StatTile label="Member since" value={formatDate(profile.created_at)} note={timeAgo(profile.created_at)} />
      </div>

      <div className={`${ui.grid2} ${styles.section}`}>
        <section className={ui.card}>
          <h2 className={ui.cardTitle}>Profile</h2>
          <dl className={`${ui.facts} ${styles.factsGap}`}>
            <dt>Email</dt>
            <dd>{profile.email ?? "—"}</dd>
            <dt>First name</dt>
            <dd>{profile.first_name ?? "—"}</dd>
            <dt>Last name</dt>
            <dd>{profile.last_name ?? "—"}</dd>
            <dt>Superadmin</dt>
            <dd>{profile.is_superadmin ? "Yes" : "No"}</dd>
            <dt>Joined</dt>
            <dd>{formatDateTime(profile.created_at)}</dd>
            <dt>Last updated</dt>
            <dd>{formatDateTime(profile.updated_at)}</dd>
            <dt>User ID</dt>
            <dd className="mono">{profile.id}</dd>
          </dl>
        </section>

        <section className={ui.card}>
          <h2 className={ui.cardTitle}>Recent activity</h2>
          {activity.length === 0 ? (
            <div className={`${ui.empty} ${styles.factsGap}`}>Nothing yet.</div>
          ) : (
            <ol className={styles.timeline}>
              {activity.map((a, i) => (
                <li key={i}>
                  <span className={`${styles.when} mono`}>{timeAgo(a.at)}</span>
                  {a.href ? (
                    <Link href={a.href} className={ui.link}>
                      {a.what}
                    </Link>
                  ) : (
                    <span>{a.what}</span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <section className={styles.section}>
        <h2 className={ui.cardTitle}>Uploads</h2>
        {(posts ?? []).length === 0 ? (
          <div className={`${ui.empty} ${styles.factsGap}`}>No uploads.</div>
        ) : (
          <ul className={`${styles.grid} ${styles.factsGap}`}>
            {(posts ?? []).map((p) => {
              const rate = winRate(p.battle_wins, p.battle_losses);
              return (
                <li key={p.id}>
                  <Link href={`/media/${p.id}`} className={styles.tile}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.image_url} alt="" loading="lazy" />
                    <span className={styles.tileBody}>
                      <span className={`${styles.tileCaption} ${ui.clamp}`}>{p.caption?.text ?? "No caption chosen yet"}</span>
                      <span className={styles.tileMeta}>
                        {p.status === "published" ? (
                          <span className="pill pill-good">Live</span>
                        ) : (
                          <span className="pill pill-warn">Draft</span>
                        )}
                        <span>{voiceLabel(p.voice)}</span>
                        <span className="mono">{rate === null ? "no votes" : `${rate}%`}</span>
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
