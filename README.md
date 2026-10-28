# Punchline Backstage

The admin area for [Punchline](https://github.com/alexanderdong8/humor-project), the AI caption game. It reads and manages the same Supabase database. Built with Next.js 16 (App Router) and Supabase, deployed on Vercel.

## What it does

- **Overview** (`/`): statistics built from one database call (`admin_stats(days)`), with a **7 / 30 / 90 day** control for the activity charts:
  - total votes cast (the hero number) and member, upload, caption, remix, and joke counts
  - uploads and votes over the chosen window (daily columns, or weekly ones for 90 days)
  - a weekday-by-hour activity heatmap for the same window, with its peak
  - **"Does the AI's first draft win?"**: which of Gemini's four captions won each caption battle, against the 25% you'd expect by chance
  - caption styles and their win rates, and remix moods with how often the remix beat the original
  - where daily themes came from (X vs. Google Trends) and which Gemini model answered
  - a reel of the last two weeks of daily AI memes with the caption members ranked first
  - daily-meme caption length vs. win rate, the most active members, and a hall of fame

  Every chart has hover/focus tooltips and a "Show the numbers" table.
- **Users** (`/users`, `/users/[id]`): read every profile with uploads, votes cast, and remixes; search by name or email; open a page per member with their profile, uploads, and an activity timeline. **Make admin / Remove admin** promotes an existing member to superadmin, or removes it, after a confirm step.
- **AI media** (`/media`, `/media/new`, `/media/[id]`), create / read / update / delete:
  - **Create:** pick an Imgflip meme template or upload a photo, let Gemini write four captions with the main app's prompt, edit them, choose the one that goes on the photo, then publish it or save it as a draft.
  - **Read:** browse and filter everything (live uploads, drafts, daily memes), and see each post's captions, vote record, prompt, and model.
  - **Update:** edit the theme, style, author, which caption is shown, any caption's text, and publish a draft.
  - **Delete:** a post along with its captions, votes, and uploaded photo.
- **Votes & ratings** (`/votes`), read only: every upload-vs-upload vote, daily-meme caption pick, and up/down rating, with who cast it and what won.

### The AI pipeline (supabase/pipeline.sql)

The caption writer in both apps is driven by data you manage here.

- **Prompt chains** (`/chains`, `/chains/[slug]`): read the four caption-style chains and their steps (ground rules, task, image context, style, examples, theme, local terms), including the exact prompt each would send right now. **Read/update the mix**: how many of the daily meme's 4 captions each chain writes. The nightly job follows it.
- **Terms** (`/terms`), CRUD: local words and places (Butler, JJ's, the 1 train...) added to every caption prompt.
- **AI generation examples** (`/examples`), CRUD: example captions shown to the model, per style or for every style.
- **LLM models** (`/models`), CRUD: which models are called, in fallback order, at what temperature. Turning one off takes it out of rotation on the next request. Also shows model health from the response log.
- **LLM providers** (`/providers`), CRUD: where each provider's API lives and the *name* of its key's environment variable. Keys never go in the database.
- **Generation requests** (`/requests`, `/requests/[id]`), read: every caption job (upload, remix, daily meme, Backstage) with status, model, and the post it produced.
- **LLM responses** (`/responses`), read: every model call with its raw response, timing, and errors.

Older posts were backfilled into the request log from their saved prompt and model.

### Access and images

- **Allowed sign-up domains** and **whitelisted email addresses** (`/access/domains`, `/access/emails`), CRUD. A trigger on `auth.users` refuses new accounts whose email is neither whitelisted nor on an allowed domain (subdomains included); existing members are never affected. Includes a "check an address" tool that runs the same check.
- **Images** (`/images`), CRUD with upload: every photo in storage, member uploads (registered automatically by a trigger) and a library you upload to here. Edit descriptions, caption any image as new AI media, and delete images no post uses.

## Who can get in

Every route is behind Google sign-in **and** `profiles.is_superadmin = true`. It's checked in three places:

1. **`proxy.ts`** runs on every request. With no session it redirects to `/login`; signed in without the flag, to `/denied`. Only `/login` and `/auth/callback` are reachable signed out.
2. **`requireAdmin()`** runs in the admin layout and every page, and `adminOrNull()` in every server action, so nothing renders or writes without the check.
3. **The database** (`supabase/admin.sql`) is the real boundary. Superadmin read access comes from row-level security policies that call `is_superadmin()`. Writes go through `security definer` functions (`admin_create_generation`, `admin_update_generation`, `admin_update_caption`, `admin_set_superadmin`) that raise unless the caller is a superadmin. Even someone holding the public anon key and their own session can't read other people's data or call the admin functions.

Members can't make themselves admins:
- `insert`/`update` on `profiles` is granted only column by column (not `is_superadmin`).
- A trigger rejects any change to the flag that comes from the `anon` or `authenticated` roles.
- The only way to change it through the API is `admin_set_superadmin()`. It requires the caller to already be a superadmin and refuses to let anyone remove their own access, so the panel can never end up with zero admins.

## The lockout question

> If a database field is required to use the admin area, won't you be locked out?

No. The flag is set **outside the app**, with access the app never has. Whoever owns the Supabase project can run SQL as the database owner, through the Supabase SQL editor, `psql` with the connection string, or the Supabase MCP server. That connection bypasses row-level security and isn't subject to the column grants or the trigger (they only stop the API roles). So the first superadmin is bootstrapped with one statement:

```sql
update public.profiles set is_superadmin = true where email = 'you@example.com';
```

Sign in to Punchline once first, so a profile row exists for that Google account. After that first admin exists, everyone else is promoted from inside the panel (Users → Make admin), which only an existing superadmin can do.

## Setup

1. Run `supabase/admin.sql` and then `supabase/pipeline.sql` once as the database owner, then the bootstrap statement above.
2. In Supabase → Authentication → URL Configuration, add the admin site's callback to **Redirect URLs**, e.g. `https://humor-project-admin*.vercel.app/**` and `http://localhost:3001/**`.
3. Create `.env`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable or anon key>
   GEMINI_API_KEY=<key from aistudio.google.com/apikey>
   ```
4. `npm install`, then `npm run dev` and open http://localhost:3001.

No service-role key is used anywhere. The admin site acts with the signed-in admin's own session, and the database decides what that session may do.
