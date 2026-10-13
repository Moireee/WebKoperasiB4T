-- Koperasi B4T prototype schema.
-- Run this in Supabase SQL Editor only in a new TEST project first.
-- Do not import real member data until policies and workflows have been reviewed.

create extension if not exists pgcrypto;

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  member_no text not null unique,
  name text not null,
  phone text,
  status text not null default 'Aktif' check (status in ('Aktif','Nonaktif')),
  monthly_mandatory numeric(16,2) not null default 0 check (monthly_mandatory >= 0),
  -- Legacy compatibility field only. Monthly mandatory fee is not an individual savings balance.
  mandatory_balance numeric(16,2) check (mandatory_balance is null or mandatory_balance >= 0),
  voluntary_balance numeric(16,2) not null default 0 check (voluntary_balance >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','member')),
  member_id uuid unique references public.members(id) on delete set null,
  display_name text,
  created_at timestamptz not null default now(),
  constraint profile_member_role_check check ((role = 'member' and member_id is not null) or role = 'admin')
);

create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  principal numeric(16,2) not null check (principal > 0),
  remaining_balance numeric(16,2) check (remaining_balance is null or (remaining_balance >= 0 and remaining_balance <= principal)),
  term_months integer not null default 0 check (term_months >= 0),
  monthly_installment numeric(16,2) not null default 0 check (monthly_installment >= 0),
  loan_type text not null default 'Sosial',
  collateral text,
  status text not null default 'Aktif' check (status in ('Aktif','Lunas','Nonaktif')),
  start_date date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  loan_id uuid references public.loans(id) on delete restrict,
  type text not null check (type in ('simpanan_wajib','simpanan_sukarela','penarikan_sukarela','angsuran_pinjaman','pencairan_pinjaman')),
  amount numeric(16,2) not null check (amount > 0),
  principal_paid numeric(16,2) not null default 0 check (principal_paid >= 0),
  transaction_date date not null default current_date,
  notes text,
  status text not null default 'Berhasil',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint principal_paid_not_more_than_amount check (principal_paid <= amount)
);

create table if not exists public.shu_distributions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  year integer not null check (year between 2000 and 2100),
  amount numeric(16,2) not null check (amount >= 0),
  status text not null default 'Belum dibayar' check (status in ('Belum dibayar','Sudah dibayar')),
  paid_at date,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(member_id, year)
);

create index if not exists idx_loans_member_id on public.loans(member_id);
create index if not exists idx_transactions_member_date on public.transactions(member_id, transaction_date desc);
create index if not exists idx_shu_member_year on public.shu_distributions(member_id, year desc);

-- Pengajuan pinjaman dari portal anggota. Sensitif: data pribadi dilindungi RLS.
create table if not exists public.loan_applications (
  id uuid primary key default gen_random_uuid(),
  application_no text not null unique,
  member_id uuid not null references public.members(id) on delete restrict,
  member_no text not null,
  applicant_name text not null,
  address text not null,
  phone text not null,
  ktp_no text not null,
  loan_purpose text not null,
  other_purpose text,
  term_months integer not null check (term_months between 1 and 360),
  margin_label text not null default 'Sesuai kebijakan koperasi',
  loan_amount numeric(16,2) not null check (loan_amount > 0),
  bank_account text not null,
  collateral_description text,
  collateral_photo_path text,
  collateral_photo_name text,
  other_notes text,
  status text not null default 'Diajukan' check (status in ('Diajukan','Sedang ditinjau','Perlu dilengkapi','Disetujui','Ditolak')),
  admin_notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_loan_applications_member_created on public.loan_applications(member_id, created_at desc);
create index if not exists idx_loan_applications_status_created on public.loan_applications(status, created_at desc);


create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

create or replace function public.current_member_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.member_id from public.profiles p where p.id = auth.uid() and p.role = 'member' limit 1;
$$;

alter table public.profiles enable row level security;
alter table public.members enable row level security;
alter table public.loans enable row level security;
alter table public.transactions enable row level security;
alter table public.shu_distributions enable row level security;
alter table public.loan_applications enable row level security;

drop policy if exists "profiles_read_self_or_admin" on public.profiles;
create policy "profiles_read_self_or_admin" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());
drop policy if exists "profiles_admin_manage" on public.profiles;
create policy "profiles_admin_manage" on public.profiles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "members_admin_manage" on public.members;
create policy "members_admin_manage" on public.members
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "members_member_read_own" on public.members;
create policy "members_member_read_own" on public.members
  for select to authenticated using (id = public.current_member_id());

