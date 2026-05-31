# Legacy (vanilla JS)

Versi sebelum migrasi:

- `app.js` — seluruh logika frontend (~3400 baris)
- `worker.js` — Cloudflare Worker (itty-router bundle)
- `*.html` — halaman statis terpisah
- `styles.css` — desain Matcha Minimal

Digantikan oleh `apps/web` (React) dan `workers/api` (Hono TypeScript).
