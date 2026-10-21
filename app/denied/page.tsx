import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import styles from "../gate.module.css";

export const metadata: Metadata = { title: "No access" };

/** Signed in, but profiles.is_superadmin isn't true. */
export default async function DeniedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className={styles.gate}>
      <div className={styles.spot} aria-hidden="true" />
      <section className={styles.card}>
        <p className={styles.brand}>
          <span className={styles.mic} aria-hidden="true" /> Punchline <strong>Backstage</strong>
        </p>
        <h1 className={styles.title}>This door is for superadmins.</h1>
        <p className={styles.lede}>
          You&apos;re signed in as <strong>{user.email}</strong>, but that account isn&apos;t a superadmin. Access is
          granted in the database by the project owner, not from this site.
        </p>
        <form action="/auth/signout" method="post">
          <button type="submit" className="btn btn-sun">
            Sign out and switch accounts
          </button>
        </form>
      </section>
    </main>
  );
}
