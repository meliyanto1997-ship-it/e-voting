-- E-VOTING ROBOTIC PRO — Supabase schema
-- Jalankan seluruh file ini di Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.elections (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  status text not null default 'draft' check (status in ('draft','active','closed')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create unique index if not exists one_active_election on public.elections ((status)) where status='active';
create table if not exists public.candidates (
  id uuid primary key default gen_random_uuid(),
  election_id uuid not null references public.elections(id) on delete cascade,
  name text not null,
  number text not null default '',
  bio text not null default '',
  photo_url text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.voter_tokens (
  id uuid primary key default gen_random_uuid(),
  election_id uuid not null references public.elections(id) on delete cascade,
  token_hash text not null unique,
  vote_limit integer not null default 1 check (vote_limit between 1 and 20),
  used_count integer not null default 0 check (used_count >= 0 and used_count <= vote_limit),
  created_at timestamptz not null default now()
);
-- Secret ballot: votes intentionally do not contain token_id or voter identity.
create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  election_id uuid not null references public.elections(id) on delete cascade,
  candidate_id uuid not null references public.candidates(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists votes_election_idx on public.votes(election_id);
create index if not exists candidates_election_idx on public.candidates(election_id);
create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  admin_id uuid references auth.users(id),
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.admin_users where user_id=auth.uid()); $$;

alter table public.admin_users enable row level security;
alter table public.elections enable row level security;
alter table public.candidates enable row level security;
alter table public.voter_tokens enable row level security;
alter table public.votes enable row level security;
alter table public.audit_logs enable row level security;

-- Admin membership is readable only by its own authenticated user.
drop policy if exists "admin read own membership" on public.admin_users;
create policy "admin read own membership" on public.admin_users for select to authenticated using (user_id=auth.uid());
-- Active election metadata and candidates are public; modifications are admin-only.
drop policy if exists "public read active elections" on public.elections;
create policy "public read active elections" on public.elections for select to anon,authenticated using (status='active' or public.is_admin());
drop policy if exists "admin manage elections" on public.elections;
create policy "admin manage elections" on public.elections for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "public read candidates of active elections" on public.candidates;
create policy "public read candidates of active elections" on public.candidates for select to anon,authenticated using (exists(select 1 from public.elections e where e.id=election_id and e.status='active') or public.is_admin());
drop policy if exists "admin manage candidates" on public.candidates;
create policy "admin manage candidates" on public.candidates for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- Never expose token hashes or vote rows directly to public clients.
drop policy if exists "admin read tokens" on public.voter_tokens;
create policy "admin read tokens" on public.voter_tokens for select to authenticated using (public.is_admin());
drop policy if exists "admin read votes" on public.votes;
create policy "admin read votes" on public.votes for select to authenticated using (public.is_admin());
drop policy if exists "admin audit read" on public.audit_logs;
create policy "admin audit read" on public.audit_logs for select to authenticated using (public.is_admin());
drop policy if exists "admin audit insert" on public.audit_logs;
create policy "admin audit insert" on public.audit_logs for insert to authenticated with check (public.is_admin());


-- Public may see only the total number of ballots, never individual vote rows.
create or replace function public.public_election_vote_count(p_election_id uuid)
returns bigint language sql stable security definer set search_path=public
as $$
 select count(*)::bigint from public.votes v
 where v.election_id=p_election_id
 and exists(select 1 from public.elections e where e.id=p_election_id and e.status='active');
$$;
revoke all on function public.public_election_vote_count(uuid) from public;
grant execute on function public.public_election_vote_count(uuid) to anon,authenticated;

-- Generate cryptographically random one-time plaintext tokens; only SHA-256 hashes are stored.
create or replace function public.admin_issue_tokens(p_election_id uuid,p_quantity integer,p_vote_limit integer default 1)
returns table(token text,vote_limit integer)
language plpgsql security definer set search_path=public,extensions
as $$
declare i integer; raw_token text;
begin
 if not public.is_admin() then raise exception 'Akses administrator diperlukan'; end if;
 if p_quantity<1 or p_quantity>500 then raise exception 'Jumlah token harus 1 sampai 500'; end if;
 if p_vote_limit<1 or p_vote_limit>20 then raise exception 'Hak voting harus 1 sampai 20'; end if;
 if not exists(select 1 from public.elections where id=p_election_id) then raise exception 'Pemilihan tidak ditemukan'; end if;
 for i in 1..p_quantity loop
   raw_token := upper(encode(gen_random_bytes(8),'hex'));
   insert into public.voter_tokens(election_id,token_hash,vote_limit)
   values(p_election_id,encode(digest(raw_token,'sha256'),'hex'),p_vote_limit);
   token := raw_token; vote_limit := p_vote_limit; return next;
 end loop;
 insert into public.audit_logs(admin_id,action,details) values(auth.uid(),'issue_tokens',jsonb_build_object('election_id',p_election_id,'quantity',p_quantity,'vote_limit',p_vote_limit));
end; $$;

-- Atomic vote: lock token row, validate, increment usage and insert anonymous ballot.
create or replace function public.cast_vote(p_token text,p_candidate_id uuid)
returns jsonb language plpgsql security definer set search_path=public,extensions
as $$
declare tok public.voter_tokens%rowtype; el public.elections%rowtype;
begin
 if p_token is null or length(trim(p_token))<8 then return jsonb_build_object('ok',false,'message','Token tidak valid'); end if;
 select * into tok from public.voter_tokens
 where token_hash=encode(digest(upper(trim(p_token)),'sha256'),'hex') for update;
 if not found then return jsonb_build_object('ok',false,'message','Token tidak ditemukan'); end if;
 select * into el from public.elections where id=tok.election_id;
 if not found or el.status<>'active' then return jsonb_build_object('ok',false,'message','Pemilihan tidak aktif'); end if;
 if el.starts_at is not null and now()<el.starts_at then return jsonb_build_object('ok',false,'message','Pemilihan belum dimulai'); end if;
 if el.ends_at is not null and now()>el.ends_at then return jsonb_build_object('ok',false,'message','Waktu pemilihan telah berakhir'); end if;
 if tok.used_count>=tok.vote_limit then return jsonb_build_object('ok',false,'message','Hak voting token telah habis'); end if;
 if not exists(select 1 from public.candidates where id=p_candidate_id and election_id=tok.election_id) then return jsonb_build_object('ok',false,'message','Kandidat tidak valid'); end if;
 update public.voter_tokens set used_count=used_count+1 where id=tok.id;
 insert into public.votes(election_id,candidate_id) values(tok.election_id,p_candidate_id);
 return jsonb_build_object('ok',true,'message','Suara berhasil dicatat');
end; $$;

create or replace function public.admin_vote_totals(p_election_id uuid)
returns table(candidate_id uuid,candidate_name text,vote_count bigint)
language sql security definer set search_path=public
as $$
 select c.id,c.name,count(v.id)::bigint
 from public.candidates c left join public.votes v on v.candidate_id=c.id and v.election_id=c.election_id
 where c.election_id=p_election_id and public.is_admin()
 group by c.id,c.name order by c.sort_order,c.name;
$$;
revoke all on function public.admin_issue_tokens(uuid,integer,integer) from public;
grant execute on function public.admin_issue_tokens(uuid,integer,integer) to authenticated;
revoke all on function public.cast_vote(text,uuid) from public;
grant execute on function public.cast_vote(text,uuid) to anon,authenticated;
revoke all on function public.admin_vote_totals(uuid) from public;
grant execute on function public.admin_vote_totals(uuid) to authenticated;

-- Storage: create a public bucket for candidate headshots. Admin-only uploads/deletes.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('candidate-photos','candidate-photos',true,2097152,array['image/jpeg'])
on conflict(id) do update set public=true,file_size_limit=2097152,allowed_mime_types=array['image/jpeg'];
drop policy if exists "public view candidate photos" on storage.objects;
create policy "public view candidate photos" on storage.objects for select to anon,authenticated using (bucket_id='candidate-photos');
drop policy if exists "admin upload candidate photos" on storage.objects;
create policy "admin upload candidate photos" on storage.objects for insert to authenticated with check (bucket_id='candidate-photos' and public.is_admin());
drop policy if exists "admin update candidate photos" on storage.objects;
create policy "admin update candidate photos" on storage.objects for update to authenticated using (bucket_id='candidate-photos' and public.is_admin()) with check (bucket_id='candidate-photos' and public.is_admin());
drop policy if exists "admin delete candidate photos" on storage.objects;
create policy "admin delete candidate photos" on storage.objects for delete to authenticated using (bucket_id='candidate-photos' and public.is_admin());

-- Enable realtime for live dashboard/public counter refresh.
alter publication supabase_realtime add table public.votes;

create table if not exists public.organization_settings (
 id boolean primary key default true check (id=true),
 institution_name text not null default 'E-VOTING ROBOTIC PRO',
 unit_name text not null default '', address text not null default '',
 contact text not null default '', organizer text not null default '',
 logo_url text, primary_color text not null default '#19d3e6',
 secondary_color text not null default '#a855f7',
 rgb_enabled boolean not null default true, watermark_visible boolean not null default true,
 default_theme text not null default 'dark' check (default_theme in ('dark','light')),
 updated_at timestamptz not null default now(), updated_by uuid references auth.users(id)
);
insert into public.organization_settings(id) values(true) on conflict(id) do nothing;
alter table public.organization_settings enable row level security;
drop policy if exists "public read organization identity" on public.organization_settings;
drop policy if exists "public read organization identity" on public.organization_settings;
create policy "public read organization identity" on public.organization_settings for select to anon,authenticated using (true);
drop policy if exists "admin manage organization identity" on public.organization_settings;
drop policy if exists "admin manage organization identity" on public.organization_settings;
create policy "admin manage organization identity" on public.organization_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public.elections add column if not exists election_type text not null default '';
alter table public.elections add column if not exists academic_period text not null default '';
alter table public.elections add column if not exists slogan text not null default '';
alter table public.elections add column if not exists committee_chair text not null default '';
alter table public.elections add column if not exists witness_name text not null default '';

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('institution-branding','institution-branding',true,2097152,array['image/png','image/jpeg'])
on conflict(id) do update set public=true,file_size_limit=2097152,allowed_mime_types=array['image/png','image/jpeg'];
drop policy if exists "public view institution branding" on storage.objects;
drop policy if exists "public view institution branding" on storage.objects;
create policy "public view institution branding" on storage.objects for select to anon,authenticated using (bucket_id='institution-branding');
drop policy if exists "admin upload institution branding" on storage.objects;
drop policy if exists "admin upload institution branding" on storage.objects;
create policy "admin upload institution branding" on storage.objects for insert to authenticated with check (bucket_id='institution-branding' and public.is_admin());
drop policy if exists "admin update institution branding" on storage.objects;
create policy "admin update institution branding" on storage.objects for update to authenticated using (bucket_id='institution-branding' and public.is_admin()) with check (bucket_id='institution-branding' and public.is_admin());
drop policy if exists "admin delete institution branding" on storage.objects;
create policy "admin delete institution branding" on storage.objects for delete to authenticated using (bucket_id='institution-branding' and public.is_admin());