drop policy if exists "loans_admin_manage" on public.loans;
create policy "loans_admin_manage" on public.loans
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "loans_member_read_own" on public.loans;
create policy "loans_member_read_own" on public.loans
  for select to authenticated using (member_id = public.current_member_id());

drop policy if exists "transactions_admin_read" on public.transactions;
create policy "transactions_admin_read" on public.transactions
  for select to authenticated using (public.is_admin());
drop policy if exists "transactions_member_read_own" on public.transactions;
create policy "transactions_member_read_own" on public.transactions
  for select to authenticated using (member_id = public.current_member_id());
-- Transaction inserts/updates are intended to go through the security-definer RPC below.

drop policy if exists "shu_admin_manage" on public.shu_distributions;
create policy "shu_admin_manage" on public.shu_distributions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "shu_member_read_own" on public.shu_distributions;
create policy "shu_member_read_own" on public.shu_distributions
  for select to authenticated using (member_id = public.current_member_id());

drop policy if exists "loan_applications_admin_manage" on public.loan_applications;
create policy "loan_applications_admin_manage" on public.loan_applications
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "loan_applications_member_read_own" on public.loan_applications;
create policy "loan_applications_member_read_own" on public.loan_applications
  for select to authenticated using (member_id = public.current_member_id());
drop policy if exists "loan_applications_member_submit_own" on public.loan_applications;
create policy "loan_applications_member_submit_own" on public.loan_applications
  for insert to authenticated with check (member_id = public.current_member_id() and created_by = auth.uid());

-- Private Storage bucket for collateral photos. No public read access.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('loan-application-collateral', 'loan-application-collateral', false, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "loan_photo_member_upload_own_folder" on storage.objects;
create policy "loan_photo_member_upload_own_folder" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'loan-application-collateral'
    and (storage.foldername(name))[1] = public.current_member_id()::text
  );
drop policy if exists "loan_photo_member_or_admin_read" on storage.objects;
create policy "loan_photo_member_or_admin_read" on storage.objects
  for select to authenticated using (
    bucket_id = 'loan-application-collateral'
    and (public.is_admin() or (storage.foldername(name))[1] = public.current_member_id()::text)
  );
drop policy if exists "loan_photo_admin_delete" on storage.objects;
create policy "loan_photo_admin_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'loan-application-collateral' and public.is_admin());


