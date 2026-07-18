# Catatan Arsitektur (Architecture Notes)

Dokumen ini mendokumentasikan keputusan teknis, arsitektur data, alur integrasi API, dan infrastruktur database yang digunakan dalam **Envoyou AI Editorial System**.

---

## 1. Ikhtisar Sistem (System Overview)

Aplikasi ini menggunakan arsitektur **Monorepo (Turborepo)** yang memisahkan sisi klien (*frontend*) dan sisi server (*backend*). **Frontend (Next.js App Router)** menangani antarmuka interaktif dan meneruskan (*proxy*) permintaan API ke **Backend (Express.js pada VPS)** yang bertugas mengamankan kunci API, memproses orkestrasi AI multi-tahap, serta berinteraksi dengan database.

```text
┌────────────────────────────────────────────────────────┐
│              Frontend (Next.js / Vercel)               │
│  [Login] -> [UI Editor & Form] -> [Feedback / Export] │
│      └─> src/proxy.ts (Auth Gate & API Rewrite)        │
└───────────┬────────────────────────────────────────────┘
            │ (Authorization: Bearer <Clerk_JWT>)
            ▼
┌────────────────────────────────────────────────────────┐
│             Backend (Express.js / VPS PM2)             │
│   - Middleware Auth (@clerk/backend)                   │
│   - Orkestrasi Prompt & AI Provider Resolver           │
│   - Streaming SSE (Review, Rewrite, Q-Gate, SEO)       │
└───────────┬───────────────────────────┬────────────────┘
            │                           │
            ▼ (Validate & Normalize)    ▼ (Prisma Client)
┌───────────────────────┐   ┌────────────────────────────┐
│ Gemini/OpenRouter API │   │     PostgreSQL Database    │
│ (Unified AI Engine)   │   │     (Neon Serverless)      │
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

Rute `/api/analyze` di *backend* didekomposisi ke dalam subfolder modular `src/routes/analyze/` (terdiri atas `controller.ts` orkestrator, sub-handler di `handlers/`, dan modul utilitas di `utils/`). Detail *provider* serta tahap (stage) AI dipisahkan ke `apps/backend/src/lib/ai/`:

*   `provider-runtime.ts` / `ai-provider-resolver.ts`: Menangani resolusi model secara dinamis (Gemini, Groq, atau OpenRouter) berdasarkan variabel lingkungan `ACTIVE_AI_PROVIDER`.
*   `prompt-context.ts`: Kebijakan *input-boundary* dan konten terstruktur dari pengguna.
*   `review-stage.ts`: *Review streaming*, mekanisme *retry* parsial, *incremental JSON parsing*, dan validasi skema lintas *provider*.
*   `quality-gate-stage.ts`: *Final Quality Gate*, pemeriksaan deterministik pada *source-fidelity*.
*   `seo-stage.ts`: Menghasilkan SEO terstruktur.
*   `targeted-fix-stage.ts`: Perbaikan teks tertarget dengan *prompt tenant-aware*.

*   **Pilihan Model (Unified API)**:
    1. Gemini (Primer): via SDK `@google/genai` (model produksi: `gemini-3.5-flash`). Konfigurasi native menggunakan helper `getNativeGeminiConfig(thinkingLevel)` dari `provider-runtime.ts` — **tidak menggunakan** `temperature` karena diabaikan oleh SDK saat `thinkingConfig` aktif.
    2. OpenRouter (Universal): Untuk integrasi multi-model (Anthropic, OpenAI, Llama) yang dikonfigurasi lewat `OPENROUTER_MODEL`. Konfigurasi sampling menggunakan `getOpenRouterSamplingConfig()`.
*   **Thinking Configuration**: Review, Final Quality Gate, dan Quick Draft menggunakan thinking level rendah untuk menekan konsumsi token pada output terstruktur. Targeted Fix menggunakan level `MEDIUM` karena harus mempertahankan konteks kalimat sambil menghasilkan replacement yang presisi. Stage rewrite plain-text tidak mengaktifkan thinking config native.
*   **Orkestrasi Prompt**: Prompt dibangun secara dinamis dengan bantuan *utility* dari `@eai/shared/server`.
*   **H1 Format Contract**: Rute `routes/analyze/` (pada handler rewrite) menerapkan `stripLeadingH1` (dari `src/lib/text-utils.ts`) pada draft input **sebelum** rewrite stage. Ini menghapus heading H1 tingkat atas yang akan menduplikasi judul artikel yang dirender frontend secara terpisah di luar body Tiptap.
*   **Four-Stage Pipeline**:
    1.  **Review Stage**: menghasilkan skor, verdict, ringkasan, flags, dan catatan editorial singkat (`ThinkingLevel.LOW`).
    2.  **Rewrite Stage**: menulis ulang draft final per chunk untuk mengurangi risiko truncation.
    3.  **Final Quality Gate**: mengevaluasi refined draft dengan status `ready`, `needs_review`, atau `blocked`, lalu menggabungkan evaluasi model dengan pemeriksaan deterministik di `src/lib/final-quality.ts` (`ThinkingLevel.LOW`).
    4.  **SEO Stage**: membuat title, slug, meta description, dan tags dari hasil polish.
*   **Fallback Strategy**: Sistem mengenal mode `standard`, `compact`, dan `manual_fallback` agar draft berat tetap bisa selesai meski structured output tidak stabil.

### Request, Provider, dan Network Boundaries

*   **Runtime Request Validation**: `/api/analyze` serta endpoint utama Strategist memvalidasi body menggunakan Zod sebelum membuka SSE/NDJSON stream, menaikkan demo counter, menulis database, atau memanggil provider AI. Boundary ini mencakup mode Analyze/Refine/Targeted Fix, riwayat chat, plan recommendation, research notes, Quick Draft, dan metadata lampiran.
*   **Server-Controlled Provider Selection**: Client tidak dapat memilih provider melalui body request. Analyze memakai hasil `resolveActiveAiConfig()` dari workspace/user aktif, sedangkan Quick Draft memakai `ACTIVE_AI_PROVIDER` server. Ini mencegah bypass terhadap kebijakan model dan biaya tenant.
*   **Tenant Authorization**: Write ke sesi Strategist yang sudah ada selalu memverifikasi pasangan `sessionId` dan `userId`. Prompt Inspector menggunakan autentikasi serta owner guard karena rendered prompt dapat membawa konfigurasi editorial tenant.
*   **Outbound URL Safety & DNS Pinning**: Pengambilan URL melalui Strategist dan `/api/scrape` memakai `safe-url-fetch.ts`. Utility hanya menerima HTTP(S), menolak URL berkredensial dan alamat privat/lokal IPv4/IPv6, serta memvalidasi ulang target setiap redirect. Socket menggunakan custom lookup yang mengembalikan IP publik hasil validasi yang sama sehingga hostname tidak di-resolve ulang saat koneksi dibuka. Policy tambahan membatasi port, host opsional, timeout, dan ukuran respons melalui environment variable `OUTBOUND_HTTP_*`.
*   **Distributed Rate Limiting**: Counter Strategist dan autosave History disimpan di Redis melalui operasi Lua atomic `INCR` + `PEXPIRE`, dengan namespace dan identity hash terpisah. Seluruh instance membaca window yang sama. Request path memakai koneksi Redis fail-fast; production bersifat fail-closed jika proteksi Redis tidak tersedia, sedangkan fail-open hanya dapat diaktifkan eksplisit pada non-production melalui `RATE_LIMIT_FAIL_OPEN=true`. Express hanya mempercayai jumlah hop reverse proxy dari `TRUST_PROXY_HOPS` agar client tidak dapat memalsukan `X-Forwarded-For` untuk mengganti identitas limiter.
*   **Disconnect-Aware Pipeline**: Lifecycle stream dipantau melalui response connection. Jika client terputus, handler tidak melanjutkan ke Quality Gate, SEO, success logging, atau debit kredit menggunakan output parsial. Cancellation frontend juga memulihkan snapshot analisis atau membersihkan placeholder chat yang belum selesai.

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

## 4. Validasi Data dengan Zod (Shared Package)

Untuk menjaga konsistensi data antara Frontend dan Backend, seluruh skema validasi **Zod** dipusatkan di paket berbagi (*shared package*) pada `packages/shared/src/schema.ts`. Respons review, SEO metadata, dan hasil pengolahan API divalidasi atau dinormalisasi menggunakan paket `@eai/shared` ini.

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

### Masalah Koneksi Database (Neon Connection Pooling)
Meskipun arsitektur aplikasi kini menggunakan server Express yang berjalan terus-menerus (PM2 pada VPS), pengelolaan koneksi database (Connection Pooling) tetap vital untuk skalabilitas. Sistem menangani ini dengan konfigurasi koneksi ganda di `.env`:
1.  **`DATABASE_URL`**: Menggunakan adapter pooling Neon (`pgbouncer=true` dan runtime driver `@neondatabase/serverless`). Ini digunakan oleh runtime server Node.js untuk menangani ribuan request secara efisien.
2.  **`DIRECT_URL`**: Menyediakan koneksi langsung bypass pooling. Ini digunakan secara khusus oleh Prisma CLI untuk melakukan migrasi skema database (`prisma migrate deploy`) tanpa kendala timeout dari pgbouncer.

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

## 10. Arsitektur Editor (Tiptap & Markdown)

Sistem menggunakan **Tiptap** sebagai editor teks kaya (*Rich Text Editor*) untuk memberikan pengalaman pengguna (UX) yang lebih baik dan interaktif dibandingkan raw textarea. Meskipun demikian, arsitektur ini secara tegas mempertahankan **Markdown sebagai format sumber kebenaran (Source of Truth)**, baik untuk penyimpanan, pengiriman data, maupun pemrosesan AI.

*   **Pemisahan Tanggung Jawab (Separation of Concerns)**:
    *   **Sisi Klien (UI)**: Merender dokumen secara visual (*Rich Text*), mengelola kursor, seleksi, serta menyediakan antarmuka aksi seperti *Slash Commands* (`/`) dan menu *AI Inline Actions*.
    *   **Transport & Storage**: Secara otomatis menerjemahkan state Tiptap menjadi Markdown menggunakan ekstensi `tiptap-markdown`. Dengan ini, *backend* tidak perlu berurusan dengan pemrosesan atau sanitasi HTML.
    *   **AI Pipeline**: Agen dan LLM tetap mengonsumsi dan menghasilkan teks Markdown murni, meminimalisasi kompleksitas tokenisasi dan menjaga struktur *prompt*.
*   **AI Inline Action & Preview Flow**: Operasi AI yang bersifat lokal pada blok teks (misalnya, memperpanjang, meringkas, atau menulis ulang) dieksekusi melalui endpoint khusus `/api/editor/ai-action`. Sistem mengimplementasikan alur **Preview (Accept/Reject)**: alih-alih mengubah isi dokumen secara instan yang berpotensi menghilangkan konteks, editor memunculkan pratinjau hasil AI. Pengguna harus menekan "Accept" agar perubahan tersebut secara resmi menggantikan teks asli, memastikan bahwa pengguna (editor manusia) tetap memegang kendali penuh.

---

## 11. Sistem Keamanan & Validasi Penyunting Tautan (Link Integrity & Endpoint Split)

*   **Pencegahan Penghapusan Tautan (Link Deletion Safeguards)**:
    *   **Frontend Interceptor**: Untuk menghindari editor manusia tidak sengaja menghapus tautan sitasi hasil riset orisinal, frontend mengintersep tombol "Refine/Refine Again". Sistem mendeteksi domain/url yang hilang, menampilkan modal konfirmasi `Tautan Referensi Terhapus`, dan memberikan opsi untuk memulihkannya kembali secara otomatis ke bagian bawah dokumen sebelum memulai proses poles.
    *   **Backend Fact-Checker Context**: Catatan riset asli dan tautan sumber dari obrolan Content Strategist disuntikkan ke dalam metadata draf dan dikirimkan sebagai `<session_notes>` XML dalam `<workspace_context>` ke Quality Gate (Fact-Checker AI). Hal ini membekali AI dengan riwayat riset orisinal untuk mendeteksi disonansi klaim meskipun seluruh tautan markdown di dalam draf telah dihapus secara sengaja maupun tidak sengaja oleh manusia.
*   **Pemisahan Endpoint PATCH (PATCH Route Refactoring)**:
    *   Untuk mematuhi prinsip tanggung jawab tunggal (*Single Responsibility Principle*) dan mencegah kesalahan validasi Zod (`HISTORY_PATCH`), rute general `PATCH /api/history/:id` dipecah menjadi tiga endpoint spesifik:
        1.  `PATCH /api/history/:id/autosave`: Rute khusus autosave draft yang divalidasi dengan `AutosaveSchema` ringan dan dibatasi dengan middleware in-memory token-bucket `autosaveRateLimiter` (maksimal 100 request/menit per user) guna melindungi database dari beban berlebih.
        2.  `PATCH /api/history/:id/resolve`: Rute khusus untuk menyimpan resolusi feedback dari saran AI yang divalidasi menggunakan `EditorialResolutionSchema`.
        3.  `PATCH /api/history/:id`: Disederhanakan khusus untuk pembaruan judul dokumen (*rename*).
*   **Ekstraktor JSON Tangguh (Brace-Counting JSON Parser)**:
    *   Rantai pemrosesan backend menggunakan fungsi `extractJsonFromText` yang mengimplementasikan **Stateful Brace-Counting Parser** untuk menyaring objek JSON secara presisi dari output model LLM. Parser ini mengabaikan karakter kurung kurawal di dalam string kutipan ganda (serta menangani *escaped characters* `\"`) dan memotong teks penjelasan tambahan dari model AI yang ditulis setelah JSON ditutup (seperti kalimat penutup yang memuat tanda kurung). Hal ini meminimalkan kegagalan parse JSON dan menghemat token pemrosesan ulang (*retry*).

