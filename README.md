# E-VOTING ROBOTIC PRO — Supabase Edition

Aplikasi web voting online dengan Supabase Auth, Postgres, RLS, token/QR, atomic vote RPC, realtime updates, upload foto JPG, CSV, dan cetak/PDF.

## Isi paket
- `index.html` — UI responsif Dark/Light dengan aksen RGB.
- `app.js` — Supabase client, admin dashboard, token/QR, voting, realtime, laporan.
- `supabase/schema.sql` — tabel, RLS, RPC, storage bucket, dan realtime.
- `SUPABASE_SETUP.md` — langkah setup dan keamanan.

## Catatan penting
Paket ini adalah source project siap dikonfigurasi dan deploy. Belum online sampai Anda membuat proyek Supabase, memasukkan Project URL dan anon/publishable key, menjalankan SQL, membuat akun admin, lalu menerbitkan situs ke hosting. Jangan pernah menaruh `service_role` key di browser.

## Menjalankan
Untuk uji lokal gunakan server statis (bukan membuka `file://`):
```bash
python -m http.server 8000
```
Lalu buka `http://localhost:8000`.

Konfigurasi `SUPABASE_URL` dan `SUPABASE_ANON_KEY` di bagian atas `app.js`.
