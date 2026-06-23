# Envoyou AI Editorial System

[English](./README.md) | [Bahasa Indonesia](./README.id.md)

[![Next.js](https://img.shields.io/badge/Next.js-16.2.6-black?style=for-the-badge&logo=nextdotjs)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2.4-blue?style=for-the-badge&logo=react)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4.0-06B6D4?style=for-the-badge&logo=tailwindcss)](https://tailwindcss.com/)
[![Prisma](https://img.shields.io/badge/Prisma-7.8.0-2D3748?style=for-the-badge&logo=prisma&logoColor=white)](https://prisma.io/)
[![Gemini](https://img.shields.io/badge/Google_Gemini-3.x-4285F4?style=for-the-badge&logo=googlegemini&logoColor=white)](https://ai.google.dev/gemini-api)

**Envoyou AI Editorial Intelligence** adalah platform editorial AI untuk memoles draf artikel mentah menjadi artikel siap publikasi sesuai standar editorial premium.

Alur produk saat ini dibuat sederhana: pengguna login, menempelkan draf mentah atau meminta EAI untuk membantu membuat ide draft awal, memilih kategori dan tipe artikel, lalu menekan `Refine Draft`. Setelah sistem selesai bekerja, pengguna meninjau refined draft, readiness report, remaining checks, dan metadata SEO yang tersedia sebelum mengekspor konten. Gemini menjadi provider default, sedangkan Groq tetap tersedia sebagai provider alternatif opsional.

---

## 🚀 Fitur Utama

1. **Single-Click Editorial Polish**
   * Pengguna menempelkan draf kasar, memilih kategori dan tipe artikel, lalu menjalankan `Refine Draft`.
   * Sistem tidak hanya memberi feedback abstrak, tetapi juga membuat refined draft lengkap yang bisa ditinjau dan diekspor.

2. **Refinement Report & Final Quality Gate**
   * Menilai kesiapan refined draft sebagai **Ready**, **Needs Review**, atau **Blocked**, bukan memberi skor pada draf mentah yang memang belum selesai.
   * Merangkum perubahan yang berhasil dilakukan serta remaining checks yang masih membutuhkan keputusan editor.
   * Memeriksa source fidelity, framing temporal, integritas tabel Markdown, relevansi internal link, drift istilah, dan kebutuhan verifikasi sumber.
   * Marker verifikasi internal tetap terlihat di report, tetapi dibersihkan dari publication draft sebelum ekspor CMS.

3. **Input Metadata Artikel yang Dinamis**
   * Kalibrasi evaluasi AI disesuaikan dengan tipe artikel user atau tenant, kategori topik, audiens target, serta target panjang kata, semua bisa di kustomisasi sesuai brand masing-masing tenant.

4. **Audit Log Database Lengkap**
   * Menyimpan setiap riwayat analisis ke database PostgreSQL secara aman untuk audit kualitas dan analisis performa prompt masing-masing tenant. Log Polish menyimpan refined draft, readiness, perubahan utama, flags, dan detail error jika terjadi masalah koneksi API.

5. **Antarmuka Premium Modern**
   * UI responsif dengan performa tinggi yang dirancang menggunakan Tailwind CSS v4, Framer Motion untuk animasi mikro, Base UI, Shadcn, dan sistem pemberitahuan *Sonner*. Mendukung tampilan gelap (*dark mode*) secara penuh.

6. **Ekspor & Integrasi CMS (Export API)**
   * Ekspor draf final dan metadata SEO secara langsung ke CMS eksternal.
   * Melacak status ekspor dan referensi sumber (*source references*) langsung dari Sidebar Riwayat untuk alur publikasi yang mulus.

7. **Login Aplikasi, Menu Setting, & Demo Mode**
   * Mendukung **Demo Mode** (Guest Mode tanpa login) yang memungkinkan pengunjung baru mencoba workspace dan menjalankan maksimal 2 refinement gratis tanpa harus masuk terlebih dahulu.
   * User wajib membuat atau memilih Clerk Organization sebelum mengisi identitas publikasi, standar editorial, dan koneksi CMS.
   * Creator workspace yang eligible menerima 10 kredit gratis pada ledger organisasi; anggota undangan tidak menambahkan alokasi trial baru.
   * Memproteksi alokasi kredit trial melalui normalisasi email, pemblokiran domain disposable, dan idempotency key pada ledger workspace.
   * Memproteksi akses penuh, riwayat analisis, dashboard analitik, pengaturan publikasi, dan ekspor CMS di bawah login yang aman.
   * Menu `Settings` ditempatkan di atas toggle dark/light untuk preferensi user lokal, Auto-save, Bahasa Output AI, Strictness Editorial, serta logout/sign-in.

8. **Dashboard Analytics Tenant (Terbaru)**
   * Menampilkan metrik editorial utama termasuk jumlah draf diproses, rasio penyelesaian, rasio draf siap terbit, retensi AI, dan rasio sukses ekspor CMS.
   * Menyediakan filter rentang waktu dinamis (7 hari, 30 hari, 90 hari, bulan ini, bulan lalu, all-time, atau custom date range) langsung dari antarmuka dashboard.
   * Melacak produktivitas editor melalui tabel performa pengguna (Editor Productivity & Coaching).
   * Mengukur kecepatan publikasi dengan rata-rata waktu terbit (Avg. Time-to-Publish).
   * Menganalisis sebaran topik konten melalui distribusi kategori artikel dengan progress bar yang elegan.
   * Menyajikan perbandingan tren dinamis untuk Total Reviews, Ready Rate, dan Flags sesuai rentang waktu yang dipilih dengan indikator arah tren (▲ / ▼).
   * Ekspor laporan khusus untuk administrator tenant dalam format CSV.

---

## 🛠️ Teknologi yang Digunakan

* **Framework Utama**: [Next.js 16.2.6 (App Router)](https://nextjs.org/)
* **Library UI**: [React 19](https://react.dev/), [Base UI](https://base-ui.com/), [Shadcn](https://ui.shadcn.com/)
* **Styling & Animasi**: [Tailwind CSS v4](https://tailwindcss.com/), [Framer Motion](https://www.framer.com/motion/)
* **ORM & Database**: [Prisma ORM 7.8.0](https://prisma.io/) dengan PostgreSQL di host serverless [Neon Database](https://neon.tech/)
* **AI Integration**: [Google Gen AI SDK 2.6.0](https://www.npmjs.com/package/@google/genai) dengan `gemini-3.5-flash` dan `gemini-3.1-flash-lite`; Groq tersedia sebagai provider alternatif opsional.
* **Validasi Data**: [Zod 4.4.3](https://zod.dev/)

---

## 📁 Struktur Proyek Utama

```text
ai-editorial-system/
├── prisma/
│   └── schema.prisma         # Definisi database model (AnalysisLog)
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── analyze/
│   │   │       └── route.ts  # Orkestrasi Gemini multi-tahap & database logging
│   │   ├── login/
│   │   │   └── page.tsx      # Halaman login aplikasi
│   │   ├── dashboard/
│   │   │   └── page.tsx      # Dashboard analytics
│   │   ├── globals.css       # Konfigurasi styling & token Tailwind CSS v4
│   │   ├── layout.tsx        # Shell layout utama aplikasi
│   │   └── page.tsx          # Workspace editorial utama
│   ├── components/
│   │   ├── Editor.tsx        # Editor draf artikel beserta panel input metadata
│   │   ├── FeedbackPanel.tsx # Refinement report, readiness, remaining checks, dan SEO
│   │   ├── SettingsMenu.tsx  # Menu setting workspace dan logout
│   │   └── ui/               # Koleksi komponen UI dasar (Button, Card, Input, Textarea, dll.)
│   ├── lib/
│   │   ├── dashboard-auth.ts # Helper sesi login bertanda tangan
│   │   ├── db.ts             # Inisialisasi Prisma Client singleton
│   │   ├── final-quality.ts  # Validasi deterministik refined draft dan cleanup publikasi
│   │   ├── prompts.ts        # Kumpulan instruksi sistem prompt dan calibration tone
│   │   ├── schema.ts         # Schema validasi Zod untuk JSON output dari AI
│   │   └── utils.ts          # Helper utility Tailwind Merge & Clsx
│   └── types/
│       └── index.ts          # Definisi tipe TypeScript
├── .env.example              # Contoh konfigurasi environment variables
├── package.json              # Daftar depedensi dan skrip npm
└── tsconfig.json             # Konfigurasi TypeScript
```

---

## ⚙️ Persyaratan & Instalasi Lokal

Ikuti langkah-langkah di bawah ini untuk menjalankan Envoyou AI Editorial System di komputer lokal Anda.

### 1. Prasyarat
Pastikan Anda sudah menginstal:
* **Node.js** (versi 18.x atau yang lebih baru)
* **npm** atau package manager lainnya (Yarn / Pnpm / Bun)
* Database PostgreSQL (atau akun [Neon Database](https://neon.tech) untuk setup serverless cepat)

### 2. Kloning & Masuk ke Folder Proyek
```bash
cd ai-editorial-system
```

### 3. Instal Dependensi
```bash
npm install
```

### 4. Konfigurasi Environment Variables
Salin file `.env.example` menjadi `.env`:
```bash
cp .env.example .env
```
Buka file `.env` dan lengkapi variabel berikut:
```env
# Koneksi Neon Database (Pooled connection untuk runtime Next.js)
DATABASE_URL="postgres://user:password@endpoint-pooler.neon.tech/neondb?pgbouncer=true&connect_timeout=15"

# Koneksi langsung (Direct connection untuk Prisma Migrate/Push)
DIRECT_URL="postgres://user:password@endpoint.neon.tech/neondb?connect_timeout=15"

# Provider AI aktif
ACTIVE_AI_PROVIDER="gemini"

# Gemini API Key sebagai provider utama
GEMINI_API_KEY="your-gemini-api-key"

# Groq API Key sebagai provider alternatif opsional
GROQ_API_KEY="your-groq-api-key"

# Analytics biaya: token berasal dari provider, nilai IDR memakai kurs ini
AI_COST_USD_TO_IDR="kurs USD per IDR (contoh: 16500)"

# Opsional: override harga model dalam USD per 1 juta token
# AI_MODEL_PRICING_JSON='{"qwen/qwen3-32b":{"inputUsdPerMillion":0.29,"outputUsdPerMillion":0.59}}'

# Opsional: secret terpisah untuk tanda tangan sesi login
DASHBOARD_AUTH_SECRET="secret-session-random"

# Feature flag rollout produk (rebuild setelah mengubah nilai NEXT_PUBLIC)
NEXT_PUBLIC_DEMO_ENABLED="true"
NEXT_PUBLIC_SIGNUP_ENABLED="true"
NEXT_PUBLIC_PRICING_ENABLED="true"
NEXT_PUBLIC_BILLING_ENABLED="false"

# Payment gateway (midtrans)
PAYMENT_PROVIDER="midtrans"
PAYMENT_USD_TO_IDR_RATE="kurs USD per IDR (contoh: 16500)"
PAYMENT_TAX_LABEL="Tax is not separately itemized in the displayed checkout amount."
MIDTRANS_CLIENT_ID="MCH-client-id-sandbox"
MIDTRANS_SECRET_KEY="secret-key-sandbox"
MIDTRANS_IS_PRODUCTION="false"

# Identitas legal yang ditampilkan ke publik
LEGAL_OPERATOR_NAME="your company name"
LEGAL_REGISTERED_ADDRESS="your company address"
LEGAL_SUPPORT_EMAIL="your business email"
LEGAL_CONTACT_EMAIL="your business email"
LEGAL_PRIVACY_EMAIL="your business email"
```

> [!NOTE]
> Jika API key provider aktif kosong atau bernilai `"empty"`, sistem secara otomatis berjalan dalam **Mode Pengembangan (Mock Mode)**. Sistem tetap berfungsi dengan menghasilkan data analisis tiruan tanpa memotong kuota AI Anda.

Dashboard analytics mencatat penggunaan token yang dilaporkan provider untuk setiap tahap editorial. Nilai biaya API merupakan estimasi dari token tersebut, tabel harga model, dan kurs `AI_COST_USD_TO_IDR`. Selama refine, UI menampilkan tahap review, rewrite, quality gate, SEO, dan finalisasi secara langsung sambil mulai menampilkan draft sejak chunk tulisan pertama diterima.

Routing Gemini memakai `gemini-3.1-flash-lite` untuk tahap ringan/cepat dan `gemini-3.5-flash` untuk review kompleks, fact-checking, rewrite, refinement, serta quality gate. Request Gemini 3.x memakai `thinkingLevel`, bukan lagi angka legacy `thinkingBudget`.

MIDTRANS Checkout menjadi payment provider default. Ikuti [checklist production MIDTRANS](./docs/MIDTRANS_PRODUCTION.md). Midtrans tetap tersedia sebagai cadangan melalui `PAYMENT_PROVIDER=midtrans`.

Konfirmasi pricing menampilkan nominal final IDR berdasarkan
`PAYMENT_USD_TO_IDR_RATE`, pernyataan pajak, masa aktif kredit, dan ketentuan
manual renewal. Nominal IDR final disimpan pada setiap order untuk verifikasi
webhook.

Feature flag rollout mengendalikan akses demo guest, pendaftaran akun baru,
visibilitas pricing, dan checkout berbayar secara terpisah. Saat billing
dinonaktifkan, tombol pembelian berubah menjadi **Coming Soon** dan API checkout
mengembalikan `503`; webhook tetap aktif untuk rekonsiliasi order lama.

### 5. Setup Database & Migrasi Prisma
Untuk pengembangan schema lokal:
```bash
npx prisma migrate dev
```
Untuk deployment staging atau production:
```bash
npx prisma migrate status
npx prisma migrate deploy
```
*(Opsional)* Anda dapat membuka Prisma Studio untuk melihat isi database secara visual:
```bash
npx prisma studio
```

### 6. Jalankan Server Pengembangan
Jalankan aplikasi di mode development:
```bash
npm run dev
```
Buka browser Anda dan akses di [http://localhost:3000](http://localhost:3000).
Anda akan diarahkan ke `/signup` sebelum masuk ke workspace editor. Dashboard analytics tetap tersedia di `/dashboard` setelah login.

---

## 🧠 Alur Kerja Evaluasi AI

```mermaid
graph TD
    A[Pengguna membuka workspace] --> B[Login]
    B --> C[Tempel atau tulis draf mentah]
    C --> D[Pilih kategori dan tipe artikel]
    D --> E[Opsional: isi audiens, target panjang, dan editorial brief]
    E --> F[Pilih Fast Review atau Publish Ready]
    F --> G[Klik Refine Draft atau tekan Ctrl Enter]
    G --> H{API key provider tersedia?}
    H -- Tidak --> I[Jalankan development mock flow]
    H -- Ya --> J{Mode Publish Ready?}
    J -- Ya --> K[Ambil konteks internal link yang relevan]
    J -- Tidak --> L[Lewati lookup internal link]
    K --> M[Review draf dan identifikasi prioritas editorial]
    L --> M
    M --> N[Rewrite dan stream refined draft]
    N --> O[Normalisasi publication draft]
    O --> P[Jalankan final quality gate dan pemeriksaan deterministik]
    P --> Q{Mode Publish Ready?}
    Q -- Ya --> R[Buat metadata SEO]
    Q -- Tidak --> S[Lewati pembuatan SEO]
    R --> T[Simpan analisis dan telemetry ke Neon]
    S --> T
    T --> U[Tampilkan refined draft, readiness report, checks, dan SEO yang tersedia]
    M -- Error atau timeout --> V[Simpan detail error jika memungkinkan]
    V --> W[Tampilkan notifikasi error]
```

---

## 📖 Dokumentasi Tambahan

Untuk pemahaman teknis dan editorial yang lebih mendalam, Anda dapat merujuk ke berkas dokumentasi berikut yang terletak di folder `docs/`:

*   **[Filosofi Editorial](./docs/editorial-philosophy.md)**: Panduan identitas konten, kalibrasi *tone* penulisan Envoyou, dan indikator wajib gagal.
*   **[Catatan Arsitektur](./docs/architecture-notes.md)**: Rincian keputusan teknologi, penanganan koneksi pooler Neon Database Serverless, skema database, dan validasi Zod.
*   **[Evolusi Prompt](./docs/prompt-evolution.md)**: Rekayasa prompt v1.0.0, kendala teknis (pembersihan markdown JSON, bias skor), dan rencana versi masa depan.
*   **[Peta Jalan Masa Depan](./docs/future-roadmap.md)**: Rencana pengembangan sistem admin analitik, optimasi latensi, peran AI baru (SEO & Fact-checking), dan integrasi CMS.
*   **[Pembandingan Model AI](./docs/evaluation-benchmark.md)**: Hasil perbandingan komparatif (Claude vs GPT vs Llama) dan metodologi pengujian kelayakan model AI baru.
*   **[Checklist Production DOKU](./docs/DOKU_PRODUCTION.md)**: Konfigurasi sandbox, notification URL, production credentials, dan cara beralih ke Midtrans.
*   **[Migrasi Database Production](./docs/PRODUCTION_DATABASE_MIGRATIONS.md)**: Daftar migrasi production yang tertunda, urutan deployment, dan verifikasi setelah deploy.

---

## 📋 What news?
Semua perubahan penting pada proyek **Envoyou AI Editorial System** akan didokumentasikan di [CHANGELOG](./CHANGELOG.md)

## 📝 Lisensi
Proyek ini dilisensikan di bawah **MIT License**. Lihat berkas [LICENSE](./LICENSE) untuk informasi lebih lanjut.