---

## 12. Sistem Subscription Tahunan & Penangguhan Turun Paket (Delayed Downgrade)

Untuk mendukung langganan jangka panjang (tahunan) dan transisi paket yang adil secara bisnis maupun akuntansi, sistem menerapkan alur penanganan khusus:

*   **Alokasi Kredit Tahunan Terjadwal (Monthly Credit Scheduler)**:
    *   Pengguna paket tahunan (`starter_yearly`, `pro_yearly`, `team_yearly`) tidak menerima seluruh jatah kredit sekaligus di awal (misalnya 600 kredit), melainkan di-refill **50 kredit per bulan** secara otomatis.
    *   Sistem menggunakan job scheduler harian **BullMQ** (`monthly-credit-allocation`) yang berjalan pada pukul 01:00 AM. Job ini secara atomik menghapus sisa kredit subscription bulan lalu menggunakan tipe transaksi `cycle_reset`, lalu mengalokasikan kredit jatah bulanan baru dengan tipe `yearly_monthly_allocation`.
    *   Setiap alokasi dijaga oleh kunci idempotensi (`monthly-refill:${sub.id}:${year}-${month}`) untuk mencegah alokasi ganda jika job mengalami kegagalan atau dipicu ulang pada hari yang sama.
*   **Penangguhan Turun Paket (Delayed Downgrade - Stripe-Way)**:
    *   Saat pengguna melakukan *downgrade* dari paket tahunan ke bulanan, paket tahunan yang sudah dibayar penuh harus tetap berjalan hingga akhir periodenya.
    *   Backend tidak memicu transaksi pembayaran baru ke Midtrans. Sebaliknya, backend mengubah status langganan tahunan aktif menjadi `cancels_at_period_end` dan membuat baris langganan baru dengan status `queued` dengan `currentPeriodStart` disetel tepat pada tanggal berakhirnya paket tahunan.
    *   Job harian **BullMQ** (`activate-queued-downgrade`) pada pukul 02:00 AM memantau antrean ini. Saat tanggal mulai tercapai, job akan mengarsipkan paket tahunan lama menjadi `expired`, mengaktifkan paket bulanan baru (`status: active`), dan mengalokasikan kredit bulan pertama.
