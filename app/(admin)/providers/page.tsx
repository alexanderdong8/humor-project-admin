import type { Metadata } from "next";
import Link from "next/link";
import { CrudManager } from "@/components/crud-manager";
import { PageHead } from "@/components/page-head";
import { requireAdmin } from "@/lib/admin";
import { ENTITIES } from "@/lib/entities";
import ui from "@/components/ui.module.css";

export const metadata: Metadata = { title: "LLM providers" };

type Provider = {
  id: string;
  name: string;
  slug: string;
  api_base_url: string | null;
  api_key_env: string | null;
  notes: string | null;
  is_active: boolean;
};

export default async function ProvidersPage() {
  const { supabase } = await requireAdmin();
  const [{ data: providers }, { data: models }] = await Promise.all([
    supabase
      .from("llm_providers")
      .select("id, name, slug, api_base_url, api_key_env, notes, is_active")
      .order("name")
      .returns<Provider[]>(),
    supabase.from("llm_models").select("provider_id, is_active").returns<{ provider_id: string; is_active: boolean }[]>(),
  ]);
  const spec = ENTITIES.providers;
  const counts = new Map<string, { all: number; active: number }>();
  for (const m of models ?? []) {
    const c = counts.get(m.provider_id) ?? { all: 0, active: 0 };
    c.all += 1;
    if (m.is_active) c.active += 1;
    counts.set(m.provider_id, c);
  }

  return (
    <>
      <PageHead kicker="AI pipeline · create, read, update, delete" title="LLM providers">
        The companies behind the{" "}
        <Link href="/models" className={ui.link}>
          models
        </Link>
        . A provider stores where its API lives and the <em>name</em> of the environment variable holding its key, never
        the key itself. The code currently knows how to call the <span className="mono">google</span> provider; turning a
        provider off takes all of its models out of rotation. A provider can&apos;t be deleted while it has models.
      </PageHead>
      <CrudManager
        entity="providers"
        singular={spec.singular}
        plural={spec.plural}
        fields={spec.fields}
        columns={[
          { key: "name", label: "Provider" },
          { key: "slug", label: "Slug", kind: "mono" },
          { key: "api_key_env", label: "Key variable", kind: "mono", hideNarrow: true },
          { key: "models", label: "Models" },
          { key: "notes", label: "Notes", kind: "muted", hideNarrow: true },
          { key: "is_active", label: "Status", kind: "flag", on: "Active", off: "Off" },
        ]}
        rows={(providers ?? []).map((p) => {
          const c = counts.get(p.id) ?? { all: 0, active: 0 };
          return {
            id: p.id,
            values: {
              name: p.name,
              slug: p.slug,
              api_base_url: p.api_base_url ?? "",
              api_key_env: p.api_key_env ?? "",
              notes: p.notes ?? "",
              is_active: p.is_active,
            },
            cells: {
              name: p.name,
              slug: p.slug,
              api_key_env: p.api_key_env ?? "",
              models: `${c.active} active of ${c.all}`,
              notes: p.notes ?? "",
              is_active: String(p.is_active),
            },
          };
        })}
        emptyText="No providers yet."
      />
    </>
  );
}
