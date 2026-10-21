import type { Metadata } from "next";
import Link from "next/link";
import { fullName, requireAdmin } from "@/lib/admin";
import { formatDate, timeAgo } from "@/lib/format";
import ui from "@/components/ui.module.css";

export const metadata: Metadata = { title: "Users" };

type ProfileRow = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  is_superadmin: boolean;
  created_at: string;
  updated_at: string;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function countBy(rows: { user_id: string | null }[] | null) {
  const counts = new Map<string, number>();
  for (const r of rows ?? []) if (r.user_id) counts.set(r.user_id, (counts.get(r.user_id) ?? 0) + 1);
  return counts;
}

/** Read-only: members manage their own profiles in the main app. */
export default async function UsersPage(props: PageProps<"/users">) {
  const { supabase } = await requireAdmin();
  const searchParams = await props.searchParams;
  const q = (first(searchParams.q) ?? "").trim().slice(0, 80);
  const role = first(searchParams.role) === "admins" ? "admins" : "all";

  let query = supabase
    .from("profiles")
    .select("id, email, first_name, last_name, avatar_url, is_superadmin, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (role === "admins") query = query.eq("is_superadmin", true);
  if (q) {
    // Strip characters that mean something to PostgREST's filter syntax.
    const term = q.replace(/[%,()*\\]/g, " ");
    query = query.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%`);
  }

  const [{ data: profiles, error }, { data: posts }, { data: battles }, { data: duels }, { data: ratings }, { data: remixes }] =
    await Promise.all([
      query.returns<ProfileRow[]>(),
      supabase.from("generations").select("user_id").eq("kind", "member"),
      supabase.from("post_battles").select("user_id"),
      supabase.from("caption_duels").select("user_id"),
      supabase.from("caption_votes").select("user_id"),
      supabase.from("caption_remixes").select("user_id"),
    ]);

  const uploads = countBy(posts);
  const votes = [countBy(battles), countBy(duels), countBy(ratings)];
  const remixCounts = countBy(remixes);
  const votesFor = (id: string) => votes.reduce((sum, m) => sum + (m.get(id) ?? 0), 0);
  const rows = profiles ?? [];

  return (
    <>
      <header className={ui.head}>
        <div>
          <p className={ui.kicker}>Users · read only</p>
          <h1 className={ui.title}>Members</h1>
          <p className={ui.lede}>
            Everyone with a profile. Members edit their own names and photos in Punchline; superadmin access is granted
            only in the database.
          </p>
        </div>
      </header>

      <div className={ui.toolbar}>
        <nav className={ui.tabs} aria-label="Filter">
          <Link href={q ? `/users?q=${encodeURIComponent(q)}` : "/users"} aria-current={role === "all" ? "page" : undefined}>
            Everyone
          </Link>
          <Link href="/users?role=admins" aria-current={role === "admins" ? "page" : undefined}>
            Superadmins
          </Link>
        </nav>
        <form className={ui.search} role="search">
          {role === "admins" && <input type="hidden" name="role" value="admins" />}
          <input className="input" type="search" name="q" defaultValue={q} placeholder="Search name or email" aria-label="Search users" />
          <button type="submit" className="btn">
            Search
          </button>
        </form>
      </div>

      {error ? (
        <p className={ui.error} role="alert">
          Couldn&apos;t load profiles: {error.message}
        </p>
      ) : rows.length === 0 ? (
        <div className={ui.empty}>
          <strong>No members match.</strong>
          {q && <Link href="/users" className={ui.link}>Clear search</Link>}
        </div>
      ) : (
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th scope="col">Member</th>
                <th scope="col">Role</th>
                <th scope="col">Joined</th>
                <th scope="col" className={ui.num}>
                  Uploads
                </th>
                <th scope="col" className={ui.num}>
                  Votes cast
                </th>
                <th scope="col" className={ui.num}>
                  Remixes
                </th>
                <th scope="col">Profile updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const name = fullName(p);
                return (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/users/${p.id}`} className={ui.person}>
                        {p.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.avatar_url} alt="" className={ui.avatar} />
                        ) : (
                          <span className={ui.avatar} aria-hidden="true">
                            {name.slice(0, 1)}
                          </span>
                        )}
                        <span className={ui.personText}>
                          <span className={ui.link}>{name}</span>
                          <span>{p.email}</span>
                        </span>
                      </Link>
                    </td>
                    <td>
                      {p.is_superadmin ? <span className="pill pill-sun">★ Superadmin</span> : <span className="pill">Member</span>}
                    </td>
                    <td className={ui.nowrap}>{formatDate(p.created_at)}</td>
                    <td className={ui.num}>{uploads.get(p.id) ?? 0}</td>
                    <td className={ui.num}>{votesFor(p.id)}</td>
                    <td className={ui.num}>{remixCounts.get(p.id) ?? 0}</td>
                    <td className={`${ui.nowrap} ${ui.muted}`}>{timeAgo(p.updated_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className={ui.pager}>
        <span>
          {rows.length} {rows.length === 1 ? "member" : "members"}
          {q ? ` matching “${q}”` : ""}
        </span>
      </p>
    </>
  );
}
