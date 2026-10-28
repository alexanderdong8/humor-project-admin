"use client";

import { useState, useTransition } from "react";
import { saveMix } from "./actions";
import ui from "@/components/ui.module.css";
import styles from "./chains.module.css";

type Entry = { slug: string; name: string; emoji: string; count: number };

const TOTAL = 4;

/** How many of the daily meme's 4 captions each style writes. */
export function MixEditor({ initial, updated }: { initial: Entry[]; updated: string | null }) {
  const [mix, setMix] = useState(initial);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const total = mix.reduce((sum, e) => sum + e.count, 0);
  const dirty = mix.some((e, i) => e.count !== initial[i].count);

  const set = (slug: string, count: number) => {
    setResult(null);
    setMix((prev) => prev.map((e) => (e.slug === slug ? { ...e, count: Math.max(0, Math.min(TOTAL, count)) } : e)));
  };

  return (
    <div className={styles.mix}>
      {/* The mix as one bar of 4 slots. */}
      <div className={styles.mixBar} aria-hidden="true">
        {mix.flatMap((e, i) =>
          Array.from({ length: e.count }, (_, k) => (
            <span key={`${e.slug}-${k}`} style={{ background: `var(--series-${(i % 4) + 1})` }} data-tip={`${e.name}`} />
          )),
        )}
        {Array.from({ length: Math.max(0, TOTAL - total) }, (_, k) => (
          <span key={`empty-${k}`} className={styles.mixEmpty} />
        ))}
      </div>

      <ul className={styles.mixRows}>
        {mix.map((e, i) => (
          <li key={e.slug}>
            <span className={styles.mixSwatch} style={{ background: `var(--series-${(i % 4) + 1})` }} aria-hidden="true" />
            <span className={styles.mixName}>
              {e.emoji} {e.name}
            </span>
            <span className={styles.stepper}>
              <button type="button" onClick={() => set(e.slug, e.count - 1)} disabled={e.count === 0} aria-label={`Fewer ${e.name}`}>
                −
              </button>
              <output className="mono" aria-label={`${e.name} captions`}>
                {e.count}
              </output>
              <button
                type="button"
                onClick={() => set(e.slug, e.count + 1)}
                disabled={total >= TOTAL}
                aria-label={`More ${e.name}`}
              >
                +
              </button>
            </span>
          </li>
        ))}
      </ul>

      <div className={styles.mixFoot}>
        <span className={total === TOTAL ? styles.totalOk : styles.totalOff} role="status">
          {total} of {TOTAL} captions assigned
        </span>
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending || !dirty || total !== TOTAL}
          onClick={() =>
            startTransition(async () => {
              setResult(await saveMix(Object.fromEntries(mix.map((e) => [e.slug, e.count]))));
            })
          }
        >
          {pending ? "Saving…" : "Save mix"}
        </button>
        {dirty && (
          <button type="button" className="btn" onClick={() => setMix(initial)} disabled={pending}>
            Reset
          </button>
        )}
      </div>
      {result && (
        <p className={result.ok ? styles.saved : ui.error} role="status">
          {result.ok ? `✓ ${result.message}` : result.message}
        </p>
      )}
      {updated && !result && <p className={ui.muted}>Last changed {updated}.</p>}
    </div>
  );
}
