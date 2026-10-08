# Release Notes v3.0.0 — Vercel Response Fix

## Fixed

- Menghapus ambiguity Vercel auto-detection: sebelumnya terdapat `server.js`, `src/server.js`, dan `src/app.js` yang semuanya berpotensi dikenali sebagai Express entrypoint. Versi 3 hanya menggunakan `/server.js` sebagai entrypoint Vercel.
- Memindahkan `app.listen()` ke `scripts/local-server.js`; `/server.js` sekarang hanya mengekspor Express app.
- Memindahkan implementasi Express ke `src/application.js` agar tidak ikut terdeteksi sebagai entrypoint kedua.
- Runtime database bootstrap tidak lagi bergantung pada `fs.readFileSync()` terhadap file SQL. SQL di-import statis dari `src/db/sql/*.js`, sehingga migration selalu ikut pada Vercel Function bundle.
- Menambahkan endpoint `/api/v1/system/ping` yang tidak menyentuh database untuk membedakan masalah Vercel routing dari masalah PostgreSQL.
- `/health` selalu memberi JSON diagnostik terstruktur.
- Client API parser sekarang membaca response sebagai text lebih dulu dan menampilkan diagnosis jika platform mengembalikan HTML/non-JSON.
- Menambahkan mapping error PostgreSQL untuk credential, permission, SSL, network, dan database tidak ditemukan.
- Pool PostgreSQL disesuaikan untuk hosted/serverless deployment dan mendukung lebih banyak nama environment variable provider.
- Advisory lock bootstrap diubah menjadi transaction-scoped lock agar lebih aman terhadap freeze/reuse instance serverless.
- Docker entrypoint disesuaikan dengan pemisahan local listener dan Vercel export.

## Deployment check

Urutan pemeriksaan sesudah deployment:

1. `/api/v1/system/ping`
2. `/health`
3. `/api/v1/system/status`
4. login akun dummy

Baca `VERCEL_RESPONSE_FIX.md` untuk diagnosis rinci.
