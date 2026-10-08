# Fix khusus: `Respons server tidak valid` pada Vercel

Versi 3 mengubah struktur deployment karena pesan tersebut berarti browser menerima respons yang **bukan JSON** dari URL API. Pada Vercel, itu biasanya terjadi ketika request tidak mencapai Express atau Function gagal sebelum middleware error aplikasi sempat mengirim JSON.

## Perubahan struktur yang wajib dipertahankan

Hanya ada **satu entrypoint Express yang dikenali Vercel**:

```text
/server.js              -> module.exports = app
/src/application.js     -> implementasi Express (nama sengaja bukan app.js/server.js/index.js)
/scripts/local-server.js -> app.listen hanya untuk lokal
```

Jangan membuat kembali `src/app.js`, `src/server.js`, atau `src/index.js` sebagai entrypoint kedua. Vercel melakukan auto-detection terhadap nama-nama tersebut.

`public/**` dilayani langsung oleh CDN Vercel. Backend tidak bergantung pada `express.static()` ketika `VERCEL=1`.

## Urutan pengecekan setelah deploy

### 1. Runtime Express

Buka:

```text
https://DOMAIN/api/v1/system/ping
```

Harus JSON seperti:

```json
{
  "success": true,
  "message": "API runtime reachable",
  "data": {
    "databaseConfigured": true
  }
}
```

Jika URL ini menghasilkan HTML, 404 platform, atau `FUNCTION_INVOCATION_FAILED`, masalah ada di Vercel project/root directory/runtime, bukan di login/database.

### 2. Database

Buka:

```text
https://DOMAIN/health
```

Target:

```json
{
  "success": true,
  "status": "ok",
  "database": "ok"
}
```

Jika `DATABASE_NOT_CONFIGURED`, tambahkan connection string pada environment Vercel. Jika `DATABASE_UNAVAILABLE`, periksa URL, password, SSL, dan status provider PostgreSQL.

### 3. Schema dan seed

Buka:

```text
https://DOMAIN/api/v1/system/status
```

Untuk deployment demo pertama, Vercel Environment Variables perlu berisi:

```text
DATABASE_URL=postgresql://...
JWT_SECRET=<minimal 32 karakter>
DEMO_MODE=true
AUTO_MIGRATE=true
AUTO_SEED_DEMO=true
CRON_SECRET=<secret berbeda>
DATABASE_SSL=true
DB_POOL_MAX=2
```

Setelah mengubah Environment Variables, lakukan **Redeploy**. Environment variable yang baru tidak mengubah deployment lama.

### 4. Login

Setelah tiga pemeriksaan di atas berhasil, coba:

```text
230012345
```

## Vercel Project Settings

Untuk repository yang berisi project ini langsung di root:

```text
Framework Preset : Other / auto detect
Root Directory   : .
Build Command    : kosong / default
Output Directory : kosong / default
Install Command  : npm install (default)
Node.js           : mengikuti package.json (24.x)
```

Jika isi project berada dalam subfolder repository, Root Directory pada Vercel harus menunjuk **folder yang berisi package.json dan server.js**.

## Mengapa SQL juga di-embed sebagai module JS

`db/*.sql` tetap tersedia sebagai sumber SQL yang mudah dibaca. Namun runtime bootstrap Vercel memakai copy identik di `src/db/sql/*.js`. Tujuannya memastikan file migration ikut ke bundle Function dan tidak bergantung pada dynamic filesystem tracing.

## UI diagnostik

Client versi 3 tidak lagi mengubah semua non-JSON menjadi pesan umum `Respons server tidak valid`. Jika API mengembalikan HTML/text dari platform, UI menampilkan:

- HTTP status;
- tipe respons;
- endpoint yang gagal;
- potongan respons;
- request ID bila tersedia.

Dengan demikian error routing Vercel dapat dibedakan dari error PostgreSQL atau business rule.
