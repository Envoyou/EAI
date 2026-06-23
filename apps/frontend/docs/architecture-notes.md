# Catatan Arsitektur (Architecture Notes)

Dokumen ini mendokumentasikan keputusan teknis, arsitektur data, alur integrasi API, dan infrastruktur database yang digunakan dalam **Envoyou AI Editorial System**.

---

## 1. Ikhtisar Sistem (System Overview)

Aplikasi ini menggunakan framework **Next.js (App Router)** yang menggabungkan rendering sisi klien (*client-side rendering*) untuk antarmuka editor interaktif dan rendering sisi server (*server-side API routes*) untuk mengamankan kunci API, memproses orkestrasi AI multi-tahap, serta berinteraksi dengan database.

```text
┌────────────────────────────────────────────────────────┐
│                      Web Browser                       │
│  [Login] -> [UI Editor & Form] -> [Feedback / Export] │
└───────────┬────────────────────────────────────────────┘
            │ (signed session cookie + POST /api/analyze)
            ▼
┌────────────────────────────────────────────────────────┐
│                   Next.js API Route                    │
│   - Auth Gate via proxy + signed cookie                │
│   - Validasi Input (Zod)                               │
│   - Orkestrasi Prompt & Metadata                       │
│   - Review -> Rewrite -> Quality Gate -> SEO Pack      │
└───────────┬───────────────────────────┬────────────────┘
            │                           │
            ▼ (Validate & Normalize)    ▼ (Prisma Client)
┌───────────────────────┐   ┌────────────────────────────┐
│      Gemini API       │   │     PostgreSQL Database    │
│ (Primary AI Engine)   │   │     (Neon Serverless)      │
└───────────────────────┘   └────────────────────────────┘
```

---

## 2. Autentikasi Aplikasi & Proteksi API

Mulai v0.16.0, aplikasi tidak lagi hanya memproteksi dashboard analytics. Rute editor utama (`/`), dashboard (`/dashboard`), dan API internal diproteksi oleh `src/proxy.ts`.

*   **Halaman Login**: `/login` digunakan untuk akses editor utama, sementara `/dashboard/login` tetap tersedia sebagai pintu khusus dashboard analytics.
*   **Session Cookie**: Login menghasilkan cookie HTTP-only `eai_auth` berisi payload sesi dan tanda tangan HMAC. Token dibuat dan diverifikasi melalui `src/lib/dashboard-auth.ts`.
*   **Konfigurasi Secret**: `DASHBOARD_PASSWORD` tetap menjadi password masuk. `DASHBOARD_AUTH_SECRET` dapat ditambahkan sebagai secret terpisah untuk tanda tangan sesi; jika tidak ada, sistem memakai `DASHBOARD_PASSWORD` sebagai fallback.
*   **API Guard**: Request tanpa sesi valid ke `/api/analyze`, `/api/history`, `/api/export`, dan `/api/analytics` mengembalikan `401 Unauthorized`.
*   **Settings Menu**: Profil user lokal, mode tampilan, auto-save, bahasa output AI, strictness editorial, default metadata, dan logout dipusatkan di menu `Setting`. `UI Language` masih placeholder lokal; `Output Language` dikirim ke prompt untuk mengarahkan refined draft dan SEO metadata.

---

## 3. Integrasi AI & Prompt Orchestration

`src/app/api/analyze/route.ts` menangani autentikasi, validasi request, orkestrasi SSE, dan persistence. Detail provider serta stage AI dipisahkan ke `src/lib/ai/`:

*   `provider-runtime.ts`: client Gemini, model routing, sampling config, dan token budget.
*   `prompt-context.ts`: input-boundary policy dan structured user content.
*   `review-stage.ts`: review streaming, retry `standard`/`compact`/`manual_fallback`, incremental JSON parsing, telemetry, dan schema validation lintas provider.
*   `quality-gate-stage.ts`: Final Quality Gate, retry/fallback, serta deterministic source-fidelity checks.
*   `seo-stage.ts`: structured SEO generation dan fallback metadata lintas provider.
*   `targeted-fix-stage.ts`: perbaikan teks tertarget dengan prompt tenant-aware dan pemisahan system/user content.

*   **Pilihan Model**:
    1. `gemini-3.1-flash-lite` untuk jalur cepat, review editorial ringan, dan SEO metadata.
    2. `gemini-3.5-flash` untuk review kompleks, fact-checking, rewrite/polish, refinement, dan final quality gate.
    3. Gemini adalah provider tunggal; provider lain seperti Groq telah dinonaktifkan.
