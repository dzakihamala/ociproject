# Sistem Tugas

Aplikasi pengumpulan tugas digital untuk guru dan siswa, di-host di **Cloudflare**.

## Tech stack (baru)

| Layer | Teknologi |
|-------|-----------|
| Frontend | **React 19** + **TypeScript** + **Vite** + **React Router** |
| Backend | **Hono** on **Cloudflare Workers** |
| Database | **D1** (SQLite) |
| File storage | **R2** |
| Deploy frontend | **Cloudflare Pages** |

## Struktur proyek

```
apps/web/          → SPA React (guru, siswa, admin)
workers/api/       → API Hono + D1 + R2
```

## Setup lokal

### 1. Install dependencies

```bash
npm install
```

### 2. Worker API

```bash
cd workers/api
# Edit wrangler.toml: database_id (npx wrangler d1 list), R2 public URLs
cp .dev.vars.example .dev.vars   # JWT_SECRET & SETUP_KEY untuk dev lokal
npm run dev
```

Production secrets:

```bash
npx wrangler secret put JWT_SECRET
npx wrangler secret put SETUP_KEY
```

API berjalan di `http://127.0.0.1:8787`.

Migrasi D1 (antrian upload siswa — jalankan sekali per database):

```bash
cd workers/api
npx wrangler d1 execute tugas-db --local --file=./migrations/0001_submit_throttle.sql
npx wrangler d1 execute tugas-db --remote --file=./migrations/0001_submit_throttle.sql
```

(Tabel juga dibuat otomatis saat request pertama jika migrasi belum dijalankan.)

### 3. Frontend

```bash
cp apps/web/.env.example apps/web/.env
# VITE_API_BASE=http://127.0.0.1:8787  (untuk dev dengan proxy Vite)
npm run dev
```

Buka `http://localhost:5173`.

## Deploy

**Worker:**

```bash
npm run deploy:api
```

**Pages** (build output `apps/web/dist`):

- Connect repo ke Cloudflare Pages
- Build command: `npm run build`
- Output directory: `apps/web/dist`
- Environment: `VITE_API_BASE=https://tugas-worker.<account>.workers.dev`

## Routes

| URL | Halaman |
|-----|---------|
| `/` | Landing + login guru + kode siswa |
| `/dashboard` | Daftar tugas (guru) |
| `/kelas` | Kelola kelas & siswa |
| `/detail/:id` | Detail tugas & pengumpulan |
| `/kumpul?code=XXXXXX` | Form siswa |
| `/admin` | Manajemen akun guru |

## Catatan migrasi

- **Kompresi media client** (foto/video di browser) dari versi lama belum di-port ke React; siswa mengunggah file langsung (server validasi tipe & ukuran max 100MB/file).
- Database D1 & bucket R2 **tetap sama** — tidak perlu migrasi data jika binding worker tidak berubah.
- URL production Pages bisa memakai clean paths (`/dashboard`) berkat `public/_redirects`.
