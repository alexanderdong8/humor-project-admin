import type { Metadata } from "next";
import Link from "next/link";
import { CrudManager } from "@/components/crud-manager";
import { PageHead } from "@/components/page-head";
import { requireAdmin } from "@/lib/admin";
import { ENTITIES } from "@/lib/entities";
import { formatDate } from "@/lib/format";
import ui from "@/components/ui.module.css";

export const metadata: Metadata = { title: "AI generation examples" };

type Example = {
  id: string;
  chain_id: string | null;
  caption: string;
  notes: string | null;
  is_active: boolean;
  updated_at: string;
};

export default async function ExamplesPage() {
  const { supabase } = await requireAdmin();
  const [{ data: examples }, { data: chains }] = await Promise.all([
    supabase
      .from("generation_examples")
      .select("id, chain_id, caption, notes, is_active, updated_at")
      .order("updated_at", { ascending: false })
      .returns<Example[]>(),
    supabase.from("prompt_chains").select("id, name").order("sort_order").returns<{ id: string; name: string }[]>(),
  ]);
  const chainName = new Map((chains ?? []).map((c) => [c.id, c.name]));
  const spec = ENTITIES.examples;
  const fields = spec.fields.map((f) =>
    f.name === "chain_id" ? { ...f, options: (chains ?? []).map((c) => ({ value: c.id, label: c.name })) } : f,
  );

  return (
    <>
      <PageHead kicker="AI pipeline · create, read, update, delete" title="AI generation examples">
        Example captions shown to the model as a guide to the style (the &ldquo;Examples&rdquo; step of each{" "}
        <Link href="/chains" className={ui.link}>
          prompt chain
        </Link>
        ). Each style uses up to 3: its own newest active examples first, then ones marked &ldquo;Every style&rdquo;.
      </PageHead>
      <CrudManager
        entity="examples"
        singular={spec.singular}
        plural={spec.plural}
        fields={fields}
        columns={[
          { key: "caption", label: "Example caption", kind: "long" },
          { key: "chain", label: "Style" },
          { key: "notes", label: "Notes", kind: "muted", hideNarrow: true },
          { key: "is_active", label: "In prompts", kind: "flag", on: "Active", off: "Off" },
          { key: "updated", label: "Updated", kind: "muted", hideNarrow: true },
        ]}
        rows={(examples ?? []).map((e) => ({
          id: e.id,
          values: { chain_id: e.chain_id ?? "", caption: e.caption, notes: e.notes ?? "", is_active: e.is_active },
          cells: {
            caption: `“${e.caption}”`,
            chain: e.chain_id ? (chainName.get(e.chain_id) ?? "Unknown") : "Every style",
            notes: e.notes ?? "",
            is_active: String(e.is_active),
            updated: formatDate(e.updated_at),
          },
        }))}
        emptyText="No examples. Without them the model writes from the style description alone."
      />
    </>
  );
}
