import type { Metadata } from "next";
import Link from "next/link";
import { HBars, SERIES } from "@/components/charts";
import { CrudManager } from "@/components/crud-manager";
import { PageHead } from "@/components/page-head";
import { requireAdmin } from "@/lib/admin";
import { ENTITIES } from "@/lib/entities";
import { compact } from "@/lib/format";
import ui from "@/components/ui.module.css";

export const metadata: Metadata = { title: "LLM models" };

type Model = {
  id: string;
  provider_id: string;
  name: string;
  api_model_id: string;
  priority: number;
  temperature: number;
  supports_images: boolean;
  is_active: boolean;
};

/** Providers the code can call; models of other providers are listed but skipped. */
const WIRED_PROVIDERS = new Set(["google"]);

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export default async function ModelsPage() {
  const { supabase } = await requireAdmin();
  const [{ data: models }, { data: providers }, { data: calls }] = await Promise.all([
    supabase
      .from("llm_models")
      .select("id, provider_id, name, api_model_id, priority, temperature, supports_images, is_active")
      .order("priority")
      .order("api_model_id")
      .returns<Model[]>(),
    supabase
      .from("llm_providers")
      .select("id, name, slug, is_active")
      .order("name")
      .returns<{ id: string; name: string; slug: string; is_active: boolean }[]>(),
    supabase
      .from("llm_responses")
      .select("api_model_id, status, latency_ms")
      .order("created_at", { ascending: false })
      .limit(5000)
      .returns<{ api_model_id: string; status: string; latency_ms: number | null }[]>(),
  ]);
  const providerBy = new Map((providers ?? []).map((p) => [p.id, p]));
  const spec = ENTITIES.models;
  const fields = spec.fields.map((f) =>
    f.name === "provider_id" ? { ...f, options: (providers ?? []).map((p) => ({ value: p.id, label: p.name })) } : f,
  );

  // The order the caption writer actually tries, given what's active and wired up.
  const chain = (models ?? []).filter((m) => {
    const p = providerBy.get(m.provider_id);
    return m.is_active && m.supports_images && p?.is_active && WIRED_PROVIDERS.has(p.slug);
  });

  // Model health from the response log.
  const byModel = new Map<string, { calls: number; ok: number; latencies: number[] }>();
  for (const c of calls ?? []) {
    const entry = byModel.get(c.api_model_id) ?? { calls: 0, ok: 0, latencies: [] };
    entry.calls += 1;
    if (c.status === "ok") entry.ok += 1;
    if (c.latency_ms !== null) entry.latencies.push(c.latency_ms);
    byModel.set(c.api_model_id, entry);
  }
  const health = [...byModel.entries()].sort((a, b) => b[1].calls - a[1].calls);

  return (
    <>
      <PageHead kicker="AI pipeline · create, read, update, delete" title="LLM models">
        The models the caption writer calls, in fallback order: it starts with the lowest number and moves down the list
        when a model is busy or rate limited. Turn one off to take it out of rotation; changes apply to the next caption
        job in Punchline and here.
      </PageHead>

      <div className={`${ui.grid2} ${ui.stack}`} style={{ marginBottom: "1rem" }}>
        <section className={ui.card}>
          <div className={ui.cardHead}>
            <div>
              <h2 className={ui.cardTitle}>Fallback order right now</h2>
              <p className={ui.cardSub}>Active models that accept images, from active providers the code can call.</p>
            </div>
          </div>
          {chain.length === 0 ? (
            <p className={ui.error}>
              No usable model is active, so the caption writer falls back to its built-in list. Turn one back on.
            </p>
          ) : (
            <ol style={{ display: "grid", gap: "0.4rem", paddingLeft: "1.2rem" }}>
              {chain.map((m) => (
                <li key={m.id}>
                  <strong>{m.name}</strong> <span className={`${ui.muted} mono`}>{m.api_model_id}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className={ui.card}>
          <div className={ui.cardHead}>
            <div>
              <h2 className={ui.cardTitle}>Model health</h2>
              <p className={ui.cardSub}>
                From the{" "}
                <Link href="/responses" className={ui.link}>
                  LLM response log
                </Link>
                : calls, success rate, and median response time.
              </p>
            </div>
          </div>
          {health.length === 0 ? (
            <div className={ui.empty}>No model calls logged yet.</div>
          ) : (
            <HBars
              color={SERIES[0]}
              rows={health.map(([model, h]) => {
                const rate = Math.round((h.ok / h.calls) * 100);
                const ms = median(h.latencies);
                return {
                  key: model,
                  label: <span className="mono">{model}</span>,
                  value: h.calls,
                  display: `${compact(h.calls)} · ${rate}% ok${ms !== null ? ` · ${(ms / 1000).toFixed(1)}s` : ""}`,
                  tip: `${model}\n${h.calls} calls, ${h.ok} succeeded (${rate}%)${ms !== null ? `\nmedian ${(ms / 1000).toFixed(1)}s` : "\nno timings (backfilled history)"}`,
                };
              })}
            />
          )}
        </section>
      </div>

      <CrudManager
        entity="models"
        singular={spec.singular}
        plural={spec.plural}
        fields={fields}
        columns={[
          { key: "priority", label: "Order", kind: "mono" },
          { key: "name", label: "Model" },
          { key: "api_model_id", label: "API model ID", kind: "mono" },
          { key: "provider", label: "Provider", hideNarrow: true },
          { key: "temperature", label: "Temp.", kind: "mono", hideNarrow: true },
          { key: "is_active", label: "Status", kind: "flag", on: "Active", off: "Off" },
        ]}
        rows={(models ?? []).map((m) => {
          const provider = providerBy.get(m.provider_id);
          return {
            id: m.id,
            values: {
              provider_id: m.provider_id,
              name: m.name,
              api_model_id: m.api_model_id,
              priority: m.priority,
              temperature: Number(m.temperature),
              supports_images: m.supports_images,
              is_active: m.is_active,
            },
            cells: {
              priority: String(m.priority),
              name: m.supports_images ? m.name : `${m.name} (text only)`,
              api_model_id: m.api_model_id,
              provider: provider
                ? `${provider.name}${WIRED_PROVIDERS.has(provider.slug) ? "" : " (not wired up in code)"}`
                : "—",
              temperature: Number(m.temperature).toFixed(2),
              is_active: String(m.is_active),
            },
          };
        })}
        emptyText="No models. The caption writer will use its built-in Gemini list until you add one."
      />
    </>
  );
}
