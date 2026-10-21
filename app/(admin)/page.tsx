import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin";
import { getStats, parseRange } from "@/lib/stats";
import { OverviewView } from "./overview-view";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage(props: PageProps<"/">) {
  const { supabase } = await requireAdmin();
  const { range } = await props.searchParams;
  return <OverviewView s={await getStats(supabase, parseRange(range))} />;
}