create or replace function public.record_member_transaction(
  p_member_id uuid,
  p_type text,
  p_amount numeric,
  p_transaction_date date default current_date,
  p_notes text default null,
  p_loan_id uuid default null,
  p_principal_paid numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_balance numeric;
begin
  if not public.is_admin() then raise exception 'Hanya Admin yang dapat mencatat transaksi.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Nominal transaksi harus lebih dari nol.'; end if;

  if p_type = 'simpanan_wajib' then
    -- Iuran wajib hanya dicatat sebagai transaksi; tidak menambah saldo simpanan anggota.
    perform 1 from public.members where id = p_member_id for update;
    if not found then raise exception 'Anggota tidak ditemukan.'; end if;
  elsif p_type = 'simpanan_sukarela' then
    update public.members set voluntary_balance = voluntary_balance + p_amount where id = p_member_id;
    if not found then raise exception 'Anggota tidak ditemukan.'; end if;
  elsif p_type = 'penarikan_sukarela' then
    update public.members set voluntary_balance = voluntary_balance - p_amount
      where id = p_member_id and voluntary_balance >= p_amount;
    if not found then raise exception 'Anggota tidak ditemukan atau saldo sukarela tidak cukup.'; end if;
  elsif p_type = 'angsuran_pinjaman' then
    if p_loan_id is null then raise exception 'Pinjaman wajib dipilih.'; end if;
    if p_principal_paid is null or p_principal_paid < 0 or p_principal_paid > p_amount then
      raise exception 'Porsi pengurang pokok tidak valid.';
    end if;
    select remaining_balance into v_balance from public.loans
      where id = p_loan_id and member_id = p_member_id and status = 'Aktif' for update;
    if not found then raise exception 'Pinjaman tidak ditemukan atau sudah lunas.'; end if;
    if v_balance is null then raise exception 'Sisa pinjaman belum diverifikasi.'; end if;
    if p_principal_paid > v_balance then raise exception 'Porsi pengurang pokok melebihi sisa pinjaman.'; end if;
    update public.loans set remaining_balance = greatest(0, remaining_balance - p_principal_paid),
      status = case when remaining_balance - p_principal_paid <= 0 then 'Lunas' else status end
      where id = p_loan_id;
  else
    raise exception 'Jenis transaksi tidak didukung.';
  end if;

  insert into public.transactions(member_id, loan_id, type, amount, principal_paid, transaction_date, notes, created_by)
  values (p_member_id, case when p_type = 'angsuran_pinjaman' then p_loan_id else null end,
    p_type, p_amount, coalesce(p_principal_paid, 0), coalesce(p_transaction_date, current_date), p_notes, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.create_loan_with_disbursement(
  p_member_id uuid,
  p_principal numeric,
  p_remaining_balance numeric,
  p_term_months integer,
  p_monthly_installment numeric,
  p_loan_type text,
  p_collateral text default null,
  p_start_date date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_loan_id uuid;
begin
  if not public.is_admin() then raise exception 'Hanya Admin yang dapat membuat pinjaman.'; end if;
  if p_principal is null or p_principal <= 0 then raise exception 'Nominal pinjaman tidak valid.'; end if;
  if p_remaining_balance is null or p_remaining_balance < 0 or p_remaining_balance > p_principal then
    raise exception 'Sisa pinjaman harus antara nol dan pinjaman awal.';
  end if;
  if not exists(select 1 from public.members where id = p_member_id) then raise exception 'Anggota tidak ditemukan.'; end if;
  insert into public.loans(member_id, principal, remaining_balance, term_months, monthly_installment, loan_type, collateral, status, start_date)
  values(p_member_id, p_principal, p_remaining_balance, coalesce(p_term_months, 0), coalesce(p_monthly_installment, 0), coalesce(nullif(p_loan_type, ''), 'Sosial'), p_collateral,
    case when p_remaining_balance = 0 then 'Lunas' else 'Aktif' end, coalesce(p_start_date, current_date))
  returning id into v_loan_id;
  insert into public.transactions(member_id, loan_id, type, amount, principal_paid, transaction_date, notes, created_by)
  values(p_member_id, v_loan_id, 'pencairan_pinjaman', p_principal, 0, coalesce(p_start_date, current_date), 'Pencairan pinjaman baru', auth.uid());
  return v_loan_id;
end;
$$;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.current_member_id() to authenticated;
grant execute on function public.record_member_transaction(uuid, text, numeric, date, text, uuid, numeric) to authenticated;
grant execute on function public.create_loan_with_disbursement(uuid, numeric, numeric, integer, numeric, text, text, date) to authenticated;


-- Explicit table grants for authenticated users; row-level security above still limits rows/operations.
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.members to authenticated;
grant select, insert, update, delete on public.loans to authenticated;
revoke insert, update, delete on public.transactions from anon, authenticated;
grant select on public.transactions to authenticated;
grant select, insert, update, delete on public.shu_distributions to authenticated;
grant select, insert, update on public.loan_applications to authenticated;
grant select, insert, delete on storage.objects to authenticated;

-- Audit log: records inserts and balance/record changes in important tables.
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  table_name text not null,
  record_id text,
  operation text not null,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
alter table public.audit_logs enable row level security;
drop policy if exists "audit_logs_admin_read" on public.audit_logs;
create policy "audit_logs_admin_read" on public.audit_logs
  for select to authenticated using (public.is_admin());
grant select on public.audit_logs to authenticated;

create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_json jsonb;
  new_json jsonb;
  record_key text;
begin
  if tg_op = 'INSERT' then
    old_json := null;
    new_json := to_jsonb(new);
    record_key := new_json ->> 'id';
  elsif tg_op = 'UPDATE' then
    old_json := to_jsonb(old);
    new_json := to_jsonb(new);
    record_key := new_json ->> 'id';
  elsif tg_op = 'DELETE' then
    old_json := to_jsonb(old);
    new_json := null;
    record_key := old_json ->> 'id';
  end if;

  insert into public.audit_logs(actor_id, table_name, record_id, operation, old_data, new_data)
  values(auth.uid(), tg_table_name, record_key, tg_op, old_json, new_json);

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists audit_members on public.members;
create trigger audit_members after insert or update or delete on public.members
  for each row execute function public.write_audit_log();
drop trigger if exists audit_loans on public.loans;
create trigger audit_loans after insert or update or delete on public.loans
  for each row execute function public.write_audit_log();
drop trigger if exists audit_transactions on public.transactions;
create trigger audit_transactions after insert or update or delete on public.transactions
  for each row execute function public.write_audit_log();
drop trigger if exists audit_shu_distributions on public.shu_distributions;
create trigger audit_shu_distributions after insert or update or delete on public.shu_distributions
  for each row execute function public.write_audit_log();