*   **Thinking Configuration**: Model Gemini 3.x menggunakan `thinkingLevel`. Review, rewrite, refinement, SEO, targeted fix, dan Final Quality Gate memakai `MINIMAL` agar token reasoning tidak memotong output terstruktur.
*   **Orkestrasi Prompt**: Prompt dibangun secara dinamis di `src/lib/prompts.ts` dengan fokus utama pada satu flow `polish`.
*   **Four-Stage Pipeline**:
    1.  **Review Stage**: menghasilkan skor, verdict, ringkasan, flags, dan catatan editorial singkat.
    2.  **Rewrite Stage**: menulis ulang draft final per chunk untuk mengurangi risiko truncation.
    3.  **Final Quality Gate**: mengevaluasi refined draft dengan status `ready`, `needs_review`, atau `blocked`, lalu menggabungkan evaluasi model dengan pemeriksaan deterministik di `src/lib/final-quality.ts`.
    4.  **SEO Stage**: membuat title, slug, meta description, dan tags dari hasil polish.
*   **Fallback Strategy**: Sistem mengenal mode `standard`, `compact`, dan `manual_fallback` agar draft berat tetap bisa selesai meski structured output tidak stabil.

### Streaming Status dan Telemetry

API analyze mengirim event status NDJSON `evaluating`, `rewriting`, `quality_gate`, dan `generating_seo`. Frontend memetakan event tersebut ke progress editorial yang ditampilkan selama proses berlangsung. Draft mulai dirender segera setelah event `draft_chunk` pertama, sementara quality gate dan SEO tetap berjalan di belakang progress rail.

Setiap panggilan model dicatat oleh `src/lib/ai-telemetry.ts` sebagai satu stage telemetry:

*   Provider, model, nama tahap, attempt, status, dan durasi.
*   Token input, output, cached, reasoning, dan total berdasarkan usage metadata provider.
*   Estimasi biaya USD/IDR dari tabel harga berversi dan kurs `AI_COST_USD_TO_IDR`.
*   Jumlah retry, fallback, failed call, serta total durasi per output.

Snapshot telemetry disimpan di `metadata._system.telemetry` pada `AnalysisLog`. Pendekatan JSON metadata dipilih agar deployment tidak memerlukan migrasi schema dan log lama tetap kompatibel. Token merupakan data aktual dari provider, sedangkan biaya diberi label estimasi karena harga serta kurs dapat berubah. Override harga dapat diberikan melalui `AI_MODEL_PRICING_JSON`.

### Publication Draft vs. Quality-Gate Draft

Pipeline mempertahankan dua representasi setelah rewrite:

1.  **Quality-Gate Draft** dapat membawa marker verifikasi internal agar quality gate tetap mengetahui klaim mana yang membutuhkan keputusan editor.
2.  **Publication Draft** telah melalui normalisasi tabel, cleanup artefak rewrite, dan penghapusan marker internal sebelum ditampilkan, disimpan, atau diekspor ke CMS.

Pemisahan ini mencegah instruksi seperti `[Source verification recommended]` bocor ke artikel publik tanpa menghilangkan warning pada refinement report.

### Deterministic Final Validation

`src/lib/final-quality.ts` melengkapi evaluasi model dengan pemeriksaan yang dapat diuji secara konsisten:

*   Konversi dan deteksi tabel ASCII serta validasi tabel Markdown GFM.
*   Source fidelity untuk angka, rentang, URL, entitas, dan akronim.
*   Deteksi atribusi motif organisasi/tokoh yang tidak ada pada sumber.
*   Validasi fase kalender berbasis zona waktu `Asia/Jakarta`.
*   Normalisasi tautan internal tepercaya dan marker verifikasi.

Smart internal linking menyaring kandidat berdasarkan istilah substantif, kualitas slug, dan keluarga topik sebelum daftar artikel diberikan kepada model.

---

## 4. Validasi Data dengan Zod

Untuk menjaga konsistensi data sebelum ditampilkan ke pengguna dan disimpan ke database, sistem menggunakan library **Zod** (`src/lib/schema.ts`). Respons review, SEO metadata, dan hasil pengolahan API divalidasi atau dinormalisasi sebelum dipakai.

```typescript
export const FeedbackOutputSchema = z.object({
  score: z.number().min(0).max(100),
  verdict: z.enum(['approve', 'revise', 'reject']),
  summary: z.string().max(280),
  polishedDraft: z.string().optional(),
  feedback: z.array(
    z.object({
      category: z.string(),
      status: z.enum(['pass', 'warning', 'fail']),
      message: z.string(),
      suggestion: z.string().optional(),
    })
  ),
  flags: z.array(z.string()).optional().default([]),
});
```

