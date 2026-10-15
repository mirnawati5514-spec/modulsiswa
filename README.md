# Modul Siswa Sekolah

Aplikasi React/Vite dengan backend Node.js (`server.js`) dan PostgreSQL. Absensi, akun, sesi login, dan lampiran tersimpan di database server. Tugas, jadwal, buku, dan pengumuman masih modul/data contoh; tugas tetap tersimpan lokal di browser.

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

## Menjalankan lokal

Persyaratan: Node.js 20.19+ atau 22.12+, serta database PostgreSQL yang dapat dijangkau.

1. Jalankan `npm.cmd install`.
2. Jalankan server dengan variabel database dan admin seperti di atas.
3. Di terminal kedua jalankan `npm.cmd run dev`.
4. Buka alamat Vite, masuk dengan akun admin, lalu pilih **Akun Siswa** untuk membuat akun siswa.
5. Siswa masuk dengan akun masing-masing untuk melihat QR pribadi dan mengirim surat izin/sakit. Admin memindai QR untuk mencatat HADIR.

Kamera memerlukan izin browser. Gunakan `localhost` saat lokal dan HTTPS saat online. Vite hanya meneruskan `/api` ke `127.0.0.1:3001` dalam development.

## Login dan hak akses

- Sesi menggunakan cookie `HttpOnly`, `SameSite=Strict`, kedaluwarsa setelah 12 jam, dan memakai atribut `Secure` saat `NODE_ENV=production`.
- Kata sandi di-hash dengan `scrypt`. Percobaan login dibatasi per alamat IP.
- Admin dapat melihat seluruh riwayat, memindai QR untuk mencatat HADIR, dan membuat akun siswa.
- Siswa hanya melihat riwayatnya sendiri, QR miliknya, serta dapat mengirim status Sakit/Izin dengan bukti.
- Berkas bukti dibatasi 5 MB, divalidasi tipe dan tanda berkasnya, lalu disimpan sebagai `BYTEA` di PostgreSQL. Tautan bukti juga memeriksa sesi dan kepemilikan siswa.
- Endpoint mutasi memeriksa Origin. Backend tidak mengaktifkan CORS lintas domain.

Implementasi autentikasi dan endpoint ada di `server/auth.js` dan `server.js`; skema, koneksi pool, serta pembuatan admin awal ada di `server/database.js`. UI login, pemisahan tampilan berdasarkan peran, QR, dan alur absensi ada di `src/App.jsx`; request browser ada di `src/attendanceApi.js`.

## Menyiapkan agar online di sekolah

1. Siapkan host aplikasi yang menjalankan Node.js dan database PostgreSQL terkelola. Pastikan database menerima koneksi TLS dan simpan `DATABASE_URL` sebagai secret host.
2. Atur environment host: `NODE_ENV=production`, `DATABASE_URL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, dan port yang disediakan platform. Backend otomatis bind ke `0.0.0.0` dalam mode production; untuk kebutuhan khusus gunakan `HOST`.
3. Jalankan `npm ci`, lalu perintah start `npm run server`. Skema database dibuat otomatis saat backend mulai.
4. Sajikan hasil `npm run build` (`dist`) di domain HTTPS sekolah. Reverse proxy harus meneruskan `/api/*` ke proses backend pada port-nya dengan header `Host` asli dipertahankan. Karena browser dan API berada pada satu origin, cookie sesi tetap terlindungi dan tautan lampiran bekerja.
5. Uji login kedua peran, scan QR, unggah bukti, akses riwayat, serta penolakan akses silang sebelum digunakan siswa.
6. Siapkan backup PostgreSQL terenkripsi, pemulihan berkala, pemantauan kapasitas lampiran, dan prosedur menonaktifkan akun.

Vite proxy di `vite.config.js` hanya untuk development; konfigurasi reverse proxy dan domain harus dibuat di host sekolah. Saya belum menerbitkan aplikasi ke internet karena repo ini belum memiliki domain, akun hosting, atau kredensial PostgreSQL.

### Data dari backend contoh sebelumnya

Versi lama menulis `server-data/attendance.json` dan berkas ke disk lokal. Versi PostgreSQL ini tidak mengimpor file tersebut otomatis. Jika berisi data sekolah, ekspor dan migrasikan datanya sebelum menghentikan host lama; jangan menyalin bukti siswa ke tempat publik. Data lokal di IndexedDB juga tidak disinkronkan otomatis.

## Build

Jalankan `npm.cmd run build` untuk menghasilkan folder `dist`.
