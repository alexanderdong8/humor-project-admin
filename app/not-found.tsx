import Link from "next/link";
import styles from "./gate.module.css";

export default function NotFound() {
  return (
    <main className={styles.gate}>
      <section className={styles.card}>
        <p className={styles.brand}>
          <span className={styles.mic} aria-hidden="true" /> Punchline <strong>Backstage</strong>
        </p>
        <h1 className={styles.title}>Nothing back here.</h1>
        <p className={styles.lede}>That page doesn&apos;t exist, or the record was deleted.</p>
        <Link href="/" className="btn btn-sun">
          Back to the overview
        </Link>
      </section>
    </main>
  );
}
