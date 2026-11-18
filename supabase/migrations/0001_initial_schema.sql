-- 6IX DEGREES: initial schema (Phase 2, not yet connected to the app).
-- Normalized tables, foreign keys, indexes, and Row Level Security so every
-- user can only ever see and change their own network.

create extension if not exists "pgcrypto";

-- Profiles: one per auth user.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'You',
  priorities text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  email text,
  phone text,
  location text,
  occupation text,
  organization text,
  interests text[] not null default '{}',
  goals text[] not null default '{}',
  skills text[] not null default '{}',
  met_context text,
  notes text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contacts_owner_idx on public.contacts (owner_id);
create index contacts_owner_name_idx on public.contacts (owner_id, lower(name));

create table public.categories (
  id smallserial primary key,
  slug text unique not null
);
insert into public.categories (slug) values
  ('friend'), ('family'), ('classmate'), ('mentor'),
  ('colleague'), ('collaborator'), ('community'), ('acquaintance');

create table public.contact_categories (
  contact_id uuid not null references public.contacts (id) on delete cascade,
  category_id smallint not null references public.categories (id),
  primary key (contact_id, category_id)
);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  label text not null,
  unique (owner_id, label)
);

create table public.contact_tags (
  contact_id uuid not null references public.contacts (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  primary key (contact_id, tag_id)
);

create table public.important_dates (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  label text not null,
  date date not null
);
create index important_dates_owner_idx on public.important_dates (owner_id, date);

-- Connections are undirected. person_a = null means "the user themself".
create table public.connections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  person_a uuid references public.contacts (id) on delete cascade,
  person_b uuid not null references public.contacts (id) on delete cascade,
  label text,
  created_at timestamptz not null default now(),
  check (person_a is distinct from person_b)
);
create index connections_owner_idx on public.connections (owner_id);
-- One edge per pair, regardless of direction (null person_a = the user).
create unique index connections_pair_uniq on public.connections (
  owner_id,
  least(coalesce(person_a::text, 'me'), person_b::text),
  greatest(coalesce(person_a::text, 'me'), person_b::text)
);

create table public.interactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  kind text not null check (kind in ('meeting', 'call', 'message', 'event', 'other')),
  occurred_on date not null,
  summary text not null,
  raw_note text,
  created_at timestamptz not null default now()
);
create index interactions_owner_date_idx on public.interactions (owner_id, occurred_on desc);
create index interactions_contact_idx on public.interactions (contact_id);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete cascade,
  title text not null,
  due_on date,
  done boolean not null default false,
  created_at timestamptz not null default now()
);
create index reminders_owner_due_idx on public.reminders (owner_id, done, due_on);

-- AI suggestions are stored so they stay labeled, explainable and reversible.
create table public.ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('introduction', 'extraction', 'answer')),
  payload jsonb not null,
  evidence jsonb not null default '[]',
  status text not null default 'proposed' check (status in ('proposed', 'accepted', 'dismissed')),
  model text not null,
  created_at timestamptz not null default now()
);
create index ai_suggestions_owner_idx on public.ai_suggestions (owner_id, created_at desc);

------------------------------------------------------------------------------
-- Row Level Security: a user can only touch rows they own.
------------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.contacts enable row level security;
alter table public.contact_categories enable row level security;
alter table public.tags enable row level security;
alter table public.contact_tags enable row level security;
alter table public.important_dates enable row level security;
alter table public.connections enable row level security;
alter table public.interactions enable row level security;
alter table public.reminders enable row level security;
alter table public.ai_suggestions enable row level security;
alter table public.categories enable row level security;

create policy "categories are readable" on public.categories for select using (true);

create policy "own profile" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

create policy "own contacts" on public.contacts
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own tags" on public.tags
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own dates" on public.important_dates
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
-- Both endpoints must also be the user's own contacts, so nobody can link into
-- another user's private network.
create policy "own connections" on public.connections
  for all using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.contacts c where c.id = person_b and c.owner_id = auth.uid())
    and (person_a is null or exists (select 1 from public.contacts c where c.id = person_a and c.owner_id = auth.uid()))
  );
create policy "own interactions" on public.interactions
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own reminders" on public.reminders
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own suggestions" on public.ai_suggestions
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Join tables: allowed only when the parent contact belongs to the user.
create policy "own contact categories" on public.contact_categories
  for all using (exists (select 1 from public.contacts c where c.id = contact_id and c.owner_id = auth.uid()))
  with check (exists (select 1 from public.contacts c where c.id = contact_id and c.owner_id = auth.uid()));
create policy "own contact tags" on public.contact_tags
  for all using (exists (select 1 from public.contacts c where c.id = contact_id and c.owner_id = auth.uid()))
  with check (exists (select 1 from public.contacts c where c.id = contact_id and c.owner_id = auth.uid()));
