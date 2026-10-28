import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/page-head";
import { fullName, requireAdmin } from "@/lib/admin";
import { formatDate } from "@/lib/format";
import { ImageActions, ImageUploader } from "./image-tools";
import ui from "@/components/ui.module.css";
import styles from "./images.module.css";

export const metadata: Metadata = { title: "Images" };

type Image = {
  id: string;
  storage_path: string;
  public_url: string;
  description: string | null;
  source: "member" | "library";
  uploaded_by: string | null;
  created_at: string;
};

const FILTERS = [
  { id: "all", label: "All images" },
  { id: "library", label: "Uploaded here" },
  { id: "member", label: "Member uploads" },
] as const;

export default async function ImagesPage(props: PageProps<"/images">) {
  const { supabase, user } = await requireAdmin();
  const { source: sourceParam } = await props.searchParams;
  const filter = FILTERS.find((f) => f.id === sourceParam)?.id ?? "all";

  let query = supabase
    .from("images")
    .select("id, storage_path, public_url, description, source, uploaded_by, created_at")
    .order("created_at", { ascending: false })
    .limit(120);
  if (filter !== "all") query = query.eq("source", filter);
  const [{ data: images }, { data: posts }, { data: people }] = await Promise.all([
    query.returns<Image[]>(),
    supabase.from("generations").select("id, image_path").returns<{ id: string; image_path: string }[]>(),
    supabase.from("profiles").select("id, first_name, last_name, email"),
  ]);

  const usage = new Map<string, string[]>();
  for (const p of posts ?? []) usage.set(p.image_path, [...(usage.get(p.image_path) ?? []), p.id]);
  const personBy = new Map((people ?? []).map((p) => [p.id, p]));
  const list = images ?? [];

  return (
    <>
      <PageHead kicker="Images · create, read, update, delete" title="Images">
        Every photo in Punchline&apos;s storage: the ones members upload with their posts, and a library you can upload
        to here. Caption any of them as new{" "}
        <Link href="/media" className={ui.link}>
          AI media
        </Link>
        . Deleting an image that posts use deletes those posts too, after you confirm.
      </PageHead>

      <ImageUploader userId={user.id} />

      <div className={ui.toolbar} style={{ marginTop: "1.25rem" }}>
        <nav className={ui.tabs} aria-label="Source">
          {FILTERS.map((f) => (
            <Link key={f.id} href={f.id === "all" ? "/images" : `/images?source=${f.id}`} aria-current={f.id === filter ? "page" : undefined}>
              {f.label}
            </Link>
          ))}
        </nav>
        <span className={ui.muted}>
          {list.length} {list.length === 1 ? "image" : "images"}
        </span>
      </div>

      {list.length === 0 ? (
        <div className={ui.empty}>No images here yet. Upload one above.</div>
      ) : (
        <ul className={styles.grid}>
          {list.map((img) => {
            const used = usage.get(img.storage_path) ?? [];
            const person = img.uploaded_by ? personBy.get(img.uploaded_by) : null;
            return (
              <li key={img.id} className={styles.card}>
                <a href={img.public_url} target="_blank" rel="noreferrer" className={styles.photo}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.public_url} alt={img.description ?? ""} loading="lazy" />
                </a>
                <div className={styles.body}>
                  <p className={styles.description}>
                    {img.description ?? <span className={ui.muted}>No description</span>}
                  </p>
                  <p className={styles.meta}>
                    {img.source === "library" ? <span className="pill pill-sun">Library</span> : <span className="pill">Member upload</span>}{" "}
                    {person ? fullName(person) : "—"} · {formatDate(img.created_at)}
                  </p>
                  <p className={styles.meta}>
                    {used.length === 0 ? (
                      "Not in any post"
                    ) : (
                      <>
                        In{" "}
                        <Link href={`/media/${used[0]}`} className={ui.link}>
                          {used.length === 1 ? "1 post" : `${used.length} posts`}
                        </Link>
                      </>
                    )}
                  </p>
                  <ImageActions id={img.id} description={img.description ?? ""} usedBy={used.length} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