*   **Pembatalan Penangguhan (Revert Delayed Downgrade)**:
    *   Pengguna dapat membatalkan rencana turun paket kapan saja sebelum masa aktif tahunan berakhir dengan menekan *"Keep My Current Plan"*. Aksi ini memanggil `DELETE /api/payments/queued-downgrade` yang secara aman menghapus baris `queued` dan mengembalikan status langganan tahunan aktif dari `cancels_at_period_end` kembali ke `active`.
*   **Pencegahan Overlap Antrean (Purchase Gating)**:
    *   Jika pengguna memiliki antrean downgrade (`queued` subscription), sistem memblokir opsi pembelian atau perpanjangan paket tahunan baru di halaman pricing/checkout untuk mencegah kompleksitas tumpang tindih antrean di database.

---

## 13. Halaman Credit Usage & Transparansi Perhitungan Kuota

Untuk mengatasi kebingungan pengguna mengenai urutan konsumsi kredit dan riwayat alokasi bulanan, sistem memisahkan visualisasi kuota dari halaman Billing Plan utama ke halaman **Credit Usage Terdedikasi** (`/settings/usage`):

*   **Pemisahan Alokasi Saldo (Credit Buckets)**:
    *   Sistem melacak sisa saldo kredit dalam tiga kategori terpisah: **Plan Credits** (jatah bulanan aktif paket), **Free/Trial Credits** (kredit gratis sekali pakai dari awal/uji coba), dan **Add-on Credits** (paket top-up tambahan).
    *   Kuota gratis selalu dikonsumsi terlebih dahulu (`trialCreditsRemaining`), diikuti oleh kuota plan bulanan (`subscriptionCreditsRemaining`), dan terakhir kuota Add-on (`addonCreditsRemaining`).
    *   Pemilihan bucket dan transaksi debit dijalankan pada isolation level **Serializable** dengan retry terbatas untuk write conflict. Jika tidak ada bucket yang cukup, operasi melempar `InsufficientCreditsError`; sistem tidak lagi memilih bucket fallback yang dapat membuat saldo negatif.
*   **Formula Akurat Kuota Bulanan**:
    *   Untuk mencegah kalkulasi salah seperti pemakaian `0 / X` credits pada plan tahunan ketika user memiliki sisa saldo prepaid melimpah, formula backend menghitung pemakaian aktual paket bulanan dengan melacak total konsumsi aktual sejak `currentPeriodStart` bulan berjalan, lalu menguranginya dari kuota paket asli (`creditsPerMonth`).
*   **Audit Trail & Kolom "Triggered By"**:
    *   Tabel audit trail menampilkan atribusi yang jelas:
        *   Di workspace organisasi: Menampilkan nama dan avatar anggota tim yang memicu generator.
        *   Di personal workspace: Menggunakan label statis **"You"** (dengan avatar personal).
        *   Transaksi mesin otomatis (refill, cycle reset, trial allocation): Menggunakan flag `isSystem: true` dan dilabeli **"System"** dengan ikon sistem statis.

---

Migrasi staging yang masih harus diterapkan ke production dicatat di
[`PRODUCTION_DATABASE_MIGRATIONS.md`](./PRODUCTION_DATABASE_MIGRATIONS.md).
