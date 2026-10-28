import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GoogleButton } from "./google-button";
import styles from "../gate.module.css";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage(props: PageProps<"/login">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/");
  const { error } = await props.searchParams;

  return (
    <main className={styles.gate}>
      <div className={styles.spot} aria-hidden="true" />
      <section className={styles.card}>
        <p className={styles.brand}>
          <span className={styles.mic} aria-hidden="true" /> Punchline <strong>Backstage</strong>
        </p>
        <h1 className={styles.title}>Staff only past this curtain.</h1>
        <p className={styles.lede}>
          Sign in with Google. Only accounts marked as superadmins in the database get in; everyone else is turned away
          at the door.
        </p>
        <GoogleButton />
        {typeof error === "string" && (
          <p className={styles.error} role="alert">
            {error === "not_allowed"
              ? "That Google account isn't allowed to sign up for Punchline (see Access → Sign-up domains)."
              : "Sign-in didn't go through. Please try again."}
          </p>
        )}
      </section>
    </main>
  );
}
