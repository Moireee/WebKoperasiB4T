-- Jalankan di Supabase SQL Editor jika tabel koperasi sebelumnya sudah dibuat.
-- Lakukan di project UJI dahulu. Migration ini menambahkan formulir pengajuan pinjaman.

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

alter table public.loan_applications enable row level security;

drop policy if exists "loan_applications_admin_manage" on public.loan_applications;
create policy "loan_applications_admin_manage" on public.loan_applications
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "loan_applications_member_read_own" on public.loan_applications;
create policy "loan_applications_member_read_own" on public.loan_applications
  for select to authenticated using (member_id = public.current_member_id());

drop policy if exists "loan_applications_member_submit_own" on public.loan_applications;
create policy "loan_applications_member_submit_own" on public.loan_applications
  for insert to authenticated with check (member_id = public.current_member_id() and created_by = auth.uid());

grant select, insert, update on public.loan_applications to authenticated;

-- Lampiran foto disimpan di bucket PRIVATE; tidak ada akses publik.
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

grant select, insert, delete on storage.objects to authenticated;
