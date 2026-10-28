import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatTile } from "@/components/charts";
import { PageHead } from "@/components/page-head";
import { fullName, requireAdmin } from "@/lib/admin";
import { formatDateTime } from "@/lib/format";
import { voiceLabel } from "@/lib/voices";
import { prettyResponse, SOURCE_LABEL, StatusPill } from "../shared";
import ui from "@/components/ui.module.css";
import styles from "../requests.module.css";

export const metadata: Metadata = { title: "Generation request" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Response = {
  id: string;
  api_model_id: string;
  prompt: string;
  response: string | null;
  status: "ok" | "error";
  error: string | null;
  latency_ms: number | null;
  created_at: string;
};

export default async function RequestPage(props: PageProps<"/requests/[id]">) {
  const { supabase } = await requireAdmin();
  const { id } = await props.params;
  if (!UUID.test(id)) notFound();

  const { data: r } = await supabase
    .from("generation_requests")
    .select("*, chain:prompt_chains(slug, name), post:generations(id, image_url, status, kind)")
    .eq("id", id)
    .maybeSingle();
  if (!r) notFound();

  const [{ data: responses }, { data: person }] = await Promise.all([
    supabase
      .from("llm_responses")
      .select("id, api_model_id, prompt, response, status, error, latency_ms, created_at")
      .eq("request_id", id)
      .order("created_at")
      .returns<Response[]>(),
    r.user_id
      ? supabase.from("profiles").select("id, first_name, last_name, email").eq("id", r.user_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const calls = responses ?? [];
  const totalMs = calls.reduce((sum, c) => sum + (c.latency_ms ?? 0), 0);
  const post = r.post as { id: string; image_url: string; status: string; kind: string } | null;
  const chain = r.chain as { slug: string; name: string } | null;

  return (
    <>
      <Link href="/requests" className={ui.back}>
        ← All requests
      </Link>
      <PageHead
        kicker={`Generation request · ${formatDateTime(r.created_at)}`}
        title={`${SOURCE_LABEL[r.source] ?? r.source} · ${voiceLabel(r.voice)}`}
        actions={<StatusPill status={r.status} />}
      >
        {r.backfilled
          ? "Rebuilt from a post saved before logging began: the prompt and model are what was stored then, and the response lists the captions still on file."
          : `Requested by ${person ? fullName(person) : r.source === "daily" ? "the nightly job" : "a deleted member"}.`}
      </PageHead>

      <div className={ui.tiles} style={{ marginBottom: "1rem" }}>
        <StatTile label="Model calls" value={calls.length} note={`${calls.filter((c) => c.status === "error").length} failed`} />
        <StatTile label="Time with models" value={totalMs ? `${(totalMs / 1000).toFixed(1)}s` : "—"} />
        <StatTile label="Captions written" value={r.caption_count ?? "—"} note={r.model ? `by ${r.model}` : undefined} />
      </div>

      <div className={styles.layout}>
        <section className={ui.card}>
          <h2 className={ui.cardTitle}>Request</h2>
          <dl className={ui.facts} style={{ marginTop: "0.9rem" }}>
            <dt>Prompt chain</dt>
            <dd>
              {chain ? (
                <Link href={`/chains/${chain.slug}`} className={ui.link}>
                  {chain.name}
                </Link>
              ) : (
                "—"
              )}
            </dd>
            {r.mood && (
              <>
                <dt>Remix mood</dt>
                <dd>{r.mood}</dd>
              </>
            )}
            <dt>Theme</dt>
            <dd>{r.theme ?? "None"}</dd>
            <dt>Started</dt>
            <dd>{formatDateTime(r.created_at)}</dd>
            <dt>Finished</dt>
            <dd>{formatDateTime(r.completed_at)}</dd>
            {r.error && (
              <>
                <dt>Error</dt>
                <dd className="mono">{r.error}</dd>
              </>
            )}
            <dt>Request ID</dt>
            <dd className="mono">{r.id}</dd>
          </dl>
          {post ? (
            <Link href={`/media/${post.id}`} className={styles.post}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={post.image_url} alt="" />
              <span>
                <strong>The {post.kind === "daily" ? "daily meme" : "post"} these captions went into</strong>
                <span className={ui.link}>Open in AI media →</span>
              </span>
            </Link>
          ) : (
            <p className={ui.insight}>
              {r.status === "failed"
                ? "No post: the job failed."
                : "Not linked to a post (it was deleted, or the captions weren't used)."}
            </p>
          )}
        </section>

        <section className={ui.stack}>
          <h2 className={ui.cardTitle}>LLM responses</h2>
          {calls.length === 0 ? (
            <div className={ui.empty}>No model calls were logged for this request.</div>
          ) : (
            calls.map((c, i) => (
              <article key={c.id} id={c.id} className={`${ui.card} ${styles.call}`}>
                <div className={styles.callHead}>
                  <span className="mono">
                    #{i + 1} · {c.api_model_id}
                  </span>
                  {c.status === "ok" ? <span className="pill pill-good">✓ OK</span> : <span className="pill pill-warn">✕ Error</span>}
                  <span className={ui.muted}>{c.latency_ms !== null ? `${(c.latency_ms / 1000).toFixed(2)}s` : "no timing"}</span>
                </div>
                {c.error && <p className={`${ui.error} ${styles.callError}`}>{c.error}</p>}
                <h3 className={styles.label}>Response</h3>
                <pre className={styles.code}>{prettyResponse(c.response)}</pre>
                <details>
                  <summary className={ui.link}>Prompt sent ({c.prompt.length.toLocaleString()} characters)</summary>
                  <pre className={styles.code}>{c.prompt}</pre>
                </details>
              </article>
            ))
          )}
        </section>
      </div>
    </>
  );
}
