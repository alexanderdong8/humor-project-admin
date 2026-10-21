import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin";
import { getStats } from "@/lib/stats";
import { OverviewView } from "./overview-view";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage() {
  const { supabase } = await requireAdmin();
  return <OverviewView s={await getStats(supabase)} />;
}
