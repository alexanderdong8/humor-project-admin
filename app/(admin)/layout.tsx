import { fullName, requireAdmin } from "@/lib/admin";
import { MAIN_APP_URL } from "@/lib/site";
import { ChartTips } from "@/components/chart-tips";
import { WingNav } from "./wing-nav";
import styles from "./shell.module.css";

/** Every page in this group is superadmin-only; requireAdmin runs before anything renders. */
export default async function AdminLayout({ children }: LayoutProps<"/">) {
  const { profile } = await requireAdmin();
  const name = fullName(profile);

  return (
    <div className={styles.shell}>
      <aside className={styles.wing}>
        <a href="/" className={styles.brand}>
          <span className={styles.mic} aria-hidden="true" />
          <span>
            Punchline <strong>Backstage</strong>
          </span>
        </a>
        <WingNav />
        <div className={styles.me}>
          {profile.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.avatar_url} alt="" className={styles.avatar} />
          ) : (
            <span className={styles.avatar} aria-hidden="true">
              {name.slice(0, 1)}
            </span>
          )}
          <span className={styles.meText}>
            <span className={styles.meName}>{name}</span>
            <span className={styles.meRole}>Superadmin</span>
          </span>
        </div>
        <div className={styles.wingLinks}>
          <a href={MAIN_APP_URL} target="_blank" rel="noreferrer">
            Open Punchline ↗
          </a>
          <form action="/auth/signout" method="post">
            <button type="submit">Sign out</button>
          </form>
        </div>
      </aside>
      <main className={styles.stage}>{children}</main>
      <ChartTips />
    </div>
  );
}