Flow Polish juga memakai `FinalQualityGateSchema` untuk memvalidasi readiness, summary, daftar perubahan, remaining feedback, dan flags. Jika quality gate gagal, sistem mencoba ulang sekali sebelum mengembalikan fallback `needs_review`.

---

## 5. Infrastruktur Database & Pooling (Prisma + Neon)

Sistem menggunakan **Prisma ORM** dengan database PostgreSQL yang di-host secara serverless di **Neon**.

### Masalah Koneksi Serverless (Neon Connection Pooling)
Karena Next.js API Routes berjalan di atas arsitektur serverless (fungsi stateless yang sering hidup-mati), koneksi database tradisional dapat dengan cepat penuh. Proyek ini mengatasi hal ini dengan konfigurasi koneksi ganda di `.env`:
1.  **`DATABASE_URL`**: Menggunakan adapter pooling Neon (`pgbouncer=true` dan runtime driver `@neondatabase/serverless`). Ini digunakan oleh runtime Next.js untuk menangani ribuan request secara efisien tanpa menghabiskan slot koneksi database.
2.  **`DIRECT_URL`**: Menyediakan koneksi langsung bypass pooling. Ini digunakan secara khusus oleh Prisma CLI untuk melakukan migrasi skema database (`prisma db push` atau `prisma migrate`) tanpa kendala timeout dari pgbouncer.

### Skema Tabel Audit Log (`AnalysisLog`)
Setiap kali analisis draf dijalankan, sistem akan menyimpan log ke tabel `AnalysisLog` di `prisma/schema.prisma`. 
*   **Asynchronous Logging**: Penyimpanan log dilakukan secara terpisah menggunakan blok `try-catch` independen. Jika database mengalami masalah konektivitas, pengguna tetap akan menerima hasil analisis AI mereka tanpa kegagalan sistem total.
*   **Error Logging**: Jika stage review, rewrite, atau SEO gagal, sistem tetap menyimpan log draf dengan status `error` beserta kolom `errorMessage`.
*   **Stored Metadata**: Metadata log kini juga membawa informasi internal seperti `responseMode`, `polishedDraft`, final readiness, refinement changes, dan telemetry usage agar riwayat serta dashboard bisa menghidupkan kembali hasil lengkap. Karena struktur metadata semakin kompleks, tipe datanya di-*cast* sebagai `Prisma.InputJsonValue` untuk menjamin *type safety*.
*   **Export State Tracking**: Sistem mencatat keberhasilan integrasi CMS dengan melacak status ekspor (`exportStatus`) dan referensi sumber di sistem eksternal (`sourceRef`), serta ekstensi metadata `coverImageAltText`.

---

## 6. Optimalisasi Sisi Klien (Frontend Stack)

*   **Tailwind CSS v4**: Menyediakan performa build yang jauh lebih cepat, penggunaan variabel CSS modern native, serta utilitas grid yang fleksibel untuk membagi porsi tampilan Editor dan Feedback secara seimbang pada resolusi layar besar.
*   **Framer Motion**: Digunakan untuk transisi antarmuka ringan tanpa membebani editor utama.
*   **Notifikasi Sonner**: Penanganan visual notifikasi sukses atau error dengan performa tinggi tanpa memblokir interaksi pengguna di editor teks.
*   **Base UI & Shadcn**: Memberikan aksesibilitas standar industri dan visual premium yang konsisten.
*   **Activity Bar Settings**: Menu `Setting` ditempatkan di atas toggle dark/light agar kontrol session dan preferensi editor terkumpul di satu area yang mudah diperluas.
*   **Editorial Progress UI**: Komponen `EditorialProgress` menggunakan status stream backend untuk menampilkan checklist tahap, elapsed time, skeleton dokumen, dan progress rail. Animasi menghormati preferensi `prefers-reduced-motion`.

---

## 7. Sistem Analitik Multi-Tenant & Optimasi Performa

Aplikasi menggunakan endpoint `/api/analytics` untuk menyajikan data dashboard performa editorial bagi masing-masing penyewa (*tenant*).

