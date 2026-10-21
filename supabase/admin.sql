-- Admin area for Punchline: a superadmin flag, read-everything policies for
-- superadmins, and admin-only functions for managing AI media and stats.
-- Run once in the Supabase SQL editor (or psql) as the database owner.

------------------------------------------------------------------------------
-- 1. The flag. Nobody can set it through the API, only the database owner.
------------------------------------------------------------------------------

alter table public.profiles add column if not exists is_superadmin boolean not null default false;

-- Members could previously write any profile column (RLS limited them to their
-- own row). Narrow that to the columns the app actually edits, so a member
-- can't PATCH is_superadmin on their own profile.
revoke insert, update on public.profiles from anon, authenticated;
grant insert (id, email, first_name, last_name, favorite_category, avatar_url, updated_at)
  on public.profiles to authenticated;
grant update (id, email, first_name, last_name, favorite_category, avatar_url, updated_at)
  on public.profiles to authenticated;

-- Belt and braces: even if a grant is widened later, API roles can't flip it.
create or replace function public.guard_superadmin_flag()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if (tg_op = 'INSERT' and new.is_superadmin)
       or (tg_op = 'UPDATE' and new.is_superadmin is distinct from old.is_superadmin) then
      raise exception 'is_superadmin can only be changed by the database owner' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_superadmin_flag on public.profiles;
create trigger guard_superadmin_flag
  before insert or update on public.profiles
  for each row execute function public.guard_superadmin_flag();

-- True when the signed-in user is a superadmin. Security definer so policies
-- can call it without recursing into the profiles policies.
create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.is_superadmin from public.profiles p where p.id = (select auth.uid())),
    false
  );
$$;

revoke execute on function public.is_superadmin() from public, anon;
grant execute on function public.is_superadmin() to authenticated;

------------------------------------------------------------------------------
-- 2. Superadmins can read everything (policies are OR'd with the member ones).
------------------------------------------------------------------------------

drop policy if exists "Superadmins read all profiles" on public.profiles;
create policy "Superadmins read all profiles" on public.profiles
  for select to authenticated using ((select public.is_superadmin()));

drop policy if exists "Superadmins read all media" on public.generations;
create policy "Superadmins read all media" on public.generations
  for select to authenticated using ((select public.is_superadmin()));

drop policy if exists "Superadmins read all captions" on public.captions;
create policy "Superadmins read all captions" on public.captions
  for select to authenticated using ((select public.is_superadmin()));

drop policy if exists "Superadmins read all ratings" on public.caption_votes;
create policy "Superadmins read all ratings" on public.caption_votes
  for select to authenticated using ((select public.is_superadmin()));

drop policy if exists "Superadmins read all duels" on public.caption_duels;
create policy "Superadmins read all duels" on public.caption_duels
  for select to authenticated using ((select public.is_superadmin()));

drop policy if exists "Superadmins read all battles" on public.post_battles;
create policy "Superadmins read all battles" on public.post_battles
  for select to authenticated using ((select public.is_superadmin()));

-- Deleting media (captions, votes, and remixes cascade).
drop policy if exists "Superadmins delete media" on public.generations;
create policy "Superadmins delete media" on public.generations
  for delete to authenticated using ((select public.is_superadmin()));

drop policy if exists "Superadmins delete caption photos" on storage.objects;
create policy "Superadmins delete caption photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'caption-photos' and (select public.is_superadmin()));

------------------------------------------------------------------------------
-- 3. Creating and editing media goes through functions that check the flag.
--    The member triggers force new posts to be drafts owned by the caller; an
--    admin write sets a transaction-local flag so the trigger keeps its values.
------------------------------------------------------------------------------

create or replace function public.stamp_generation_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.caption_id := null;
  new.battle_wins := 0;
  new.battle_losses := 0;

  -- Admin functions set this flag; it only counts if the caller really is one.
  if current_setting('punchline.admin_write', true) = 'on' and public.is_superadmin() then
    return new;
  end if;

  if auth.uid() is null then
    if new.kind is distinct from 'daily' then
      raise exception 'only daily posts can be created without a signed-in user';
    end if;
    new.user_id := null;
    new.status := 'published';
    new.published_at := now();
    new.author_name := coalesce(new.author_name, 'Punchline AI');
    return new;
  end if;

  new.user_id := auth.uid();
  new.kind := 'member';
  new.status := 'draft';
  new.published_at := null;
  new.daily_for := null;
  new.photo_credit := null;
  new.photo_source_url := null;
  select nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(left(p.last_name, 1) || '.', '')), '')
    into new.author_name
    from public.profiles p
   where p.id = auth.uid();
  return new;
