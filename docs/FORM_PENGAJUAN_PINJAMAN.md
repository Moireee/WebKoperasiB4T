# Proses Pengajuan Pinjaman

## Data yang diminta dari anggota

- Nama lengkap
- Alamat
- No. Telepon/HP
- No. KTP
- Tujuan pinjaman: Pembelian Barang; Renovasi Rumah/Perbaikan Kendaraan; Sosial (Sakit & Musibah); Pembayaran Kontrakan; Lainnya
- Lama pinjaman: 12 bulan (14% margin); 24 bulan (16,5% margin); tenor lain (jumlah bulan diisi anggota)
- Nominal pinjaman
- No. rekening, nama pemilik, dan nama bank
- Keterangan jaminan
- Foto jaminan (opsional)
- Lain-lain / catatan tambahan

## Alur administrasi

1. Anggota kirim pengajuan. Status awal `Diajukan`.
2. Admin melihat daftar masuk dan membuka detail.
3. Admin memeriksa dokumen, dapat memberi catatan dan menetapkan status `Sedang ditinjau`, `Perlu dilengkapi`, `Disetujui`, atau `Ditolak`.
4. Admin menekan `Cetak / Simpan PDF`; pada dialog cetak browser pilih printer atau `Save as PDF`.
5. Status `Disetujui` hanya menandai hasil review. Pencairan belum terjadi sampai Admin menjalankan prosedur pinjaman/pencairan terpisah.

## Batasan demo

- Data lokal hanya terlihat pada browser yang sama.
- Lampiran dalam demo lokal dibatasi sampai 700 KB agar penyimpanan browser tidak cepat penuh; online bucket membatasi file sampai 2 MB.
- Online mode perlu menjalankan schema baru atau `supabase/loan_applications_migration.sql` pada project uji.
- Jangan gunakan nomor KTP, rekening, alamat, atau foto jaminan sungguhan selama demo atau pada repository publik.
