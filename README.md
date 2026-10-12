# Koperasi B4T — Prototype anggota dan Admin

Prototype React + Vite yang dibangun dari `App.jsx` pengguna. Admin dan portal anggota berada pada satu aplikasi, dengan pemisahan tampilan berdasarkan peran.

## Yang dapat didemokan

- Login demo sebagai Admin atau anggota (Bayu/Sukiman).
- Dashboard anggota: simpanan, pinjaman, riwayat transaksi, dan SHU.
- Admin: tambah anggota, impor Excel/CSV, input transaksi, catat pinjaman, verifikasi sisa pinjaman, dan input hasil pembagian SHU.
- Data demo disimpan dengan `localStorage` di browser yang sedang dipakai.
- Bila variabel Supabase dikonfigurasi, halaman login menggunakan Supabase Auth dan data dibaca/ditulis ke database Supabase sesuai kebijakan RLS. Jalankan skema SQL lebih dahulu.

## Jalankan demo lokal

1. Ekstrak ZIP ke folder proyek.
2. Pastikan Node.js terpasang.
3. Buka terminal **Command Prompt** di folder proyek (PowerShell bisa memblokir `npm.ps1`; ketik `cmd` pada terminal PowerShell untuk berpindah ke Command Prompt).
4. Jalankan:

   ```cmd
   npm install
   npm run dev
   ```

5. Buka alamat lokal yang ditampilkan Vite, biasanya `http://localhost:5173/WebKoperasiB4T/` pada konfigurasi GitHub Pages ini. Untuk development lokal bila path tersebut tidak tersedia, buka alamat Vite yang dicetak di terminal dan gunakan fallback root `/` jika perlu.

Untuk membuat versi produksi, jalankan `npm run build`. Output ada di folder `dist`.

## Impor Excel

Admin > Impor Excel menerima:
- Format blok vertikal seperti contoh pengguna: label di kolom B, nilai di kolom C; setiap anggota dimulai dari baris `Anggota`.
- Format tabular satu anggota per baris dengan kolom seperti `Anggota`, `Simpanan Wajib`, `Simpanan Sukarela`, `Pinjaman`, `Lama Pinjaman`, `Cicilan Perbulan`, `Jenis Pinjaman`, `Sisa Pinjaman`, `Jaminan Berupa`, dan `Status`.

Aturan mapping penting:
- `Simpanan Wajib` dibaca sebagai nominal iuran per bulan, bukan saldo akumulatif.
- `Simpanan Sukarela` dibaca sebagai saldo saat ini berdasarkan penjelasan pengguna.
- `Pinjaman` disimpan sebagai nilai pinjaman awal.
- `Sisa Pinjaman` dibaca terpisah. Jika kosong, sistem menyimpan sebagai belum diketahui dan Admin harus memverifikasi sebelum mencatat angsuran.
- Nama/nomor anggota yang sudah ada akan dilewati saat impor; impor tidak menimpa saldo yang sudah berjalan.

## Mengaktifkan database online (Supabase)

Mode local demo sengaja tidak memerlukan akun database. Agar Admin dan anggota pada perangkat berbeda melihat data bersama:

1. Buat project **uji** di Supabase.
2. Buka SQL Editor dan jalankan `supabase/schema.sql`.
3. Buat user Admin dari Supabase Authentication (email/password), lalu catat UUID user tersebut.
4. Dari SQL Editor, buat profil Admin. Ganti nilai UUID dengan UUID user yang baru dibuat:

   ```sql
   insert into public.profiles (id, role, member_id, display_name)
   values ('UUID-USER-ADMIN', 'admin', null, 'Admin Koperasi');
   ```

5. Login ke aplikasi dengan email/password Admin. Impor data uji melalui halaman Admin.
6. Untuk tiap anggota yang perlu login online, buat user di Authentication, lalu hubungkan ke baris anggota menggunakan `profiles.member_id`. Contoh SQL setelah user Auth dan data anggota sudah ada:

   ```sql
   insert into public.profiles (id, role, member_id, display_name)
   select 'UUID-USER-ANGGOTA', 'member', m.id, m.name
   from public.members m
   where m.member_no = 'AGT-0001';
   ```

7. Untuk menjalankan lokal dengan database uji, buat `.env.local` berdasarkan `.env.example` dan isi project URL serta anon/publishable browser key dari Supabase. Jangan menggunakan service-role key di browser.
8. Untuk GitHub Pages, tambahkan repository Actions secrets `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY`, lalu commit/push workflow dan kode. Vite memasukkan nilai `VITE_*` ke bundle browser; anon key bukan pengganti RLS. Database harus dijaga dengan RLS dan key service-role tidak boleh dipublikasikan.

## Batasan dan keamanan

- Tanpa variabel Supabase, demo hanya tersimpan di browser saat ini (`localStorage`). Perubahan Admin tidak akan tersinkron ke HP/browser berbeda.
- Login tombol demo bukan autentikasi sesungguhnya. Mode database menggunakan email/password Supabase, bukan login nomor anggota.
- Nominal simpanan wajib bulanan tidak dianggap saldo akumulatif. Saldo awal yang kosong ditampilkan sebagai belum diinput.
- Pembayaran angsuran meminta nilai `principal_paid` secara terpisah agar keseluruhan cicilan tidak otomatis dianggap pengurang pokok.
- Ini masih prototipe. Sebelum dipakai untuk data keuangan nyata, perlu review aturan akuntansi koperasi, audit trail/koreksi, backup & pemulihan, autentikasi, RLS, dan pengujian keamanan. Repository GitHub publik tidak boleh menyimpan data anggota atau rahasia.
