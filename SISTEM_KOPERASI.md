# Rancangan Sistem Koperasi B4T

## Tujuan demo
Mendemonstrasikan alur Admin dan anggota dalam satu aplikasi: impor Excel, pengelolaan anggota, transaksi simpanan, pinjaman/angsuran, dan input hasil SHU tahunan.

## Alur data
1. Admin mengimpor Excel sebagai data awal.
2. Website menampilkan pratinjau dan memeriksa kemungkinan nama/nomor duplikat.
3. Saldo simpanan sukarela dipisahkan dari iuran wajib per bulan. Iuran wajib dicatat sebagai pembayaran, tetapi tidak menambah saldo simpanan anggota.
4. Pinjaman awal dan sisa pinjaman disimpan sebagai dua angka berbeda. Sisa pinjaman kosong tidak ditebak.
5. Transaksi baru disimpan sebagai baris riwayat, kemudian saldo yang terkait diperbarui.
6. Hasil pembagian SHU dimasukkan Admin per anggota dan tahun; sistem tidak menghitung proporsi otomatis.
7. Portal anggota membaca data yang terkait dengan anggota tersebut.

## Peran
- **Admin:** data anggota, impor, saldo awal, transaksi, pinjaman, SHU, laporan.
- **Anggota:** dashboard pribadi, simpanan, pinjaman, riwayat transaksi, profil, dan SHU sendiri.

## Tabel database uji
- `profiles`: kaitan user Auth dengan role dan member.
- `members`: identitas, nominal iuran wajib per bulan, dan saldo awal simpanan sukarela. Field `mandatory_balance` tetap di schema hanya untuk kompatibilitas lama dan tidak dihitung sebagai saldo simpanan.
- `loans`: pinjaman awal, sisa pokok, tenor, cicilan, jenis dan jaminan.
- `transactions`: ledger aktivitas finansial termasuk nominal cicilan dan porsi pengurang pokok terpisah.
- `shu_distributions`: nilai SHU yang ditetapkan Admin per anggota per tahun dan status pembayarannya.

DDL dan RLS disediakan di `supabase/schema.sql`.

## Penghapusan anggota
- Pada mode demo lokal, Admin dapat menghapus anggota dan data demo terkait setelah konfirmasi.
- Pada database online, anggota yang sudah punya pinjaman, transaksi, catatan SHU, atau akun login tidak dihapus permanen; Admin harus menonaktifkannya agar histori keuangan tidak hilang.

## Hal yang harus diselesaikan sebelum produksi
- Konfirmasi kebijakan pengelolaan saldo, penarikan simpanan dan perhitungan bagian pokok/bunga/biaya angsuran.
- Terapkan audit trail untuk perubahan data master/saldo awal dan mekanisme koreksi transaksi yang tidak menghapus jejak.
- Lakukan pengujian RLS sebagai Admin dan dua anggota yang berbeda; anggota tidak boleh membaca data anggota lain.
- Siapkan backup, uji pemulihan, monitoring, pembatasan login, pemulihan akun, dan prosedur pergantian pengurus.
- Jangan gunakan data nyata pada repository publik atau pada mode localStorage.

## Revisi fitur (13 Oktober 2026)
- Admin dapat menghapus anggota melalui tombol Hapus.
- Dalam mode demo lokal, penghapusan menghapus juga data dummy terkait (pinjaman, transaksi, dan SHU) setelah konfirmasi.
- Dalam mode database online, penghapusan permanen diblokir bila ada pinjaman, transaksi, SHU, atau akun login yang terkait; status Nonaktif dianjurkan untuk menjaga histori.
- Iuran wajib bulanan merupakan pembayaran rutin. Transaksinya tercatat, tetapi tidak menambah `voluntary_balance` maupun saldo simpanan yang ditampilkan kepada anggota.
- Field database `mandatory_balance` dipertahankan hanya demi kompatibilitas data lama; bukan sumber saldo tabungan pada dashboard.

## Pengajuan pinjaman anggota

1. Anggota mengisi formulir dengan identitas, alamat, telepon, KTP, tujuan, tenor, nominal, nomor rekening beserta nama dan bank, keterangan jaminan, foto jaminan opsional, dan catatan tambahan.
2. Pengajuan masuk ke menu Admin **Pengajuan Pinjaman** dengan status awal **Diajukan**.
3. Admin membuka detail untuk meninjau informasi, menambahkan catatan, dan mengubah status.
4. Admin dapat menggunakan **Cetak / Simpan PDF**. Lembar cetak berisi identitas pemohon, detail pinjaman, foto jaminan (bila ada), status, catatan Admin, dan kolom tanda tangan.
5. Pengajuan yang disetujui belum otomatis menjadi pinjaman cair. Admin masih harus memverifikasi persetujuan dan mencatat pencairan melalui proses pinjaman yang sudah ada.

Mode lokal menyimpan seluruh data demo dalam browser yang sama. Mode online memerlukan tabel `loan_applications` dan bucket private `loan-application-collateral`; schema dan migration disertakan. Karena formulir memuat data pribadi sensitif, jangan uji memakai data sungguhan sebelum konfigurasi dan pengujian keamanan selesai.