*   **Penyaringan Berbasis Query (Query-level Date Filtering)**: Rentang waktu filter (`7d`, `30d`, `90d`, `this-month`, `last-month`, `all`, `custom`) dikirimkan dari frontend sebagai parameter pencarian. API backend menghitung batas tanggal dan memfilter `createdAt` langsung di tingkat database (menggunakan operator `gte` dan `lte` Prisma), bukan memfilter seluruh data secara in-memory.
*   **Query Gabungan Dua Periode**: Untuk metrik perbandingan performa (WoW / MoM), API memetakan rentang gabungan saat ini dan periode sebelumnya, lalu mengambilnya dalam satu kali pemanggilan database tunggal untuk efisiensi jaringan.
*   **Optimasi Kolom (Select Column Optimization)**: Mengingat draf artikel disimpan dalam kolom `content` bertipe `db.Text` yang berukuran besar, query analitik menggunakan blok `select` eksplisit Prisma untuk mengecualikan kolom `content` dari hasil pencarian. Ini mengurangi konsumsi memori server secara signifikan dan mempercepat response time.
*   **Penyelesaian Masalah ResponsiveContainer**: Komponen grafik Recharts `<ResponsiveContainer>` dikonfigurasi dengan tinggi piksel statis numerik (`300` / `250` piksel) dan waktu tunda render (`debounce={50}`) untuk mencegah kesalahan kalkulasi dimensi (`width(-1)` / `height(-1)`) selama transisi layout di browser.

---

## 8. Sistem Pencegahan Eksploitasi Trial (Sybil Prevention)

Untuk mencegah pengguna menyalahgunakan 10 kredit percobaan gratis (`trial`)
dengan mendaftar berulang kali menggunakan variasi email atau layanan email
sementara, sistem memisahkan sinkronisasi identitas user dari alokasi ledger
workspace:

*   **Sinkronisasi Clerk**: Webhook `/api/webhooks/clerk` membuat atau memperbarui user dan organisasi lokal. Webhook tidak lagi menulis kredit trial langsung ke ledger user.
*   **Workspace Creator**: `Organization.createdByUserId` menyimpan creator dari Clerk. Hanya creator yang dapat memicu alokasi trial untuk organisasi tersebut; anggota undangan tidak menambah kredit.
*   **Ledger Organisasi**: Trial disimpan pada `CreditTransaction.organizationId` karena saldo, checkout, dan konsumsi kredit workspace juga dihitung berdasarkan organisasi aktif.
*   **Idempotensi dan Concurrency**: Alokasi memakai idempotency key `trial:organization:<organizationId>` serta row lock pada user agar refresh, retry webhook, atau pembuatan organisasi yang berdekatan tidak menggandakan trial.
*   **Migrasi Ledger Lama**: Jika user lama memiliki sisa trial pada ledger `userId`, sisa tersebut dipindahkan ke organisasi yang dibuatnya sebelum alokasi baru dipertimbangkan.
*   **Normalisasi Email Pintar**: Sistem memisahkan local part dan domain untuk menyamakan variasi penulisan. Pada domain Gmail (`gmail.com` / `googlemail.com`), semua karakter titik (`.`) dihapus dan semua karakter setelah tanda plus (`+`) dibuang. Pada domain lain, subaddressing setelah tanda plus (`+`) tetap dipotong.
*   **Pemblokiran Disposable Email**: Sistem membandingkan domain pendaftar dengan daftar static populer email sekali pakai untuk membatalkan klaim trial secara instan.
*   **Pencarian Duplikat Database Teroptimasi**: Sistem melakukan query ke PostgreSQL dengan mencocokkan kemiripan email (prefix 3 karakter pertama local part dan domain yang sama) untuk membatasi jumlah data yang ditarik, kemudian melakukan pencocokan normalisasi penuh secara in-memory di Node.js.
*   **Bypass Alokasi Kredit**: Jika terdeteksi melanggar salah satu aturan, user tetap dapat memakai aplikasi tetapi `trialUsed` ditandai tanpa membuat transaksi trial positif.

## 9. Onboarding Berbasis Clerk Organization

Onboarding menggunakan Clerk Organization sebagai boundary tenant sebelum
Publication Identity dibuat:

1. User membuat atau memilih organisasi melalui komponen Clerk di `/onboarding`.
2. EAI menyinkronkan `clerkOrganizationId`, creator, nama, dan slug ke tabel
   `Organization`.
3. Nama dan slug organisasi tetap dimiliki Clerk. Onboarding hanya mengatur
   `publicationName`, domain, editorial profile, dan CMS.
4. `OnboardingDraft.organizationId` memastikan draft dan secret CMS hanya dapat
   dibaca serta diaktifkan oleh organisasi yang sama.
5. **Use defaults** membuat profil editorial default pada organisasi aktif dan
   tidak membuat workspace lokal personal.

Migrasi staging yang masih harus diterapkan ke production dicatat di
[`PRODUCTION_DATABASE_MIGRATIONS.md`](./PRODUCTION_DATABASE_MIGRATIONS.md).
