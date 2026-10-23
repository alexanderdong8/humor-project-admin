import Link from "next/link";
import {
  Columns,
  DataTable,
  Heatmap,
  HBars,
  Legend,
  Scatter,
  SERIES,
  SplitBar,
  StackedColumns,
  StatTile,
} from "@/components/charts";
import { fullName } from "@/lib/admin";
import { compact, formatDate, plural, winRate } from "@/lib/format";
import { RANGES, TREND_SOURCES, type Stats } from "@/lib/stats";
import { MOODS, voiceLabel } from "@/lib/voices";
import ui from "@/components/ui.module.css";
import styles from "./overview.module.css";

const DAY_NAMES = ["", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"];

function shortDay(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function hour12(h: number) {
  const suffix = h < 12 ? "a.m." : "p.m.";
  return `${h % 12 === 0 ? 12 : h % 12} ${suffix}`;
}

/** The dashboard itself, from admin_stats() output. */
export function OverviewView({ s }: { s: Stats }) {
  const t = s.totals;

  const ratings = t.upvotes + t.downvotes;
  const totalVotes = t.post_votes + t.duels + ratings;

  // Activity over the chosen window: daily columns, or weekly ones past a month
  // (counted back from today, so the newest column is always this week).
  const weekly = s.days > 31;
  const buckets: { start: string; uploads: number; votes: number; signups: number }[] = [];
  if (weekly) {
    for (let end = s.activity.length; end > 0; end -= 7) {
      const week = s.activity.slice(Math.max(0, end - 7), end);
      buckets.unshift({
        start: week[0].day,
        uploads: week.reduce((a, d) => a + d.uploads, 0),
        votes: week.reduce((a, d) => a + d.votes, 0),
        signups: week.reduce((a, d) => a + d.signups, 0),
      });
    }
  } else {
    buckets.push(...s.activity.map((d) => ({ start: d.day, uploads: d.uploads, votes: d.votes, signups: d.signups })));
  }
  const activity = buckets.map((b) => ({
    label: shortDay(b.start),
    values: [b.uploads, b.votes],
    tip: `${weekly ? `Week of ${shortDay(b.start)}` : shortDay(b.start)}\n${plural(b.uploads, "upload")} · ${plural(b.votes, "vote")}${b.signups ? ` · ${plural(b.signups, "sign-up")}` : ""}`,
  }));
  const labelEvery = s.days <= 7 ? 1 : weekly ? 3 : 7;
  const busiest = s.activity.reduce((best, d) => (d.uploads + d.votes > best.uploads + best.votes ? d : best), s.activity[0]);
  const monthUploads = s.activity.reduce((a, d) => a + d.uploads, 0);
  const monthVotes = s.activity.reduce((a, d) => a + d.votes, 0);

  // Heatmap peak
  const peak = s.heatmap.reduce<(typeof s.heatmap)[number] | null>((best, c) => (!best || c.n > best.n ? c : best), null);

  // Which AI draft wins the caption battle
  const positionTotal = s.positions.reduce((a, p) => a + p.n, 0);
  const positions = [1, 2, 3, 4].map((position) => {
    const n = s.positions.find((p) => p.position === position)?.n ?? 0;
    const share = positionTotal ? Math.round((n / positionTotal) * 100) : 0;
    return {
      label: `#${position}`,
      note: position === 1 ? "AI's first pick" : undefined,
      value: share,
      tip: `Caption #${position} won ${plural(n, "battle")} (${share}% of ${positionTotal})`,
    };
  });
  const firstShare = positions[0].value;

  // Caption styles
  const voices = s.voices.map((v) => {
    const rate = winRate(v.wins, v.losses);
    return {
      key: v.voice,
      label: voiceLabel(v.voice),
      value: v.posts,
      display: `${v.posts}${rate !== null ? ` · ${rate}% wins` : ""}`,
      tip: `${voiceLabel(v.voice)}: ${plural(v.posts, "live upload")}, ${v.wins}W–${v.losses}L in Vote`,
    };
  });

  // Remix moods
  const moods = s.moods.map((m) => ({
    key: m.mood,
    label: MOODS[m.mood] ?? m.mood,
    value: m.remixes,
    display: `${m.remixes} · ${m.wins} won`,
    tip: `${MOODS[m.mood] ?? m.mood}: ${plural(m.remixes, "remix", "remixes")}; a remix caption won ${m.wins} of them`,
  }));

  // Caption length vs win rate (daily meme)
  const lengths = s.caption_lengths.map((c) => ({
    key: c.id,
    x: c.words,
    y: Math.round((c.wins / (c.wins + c.losses)) * 100),
    tip: `“${c.text}”\n${c.words} words · ${c.wins}W–${c.losses}L`,
  }));
  const short = s.caption_lengths.filter((c) => c.words <= 12);
  const long = s.caption_lengths.filter((c) => c.words > 12);
  const pooled = (list: typeof short) => {
    const w = list.reduce((a, c) => a + c.wins, 0);
    const l = list.reduce((a, c) => a + c.losses, 0);
    return winRate(w, l);
  };

  return (
    <>
      <header className={ui.head}>
        <div>
          <p className={ui.kicker}>Overview · {formatDate(`${s.today}T12:00:00`)}</p>
          <h1 className={ui.title}>Tonight&apos;s house.</h1>
          <p className={ui.lede}>Everything happening on Punchline, from the first upload to the latest vote.</p>
        </div>
        <div className={ui.actions}>
          <nav className={ui.tabs} aria-label="Time range for the activity charts">
            {RANGES.map((r) => (
              <Link key={r} href={r === 30 ? "/" : `/?range=${r}`} aria-current={r === s.days ? "page" : undefined} scroll={false}>
                {r} days
              </Link>
            ))}
          </nav>
          <Link href="/media/new" className="btn btn-sun">
            + Create AI media
          </Link>
        </div>
      </header>

      <section className={styles.top}>
        <div className={styles.hero}>
          <span className={styles.heroLabel}>Votes cast, all time</span>
          <span className={styles.heroValue}>{compact(totalVotes)}</span>
          <ul className={styles.heroSplit}>
            <li>
              <strong className="mono">{compact(t.post_votes)}</strong> upload vs. upload
            </li>
            <li>
              <strong className="mono">{compact(t.duels)}</strong> daily-meme caption picks
            </li>
            <li>
              <strong className="mono">{compact(ratings)}</strong> up/down ratings{" "}
              {ratings > 0 && <span className={ui.muted}>({Math.round((t.upvotes / ratings) * 100)}% up)</span>}
            </li>
          </ul>
        </div>
        <div className={ui.tiles}>
          <StatTile label="Members" value={t.members} note={plural(t.admins, "superadmin")} />
          <StatTile label="Live uploads" value={t.published} note={`${plural(t.drafts, "draft")} waiting`} />
          <StatTile label="Captions on file" value={t.captions} note="written by Gemini" />
          <StatTile label="Daily AI memes" value={t.daily} note={`${plural(t.themes, "theme")} generated`} />
          <StatTile label="Remixes" value={t.remixes} note={`${s.remix_winners} beat the original`} />
          <StatTile label="Jokes in library" value={t.jokes} />
        </div>
      </section>

      <section className={`${ui.card} ${styles.block}`}>
        <div className={ui.cardHead}>
          <div>
            <h2 className={ui.cardTitle}>The last {s.days} days</h2>
            <p className={ui.cardSub}>
              {plural(monthUploads, "upload")} and {plural(monthVotes, "vote")} (all kinds), by New York {weekly ? "week" : "day"}.
            </p>
          </div>
          <Legend
            items={[
              { label: "Uploads", color: SERIES[0] },
              { label: "Votes", color: SERIES[1] },
            ]}
          />
        </div>
        <StackedColumns columns={activity} series={["Uploads", "Votes"]} labelEvery={labelEvery} />
        {busiest && busiest.uploads + busiest.votes > 0 && (
          <p className={ui.insight}>
            Busiest day: <strong>{shortDay(busiest.day)}</strong>, with {plural(busiest.uploads, "upload")} and{" "}
            {plural(busiest.votes, "vote")}.
          </p>
        )}
        <DataTable
          head={["Day", "Uploads", "Votes", "Sign-ups"]}
          rows={[...s.activity].reverse().map((d) => [shortDay(d.day), d.uploads, d.votes, d.signups])}
        />
      </section>

      <div className={`${ui.grid2} ${styles.block}`}>
        <section className={ui.card}>
          <div className={ui.cardHead}>
            <div>
              <h2 className={ui.cardTitle}>When the room is loudest</h2>
              <p className={ui.cardSub}>
                Uploads, votes, and remixes in the last {s.days} days, by weekday and hour (New York time).
              </p>
            </div>
          </div>
          {s.heatmap.length === 0 ? (
            <div className={ui.empty}>No activity in the last {s.days} days.</div>
          ) : (
            <>
              <Heatmap cells={s.heatmap} />
              {peak && (
                <p className={ui.insight}>
                  Peak: <strong>{DAY_NAMES[peak.dow]} around {hour12(peak.hour)}</strong> ({plural(peak.n, "action")}).
                  Schedule anything big, like a new daily meme, just before then.
                </p>
              )}
            </>
          )}
        </section>

        <section className={ui.card}>
          <div className={ui.cardHead}>
            <div>
              <h2 className={ui.cardTitle}>Does the AI&apos;s first draft win?</h2>
              <p className={ui.cardSub}>
                Gemini writes 4 captions per upload. Which one won the uploader&apos;s caption battle?
              </p>
            </div>
          </div>
          {positionTotal === 0 ? (
            <div className={ui.empty}>No finished caption battles yet.</div>
          ) : (
            <>
              <Columns items={positions} reference={{ value: 25, label: "chance: 25%" }} format={(v) => `${v}%`} />
              <p className={ui.insight}>
                {firstShare > 35
                  ? `The AI's first caption wins ${firstShare}% of battles, well above chance. Gemini front-loads its best joke.`
                  : firstShare < 15
                    ? `The AI's first caption wins only ${firstShare}% of the time. Its later drafts are funnier.`
                    : `Across ${plural(positionTotal, "battle")}, no draft position dominates. The order Gemini writes in doesn't predict the winner.`}
              </p>
              <DataTable
                head={["Caption #", "Battles won", "Share"]}
                rows={[1, 2, 3, 4].map((p) => [
                  `#${p}`,
                  s.positions.find((x) => x.position === p)?.n ?? 0,
                  `${positions[p - 1].value}%`,
                ])}
              />
            </>
          )}
        </section>
      </div>

      <div className={`${ui.grid3} ${styles.block}`}>
        <section className={ui.card}>
          <div className={ui.cardHead}>
            <div>
              <h2 className={ui.cardTitle}>Caption styles</h2>
              <p className={ui.cardSub}>Live uploads per style, with their Vote win rate.</p>
            </div>
          </div>
          {voices.length === 0 ? <div className={ui.empty}>No live uploads yet.</div> : <HBars rows={voices} />}
        </section>

        <section className={ui.card}>
          <div className={ui.cardHead}>
            <div>
              <h2 className={ui.cardTitle}>Remix moods</h2>
              <p className={ui.cardSub}>How owners remix, and how often the remix beat the original caption.</p>
            </div>
          </div>
          {moods.length === 0 ? (
            <div className={ui.empty}>No remixes yet.</div>
          ) : (
            <HBars rows={moods} color={SERIES[1]} />
          )}
        </section>

        <section className={ui.card}>
          <div className={ui.cardHead}>
            <div>
              <h2 className={ui.cardTitle}>Behind the AI</h2>
              <p className={ui.cardSub}>Where daily themes came from, and which Gemini model answered.</p>
            </div>
          </div>
          <div className={ui.stack}>
            {s.trend_sources.length > 0 && (
              <SplitBar parts={s.trend_sources.map((x) => ({ label: TREND_SOURCES[x.source] ?? x.source, value: x.n }))} />
            )}
            {s.models.length > 0 && <SplitBar parts={s.models.slice(0, 4).map((m) => ({ label: m.model, value: m.n }))} />}
          </div>
        </section>
      </div>

      <section className={`${ui.card} ${styles.block}`}>
        <div className={ui.cardHead}>
          <div>
            <h2 className={ui.cardTitle}>Daily AI meme report card</h2>
            <p className={ui.cardSub}>The last two weeks of daily memes and the caption members ranked first.</p>
          </div>
          <Link href="/media?kind=daily" className={ui.link}>
            All daily memes →
          </Link>
        </div>
        {s.daily_memes.length === 0 ? (
          <div className={ui.empty}>No daily memes yet.</div>
        ) : (
          <ol className={styles.reel}>
            {s.daily_memes.map((m) => (
              <li key={m.id}>
                <Link href={`/media/${m.id}`} className={styles.reelCard}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.image_url} alt="" loading="lazy" />
                  <span className={styles.reelDay}>{shortDay(m.day)}</span>
                  <span className={styles.reelTheme}>{m.theme ?? "No theme"}</span>
                  <span className={`${styles.reelCaption} ${ui.clamp}`}>“{m.leader ?? "…"}”</span>
                  <span className={styles.reelMeta}>
                    {plural(m.duels, "pick")}
                    {m.photo_credit?.includes("Imgflip") ? " · meme template" : " · stock photo"}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className={`${ui.grid3} ${styles.block}`}>
        <section className={ui.card}>
          <div className={ui.cardHead}>
            <div>
              <h2 className={ui.cardTitle}>Short or long?</h2>
              <p className={ui.cardSub}>Daily-meme captions: length vs. how often members picked them.</p>
            </div>
          </div>
          {lengths.length === 0 ? (
            <div className={ui.empty}>No caption picks yet.</div>
          ) : (
            <>
              <Scatter points={lengths} xLabel="Words in caption" yLabel="Picked in head-to-heads" />
              {short.length > 0 && long.length > 0 && (
                <p className={ui.insight}>
                  Captions of 12 words or fewer win <strong>{pooled(short)}%</strong> of their matchups; longer ones win{" "}
                  <strong>{pooled(long)}%</strong>.
                </p>
              )}
            </>
          )}
        </section>

        <section className={ui.card}>
          <div className={ui.cardHead}>
            <div>
              <h2 className={ui.cardTitle}>Front row</h2>
              <p className={ui.cardSub}>The most active members.</p>
            </div>
            <Link href="/users" className={ui.link}>
              All users →
            </Link>
          </div>
          <ol className={styles.people}>
            {s.people.map((p, i) => (
              <li key={p.id}>
                <Link href={`/users/${p.id}`} className={styles.personRow}>
                  <span className={`${styles.rank} mono`}>{i + 1}</span>
                  {p.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.avatar_url} alt="" className={ui.avatar} />
                  ) : (
                    <span className={ui.avatar}>{(p.first_name ?? "?").slice(0, 1)}</span>
                  )}
                  <span className={styles.personName}>{fullName(p)}</span>
                  <span className={`${styles.personStat} mono`}>
                    {plural(p.votes, "vote")} · {plural(p.uploads, "upload")}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <section className={ui.card}>
          <div className={ui.cardHead}>
            <div>
              <h2 className={ui.cardTitle}>Hall of fame</h2>
              <p className={ui.cardSub}>Best Vote records among live uploads.</p>
            </div>
          </div>
          {s.hall_of_fame.length === 0 ? (
            <div className={ui.empty}>No live uploads yet.</div>
          ) : (
            <ol className={styles.people}>
              {s.hall_of_fame.map((h) => {
                const rate = winRate(h.battle_wins, h.battle_losses);
                return (
                  <li key={h.id}>
                    <Link href={`/media/${h.id}`} className={styles.personRow}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={h.image_url} alt="" className={ui.thumb} loading="lazy" />
                      <span className={`${styles.personName} ${ui.clamp}`}>{h.caption ?? "…"}</span>
                      <span className={`${styles.personStat} mono`}>{rate === null ? "no votes" : `${rate}% wins`}</span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    </>
  );
}
