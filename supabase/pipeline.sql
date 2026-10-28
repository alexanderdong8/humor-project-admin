-- The AI pipeline behind Punchline's captions, made data-driven and
-- manageable from Backstage:
--   llm_providers / llm_models      which models the caption writer calls, in order
--   prompt_chains / steps           the prompt templates each caption style sends
--   prompt_chain_mix                how many of the daily meme's captions each style writes
--   terms / generation_examples     local slang and example captions fed into prompts
--   generation_requests / llm_responses   a log of every caption job and model call
--   allowed_signup_domains / whitelisted_emails   who may create an account
--   images                          the photo library (member uploads + admin uploads)
-- Run once as the database owner, after admin.sql. Safe to re-run.

------------------------------------------------------------------------------
-- Shared helpers
------------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

------------------------------------------------------------------------------
-- 1. LLM providers and models (CRUD in Backstage)
------------------------------------------------------------------------------

create table if not exists public.llm_providers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  api_base_url text check (api_base_url is null or api_base_url ~ '^https://'),
  -- The NAME of the environment variable holding the key. Keys never live in the database.
  api_key_env text check (api_key_env is null or api_key_env ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  is_active boolean not null default true,
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.llm_models (
  id uuid primary key default gen_random_uuid(),
  -- Restrict: a provider can't be deleted while it still has models.
  provider_id uuid not null references public.llm_providers (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 80),
  api_model_id text not null unique check (api_model_id ~ '^[A-Za-z0-9._:/-]{2,100}$'),
  -- Lower runs first; the writer falls through the list when a model is busy.
  priority integer not null default 10 check (priority between 0 and 1000),
  temperature numeric(3, 2) not null default 1 check (temperature between 0 and 2),
  supports_images boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists llm_models_provider_idx on public.llm_models (provider_id);

------------------------------------------------------------------------------
-- 2. Prompt chains, their steps, and the daily mix
------------------------------------------------------------------------------

create table if not exists public.prompt_chains (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  voice text not null check (voice in ('groupchat', 'sarcastic', 'wholesome', 'dramatic')),
  description text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.prompt_chain_steps (
  id uuid primary key default gen_random_uuid(),
  chain_id uuid not null references public.prompt_chains (id) on delete cascade,
  position integer not null check (position >= 1),
  name text not null,
  role text not null check (role in ('system', 'user')),
  -- {{placeholders}} are filled in by the caption writer; a step whose
  -- placeholder has no value (e.g. no theme today) is left out.
  template text not null,
  created_at timestamptz not null default now(),
  unique (chain_id, position)
);

create table if not exists public.prompt_chain_mix (
  chain_id uuid primary key references public.prompt_chains (id) on delete cascade,
  caption_count integer not null default 1 check (caption_count between 0 and 4),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

------------------------------------------------------------------------------
-- 3. Terms and generation examples (CRUD, fed into prompts)
------------------------------------------------------------------------------

create table if not exists public.terms (
  id uuid primary key default gen_random_uuid(),
  term text not null check (char_length(term) between 1 and 60),
  definition text not null check (char_length(definition) between 1 and 300),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists terms_term_key on public.terms (lower(term));

create table if not exists public.generation_examples (
  id uuid primary key default gen_random_uuid(),
  -- null: an example for every style.
  chain_id uuid references public.prompt_chains (id) on delete cascade,
  caption text not null check (char_length(caption) between 1 and 200),
  notes text check (notes is null or char_length(notes) <= 300),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

------------------------------------------------------------------------------
-- 4. Generation requests and LLM responses (written by the pipeline, read in Backstage)
------------------------------------------------------------------------------

create table if not exists public.generation_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  source text not null check (source in ('upload', 'remix', 'daily', 'admin')),
  chain_id uuid references public.prompt_chains (id) on delete set null,
  voice text,
  mood text,
  theme text,
  image_url text,
  generation_id uuid references public.generations (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed')),
  model text,
  caption_count integer,
  error text,
  backfilled boolean not null default false,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists generation_requests_created_idx on public.generation_requests (created_at desc);
create index if not exists generation_requests_user_idx on public.generation_requests (user_id, created_at desc);
create index if not exists generation_requests_generation_idx on public.generation_requests (generation_id);

create table if not exists public.llm_responses (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.generation_requests (id) on delete cascade,
  model_id uuid references public.llm_models (id) on delete set null,
  api_model_id text not null,
  prompt text not null,
  response text,
  status text not null check (status in ('ok', 'error')),
  error text,
  latency_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists llm_responses_request_idx on public.llm_responses (request_id);
create index if not exists llm_responses_created_idx on public.llm_responses (created_at desc);

------------------------------------------------------------------------------
-- 5. Who may sign up (CRUD), enforced when Supabase creates the account
------------------------------------------------------------------------------

create table if not exists public.allowed_signup_domains (
  id uuid primary key default gen_random_uuid(),
  domain text not null unique check (domain = lower(domain) and domain ~ '^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$'),
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whitelisted_emails (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email) and email ~ '^[^@\s]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$'),
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- If either list has entries, a new account's email must be whitelisted or
-- end in an allowed domain (subdomains count: cs.columbia.edu ⊂ columbia.edu).
-- Existing accounts are never affected; this only runs when one is created.
create or replace function public.email_may_sign_up(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (not exists (select 1 from public.allowed_signup_domains) and not exists (select 1 from public.whitelisted_emails))
    or exists (select 1 from public.whitelisted_emails w where w.email = lower(trim(p_email)))
    or exists (
      select 1 from public.allowed_signup_domains d
       where split_part(lower(trim(p_email)), '@', 2) = d.domain
          or split_part(lower(trim(p_email)), '@', 2) like '%.' || d.domain
    );
$$;

create or replace function public.enforce_signup_allowlist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.email_may_sign_up(coalesce(new.email, '')) then
    raise exception 'signup_not_allowed: % is not on the sign-up allowlist', coalesce(new.email, 'this account')
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_signup_allowlist on auth.users;
create trigger enforce_signup_allowlist
  before insert on auth.users
  for each row execute function public.enforce_signup_allowlist();

------------------------------------------------------------------------------
-- 6. Images: every photo in the caption-photos bucket (CRUD + upload)
------------------------------------------------------------------------------

create table if not exists public.images (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique check (storage_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]+$'),
  public_url text not null check (public_url ~ '^https://'),
  description text check (description is null or char_length(description) <= 300),
  -- 'member': uploaded with a post in Punchline; 'library': uploaded in Backstage.
  source text not null check (source in ('member', 'library')),
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Member uploads register themselves when their post is created, and leave
-- with it (the app deletes the photo file along with the post).
create or replace function public.register_generation_image()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.image_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]+$' then
      insert into public.images (storage_path, public_url, source, uploaded_by, created_at)
      values (new.image_path, new.image_url, 'member', new.user_id, new.created_at)
      on conflict (storage_path) do nothing;
    end if;
    return new;
  end if;
  delete from public.images
   where storage_path = old.image_path and source = 'member'
     and not exists (select 1 from public.generations g where g.image_path = old.image_path and g.id <> old.id);
  return old;
end;
$$;

drop trigger if exists register_generation_image on public.generations;
create trigger register_generation_image
  after insert or delete on public.generations
  for each row execute function public.register_generation_image();

------------------------------------------------------------------------------
-- 7. Timestamps and row-level security
------------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['llm_providers', 'llm_models', 'terms', 'generation_examples',
                           'allowed_signup_domains', 'whitelisted_emails', 'images'] loop
    execute format('drop trigger if exists touch_updated_at on public.%I', t);
    execute format('create trigger touch_updated_at before update on public.%I
                    for each row execute function public.touch_updated_at()', t);
  end loop;

  -- Everything is superadmin-only through the API. The pipeline reads and
  -- writes through the security-definer functions below.
  foreach t in array array['llm_providers', 'llm_models', 'prompt_chains', 'prompt_chain_steps',
                           'prompt_chain_mix', 'terms', 'generation_examples', 'generation_requests',
                           'llm_responses', 'allowed_signup_domains', 'whitelisted_emails', 'images'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('drop policy if exists "Superadmins read" on public.%I', t);
    execute format('create policy "Superadmins read" on public.%I for select to authenticated
                    using ((select public.is_superadmin()))', t);
  end loop;

  -- Full create/update/delete for the managed lists.
  foreach t in array array['llm_providers', 'llm_models', 'terms', 'generation_examples',
                           'allowed_signup_domains', 'whitelisted_emails', 'images'] loop
    execute format('drop policy if exists "Superadmins write" on public.%I', t);
    execute format('create policy "Superadmins write" on public.%I for all to authenticated
                    using ((select public.is_superadmin())) with check ((select public.is_superadmin()))', t);
  end loop;
end;
$$;

-- Chains, steps, requests, and responses are read-only through the API; the
-- mix is updated only through admin_set_chain_mix().
revoke insert, update, delete on public.prompt_chains, public.prompt_chain_steps, public.prompt_chain_mix,
  public.generation_requests, public.llm_responses from authenticated;

------------------------------------------------------------------------------
-- 8. Functions the caption pipeline calls (members' sessions, Backstage, and
--    the nightly job's theme_writer login)
------------------------------------------------------------------------------

-- Everything the caption writer needs for one style: prompt steps, a few
-- example captions, local terms, and the active models in fallback order.
create or replace function public.caption_pipeline(p_chain text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'chain', (select jsonb_build_object('id', c.id, 'slug', c.slug, 'name', c.name)
                from public.prompt_chains c where c.slug = p_chain and c.is_active),
    'steps', coalesce((
      select jsonb_agg(jsonb_build_object('position', s.position, 'name', s.name, 'role', s.role, 'template', s.template)
                       order by s.position)
        from public.prompt_chain_steps s
        join public.prompt_chains c on c.id = s.chain_id
       where c.slug = p_chain and c.is_active), '[]'::jsonb),
    'examples', coalesce((
      select jsonb_agg(x.caption)
        from (select e.caption
                from public.generation_examples e
                left join public.prompt_chains c on c.id = e.chain_id
               where e.is_active and (e.chain_id is null or c.slug = p_chain)
               order by e.chain_id is null, e.updated_at desc
               limit 3) x), '[]'::jsonb),
    'terms', coalesce((
      select jsonb_agg(jsonb_build_object('term', x.term, 'definition', x.definition))
        from (select t.term, t.definition from public.terms t where t.is_active order by lower(t.term) limit 20) x),
      '[]'::jsonb),
    'models', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'api_model_id', m.api_model_id, 'provider', p.slug,
                                          'temperature', m.temperature, 'supports_images', m.supports_images)
                       order by m.priority, m.api_model_id)
        from public.llm_models m
        join public.llm_providers p on p.id = m.provider_id
       where m.is_active and p.is_active), '[]'::jsonb)
  );
$$;

-- The daily meme's mix: which styles write how many of its captions.
create or replace function public.daily_caption_mix()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('chain', c.slug, 'voice', c.voice, 'count', m.caption_count)
                            order by c.sort_order), '[]'::jsonb)
    from public.prompt_chain_mix m
    join public.prompt_chains c on c.id = m.chain_id
   where c.is_active and m.caption_count > 0;
$$;

-- Starts a log entry for one caption job. Labels can't be spoofed: 'admin'
-- needs a superadmin, 'daily' needs the nightly job (no signed-in user).
create or replace function public.log_generation_request(
  p_source text, p_chain text, p_voice text, p_mood text, p_theme text, p_image_url text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_user uuid := (select auth.uid());
begin
  if p_source = 'admin' and not public.is_superadmin() then
    raise exception 'only superadmins log admin requests' using errcode = '42501';
  end if;
  if p_source = 'daily' and v_user is not null then
    raise exception 'only the nightly job logs daily requests' using errcode = '42501';
  end if;
  if p_source in ('upload', 'remix') and v_user is null then
    raise exception 'member requests need a signed-in member' using errcode = '42501';
  end if;
  if v_user is not null and (
    select count(*) from public.generation_requests r
     where r.user_id = v_user and r.created_at > now() - interval '1 day') >= 200 then
    raise exception 'too many caption requests today' using errcode = '42501';
  end if;

  insert into public.generation_requests (user_id, source, chain_id, voice, mood, theme, image_url)
  values (v_user, p_source, (select c.id from public.prompt_chains c where c.slug = p_chain), p_voice,
          nullif(p_mood, ''), nullif(p_theme, ''), left(p_image_url, 600))
  returning id into v_id;
  return v_id;
end;
$$;

-- One model call within a job (successful or not).
create or replace function public.log_llm_response(
  p_request uuid, p_model text, p_prompt text, p_response text, p_status text, p_error text, p_latency_ms integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.llm_responses (request_id, model_id, api_model_id, prompt, response, status, error, latency_ms)
  select r.id, (select m.id from public.llm_models m where m.api_model_id = p_model), left(p_model, 100),
         left(p_prompt, 20000), left(p_response, 20000), p_status, left(p_error, 2000), p_latency_ms
    from public.generation_requests r
   where r.id = p_request and r.user_id is not distinct from (select auth.uid()) and r.status = 'pending';
end;
$$;

create or replace function public.finish_generation_request(
  p_id uuid, p_status text, p_model text, p_caption_count integer, p_error text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.generation_requests r
     set status = p_status, model = p_model, caption_count = p_caption_count,
         error = left(p_error, 2000), completed_at = now()
   where r.id = p_id and r.user_id is not distinct from (select auth.uid()) and r.status = 'pending'
     and p_status in ('succeeded', 'failed');
end;
$$;

-- Links a finished job to the post its captions went into.
create or replace function public.attach_generation_request(p_id uuid, p_generation uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.generation_requests r
     set generation_id = p_generation
   where r.id = p_id and r.user_id is not distinct from (select auth.uid())
     and exists (select 1 from public.generations g
                  where g.id = p_generation
                    and (g.user_id is not distinct from (select auth.uid()) or public.is_superadmin()));
end;
$$;

-- Backstage: set the whole daily mix at once; it must add up to 4 captions.
create or replace function public.admin_set_chain_mix(p_mix jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer;
begin
  if not public.is_superadmin() then
    raise exception 'superadmins only' using errcode = '42501';
  end if;
  if jsonb_typeof(p_mix) <> 'object' then
    raise exception 'the mix must map chain slugs to caption counts';
  end if;
  if exists (select 1 from jsonb_each(p_mix) e
              where jsonb_typeof(e.value) <> 'number' or (e.value)::numeric not in (0, 1, 2, 3, 4)) then
    raise exception 'each style writes 0 to 4 captions';
  end if;
  if exists (select 1 from jsonb_object_keys(p_mix) k
              where not exists (select 1 from public.prompt_chains c where c.slug = k and c.is_active)) then
    raise exception 'unknown prompt chain in the mix';
  end if;

  select coalesce(sum((p_mix ->> c.slug)::int), 0) into v_total
    from public.prompt_chains c where c.is_active;
  if v_total <> 4 then
    raise exception 'the daily meme has 4 captions; this mix adds up to %', v_total;
  end if;

  insert into public.prompt_chain_mix (chain_id, caption_count, updated_at, updated_by)
  select c.id, coalesce((p_mix ->> c.slug)::int, 0), now(), (select auth.uid())
    from public.prompt_chains c where c.is_active
  on conflict (chain_id) do update
    set caption_count = excluded.caption_count, updated_at = now(), updated_by = excluded.updated_by;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'caption_pipeline(text)', 'daily_caption_mix()',
    'log_generation_request(text, text, text, text, text, text)',
    'log_llm_response(uuid, text, text, text, text, text, integer)',
    'finish_generation_request(uuid, text, text, integer, text)',
    'attach_generation_request(uuid, uuid)', 'admin_set_chain_mix(jsonb)', 'email_may_sign_up(text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  -- The nightly job (theme_writer login) runs the pipeline for the daily meme.
  if exists (select 1 from pg_roles where rolname = 'theme_writer') then
    foreach f in array array[
      'caption_pipeline(text)', 'daily_caption_mix()',
      'log_generation_request(text, text, text, text, text, text)',
      'log_llm_response(uuid, text, text, text, text, text, integer)',
      'finish_generation_request(uuid, text, text, integer, text)',
      'attach_generation_request(uuid, uuid)'] loop
      execute format('grant execute on function public.%s to theme_writer', f);
    end loop;
  end if;
end;
$$;

------------------------------------------------------------------------------
-- 9. Seed data: what the app used to hard-code, plus backfilled history
------------------------------------------------------------------------------

insert into public.llm_providers (name, slug, api_base_url, api_key_env, notes)
values ('Google AI Studio (Gemini)', 'google', 'https://generativelanguage.googleapis.com', 'GEMINI_API_KEY',
        'Free tier. Text and image input; image generation is not available on this tier.')
on conflict (slug) do nothing;

insert into public.llm_models (provider_id, name, api_model_id, priority, temperature, supports_images)
select p.id, m.name, m.api_model_id, m.priority, 1, true
  from public.llm_providers p
  cross join (values ('Gemini 3.5 Flash', 'gemini-3.5-flash', 1),
                     ('Gemini 3.8 Flash', 'gemini-3.8-flash', 2),
                     ('Gemini 3.5 Flash-Lite', 'gemini-3.5-flash-lite', 3)) as m (name, api_model_id, priority)
 where p.slug = 'google'
on conflict (api_model_id) do nothing;

insert into public.prompt_chains (slug, name, voice, description, sort_order)
values
  ('caption-groupchat', 'Group chat captions', 'groupchat',
   'Casual, lowercase captions that read like a text to friends. Used for uploads in the Group chat style, remixes of them (a mood line and the current caption are appended), and its share of the daily meme.', 1),
  ('caption-sarcastic', 'Sarcastic captions', 'sarcastic',
   'Dry, unimpressed New Yorker captions. Used for uploads in the Sarcastic style, remixes of them, and its share of the daily meme.', 2),
  ('caption-wholesome', 'Wholesome captions', 'wholesome',
   'Sweet, upbeat, a little goofy. Used for uploads in the Wholesome style, remixes of them, and its share of the daily meme.', 3),
  ('caption-dramatic', 'Dramatic captions', 'dramatic',
   'Everything is an epic tragedy or a historic triumph. Used for uploads in the Dramatic style, remixes of them, and its share of the daily meme.', 4)
on conflict (slug) do nothing;

with rules as (
  select $rules$You write captions for Punchline, a comedy site where college students in New York post photos and vote on the funniest caption.

Audience: Columbia undergrads who are chronically online, many of them new to New York, living in the dorms and exploring the city on weekends. Campus life, the subway, bodegas, dorms, dining halls, and being new to the city all land well.

Write exactly the number of captions requested, all in the requested style. Each caption:
- reacts to what is actually in the photo; specific details beat generic jokes
- takes a different angle from the others (an observation, an exaggeration, a relatable confession, an absurd twist)
- is one or two short sentences, under 120 characters
- stands on its own: no numbering, surrounding quotation marks, or hashtags

Keep it PG-13 and punch up, never down. Don't joke about anyone's body, looks, race, ethnicity, religion, gender, sexuality, disability, or age, and don't identify or guess who real people in the photo are. If people are in the photo, joke about the situation, not the person.$rules$ as text
),
styles (slug, style) as (
  values
    ('caption-groupchat', 'Style: Group chat. Casual Gen Z group-chat energy. Mostly lowercase, internet slang used naturally (not in every line), reads like a viral post caption. At most one emoji across all four captions.'),
    ('caption-sarcastic', 'Style: Sarcastic. Dry, sarcastic, and unimpressed, like a lifelong New Yorker who has seen it all. Understated, a little put-upon; rent, the MTA, tourists, and slow walkers are fair game.'),
    ('caption-wholesome', 'Style: Wholesome. Warm, wholesome, and a little goofy. Earnest and kind, like a friendly kid from the Midwest who''s delighted by everything in the big city. No sarcasm.'),
    ('caption-dramatic', 'Style: Dramatic. Wildly over the top and theatrical. Treat small, everyday things like epic tragedies or historic triumphs. Big words, bigger feelings.')
),
steps (position, name, role, template) as (
  values
    (1, 'Ground rules', 'system', null),
    (2, 'Task', 'user', 'Write {{count}} captions.'),
    (3, 'Image context', 'user', '{{context}}'),
    (4, 'Style', 'user', null),
    (5, 'Examples', 'user', 'For flavor, examples in this style (don''t reuse them or their jokes):
{{examples}}'),
    (6, 'Theme', 'user', '{{theme_instruction}}'),
    (7, 'Local terms', 'user', 'Local terms you can use when they genuinely fit (never force them):
{{terms}}')
)
insert into public.prompt_chain_steps (chain_id, position, name, role, template)
select c.id, s.position, s.name, s.role,
       case s.position when 1 then (select text from rules) when 4 then st.style else s.template end
  from public.prompt_chains c
  join styles st on st.slug = c.slug
  cross join steps s
on conflict (chain_id, position) do nothing;

insert into public.prompt_chain_mix (chain_id, caption_count)
select id, 1 from public.prompt_chains
on conflict (chain_id) do nothing;

insert into public.generation_examples (chain_id, caption, notes)
select c.id, e.caption, 'The example the style was designed around.'
  from public.prompt_chains c
  join (values ('caption-groupchat', 'not the pigeon commuting better than me'),
               ('caption-sarcastic', 'Ah yes, another “quick” ride on the 1 train.'),
               ('caption-wholesome', 'This little guy is doing his best, and honestly, so am I.'),
               ('caption-dramatic', 'I have never been more betrayed than by this dining hall pizza.')) as e (slug, caption)
    on e.slug = c.slug
 where not exists (select 1 from public.generation_examples g where g.chain_id = c.id);

insert into public.terms (term, definition)
values
  ('Butler', 'Butler Library, Columbia''s main library, where people camp out for entire finals seasons.'),
  ('Low Steps', 'The steps in front of Low Library: Columbia''s front porch for sitting, people-watching, and tours.'),
  ('JJ''s', 'JJ''s Place, the late-night dining spot in the basement of John Jay Hall.'),
  ('Ferris', 'Ferris Booth Commons, the dining hall in Lerner Hall.'),
  ('Hewitt', 'Barnard''s dining hall.'),
  ('the Core', 'Columbia''s required Core Curriculum: Lit Hum, CC, Frontiers, and friends.'),
  ('the 1 train', 'The subway line that stops at 116th Street right outside campus. Famous for delays.'),
  ('bodega', 'A New York corner store, often open all night, sometimes with a resident cat.')
on conflict do nothing;

insert into public.allowed_signup_domains (domain, note)
values ('columbia.edu', 'Columbia students and staff'),
       ('barnard.edu', 'Barnard students and staff'),
       ('gmail.com', 'Open to personal Google accounts for now; remove to limit sign-ups to the schools')
on conflict (domain) do nothing;

insert into public.whitelisted_emails (email, note)
values ('alexanderdong8@gmail.com', 'Project owner'),
       ('rhyslestertalley@gmail.com', 'Course staff')
on conflict (email) do nothing;

-- Photos already uploaded with posts.
insert into public.images (storage_path, public_url, source, uploaded_by, created_at)
select distinct on (g.image_path) g.image_path, g.image_url, 'member', g.user_id, g.created_at
  from public.generations g
 where g.image_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]+$'
 order by g.image_path, g.created_at
on conflict (storage_path) do nothing;

-- History from before logging existed: one request per post and remix, with
-- the prompt and model that were saved at the time. Responses are rebuilt
-- from the captions still on file (a published post keeps only its winner).
insert into public.generation_requests
  (user_id, source, chain_id, voice, theme, image_url, generation_id, status, model, caption_count, backfilled,
   created_at, completed_at)
select g.user_id, case g.kind when 'daily' then 'daily' else 'upload' end,
       (select c.id from public.prompt_chains c where c.voice = g.voice), g.voice, g.theme, g.image_url, g.id,
       'succeeded', g.model, (select count(*) from public.captions x where x.generation_id = g.id and x.remix_id is null),
       true, g.created_at, g.created_at
  from public.generations g
 where not exists (select 1 from public.generation_requests r where r.generation_id = g.id);

insert into public.generation_requests
  (user_id, source, chain_id, voice, mood, theme, image_url, generation_id, status, model, caption_count, backfilled,
   created_at, completed_at)
select x.user_id, 'remix', (select c.id from public.prompt_chains c where c.voice = g.voice), g.voice, x.mood, g.theme,
       g.image_url, g.id, 'succeeded', x.model, (select count(*) from public.captions y where y.remix_id = x.id),
       true, x.created_at, x.created_at
  from public.caption_remixes x
  join public.generations g on g.id = x.generation_id
 where not exists (select 1 from public.generation_requests r where r.generation_id = g.id and r.source = 'remix'
                     and r.created_at = x.created_at);

insert into public.llm_responses (request_id, model_id, api_model_id, prompt, response, status, latency_ms, created_at)
select r.id, (select m.id from public.llm_models m where m.api_model_id = g.model), coalesce(g.model, 'unknown'),
       g.prompt,
       jsonb_build_object('captions', coalesce((select jsonb_agg(c.text order by c.position) from public.captions c
                                                 where c.generation_id = g.id and c.remix_id is null), '[]'::jsonb))::text,
       'ok', null, r.created_at
  from public.generation_requests r
  join public.generations g on g.id = r.generation_id
 where r.backfilled and r.source <> 'remix'
   and not exists (select 1 from public.llm_responses l where l.request_id = r.id);

insert into public.llm_responses (request_id, model_id, api_model_id, prompt, response, status, latency_ms, created_at)
select r.id, (select m.id from public.llm_models m where m.api_model_id = x.model), coalesce(x.model, 'unknown'),
       x.prompt,
       jsonb_build_object('captions', coalesce((select jsonb_agg(c.text order by c.position) from public.captions c
                                                 where c.remix_id = x.id), '[]'::jsonb))::text,
       'ok', null, r.created_at
  from public.generation_requests r
  join public.caption_remixes x on x.generation_id = r.generation_id and x.created_at = r.created_at
 where r.backfilled and r.source = 'remix'
   and not exists (select 1 from public.llm_responses l where l.request_id = r.id);
