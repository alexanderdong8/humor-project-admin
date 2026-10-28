import type { Metadata } from "next";
import Link from "next/link";
import { StatTile } from "@/components/charts";
import { PageHead } from "@/components/page-head";
import { requireAdmin } from "@/lib/admin";
import { formatDateTime } from "@/lib/format";
import { prettyResponse, SOURCE_LABEL } from "../requests/shared";
import ui from "@/components/ui.module.css";
import styles from "../requests/requests.module.css";

export const metadata: Metadata = { title: "LLM responses" };

const PAGE_SIZE = 30;

type Row = {
  id: string;
  request_id: string;
  api_model_id: string;
  response: string | null;
  status: "ok" | "error";
  error: string | null;
  latency_ms: number | null;
  created_at: string;
  request: { source: string; backfilled: boolean } | null;
};

function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function ResponsesPage(props: PageProps<"/responses">) {
  const { supabase } = await requireAdmin();
  const sp = await props.searchParams;
  const model = first(sp.model)?.slice(0, 100);
  const errorsOnly = first(sp.status) === "error";
  const requested = Number(first(sp.page));
  const page = Number.isInteger(requested) && requested > 0 ? requested : 1;
  const from = (page - 1) * PAGE_SIZE;

  let query = supabase
    .from("llm_responses")
    .select("id, request_id, api_model_id, response, status, error, latency_ms, created_at, request:generation_requests(source, backfilled)", {
      count: "exact",
    });
  if (model) query = query.eq("api_model_id", model);
  if (errorsOnly) query = query.eq("status", "error");
  const [{ data, count }, { data: summary }] = await Promise.all([
    query.order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1).returns<Row[]>(),
    supabase.from("llm_responses").select("api_model_id, status, latency_ms").returns<{ api_model_id: string; status: string; latency_ms: number | null }[]>(),
  ]);
  const rows = data ?? [];
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const all = summary ?? [];
  const models = [...new Set(all.map((r) => r.api_model_id))].sort();
  const timed = all.filter((r) => r.latency_ms !== null).map((r) => r.latency_ms!);
  const avg = timed.length ? timed.reduce((a, b) => a + b, 0) / timed.length : null;

  const href = (next: { model?: string | null; errors?: boolean; page?: number }) => {
    const params = new URLSearchParams();
    const m = next.model === undefined ? model : next.model;
    if (m) params.set("model", m);
    if (next.errors ?? errorsOnly) params.set("status", "error");
    if ((next.page ?? 1) > 1) params.set("page", String(next.page));
    const q = params.toString();
    return q ? `/responses?${q}` : "/responses";
  };

  return (
    <>
      <PageHead kicker="AI pipeline · read only" title="LLM responses">
        Every call to a model and exactly what came back: the raw response, how long it took, and any error. A{" "}
        <Link href="/requests" className={ui.link}>
          generation request
        </Link>{" "}
        has one response per model it tried.
      </PageHead>

      <div className={ui.tiles} style={{ marginBottom: "1.25rem" }}>
        <StatTile label="Responses" value={all.length} />
        <StatTile
          label="Errors"
          value={all.filter((r) => r.status === "error").length}
          note="rate limits, timeouts, empty answers"
        />
        <StatTile label="Average response time" value={avg !== null ? `${(avg / 1000).toFixed(1)}s` : "—"} note={`${timed.length} timed calls`} />
      </div>

      <div className={ui.toolbar}>
        <nav className={ui.tabs} aria-label="Model">
          <Link href={href({ model: null })} aria-current={!model ? "page" : undefined}>
            All models
          </Link>
          {models.map((m) => (
            <Link key={m} href={href({ model: m })} aria-current={m === model ? "page" : undefined}>
              {m}
            </Link>
          ))}
        </nav>
        <nav className={ui.tabs} aria-label="Status">
          <Link href={href({ errors: false })} aria-current={!errorsOnly ? "page" : undefined}>
            Any result
          </Link>
          <Link href={href({ errors: true })} aria-current={errorsOnly ? "page" : undefined}>
            Errors only
          </Link>
        </nav>
      </div>

      {rows.length === 0 ? (
        <div className={ui.empty}>No responses match.</div>
      ) : (
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Model</th>
                <th scope="col">Result</th>
                <th scope="col" className={ui.num}>
                  Time
                </th>
                <th scope="col">Response</th>
                <th scope="col" className={ui.hideNarrow}>
                  Request
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className={`${ui.nowrap} ${ui.muted}`}>{formatDateTime(r.created_at)}</td>
                  <td className="mono" style={{ fontSize: "0.82rem", whiteSpace: "nowrap" }}>
                    {r.api_model_id}
                  </td>
                  <td className={ui.nowrap}>
                    {r.status === "ok" ? <span className="pill pill-good">✓ OK</span> : <span className="pill pill-warn">✕ Error</span>}
                  </td>
                  <td className={ui.num}>{r.latency_ms !== null ? `${(r.latency_ms / 1000).toFixed(1)}s` : "—"}</td>
                  <td className={styles.snippet}>
                    <details>
                      <summary className={ui.clamp} style={{ cursor: "pointer" }}>
                        {r.status === "error" ? r.error : (r.response ?? "").slice(0, 160)}
                      </summary>
                      <pre className={styles.code}>{r.status === "error" ? r.error : prettyResponse(r.response)}</pre>
                    </details>
                  </td>
                  <td className={`${ui.nowrap} ${ui.hideNarrow}`}>
                    <Link href={`/requests/${r.request_id}#${r.id}`} className={ui.link}>
                      {SOURCE_LABEL[r.request?.source ?? ""] ?? "Request"}
                    </Link>
                    {r.request?.backfilled && <span className={ui.muted}> · backfilled</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <nav className={ui.pager} aria-label="Pagination">
        {page > 1 ? <Link href={href({ page: page - 1 })}>← Newer</Link> : <span aria-disabled="true">← Newer</span>}
        <span>
          Page {page} of {pages} · {total} {total === 1 ? "response" : "responses"}
        </span>
        {page < pages ? <Link href={href({ page: page + 1 })}>Older →</Link> : <span aria-disabled="true">Older →</span>}
      </nav>
    </>
  );
}
