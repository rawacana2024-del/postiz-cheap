# Deployment postiz-cheap ke Prisma (Compute + Postgres) — Free, tanpa kartu

Disusun 2026-11-21. Fork: https://github.com/rawacana2024-del/postiz-cheap
Status: **siap deploy** — perubahan minimal sudah dibuat & diuji lokal (lihat bawah).
Belum ada akun Prisma, database, atau deploy yang dibuat — semua langkah
di bawah ini masih harus dilakukan lewat browser/Console.

## Verdict

Bisa deploy di Prisma Compute paket gratis. Jalur yang dipakai: **Composer +
`prisma deploy` (Prisma CLI 8)**. Repo ini mem-pin Prisma 7.8.0 untuk
perintah ORM (`generate`, `db push`, `validate`); CLI 7.8.0 **tidak punya**
perintah `deploy`, jadi deploy memakai `npx prisma@latest deploy`
(CLI 8.0.0-rc.34 saat penulisan) atau deploy-on-push dari Console.

## Yang diubah (semua lokal, belum di-push)

| File | Perubahan |
| --- | --- |
| `next.config.mjs` | Tambah `output: "standalone"` — Compute menjalankan server standalone hasil `next build`. |
| `src/lib/auth.js` | **Hapus** `CredentialsProvider` "Demo / Admin Account" — provider ini menerima email APA PUN tanpa cek password dan otomatis membuat user + 50 kredit. Di deployment publik, siapa pun bisa masuk sebagai akun siapa pun. Google sign-in kini satu-satunya provider. Juga hapus secret fallback hardcode (`free-ai-social-media-scheduler-fallback-secret-2025`); `NEXTAUTH_SECRET` wajib diisi dari environment. |
| `composer/service.ts` | (baru) Deklarasi service Composer: `compute({ name: "web", build: nextjs(...) })`. |
| `composer/module.ts` | (baru) App root Composer: `appRoot("postiz-cheap", ...)`. |
| `prisma.config.ts` | Tambah section `composer` (`entry: ./composer/module.ts`, extensions `prismaCloud()`, `nodeBuild()`, `nextjsBuild()`, `state: prismaState()`). Catatan: `defineConfig` Prisma 7.8.0 belum mengenal key `composer` (baru di Prisma 8 `definePrismaConfig`); key ini diabaikan CLI 7 dan dibaca CLI 8 saat deploy — ditandai `@ts-expect-error`. |
| `package.json` | Tambah devDeps: `@prisma/composer` 0.39.0, `@prisma/composer-prisma-cloud` 0.39.0, `@types/node` (untuk cek tipe file Composer). |

Tidak ada perubahan logika aplikasi. Konfigurasi tetap dibaca dari
`process.env` (terpusat di `src/lib/config.js`, `src/lib/auth.js`,
`src/lib/prisma.js`); Compute meng-inject project environment variables ke
deployment, jadi tidak perlu refactor ke `service.input()` untuk deploy.
Refactor penuh ke pola Composer (`service.input()` + `rawPostgres()` +
`service.load()`) adalah follow-up opsional — menyentuh ~18 file yang
mengimpor `lib/config`, `lib/prisma`, `lib/auth` (36 pemanggilan
`getServerSession`) — bukan bagian dari persiapan minimal ini.

## Yang diuji lokal (tanpa kredensial rahasia, env dummy)

- `npx prisma validate` → schema valid.
- `npx prisma generate` → Prisma Client v7.8.0 berhasil dibuat.
- `npx tsc --noEmit` pada `composer/service.ts`, `composer/module.ts`,
  `prisma.config.ts` → 0 error (wiring Composer terverifikasi).
- `npm run build` → sukses; `.next/standalone/server.js` terbentuk.
- Smoke test server standalone: `/login` → 200, `/` → 200,
  `/api/posts` tanpa login → 401 (auth guard bekerja).

Catatan lingkungan uji: download binary Prisma engine lewat Node di VM ini
gagal berulang (`ECONNRESET` via proxy) — binary `schema-engine` diunduh
manual dengan `curl` dan dipasang lewat
`PRISMA_SCHEMA_ENGINE_BINARY=~/.cache/prisma/.../schema-engine`.
Itu masalah jaringan lokal VM, bukan masalah repo; di mesin/CI lain
`npm install` biasa sudah cukup.

## Environment variables untuk deployment

Set di Prisma Console (Project → Environment variables, scope production)
atau `npx prisma project env add KEY --role production` (CLI 8).
Nilai TIDAK bisa dibaca kembali setelah disimpan — simpan salinannya.

