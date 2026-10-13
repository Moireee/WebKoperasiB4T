# Login demo Koperasi B4T

## Akun demo default

- Admin: username `admin`, password `DemoAdmin2026!`
- Anggota Bayu: nomor anggota `KBT-000001`, password sementara `BayuB4T!001`
- Anggota Sukiman: nomor anggota `KBT-000002`, password sementara `SukimanB4T!002`

Bayu dan Sukiman diminta mengganti password saat login pertama. Setelah password diganti, gunakan password baru yang dibuat sendiri.

Admin dapat masuk ke **Akun Anggota** untuk membuat atau mengatur ulang password sementara anggota. Admin lalu menyerahkan password tersebut kepada anggota secara pribadi. Anggota wajib menggantinya ketika login berikutnya.

## Batasan demo

- Akun dan data demo disimpan dalam `localStorage` pada browser saat ini.
- Perubahan tidak tersinkron ke browser/perangkat lain.
- Ini hanya simulasi alur antarmuka; username/password client-side tidak aman untuk melindungi informasi keuangan.
- Jangan menggunakan nomor KTP, rekening, foto jaminan, password, atau saldo asli.
- Mode database online yang menggunakan Supabase tetap memakai email/password Supabase saat ini. Pemetaan nomor anggota ke akun Auth dan penerbitan akun oleh Admin memerlukan implementasi backend aman tersendiri.
