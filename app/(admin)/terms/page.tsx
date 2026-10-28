import type { Metadata } from "next";
import Link from "next/link";
import { CrudManager } from "@/components/crud-manager";
import { PageHead } from "@/components/page-head";
import { requireAdmin } from "@/lib/admin";
import { ENTITIES } from "@/lib/entities";
import ui from "@/components/ui.module.css";

export const metadata: Metadata = { title: "Terms" };

type Term = { id: string; term: string; definition: string; is_active: boolean };

export default async function TermsPage() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.from("terms").select("id, term, definition, is_active").order("term").returns<Term[]>();
  const spec = ENTITIES.terms;
  const terms = data ?? [];
  const active = terms.filter((t) => t.is_active).length;

  return (
    <>
      <PageHead kicker="AI pipeline · create, read, update, delete" title="Terms">
        Local words and places the caption writer may use: Columbia buildings, dining halls, subway lines. Active terms
        go into every caption prompt (the &ldquo;Local terms&rdquo; step of each{" "}
        <Link href="/chains" className={ui.link}>
          prompt chain
        </Link>
        ), up to 20. {active} of {terms.length} are active.
      </PageHead>
      <CrudManager
        entity="terms"
        singular={spec.singular}
        plural={spec.plural}
        fields={spec.fields}
        columns={[
          { key: "term", label: "Term" },
          { key: "definition", label: "What it means", kind: "long" },
          { key: "is_active", label: "In prompts", kind: "flag", on: "Active", off: "Off" },
        ]}
        rows={terms.map((t) => ({
          id: t.id,
          values: { term: t.term, definition: t.definition, is_active: t.is_active },
          cells: { term: t.term, definition: t.definition, is_active: String(t.is_active) },
        }))}
        emptyText="No terms yet. Add one and it shows up in the next caption prompt."
      />
    </>
  );
}