end;
$$;

create or replace function public.admin_create_generation(
  p_image_url text,
  p_image_path text,
  p_theme text,
  p_voice text,
  p_author_name text,
  p_captions text[],
  p_chosen integer,
  p_publish boolean,
  p_prompt text,
  p_model text,
  p_photo_credit text default null,
  p_photo_source_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_caption uuid;
  v_count integer := coalesce(array_length(p_captions, 1), 0);
begin
  if not public.is_superadmin() then
    raise exception 'superadmins only' using errcode = '42501';
  end if;
  if v_count < 1 or v_count > 4 then
    raise exception 'a post needs 1 to 4 captions';
  end if;
  if p_chosen < 1 or p_chosen > v_count then
    raise exception 'the chosen caption must be one of the captions';
  end if;
  if p_voice not in ('groupchat', 'sarcastic', 'wholesome', 'dramatic') then
    raise exception 'unknown caption style';
  end if;
  if p_image_url !~ '^https://' then
    raise exception 'the image must be an https URL';
  end if;

  perform set_config('punchline.admin_write', 'on', true);

  insert into public.generations (
    user_id, kind, status, image_url, image_path, theme, voice, author_name,
    prompt, model, photo_credit, photo_source_url
  )
  values (
    auth.uid(), 'member', 'draft', p_image_url, p_image_path, nullif(trim(p_theme), ''), p_voice,
    coalesce(nullif(trim(p_author_name), ''), 'Punchline AI'), p_prompt, p_model,
    nullif(trim(p_photo_credit), ''), nullif(trim(p_photo_source_url), '')
  )
  returning id into v_id;

  -- A published post keeps only its chosen caption (like the app's caption
  -- battle). A draft keeps all of them so its owner can battle them later.
  -- Captions keep their original position, which the stats use.
  for i in 1 .. v_count loop
    if not p_publish or i = p_chosen then
      insert into public.captions (generation_id, position, text)
      values (v_id, i, trim(p_captions[i]))
      returning id into v_caption;
      if i = p_chosen then
        update public.generations set caption_id = v_caption where id = v_id;
      end if;
    end if;
  end loop;

  if p_publish then
    update public.generations set status = 'published' where id = v_id;
  end if;

  return v_id;
end;
$$;

create or replace function public.admin_update_generation(
  p_id uuid,
  p_theme text,
  p_voice text,
  p_author_name text,
  p_caption_id uuid,
  p_publish boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_superadmin() then
    raise exception 'superadmins only' using errcode = '42501';
  end if;
  if p_voice is not null and p_voice not in ('groupchat', 'sarcastic', 'wholesome', 'dramatic') then
    raise exception 'unknown caption style';
  end if;

  -- guard_generation_update still checks the caption belongs to this post
  -- and that published posts never go back to draft.
  update public.generations g
     set theme = nullif(trim(p_theme), ''),
         voice = coalesce(p_voice, g.voice),
         author_name = coalesce(nullif(trim(p_author_name), ''), g.author_name),
         caption_id = coalesce(p_caption_id, g.caption_id),
         status = case when p_publish then 'published' else g.status end
   where g.id = p_id;

  if not found then
    raise exception 'no such post';
  end if;
end;
$$;

create or replace function public.admin_update_caption(p_id uuid, p_text text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_superadmin() then
    raise exception 'superadmins only' using errcode = '42501';
  end if;
  update public.captions set text = trim(p_text) where id = p_id;
  if not found then
    raise exception 'no such caption';
  end if;
end;
$$;

revoke execute on function public.admin_create_generation(text, text, text, text, text, text[], integer, boolean, text, text, text, text) from public, anon;
revoke execute on function public.admin_update_generation(uuid, text, text, text, uuid, boolean) from public, anon;
revoke execute on function public.admin_update_caption(uuid, text) from public, anon;
grant execute on function public.admin_create_generation(text, text, text, text, text, text[], integer, boolean, text, text, text, text) to authenticated;
grant execute on function public.admin_update_generation(uuid, text, text, text, uuid, boolean) to authenticated;
grant execute on function public.admin_update_caption(uuid, text) to authenticated;

------------------------------------------------------------------------------
-- 4. Dashboard statistics, computed in one round trip.
------------------------------------------------------------------------------

create or replace function public.admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'America/New_York')::date;
  v_result jsonb;
begin
  if not public.is_superadmin() then
    raise exception 'superadmins only' using errcode = '42501';
  end if;

  with actions as (
    select created_at, 'upload'::text as kind from public.generations where kind = 'member'
    union all select created_at, 'vote' from public.post_battles
    union all select created_at, 'duel' from public.caption_duels
    union all select created_at, 'rating' from public.caption_votes
    union all select created_at, 'remix' from public.caption_remixes
  )
  select jsonb_build_object(
    'today', v_today,
    'totals', jsonb_build_object(
      'members', (select count(*) from public.profiles),
      'admins', (select count(*) from public.profiles where is_superadmin),
      'published', (select count(*) from public.generations where kind = 'member' and status = 'published'),
      'drafts', (select count(*) from public.generations where kind = 'member' and status = 'draft'),
      'daily', (select count(*) from public.generations where kind = 'daily'),
      'captions', (select count(*) from public.captions),
      'remixes', (select count(*) from public.caption_remixes),
      'post_votes', (select count(*) from public.post_battles),
      'duels', (select count(*) from public.caption_duels),
      'upvotes', (select count(*) from public.caption_votes where value = 1),
      'downvotes', (select count(*) from public.caption_votes where value = -1),
      'jokes', (select count(*) from public.jokes),
      'themes', (select count(*) from public.daily_themes)
    ),
    -- Last 30 New York days: uploads, votes of every kind, and sign-ups.
    'activity', (
      select jsonb_agg(jsonb_build_object(
        'day', s.day::date,
        'uploads', coalesce(a.uploads, 0),
        'votes', coalesce(a.votes, 0),
        'signups', coalesce(p.signups, 0)
      ) order by s.day)
      from generate_series(v_today - 29, v_today, interval '1 day') as s(day)
      left join (
        select (created_at at time zone 'America/New_York')::date as day,
               count(*) filter (where kind = 'upload') as uploads,
               count(*) filter (where kind in ('vote', 'duel', 'rating')) as votes
          from actions group by 1
      ) a on a.day = s.day::date
      left join (
        select (created_at at time zone 'America/New_York')::date as day, count(*) as signups
          from public.profiles group by 1
      ) p on p.day = s.day::date
    ),
    -- Every action by weekday (1 = Monday) and hour, New York time.
    'heatmap', (
      select coalesce(jsonb_agg(jsonb_build_object('dow', dow, 'hour', hour, 'n', n)), '[]'::jsonb)
      from (
        select extract(isodow from created_at at time zone 'America/New_York')::int as dow,
               extract(hour from created_at at time zone 'America/New_York')::int as hour,
               count(*) as n
          from actions group by 1, 2
      ) h
    ),
    -- Which of the AI's four drafts won the caption battle.
    'positions', (
      select coalesce(jsonb_agg(jsonb_build_object('position', position, 'n', n) order by position), '[]'::jsonb)
      from (
        select c.position, count(*) as n
          from public.generations g
          join public.captions c on c.id = g.caption_id
         where g.kind = 'member' and g.status = 'published' and c.remix_id is null
         group by c.position
      ) x
    ),
    'remix_winners', (
      select count(*)
        from public.generations g
        join public.captions c on c.id = g.caption_id
       where c.remix_id is not null
    ),
    'voices', (
      select coalesce(jsonb_agg(jsonb_build_object('voice', voice, 'posts', posts, 'wins', wins, 'losses', losses) order by posts desc), '[]'::jsonb)
      from (
        select voice, count(*) as posts, sum(battle_wins) as wins, sum(battle_losses) as losses
          from public.generations
         where kind = 'member' and status = 'published'
         group by voice
      ) v
    ),
    'moods', (
      select coalesce(jsonb_agg(jsonb_build_object('mood', mood, 'remixes', remixes, 'wins', wins) order by remixes desc), '[]'::jsonb)
      from (
        select r.mood, count(*) as remixes,
               count(*) filter (where exists (
                 select 1 from public.captions c join public.generations g on g.caption_id = c.id
                  where c.remix_id = r.id
               )) as wins
          from public.caption_remixes r
         group by r.mood
      ) m
    ),
    'models', (
      select coalesce(jsonb_agg(jsonb_build_object('model', model, 'n', n) order by n desc), '[]'::jsonb)
      from (
        select coalesce(model, 'unknown') as model, count(*) as n from public.generations group by 1
      ) m
    ),
    'trend_sources', (
      select coalesce(jsonb_agg(jsonb_build_object('source', source, 'n', n) order by n desc), '[]'::jsonb)
      from (select source, count(*) as n from public.daily_themes group by source) t
    ),
    'daily_memes', (
      select coalesce(jsonb_agg(d order by d.day desc), '[]'::jsonb)
      from (
        select g.id, g.daily_for as day, g.image_url, g.theme, g.photo_credit,
               (select count(*) from public.caption_duels x where x.generation_id = g.id) as duels,
               (select c.text from public.captions c where c.generation_id = g.id
                 order by (c.duel_wins + 1.0) / (c.duel_wins + c.duel_losses + 2) desc, c.position
                 limit 1) as leader
          from public.generations g
         where g.kind = 'daily'
         order by g.daily_for desc
         limit 14
      ) d
    ),
    -- Daily-meme captions that have been judged: length vs. win rate.
    'caption_lengths', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id,
        'words', array_length(regexp_split_to_array(trim(c.text), '\s+'), 1),
        'wins', c.duel_wins, 'losses', c.duel_losses, 'text', c.text
      )), '[]'::jsonb)
        from public.captions c
        join public.generations g on g.id = c.generation_id
       where g.kind = 'daily' and c.duel_wins + c.duel_losses > 0
    ),
    'people', (
      select coalesce(jsonb_agg(p order by p.votes desc, p.uploads desc), '[]'::jsonb)
      from (
        select pr.id, pr.first_name, pr.last_name, pr.avatar_url,
               (select count(*) from public.generations g where g.user_id = pr.id) as uploads,
               (select count(*) from public.post_battles b where b.user_id = pr.id)
                 + (select count(*) from public.caption_duels d where d.user_id = pr.id)
                 + (select count(*) from public.caption_votes v where v.user_id = pr.id) as votes
          from public.profiles pr
         order by votes desc, uploads desc
         limit 5
      ) p
    ),
    'hall_of_fame', (
      select coalesce(jsonb_agg(h), '[]'::jsonb)
      from (
        select g.id, g.image_url, g.author_name, g.battle_wins, g.battle_losses, c.text as caption
          from public.generations g
          left join public.captions c on c.id = g.caption_id
         where g.kind = 'member' and g.status = 'published'
         order by g.battle_rating desc, g.battle_wins desc, g.published_at desc
         limit 5
      ) h
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;
