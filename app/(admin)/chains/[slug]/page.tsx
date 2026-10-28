import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHead } from "@/components/page-head";
import { requireAdmin } from "@/lib/admin";
import { renderPrompt, type ChainStep } from "@/lib/ai/pipeline";
import { timeAgo } from "@/lib/format";
import { isVoice, VOICES } from "@/lib/voices";
import ui from "@/components/ui.module.css";
import styles from "../chains.module.css";

export const metadata: Metadata = { title: "Prompt chain" };

const ROLE_LABEL = { system: "System instruction", user: "User message" } as const;

/** Shows {{placeholders}} highlighted inside a template. */
function Template({ text }: { text: string }) {
  const parts = text.split(/(\{\{\w+\}\})/g);
  return (
    <pre className={styles.template}>
      {parts.map((part, i) =>
        /^\{\{\w+\}\}$/.test(part) ? (
          <mark key={i} className={styles.placeholder}>
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </pre>
  );
}

const FILLS: Record<string, string> = {
  count: "How many captions to write (4 for an upload, 3 for a remix, the chain's share for the daily meme).",
  context: "Extra framing about the image, e.g. which meme template it is. Left out for ordinary photos.",
  examples: "Up to 3 active examples for this style from AI generation examples.",
  theme_instruction: "Today's theme, or a note that there isn't one.",
  terms: "Up to 20 active terms. Left out if there are none.",
};

export default async function ChainPage(props: PageProps<"/chains/[slug]">) {
  const { supabase } = await requireAdmin();
  const { slug } = await props.params;
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) notFound();

  const { data: chain } = await supabase
    .from("prompt_chains")
    .select("id, slug, name, voice, description, is_active, created_at")
    .eq("slug", slug)
    .maybeSingle();
  if (!chain) notFound();

  const [{ data: steps }, { data: pipeline }, { data: recent }] = await Promise.all([
    supabase
      .from("prompt_chain_steps")
      .select("position, name, role, template")
      .eq("chain_id", chain.id)
      .order("position")
      .returns<ChainStep[]>(),
    supabase.rpc("caption_pipeline", { p_chain: slug }),
    supabase
      .from("generation_requests")
      .select("id, source, status, created_at, model")
      .eq("chain_id", chain.id)
      .order("created_at", { ascending: false })
      .limit(8)
      .returns<{ id: string; source: string; status: string; created_at: string; model: string | null }[]>(),
  ]);

  // The exact prompt this chain would send right now for a 4-caption upload with today's settings.
  const config = pipeline as { examples: string[]; terms: { term: string; definition: string }[] } | null;
  const preview = renderPrompt(steps ?? [], {
    count: "4",
    context: "",
    examples: (config?.examples ?? []).map((e) => `- ${e}`).join("\n"),
    theme_instruction: 'Theme: "Snow Day Survival Kit". Lean into it if the photo fits; never force it.',
    terms: (config?.terms ?? []).map((t) => `- ${t.term}: ${t.definition}`).join("\n"),
  });
  const placeholders = [...new Set((steps ?? []).flatMap((s) => [...s.template.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1])))];

  return (
    <>
      <Link href="/chains" className={ui.back}>
        ← All prompt chains
      </Link>
      <PageHead kicker={`Prompt chain · ${chain.slug} · read only`} title={`${isVoice(chain.voice) ? VOICES[chain.voice].emoji : ""} ${chain.name}`}>
        {chain.description}
      </PageHead>

      <div className={ui.grid2} style={{ alignItems: "start" }}>
        <section className={ui.card}>
          <div className={ui.cardHead}>
            <div>
              <h2 className={ui.cardTitle}>Steps</h2>
              <p className={ui.cardSub}>In order. A step is skipped when its placeholder has nothing to fill it with.</p>
            </div>
          </div>
          <ol className={styles.steps}>
            {(steps ?? []).map((s) => (
              <li key={s.position} className={styles.step}>
                <span className={styles.stepNum}>{s.position}</span>
                <div style={{ minWidth: 0 }}>
                  <div className={styles.stepHead}>
                    {s.name}
                    <span className="pill">{ROLE_LABEL[s.role]}</span>
                  </div>
                  <Template text={s.template} />
                </div>
              </li>
            ))}
          </ol>
        </section>

        <div className={ui.stack}>
          <section className={ui.card}>
            <h2 className={ui.cardTitle}>What fills the placeholders</h2>
            <dl className={ui.facts} style={{ marginTop: "0.9rem" }}>
              {placeholders.map((p) => (
                <div key={p} style={{ display: "contents" }}>
                  <dt className="mono">{`{{${p}}}`}</dt>
                  <dd>{FILLS[p] ?? "Filled in by the caption writer."}</dd>
                </div>
              ))}
            </dl>
            <p className={ui.insight}>
              Remixes add two lines after the chain: the mood (Meaner, Funnier, or Relatable) and the current caption to
              steer away from.
            </p>
          </section>

          <section className={ui.card}>
            <div className={ui.cardHead}>
              <div>
                <h2 className={ui.cardTitle}>Rendered prompt</h2>
                <p className={ui.cardSub}>
                  What this chain sends right now for a 4-caption upload, with the current{" "}
                  <Link href="/examples" className={ui.link}>
                    examples
                  </Link>{" "}
                  and{" "}
                  <Link href="/terms" className={ui.link}>
                    terms
                  </Link>{" "}
                  and a sample theme. The photo is attached separately.
                </p>
              </div>
            </div>
            <pre className={`${styles.template} ${styles.preview}`}>
              {`[system]\n${preview.system}\n\n[user]\n<photo>\n${preview.user.join("\n")}`}
            </pre>
          </section>

          <section className={ui.card}>
            <div className={ui.cardHead}>
              <h2 className={ui.cardTitle}>Recent requests</h2>
              <Link href={`/requests?chain=${chain.slug}`} className={ui.link}>
                All →
              </Link>
            </div>
            {(recent ?? []).length === 0 ? (
              <div className={ui.empty}>No requests used this chain yet.</div>
            ) : (
              <ul className={ui.stack} style={{ gap: "0.4rem", listStyle: "none", padding: 0 }}>
                {(recent ?? []).map((r) => (
                  <li key={r.id}>
                    <Link href={`/requests/${r.id}`} className={ui.link}>
                      {r.source} · {r.status}
                    </Link>{" "}
                    <span className={ui.muted}>
                      {timeAgo(r.created_at)}
                      {r.model ? ` · ${r.model}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
