import type { Metadata } from "next";
import Link from "next/link";
import { CrudManager } from "@/components/crud-manager";
import { PageHead } from "@/components/page-head";
import { requireAdmin } from "@/lib/admin";
import { ENTITIES } from "@/lib/entities";
import { formatDate } from "@/lib/format";
import { SignupChecker } from "../signup-checker";
import ui from "@/components/ui.module.css";

export const metadata: Metadata = { title: "Whitelisted email addresses" };

type Email = { id: string; email: string; note: string | null; created_at: string };

export default async function EmailsPage() {
  const { supabase } = await requireAdmin();
  const [{ data }, { data: members }] = await Promise.all([
    supabase.from("whitelisted_emails").select("id, email, note, created_at").order("email").returns<Email[]>(),
    supabase.from("profiles").select("email").returns<{ email: string | null }[]>(),
  ]);
  const memberEmails = new Set((members ?? []).map((m) => m.email?.toLowerCase()));
  const spec = ENTITIES.emails;

  return (
    <>
      <PageHead kicker="Access · create, read, update, delete" title="Whitelisted email addresses">
        Specific people who can sign up even if their email isn&apos;t on an{" "}
        <Link href="/access/domains" className={ui.link}>
          allowed domain
        </Link>
        , like guests or course staff using a personal account.
      </PageHead>
      <SignupChecker />
      <CrudManager
        entity="emails"
        singular={spec.singular}
        plural={spec.plural}
        fields={spec.fields}
        columns={[
          { key: "email", label: "Email address", kind: "mono" },
          { key: "note", label: "Note", kind: "muted" },
          { key: "member", label: "Has an account", kind: "flag", on: "Member", off: "Not yet" },
          { key: "added", label: "Added", kind: "muted", hideNarrow: true },
        ]}
        rows={(data ?? []).map((e) => ({
          id: e.id,
          values: { email: e.email, note: e.note ?? "" },
          cells: {
            email: e.email,
            note: e.note ?? "",
            member: String(memberEmails.has(e.email)),
            added: formatDate(e.created_at),
          },
        }))}
        emptyText="No whitelisted addresses."
      />
    </>
  );
}
