import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/page-head";
import { requireAdmin } from "@/lib/admin";
import { timeAgo } from "@/lib/format";
import { isVoice, VOICES } from "@/lib/voices";
import { MixEditor } from "./mix-editor";
import ui from "@/components/ui.module.css";
import styles from "./chains.module.css";

export const metadata: Metadata = { title: "Prompt chains" };

type Chain = {
  id: string;
  slug: string;
  name: string;
  voice: string;
  description: string;
  is_active: boolean;
  steps: { count: number }[];
  mix: { caption_count: number; updated_at: string } | null;
};

export default async function ChainsPage() {
  const { supabase } = await requireAdmin();
  const [{ data: chains }, { data: requests }] = await Promise.all([
    supabase
      .from("prompt_chains")
      .select("id, slug, name, voice, description, is_active, steps:prompt_chain_steps(count), mix:prompt_chain_mix(caption_count, updated_at)")
      .order("sort_order")
      .returns<Chain[]>(),
    supabase.from("generation_requests").select("chain_id").returns<{ chain_id: string | null }[]>(),
  ]);
  const uses = new Map<string, number>();
  for (const r of requests ?? []) if (r.chain_id) uses.set(r.chain_id, (uses.get(r.chain_id) ?? 0) + 1);

  const list = chains ?? [];
  const lastChange = list
    .map((c) => c.mix?.updated_at)
    .filter((d): d is string => Boolean(d))
    .sort()
    .at(-1);

  return (
    <>
      <PageHead kicker="AI pipeline · read chains and steps · read/update mix" title="Prompt chains">
        Each caption style is a chain of prompt steps: the ground rules, the task, the style, examples, the theme, and
        local terms. The caption writer fills in each step and sends the result to the model. Steps are read-only here
        (they change with the code, through a database migration); the daily mix is yours to set.
      </PageHead>

      <section className={ui.card} style={{ marginBottom: "1rem" }}>
        <div className={ui.cardHead}>
          <div>
            <h2 className={ui.cardTitle}>Daily meme mix</h2>
            <p className={ui.cardSub}>
              The daily AI meme gets 4 captions. Choose how many each chain writes; the nightly job follows this mix.
            </p>
          </div>
        </div>
        <MixEditor
          initial={list
            .filter((c) => c.is_active)
            .map((c) => ({
              slug: c.slug,
              name: c.name.replace(/ captions$/, ""),
              emoji: isVoice(c.voice) ? VOICES[c.voice].emoji : "",
              count: c.mix?.caption_count ?? 0,
            }))}
          updated={lastChange ? timeAgo(lastChange) : null}
        />
      </section>

      <ul className={styles.list}>
        {list.map((c) => (
          <li key={c.id}>
            <Link href={`/chains/${c.slug}`} className={styles.chain}>
              <span className={styles.chainName}>
                {isVoice(c.voice) ? VOICES[c.voice].emoji : ""} {c.name}
              </span>
              <span className={styles.chainDesc}>{c.description}</span>
              <span className={styles.chainMeta}>
                <span className="pill">{c.steps[0]?.count ?? 0} steps</span>
                <span className="pill">{uses.get(c.id) ?? 0} requests</span>
                <span className="pill pill-sun">{c.mix?.caption_count ?? 0} of 4 daily captions</span>
              </span>
              <span className={ui.link}>View steps →</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
