# Catatan Arsitektur (Architecture Notes)

Dokumen ini mendokumentasikan keputusan teknis, arsitektur data, alur integrasi API, dan infrastruktur database yang digunakan dalam **Envoyou AI Editorial System**.

---

## 1. Ikhtisar Sistem (System Overview)

Aplikasi ini menggunakan arsitektur **Monorepo (Turborepo)** yang memisahkan sisi klien (*frontend*) dan sisi server (*backend*). **Frontend (Next.js App Router)** menangani antarmuka interaktif dan meneruskan (*proxy*) permintaan API ke **Backend (Express.js pada Railway.app)** yang bertugas mengamankan kunci API, memproses orkestrasi AI multi-tahap, serta berinteraksi dengan database.

```text
┌────────────────────────────────────────────────────────┐
│              Frontend (Next.js / Vercel)               │
│  [Login via Clerk] -> [UI Editor & Form] -> [Export]  │
│      └─> src/proxy.ts (clerkMiddleware + API Rewrite)  │
└───────────┬────────────────────────────────────────────┘
            │ Authorization: Bearer <Clerk JWT>
            │ x-clerk-org-id / x-clerk-org-slug / x-clerk-org-role
            ▼
┌────────────────────────────────────────────────────────┐
│         Backend (Express.js / Railway.app)             │
│   - requireAuth middleware (verifyToken @clerk/backend) │
│   - Orkestrasi Prompt & AI Provider Resolver           │
│   - Streaming SSE (Review, Rewrite, Q-Gate, SEO)       │
│   - BullMQ Worker (Railway Background Service)         │
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

Sejak migrasi ke Clerk, seluruh autentikasi berbasis cookie (`eai_auth`) dan password (`DASHBOARD_PASSWORD`) telah dihapus. Rute editor utama (`/`), dashboard (`/dashboard`), dan API internal kini diproteksi oleh Clerk secara penuh.

*   **Frontend Middleware (`src/proxy.ts`)**: Menggunakan `clerkMiddleware` dari `@clerk/nextjs/server`. Untuk setiap request ke rute backend API, proxy mengambil Clerk session token (`auth.getToken()`) dan meneruskan header berikut ke Express:
    *   `Authorization: Bearer <Clerk JWT>` — token sesi Clerk yang diverifikasi.
    *   `x-clerk-org-id` — ID organisasi aktif dari sesi.
    *   `x-clerk-org-slug` — slug organisasi aktif.
    *   `x-clerk-org-role` — peran pengguna di organisasi aktif.
*   **Backend Middleware (`requireAuth`)**: Didefinisikan di `apps/backend/src/middleware/auth.ts`. Setiap endpoint yang memerlukan autentikasi menggunakan middleware ini, yang:
    1. Membaca header `Authorization: Bearer <token>`.
    2. Memverifikasi token menggunakan `verifyToken()` dari `@clerk/backend` dan `CLERK_SECRET_KEY`.
    3. Menetapkan objek `req.auth` berisi `userId`, `orgId`, `orgSlug`, dan `orgRole` untuk digunakan handler selanjutnya.
    4. Mengembalikan `401 Unauthorized` jika token tidak ada atau tidak valid.
*   **Rute Publik**: Webhook Clerk (`/api/webhooks/clerk`) dan rute health check tidak melewati `requireAuth`.
*   **API Guard**: Request tanpa token valid ke endpoint utama seperti `/api/analyze`, `/api/history`, `/api/workspace`, dan `/api/analytics` mengembalikan `401 Unauthorized`.

---

## 3. Integrasi AI & Prompt Orchestration

Rute `/api/analyze` di *backend* didekomposisi ke dalam subfolder modular `src/routes/analyze/` (terdiri atas `controller.ts` orkestrator, sub-handler di `handlers/`, dan modul utilitas di `utils/`). Detail *provider* serta tahap (stage) AI dipisahkan ke `apps/backend/src/lib/ai/`:

*   `provider-runtime.ts` / `ai-provider-resolver.ts`: Menangani resolusi provider/model secara dinamis (Gemini, Groq, atau OpenRouter). `ACTIVE_AI_PROVIDER` menjadi fallback lingkungan, sedangkan workspace dapat menyimpan konfigurasi default dan override per fungsi melalui Admin Console tanpa redeploy.
*   `prompt-context.ts`: Kebijakan *input-boundary* dan konten terstruktur dari pengguna.
*   `review-stage.ts`: *Review streaming*, mekanisme *retry* parsial, *incremental JSON parsing*, dan validasi skema lintas *provider*.
*   `quality-gate-stage.ts`: *Final Quality Gate*, pemeriksaan deterministik pada *source-fidelity*.
*   `seo-stage.ts`: Menghasilkan SEO terstruktur.
*   `targeted-fix-stage.ts`: Perbaikan teks tertarget dengan *prompt tenant-aware*.

*   **Pilihan Model (Unified API)**:
    1. Gemini (Primer): via SDK `@google/genai` (model produksi: `gemini-3.6-flash`; SEO & lightweight roles: `gemini-3.5-flash-lite`). Konfigurasi native menggunakan helper `getNativeGeminiConfig(thinkingLevel)` dari `provider-runtime.ts` — **tidak menggunakan** `temperature` karena diabaikan oleh SDK saat `thinkingConfig` aktif.
    2. OpenRouter (Universal): Untuk integrasi multi-model (Anthropic, OpenAI, Llama) yang dikonfigurasi lewat `OPENROUTER_MODEL`. Konfigurasi sampling menggunakan `getOpenRouterSamplingConfig()`.
*   **Thinking Configuration**: Review, Final Quality Gate, dan Quick Draft menggunakan thinking level rendah untuk menekan konsumsi token pada output terstruktur. Targeted Fix menggunakan level `MEDIUM` karena harus mempertahankan konteks kalimat sambil menghasilkan replacement yang presisi. Stage rewrite plain-text tidak mengaktifkan thinking config native.
*   **Strategist Thinking Stream**: Chat Strategist produksi meminta `generation_config.thinking_summaries = "auto"` pada Gemini Interactions. Chat dengan Google Search memakai `thinking_level = "medium"`, sedangkan chat tanpa Search memakai `"low"`. Delta `thought_summary` dipetakan ke event SSE bersama `{ type: "thinking", kind, chunk }`; UI mempertahankan indikator statis jika provider tidak menghasilkan summary untuk prompt sederhana.
*   **Strategist Search Recovery**: Jika stream Interactions berhenti sebelum menghasilkan teks (misalnya hanya mengirim thought summary dengan status terakhir masih `in_progress`), fallback Search berpindah ke native `models.generateContent` dengan `googleSearch` grounding. Kegagalan grounding kedua tidak mengulang tool-call yang sama: sistem menghasilkan jawaban aman tanpa Search, menyatakan keterbatasan verifikasi informasi terkini, dan tidak memotong kredit Search.
*   **Orkestrasi Prompt**: Prompt dibangun secara dinamis dengan bantuan *utility* dari `@eai/shared/server`.
*   **H1 & Publication Package Contract**: Draft mentah dari Strategist boleh membawa H1 sebagai working title. Rute `routes/analyze/` mengekstraknya melalui `stripLeadingH1`, mempertahankan nilainya sebagai `workingTitle`, dan memastikan publication body selalu tanpa H1. Pada Publish Ready, `PublicationPackage.title` menjadi field title CMS/H1 halaman; `metaTitle` tetap field SERP terpisah.
*   **Blog Admin Metadata Contract**: Default Envoyou memakai meta title 30–70 karakter, meta description 50–160 karakter yang berakhir lengkap, excerpt minimal 50 karakter, rekomendasi body minimal 300 kata, dan slug ideal maksimal enam kata. Normalisasi metadata boleh memendekkan pada batas kata/kalimat tetapi tidak boleh menghasilkan elipsis yang kemudian ditolak Quality Gate. Temuan dengan `targetField=publication.*` tidak boleh memakai fallback body Targeted Fix. Untuk slug panjang, validator menyiapkan patch lokal deterministik sebelum feedback tampil; persetujuan hanya mengubah `publication.slug`, menyimpan paket, lalu memvalidasi hasil di background. Bahasa dominan body final menjadi acuan field SEO yang dibaca manusia dan teks Quality Gate; hasil SEO yang berbeda bahasa diperbaiki melalui satu retry internal sebelum event `seo_metadata` atau feedback dikirim.
*   **Four-Stage Pipeline**:
    1.  **Review Stage**: menghasilkan skor, verdict, ringkasan, flags, dan catatan editorial singkat (`ThinkingLevel.LOW`).
    2.  **Rewrite Stage**: menulis ulang draft final per chunk untuk mengurangi risiko truncation.
    3.  **Publication Package Stage (Publish Ready)**: membuat title, slug, excerpt, meta title, meta description, cover alt, dan tags dari hasil polish. Fast melewati stage ini dan mempertahankan working title saja.
    4.  **Final Quality Gate**: mengevaluasi refined body beserta Publication Package pada Publish Ready, atau body saja pada Fast, lalu menggabungkan evaluasi model dengan pemeriksaan deterministik di `src/lib/final-quality.ts` (`ThinkingLevel.LOW`).
*   **Fallback Strategy**: Sistem mengenal mode `standard`, `compact`, dan `manual_fallback` agar draft berat tetap bisa selesai meski structured output tidak stabil.

### Request, Provider, dan Network Boundaries

*   **Runtime Request Validation**: `/api/analyze` serta endpoint utama Strategist memvalidasi body menggunakan Zod sebelum membuka SSE/NDJSON stream, menaikkan demo counter, menulis database, atau memanggil provider AI. Boundary ini mencakup mode Analyze/Refine/Targeted Fix, riwayat chat, plan recommendation, research notes, Quick Draft, dan metadata lampiran.
*   **Blueprint Request Idempotency & Reconciliation**: Frontend membuat UUID untuk setiap operasi `/api/strategist/generate-plan`. Backend mengklaim UUID tersebut melalui `StrategistPlanRequest`, mengembalikan HTTP `202` saat operasi identik masih `pending`, dan me-replay respons tersimpan saat status sudah `completed`. Pesan user, pesan blueprint asisten, dan respons request diselesaikan dalam satu transaksi Prisma. Jika respons sukses hilang setelah commit, frontend memeriksa endpoint status terautentikasi dan memulihkan hasil yang sama tanpa menjalankan AI atau menulis chat kedua.
*   **Fast Chat Atomic Lifecycle**: Setiap Fast Chat membawa UUID request dan diklaim melalui `StrategistChatRequest`. Backend tidak lagi menulis pesan user sebelum provider menghasilkan output. Pada sukses, timestamp sesi, pesan user, pesan assistant, dan respons request di-commit dalam satu transaksi; pada gagal, hanya lifecycle request yang berubah menjadi `failed` dengan kode aman. Respons yang sudah committed dapat di-replay melalui UUID yang sama, sedangkan frontend memeriksa endpoint status setelah transport failure. Deep Research tetap memakai lifecycle background interaction dan cancellation token yang terpisah.
*   **Tenant Content Memory & Duplicate Guard**: `ContentArtifact` menyimpan registry kanonis per organization untuk Blueprint dan lifecycle draf, sedangkan `ContentSearchDocument` hanya menyimpan representasi retrieval yang dapat dibangun ulang. Blueprint, Quick Draft, Draft from Notes, autosave/manual draft, dan Analyze melakukan pencatatan melalui service bersama. Pemeriksaan exact dijalankan lebih dahulu; jika tidak memblokir, retrieval menggabungkan full-text/trigram dan cosine pgvector 768 dimensi yang difilter pada `organizationId` di kedua sisi join. Kandidat ambigu dapat dinilai oleh `ContentMemoryClassifierComposer`, tetapi schema classifier melarang verdict exact dan aksi block. Metadata related-content yang aman diinjeksikan ke generator sebagai konteks positioning, bukan sumber fakta. Kegagalan embedding, vector query, classifier, atau antrean selalu turun ke jalur deterministik. Exact content/title match dan reservation collision tetap satu-satunya hard-block.
*   **Server-Controlled Provider Selection**: Client produk tidak dapat memilih provider melalui body request. Admin internal menyimpan konfigurasi runtime berversi pada kolom `aiProviderOverride`; resolver mendukung format JSON baru serta format lama `provider:model`, lalu cache Redis per workspace dihapus setiap kali konfigurasi disimpan. Strategist dan Analyze memilih konfigurasi berdasarkan fungsi (`strategist_chat`, `strategist_quick_draft`, `analyze_refine`, `analyze_seo`, dan seterusnya). Search Chat, grounded Blueprint, dan Deep Research tetap Gemini-only karena membutuhkan tool/capability native Google; resolver akan memakai Gemini secara aman jika default workspace tidak kompatibel. Perubahan ini tidak memerlukan migrasi database.
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

Gemini mendukung dua tier runtime melalui `GEMINI_SERVICE_TIER`:

*   `standard` adalah default untuk traffic produksi yang sensitif terhadap latency.
*   `flex` ditujukan untuk smoke test staging, evaluasi, dan pekerjaan lain yang toleran terhadap latency. Tier ini diberi diskon token 50%, tetapi bersifat best-effort dan target latency dapat mencapai beberapa menit.

`src/lib/ai/gemini-request-policy.ts` menerapkan kontrak yang sama pada GenerateContent (`serviceTier`) dan Interactions (`service_tier`), menaikkan timeout Flex melalui `GEMINI_FLEX_TIMEOUT_MS`, serta melakukan bounded exponential backoff hanya untuk `429`/`503`. Runtime tidak pernah otomatis mengulang ke Standard setelah Flex gagal agar pengujian tidak menimbulkan biaya penuh secara tidak sengaja. Stream hanya boleh di-retry saat pembukaan koneksi; stream yang sudah menghasilkan chunk tidak boleh diputar ulang karena dapat menggandakan output parsial.

Untuk pengujian berbiaya rendah, gunakan model Flash-Lite dan Flex pada smoke test dengan fixture terbatas. Unit test tetap memakai mock tanpa panggilan berbayar. Biaya Google Search terpisah dari diskon token Flex; `GEMINI_DISABLE_GROUNDING=true` adalah guard global yang menghapus tool Search pada chat/plan dan menonaktifkan Deep Research di environment mana pun tempat flag itu aktif. Flag ini independen dari `ENABLE_MOCK_CHAT`. Batch API lebih tepat untuk regression corpus independen yang dapat menunggu hingga 24 jam; pipeline editorial utama tetap memakai Flex karena tahap Review → Rewrite → SEO → Quality Gate saling bergantung secara berurutan, sedangkan Batch hanya tersedia pada GenerateContent dan tidak menggantikan Interactions.

### Publication Draft vs. Quality-Gate Draft

Pipeline mempertahankan dua representasi setelah rewrite:

1.  **Quality-Gate Draft** dapat membawa marker verifikasi internal agar quality gate tetap mengetahui klaim mana yang membutuhkan keputusan editor.
2.  **Publication Draft** telah melalui normalisasi tabel, cleanup artefak rewrite, dan penghapusan marker internal sebelum ditampilkan, disimpan, atau diekspor ke CMS.

Publication Package memiliki status `not_generated`, `current`, atau `stale`. Revisi manual dinilai backend melalui tiga tingkat tanpa mempercayai severity dari client: edit kosmetik/copy edit aman mempertahankan state; edit editorial atau struktur menghasilkan `qualityGateState=validation_recommended` tanpa menurunkan readiness; perubahan angka, entitas, sitasi, URL, kutipan, negasi/modal, istilah high-stakes, target temuan sebelumnya, atau cakupan klaim menghasilkan `qualityGateState=stale` dan mewajibkan Quality Gate penuh. Ukuran edit bukan aturan utama dan hanya menjadi fallback untuk penambahan/penghapusan yang sangat besar. Action AI yang mengubah body tetap mewajibkan Quality Gate penuh, tetapi client mengorkestrasi pemeriksaan itu otomatis setelah mutasi persisten selesai sehingga editor tidak perlu menjalankan pemeriksaan ulang secara manual.

Setiap Final Draft memiliki `metadata._system.draftRevision` berisi revision ID, previous revision ID, exact normalized-body SHA-256, dan waktu pembuatan. `contentBlocks` menyimpan identitas sidecar untuk heading, paragraf, list, tabel, blockquote, dan code tanpa menyuntikkan marker internal ke Markdown publik. Mutasi body menyimpan `lastDraftChangeSet` yang memperluas hasil revision-impact dengan origin, revision signals, serta blok insert/update/delete. Identitas blok yang sama dipertahankan melalui exact-hash reconciliation dan bounded same-type positional reconciliation; histori lama dibaca melalui deterministic legacy identity sampai mutasi berikutnya membuat revision identity penuh.

Request Quality Check dan SEO dapat membawa revision ID serta body hash. Backend membandingkannya dengan body tersimpan sebelum memanggil model, lalu membaca dan membandingkan revisi sekali lagi di dalam transaksi serializable sebelum menyimpan hasil. Mismatch menghasilkan `DRAFT_REVISION_MISMATCH`; respons validator lama tidak boleh mengubah readiness, feedback, SEO, atau metadata revisi terbaru. Kontrak ini adalah prasyarat untuk background dan incremental validation, bukan implementasi targeted validator itu sendiri.

Risiko Quality Gate dipisahkan dari relevansi SEO. `seoReviewState` dapat bernilai `valid`, `possibly_stale`, atau `stale`; perubahan faktual tidak otomatis membuat Publication Package stale bila topik/positioning tetap sinkron. Perubahan kosakata metadata atau heading menghasilkan advisory, sedangkan hilangnya bagian material dari topical anchor metadata membuat package `stale`. Prepare mempertahankan paket `current` yang masih relevan setelah Quality Check dan hanya menjalankan SEO ulang bila package belum ada atau benar-benar stale. Export CMS tetap mensyaratkan readiness `ready`, package `current`, dan body yang sama dengan publication draft tersimpan; advisory tingkat menengah tidak memblokir ekspor.

Iterative Refine membandingkan output yang sudah dinormalisasi dengan input
publication draft. Output identik memicu satu corrective retry dengan instruksi
yang berubah. Jika retry tetap no-op, handler berhenti sebelum SEO, Quality
Gate, penyimpanan AnalysisLog, dan debit kredit; perubahan model juga tidak
boleh ditampilkan ketika diff draft kosong.

Editor dapat mengonfirmasi bahwa Publication Package yang berstatus `stale` masih relevan melalui action `confirm_publication_package` pada `PATCH /api/history/:id/resolve`. Action ini hanya tersedia jika generated metadata dan polished draft telah tersimpan. Backend mengubah `publicationPackageStatus` menjadi `current` untuk body aktif serta mencatat `metadata._system.seoConfirmedAt`, tanpa mengubah nilai metadata. Konfirmasi ini tidak melewati Quality Gate; perubahan body substantif berikutnya kembali membuat package `stale`, dan guard ekspor tetap mensyaratkan package `current`, body yang cocok, serta keputusan kualitas `ready`. Untuk temuan yang menargetkan `publication.*`, action `apply_publication_metadata_finding` membaca ulang revisi, metadata, dan finding tersimpan di dalam transaksi serializable; hanya field yang dipetakan dari `targetField` yang boleh berubah, dan nilai metadata serta status `isApplied` finding disimpan dalam satu update atomik. Guard umum `update_publication_package` tetap menolak penyimpanan ketika readiness belum `ready`.

Pemisahan ini mencegah instruksi seperti `[Source verification recommended]` bocor ke artikel publik tanpa menghilangkan warning pada refinement report.

### Deterministic Final Validation

`src/lib/final-quality.ts` melengkapi evaluasi model dengan pemeriksaan yang dapat diuji secara konsisten:

*   Konversi dan deteksi tabel ASCII serta validasi tabel Markdown GFM.
*   Source fidelity untuk angka, rentang, URL, entitas, dan akronim.
*   Lokasi target source-fidelity memakai batas token Unicode untuk sinyal alfanumerik; akronim seperti `ERP` tidak boleh dicocokkan sebagai substring di dalam kata seperti `enterprises`.
*   Deteksi atribusi motif organisasi/tokoh yang tidak ada pada sumber.
*   Validasi fase kalender berbasis zona waktu `Asia/Jakarta`.
*   Normalisasi tautan internal tepercaya dan marker verifikasi.

Final Draft menggunakan ledger resolusi persisten pada `metadata._system.resolvedQualityFindings` untuk membuat siklus perbaikan bersifat konvergen. Temuan Quality Gate menerima `feedbackId` dan `ruleId` yang diterbitkan backend; temuan faktual/sensitif-sumber juga memperoleh `claimId`, `blockId`, dan `sourceIds` bila tersedia. Sidecar `metadata._system.editorialIdentities` menyimpan registry klaim dan sumber kanonis yang terbatas, sedangkan body publik tetap berupa Markdown bersih. Hanya keputusan editor untuk menerima warning (`isAccepted`) atau memverifikasi sumber (`isVerified`) yang direkonsiliasi melalui identity tersebut; penerapan perubahan body (`isApplied`) bersifat provisional dan wajib dinilai dari isi revisi aktual. Record resolusi `applied` lama diabaikan saat dibaca. Pencocokan kategori/target hanya menjadi fallback kompatibilitas untuk record lama. Ledger tidak pernah menyembunyikan temuan `fail`, warning baru, warning yang masih terdapat pada hasil edit, atau warning yang claim identity-nya berubah.

Identity bukan kapabilitas dari client. Endpoint resolusi History membuang `feedbackId`, `ruleId`, `claimId`, `blockId`, dan `sourceIds` yang dikirim browser, lalu memulihkannya hanya jika kategori serta target/message cocok dengan temuan yang sudah tersimpan pada Analysis Log aktif. Hanya resolusi yang cocok dengan temuan server tersebut yang boleh ditambahkan ke ledger. URL sumber dinormalisasi dan di-hash menjadi source identity; isi research note tidak disalin ke registry identity.

Refine Draft memiliki ownership sampai hasil publish-ready. Rewrite awal tetap berada di backend dan tidak dikirim sebagai draft sementara. Sistem menjalankan Quality Gate body-only, lalu maksimal dua putaran remediasi: operasi target/replacement lengkap, pembersihan heading duplikat, serta netralisasi source-fidelity yang aman dilakukan deterministik; temuan editorial non-faktual dengan target persis dapat memakai Targeted Fix yang dijaga; dan URL sumber hanya dapat dipasang otomatis bila Quality Gate mengembalikan URL persis yang memang tersedia pada research notes. Setelah body stabil, SEO dibuat dari body final dan Quality Gate publish-ready memeriksa body serta Publication Package. Bila perubahan body masih diperlukan pada gate akhir dan anggaran putaran tersedia, SEO dibuat ulang sebelum pemeriksaan berikutnya. Sistem berhenti ketika ready, tidak ada perubahan aman, atau batas putaran tercapai—tidak ada loop rewrite tanpa batas dan tidak ada auto-accept.

Mutasi yang dibuat sistem menggunakan mode `validate_revision`, bukan langsung menjalankan full-draft Quality Gate. Backend membaca `lastDraftChangeSet` dan membentuk `ValidationScope` berisi block, claim, source, feedback, dan field SEO yang terdampak. Formatting-only menjalankan pemeriksaan deterministik tanpa AI; perubahan editorial terbatas menjalankan validasi ringan; perubahan faktual/sumber pada maksimal empat blok menjalankan Quality Gate terarah terhadap passage berubah, konteks tetangga, serta anchor intro/kesimpulan yang tidak berurutan. Pemeriksaan deterministik global tetap berjalan terhadap body penuh untuk menjaga integritas struktur dan source fidelity tanpa membuka kembali penilaian model pada seluruh artikel.

Scope naik ke full Quality Gate bila change set tidak tersedia, topic shift terdeteksi, lebih dari empat blok berubah, lebih dari dua blok dihapus, atau cakupan klaim berubah besar. Hasil incremental menyimpan versi policy validator, revision ID, body hash, level, status, scope, waktu, dan jumlah putaran pada `metadata._system.lastValidationResult`. Request otomatis berulang untuk revisi/hash yang sama hanya memakai ulang hasil durable dari policy validator saat ini; cache lama tanpa versi tidak digunakan sehingga hasil false-ready dari policy terdahulu diperiksa ulang. Guard transaksi serializable tetap menolak hasil yang terlambat. Batas konvergensi otomatis saat ini satu putaran validasi per revisi—temuan tersisa dikembalikan sebagai keputusan editorial, bukan memulai loop fix/validate tanpa batas.

Manual edit tidak divalidasi terhadap buffer rich-text yang belum disimpan. Setelah Save menghasilkan revision ID/body hash baru, frontend menjadwalkan `validate_revision`: `validationLevel=none` tidak membuat request, `light` memakai idle debounce 1,8 detik, dan `full` memakai 800 ms. Timer dan request memakai controller terpisah dari foreground AI sehingga editor dapat langsung membuka revisi berikutnya. Save/Refine/Apply/Prepare/History navigation atau pemeriksaan manual membatalkan pekerjaan background; request baru untuk revisi yang sama dikoaleskan oleh durable `lastValidationResult`. UI menyembunyikan tombol rerun normal selama proses dan menampilkan status berorientasi hasil.

Dependensi metadata publikasi disimpan per-field pada `metadata._system.seoFieldStates` dan selalu diikat ke revision ID. Perubahan angka, entitas, atau istilah hanya mengubah state field yang memuat token lama terkait; perubahan topik menandai seluruh paket. Setelah validasi body lulus, mode `refresh_seo_fields` hanya boleh menggabungkan candidate `excerpt`, `metaDescription`, `coverImageAltText`, dan `tags`. `title`, `metaTitle`, dan `slug` berstatus `review_required`, tidak pernah diambil dari candidate refresh otomatis, dan harus disimpan atau dikonfirmasi editor. Status paket global tetap `stale` selama satu field belum `valid`, sehingga guard export lama tetap ketat.

Frontend tidak menampilkan state teknis tersebut secara langsung. `publication-ux-state.ts` mengagregasikan revision validation, SEO review, paket publikasi, dan background activity menjadi satu prioritas UX: pemeriksaan berjalan, pemeriksaan selesai, keputusan konten diperlukan, atau keputusan detail publikasi diperlukan. Nama mode provider, istilah stale, rerun Quality Gate, dan regenerate SEO tidak berada pada jalur normal. Pemeriksaan revisi serta refresh detail penuh hanya muncul secara kondisional di menu alat draft ketika state blocking membutuhkan recovery; export guard backend tetap menjadi otoritas akhir.

State resolusi membedakan keputusan editorial tanpa mutasi (`isAccepted`) dari perubahan yang benar-benar diterapkan ke body (`isApplied`). Acceptance terakhir tanpa perubahan body dapat menghasilkan `ready`. Untuk temuan residual yang membawa saran koreksi, persetujuan editor langsung memanggil aksi perbaikan dan bukan sekadar menandai temuan diterima; pure acceptance hanya dipakai ketika tidak ada perubahan body yang diusulkan. Rewrite, remove/neutralize, auto-apply, atau penambahan source yang mengubah body mengikuti readiness backend lalu otomatis menjalankan revision-scoped validation atas body persis yang baru disimpan. Bila lulus, hanya field SEO aman yang dependency state-nya `stale` diperbarui; field terlindungi tetap menunggu keputusan editor. Edit manual `formatting_only`/`minor_copy_edit` mempertahankan state, `editorial_change` menampilkan advisory ringan, dan `high_risk_change` memblokir sampai pemeriksaan yang dipilih backend lulus. Temuan yang tetap ada setelah validasi otomatis ditampilkan sebagai pekerjaan editorial nyata, bukan tombol pemeriksaan ulang.

Quality Check mandiri menggunakan ulang research notes tersimpan dan URL sumber eksternal persis yang telah diverifikasi editor. URL tepercaya hanya membuktikan keputusan atas link tersebut, bukan otomatis membenarkan seluruh klaim di sekitarnya. Untuk source-fidelity, UX tidak menawarkan rewrite generatif terbuka: editor memilih sumber, penghapusan/netralisasi deterministik, atau keputusan manual yang sah. Targeted Fix menerima draft awal beserta research notes, memeriksa kandidat pengganti terhadap source fidelity, dan melakukan satu retry korektif jika perubahan mempertahankan sinyal tanpa dukungan yang disebut, tidak mengubah target, memperkenalkan angka/entitas/URL baru, atau membuat heading duplikat. Kandidat yang tetap tidak aman tidak diterapkan. Pemeriksaan global juga memblokir heading Markdown identik yang bersebelahan tanpa isi artikel di antaranya.

Kebijakan billing mode analisis bersifat eksplisit: hanya `analyze` dan `refine` yang melewati balance gate dan debit kredit. `fix_targeted`, `validate_revision`, `quality_gate`, `generate_seo`, dan `refresh_seo_fields` adalah remediasi/pemeriksaan publikasi non-billable, tetap dapat dijalankan saat saldo nol, dan tidak boleh memanggil jalur debit Analysis Log.

Temuan model dan deterministik diprioritaskan lalu dibatasi hingga 12 item yang dapat ditindaklanjuti. Readiness diturunkan secara kanonis: sedikitnya satu `fail` menghasilkan `blocked`, warning atau flag menghasilkan `needs_review`, dan hasil tanpa temuan menghasilkan `ready`.

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

### Skema Tenant Content Memory

*   **`ContentArtifact`**: Sumber kebenaran lifecycle konten per organization. `sourceType` dan `sourceId` menghubungkan artefak ke workflow asal secara idempoten, sementara `rootArtifactId` mempertahankan garis keturunan Blueprint ke draf berikutnya.
*   **`ContentSearchDocument`**: Proyeksi pencarian yang dapat dibangun ulang dari artefak. Record ini bukan sumber kebenaran dan selalu dibatasi dengan `organizationId`. Vector `embedding(768)` memiliki `embeddingModel`, source hash, timestamp, attempt, dan error state agar perubahan model atau search text memicu reindex yang aman.
*   **`ContentReservation`**: Claim topik sementara per request untuk menutup race condition ketika beberapa member memulai generasi yang sama secara bersamaan.
*   **`DuplicateGuardEvent`**: Telemetry verdict, confidence, alasan overlap, rekomendasi, retrieval mode, model/latency classifier, keputusan enforcement, tindakan lanjutan, dan label manusia yang dapat diatribusikan. Probable duplicate hanya menjadi hard block ketika feature flag aktif, organization berada dalam cohort rollout, tersedia minimal 50 label, dan precision terukur minimal 95%. Kegagalan membaca flag atau kalibrasi selalu kembali ke shadow/advisory.
*   **Content Intelligence Snapshot**: `content-intelligence.ts` membangun derived snapshot tenant-scoped dari maksimal 300 artefak terbaru. Semantic graph memakai pasangan cosine pgvector dengan filter `organizationId` pada kedua search document dan kedua artifact; kegagalan vector query turun ke metadata similarity. Topic cluster dapat menghubungkan bahasa berbeda, sedangkan cannibalization dan internal-link pair mengabaikan turunan dalam lifecycle family yang sama. Gap hanya berasal dari alternative angle classifier tersimpan atau cluster tanpa coverage Ready/Published; tidak ada body draft atau panggilan LLM baru pada request dashboard.
*   **Actionable Intelligence**: Phase 6.1 memperkaya proyeksi dengan judul artikel dari publication package/working title/H1, source log terbaru, owner, stage, keyword, dan status ekspor. Prompt atau kalimat status editorial tidak boleh menjadi judul; artefak lama yang diperbaiki saat read tidak memakai vector lamanya. Mutasi reposition, canonical, consolidated, archive, dan not-cannibalization selalu memvalidasi organization pada query, membatasi perubahan ownership, serta menulis `ContentIntelligenceDecision`. Consolidation/archive hanya mengubah registry dan tidak menghapus `AnalysisLog` atau halaman CMS.

---

## 6. Optimalisasi Sisi Klien (Frontend Stack)

*   **Tailwind CSS v4**: Menyediakan performa build yang jauh lebih cepat, penggunaan variabel CSS modern native, serta utilitas grid yang fleksibel untuk membagi porsi tampilan Editor dan Feedback secara seimbang pada resolusi layar besar.
*   **Framer Motion**: Digunakan untuk transisi antarmuka ringan tanpa membebani editor utama.
*   **Notifikasi Sonner**: Penanganan visual notifikasi sukses atau error dengan performa tinggi tanpa memblokir interaksi pengguna di editor teks.
*   **Base UI & Shadcn**: Memberikan aksesibilitas standar industri dan visual premium yang konsisten.
*   **Activity Bar Settings**: Menu `Setting` ditempatkan di atas toggle dark/light agar kontrol session dan preferensi editor terkumpul di satu area yang mudah diperluas.
*   **Editorial Progress UI**: Komponen `EditorialProgress` menggunakan status stream backend untuk menampilkan checklist tahap, elapsed time, skeleton dokumen, dan progress rail. Animasi menghormati preferensi `prefers-reduced-motion`.
*   **Finite Request Lifecycle**: Semua request API frontend melewati `fetchWithTimeout`, yang menggabungkan deadline internal dengan `AbortSignal` pemanggil. Stream AI memakai idle timeout yang membatalkan reader dan fetch controller, sedangkan polling Deep Research dijalankan secara berurutan agar request tidak overlap. Operasi AI panjang menyediakan Cancel dan placeholder assistant memakai lifecycle terminal eksplisit. Disconnect diteruskan oleh backend dari response Express ke runtime provider, retry Flex, dan opsi abort native Gemini/Groq/OpenRouter. Outbound service call backend menggunakan `fetch-with-timeout.ts`; fetch khusus SSRF tetap memakai policy DNS-pinned yang lebih ketat.

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
        2.  `PATCH /api/history/:id/resolve`: Rute khusus untuk menyimpan resolusi feedback, menerapkan nilai sekaligus menyelesaikan finding metadata secara atomik melalui `apply_publication_metadata_finding`, dan mengonfirmasi Publication Package yang masih relevan melalui `confirm_publication_package`. Payload divalidasi sebagai discriminated action oleh `EditorialResolutionSchema`.
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

## Editorial Preview Actionability Contract

`ReviewCapability` in `@eai/shared` is the canonical action projection. The
backend and frontend project raw findings into exactly one of mechanical fix,
prepared proposal, source decision, or manual editorial decision. Review
surfaces render that discriminated union and must not infer capability from
the independent presence of `targetText`, `replacementText`, category, or
operation. Bulk Apply counts only capabilities whose `autoApplicable` value is
true. Source decisions never receive generic rewrite; high-risk findings may
be kept only when their capability explicitly permits it.

Unambiguous missing sentence whitespace is repaired deterministically while
preparing/remediating the publication body. The corresponding validator rule
remains as a structured prepared patch for legacy or independently supplied
unprepared drafts, and repeated model/deterministic representations are
collapsed into one review decision.

Source-fidelity signal comparison is context-bounded rather than purely
document-lexical. A number is excluded only when every occurrence is within an
explicitly hypothetical or illustrative sentence; any factual
occurrence keeps the signal reviewable. Common protocol, format, CMS, and SEO
acronyms are generic technical vocabulary rather than identity entities.

When Quality Gate identifies a paragraph break as the only required change,
the backend projects it into a prepared body patch only if the exact target is
unique, contains exactly two sentences, and has no existing line boundary.
Refine applies that patch and runs Quality Gate again. Ambiguous multi-sentence
or non-unique targets remain manual editorial decisions.

If a provider incorrectly returns descriptive `targetText`, the backend may
recover the patch from an explicit quoted `after`/`setelah` anchor in the
finding instruction. Recovery requires one exact anchor occurrence followed
immediately by capitalized prose, rejects an existing paragraph boundary, and
must preserve every non-whitespace character. The patch targets only the
anchor and adjacent first word; non-unique anchors remain manual.

Draft preparation also recognizes the stricter malformed Markdown boundary
`closed bold sentence + no whitespace + next prose sentence`. It inserts two
newlines before Quality Gate only when the delimiter is demonstrably closing,
the following token begins normal prose, fenced code is not involved, and
removing whitespace makes the before/after strings identical. The capability
fallback classifies a prepared paragraph-boundary patch as `mechanical_fix`,
so historical or independently supplied findings cannot expose Keep.

A ready result in the Editor owns one explicit center-canvas handoff to
Publication. That navigation cannot depend on the optional right context panel
and remains available while the completion handoff protects the draft from
additional mutations. CMS connection and Prepare actions are not Editor-stage
substitutes for this transition: they appear only after navigation to
Publication. Entering Publication does not weaken export readiness; CMS
connection, current complete metadata, and exact persisted-body equality remain
independent export requirements.

Publication metadata never falls back to candidate-body editing. Provider
findings that explicitly name a metadata field are projected to the canonical
`publication.*` target and ignored in content-only Fast mode. Refine retries a
publication-only failure by regenerating the SEO package. If the bounded retry
still leaves a genuine decision, Review links to Publication with the relevant
SEO Pack field already in edit focus. Publication may expose that metadata
editor while readiness remains unresolved, but Prepare and Export stay blocked;
saving the metadata automatically runs publication validation again.

Final Quality Gate feedback is not complete when it only describes a problem.
Every remaining `warning` or `fail` must include a concrete `suggestion`.
Structural findings should additionally carry a short exact `targetText` when
the affected passage can be identified safely.

Manual review actions preserve that context across the transition into the
candidate editor. The selected finding remains visible in the edit command
row, and an available `targetText` is resolved against editor text, selected,
focused, and scrolled into view. Opening manual edit must enter edit mode
directly; a read-only preview is not a valid manual-edit destination.

The frontend selects the narrowest safe action:

- complete target/replacement operations expose direct Accept change and apply
  optimistically before persistence;
- residual findings without a complete operation expose Generate suggestion;
  Targeted Fix returns a local Before/After preview without mutating or
  persisting the draft;
- source-fidelity and verification findings expose source, deterministic remove/neutralize, or manual-decision actions instead of open-ended generative rewrite;
- findings without target text may generate a constrained whole-draft preview
  using the finding message, suggestion, and reason, but still require a
  separate Accept change action;
- non-factual warnings may be accepted without mutation only when no draft correction is proposed;
- factual/source-risk warnings and all blocking failures cannot be accepted
  without revision or verification.

Prepared-patch acceptance follows explicit failure semantics:

- persistence failure restores the previous local snapshot;
- revision conflict restores the snapshot and reloads the server-authoritative
  saved revision; and
- validation that still returns warnings keeps the accepted edit and presents
  only the remaining decision.

Any body-changing resolution returns to Quality Check semantics. It does not
require Full Analyze, and export remains guarded by current readiness,
publication metadata, and saved-body consistency.

### Pre-final candidate presentation

Refine may persist a candidate revision that still contains a bounded residual
editorial decision. Persistence protects recovery across refreshes and devices,
but it does not promote that revision to the user-facing Final Draft surface.

- unresolved `warning` or `fail` items render in Draft Review;
- candidate availability is derived from the body independently of publication
  readiness; the body remains hidden behind the explicit Candidate Draft view,
  where it is rendered and may be edited even while readiness is not `ready`;
- feedback actions describe editorial outcomes rather than backend mechanisms;
- every body or source decision is saved and validated automatically; and
- Final Draft is presented only when the current saved revision is `ready`.

## Workspace Editorial AI Request Lifecycle

Analyze, Refine, targeted fixes, standalone Quality Check, SEO regeneration,
Prepare, and Draft from Notes share a single-flight workspace boundary. The
active AbortController is the authoritative request-ownership signal; display
states such as `analysis.status`, readiness, or the arrival of an early score
must not decide whether cancellation remains available.

The title-bar action remains Cancel until the owning request reaches terminal
cleanup. Cancelling aborts the fetch/provider chain but does not release the
controller reference early, preventing an older request's `finally` block from
clearing a newer request. Conflicting Final Draft and note-generation actions
remain disabled while this boundary is active.

Analyze/Refine and standalone publication checks are transactional from the
user's perspective. A new request may render provisional output, but the last
completed `AnalysisResult` and source-draft snapshot remain available for
rollback. Cancellation restores that committed snapshot; a cancelled retry
must never erase the previously completed Final Draft.
