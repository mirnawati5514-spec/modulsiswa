# Modul Siswa Sekolah

Aplikasi React/Vite dengan backend Node.js (`server.js`) dan PostgreSQL. Tampilan yang aktif saat ini berjalan langsung sebagai siswa contoh tanpa login. Absensi QR disimpan permanen di IndexedDB pada browser/perangkat yang sama, termasuk tanggal dan waktu scan; riwayat dimuat kembali saat aplikasi dibuka lagi. Gunakan URL dan profil browser yang sama agar penyimpanan lokal tetap ditemukan. Menghapus data situs atau berpindah perangkat/browser dapat menghapus atau tidak menampilkan data tersebut.

Backend PostgreSQL sudah tersedia sebagai dasar untuk penggunaan online, tetapi UI lokal saat ini belum mengirim catatan QR ke backend. Catatan yang sudah tersimpan di IndexedDB tidak otomatis dipindahkan ke PostgreSQL. Sinkronisasi online memerlukan mengaktifkan kembali alur akun dan mengganti penyimpanan lokal dengan request ke API server.

## Persiapan database dan admin pertama

Sediakan PostgreSQL 14 atau lebih baru, lalu buat database kosong untuk aplikasi. Jangan masukkan URL database atau kata sandi ke source control.

Di PowerShell, isi variabel untuk proses backend. Ganti nilai contoh dengan kredensial database dan kata sandi admin sekolah:

```powershell
$env:DATABASE_URL = 'postgresql://USER:PASSWORD@HOST:5432/NAMA_DATABASE?sslmode=require'
$env:ADMIN_USERNAME = 'adminsekolah'
$env:ADMIN_PASSWORD = 'ganti-dengan-kata-sandi-kuat-minimal-12-karakter'
npm.cmd run server
```

Saat pertama berjalan, backend membuat tabel dan admin awal. Akun admin dibuat sekali saja; mengganti `ADMIN_PASSWORD` setelah akun ada tidak akan mereset kata sandinya. Simpan rahasia di pengelola environment/secret milik host, jangan di file yang dikomit.

## Menjalankan aplikasi lokal

Persyaratan UI lokal: Node.js 20.19+ atau 22.12+.

1. Jalankan `npm.cmd install`.
2. Jalankan `npm.cmd run dev`.
3. Buka `http://127.0.0.1:5174`. Beranda dan QR siswa contoh akan tampil langsung tanpa login.
4. Buka menu **Absensi** dan izinkan kamera untuk scan otomatis. Status HADIR dan waktu scan tersimpan lokal; riwayat bisa dibuka kembali dari halaman yang sama.

Kamera memerlukan izin browser. Gunakan URL lokal yang sama setiap kali membuka aplikasi (`127.0.0.1:5174`) karena data IndexedDB terikat ke origin tersebut. Vite meneruskan `/api` ke `127.0.0.1:3001` dalam development.

## Menyiapkan database sekolah untuk penyimpanan server

1. Sediakan PostgreSQL 14 atau lebih baru, misalnya database terkelola milik sekolah/penyedia hosting. Buat database kosong dan pengguna database khusus aplikasi dengan hak akses terbatas.
2. Simpan URL koneksi sebagai secret di host backend. URL umumnya berbentuk `postgresql://USER:PASSWORD@HOST:5432/NAMA_DATABASE?sslmode=require`. Jangan masukkan kata sandi ke Git atau ke kode frontend.
3. Atur environment backend: `NODE_ENV=production`, `DATABASE_URL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` (minimal 12 karakter), dan `PORT` sesuai yang diberikan host.
4. Deploy kode Node.js, jalankan `npm ci`, lalu jalankan `npm run server`. Backend membuat tabel PostgreSQL otomatis saat mulai.
5. Sajikan frontend hasil `npm run build` pada domain HTTPS dan atur reverse proxy agar `/api/*` diteruskan ke backend.
6. Sebelum dipakai sekolah, aktifkan kembali login/peran akun pada UI dan hubungkan alur scan ke endpoint `/api/attendance`. Uji simpan, baca riwayat, dan akses sesuai peran.

Penyimpanan browser dan database server adalah dua tempat terpisah. Catatan lokal yang sudah ada perlu diekspor atau dimigrasikan secara terencana; menjalankan PostgreSQL saja tidak mengunggahnya otomatis.

## Keamanan backend yang tersedia

- Sesi menggunakan cookie `HttpOnly`, `SameSite=Strict`, kedaluwarsa setelah 12 jam, dan memakai atribut `Secure` saat `NODE_ENV=production`.
- Kata sandi di-hash dengan `scrypt`. Percobaan login dibatasi per alamat IP.
- Admin dapat melihat seluruh riwayat, memindai QR untuk mencatat HADIR, dan membuat akun siswa.
- Siswa hanya melihat riwayatnya sendiri, QR miliknya, serta dapat mengirim status Sakit/Izin dengan bukti.
- Berkas bukti dibatasi 5 MB, divalidasi tipe dan tanda berkasnya, lalu disimpan sebagai `BYTEA` di PostgreSQL. Tautan bukti juga memeriksa sesi dan kepemilikan siswa.
- Endpoint mutasi memeriksa Origin. Backend tidak mengaktifkan CORS lintas domain.

Implementasi autentikasi dan endpoint ada di `server/auth.js` dan `server.js`; skema, koneksi pool, serta pembuatan admin awal ada di `server/database.js`. Endpoint server menyediakan login, pemisahan peran, scan QR, dan absensi; UI lokal saat ini memakai profil contoh dan IndexedDB.

Sesi memakai cookie `HttpOnly`/`SameSite=Strict`, kata sandi di-hash dengan `scrypt`, percobaan login dibatasi, dan mutasi memeriksa Origin. Lampiran server dibatasi 5 MB dan disimpan sebagai `BYTEA`. Siapkan backup PostgreSQL dan prosedur pemulihan sebelum penggunaan produksi.

### Data dari backend contoh sebelumnya

Versi lama menulis `server-data/attendance.json` dan berkas ke disk lokal. Versi PostgreSQL ini tidak mengimpor file tersebut otomatis. Jika berisi data sekolah, ekspor dan migrasikan datanya sebelum menghentikan host lama; jangan menyalin bukti siswa ke tempat publik. Data lokal di IndexedDB juga tidak disinkronkan otomatis.

## Build

Jalankan `npm.cmd run build` untuk menghasilkan folder `dist`.
