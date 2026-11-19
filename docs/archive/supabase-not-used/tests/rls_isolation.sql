-- Local check of the migration + Row Level Security, run against plain
-- PostgreSQL with a tiny stand-in for Supabase's auth schema.
-- Usage (see docs/TESTING.md):  psql -v ON_ERROR_STOP=1 -f supabase/tests/rls_isolation.sql
\set QUIET on
drop database if exists six_rls_test;
create database six_rls_test;
\c six_rls_test

-- Minimal stand-in for Supabase auth.
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.sub', true), '')::uuid $$;
create role authenticated nologin;

\ir ../migrations/0001_initial_schema.sql

grant usage on schema public, auth to authenticated;
grant all on all tables in schema public to authenticated;
grant all on all sequences in schema public to authenticated;

insert into auth.users values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b');

-- User A creates a contact.
set role authenticated;
set request.jwt.sub = '00000000-0000-0000-0000-00000000000a';
insert into public.contacts (id, owner_id, name)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'Marcus (A)');
insert into public.connections (owner_id, person_a, person_b)
  values ('00000000-0000-0000-0000-00000000000a', null, 'aaaaaaaa-0000-0000-0000-000000000001');

-- User B cannot see or change it.
set request.jwt.sub = '00000000-0000-0000-0000-00000000000b';
do $$
declare n int;
begin
  select count(*) into n from public.contacts;
  if n <> 0 then raise exception 'FAIL: user B can see % of user A''s contacts', n; end if;
  select count(*) into n from public.connections;
  if n <> 0 then raise exception 'FAIL: user B can see user A''s connections'; end if;
  update public.contacts set name = 'hacked';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: user B updated user A''s contact'; end if;
  delete from public.contacts;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: user B deleted user A''s contact'; end if;
  raise notice 'PASS: user B cannot read, update or delete user A''s records';
end $$;

-- User B cannot insert rows owned by A, or link to A's contact.
do $$
begin
  begin
    insert into public.contacts (owner_id, name) values ('00000000-0000-0000-0000-00000000000a', 'spoof');
    raise exception 'FAIL: user B inserted a contact owned by A';
  exception when insufficient_privilege then
    raise notice 'PASS: user B cannot create records as user A';
  end;
  begin
    insert into public.connections (owner_id, person_a, person_b)
      values ('00000000-0000-0000-0000-00000000000b', null, 'aaaaaaaa-0000-0000-0000-000000000001');
    raise exception 'FAIL: user B linked to user A''s contact';
  exception when insufficient_privilege then
    raise notice 'PASS: user B cannot connect to user A''s contacts';
  end;
end $$;

-- Duplicate edges in either direction are rejected.
set request.jwt.sub = '00000000-0000-0000-0000-00000000000a';
do $$
begin
  insert into public.connections (owner_id, person_a, person_b)
    values ('00000000-0000-0000-0000-00000000000a', null, 'aaaaaaaa-0000-0000-0000-000000000001');
  raise exception 'FAIL: duplicate connection accepted';
exception when unique_violation then
  raise notice 'PASS: duplicate connections are rejected';
end $$;

reset role;
\c postgres
drop database six_rls_test;
