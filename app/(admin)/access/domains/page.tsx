import type { Metadata } from "next";
import Link from "next/link";
import { CrudManager } from "@/components/crud-manager";
import { PageHead } from "@/components/page-head";
import { requireAdmin } from "@/lib/admin";
import { ENTITIES } from "@/lib/entities";
import { formatDate } from "@/lib/format";
import { SignupChecker } from "../signup-checker";
import ui from "@/components/ui.module.css";

export const metadata: Metadata = { title: "Allowed sign-up domains" };

type Domain = { id: string; domain: string; note: string | null; created_at: string };

export default async function DomainsPage() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase
    .from("allowed_signup_domains")
    .select("id, domain, note, created_at")
    .order("domain")
    .returns<Domain[]>();
  const spec = ENTITIES.domains;

  return (
    <>
      <PageHead kicker="Access · create, read, update, delete" title="Allowed sign-up domains">
        Who can create a Punchline account. A new account&apos;s email must end in one of these domains (subdomains
        included) or be on the{" "}
        <Link href="/access/emails" className={ui.link}>
          email whitelist
        </Link>
        . The database enforces it when the account is created; existing members are never affected. If both lists are
        empty, anyone can sign up.
      </PageHead>
      <SignupChecker />
      <CrudManager
        entity="domains"
        singular={spec.singular}
        plural={spec.plural}
        fields={spec.fields}
        columns={[
          { key: "domain", label: "Domain", kind: "mono" },
          { key: "note", label: "Note", kind: "muted" },
          { key: "added", label: "Added", kind: "muted", hideNarrow: true },
        ]}
        rows={(data ?? []).map((d) => ({
          id: d.id,
          values: { domain: d.domain, note: d.note ?? "" },
          cells: { domain: `@${d.domain}`, note: d.note ?? "", added: formatDate(d.created_at) },
        }))}
        emptyText="No domains. Only whitelisted emails can sign up (or anyone, if the whitelist is empty too)."
      />
    </>
  );
}