| Variable | Wajib | Diisi dari mana |
| --- | --- | --- |
| `DATABASE_URL` | Ya | Otomatis dari database Prisma Postgres yang dibuat (connection string pooled). |
| `DIRECT_URL` | Ya (untuk `db push`) | Connection string direct database yang sama. |
| `NEXTAUTH_URL` | Ya | URL publik aplikasi, mis. `https://<nama>.prisma.build` (didapat setelah deploy pertama; set lalu deploy ulang, karena env di-bake saat deploy). |
| `NEXTAUTH_SECRET` | Ya | Acak 32+ karakter, mis. `openssl rand -base64 32`. Jangan pakai nilai contoh. |
| `GOOGLE_CLIENT_ID` | Ya | Google Cloud Console → APIs & Services → Credentials → buat OAuth 2.0 Client ID (Web application). Redirect URI: `https://<app-url>/api/auth/callback/google`. |
| `GOOGLE_CLIENT_SECRET` | Ya | Sama seperti di atas (client secret). |
| `MUAPIAPP_API_KEY` | Ya (untuk AI + posting) | Dashboard MuAPI (muapi.ai) → buat API key. Tanpa ini, AI dan publikasi tidak jalan. |
| `WEBHOOK_URL` | Opsional | Umumnya sama dengan `NEXTAUTH_URL`. |
| `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` | Opsional | Hanya bila mau mengaktifkan pembelian kredit Stripe. Tanpa ini, top-up kredit nonaktif (aplikasi tetap jalan). |
| `CRON_SECRET` | Ya, bila memakai cron eksternal | Acak ≥16 karakter; dipakai route cron (lihat bawah). |

## Langkah Console (urut, lewat browser)

1. Buat akun Prisma di https://console.prisma.io (sign up dengan GitHub —
   akun GitHub `rawacana2024-del` sudah ada; tanpa kartu).
2. Buat Project baru → buat database **Prisma Postgres** (Free: 2 GB,
   200.000 operasi/bulan). Catat `DATABASE_URL` (pooled) dan `DIRECT_URL`.
   Pilih region terdekat (Asia Tenggara) bila ditawarkan.
3. Hubungkan repo GitHub `rawacana2024-del/postiz-cheap` (branch `main`) —
   atau, bila Console tidak menawarkan koneksi repo langsung, deploy dari
   terminal dengan `npx prisma@latest deploy` setelah `prisma auth login`.
4. Set semua environment variables wajib dari tabel di atas (scope
   production). `NEXTAUTH_URL` sementara boleh `http://localhost:3000`,
   diganti ke URL `prisma.build` setelah deploy pertama.
5. Buat skema database (repo ini TIDAK punya folder `migrations/`; cara
   resmi sesuai README adalah `db push`):
   `DATABASE_URL="..." DIRECT_URL="..." npx prisma db push`
   (jalankan dari checkout repo; butuh DATABASE_URL asli, bukan dummy).
6. Deploy: `npx prisma@latest deploy` (dari root repo, setelah login
   `npx prisma@latest auth login`), atau picu deploy dari Console.
   Deploy pertama membuat project, service `web`, dan URL
   `https://<nama>.prisma.build`.
7. Setelah URL didapat: set `NEXTAUTH_URL` ke URL itu (project env,
   production) → deploy ulang; tambahkan redirect URI
   `https://<app-url>/api/auth/callback/google` di Google OAuth client.
8. Buka URL aplikasi → sign in dengan Google → sambungkan akun sosial di
   menu Integrations (lewat MuAPI) → buat post pertama.

## Scheduler (posting terjadwal) — perlu satu tambahan kecil

Aplikasi ini TIDAK punya worker scheduler bawaan. Posting terjadwal
terpicu saat route `GET /api/posts` dipanggil (route itu juga mem-poll
status post yang sedang diproses) — dan **route itu butuh sesi login
(401 tanpa auth)**, jadi cron eksternal tidak bisa memanggilnya begitu saja.
Prisma Compute juga tidak punya cron bawaan (direncanakan awal 2027).

Solusi: tambah route kecil `GET /api/cron/posts` yang memeriksa header
`Authorization: Bearer <CRON_SECRET>` lalu menjalankan logika pemicu +
polling yang sama dengan `GET /api/posts`, lalu jadwalkan pemanggil
eksternal (GitHub Actions gratis, cron-job.org, atau QStash) tiap 5 menit
ke `https://<app-url>/api/cron/posts`. Route ini BELUM dibuat — dikerjakan
sebagai follow-up setelah deploy pertama jalan.

## Batasan paket gratis yang relevan

- Compute Free: 1 juta request, 360 GB-hours memori, 4 vCPU-hours/bulan;
  service tidur (scale-to-zero) saat idle — request pertama setelah tidur
  agak lambat.
- Postgres Free: 2 GB, 200.000 operasi/bulan, **tanpa backup**.
- Env var berubah hanya berlaku setelah deploy ulang.
- `NEXTAUTH_URL` harus sama persis dengan URL publik (termasuk `https://`),
  kalau tidak login Google gagal (callback mismatch).
- Jangan pernah commit file `.env` (sudah di `.gitignore`) atau menulis
  secret apa pun ke repo.
