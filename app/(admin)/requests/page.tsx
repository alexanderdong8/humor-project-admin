import type { Metadata } from "next";
import Link from "next/link";
import { StatTile } from "@/components/charts";
import { PageHead } from "@/components/page-head";
import { fullName, requireAdmin } from "@/lib/admin";
import { formatDateTime } from "@/lib/format";
import { voiceLabel } from "@/lib/voices";
import { SOURCE_LABEL, StatusPill } from "./shared";
import ui from "@/components/ui.module.css";

export const metadata: Metadata = { title: "Generation requests" };

const PAGE_SIZE = 40;
const SOURCES = [
  { id: "all", label: "All" },
  { id: "upload", label: "Uploads" },
  { id: "remix", label: "Remixes" },
  { id: "daily", label: "Daily meme" },
  { id: "admin", label: "Backstage" },
] as const;
type Source = (typeof SOURCES)[number]["id"];

type Request = {
  id: string;
  user_id: string | null;
  source: string;
  voice: string | null;
  mood: string | null;
  status: "pending" | "succeeded" | "failed";
  model: string | null;
  caption_count: number | null;
  error: string | null;
  generation_id: string | null;
  backfilled: boolean;
  created_at: string;
  completed_at: string | null;
};

function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function RequestsPage(props: PageProps<"/requests">) {
  const { supabase } = await requireAdmin();
  const sp = await props.searchParams;
  const sourceParam = first(sp.source);
  const source: Source = SOURCES.some((s) => s.id === sourceParam) ? (sourceParam as Source) : "all";
  const chainSlug = first(sp.chain);
  const failedOnly = first(sp.status) === "failed";
  const requested = Number(first(sp.page));
  const page = Number.isInteger(requested) && requested > 0 ? requested : 1;

  const chain = chainSlug
    ? (await supabase.from("prompt_chains").select("id, name").eq("slug", chainSlug).maybeSingle()).data
    : null;

  let query = supabase
    .from("generation_requests")
    .select("id, user_id, source, voice, mood, status, model, caption_count, error, generation_id, backfilled, created_at, completed_at", {
      count: "exact",
    });
  if (source !== "all") query = query.eq("source", source);
  if (chain) query = query.eq("chain_id", chain.id);
  if (failedOnly) query = query.eq("status", "failed");
  const from = (page - 1) * PAGE_SIZE;
  const [{ data, count }, { data: all }, { data: people }] = await Promise.all([
    query.order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1).returns<Request[]>(),
    supabase.from("generation_requests").select("status, created_at").returns<{ status: string; created_at: string }[]>(),
    supabase.from("profiles").select("id, first_name, last_name, email"),
  ]);
  const personBy = new Map((people ?? []).map((p) => [p.id, p]));
  const rows = data ?? [];
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const everything = all ?? [];
  const finished = everything.filter((r) => r.status !== "pending");
  const succeeded = everything.filter((r) => r.status === "succeeded").length;
  const week = everything.filter((r) => Date.now() - Date.parse(r.created_at) < 7 * 86_400_000).length;

  const href = (next: { source?: Source; page?: number; failed?: boolean }) => {
    const params = new URLSearchParams();
    const s = next.source ?? source;
    if (s !== "all") params.set("source", s);
    if (chainSlug && chain) params.set("chain", chainSlug);
    if (next.failed ?? failedOnly) params.set("status", "failed");
    if ((next.page ?? 1) > 1) params.set("page", String(next.page));
    const q = params.toString();
    return q ? `/requests?${q}` : "/requests";
  };

  return (
    <>
      <PageHead kicker="AI pipeline · read only" title="Generation requests">
        Every caption job: an upload, a remix, a share of the daily meme, or media made here in Backstage. Each request
        is one run of a{" "}
        <Link href="/chains" className={ui.link}>
          prompt chain
        </Link>{" "}
        and can involve several{" "}
        <Link href="/responses" className={ui.link}>
          model calls
        </Link>{" "}
        when the first model is busy. Requests from before logging began are rebuilt from saved posts and marked
        &ldquo;backfilled&rdquo;.
      </PageHead>

      <div className={ui.tiles} style={{ marginBottom: "1.25rem" }}>
        <StatTile label="Requests" value={everything.length} note={`${week} in the last 7 days`} />
        <StatTile
          label="Success rate"
          value={finished.length ? `${Math.round((succeeded / finished.length) * 100)}%` : "—"}
          note={`${finished.length - succeeded} failed`}
        />
        <StatTile label="Pending" value={everything.length - finished.length} note="still running or interrupted" />
      </div>

      <div className={ui.toolbar}>
        <nav className={ui.tabs} aria-label="Source">
          {SOURCES.map((s) => (
            <Link key={s.id} href={href({ source: s.id })} aria-current={s.id === source ? "page" : undefined}>
              {s.label}
            </Link>
          ))}
        </nav>
        <nav className={ui.tabs} aria-label="Status">
          <Link href={href({ failed: false })} aria-current={!failedOnly ? "page" : undefined}>
            Any status
          </Link>
          <Link href={href({ failed: true })} aria-current={failedOnly ? "page" : undefined}>
            Failed only
          </Link>
        </nav>
      </div>
      {chain && (
        <p className={ui.notice} style={{ background: "var(--sun-soft)", color: "var(--sun-ink)" }}>
          Showing requests for <strong>{chain.name}</strong>.{" "}
          <Link href="/requests" className={ui.link}>
            Show all
          </Link>
        </p>
      )}

      {rows.length === 0 ? (
        <div className={ui.empty}>No requests match.</div>
      ) : (
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Source</th>
                <th scope="col" className={ui.hideNarrow}>
                  Who
                </th>
                <th scope="col">Style</th>
                <th scope="col">Status</th>
                <th scope="col" className={ui.hideNarrow}>
                  Model
                </th>
                <th scope="col" className={ui.num}>
                  Captions
                </th>
                <th scope="col">
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const person = r.user_id ? personBy.get(r.user_id) : null;
                return (
                  <tr key={r.id}>
                    <td className={`${ui.nowrap} ${ui.muted}`}>{formatDateTime(r.created_at)}</td>
                    <td className={ui.nowrap}>
                      {SOURCE_LABEL[r.source] ?? r.source}
                      {r.backfilled && (
                        <span className="pill" style={{ marginLeft: "0.35rem" }}>
                          backfilled
                        </span>
                      )}
                    </td>
                    <td className={`${ui.nowrap} ${ui.hideNarrow}`}>
                      {person ? fullName(person) : r.source === "daily" ? "Nightly job" : "—"}
                    </td>
                    <td className={ui.nowrap}>
                      {voiceLabel(r.voice)}
                      {r.mood ? ` · ${r.mood}` : ""}
                    </td>
                    <td className={ui.nowrap}>
                      <StatusPill status={r.status} />
                    </td>
                    <td className={`mono ${ui.hideNarrow}`} style={{ fontSize: "0.82rem" }}>
                      {r.model ?? "—"}
                    </td>
                    <td className={ui.num}>{r.caption_count ?? "—"}</td>
                    <td className={ui.nowrap}>
                      <Link href={`/requests/${r.id}`} className={ui.link}>
                        Details
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <nav className={ui.pager} aria-label="Pagination">
        {page > 1 ? <Link href={href({ page: page - 1 })}>← Newer</Link> : <span aria-disabled="true">← Newer</span>}
        <span>
          Page {page} of {pages} · {total} {total === 1 ? "request" : "requests"}
        </span>
        {page < pages ? <Link href={href({ page: page + 1 })}>Older →</Link> : <span aria-disabled="true">Older →</span>}
      </nav>
    </>
  );
}
