# Koperasi B4T — Prototype anggota dan Admin

Prototype React + Vite yang dibangun dari `App.jsx` pengguna. Admin dan portal anggota berada pada satu aplikasi, dengan pemisahan tampilan berdasarkan peran.

## Yang dapat didemokan

- Login demo sebagai Admin atau anggota (Bayu/Sukiman).
- Dashboard anggota: simpanan, pinjaman, riwayat transaksi, dan SHU.
- Admin: tambah/edit/hapus anggota (penghapusan demo dapat menghapus catatan demo terkait), impor Excel/CSV, input transaksi, catat pinjaman, verifikasi sisa pinjaman, dan input hasil pembagian SHU.
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
- `Simpanan Wajib` dibaca sebagai nominal iuran per bulan, bukan saldo akumulatif. Pembayarannya dicatat di riwayat, tetapi tidak menambah saldo simpanan anggota.
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
- Iuran wajib bulanan tidak dihitung ke saldo simpanan sukarela. Transaksi iuran wajib hanya dicatat pada riwayat. Field `mandatory_balance` dipertahankan di schema hanya untuk kompatibilitas data lama dan tidak digunakan pada total saldo dashboard.
- Mode demo: tombol Hapus menghapus anggota serta data contoh pinjaman/transaksi/SHU terkait setelah konfirmasi. Mode database online: anggota yang sudah memiliki pinjaman, transaksi, pembagian SHU, atau akun login ditolak untuk penghapusan permanen; ubah status ke Nonaktif agar riwayat keuangan tetap terjaga.
- Pembayaran angsuran meminta nilai `principal_paid` secara terpisah agar keseluruhan cicilan tidak otomatis dianggap pengurang pokok.
- Ini masih prototipe. Sebelum dipakai untuk data keuangan nyata, perlu review aturan akuntansi koperasi, audit trail/koreksi, backup & pemulihan, autentikasi, RLS, dan pengujian keamanan. Repository GitHub publik tidak boleh menyimpan data anggota atau rahasia.

## Revisi: hapus anggota dan iuran wajib
- Tabel Data Anggota menyediakan tombol **Hapus** dengan konfirmasi.
- Mode demo lokal menghapus anggota serta pinjaman/transaksi/SHU contoh terkait dari browser itu. Ini sengaja untuk kebutuhan presentasi dan tidak boleh dipakai sebagai kebijakan penghapusan pembukuan riil.
- Mode database online menolak penghapusan permanen jika anggota masih terhubung ke pinjaman, transaksi, distribusi SHU, atau akun login. Tandai Nonaktif sebagai gantinya agar histori keuangan tetap terjaga.
- Iuran wajib bulanan hanya direkam pada riwayat transaksi dan tidak menambah saldo simpanan sukarela. Dashboard anggota hanya menampilkan saldo simpanan sukarela sebagai saldo tabungan.
- Jika Supabase sudah pernah disiapkan, jalankan ulang `supabase/schema.sql` pada project uji agar fungsi `record_member_transaction` diperbarui. Untuk project online yang sudah memiliki data, lakukan backup dan review dahulu sebelum menjalankan perubahan skema.

## Pengajuan pinjaman anggota + cetak formulir

- Anggota membuka menu **Ajukan Pinjaman** dan mengisi nama, alamat, telepon/HP, nomor KTP, tujuan pinjaman, tenor, nominal, rekening, keterangan jaminan, foto jaminan opsional, serta catatan lain.
- Tujuan mengikuti formulir contoh: Pembelian Barang; Renovasi Rumah/Perbaikan Kendaraan; Sosial (Sakit & Musibah); Pembayaran Kontrakan; Lainnya.
- Pilihan tenor mengikuti contoh: 12 bulan (14% margin), 24 bulan (16,5% margin), atau tenor lainnya. Margin ditampilkan sebagai pilihan formulir dan harus diverifikasi terhadap kebijakan resmi koperasi sebelum dipakai operasional.
- Setelah dikirim, pengajuan berstatus **Diajukan** dan muncul di **Admin > Pengajuan Pinjaman**.
- Admin dapat membuka detail, melihat foto jaminan, menambahkan catatan, mengubah status (Diajukan, Sedang ditinjau, Perlu dilengkapi, Disetujui, Ditolak), kemudian memilih **Cetak / Simpan PDF**. Dialog print browser dapat diarahkan ke printer atau “Save as PDF”.
- Mode demo menyimpan pengajuan di localStorage browser yang sama. Data tidak tersinkron ke perangkat lain.
- Mode Supabase memakai tabel `loan_applications` dan bucket Storage private `loan-application-collateral`. RLS membatasi pembacaan anggota ke pengajuannya sendiri dan Admin ke semua pengajuan.

### Database Supabase sudah terlanjur dibuat?

Jika project Supabase sudah memakai skema sebelumnya, jalankan `supabase/loan_applications_migration.sql` pada SQL Editor setelah mencadangkan project uji. Untuk instalasi database baru, jalankan `supabase/schema.sql` yang sudah mencakup fitur ini. Setelah itu, pastikan secret GitHub Actions `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` (anon/publishable key saja) sudah diatur apabila website dipublikasikan dengan koneksi database.

**Data pribadi:** formulir memuat nomor KTP, alamat, nomor HP, rekening, dan foto jaminan. Jangan masukkan data nyata selama demo. Sebelum dipakai anggota sungguhan, audit RLS, Auth, privasi, backup, prosedur retensi/penghapusan data, serta alur persetujuan pinjaman.
