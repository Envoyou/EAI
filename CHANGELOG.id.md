# Changelog

Semua perubahan penting pada proyek **Envoyou AI Editorial System** akan didokumentasikan di berkas ini.

Format berkas ini didasarkan pada [Keep a Changelog](https://keepachangelog.com/id/1.0.0/) dan proyek ini mematuhi [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Idempotensi Request Blueprint Strategist yang Persisten**:
  - Menambahkan UUID yang dibuat client pada setiap request generate blueprint serta lifecycle `StrategistPlanRequest` yang tersimpan (`pending`, `completed`, atau `failed`).
  - Menambahkan endpoint status request blueprint terautentikasi agar frontend dapat merekonsiliasi hasil jaringan yang tidak pasti tanpa memulai generasi AI kedua.
  - Menambahkan migration `20260728090000_add_strategist_plan_idempotency`, yang telah diterapkan ke database Neon production pada 28 Juli 2026.
- **Lifecycle dan Pemulihan Request Fast Chat**:
  - Menambahkan claim request Fast Chat berbasis UUID dengan status persisten `pending`, `completed`, dan `failed`, beserta endpoint pemulihan terautentikasi.
  - Menambahkan kode kegagalan provider yang aman untuk rate limit, layanan tidak tersedia, timeout, pembatalan, dan kegagalan chat yang tidak terklasifikasi tanpa mengekspos payload mentah provider.
  - Menambahkan migration `20260729010000_add_strategist_chat_lifecycle`, yang telah diterapkan ke database Neon production pada 29 Juli 2026.

### Fixed
- **Notifikasi Gagal Palsu dan Duplikasi Generate Blueprint**:
  - Mencegah blueprint yang sudah berhasil tersimpan dilaporkan gagal ketika respons hilang atau terpotong di antara backend dan browser.
  - Membuat pengiriman ulang dengan UUID request yang sama mengembalikan hasil yang sudah committed atau status operasi yang masih berjalan, bukan menghasilkan dan menyimpan blueprint duplikat.
  - Menyimpan pesan user, blueprint asisten, dan hasil request berstatus selesai dalam satu transaksi database agar riwayat chat dan status request tidak menyimpang.
  - Mempertahankan kompatibilitas rolling deployment dengan membuat UUID fallback di server untuk bundle frontend lama yang belum mengirim request ID.
- **Pesan Strategist Yatim Setelah Stream AI Gagal**:
  - Menunda penyimpanan pesan Fast Chat sampai generasi AI berhasil, lalu menyimpan timestamp sesi, pesan user, respons assistant, dan hasil request selesai dalam satu transaksi atomik.
  - Mengembalikan ulang respons yang sudah committed ketika UUID request chat yang sama diterima dan merekonsiliasi respons hilang dari frontend tanpa pemanggilan AI kedua.
  - Mencegah pemotongan kredit ganda pada retry request Fast Chat yang sama.
  - Meneruskan kegagalan dari event error/completion SSE Gemini dan stream selesai tanpa teks ke kebijakan retry Flex yang sudah ada, termasuk kegagalan setelah stream terbuka, serta mempertahankan kategori error provider yang aman untuk proses recovery.
  - Menambahkan fallback non-streaming dengan thinking rendah secara terbatas ketika Gemini menyelesaikan stream Fast Chat tanpa teks jawaban, beserta diagnostik event terminal yang tidak menyimpan prompt maupun konten hasil generasi.
  - Merutekan Fast Chat dengan Search melalui `gemini-3.6-flash` (dapat dikonfigurasi lewat `GEMINI_STRATEGIST_SEARCH_MODEL`) sambil mempertahankan Flash-Lite untuk chat tanpa Search, sehingga mencegah kegagalan `requires_action` / `malformed_tool_call` ketika Flash-Lite mencoba Google Search melalui Interactions API.
  - Mengganti alur exception unique constraint pada claim request blueprint dengan `createMany({ skipDuplicates: true })`, sehingga log Prisma `P2002` yang menyesatkan tidak lagi muncul.

## [3.17.0] - 2026-07-26

### Added
- **Stream Penalaran Real-Time Gemini pada Onboarding**:
  - Meng-upgrade `/api/onboarding/discover` untuk mengalirkan pemikiran AI Gemini (*Chain of Thought*) secara *real-time* via Server-Sent Events (SSE).
  - Mengintegrasikan pengolahan rich text `ReactMarkdown` untuk baris penalaran pada `OnboardingWizard`, merender teks cetak tebal, kode inline, dan judul tanpa simbol mentah Markdown.
  - Mengimplementasikan antrean stream typewriter yang halus (interval 18ms) dengan *adaptive token popping* dan *smooth auto-scrolling*.
- **Penyimpanan Permanen Metadata Onboarding & Wawasan Marketing Admin**:
  - Menambahkan bidang database Prisma `User.onboardingRole` (peran deskriptif editorial), `Organization.acquisitionSource` (saluran akuisisi), `Organization.acquisitionSourceOther` (detail saluran), `Organization.primaryGoal` (tujuan utama workspace), dan `Organization.onboardingCompletedAt` (stempel waktu penyelesaian).
  - Menerapkan migrasi `20260726132147_persist_onboarding_metadata` untuk menyelaraskan skema database Neon.
  - Menambahkan validasi skema invariant Zod di `@eai/shared` yang mewajibkan `acquisitionSourceOther` minimal 2 karakter ketika `acquisitionSource === 'other'`.
  - Menambahkan kamus pemetaan label kanonis `USER_ROLE_LABELS`, `ACQUISITION_SOURCE_LABELS`, dan `PRIMARY_GOAL_LABELS` di `@eai/shared`.
  - Menambahkan bidang input teks `acquisitionSourceOther` pada Q4 `OnboardingWizard` serta pratinjau langsung di bilah samping onboarding.
  - Mengimplementasikan seksi **Onboarding & Marketing Insights** di `OrganizationDetailDrawer` (`/admin/users`) untuk menampilkan peran, saluran akuisisi, detail saluran, tujuan utama, nama publikasi, domain, dan stempel waktu aktivasi secara transparan.
  - Menambahkan pengujian unit kontrak penyimpanan permanen backend secara komprehensif di `apps/backend/src/routes/__tests__/onboarding-persistence.test.ts`.

### Changed
- **Redesain UI Onboarding & Kepatuhan Standar Clerk**:
  - Mere-design tata letak onboarding untuk menyesuaikan tampilan floating multi-island IDE dengan tipografi Inter dan kontras token yang presisi (`bg-[var(--card)]`, `inset 0 0 0 1px var(--card-border)`).
  - Menambahkan kelas komposisi `.onboarding-goal-card.ui-btn` di `composite-controls.css` untuk melepaskan stadium pill shape dan mencegah distorsi teks kartu.
  - Mengganti ikon bidang dengan Lucide `Goal`, `Rss` (Publication Website), dan `Languages` (Primary Language).
  - Memperluas kontainer stream penalaran menjadi tata letak *full-width frameless* tanpa pembatas border atau background sub-card.
- **Idempotensi Endpoint Aktivasi & Penanganan Strict Null**:
  - Memperbarui `POST /api/onboarding` di backend untuk menyimpan `null` murni pada jawaban peran/marketing yang tidak diisi saat aktivasi atau skip (mencegah fallback default palsu pada analitik).
  - Menegaskan idempotensi aktivasi: jika onboarding workspace telah selesai (`onboardingStatus === 'completed'`), endpoint mengembalikan status aktif secara aman tanpa mere-aktivasi atau membuat duplikat rekaman `EditorialProfile` atau `EditorialProfileVersion`.
- **Ratchet Test Suite Frontend**:
  - Memperbarui `LegacyFeatureFormControls.test.ts` untuk mengonfirmasi 3 komponen `<Input>` surface dan 7 kemunculan `variant="surface"` pada tahap aktivasi onboarding.

## [3.16.0] - 2026-07-25

### Added
- **Workflow Kualitas Final Draft yang Konvergen**:
  - Menambahkan ledger resolusi kualitas persisten pada metadata analisis agar warning yang telah diterima, diterapkan, atau diverifikasi dapat direkonsiliasi pada Quality Check berikutnya tanpa menyembunyikan masalah baru.
  - Menambahkan penggunaan ulang URL sumber eksternal yang telah diverifikasi editor secara persis serta research notes tersimpan pada Quality Check mandiri.
  - Menambahkan aksi eksplisit **Pertahankan metadata saat ini** ketika metadata publikasi berstatus stale, sehingga editor dapat mengonfirmasi bahwa paket SEO yang ada masih sesuai dengan draft aktif yang tersimpan.

### Changed
- **Targeted Fix Aman terhadap Sumber & Keputusan Kualitas Konsisten**:
  - Targeted Fix kini menerima draft awal dan research notes tersimpan, memvalidasi kandidat pengganti terhadap angka, entitas, dan URL baru, lalu mencoba satu kali lagi dengan arahan korektif sebelum menolak perubahan yang tidak aman.
  - Pemrosesan Final Quality kini memprioritaskan gabungan temuan model dan deterministik, mempertahankan hingga 12 item yang dapat ditindaklanjuti, serta menurunkan readiness secara konsisten: setiap failure menghasilkan `blocked`, warning menghasilkan `needs_review`, dan hasil bersih menghasilkan `ready`.
  - Konfirmasi metadata publikasi mencatat keputusan editor untuk body aktif yang tersimpan tanpa mengubah nilai metadata atau melewati Quality Check. Mutasi body berikutnya akan membuat package kembali stale.

### Fixed
- **Loop Feedback Quality Gate Berulang**:
  - Mencegah warning yang telah diselesaikan muncul tanpa henti selama kategori dan targetnya tetap sama, dengan tetap mempertahankan seluruh temuan berlevel failure serta warning yang berubah secara material.
  - Mencegah link sumber yang telah diverifikasi editor ditandai berulang hanya karena Quality Check mandiri berikutnya tidak menerima konteks verifikasi sebelumnya.
  - Memungkinkan editor menyelesaikan warning metadata publikasi stale melalui konfirmasi eksplisit tanpa dipaksa membuat ulang metadata SEO yang masih relevan.
  - Membedakan acceptance tanpa perubahan body dari aksi rewrite/remove yang diterapkan: keputusan yang hanya diterima dapat langsung menjadi ready, sedangkan perubahan body dilabeli menunggu Quality Check dan menggunakan readiness/status package backend sebagai state otoritatif.
  - Memperbaiki counter panel Feedback agar melaporkan pemeriksaan unresolved dan resolved secara terpisah, serta mengubah label flag lama menjadi menunggu pemeriksaan ulang setelah temuan yang ditangani mengubah draft.
- **Stream Thinking Strategist Produksi**:
  - Mengaktifkan Gemini Interactions thought summaries secara eksplisit untuk chat produksi. Chat dengan grounding menggunakan thinking level medium, sedangkan chat tanpa Search menggunakan level low.
  - Menambahkan adapter teruji dari delta Gemini `thought_summary` ke event SSE Strategist `thinking`, dengan tetap mempertahankan fallback statis untuk prompt sederhana ketika provider tidak mengirim summary.
- **Checker Kualitas Deterministik & Alur Provenance Tautan**:
  - Menambahkan ekstraksi angka URL dari path dan nama berkas link sumber mentah (seperti `2025` pada `/2025/06/16/` atau `Q3-2025.pdf`), mengeliminasi False Positive `Unsupported Quantitative Claim` saat angka tahun/kuartal terdapat dalam link sumber mentah.
  - Meningkatkan ekstraksi alias entitas domain untuk meloloskan akronim dari root domain (`gggi.org` -> `GGGI`, `undp.org` -> `UNDP`) hingga 12 karakter, serta menambahkan ekstraksi kata entitas dari URL sumber mentah untuk mengeliminasi False Positive `Unsupported Entity Detail`.
  - Menambahkan `SDG` dan `SDGs` ke `GENERIC_PROPER_NAMES` serta menyaring label kuartal/tanggal (seperti `Q3-2025`) dari deteksi entitas baru.
  - Membatasi `trustedInternalUrls` di `analyze.ts` secara khusus hanya pada artikel terpublikasi dari `selectRelevantPublishedPosts` (katalog tepat yang dikirim ke LLM rewrite) menggunakan `buildCanonicalInternalPostUrl`.
- **Penggabung Chunk Berbasis Batas & Audit Integritas Struktural Terkalibrasi**:
  - Menambahkan `joinRewrittenChunks` untuk menginpeksi batas blok Markdown (`\n\n`, header `#`, fence ```` ``` ````, daftar, dan tanda baca kalimat) sebelum menggabungkan chunk, mencegah penggabungan kalimat cacat (seperti `mandates.The`).
  - Menambahkan pemeriksaan integritas struktural terkalibrasi: `detectMissingSentenceBoundaries` menghasilkan `warning` (`Missing Sentence Whitespace`), sedangkan `detectContentAfterReferences` menghasilkan `fail` (`Content After References`).
- **Migrasi Schema Prisma & Perbaikan Auto-Save**:
  - Menerapkan migrasi `20260724043000_add_analysis_log_pinning` (`ALTER TABLE "AnalysisLog" ADD COLUMN "isPinned" ...`) ke database Neon PostgreSQL, menyelesaikan error `P2022 ColumnNotFound` saat autosave dan query riwayat.
  - Memperbaiki error TypeScript strict null narrowing pada `editorialProfile.config.internalLinkBaseUrl` di `analyze.ts`.

## [3.15.0] - 2026-07-24

### Added
- **Menu Aksi Adaptif & Pin Draft**:
  - Menambahkan primitive `AdaptiveActionMenu` bersama yang merender dropdown melalui portal di desktop dan aksi yang sama sebagai bottom sheet di mobile.
  - Menambahkan pin persisten untuk Draft History, termasuk pengurutan pinned-first pada API, optimistic update pada UI, dan field database `AnalysisLog.isPinned` yang terindeks.
  - Menambahkan aksi Pin, Rename, dan Delete pada setiap baris Draft History tersimpan.
- **Token Ikon Semantik & Kontrol Aksi**:
  - Menambahkan katalog ikon semantik yang tetap mendukung tree-shaking dan dikelompokkan berdasarkan domain intent (`ai`, `actions`, `navigation`, `status`, `content`, `entities`, dan `editor`), sehingga feature code merujuk fungsi ikon alih-alih nama bentuk geometrinya.
  - Menambahkan wrapper `ActionButton` kanonis yang menyusun primitive Button global dengan ikon semantik, label aksesibel, dan perilaku loading yang konsisten.
  - Menambahkan architecture decision record dan regression ratchet agar inventaris import Lucide langsung yang masih legacy tidak bertambah selama migrasi terukur.
- **Workflow Publikasi Aman terhadap Revisi**:
  - Menambahkan operasi mandiri **Quality Check** dan **Regenerate SEO** untuk draft final tersimpan tanpa menjalankan pipeline rewrite.
  - Menambahkan kontrol edit draft final dan metadata publikasi. Penyimpanan revisi body membatalkan keputusan kualitas serta paket SEO sebelumnya; penyimpanan metadata mengikatnya ke draft aktif yang sudah lolos pemeriksaan.
  - Menambahkan guard ekspor dan state workflow persisten agar perbaikan feedback yang mengubah body wajib diperiksa ulang, sedangkan warning tanpa perubahan body yang sudah diterima tidak memicu siklus Analyze penuh.
- **Protokol Mock Strategist Chat Setara Produksi**:
  - Menambahkan protokol event Strategist chat bersama untuk stream produksi dan mock, meliputi event thinking, grounding source, suggestion, completion, error, serta lifecycle Deep Research.
  - Menambahkan konfigurasi mock chat backend yang bersifat opt-in (`ENABLE_MOCK_CHAT`, `MOCK_CHAT_SPEED`) dan pemilih rute frontend yang sesuai (`NEXT_PUBLIC_MOCK_CHAT`) tanpa mengubah kontrak endpoint produksi.
  - Menambahkan cakupan integrasi untuk memastikan stream mock tetap kompatibel dengan protokol yang sama yang dikonsumsi UI chat produksi.
- **Pustaka Laporan Deep Research Persisten**:
  - Menambahkan tab khusus **Deep Report** pada Strategist Copilot, menggantikan modal laporan sementara dengan pustaka laporan persisten per dokumen.
  - Laporan tersimpan otomatis, mendukung aksi salin/unduh/hapus/diskusikan, dan menampung maksimal lima laporan. Saat penuh, UI meminta pengguna menghapus laporan lama sebelum laporan baru dapat disimpan.
  - Menambahkan konteks follow-up berbasis laporan agar hasil riset tersimpan dapat dibuka kembali dan dilanjutkan melalui Chat with EAI.

### Changed
- **Menu Titik Tiga yang Konsisten**:
  - Memigrasikan aksi sesi Strategist dan aksi admin User Directory ke perilaku menu adaptif bersama.
  - Merapatkan jarak vertikal antarbaris sesi chat Strategist dengan tetap mempertahankan judul, tanggal, dan status pin.
- **Kontrol Workspace & Final Draft Adaptif**:
  - Mengonsolidasikan selector mode analisis ke primitive Select adaptif global, menggunakan popover di desktop dan bottom sheet di mobile tanpa state atau markup lokal yang terduplikasi.
  - Memperluas primitive konten Popover global dengan mobile menu sheet opsional, lalu memigrasikan menu More Actions berkategori pada Final Draft agar menggunakannya.
  - Menstandarkan intent semantik kontrol Refine Draft, Prepare, EAI Chat, Copy, Edit, Export, dan More Actions; Prepare kini tetap menampilkan ikon di mobile dan label teks di desktop.
- **Kontrak Streaming Strategist & UI Responsif**:
  - Memisahkan pemilihan jalur Strategist chat ke `useStrategistChatPath.ts`, sehingga pemilihan rute mock dan produksi terisolasi dari hook konten utama.
  - Memperluas presentasi chat untuk membedakan status thinking, grounded source, suggestion, dan Deep Research dengan tetap mempertahankan layout Copilot responsif yang sama di desktop, tablet, dan mobile.
  - Mengubah sitasi source menjadi disclosure tanpa border yang menampilkan semua link secara vertikal, mengizinkan suggested action panjang terbungkus ke beberapa baris, serta meringkas tab Copilot dan toolbar chat menjadi ikon saja di mobile dengan tetap mempertahankan label aksesibel dan teks desktop.
  - Menambahkan selector domain terbatas untuk kontrol komposit yang sengaja menggunakan bentuk kartu/persegi alih-alih bentuk pill milik primitive Button. Selector dimuat setelah style primitive dan tidak menggunakan `!important`.
- **Penyelarasan Direct API Fetch & Stabilitas Referensi Content Strategist**:
  - Menyelaraskan status polling (`GET /api/strategist/chat/status/:id`) dan pembatalan (`POST /api/strategist/chat/status/:id/cancel`) Deep Research di `useContentStrategist.ts` dari `fetchWithTimeout` relatif (Next.js proxy) ke `directFetch` (Railway API).
  - Membungkus `directFetch` dengan `useCallback` pada `useDirectFetch.ts` untuk menjamin stabilitas referensi fungsi antar re-render, mencegah restart effect polling dan reset timer yang tidak perlu.
  - Menambahkan URL encoding (`encodeURIComponent`) pada ID interaksi, mempertahankan perlindungan timeout per-request (`REQUEST_TIMEOUT_MS.polling` = 20s untuk status polling, `8_000ms` untuk cancel), serta menambahkan feedback error UX yang nuansial saat request cancel mengalami timeout.
- **Upgrade Model Gemini & Migrasi Interactions API**:
  - Mengupgrade model Gemini primer dari `gemini-3.5-flash` → `gemini-3.6-flash` untuk semua role editorial (`polish`, `editor`, `fact-checker`, `author`, `generate-plan`, `draft-from-notes`, dan Deep Research) di `model-router.ts`, `helpers.ts`, dan `provider-runtime.ts`.
  - Mengupgrade model ringan/copilot dari `gemini-3.1-flash-lite` → `gemini-3.5-flash-lite` untuk role `seo`, `author`, fast-mode, dan Strategist Copilot Chat (`MODEL` di `helpers.ts`).
  - Memperbarui pemetaan fallback legacy di `helpers.ts` (`resolveModel`) agar mengarahkan model deprecated ke `gemini-3.6-flash`.
  - Mendaftarkan estimasi harga dan harga telemetri default untuk `gemini-3.6-flash` dan `gemini-3.5-flash-lite` di `pricing.ts` dan `ai-telemetry.ts`.
  - Migrasi path Gemini di Strategist Quick Draft (`quick-draft.ts`) dari API `generateContent` lama ke Interactions API (`gemini.interactions.create()` dengan `stream: true`), menyamakannya dengan `chat.ts` dan `plan.ts`.
  - Memperbarui loop event streaming di `quick-draft.ts` untuk menggunakan penanganan event `step.delta` / `content.delta` sebagai ganti iterasi chunk mentah.

### Fixed
- **Sidebar Mobile Menutup Otomatis**:
  - Menutup drawer navigasi workspace global dan admin segera setelah tautan navigasi dipilih pada mobile.
  - Menutup Draft History di mobile setelah memilih draft tersimpan, melanjutkan draft belum tersimpan, atau membuat artikel baru, tanpa mengubah sidebar desktop maupun aksi non-navigasi.
- **Menu Aksi Sesi Strategist**:
  - Menempatkan positioner menu Pin/Rename/Delete yang dirender melalui portal di atas stacking layer panel workspace, sehingga menu titik tiga tetap terlihat dan dapat digunakan.
  - Memigrasikan trigger menu sesi ke primitive Button kanonis dengan area klik yang konsisten dan label aksesibel spesifik sesi.
- **Separator Tab Strategist Copilot**:
  - Menghapus border bertumpuk dari setiap tombol tab Copilot dan wrapper tab Feedback, sehingga hanya tersisa satu separator milik container serta satu outline panel luar.
  - Merender indikator aktif Chat, Feedback, Notes, atau Deep Report sebagai satu garis 1px di atas separator agar ketebalan visual konsisten.
- **Scroll Editor Final Draft**:
  - Membatasi tinggi textarea Edit Final Draft berdasarkan viewport dan menambahkan scroll internal, sehingga artikel panjang tidak lagi memperbesar editor ke area overflow panel yang terpotong.
  - Menambahkan jarak yang jelas antara baris aksi Final Draft dan card editor.
- **Tema Gelap Strategist & Cascade Hover Kontrol Komposit**:
  - Memperbaiki token tipografi Markdown pada note tersimpan agar heading, emphasis, list, tabel, dan link tetap terbaca di mode gelap.
  - Memperbaiki hover daftar Deep Report agar seluruh kartu laporan, termasuk aksi hapus, berubah sebagai satu permukaan tanpa hover pill bertumpuk.
  - Mengaudit konflik cascade primitive pasca-v3.14 dan memulai migrasi terbatas untuk tab Copilot, aksi Notes, accordion Feedback, serta kontrol toggle publik tanpa mengembalikan `!important` nuklir.
- **Tampilan Thinking Strategist Chat Tidak Muncul**: Delta `thought_summary` dari Interactions API menggunakan field bertingkat `delta.content.text`, bukan field datar `delta.text` yang dipakai delta teks biasa. Loop streaming di `chat.ts` kini mendeteksi `deltaType === 'thought_summary'` dengan benar dan memancarkan SSE event `{ type: 'thinking', chunk }`, yang sudah ditunggu frontend (`useContentStrategist.ts` + `ChatMessageList.tsx`) — membuat tampilan thinking real-time berfungsi untuk pertama kalinya.

## [3.14.0] - 2026-07-23

### Changed
- **Penyempurnaan UX Seluler & Audit Token Desain Onboarding**:
  - **Format Chat Output AI & Kontras Mode Gelap**: Menghapus background card bubble pada pesan asisten AI (rendisi transparan dengan mempertahankan bubble user sebagai `surface-2`). Memperbaiki kontras teks mode gelap untuk judul (`h1`-`h4`), teks tebal (`strong`), sel/header tabel (`th`, `td`), dan tautan (`a`) pada `ChatMessageList.tsx` dan `prose.css`.
  - **Petunjuk Geser Horisontal Tabel Admin Seluler**: Menambahkan petunjuk geser seluler (`Swipe horizontally to view all columns`) di atas semua tabel admin pada `/admin/users`, `/admin/tenants`, dan `/admin/audit-logs`.
  - **Perbaikan Lingkaran Backdrop Sidebar Seluler**: Memperbaiki bug tampilan lingkaran raksasa pada backdrop overlay sidebar HP dengan menambahkan `border-radius: 0 !important;` pada `.workspace-page-sidebar-backdrop` di `responsive.css`.
  - **Text Wrapping TipTap Editor di HP**: Memperbaiki masalah kalimat panjang menembus lebar layar di `/workspace` dengan menerapkan `white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere; min-width: 0;` pada `.ProseMirror` dan wadah canvas editor di `editor.css` dan `Editor.tsx`.
  - **Tombol Lipat Metadata Ikon-Saja & Header Responsif**: Mengubah tombol lipat kontrol metadata editor di `Editor.tsx` menjadi tombol ikon ringkas (`size="icon-xs"` dengan `ChevronUp`/`ChevronDown`), serta menyembunyikan subjudul header di HP (`hidden sm:block`) agar header tidak terpotong pada layar HP yang sempit.
  - **Audit Token Desain & UI Halaman Onboarding**: Menyelaraskan token warna (`text-[var(--primary)]`, `bg-[var(--primary)]/10`, `hover:text-[var(--error)]`), memperbarui border sidebar langkah onboarding menjadi `border-b lg:border-b-0 lg:border-r` untuk tata letak HP 1-kolom, dan mengoptimalkan tinggi kartu opsi tujuan utama di `OnboardingWizard.tsx` dan `OnboardingOrganizationGate.tsx`.
- **Multi-Island Floating Workbench untuk `/workspace` (Opsi A)**:
  - Meningkatkan arsitektur panel `/workspace` menjadi Multi-Island Floating Workbench di mana Editor Canvas (`.workspace-center-panel`) dan AI Strategist Copilot (`.workspace-right-panel`) dirender sebagai kartu melayang terpisah (`rounded-2xl`, `border`, `shadow-xs`, `bg: var(--card)`).
  - Memisahkan panel dengan pembatas sela luar (*outer gap resize handle*) selebar `10px`, memperlihatkan background canvas luar (`#0b0b0a` pada Dark Mode) di antara panel untuk memberikan tampilan bernafas yang lega dan se-*clean* `/dashboard` serta `/settings`.
- **Tata Letak Modern Floating Island (Estetika VS Code Modern UI & Kimi)**:
  - Mentransformasikan shell workspace aplikasi menjadi arsitektur kartu melayang (*floating island*) modern dengan outer canvas padding (`10px`), gap spacing (`10px`), panel ber-sudut melengkung halus (`rounded-2xl` / `16px`), border lembut (`border border-[var(--border)]`), dan elevasi bayangan halus.
  - Panel sidebar dan wadah workspace utama kini dirender sebagai kartu melayang terpisah di atas background canvas luar, memberikan pemisahan visual yang jernih dan estetika aplikasi desktop modern.
- **Migrasi Raw Button Lengkap & Validasi Sistem Akhir (Phase 1-4 Selesai)**:
  - Mencapai 100% migrasi codebase dari elemen `<button>` mentah ke API `Button` kanonis (`@/components/ui/button`) dan polymorphic `render` prop di seluruh 41 berkas fitur pada `apps/frontend/src/`.
  - Mengunci primitive ownership dan kebijakan 0 raw button di seluruh repositori via test suite `PrimitiveStyleOwnership.test.ts` dan `ShellAndWorkspaceControls.test.ts` (144/144 test lulus).
  - Memverifikasi kompilasi produksi penuh (`npm run build`) untuk Next.js 16 frontend dan Express backend, ESLint bersih, zero TypeScript error (`npx tsc --noEmit`), dan `git diff --check` bersih.
  - Mengintegrasikan `@shadcn/message-scroller` pada Strategist Chat, menggantikan logika scroll manual dengan `MessageScrollerProvider`, `MessageScrollerViewport`, dan `MessageScrollerContent` sambil mempertahankan styling bubble custom serta menambahkan `ChatPositionIndicator` dan `TranscriptOutline` (menggunakan `useMessageScrollerVisibility` dan `useMessageScroller`).
- **API Status & Callout Kanonis**:
  - Menambahkan variant semantik `muted`, `surface`, `primary`, `success`, `warning`, dan `danger` yang dilindungi regression test pada Badge, beserta ukuran `xs` dan polymorphic rendering untuk link.
  - Menambahkan variant Alert semantik `primary`, `success`, `warning`, `danger`, dan `muted` dengan polymorphic rendering untuk surface beranimasi.
  - Memigrasikan seluruh komposisi langsung `ui-badge` dan `ui-alert` pada feature code ke primitive kanonis di readiness workspace, dashboard, billing/admin, sumber Strategist, serta state feedback/error.
  - Mengoreksi preset model dan kontrol ekspansi sumber yang interaktif dari tampilan badge menjadi semantik Button kanonis.
- **API Form Control Kanonis**:
  - Menambahkan variant `default` dan `surface` yang dilindungi regression test pada primitive `Input`, `Textarea`, dan `SelectTrigger`; `surface` mempertahankan kontrak visual filled `ui-control` selama migrasi inkremental.
  - Memigrasikan seluruh text field Support Form, field honeypot, dan kedua aksinya dari elemen mentah/class visual langsung ke API komponen kanonis.
  - Memigrasikan kontrol nama legal, NPWP, alamat, dan simpan pada Billing Details Form; sekaligus mengoreksi textarea alamat yang sebelumnya memakai styling legacy khusus input.
  - Memigrasikan General dan Defaults Settings ke input serta select trigger surface kanonis, sehingga kedua halaman tidak lagi menyusun class legacy control secara langsung.
  - Memigrasikan pencarian ledger Usage dan trigger bahasa Workflow, sambil sengaja mempertahankan checkbox auto-save native sebagai kontrol khusus.
  - Memigrasikan field kategori metadata Editor, tipe artikel, audiens, target panjang, dan instruksi penulisan ke kontrol surface kanonis, sambil mempertahankan canvas Markdown mentah sebagai kontrol milik editor.
  - Memigrasikan field teks AI Config, Audit Logs, dan Billing Admin ke kontrol surface kanonis; mengganti raw select admin terakhir dengan API Select adaptif sambil mempertahankan alur review dan konfirmasi operasi istimewa.
  - Memigrasikan instruksi revisi Final Draft, field aktivasi Onboarding, dan input sumber Feedback ke kontrol surface kanonis, sehingga feature code tidak lagi menyusun class form-control legacy secara langsung.
  - Memigrasikan seluruh kontrol text-like standar yang tersisa pada History, User Directory, rename sesi Strategist, edit link Bubble Menu, dan pembatalan subscription sambil mempertahankan keyboard inline, privileged form, serta boundary kontrol editor.
  - Menambahkan primitive Checkbox dan Switch berbasis Base UI serta boundary FileInput dengan native semantics; memigrasikan Notes, alasan pembatalan, Publication Identity, auto-save Workflow, tanggal Dashboard, dan Chat composer auto-resize, sehingga hanya exemption canvas Markdown Editor yang tetap mentah.
  - Mencatat inventaris raw field dan legacy control yang tersisa pada rencana arsitektur UI untuk memandu migrasi per fitur yang terukur.
- **API Button Kanonis**:
  - Mengonsolidasikan wrapper Base UI `Button` dan kontrak visual global `ui-btn` menjadi satu API komponen semantik dengan variant `primary`, `outline`, `surface`, `muted`, `accent`, `danger`, dan `link`.
  - Mempertahankan nama variant bergaya shadcn sebelumnya sebagai alias kompatibilitas, memigrasikan AI Preview serta consumer primitive yang sudah ada ke variant semantik, dan menambahkan regression test variant/size terfokus.
  - Memigrasikan seluruh delapan aksi Tiptap Bubble Menu ke API kanonis, mengisolasi toolbar dengan `not-prose`, serta mengekspos state aktif toggle format melalui `aria-pressed` beserta regression test terfokus.
  - Menghapus seluruh komposisi langsung `ui-btn` yang tersisa dari feature code pada area admin, settings, billing, workspace/editor, onboarding, strategist, history, dan feedback; menambahkan regression contract ownership berbasis source sambil mencatat inventaris raw button tersisa untuk tindak lanjut terukur.

### Fixed
- **Refactoring Arsitektur CSS & Perbaikan Reset Cascading**:
  - Menghapus nuclear reset (`* { border-color: transparent !important; }`), menggantikannya dengan reset cascade aman (`@layer base { * { @apply border-border outline-ring/50; } }`).
  - Mengurangi penggunaan `!important` di seluruh codebase CSS dari 113 menjadi 7 (penurunan 94%), mempertahankan `!important` hanya untuk override inline style bawaan library (`react-resizable-panels`).
  - Merefaktor style `.strategist-prose` (~45 `!important`) dan tabel `.prose` (~13 `!important`) menggunakan `@layer components` dan selector `:where()` tanpa spesifisitas tinggi.
  - Membagi codebase CSS monolitik menjadi 12 stylesheet modular berbasis domain di bawah `src/app/styles/components/` (`buttons.css`, `forms.css`, `cards.css`, `badges.css`, `menus.css`, `feedback.css`) dan `src/app/styles/workspace/` (`shell.css`, `sidebar.css`, `editor.css`, `strategist.css`, `chrome.css`, `responsive.css`), dengan `globals.css` sebagai master import manifest.
  - Menambahkan token elevasi semantik `--shadow-drawer` di `tokens.css`, memperbaik bayangan elevasi drawer mobile yang sebelumnya hilang.
  - Menyinkronkan deteksi resize JS `isMobile` (`< 768px`) dengan breakpoint tata letak mobile/tablet CSS.
- **Arsitektur Overlay Link Editor**:
  - Mengganti positioning manual berbasis bounding rectangle dan scroll offset dengan Base UI popover terkontrol yang langsung ditambatkan ke link yang sedang di-hover.
  - Merender overlay melalui portal dengan positioning fixed dan collision-aware, mengisolasinya dari typography artikel, serta memigrasikan kontrol edit, hapus, batal, simpan, dan input ke API komponen kanonis.
  - Menambahkan regression test yang mencegah kembalinya kalkulasi koordinat absolut atau kontrol overlay mentah.
- **Boundary Style UI Editor**:
  - Mengisolasi kontrol AI Preview dari typography artikel Tiptap menggunakan boundary `not-prose`, sambil mempertahankan rendering heading, link, tabel, dan kode Markdown pada area konten sibling.
  - Menghapus workaround warna inline tombol Accept/Reject dan override global dark `.prose a` yang memakai `!important`.
  - Menambahkan token semantik light/dark `--editor-link` yang terhubung ke variabel link normal dan inverted Tailwind Typography, beserta regression contract terfokus.
- **Perbaikan Async Guard Clerk Middleware (`proxy.ts`)**:
  - Menambahkan `await` yang hilang pada ketiga pemanggilan `auth.protect()` di dalam `clerkMiddleware` pada `src/proxy.ts` (baris 88, 108, 112). Di `@clerk/nextjs` v7+, `auth.protect()` bersifat async; tanpa `await`, promise-nya tidak ditunggu dan menyebabkan `unhandledRejection: Error: NEXT_REDIRECT` muncul di konsol dev, bahkan pada request yang berhasil dari pengguna yang sudah login.

## [3.13.0] - 2026-07-19

### Added
- **Pengujian Gemini dengan Kontrol Biaya**:
  - Menambahkan kebijakan request Gemini bersama untuk inference Standard/Flex yang bersifat opt-in pada bentuk panggilan GenerateContent dan Interactions API.
  - Menambahkan timeout Flex 15 menit yang dapat dikonfigurasi serta bounded exponential backoff khusus kegagalan kapasitas `429`/`503`, tanpa fallback otomatis ke traffic Standard berbiaya penuh.
  - Menambahkan guard staging eksplisit yang menghapus Google Search grounding dengan tagihan terpisah dan memblokir Deep Research sebelum kredit dipotong.
  - Menambahkan regression test untuk forwarding service tier, batas retry, konfigurasi timeout, dan telemetry harga yang memahami Flex.
- **Kontrak Publikasi & Kebijakan Visual**:
  - Menambahkan kontrak `workingTitle`, `PublicationPackage`, dan `publicationPackageStatus` (`not_generated`, `current`, `stale`) pada tipe shared, persistensi analisis, pemulihan history, dan validasi export.
  - Menambahkan `VisualFormatSelectionPolicyNode` reusable yang menjadikan prosa sebagai default dan hanya memilih Mermaid, tabel, numbered list, atau bullet jika struktur sumber memang membutuhkannya.
  - Menambahkan regression test untuk body CMS tanpa H1, semantik title Fast/Publish, ringkasan visual tidak aman, keamanan feedback field publikasi, serta penanganan akronim API/KPI.
- **Infrastruktur Keamanan & Ledger**:
  - Menambahkan `safe-url-fetch.ts` untuk memvalidasi target HTTP(S), menolak URL berkredensial serta alamat IPv4/IPv6 privat/lokal, mengikat socket ke hasil DNS tervalidasi, menerapkan policy outbound host/port/ukuran/timeout, dan memvalidasi ulang setiap redirect sebelum outbound fetch.
  - Menambahkan HTTP rate limiter atomic berbasis Redis yang digunakan lintas instance aplikasi, dengan namespace terisolasi untuk traffic Strategist dan autosave History.
  - Menambahkan `serializable-transaction.ts` untuk menjalankan write ledger kredit dengan isolasi serializable dan retry konflik write yang terbatas.
  - Menambahkan regression test SSRF untuk loopback, jaringan privat, cloud metadata, IPv6, URL berkredensial, dan protokol yang tidak didukung.

### Changed
- **Pipeline Publish Ready**:
  - Memindahkan pembuatan Publication Package sebelum Final Quality Gate agar gate mengaudit canonical CMS title dan metadata bersama body artikel tanpa H1.
  - Menjadikan Fast mode content-only sambil mempertahankan working title hasil ekstraksi untuk preview dan download.
  - Membuat finding field publikasi menargetkan metadata secara eksplisit, bukan menyisipkan H1 Markdown ke body artikel.
  - Menambahkan kontrak panjang SEO spesifik tenant ke prompt SEO dan membatasi rewrite Fast hanya pada fakta, entitas, metrik, contoh, serta relasi visual yang tersedia di sumber.
  - Menormalisasi heading Markdown yatim agar section utama body memakai H2 dan H3 hanya muncul di bawah H2 yang sudah ada.
- **Boundary Request AI & Pemakaian Kredit**:
  - Mengaktifkan validasi Zod runtime untuk Analyze, Strategist Chat, Generate Plan, Quick Draft, Draft From Notes, dan payload lampiran sebelum stream dibuka atau resource AI digunakan.
  - Menghapus pemilihan provider AI oleh client pada Analyze dan Quick Draft; provider kini mengikuti konfigurasi server/workspace.
  - Menambahkan throttling request, batas pemakaian demo, pemeriksaan kredit user terautentikasi, analysis logging, dan pemotongan kredit pada alur pembuatan draft Strategist.
  - Membuat pemotongan kredit bersifat serializable dan menolak saldo tidak cukup alih-alih menulis transaksi fallback yang dapat menghasilkan saldo ledger negatif.

### Fixed
- **Akurasi Harga & Telemetry Gemini**:
  - Mengganti harga Gemini lama pada Prompt Inspector dengan tarif terbaru Gemini 3.5 Flash dan Gemini 3.1 Flash-Lite.
  - Menambahkan service tier Gemini aktif ke telemetry tiap tahap dan menerapkan diskon Flex 50% pada estimasi Prompt Inspector serta telemetry tersimpan.
  - Memperpanjang timeout onboarding saat memakai Flex agar race lokal 10 detik tidak lagi membatalkan request yang sah ketika menunggu antrean Flex.
- **Konsistensi Title, Metadata & Visual**:
  - Mencegah Final Quality Gate melaporkan H1 hilang ketika field title CMS tersedia atau ketika Fast mode memang tidak membuat metadata publikasi.
  - Menandai metadata publikasi stale setelah targeted fix, apply suggestion, atau mutasi source link; package stale dan body yang berbeda dari versi tersimpan kini diblokir dari export CMS.
  - Merekonsiliasi ringkasan perubahan Quality Gate agar diagram atau tabel unsupported tidak sekaligus dipuji sebagai improvement, serta mencegah akronim umum API/KPI salah diklasifikasikan sebagai entitas baru.
  - Mengganti pemotongan karakter keras dengan pemotongan metadata pada batas kata dan kalimat sehingga tidak lagi menghasilkan potongan seperti `Infrast`, `AI Citat`, atau meta description yang menggantung.
  - Mencegah hasil Publish Ready dengan frasa metadata menggantung berstatus ready, tanpa salah menandai akronim terminal yang valid seperti `AI`.
  - Memperketat pemilihan visual agar koleksi singkat tetap berupa list/tabel dan tidak rutin diubah menjadi Mermaid.
  - Memulihkan title feedback mode Fast dari `workingTitle` ketika Publication Package memang tidak dibuat.
  - Memvalidasi plan Strategist setelah parsing JSON dan mengambil hanya bagian Draft artikel ketika model mengembalikan payload Blueprint komposit.
- **Keamanan Tenant & Jaringan**:
  - Mewajibkan ownership user sebelum memperbarui sesi Strategist atau menambahkan pesan chat, termasuk memblokir session ID yang dipasok guest.
  - Membatasi endpoint Prompt Inspector dan prompt diff hanya untuk owner platform yang dikonfigurasi.
  - Melindungi alur Strategist dan authenticated scrape dari SSRF jaringan privat serta redirect yang tidak aman.
- **Integritas Streaming & State Frontend**:
  - Menghentikan pipeline Analyze, Refine, Quick Draft, dan Draft From Notes agar tidak melanjutkan Quality Gate, SEO, logging, atau billing setelah client disconnect.
  - Mencegah Targeted Fix menyelesaikan feedback ketika target text tidak ditemukan, memulihkan seluruh snapshot analisis setelah refine dibatalkan/gagal, dan menghapus placeholder chat usang saat cancellation.
  - Mereset pagination User Directory ketika filter berubah, membersihkan error yang dapat dipulihkan saat retry, dan mengabaikan respons fetch lama yang datang tidak berurutan.
  - Menambahkan kontrak deadline request frontend dan backend bersama, cancellation yang terlihat user untuk seluruh aksi AI panjang, pembatalan stream reader sekaligus fetch saat idle timeout, polling Deep Research tanpa overlap, serta lifecycle assistant eksplisit agar kegagalan jaringan/provider tidak meninggalkan loading tanpa batas.
  - Meneruskan disconnect client melalui lifecycle request Express, request runtime AI, waktu tunggu retry Gemini Flex, dan transport SDK Gemini/Groq/OpenRouter sehingga request yang ditinggalkan menghentikan pekerjaan provider aktif, bukan hanya melewati tahap pipeline berikutnya.
- **Telemetri AI & Tipe Provider**:
  - Memperbaiki perhitungan reasoning token Gemini agar tidak terhitung ganda dan menambahkan harga model default OpenRouter `openai/gpt-4o-mini`.
  - Memulihkan export tipe mapper kompatibel-Groq dan mengganti cast telemetry targeted-fix yang tidak aman dengan collector sebenarnya.

## [3.12.2] - 2026-07-18

### Fixed
- **Kontrak Transport Structured Output**:
  - Memulihkan penerusan `responseMimeType` dan `responseJsonSchema` Gemini pada jalur provider non-streaming yang digunakan Final Quality Gate dan pembuatan metadata SEO.
  - Memulihkan penerusan `response_format: { type: "json_object" }` untuk request Groq dan OpenRouter streaming maupun non-streaming.
  - Mengganti field request khusus-review `_reviewJsonSchema` dengan kontrak netral-stage `responseJsonSchema`.
- **Pemulihan Quality Gate & Cakupan Regresi**:
  - Menormalisasi feedback string dan flag object yang salah format menjadi output manual-review yang aman, serta menambahkan instruksi koreksi schema eksplisit pada percobaan kedua.
  - Menambahkan test regresi transport provider dan Quality Gate untuk mismatch tipe `feedback`/`flags` yang persis terjadi di staging.
- **Keamanan & Persistensi Feedback Preview**:
  - Menyatukan kelayakan tombol Apply per kartu dan massal dengan kontrak editorial bersama; feedback manual, verifikasi, sudah selesai, dan suggestion-only tidak lagi dapat di-auto-apply.
  - Menyimpan status feedback yang telah diterapkan beserta polished draft ke riwayat analisis agar perubahan tidak hilang setelah reload dan tidak dapat diterapkan berulang kali.
  - Menghapus aksi “Mark Verified” tanpa bukti; Add Source kini mewajibkan URL HTTP(S) valid, menunggu persistensi, mencegah nested Markdown link, dan tidak pernah menambahkan verification notes internal ke konten publikasi.
  - Memperbaiki preview insert-before/after, identitas/reset state feedback, toggle kartu aktif, jumlah Apply All, serta loading guard async.
  - Menambahkan regression test frontend untuk kelayakan auto-apply, readiness, keamanan URL sumber, dan perilaku Markdown link.
- **Test Grounding Deterministik**:
  - Mengganti ketergantungan pada redirect Vertex grounding live dengan respons redirect mock sambil menguji utility produksi secara langsung.
- **Metadata Rilis & Arsitektur**:
  - Menyinkronkan versi package workspace dan metadata lockfile ke `3.12.2`.
  - Menyelaraskan panduan backend dengan provider-native thinking; chain-of-thought manual tidak lagi diminta atau disimpan dalam schema JSON editorial.

## [3.12.1] - 2026-07-18

### Fixed
- **Validasi Zod & Normalisasi Fallback Quality Gate**:
  - Menyelaraskan batasan array `changes` pada `FinalQualityGateResponseSchema` di `@eai/shared` dari `.min(2)` menjadi `.min(1).max(5)` agar perbaikan terfokus dengan 1 poin perubahan tidak lagi memicu `ZodError` (`expected array to have >=2 items`).
  - Memperkuat `normalizeFinalQualityGateResponseCandidate` dengan penambahan fallback otomatis `['Processed draft according to editorial brief.']` jika array `changes` dari LLM kosong, serta pemangkasan array berukuran lebih (`changes` > 5, `feedback` > 5, `flags` > 3).
- **Aksi Feedback & Keamanan Tombol Apply**:
  - Menghapus fallback berbahaya di `useEditorialWorkspace.ts` yang menambahkan teks saran langsung ke akhir draf artikel saat `targetText` kosong.
  - Mengubah tombol tindakan di `FeedbackItemCard.tsx` untuk item saran tanpa `targetText` dari "Apply Suggestion" menjadi **"Copy Suggestion"** guna mencegah korupsi teks draf.

## [3.12.0] - 2026-07-18

### Changed
- **Refaktor Komponen Frontend `FeedbackPanel` Monolitik**: Merefaktor `apps/frontend/src/components/FeedbackPanel.tsx` (44KB) menjadi sub-sistem modular di bawah `src/components/feedback-panel/`:
  - `types.ts`: Antarmuka TypeScript terisolasi (`FeedbackPanelProps`, `VerificationBadgeConfig`).
  - `hooks/useFeedbackActions.ts`: Custom hook mengelola aksi quick-fix, targeted fix, mark verified, add source, dan status copy toast.
  - `components/FeedbackItemCard.tsx`: Komponen khusus kartu item feedback, badge verifikasi, dan tombol tindakan.
  - `components/QualityGateSummary.tsx`: Header ringkasan skor readiness Quality Gate, alert mode, dan aksi kelompok.
  - `FeedbackPanel.tsx`: Facade shell ramping (< 100 LOC) menjaga kompatibilitas 100%.
- **Refaktor Komponen Frontend `StrategistTab` Monolitik**: Merefaktor `apps/frontend/src/components/StrategistTab.tsx` (40KB) menjadi sub-sistem modular di bawah `src/components/strategist-tab/`:
  - `types.ts`: Antarmuka TypeScript terisolasi untuk sesi chat dan props (`StrategistTabProps`).
  - `hooks/useStrategistChat.ts`: Custom hook mengelola unggah lampiran, state rename sesi, dan kontrol input chat.
  - `components/SessionSidebar.tsx`: Komponen khusus sidebar riwayat sesi percakapan (pin, rename, delete).
  - `components/ChatMessageList.tsx`: Komponen renderer list pesan teroptimasi yang mencegah re-render berlebih saat streaming SSE.
  - `components/ChatInputBar.tsx`: Komponen bar input chat khusus pendukung toggle search, lampiran file, dan mode riset.
  - `StrategistTab.tsx`: Facade shell ramping (< 100 LOC) menjaga kompatibilitas 100%.

### Added
- **Perluasan Unit Test Backend**:
  - `apps/backend/src/lib/__tests__/chat-billing.test.ts`: Cakupan unit test untuk pemeriksaan kredit (`checkCreditsRemaining`) dan pemotongan saldo bucket (`deductCredits`).
  - `apps/backend/src/lib/__tests__/user-workspace.test.ts`: Cakupan unit test untuk resolusi konteks organisasi (`toClerkOrganizationContext`) dan inisialisasi user record (`ensureCurrentUserRecord`).

## [3.11.0] - 2026-07-18

### Changed
- **Refaktor Rute Strategist Monolitik (`apps/backend/src/routes/strategist/index.ts`)**: Merefaktor berkas rute strategist monolitik 61KB / 1.566 LOC ke dalam struktur folder modular bertipe ketat `apps/backend/src/routes/strategist/` dengan **Zero Logic Change**:
  - `types.ts`: Skema validasi Zod terisolasi (`ChatInputSchema`, `GeneratePlanSchema`, `GenerateDraftFromNotesSchema`, `QuickDraftSchema`) dengan tipe TypeScript yang diturunkan via `z.infer`.
  - `utils/grounding.ts`: Helper resolusi URL Google Grounding & sanitizer kebocoran link (`resolveGroundingUrl`, `sanitizeGroundingLeaks`, `fetchWithTimeout`).
  - `utils/helpers.ts`: Helper resolusi organisasi (`resolveInternalOrgId`), URL scraper, rate limiter, soft auth, dan konstanta prompt.
  - `handlers/chat.ts`: Handler HTTP SSE streaming untuk chat AI Strategist interaktif, pemotongan kredit billing, dan pencarian grounding.
  - `handlers/plan.ts`: Handler HTTP pembuatan AI Blueprint Plan (`POST /generate-plan`).
  - `handlers/draft-from-notes.ts`: Handler NDJSON stream pembuatan draf dari catatan riset (`POST /generate-draft-from-notes`).
  - `handlers/sessions.ts`: Handler HTTP CRUD riwayat sesi percakapan (`GET /sessions`, `GET /sessions/:id`, `DELETE /sessions/:id`).
  - `index.ts`: Entrypoint router Express terpadu dengan kompatibilitas penuh.

## [3.10.0] - 2026-07-18

### Changed
- **Refaktor Rute Admin Monolitik (`apps/backend/src/routes/admin.ts`)**: Merefaktor berkas 38KB rute admin monolitik ke dalam folder modular `apps/backend/src/routes/admin/` dengan pemisahan tanggung jawab yang jelas (Zero Logic Change):
  - `types.ts`: Mengisolasi skema validasi Zod (`AdjustmentSchema`, `OverridePlanSchema`, `UserCreditAdjustmentSchema`, `AiConfigSchema`, `AuditLogSchema`).
  - `utils.ts`: Helper otorisasi admin (`getAdminContext`, `getActor`).
  - `handlers/`: Handler HTTP spesifik sub-domain (`users.ts`, `organizations.ts`, `editorial-profiles.ts`, `audit-logs.ts`).
  - `index.ts`: Re-export router Express terpadu untuk kompatibilitas penuh.
- **Refaktor Komponen UserDirectory Monolitik (`apps/frontend/src/components/UserDirectory.tsx`)**: Merefaktor komponen frontend 73KB ke dalam struktur modular di bawah `src/components/user-directory/`:
  - `types.ts`: Interface TypeScript terpadu (`DirectoryUser`, `PaginationMeta`, `UserDetailsData`).
  - `hooks/useUserDirectory.ts`: Custom hook facade mengelola state direktori, pencarian, filter, paginasi, dan aksi API.
  - `components/`: Sub-komponen UI terisolasi (`UserTable.tsx`, `UserActionMenu.tsx`).
  - `CreditAdjustmentModal.tsx` & `OrganizationDetailDrawer.tsx`: Pemuatan dinamis (lazy loading) via Next.js `dynamic()` untuk mengoptimalkan ukuran bundle awal.
  - `UserDirectory.tsx`: Komponen facade ringkas (< 100 LOC).
- **Pembersihan Backend & Hardening Error Handler**:
  - Memindahkan skrip tes standalone (`test_*.js`, `test_*.ts`) ke folder `apps/backend/src/__tests__/scripts/` dan memperbarui jalur import terkait.
  - Memperketat error handler global pada `apps/backend/src/server.ts` untuk menyembunyikan detail pesan error internal saat berjalan pada mode produksi.

## [3.9.0] - 2026-07-18

### Added
- **Atribut Prioritas Node Prompt**: Menambahkan properti `priority?: number` opsional (skala 1-5, dengan 1 = Mandatory/Utama dan 5 = Optional/Dapat dipangkas) pada interface `PromptNode` dan kelas `CompositePromptNode` di `@eai/shared`.
- **Renderer Formal Prompt**: Membuat kelas `PromptRenderer` di bawah `apps/backend/src/lib/ai/prompt-engine/renderer.ts` untuk pembersihan whitespace terstandarisasi, normalisasi baris baru, dan validasi pembatas tag XML.
- **Serializer AST Prompt Dua Arah**: Membuat kelas `PromptSerializer` di bawah `apps/backend/src/lib/ai/prompt-engine/serializer.ts` untuk mengubah pohon AST `PromptNode` ke format JSON dan merekonstruksi kembali instance AST runtime dari JSON.
- **Optimizer Pemotongan Node (Pruning)**: Membuat kelas `PromptPruningOptimizer` di bawah `apps/backend/src/lib/ai/prompt-engine/pruning-optimizer.ts` yang memotong node opsional (prioritas 5 hingga 2) secara otomatis ketika estimasi token prompt melebihi alokasi budget token model LLM.
- **Cakupan Pengujian Sub-sistem Prompt Engine**: Membuat suite pengujian unit untuk `PromptRenderer`, `PromptSerializer`, dan `PromptPruningOptimizer` dengan tingkat kelulusan 100% pada 50 total unit test backend.

## [3.8.0] - 2026-07-17

### Added
- **Estimator Token Prompt**: Memperkenalkan `PromptTokenEstimator` di bawah `src/lib/ai/prompt-engine/` yang mendukung estimasi token offline tertimbang karakter (XML tags ~3.5 karakter/token vs plain text ~4.2 karakter/token) serta kalkulasi token online.
- **Cache Perhitungan Token Online**: Mengintegrasikan in-memory cache SHA-256 dengan TTL 30 menit untuk membungkus pemanggilan API `countTokens` spesifik provider guna mengurangi latency jaringan secara drastis.
- **Planner Cache Prompt**: Menambahkan `PromptCachePlanner` untuk menelusuri node AST prompt, memetakan token statis vs dinamis, memverifikasi urutan struktur prompt, dan menghitung persentase efisiensi caching.
- **Optimizer Cache Prompt**: Membuat `PromptCacheOptimizer` untuk memberikan saran perbaikan posisi node yang melanggar aturan prefix caching (misal node statis diletakkan setelah node dinamis) serta memperingatkan jika prefix statis di bawah batas minimal provider (misal 32.768 token pada Gemini).
- **API Developer Console Prompt Inspector**: Memasang endpoint `POST /api/prompt-inspector/` dan `/diff` di bawah `routes/prompt-inspector.ts`:
  - `/`: Mengembalikan representasi pohon visual AST, teks hasil render, rincian token per node, laporan cache planner & optimizer, serta estimasi biaya transaksi.
  - `/diff`: Melakukan analisis komparatif token, efisiensi cache, serta perbedaan (delta) node breakdown antara dua konfigurasi.
  - Mendukung simulasi konteks workspace database via `workspaceId`.
- **Kontrak Kompilasi AST Composer**: Menambahkan metode `.compile()` pada 5 komposer prompt utama (`SeoPromptComposer`, `ReviewPromptComposer`, `RewritePromptComposer`, `RefinementPromptComposer`, `QualityGatePromptComposer`) yang mengembalikan struktur pohon AST.
- **Unit Test Suite Terintegrasi**: Membuat file pengujian unit baru berbasis Vitest di bawah `src/lib/ai/prompt-engine/__tests__/` dan `src/lib/ai/__tests__/` untuk memverifikasi fungsionalitas estimator, planner, optimizer, serta integrasi route handler.

## [3.7.0] - 2026-07-17

### Added
- **Abstraksi Penyedia Layanan AI (AI Provider Abstraction)**: Menggantikan logika pencabangan SDK yang tersebar dengan satu interface `AIProvider` terpadu yang berbasis kemampuan (capability-driven) di bawah `src/lib/ai/providers/`:
  - `interface.ts`: Mendefinisikan tipe data kontrak `AIProvider`, `StreamChunk` (normalized delta + usage), `StreamRequest`, `GenerateResult`, dan `ProviderCapabilities`.
  - `registry.ts`: Menyediakan pabrikasi `getProvider()` yang mengembalikan singleton untuk `'gemini'`, `'groq'`, dan `'openrouter'`.
  - `gemini/`: GeminiProvider membungkus `@google/genai` dengan custom stream generator, pemetaan output, dan konfigurasi level thinking.
  - `openrouter/`: OpenRouterProvider membungkus SDK `openai` yang dipetakan ke endpoint OpenRouter.
  - `groq/`: GroqProvider membungkus `groq-sdk` dengan berbagi logika pemetaan OpenAI-compatible yang sama.
- **Sub-sistem Model Router**: Mengkonsolidasikan aturan perutean editorial ke dalam `lib/ai/model-router.ts`:
  - `resolveModel()`: Memetakan peran editorial dan tingkat kecepatan analisis ke model optimal berdasarkan konteks penyedia layanan AI.
  - `resolveOutputLimit()`: Menstandarkan batas token maksimum respons model berdasarkan mode standar, kompak, maupun fallback manual.
- **Runtime Telemetry Terpusat**: Memperkenalkan orkestrator terpadu di `src/lib/ai/runtime/`:
  - `executeStream()`: Mengiterasi stream ternormalisasi, mengumpulkan metrik penggunaan (usage) di chunk terakhir, dan mencatat data telemetry secara otomatis.
  - `executeGenerate()`: Mengeksekusi pemanggilan generate non-streaming dan mengorkestrasi pencatatan telemetry.
- **Integrasi Test Suite Backend**: Mengonfigurasi `vitest` pada workspace backend dan menulis pengujian unit untuk memvalidasi:
  - `providers/__tests__/contract.test.ts`: Profil kapabilitas penyedia layanan AI dan kesesuaian kontrak antarmuka (interface).
  - `runtime/__tests__/execute-stream.test.ts` & `execute-generate.test.ts`: Orkestrasi pengiriman telemetry serta pemetaan chunk stream dengan bantuan mock `FakeAIProvider`.
  - `__tests__/review-stage.test.ts`: Jalur eksekusi retry dan fallback kompak pada kegagalan parsing.

### Changed
- **Penyederhanaan Handler & Stage (Zero Logic Change)**: Merefaktor file stage (`review-stage.ts`, `quality-gate-stage.ts`, `seo-stage.ts`, `targeted-fix-stage.ts`) serta handler (`analyze.ts`, `refine.ts`) agar menggunakan registry `AIProvider` dan orkestrator runtime baru, menyederhanakan kode transport bercabang banyak menjadi alur eksekusi bersih yang provider-agnostic.
- **Pembersihan & Deprekasi**: Menghapus berkas stub placeholder lama di `routes/analyze/providers/*` dan menandai fungsi/klien lama di `provider-runtime.ts` sebagai `@deprecated` seraya mempertahankan kompatibilitas penuh untuk endpoint strategist dan onboarding.

## [3.6.0] - 2026-07-17

### Changed
- **Pecah Komponen EditorialWorkspace (Zero Logic / UI Change)**: Merefaktor komponen frontend monolitik 88KB `EditorialWorkspace.tsx` ke dalam framework custom hook React yang modular dan strictly-typed di bawah folder domain terdedikasi `src/workspace/`:
  - `useEditorialWorkspace.ts`: Berfungsi sebagai facade orchestrator hook yang mendelegasikan state management, konfigurasi workspace, pintasan keyboard, dan aksi jaringan ke sub-hooks.
  - `types.ts`: Menentukan tipe data TS strictly-typed untuk semua properti, state, dan aksi tertunda untuk menjamin keamanan tipe data.
  - `constants.ts`: Mengisolasi aset statis bawaan seperti teks demo Bahasa Inggris dan Bahasa Indonesia.
  - `utils.ts`: Mengumpulkan helper murni untuk parsing metadata, pengecekan ketersediaan domain (missing sources), readiness gerbang kualitas, dan verifikasi domain rujukan.
  - `hooks/`: Membagi logika subsystem inti menjadi hooks yang lebih spesifik:
    - `useWorkspaceStorage.ts`: Mengelola sinkronisasi dua arah, pemulihan state, dan backup preferensi workspace dengan local & session storage.
    - `useWorkspaceConfig.ts`: Mengambil parameter tenant workspace, daftar kategori, dan default metadata.
    - `useWorkspaceKeyboard.ts`: Menstandarkan pintasan keyboard global (`?` untuk manual bantuan, `Cmd+B` / `Ctrl+B` untuk sidebar toggle) dan pengecekan ukuran viewport.
    - `useWorkspaceAutosave.ts`: Mengimplementasikan autosave cloud debounced untuk mengamankan riwayat draf ke database.
    - `useWorkspaceStreaming.ts`: Mengelola buffer data streaming, progress stage, dan batching render requestAnimationFrame untuk mencegah lag UI.
  - `actions/`: Mengekstrak panggilan streaming API dan efek samping ke fungsi yang terisolasi dan mudah diuji:
    - `analyze.ts`: Koordinator stream polish & rewrite.
    - `refine.ts`: Alur refine dan eksekusi instruksi kustom.
    - `targetedFix.ts`: Perbaikan parsial kalimat dan struktur klaim.
    - `strategist.ts`: Pembuatan blueprint tulisan dan draf awal asisten strategist dari catatan riset.
- **Integrasi Unit Testing Frontend**: Memasang `vitest` pada workspace frontend, menambahkan konfigurasi alias resolver di `vitest.config.ts`, serta menulis pengujian unit di folder `src/workspace/__tests__/` untuk memvalidasi:
  - Helper utilitas (ekstraksi metadata, missing domain check, kalkulasi readiness).
  - Orkestrasi aksi (edge cases executeAnalyze dengan mock context payload).

## [3.5.0] - 2026-07-17

### Changed
- **Pecah Rute Monolitik analyze.ts (Zero Logic Change)**: Merefaktor file monolitik 82KB `analyze.ts` di `apps/backend/src/routes/analyze.ts` ke dalam subfolder terstruktur dan modular di `src/routes/analyze/` dengan pembagian tanggung jawab yang jelas:
  - `controller.ts`: Mengorkestrasi pemeriksaan pra-flight request, autentikasi (validasi Clerk JWT), validasi status workspace user, serta inisialisasi stream SSE dan heartbeat keep-alive.
  - `types.ts`: Mendefinisikan tipe data, interface, dan konstanta tingkat transport bersama.
  - `utils/`: Memecah 40+ fungsi pembantu ke dalam modul utilitas domain yang spesifik:
    - `signals.ts`: Mendeteksi sinyal faktual dan indikator sitasi/rujukan dalam teks.
    - `factual.ts`: Melakukan sanitasi dan netralisasi masukan feedback review editorial.
    - `verification.ts`: Melakukan injeksi pengunci verifikasi klaim data faktual beserta anotasi.
    - `text.ts`: Mengelola pemotongan segmen artikel (chunking), helper pencatatan metadata log, serta pencocokan tautan internal terkait.
    - `markdown.ts`: Membersihkan tabel Markdown, artefak heading kosong, dan adapter stream OpenAI.
  - `handlers/`: Mengisolasi jalur eksekusi stage ke dalam sub-handler khusus:
    - `analyze.ts`: Menjalankan tahapan inti review serta pemolesan/penulisan ulang chunk draf untuk endpoint Gemini dan OpenAI-compatible.
    - `refine.ts`: Mengatur alur refinement berulang (*iterative refinement*) dengan validasi skema Zod, evaluasi gerbang kualitas (Quality Gate) akhir, dan pembuatan SEO.
    - `fix-targeted.ts`: Menjalankan perbaikan parsial paragraf/kalimat tertentu yang ditargetkan.
    - `dev-mock.ts`: Menyediakan stream data simulasi (mock) lokal apabila API key penyedia AI tidak terdeteksi.
  - `providers/`: Menambahkan berkas stub placeholder untuk Gemini, Groq, dan OpenRouter sebagai persiapan abstraksi penyedia AI di Sprint 2.
  - `index.ts`: Melakukan re-export router untuk menjaga kompatibilitas penuh dengan `server.ts` tanpa mengubah kode import di dalamnya.
- **Isolasi Service Log Analisis**: Mengekstrak fungsi `createAnalysisLogAndDebitCredit` menjadi domain service mandiri di `src/lib/services/analysis-log.service.ts` untuk mengelola operasi database Prisma, alur alokasi bucket kredit, dan metrik telemetri secara independen dari controller rute.

## [3.4.0] - 2026-07-16

### Added
- **Composable Prompt Component Architecture (PCA)**: Memperkenalkan mesin penyusunan prompt modular berbasis AST di folder `packages/shared/src/prompt-engine` dan `apps/backend/src/lib/ai/prompt-engine/`.
- **Core dan Tenant Prompt Nodes**: Memisahkan instruksi statis platform ke dalam node Core independen (`EditorialMissionNode`, `MarkdownRulesNode`, `VerificationLockNode`, `LanguagePolicyNode`, `TemporalContextNode`, `StrictnessConstraintNode`, `InputBoundaryNode`, dan `OutputSchemaNode`) serta konfigurasi workspace dinamis ke dalam node Tenant (`BrandIdentityNode`, `ToneCalibrationNode`).
- **SeoPromptComposer**: Mengimplementasikan komposer pilot pertama untuk menyusun prompt SEO metadata secara terstruktur dari komponen-komponen node.
- **ReviewPromptComposer**: Menambahkan komposer prompt review multi-peran yang fleksibel untuk mendukung peran author, editor, seo (feedback saran), fact-checker, dan mode polish (diagnosa transformasi).
- **RewritePromptComposer**: Memperkenalkan komposer prompt rewrite yang komprehensif untuk menangani demonstrasi few-shot, panduan prioritas, batasan editorial, smart internal linking (artikel terkait), dan aturan pemotongan tulisan (chunking).
- **RefinementPromptComposer**: Memperkenalkan komposer prompt refinement untuk penyuntingan draf parsial, mendukung tahapan Iterative Refinement dan Targeted Fixes dengan guardrail refinement fakta serta pembatasan format output.
- **QualityGatePromptComposer**: Memperkenalkan komposer prompt Quality Gate untuk mengevaluasi kualitas, perubahan, kelayakan, dan risiko draf akhir artikel.
- **StrategistPromptComposer**: Menambahkan komposer prompt Strategist untuk menangani pembuatan draf kasar dan outline terstruktur secara modular dengan integrasi aturan press release.
- **StrategistChatComposer**: Menambahkan komposer prompt obrolan strategist untuk memandu interaksi brainstorming interaktif, analisis data lalu lintas, audit halaman, dan asisten riset.
- **StrategistBlueprintComposer**: Menambahkan komposer prompt blueprint untuk menyusun rencana editorial terperinci (angle, hook, target audiens, dan outline) serta draft awal artikel berbasis structured output.
- **DraftFromNotesComposer**: Menambahkan komposer prompt penyusunan draf dari catatan riset/blueprint secara instan dengan penerapan model kognitif (IDENTIFY -> EXTRACT -> EXPAND).
- **StrategistFastModeInstructionNode**: Menambahkan node baru untuk menangani instruksi sistem khusus Fast Mode pada asisten strategist secara modular dan testable.
- **Indikator Berpikir Real-Time (Thinking Indicator)**: Menambahkan dukungan SSE untuk meneruskan dan menampilkan teks penalaran (thought_summary delta) dari Gemini 3.x secara real-time di UI obrolan Strategist.

### Changed
- **Optimasi Prompt Strategist**: Merefaktor node asisten strategist (`StrategistSystemRoleNode`, `StrategistGeneralConstraintsNode`, `StrategistExamplesNode`, `StrategistToolGuidelinesNode`, `DraftFromNotesConstraintsNode`, `StrategistBlueprintInstructionNode`) untuk menambahkan behavioral anchors, validasi tanggal dinamis (`context.today`), aturan trigger web search, dan fallback error, serta menghilangkan CoT manual yang konflik dengan mode native Gemini.
- **Pembersihan Logika Chat Stream Strategist**: Menghapus mesin parser filter tag `<thinking>` (~75 baris) dari route handler `/chat` strategist backend dan menggantinya dengan stream filter sederhana berbasis native events.
- **Penyelarasan Tipe SSE Event**: Menyelaraskan stream parser frontend di `useContentStrategist` agar mendukung tipe data `text` dan `chunk` secara konsisten pada penulisan ulang draft.
- **Refaktorisasi SEO Stage**: Merefaktor `runSeoStage` dan `analyze.ts` untuk menggunakan `SeoPromptComposer` baru dalam menghasilkan prompt, mengoptimalkan blok instruksi statis agar Gemini prompt caching bekerja maksimal.
- **Refaktorisasi Review Stage**: Merefaktor `runEditorialReviewStage` dan `analyze.ts` untuk menggunakan `ReviewPromptComposer` baru sebagai pengganti fungsi `getPolishReviewPrompt` dan `getPromptForRole` lama.
- **Refaktorisasi Rewrite Stage**: Merefaktor proses penulisan ulang draf di `analyze.ts` agar menggunakan `RewritePromptComposer` baru sebagai pengganti fungsi `getPolishedDraftPrompt` lama.
- **Refaktorisasi Refinement Stage**: Merefaktor tahapan penyuntingan berulang (*iterative refinement*) dan perbaikan target teks (*targeted fix*) di `analyze.ts` dan `targeted-fix-stage.ts` agar menggunakan `RefinementPromptComposer` baru sebagai pengganti fungsi `getIterativeRefinementPrompt` dan `getTargetedFixPrompt` lama.
- **Refaktorisasi Quality Gate Stage**: Merefaktor evaluasi gerbang kualitas akhir pada `quality-gate-stage.ts` untuk menggunakan `QualityGatePromptComposer`.
- **Refaktorisasi Strategist Stage**: Merefaktor pembuatan draf kasar dan outline terstruktur pada `quick-draft.ts` untuk menggunakan `StrategistPromptComposer`.
- **Pembersihan Prompts Monolitik**: Menyederhanakan `prompts.ts` dengan menghapus seluruh fungsi pembuat prompt usang, menyisakan variabel sistem dan utilitas zona waktu/tanggal bersama.

## [3.3.0] - 2026-07-14

### Added
- **Demonstrasi Rewrite Few-Shot**: Menambahkan demonstrasi rewrite dan penerjemahan few-shot dengan langkah penalaran eksplisit pada instruksi sistem `getPolishedDraftPrompt` untuk memandu transformasi gaya tulisan model dan menghilangkan klise AI.
- **Struktur Penalaran Chain-of-Thought (CoT)**: Menerapkan skema penalaran tiga langkah (`CORE DISCOVERY`, `TRANSFORMATION NEEDS`, `REVISION TASKS` untuk tahap Review dan `AUDIT DRAFT CHANGES`, `FIDELITY VERIFICATION`, `RESOLUTION` untuk tahap Quality Gate) di dalam kolom `thinking` pada respon JSON model untuk mencegah false-positives dan memastikan audit fakta yang menyeluruh.
- **Structured Outputs untuk Strategist**: Mengintegrasikan format skema JSON ketat (`response_format` dengan skema JSON) pada pemanggilan `interactions.create` di router strategist backend untuk memastikan tipe data keluaran model `gemini-3.5-flash` aman dan valid.
- **Sistem Proteksi Parsing Fallback**: Menerapkan perlindungan ganda: melakukan *retry* pemanggilan API tanpa pembatasan skema jika terjadi penolakan format, serta membungkus output teks mentah ke dalam draf jika parsing JSON gagal demi mencegah crash server 500.
- **Panduan Tone Bilingual**: Menambahkan contoh padanan Bahasa Indonesia bersisian dengan contoh Bahasa Inggris pada fungsi `getToneGuidance` untuk kalibrasi gaya bahasa yang konsisten di kedua bahasa output.
- **Proteksi Mode Editor Responsif**: Mengonfigurasi tombol alih mode Tiptap/Markdown agar disembunyikan pada tampilan mobile (`hidden sm:flex`) serta memaksa otomatisasi fallback ke mode Tiptap (Rich Text) ketika dipasang (*mount*) atau saat ukuran layar diubah di bawah 640px untuk mencegah layout terpotong atau melebar keluar layar.

### Changed
- **Prompt Statis untuk Caching (v2.5.0)**: Merestrukturisasi seluruh templat prompt agar bersifat sepenuhnya statis, memindahkan aturan dinamis, tingkat ketat, kebijakan bahasa, dan kebutuhan tanggal hari ini dari system instruction ke dalam objek `articleContext` pada payload user untuk mengoptimalkan mekanisme prompt caching di sisi penyedia AI.
- **Modularitas Panduan Prompt**: Membagi pembuatan system prompt yang monolitis ke dalam beberapa sub-fungsi pembangun yang modular dan teruji (`getCoreEditorialMission`, `getFactualTruthHierarchy`, `getOneClickApplyRule`).
- **Refactoring Prompt Sistem**: Mengekstrak aturan tabel GFM dan penguncian verifikasi data yang berulang menjadi konstanta global bersama (`GFM_TABLE_RULE`, `VERIFICATION_LOCK_RULE`) untuk membersihkan draf prompt.
- **Pengurangan Token Bloat (Pemborosan)**: Menghapus paragraf aturan umum duplikat di prompt sensor Fact-checker serta membersihkan rincian deskripsi field yang berulang di prompt SEO Metadata.
- **Pembersihan Batasan Target Panjang Artikel**: Menghapus target kuantitatif pemangkasan artikel *80-90%* dari prompt pemoles editor draf (`getPolishedDraftPrompt`) untuk mendukung penulisan ulang artikel pada panjang apa pun sesuai preferensi pengguna.

## [3.2.1] - 2026-07-14

### Added
- **Pembersihan Judul H1 Pembuka**: Mengimplementasikan mekanisme pembersihan judul `# ` secara deterministik melalui fungsi `stripLeadingH1` pada utilitas teks backend untuk memisahkan judul H1 sebelum draf masuk ke tahap penulisan/pemolesan akhir. Menjaga integritas judul UX Tahap 3 tanpa melanggar batasan format Tahap 4.
- **Optimasi ThinkingLevel Gemini**: Meningkatkan konfigurasi `thinkingConfig.thinkingLevel` model Gemini 3.x dari `ThinkingLevel.MINIMAL` menjadi `ThinkingLevel.LOW` di seluruh tahap penulisan draf cepat (Quick Draft), evaluasi kepatuhan sumber (Quality Gate), review editor (Editorial Review), serta perbaikan parsial (Targeted Fix) guna mengoptimalkan kemampuan nalar model.
- **Konteks Strategis Ramah Brand**: Mengonfigurasi fungsi `getStrategistSystemPrompt` agar menerima profil brand organisasi aktif. Preferensi brand (nama brand, tone, audiens, posisi, dan instruksi khusus) dimasukkan ke dalam tag XML khusus `<brand_editorial_guidelines>` untuk isolasi cakupan agar tidak mengganggu instruksi sistem.
- **Pemisahan Pengambilan Konfigurasi API Gemini & OpenRouter**: Memperkenalkan helper `getNativeGeminiConfig` (panggilan API Gemini langsung, tanpa payload `temperature`) dan `getOpenRouterSamplingConfig` (panggilan API OpenRouter, mempertahankan payload `temperature`) pada `provider-runtime.ts` untuk membuang dead parameters dan mempermudah perutean model Gemini via OpenRouter di masa depan.

### Fixed
- **Pembersihan Model AI Deprecated**: Mengganti rute pengecekan kesehatan liveness check model `gemini-2.0-flash-lite` dan file onboarding awal dari model lama (`gemini-2.5-flash`) ke model rujukan aktif (`gemini-3.1-flash-lite`, `gemini-3.5-flash`).
- **Pembersihan Variabel Dead Parameter**: Menghapus variabel yang tidak lagi digunakan seperti `FAST_MODE_TEMPERATURE` dan membersihkan pemanggilan linter `getGeminiSamplingConfig` yang tidak terpakai, menghasilkan kepatuhan linter ESLint 100% bersih.

## [3.2.0] - 2026-07-14

### Added
- **Halaman Khusus Penggunaan Kredit (Credit Usage)**: Membuat halaman terdedikasi di `/settings/usage` dalam berkas [page.tsx](./apps/frontend/src/app/[locale]/settings/usage/page.tsx) untuk memisahkan pemantauan kredit dari halaman Billing utama, menampilkan kartu rincian saldo (Total Available, Plan, Free, Add-on) dan log transaksi yang mendetail.
- **Kolom Atribusi Aksi ("Triggered By")**: Menampilkan identitas profil (nama dan avatar) anggota tim penginisiasi di workspace organisasi, label "You" untuk personal workspace, dan ikon "System" untuk aksi background otomatis (`isSystem: true`).
- **Transparansi Quota Reset & Reset Warning**: Menambahkan notifikasi dinamis "Next Quota Reset" untuk memperingatkan tanggal hangus sisa kredit paket bulanan serta pengecualian untuk Add-on credits.
- **Pemberitahuan Kuota Habis (Exhausted Indicators)**: Menambahkan status indikator status habis (`Monthly Plan Quota Exhausted`, `Free / Trial Credits Exhausted`) di bawah kartu kredit saat saldo mencapai 0.
- **Badge Plan Aktif di Sidebar**: Menampilkan badge plan aktif (Starter, Pro, Team, Free) dengan warna tersendiri di sebelah Organization Switcher pada sidebar [AppSidebarShell.tsx](./apps/frontend/src/components/AppSidebarShell.tsx).
- **Backend API `/api/workspace/usage`**: Membuat API endpoint terpadu di [workspace.ts](./apps/backend/src/routes/workspace.ts) yang mengembalikan data saldo per bucket, status refill, serta riwayat lengkap transaksi kredit tergabung dengan data profil Clerk.
- **Konsol Admin Internal (`EAI Admin Console`)**: Menggantikan sub-menu pengaturan sistem sebelumnya (`/settings/system/*`) dengan ruang kerja operasional admin terdedikasi di `/admin/*`. Menambahkan [AdminLayoutShell.tsx](./apps/frontend/src/components/AdminLayoutShell.tsx) untuk menyediakan sidebar kustom, kendali tema, dan navigasi cepat bagi administrator.
- **Proteksi & Otorisasi SuperAdmin**: Menerapkan validasi SuperAdmin di tingkat server pada `/admin/layout.tsx` untuk membatasi akses halaman admin hanya kepada ID pengguna yang terdaftar di variabel lingkungan `OWNER_USER_IDS`.
- **Bypass Mode Pemeliharaan (Maintenance Bypass)**: Mengonfigurasi middleware ([proxy.ts](./apps/frontend/src/proxy.ts)) agar seluruh rute di bawah `/admin/*` dapat dilewati ketika *Maintenance Mode* aktif, sehingga admin dapat mengelola feature flags produksi atau memeriksa log telemetri selama pemeliharaan sistem.
- **Opsi Penimpaan Model & Provider AI per-Organisasi (AI Engine Overrides)**: Mendukung konfigurasi mesin AI kustom untuk tahap *Refinement* (review, rewrite, pembuatan SEO) di tingkat organisasi. Obrolan asisten aslinya (chat) dan pembuatan draf pertama tetap terkunci pada Google Gemini. Dikelola melalui EAI Admin Console di `/admin/ai-config` dengan saran preset model dan invalidasi otomatis cache Redis.
- **Pencatatan Log Audit Operasional Global**: Mengintegrasikan skema pencatatan log audit (`AuditLog` model & `logAuditEvent` helper) untuk mendokumentasikan aksi sensitif admin. Mencakup penyesuaian kuota kredit (personal & organisasi), paksa ubah paket langganan, pemblokiran/pemulihan user, dan perubahan konfigurasi model AI.
- **Penjelajah Log Audit & Audit Feature Flags**: Menyediakan dasbor tabel riwayat audit di `/admin/audit-logs` yang mendukung pencarian, pemfilteran tipe aksi, paginasi, dan drawer visual untuk payload detail JSON. Menyambungkan Server Action perubahan status Feature Flags Edge Config agar tercatat di log audit backend.
- **Penjadwal Kredit Langganan Tahunan**: Mengonfigurasi langganan tahunan agar alokasi kredit diberikan per bulan (contoh: 50/bulan) alih-alih sekaligus di awal. Membangun job cron harian `monthly-credit-allocation` menggunakan BullMQ untuk mereset sisa kredit bulanan utama subscription dan mengisi ulang jatah bulanan baru, menggunakan kunci idempotensi unik (`monthly-refill:${sub.id}:${year}-${month}`) guna mencegah alokasi ganda.
- **Penangguhan Turun Paket / Delayed Downgrade (Stripe-Way)**: Mengimplementasikan alur turun paket yang ditangguhkan dari tahunan ke bulanan. Membuat baris langganan baru dengan status `queued` yang dijadwalkan aktif secara otomatis pada tanggal berakhir paket tahunan (`currentPeriodEnd`). Membangun job cron harian `activate-queued-downgrade` untuk mengotomatisasi aktivasi tersebut.
- **Pembatalan Penangguhan Turun Paket**: Menambahkan tombol modal konfirmasi *"Keep My Current Plan"* untuk menghapus baris antrean paket bulanan (`queued`) dan mengembalikan status aktif paket tahunan.
- **Pembatasan Pembelian Paket Tahunan**: Memblokir opsi pembelian atau perpanjangan paket tahunan baru jika ruang kerja (*workspace*) terdeteksi memiliki antrean turun paket yang tertunda, disertai dengan tampilan teks peringatan yang informatif.
- **Pemisahan Endpoint PATCH**: Memisahkan `/api/history/:id` menjadi endpoint spesifik `/resolve` dan `/autosave` untuk memisahkan logika bisnis, skema validasi, serta pembatasan rate limit.
- **Skema Autosave & Pembatas Request**: Menambahkan skema validasi `AutosaveSchema` dan middleware pembatas request in-memory `autosaveRateLimiter` (maksimal 100 request/menit per pengguna) untuk melindungi proses autosave dari spam basis data.
- **Riwayat Langganan & Validasi Basis Data**:
  - Menghapus batasan `@unique` pada `userId` dan `organizationId` di model `Subscription` untuk beralih ke relasi 1-ke-banyak demi mendukung pencatatan riwayat langganan yang sudah kedaluwarsa/dibatalkan.
  - Menambahkan PostgreSQL `CHECK` constraint (`chk_subscription_target`) di tingkat basis data untuk memaksa eksklusivitas kepemilikan langganan (hanya boleh terikat ke user atau organisasi saja, tidak bisa keduanya atau kosong).
  - Menambahkan indeks unik kondisional (*partial unique index*) untuk memastikan hanya ada maksimal satu langganan berstatus `active` per user atau organisasi.
  - Menerapkan pengalokasian paket secara transaksional dalam satu blok `prisma.$transaction` untuk mengarsipkan langganan aktif lama dan membuat langganan baru secara atomik (aman dari kegagalan parsial).
- **Prorata Paket Otomatis & Penggabungan Kredit**: Menghitung sisa nominal rupiah tak terpakai dari langganan aktif saat pengguna melakukan perubahan paket di tengah periode. Sistem melewatkan reset kredit (`cycle_reset`) pada upgrade/downgrade agar sisa kredit lama digabungkan secara otomatis ke siklus paket baru.
- **Saldo Simpanan Akun (Deposit)**: Memperkenalkan saldo akun (`balanceIdr` pada `User`/`Organization`) untuk menyimpan sisa kembalian dana prorata, yang secara otomatis memotong biaya transaksi checkout berikutnya.
- **Aktivasi Langsung Transaksi Rp 0**: Mengimplementasikan bypass payment gateway jika total tagihan bernilai Rp 0, sehingga aktivasi langganan baru dapat langsung diproses secara instan di backend.
- **Dukungan Status Masa Tenggang (Grace Period)**: Memperbarui pengecekan langganan aktif di backend agar mengenali status `cancels_at_period_end` sebagai langganan aktif yang sah.
- **API Sinkronisasi Kurs Publik**: Menambahkan route publik `GET /api/payments/rate` untuk mengekspos kurs aktif dari backend ke frontend, mencegah kesalahan kalkulasi kurs pada cold start serverless Next.js.
- **Alur Reaktivasi Langganan**: Menambahkan tombol dan modal konfirmasi Reaktivasi Langganan di halaman tagihan beserta API endpoint reaktivasi di backend.

### Fixed
- **Penguncian Nilai Kurs Invoice**: Memperbaiki dan mengunci nilai kurs pada invoice Midtrans otomatis secara stabil pada Rp 18.000 (sesuai nilai checkout asli) serta merinci alokasi saldo/diskon prorasi.
- **Perbaikan Formula Kuota Bulanan**: Memperbaiki perhitungan kuota plan bulanan (dari sebelumnya selalu menampilkan `0 / 300`) dengan menghitung konsumsi aktual di siklus tagihan berjalan secara dinamis.
- **Kompilasi TypeScript & ESLint di UserDirectory**: Membersihkan tipe data implicit `any` pada [UserDirectory.tsx](./apps/frontend/src/components/UserDirectory.tsx) dengan mengimplementasikan interface `UserSubscription` yang baru, menyelesaikan aturan linter `@typescript-eslint/no-explicit-any` serta error kompilasi build produksi Next.js.
- **Pembersihan Sidebar Settings**: Menghapus impor ikon Lucide yang tidak terpakai dan mendefinisikan tipe data eksplisit pada array navigasi `SECTIONS` di [SettingsLayoutShell.tsx](./apps/frontend/src/components/SettingsLayoutShell.tsx) guna memperbaiki Type Error akibat penghapusan submenu EAI System.
- **Ekstraktor JSON Penghitung Kurung Kurawal**: Mengimplementasikan parser pelacak kurung kurawal (`brace-counting`) di fungsi `extractJsonFromText` untuk mengambil objek JSON secara tepat dari output model. Hal ini memotong teks/pagar markdown tambahan (bahkan jika memuat tanda kurung biasa atau kurawal) dan mencegah proses pengulangan (*retry*) parse JSON di Quality Gate.
- **Perbaikan Kurs Invoice**: Memperbaiki logika pembagian nominal kurs pada invoice agar menampilkan nilai dasar (USD 1 = Rp 18.000) alih-alih membagi total tagihan kotor (termasuk PPN) dengan nominal USD.
- **Konsistensi Kurs Pricing & Checkout**: Memperbarui halaman pricing Next.js agar melakukan sinkronisasi kurs langsung dari backend sebelum merender harga, menyelesaikan konflik mismatch kurs dan validasi nominal checkout.

## [3.1.1] - 2026-07-12

### Added
- **Sistem Proteksi Penghapusan Tautan (Lapisan 2 & Lapisan 3)**:
  - **Pencegah Penghapusan Tautan Frontend**: Menambahkan utilitas `checkMissingSources` di Editor untuk mendeteksi apabila tautan sitasi orisinal terhapus sebelum draf dipoles. Menampilkan modal dialog peringatan yang memungkinkan pengguna untuk memulihkan sumber yang hilang di bagian bawah draf, melanjutkan pemolesan apa adanya, atau membatalkan aksi.
  - **Konteks Fact-Checker Backend**: Menyisipkan catatan riset orisinal beserta tautan sumbernya ke dalam tag XML `<session_notes>` pada `<workspace_context>` selama evaluasi Quality Gate, membekali AI Fact-Checker dengan konteks riset orisinal yang lengkap untuk mengaudit klaim faktual.
- **Ekstraksi Grounding Terprogram (Opsi B)**: Mengekstrak URL pengalihan asli Google Search secara langsung dari anotasi metadata `interaction.steps` di dalam `/generate-plan` untuk mencegah tautan 404 akibat halusinasi model.

### Changed
- **Batas Waktu Resolusi Grounding Aman**: Menerapkan fungsi pembantu `fetchWithTimeout` di backend strategist router untuk membatasi pemecahan URL pengalihan Vertex maksimal selama 3 detik, mencegah pemuatan tanpa henti (*infinite loading*) pada server Express dan halaman frontend.
- **Pencocokan Sitasi Hirarkis**: Memperbarui regex pencarian sitasi di backend strategist untuk menangkap format sitasi hirarkis desimal (seperti `[cite: 1.1.8]`).

### Fixed
- **Integritas Tipe Data & ESLint**: Menyelesaikan seluruh pelanggaran aturan linter (`no-explicit-any`, `prefer-const`) di berkas frontend dan backend untuk memastikan kelolosan uji turbo monorepo lint secara penuh.

## [3.1.0] - 2026-07-11

### Added
- **Peralihan Mode Editor Rich Text & Raw Markdown**: Mengimplementasikan tombol pengalih visual di panel editor untuk beralih antara mode Rich Text (Tiptap) dan Raw Markdown (tersinkronisasi dengan localStorage). Kedua layout dirender bersamaan via manipulasi visibilitas CSS untuk menjaga riwayat kursor/pilihan teks dengan sinkronisasi konten dua arah secara instan.
- **Popover Hover Edit Link**: Menambahkan pendengar event hover pada teks tautan (`<a>`) di editor Tiptap yang memunculkan popover absolut (relatif terhadap scroll container) untuk melihat detail link, mengedit, atau menghapusnya.
- **Penyunting Tautan Bubble Menu**: Menggantikan tombol AI "Rewrite" di bubble menu teks terpilih dengan form input tautan inline yang mendukung penambahan, pengubahan, dan penghapusan link. Dilengkapi penanganan stop-propagation agar kursor penulisan tidak dicuri oleh ProseMirror.

### Changed
- **Penyelarasan Tombol AI Preview**: Memperbarui tombol aksi (Accept/Reject) pada blok preview AI (Shorten & Expand) agar menggunakan kelas standar `.ui-btn`. Disematkan gaya inline warna teks untuk menimpa aturan pewarisan warna `.prose` dan `.editor-canvas` agar tampil konsisten (biru brand di mode terang, putih monokrom di mode gelap).
- **Popup Link Resizable**: Mengonfigurasi popup hover link dan inline bubble menu link editor agar dapat diubah ukurannya ke samping maupun bawah (`resize: both`, `overflow: auto`). Menambahkan batas tinggi minimal dinamis (`minHeight: 200px` saat mengedit, `56px` saat membaca) pada popup hover agar konten input dan tombol tidak terpotong saat diperkecil.
- **Pembersihan Slash Command**: Menghapus opsi rekomendasi perintah "Rewrite (AI)" dari menu slash `/` editor Tiptap secara keseluruhan.

### Fixed
- **Bug Penyimpanan Blueprint**: Memperbaiki bug di mana blueprint yang dihasilkan di panel obrolan Content Strategist hilang setelah refresh browser, berpindah menu, atau saat membuat draf baru. Masalah diselesaikan dengan bermigrasi dari `fetch` biasa ke `directFetch` yang terautentikasi di frontend hook, memastikan callback merujuk pada `currentSessionId` terbaru, serta menambahkan logika pembuatan sesi otomatis di backend `/api/strategist/generate-plan` jika `sessionId` bernilai `'new'`.
- **Bug Karakter Escape saat Paste Markdown**: Mengaktifkan `transformPastedText` dan `transformCopiedText` pada konfigurasi ekstensi Markdown di editor Tiptap untuk memproses teks markdown hasil tempel langsung menjadi node format terstruktur alih-alih melarikan (double-escaping) baris heading dengan karakter backslash.
- **Peringatan Duplikasi Ekstensi Link Tiptap**: Menyelesaikan peringatan browser `Duplicate extension names found: ['link']` dengan memindahkan opsi ekstensi tautan langsung ke dalam konfigurasi `StarterKit.configure`.
- **Warna Teks Link Mode Gelap di Editor**: Menambahkan aturan CSS `.dark .prose a` untuk memastikan teks tautan di editor mode gelap tetap berwarna biru (`#3b95d9`) yang kontras, alih-alih terbalik menjadi putih karena pewarisan tema gelap Tailwind Typography.

## [3.0.3] - 2026-07-10

### Added
- **Pemeriksaan Kesehatan Dangkal dan Mendalam (Health Check)**: Mengimplementasikan endpoint `/health` (shallow check, <5ms untuk deteksi liveness) dan `/api/health` (deep check untuk pemantauan dependency).
- **Verifikasi Dependency Paralel**: Endpoint `/api/health` melakukan kueri secara paralel ke Database (Prisma/Postgres `SELECT 1`), Redis (`PING`), Clerk Auth (`/v1/instance`), Cloudflare R2 Storage (`HeadBucket`), API provider AI aktif (Gemini/OpenRouter/Groq), Midtrans (`healthcheck-ping-dummy`), dan sistem email (Mailgun/Resend).
- **Timeout Tangguh & Severity**: Menerapkan batas waktu `3000ms` per dependency untuk mencegah endpoint hang. Layanan dikelompokkan menjadi kritis (mengembalikan HTTP 503) dan non-kritis (mengembalikan HTTP 200 dengan status `degraded`) untuk menghindari alarm palsu yang tidak perlu.
- **User Journey Monitoring**: Menambahkan endpoint `/api/health/journey` untuk memverifikasi alur kerja pengguna (Onboarding, Strategist Chat & Sessions, konfigurasi Workspace, Analisis AI, Aksi Dalam Editor, riwayat analisis, ekspor draf, pembayaran, dan checkout) secara paralel, dengan memverifikasi apakah route terproteksi merespons dengan benar (HTTP 401/403) dan halaman publik dapat diakses (HTTP 200).
- **Pemeriksaan BullMQ Worker, Edge Config & Exchange Rate**: Mengintegrasikan verifikasi status worker aktif (mengecek jumlah worker dan status antrian) ke `/api/health` sebagai dependency kritis (pada produksi), serta pemeriksaan Vercel Edge Config (feature flags) dan Exchange Rate API untuk kelengkapan metrik sistem.
- **Metrik Sistem**: Menyertakan informasi versi, git commit SHA, uptime proses, timestamp startup, dan latency detail per layanan pada respon JSON untuk memudahkan debugging.

## [3.0.2] - 2026-07-09

### Fixed
- **Peta Error Ekspor Blog yang Toleran**: Menyelesaikan masalah kesalahan respon `502 Bad Gateway` yang menyesatkan saat melakukan ekspor draf dengan slug duplikat ke backend blog. Sistem sekarang memetakan respon status `409` (Conflict) dan pesan kesalahan "already exists" dari backend blog ke kode status `409 Conflict` yang tepat daripada melempar error gateway umum.
- **Notifikasi Ekspor Berbahasa Inggris yang Profesional**: Meningkatkan pesan notifikasi dialog ekspor di frontend `FinalDraftPanel` untuk menampilkan pesan kesalahan berbahasa Inggris yang jelas, ramah, dan solutif berdasarkan kode status respon (misalnya, menjelaskan masalah slug URL duplikat, kegagalan autentikasi kredensial, dan masalah server blog offline).
- **Pengambilan Backend Langsung untuk AI Stream**: Mengarahkan semua endpoint API streaming yang berjalan lama (Pembuatan Draf, Analisis Draf, Perbaikan Terarah, dan Chat Asisten) langsung ke server backend EAI (`api-eai.envoyou.com`) alih-alih melalui proxy Vercel. Ini menyelesaikan masalah kritis di mana batasan waktu eksekusi serverless Vercel (10 detik pada akun gratis/Hobby) secara paksa memutuskan terowongan koneksi selama fase pembuatan konten AI berlangsung, menyebabkan editor frontend menampilkan draf terpotong, macet tanpa batas waktu, dan tombol pembuat konten tetap berputar selamanya.
- **Integrasi URL Auto-Checkout**: Menambahkan dukungan untuk parameter pencarian `?plan=<planId>` pada halaman pricing. Ini secara otomatis memilih periode pembayaran (Bulanan vs Tahunan), mencocokkan kartu paket, dan memicu modal konfirmasi checkout secara langsung, memudahkan pembelian yang berasal dari landing page pemasaran.
- **Overflow Horizontal Panel Feedback di HP**: Memperbaiki masalah di mana membuka card feedback check tertentu di tab Feedback panel samping menyebabkan panel melebar secara horizontal melewati batas layar HP. Akar masalah yang ditemukan: (1) properti `overflow-x: auto` pada elemen paragraf di dalam kontainer flex/grid membuat browser menghitung lebar kontainer berdasarkan panjang konten penuh yang belum diwrap (scroll-width); (2) elemen `.ui-badge` dengan `white-space: nowrap` untuk label status verifikasi yang panjang (contoh: "High-risk factual claim") tidak dapat melipat baris; dan (3) string URL panjang berurutan tanpa spasi di dalam blok teks `font-mono` (tautan Target Text dan Flagged Claim, seperti URL McKinsey atau Traveloka yang tersemat dalam tautan markdown) tidak dipotong pada batas karakter. Diperbaiki dengan: menghapus `max-w-full overflow-x-auto` dari paragraf konten, menambahkan `whitespace-normal flex-wrap h-auto` pada badge status verifikasi, serta mengubah `break-words` menjadi `break-all` pada semua blok teks mono-spaced.
- **Overflow Horizontal Panel Chat AI di HP**: Memperbaiki masalah di mana respons AI di tab Strategist Chat yang mengandung tabel Markdown, blok kode, atau URL panjang tanpa spasi menyebabkan seluruh panel chat melebar secara horizontal di layar HP. Diperbaiki dengan: menambahkan `overflow-x: hidden` pada container scroll chat dan `overflow: hidden` pada bubble pesan asisten di `StrategistTab.tsx`; menambahkan aturan CSS `.strategist-prose code`, `.strategist-prose pre`, dan `.strategist-prose a` dengan `word-break: break-all` dan `white-space: pre-wrap` di `globals.css`; serta membuat `.strategist-prose table` menggunakan `display: block; overflow-x: auto` agar tabel yang lebar dapat discroll horizontal di dalam bubble pesan tanpa mendorong layout ke samping.

## [3.0.1] - 2026-07-08

### Added
- **Manual Subscription Plan Override (Inject Plan)**: Menambahkan fitur penimpaan paket subscription manual di sistem penagihan admin internal. Ini memungkinkan administrator mengubah paket subscription (Starter, Starter Yearly, Pro, Pro Yearly, Team, Team Yearly) dengan durasi hari tertentu, mencatat tiket Zoho Desk, mereset sisa saldo kredit subscription (`cycle_reset`), dan mengalokasikan kredit plan baru.
- **Modular Workspace Context & Brand Alignment**: Mengekstrak helper modular `apps/backend/src/lib/ai/workspace-context.ts` untuk memfasilitasi rendering XML `<workspace_context>` dan menyuntikkan instruksi kepatuhan brand dinamis (`<agent_instruction>`) di seluruh pipeline AI (Chat Strategist, SEO Optimizer, Fact-Checker, dan Targeted Fix).

### Changed
- **UI Billing Admin Tabbed Layout**: Merestrukturisasi panel kanan Admin Billing dari form tunggal menjadi panel tabbed (Adjust Credits & Override Plan) menggunakan custom Base UI select dan modal konfirmasi aksi.

## [3.0.0] - 2026-07-06

### Added
- **Desain Ulang Onboarding Berbasis AI (AI-First Onboarding)**: Merombak total alur penyambutan pengguna (onboarding wizard) dari 5 langkah konfigurasi sistem yang rumit menjadi hanya 3 langkah minimalis interaktif (`activation`, `discovery`, dan `review`).
- **Ekstraksi DNA Editorial Otomatis**: Mengintegrasikan sistem pengikisan (*scraping*) dan sintesis AI otomatis via Jina Reader API dan Gemini 3.5 Flash untuk mengenali nama brand, rumusan positioning, target audiens, topik kategori, nada bahasa, serta jenis artikel langsung dari konten website pengguna.
- **Antarmuka Tinjauan & Edit DNA Langsung**: Menambahkan dukungan tag-pill interaktif dan editor teks langsung di dalam layar peninjauan DNA, memungkinkan pengguna untuk meninjau, menambah, mengedit, atau menghapus kategori, gaya nada tulis, dan tipe artikel sebelum aktivasi.
- **Fitur Pembatalan Aman Discovery**: Menambahkan tombol "Batal & Kembali" pada layar loading radar Discovery untuk membatalkan request jaringan yang menggantung secara aman, mereset status draf onboarding kembali ke `'activation'` di database, dan mengembalikan tampilan ke form awal.
- **Visualisasi Tipe Artikel (Article Types)**: Menambahkan dukungan antarmuka peninjauan dan penyuntingan tipe artikel (`articleTypes`) bawaan dan hasil prediksi AI secara visual saat onboarding.
- **Pengalih Organisasi di Sidebar (Sidebar Organization Switcher)**: Mengintegrasikan komponen `OrganizationSwitcher` milik Clerk langsung di dalam bilah menu utama (`AppSidebarShell`), mempermudah pengguna untuk beralih antar-organisasi langsung dari sidebar saat terbuka.
- **Desain Mobile-Friendly untuk Select**: Meningkatkan komponen `Select` (`ui/select.tsx`) agar secara otomatis merender mode laci bawah (*bottom-sheet*) pada perangkat mobile ($\le 768$px) lengkap dengan overlay latar buram (*backdrop*), handle seret (*drag handle*), dan animasi usap ke atas (*slide-up*). Serta memigrasikan dropdown filter bawaan pada halaman Direktori Pengguna untuk menggunakan komponen ini.
- **Pemilih Tanggal Kustom Mobile**: Menambahkan tata letak pemilih tanggal kustom responsif khusus mobile pada `DashboardLayoutShell`.
- **Konfigurasi Administrator Workspace**: Menambahkan status `isAdmin` pada data konfigurasi workspace di backend (`/api/workspace/config`) serta memperbarui tipe data `SettingsProvider` di frontend untuk mengenali tingkat kewenangan pengguna.

### Changed
- **Peningkatan Visual & Keterbacaan Tinjauan DNA**: Memperbesar ukuran teks konten (Positioning dan Target Audiens) dari `text-xs` menjadi `text-sm` serta mempertegas label kategori dan nada tulis untuk meningkatkan hierarki visual pada layar resolusi besar.
- **Prioritas Scraping Jina Reader API**: Mengubah alur pengikisan konten website di backend onboarding untuk memprioritaskan Jina Reader API (timeout 4.5 detik) sebelum beralih ke parser HTML mentah bawaan demi menjaga konsistensi dengan fitur riset strategist.
- **Pembatasan Akses Pengaturan Admin**:
  - Membatasi halaman Pengaturan Workspace (`/settings/workspace`) khusus untuk peran Administrator; pengguna biasa secara otomatis dialihkan ke Pengaturan Umum.
  - Memperbarui `PublicationProvider` untuk melewati pengambilan data profil editorial jika pengguna tidak memiliki hak akses administrator guna menghindari kegagalan panggilan API di latar belakang.
- **Daftar Sitasi Lipat di Strategist Chat**: Memperbarui penampilan sumber referensi yang dirujuk di `StrategistTab` untuk membatasi tampilan maksimal 3 item sumber, dilengkapi tombol ekspansi ("Show All" / "+X more") untuk menghemat ruang chat.
- **Penyelarasan Desain Input Chat**: Mengubah tombol kontrol input chat (lampiran file, pencarian web, tombol kirim) menjadi bentuk lingkaran penuh (`rounded-full`) dengan efek hover yang diperhalus.
- **Dropdown Pemilihan Tema**: Menggantikan kontrol pemilih tema (segmented control) di Pengaturan Umum dengan komponen `Select` baru yang lebih ramah perangkat mobile.
- **Pelabelan Panel Chat Workspace**: Mengubah nama label tombol pemicu panel kanan workspace dari "AI Copilot" menjadi "EAI Chat".
- **Bottom Sheet Aksi Baris Pengguna**: Merestrukturisasi menu aksi mobile di tabel Direktori Pengguna agar selaras dengan gaya bottom-sheet global, menghilangkan border dan background pada tiap tombol, menghapus tombol batal, serta menyamakan blur latar belakang, handle seret, dan transisi animasi. Juga menetralkan ikon-ikon berwarna (kartu kredit, riwayat, email) di menu dropdown desktop maupun mobile agar sesuai dengan tema utama.
- **Dropdown Overlay Aksi Pengguna**: Merestrukturisasi menu dropdown aksi desktop untuk menggunakan komponen `@base-ui/react/menu` yang dirender di dalam `<Menu.Portal />`. Implementasi ini mengeluarkan menu sepenuhnya dari batasan overflow tabel dan memanfaatkan Floating UI untuk memposisikan menu secara dinamis (otomatis berbalik ke atas/bawah sesuai sisa ruang viewport), mencegah menu terpotong pada jumlah baris tabel berapa pun.
- **Penyelarasan Tema Modal Pengguna**: Menyelaraskan modal **Adjust Credits** dan **User Audit & Details Console** agar indikator fokus, tombol aksi, tab pilihan, lencana referensi, dan teks informasi utama menggunakan variabel warna brand (`var(--primary)`) menggantikan warna indigo dan sky. Serta memigrasikan tombol pencarian dan tombol modal di halaman Direktori Pengguna untuk menggunakan kelas utilitas sistem `ui-btn` guna menjamin tombol utama otomatis berubah menjadi putih/hitam di mode gelap dan biru brand/putih di mode terang.
- **Spesifikasi Panduan Agen**: Memperbarui berkas [AGENTS.md](file:///home/husni-kusuma/Project-envoyou/EAI/AGENTS.md) dengan konvensi UI/styling yang ketat mengenai penggunaan tombol global (`ui-btn-primary`), pemilih bottom-sheet mobile yang responsif, dan menu overlay Base UI berbasis Portal untuk mencegah fragmentasi komponen kustom di masa mendatang. Menambahkan panduan komprehensif mengenai pustaka komponen UI global yang tersedia (Badge, Tooltip, Sonner, Alert, ScrollArea, Skeleton) untuk memelihara konsistensi desain.

### Fixed
- **Filter Plan Free Direktori Pengguna**: Memperbaiki bug query database pada endpoint `/api/admin/users` di mana penyaringan dengan opsi "Free" menghasilkan daftar kosong; memperbarui query Prisma untuk mengenali pengguna atau organisasi yang tidak memiliki data langganan aktif (yaitu `subscription: null` atau sudah kedaluwarsa) di database.
- **Penghapusan Rate Limiter Onboarding**: Menghilangkan pemeriksaan pembatasan laju (*rate limiter*) berbasis timestamp `updatedAt` pada endpoint `/discover` untuk menghindari kondisi balapan (*race condition*) dengan perintah simpan draf sebelumnya yang memicu salah deteksi error 429.
- **Pencegahan Lag Sesi Clerk Saat Pendaftaran**: Meneruskan informasi sesi organisasi Clerk aktif (`x-clerk-org-id`, `x-clerk-org-slug`, `x-clerk-org-role`) dari Edge middleware ke backend auth demi mengatasi keterlambatan propagasi token JWT Clerk sesaat setelah pembuatan organisasi/pendaftaran akun baru.
- **Proteksi Loading Tanpa Akhir Discovery**: Menyematkan batas timeout `Promise.race` ketat selama 10 detik pada pemanggilan API Gemini di backend onboarding, mencegah radar loading berputar selamanya saat koneksi Google API terblokir/mengalami gangguan.
- **Pemulihan Otomatis Autosave**: Mengimplementasikan penanganan error autosave pada `EditorialWorkspace` untuk mengenali respon `403` atau `404` (misal akibat ID riwayat tidak valid atau telah dihapus) dan secara otomatis mereset `activeHistoryId` aktif untuk mencegah kegagalan penyimpanan berulang.
- **Responsivitas Header Workspace**: Menyesuaikan tipografi dan breadcrumbs di header `WorkspacePageShell` agar teks tidak saling tumpang tindih pada layar berukuran kecil.

## [2.1.0] - 2026-07-05

### Added
- **Persistensi Sesi Chat AI Strategist**: Mengintegrasikan penyimpanan sesi `sessionStorage` di `ContentStrategistWizard` untuk properti `messages`, `collectedSources`, `currentPlan`, `deepResearchReport`, dan `uploadedAttachment` agar riwayat chat tidak hilang saat berpindah halaman.
- **Tombol Toggle & Overlay AI Strategist**: Menambahkan tombol "AI Strategist" di header editor, merender antarmuka chat riset sebagai overlay z-index absolut sehingga pengguna bisa membuka-tutup obrolan kapan saja tanpa terhalang teks draf aktif.
- **Penyimpanan Otomatis Blueprint**: Secara otomatis mengonversi detail blueprint yang dihasilkan (Angle, Outline, Audience, Hook, SEO Intent, Sources) menjadi sebuah Catatan Riset terstruktur dan menyimpannya di panel Research Notes Studio saat pengguna memilih "Proceed to Editor".

### Changed
- **Sinkronisasi Sesi Teroptimasi**: Obrolan chat diserialisasikan ke `sessionStorage` hanya saat `isTyping` bernilai `false` (saat AI selesai berbicara/mengalirkan teks) untuk mencegah lag pengetikan di browser.
- **Peningkatan Konfigurasi Token & Suhu (Temperature)**: Membatasi token penalaran Gemini 3.5 lewat parameter `thinking_level: "low"` serta meningkatkan `max_output_tokens` menjadi `8192` pada endpoint `/generate-plan` untuk mencegah kegagalan JSON terpotong. Mengintegrasikan `getGeminiSamplingConfig` agar model Gemini 3 menggunakan suhu default `1.0` sesuai rekomendasi Google.

### Fixed
- **Pelonggaran Skema Validasi PATCH Riwayat**: Melonggarkan batasan validasi Zod (`EditorialResolutionSchema`, `EditorialFeedbackSchema`) pada endpoint riwayat, menyelesaikan error "Fix Failed: A title or valid editorial resolution is required". Batas draf dipoles ditingkatkan hingga `100.000` karakter dan klaim ganda diselesaikan dengan toleran jika kalimat target hilang.

## [2.0.2] - 2026-07-04

### Added
- **Jejak Penalaran Chain-of-Thought (CoT)**: Mengintegrasikan properti opsional `"thinking"` ke dalam kontrak skema prompt (`FEEDBACK_OUTPUT_PROMPT_SCHEMA`, `POLISH_DIAGNOSIS_OUTPUT_PROMPT_SCHEMA`) dan skema Zod (`FeedbackOutputSchema`, `PolishDiagnosisResponseSchema`, `FinalQualityGateSchema`), memaksa model menuliskan penalaran langkah-demi-langkah terlebih dahulu sebelum memberikan kesimpulan penilaian.
- **Optimasi Caching Prompt**: Merestrukturisasi fungsi prompt sistem untuk meletakkan semua properti dinamis (seperti kebijakan bahasa dan petunjuk tingkat keketatan) di bagian akhir di bawah blok penanda `=== DYNAMIC CONSTRAINTS ===` demi memaksimalkan rasio kecocokan cache awal (*prefix caching hit rate*) pada Claude dan Gemini.
- **Contoh Few-Shot Operasi Baru**: Menambahkan contoh terstruktur visual untuk operasi edit `replace` dan `insert_after` di dalam instruksi operasi 1-klik.

## [2.0.1] - 2026-07-02

### Changed
- **Konfigurasi Route Streaming Nginx**: Mengubah aturan location Nginx dari `/api/draft` menjadi regex yang mencocokkan semua endpoint streaming backend aktif (`/api/analyze`, `/api/strategist/chat`, dan `/api/strategist/generate-draft-from-notes`) untuk menjamin UX pengetikan/streaming secara real-time.
- **Peningkatan Batas Memori PM2**: Meningkatkan batas memori (`--max-old-space-size` dan `max_memory_restart`) di `ecosystem.config.cjs` dari 150MB menjadi 400MB untuk mengatasi crash akibat kehabisan memori (OOM) dan error 502 Bad Gateway saat beban tinggi.

### Fixed
- **Migrasi Database Produksi**: Menjalankan `npx prisma migrate deploy` untuk menerapkan migrasi database tertunda `20260630040119_add_copilot_chat_transaction_types` secara aman ke database produksi.

## [2.0.0] - 2026-07-02

### Added
- **Persistensi Database Catatan Riset (Sprint A)**: Mengintegrasikan penyimpanan database Neon PostgreSQL untuk Research Notes Studio. Catatan kini disimpan di dalam JSON `AnalysisLog.metadata.researchNotes` menggantikan penyimpanan sessionStorage yang volatile.
- **Unggah Cloudflare R2 Aman (Sprint B)**: Mengimplementasikan unggah file langsung ke R2 untuk berkas CSV, PDF, dan TXT menggunakan presigned PUT URL dengan batasan ukuran 10MB yang ketat di sisi frontend dan backend.
- **API Ekstraksi Teks Sinkron (Sprint B)**: Menambahkan endpoint `/api/storage/extract` untuk mengunduh file secara aman dari bucket R2 private dan mengekstrak teks menggunakan `pdf-parse` (PDF) atau konversi `utf-8` (TXT/CSV).
- **Injeksi Konteks Lampiran Chat (Sprint B)**: Mengintegrasikan teks ekstraksi berkas (maksimal 15.000 karakter dibungkus tag XML `<attached_file>`) langsung ke dalam prompt AI Strategist.
- **Lencana Lampiran Wizard & UX Replace (Sprint B)**: Menambahkan kartu informasi lampiran berkas dengan deteksi ukuran file, indikator tipe dokumen, tombol hapus, dan perilaku penggantian otomatis (replace) jika file baru diunggah.
- **Dynamic Document Mode Override (Sprint B)**: Menambahkan blok instruksi khusus (`<document_mode_override>`) secara dinamis saat ada berkas terlampir pada Fast Mode, memaksa AI melakukan grounding kuantitatif, melonggarkan batasan panjang teks, serta menghasilkan saran pertanyaan yang berfokus pada data.

### Changed
- **Integrasi Catatan Editor Tanpa State (Sprint A)**: Merestrukturisasi `Editor.tsx` agar menerima data catatan dan callback modifikasi via props, melimpahkan pengelolaan state terpadu ke `EditorialWorkspace.tsx`.
- **Logika Auto-Retry R2 Read (Sprint B)**: Mengimplementasikan loop retry 3x dengan jeda 500ms pada `getFileBuffer` untuk menghindari jeda propagasi CDN/R2 saat file baru selesai diunggah.

### Fixed
- **Penolakan Scanned PDF (Sprint B)**: Menambahkan deteksi error eksplisit untuk PDF hasil scan/gambar, mengembalikan pesan toast yang jelas: `"PDF ini tidak dapat baca karena berbasis gambar atau scan."`
- **Peringatan Type-Casting Clerk Auth (Sprint A)**: Mengatasi error ESLint `no-explicit-any` dengan memisahkan konfigurasi penampilan komponen Clerk ke variabel eksternal pada tata letak (layout) dan halaman masuk/daftar.
- **PDF Parser Class exports (Sprint B)**: Mengatasi masalah `ERR_PACKAGE_PATH_NOT_EXPORTED` dan kesalahan tanda panggilan TS dengan mengubah pemanggilan fungsi default pdf-parse menjadi instansiasi kelas bernama (`new PDFParse(...)` dan `.getText()`) untuk mencocokkan dengan versi ekspor `pdf-parse` 2.4.5.

## [1.1.0] - 2026-06-29

### Added
- **Panel Sumber Mobile yang Ringkas**: Memperkenalkan daftar inline responsif di atas formulir obrolan chat untuk layar HP/tablet guna menampilkan sumber referensi yang dirujuk tanpa menghalangi atau menutupi kolom input ketik.
- **Tombol Kembali Mengambang (`<`)**: Menggantikan bilah tajuk (*header bar*) obrolan yang memakan tempat dengan tombol kembali berbentuk lingkaran kecil (`ChevronLeft`) di pojok kiri atas, mengembalikan kelegaan layar vertikal pada mobile.
- **Default Sidebar Mobile Tertutup**: Menambahkan deteksi otomatis ukuran layar untuk menyetel laci navigasi halaman workspace dalam keadaan tertutup secara default saat dimuat pada perangkat $\le 860$px.

### Changed
- **Kompatibilitas Layar Sentuh**: Menambahkan dukungan pendengar event `touchstart` di samping `mousedown` pada deteksi klik di luar area (*click-outside*), menjamin menu dropdown menutup secara andal di semua HP dan tablet layar sentuh.
- **Konfigurasi Hidrasi Tiptap Next.js**: Mengonfigurasi properti `immediatelyRender: false` pada hook editor Tiptap untuk menghilangkan log peringatan Next.js di konsol browser.

### Fixed
- **Sinkronisasi Konten Tiptap**: Mengimplementasikan hook `useEffect` reaktif di dalam `Editor.tsx` untuk menyinkronkan pembaruan nilai state `value` eksternal (dari cetak biru wizard atau penyisipan catatan riset) langsung ke kanvas Tiptap tanpa merusak posisi kursor ketik.
- **Peringatan State Cascade ESLint**: Merestrukturisasi logika pembersihan state `collectedSources` untuk menghilangkan pemanggilan synchronous `setState` di dalam efek komponen yang melanggar aturan ESLint.

## [1.0.0] - 2026-06-29

### Added
- **Tiptap Rich-Text Editor**: Menggantikan textarea Markdown mentah dengan editor rich-text tangguh berbasis Tiptap untuk pengalaman menulis yang mulus.
- **Slash Commands Accelerator (`/`)**: Memperkenalkan menu perintah slash interaktif langsung di dalam editor untuk memicu pemformatan cepat dan operasi AI (misal: Generate Paragraph, SEO Optimize, Add Citation).
- **AI Action Endpoint**: Membuat endpoint backend khusus (`/api/editor/ai-action`) untuk menangani aksi AI granular pada editor secara aman.
- **AI Preview Block (Accept/Reject)**: Mengimplementasikan blok pratinjau sebaris untuk hasil edit AI. Pengguna kini dapat meninjau saran AI dan memilih "Accept" (Terima) atau "Reject" (Tolak) sebelum digabungkan ke dokumen, menjaga kontrol penulis atas draf mereka.
- **Lazy Markdown Serialization**: Mengonfigurasi `tiptap-markdown` untuk memparsing JSON ProseMirror menjadi Markdown secara *lazy* (hanya saat dibutuhkan), meningkatkan performa editor secara signifikan dibandingkan melakukan sinkronisasi pada setiap ketikan.
- **Research Notes Studio**: Menambahkan integrasi `sessionStorage` lokal untuk menyimpan output AI sebagai "Catatan Riset". Terdapat UI berbasis akordion di sidebar Editor menggunakan `framer-motion` untuk mengulas dan mengelola sumber fakta yang dikumpulkan.
- **AI Draft Generator**: Mengimplementasikan *endpoint* streaming `/api/strategist/generate-draft-from-notes`. Endpoint ini menerima catatan riset yang dipilih, mensintesisnya menggunakan Gemini Interactions API, dan memancarkan (streaming) draf pertama yang utuh langsung ke kanvas Editor.
- **EAI Research Copilot (Fitur Baru)**: Meluncurkan AI "Thinking Partner" interaktif untuk *content strategists*. Dibangun menggunakan Gemini Interactions API, fitur ini memiliki antarmuka chat dinamis dengan input yang dapat menyesuaikan ukuran secara otomatis, *Grounding* Google Search secara *real-time*, render Markdown secara *streaming*, dan sitasi sebaris ala Perplexity. Copilot ini membantu pengguna dari analisis data awal hingga menyusun draf cetak biru (*blueprints*) konten.
- **Envoyou Token Billing Tracker**: Menambahkan mekanisme pencatatan penggunaan token (`interaction.usage.total_tokens`) di akhir *stream* Copilot mode *Fast* pada `strategist.ts`. Hal ini melacak konsumsi API untuk integrasi di masa mendatang dengan sistem pengurangan koin/kredit pengguna internal.
- **Monorepo Architecture (TurboRepo)**: Menggabungkan repositori `frontend` dan `backend` menjadi satu monorepo tunggal untuk menyederhanakan siklus rilis dan CI/CD.
- **Shared Package (`@eai/shared`)**: Memindahkan semua tipe data, skema Zod, *helper functions*, utilitas stream JSON, dan *constant* konfigurasi yang duplikat menjadi satu *single source of truth* di `packages/shared`. Ini secara resmi melunasi *Technical Debt* dari sinkronisasi data antar repositori.
- **Server vs Client Export Isolation**: Ekspor di `@eai/shared` dipisah dengan jalur `"./server"` untuk logika spesifik *backend/edge* yang tidak kompatibel dengan antarmuka klien *browser* seperti Webpack.
- **Autentikasi Lembut & Pembatasan Akses Copilot**: Menambahkan verifikasi token Clerk (soft auth) dan pembatasan akses custom (rate limiting) secara in-memory (20 req/menit untuk chat, 10 req/menit untuk plan) pada rute strategist.
- **Injeksi Konteks Ringkasan Catatan**: Menambahkan mekanisme untuk menyisipkan ringkasan catatan riset tersimpan (setelah dibersihkan dari format tautan sebaris) ke dalam data riwayat chat Copilot untuk memberikan konteks seketika tentang apa saja yang telah dicatat pengguna.
- **Skema Cetak Biru Berbasis Schema**: Memaksakan struktur JSON yang kaku dan valid pada keluaran endpoint `/generate-plan` menggunakan konfigurasi `response_format` Gemini API, menjamin parsing stabil di sisi frontend.

### Changed
- **Separation of Fast & Deep Chat Modes**: Merombak API backend Copilot untuk membedakan kedalaman kueri dengan benar. Mode "Fast" kini menghapus alat yang mahal (`url_context`, `code_execution`) dan secara ketat membatasi Google Search hanya pada satu iterasi demi mendapatkan respons instan yang lebih hemat biaya.
- **Deep Research Spending Cap Protection**: Menerapkan pembatasan *prompt* yang ketat pada *background agent* `deep-research-preview-04-2026` (maksimal 5 kueri pencarian). Ini mencegah *looping* tak terhingga yang dapat menguras batas pengeluaran proyek Google Cloud (`RateLimitError: 429`).
- **Dark Mode Palette Refinement**: Merombak palet warna *Dark Mode* untuk menggunakan estetika monokrom netral berkontras tinggi berbasis `#121211`. Mengganti warna bawaan *slate* dan biru *brand* pada `PricingCheckoutButton`, `StatusBar`, dan *sidebar* dengan variabel dari sistem desain (*design system*) asli untuk tampilan yang lebih padu.
- **Sidebar Animation**: Melakukan *refactoring* pada transisi tata letak `AppSidebarShell` untuk menyelesaikan masalah ikon yang terguncang (*jittering*) saat ditutup (*collapse*). Menggunakan interpolasi `max-width` alih-alih `display: none` secara instan agar proses melipat menjadi halus.
- **Editor Layout Animations**: Melakukan *refactoring tata letak Editorial Workspace untuk menggunakan animasi lebar yang mulus dari `framer-motion` pada panel Research Notes Studio dan Feedback. Saat panel samping disembunyikan, editor teks utama secara anggun memfokuskan posisinya ke tengah layar menggunakan transisi `max-width` dinamis, menciptakan mode penulisan bebas gangguan yang elegan.
- **Routing Relative Path**: Mengganti URL API absolut dengan path relatif pada Research Copilot UI untuk melewatkan fetch melalui middleware proxy Next.js, memastikan injeksi token sesi berjalan otomatis.
- **Timeout Polling Deep Research**: Menambahkan logika timeout pada loop status check Deep Research di sisi frontend setelah mencapai batas maksimal 180 kali poll (30 menit) guna menghindari kebocoran memori atau loop latar belakang yang tak terbatas.
- **Refaktor Caching Prompt**: Merestrukturisasi tata letak prompt `generate-draft-from-notes` dengan memindahkan persona tetap, kepatuhan fakta, dan aturan sitasi ke parameter `system_instruction` untuk optimasi caching Gemini API.
- **Batasan Panjang Mode Fast Berjenjang**: Memperbarui batasan panjang di Mode Fast agar mendukung 2-4 paragraf untuk kueri riset panjang dan tetap 2-4 kalimat untuk kueri faktual pendek.
- **Pemotongan Riwayat Bersih Batas Paragraf**: Mengkonfigurasi pesan asisten pada riwayat obrolan agar dipotong secara bersih pada batas paragraf (`\n\n`) atau baris terdekat sebelum batas karakter maksimal.

### Fixed
- **TypeScript `InteractionSSEEvent` discrimination**: Menyelesaikan *error* tipe data IDE yang disebabkan oleh pencarian properti `event.step` and `event.delta` yang tidak valid pada *discriminated unions*.
- **Backend Lint Errors**: Menghapus *import* `requireAuth` dan `ENVOYOU_PROFILE_ID` yang tidak terpakai di *routes* `strategist` untuk memperbaiki kegagalan *lint* pada saat *build*.
- **Stale LocalStorage State**: Menghapus referensi `eai-provider` yang usang dari hidrasi *state* workspace di *frontend* karena resolusi model AI sekarang ditangani secara aman di sisi server.
- **ESLint `no-explicit-any`**: Memperbaiki masalah *error* Linter saat *build* pada `strategist.ts` dengan mendefinisikan antarmuka yang tepat (`{ role: string; content: string }`) untuk *map* riwayat interaksi, menggantikan *typecast* ke `any`.
- **Blank Signup UI Bug**: Memperbaiki intervensi *bundler* Webpack di sisi *frontend* di mana ia mencoba memaketkan dependensi `node:crypto` dan tipe *Edge Config* saat proses autentikasi (Sign-up/Sign-in) akibat *barrel export* dari `packages/shared`.
- **Clerk v6 Fallback Loop**: Mengkonfigurasi `fallbackRedirectUrl` pada komponen SSO (Daftar & Masuk) Clerk untuk menghindari perilaku siklus *redirect* tak terhingga atau penahanan rendering (*stuck loading*) untuk akun yang sudah dikenali sistem.
- **Pembersihan Sitasi Catatan**: Membuang tautan sitasi sebaris (`\s*\[\d+\]\([^)]+\)`) dari konten catatan riset sebelum pembuatan draf awal, mengatasi kebingungan model (dual-truth problem) terhadap referensi sumber ganda.
- **Ekstraksi Domain Blueprint**: Memperbaiki pemformatan nama domain dari URL sumber cetak biru (blueprint) agar menampilkan hostname yang valid, menggantikan penulisan statis `'Source'`.
- **Konsistensi Bahasa Draf**: Menyelesaikan pencampuran bahasa (Inggris + Indonesia) dengan menerapkan pemaksaan nilai `outputLanguage` dari metadata artikel sebagai instruksi batasan bahasa yang eksplisit dalam generator draf.
- **Deduplikasi Sumber Blueprint**: Mencegah duplikasi visual pada daftar panel samping dengan menyaring alamat URL sumber blueprint baru terhadap daftar sumber yang telah terkumpul sebelumnya.

## [0.37.0] - 2026-06-23

### Added
- **Multi-language Support (i18n)**: Menambahkan dukungan dual-bahasa (Inggris sebagai default dan Indonesia dengan prefix `/id`) menggunakan pustaka `next-intl`.
- **Locale Routing Infrastructure**: Memigrasikan seluruh rute UI App Router ke dalam segment dinamis `src/app/[locale]/` untuk melayani halaman berdasarkan bahasa.
- **Translation Dictionaries**: Membuat berkas terjemahan `messages/en.json` dan `messages/id.json` sebagai sumber kebenaran tunggal (*single source of truth*) untuk teks UI.

### Changed
- **Middleware Integration**: Merombak `src/proxy.ts` untuk menggabungkan integrasi autentikasi Clerk dengan sistem routing `next-intl`. Middleware kini membersihkan prefix bahasa sebelum melakukan pengecekan akses (seperti *Feature Flags*) agar logika bypass tetap berjalan normal pada rute spesifik bahasa.
- **Auth Page Localization**: Melakukan refactoring pada komponen `AuthPageShell.tsx` untuk menarik kata-kata secara dinamis menggunakan hooks `useTranslations`, menggantikan teks statis berbahasa Inggris.

### Fixed
- **Next.js Linting & Type Errors**: Memperbaiki peringatan *exhaustive-deps* pada efek samping *slideshow* di `AuthPageShell.tsx`, mengganti elemen HTML `<a>` dengan komponen `<Link>` dari `next/link` di `global-error.tsx`, serta menetapkan tipe TypeScript yang lebih ketat (`"en" | "id"`) untuk menggantikan tipe `any` pada berkas konfigurasi *i18n*.

## [0.36.1] - 2026-06-23

### Added
- **Backend: Redis & BullMQ Foundation**: Menginstal `bullmq` dan `ioredis` di `eai-backend` serta menyusun infrastruktur *queueing* (`queue.ts` dan `worker.ts`). Fondasi ini disiapkan untuk mendukung tugas *background processing* asinkron di masa depan (seperti *scraping* atau tugas masal) tanpa memblokir API Server. Keputusan sadar diambil untuk *tidak* memigrasikan *endpoint* `/api/analyze` ke sistem *queue* ini guna mempertahankan performa UX *SSE Streaming* yang bersifat *real-time* di sisi *frontend*.

### Changed
- **Backend: PM2 Ecosystem Separation**: Merombak konfigurasi `ecosystem.config.cjs` untuk memisahkan *entry point* API Server (`server.ts`) dan AI Worker (`worker.ts`) menjadi dua aplikasi (*apps*) independen di bawah kendali PM2.
- **Backend: Memory Constraints Optimization**: Menambahkan parameter ketat `max_memory_restart: '150M'` dan `node_args: '--max-old-space-size=150'` pada PM2 untuk kedua proses (*server* dan *worker*). Langkah krusial ini dilakukan untuk mengamankan VPS produksi berkapasitas 512MB RAM, memaksa *Garbage Collector* (GC) Node.js bekerja lebih agresif, dan secara efektif mencegah insiden *Swap Thrashing* memori yang dapat menurunkan performa eksekusi API secara drastis.

## [0.36.0] - 2026-06-22

### Added
- **Demo Page: PLG Redesign** (`/demo`): Merancang ulang secara menyeluruh halaman demo dengan alur *Product-Led Growth* (PLG) untuk meningkatkan konversi.
  - **Auto-fill Localized Draft**: Teks draf contoh otomatis terisi saat halaman dimuat berdasarkan bahasa browser pengguna (`id` → Bahasa Indonesia, lainnya → English). Tidak ada lagi layar kosong (*blank state*) yang membunuh konversi.
  - **Progress Stepper**: Menambahkan indikator tiga langkah di bawah header — `① Review Draft → ② See Improvements → ③ Save Workspace` — yang berubah secara dinamis mengikuti status analisis (Idle → Loading → Done).
  - **Demo Signup Modal**: Menambahkan modal elegan `"Save this result?"` dengan tombol `[Start Free]` dan `[Maybe Later]` yang tampil saat user menekan tombol Publish atau melebihi batas refine, menggantikan notifikasi *toast* yang mudah terlewat.
  - **"Continue Editing →" CTA Banner**: Banner berisi *copywriting* `"Your demo won't be saved. Create an account to keep your work."` muncul di bagian bawah editor setelah analisis berhasil.
  - **Dark Mode Default untuk `/demo`**: Halaman demo secara otomatis memaksa dark mode tanpa mengubah preferensi tema pengguna di halaman lain. Tema dikembalikan ke semula saat navigasi keluar.

### Changed
- **Demo Header Bersih**: Menghapus banner biru (`Demo Mode:`) yang mengganggu. Header kini menampilkan `EAI [Try Demo]` di sebelah kiri dan tombol `Login` + `Start Free` di sebelah kanan, dipisahkan garis vertikal tipis.
- **Sidebar Tersembunyi di Demo Mode**: `HistorySidebar` tidak ditampilkan di `/demo` agar editor mendapat ruang penuh dan fokus pengguna tidak terpecah.
- **Tombol Publish di Demo Mode**: Klik tombol "Publish" di mode demo kini membuka `DemoSignupModal` menggantikan *toast error*.
- **Sidebar Hover Icon Berbentuk Bulat**: Menyeragamkan efek hover seluruh ikon di sidebar menjadi bulat, konsisten dengan ikon pencarian.
- **Tombol Fast & Publish Minimalis**: Mengubah tombol mode analisis menjadi ikon + teks singkat (`⚡ Fast` / `🚀 Publish`), teks disembunyikan otomatis di layar kecil.
- **Indikator Aktif Tab-Style**: Tombol Fast/Publish yang aktif kini ditandai dengan garis bawah berwarna *brand* (sama seperti tab Draft/Refined Draft), bukan kotak abu-abu.
- **Hover Efek "Write or Paste"**: Menambahkan efek hover yang jelas pada tombol "Write or Paste" di panel Draft kosong agar terlihat sebagai elemen yang dapat diklik.
- **Auto-fill Draft sebagai Initial State**: Teks demo diinisialisasi langsung di `useState()` menggunakan lazy initializer untuk menghindari *timing issue* — memastikan Editor tidak pernah merender *blank state* sebelum teks terisi.

### Fixed
- **UI Freeze on Navigation**: Menambahkan `loading.tsx` dengan Skeleton UI pada rute `/settings` dan `/dashboard` serta mematikan perilaku prefetch yang agresif (`prefetch={false}`) pada sidebar link. Ini memberikan *visual feedback* instan (mencegah layar seolah membeku) saat transisi Server Component.
- **Infinite Loading on Logout**: Memperbaiki bug *infinite loading spinner* (halaman tertahan terus menerus) setelah proses logout dengan memperbaiki konfigurasi Clerk v6. Properti `afterSignOutUrl` dihapus dari `<UserButton>` dan diatur secara global pada `<ClerkProvider afterSignOutUrl="/login">` untuk memastikan navigasi _client-side_ secara eksplisit.
- **Login Redirect di Sidebar**: Menambahkan tombol "Login" yang berfungsi di sidebar ketika user belum terautentikasi, menggantikan tombol profil yang tidak responsif.
- **ESLint Cleanup**: Menghapus import `SIGNUP_ENABLED` yang tidak lagi dipakai, serta menghapus variabel `activePlan` dan `displayName` yang dideklarasikan namun tidak digunakan di `HistorySidebar.tsx` dan `WorkspacePageShell.tsx`. Lint kini **0 warnings, 0 errors**.
- **ERR_HTTP_HEADERS_SENT**: Memperbaiki bug di EAI Backend saat mode demo melakukan analisis (*rate limit checking* dan pengaturan cookie yang sebelumnya dilakukan **setelah** stream SSE (*Server-Sent Events*) dimulai). Logika ini sekarang dipindahkan ke fase pre-flight sebelum header SSE dikirim.

## [0.35.0] - 2026-06-21

### Added
- **Workspace Routing**: Menambahkan halaman Workspace `/workspace` yang menjadi pusat untuk semua manajemen konten dan proyek editorial.
- **Editorial Workspace Component**: Membuat komponen `EditorialWorkspace` baru yang berfungsi sebagai antarmuka utama untuk pengguna mengelola ruang kerja editorial mereka.
- **Demo Page**: Menambahkan halaman demo di `/demo` untuk menampilkan fungsionalitas penuh aplikasi.

### Changed
- **Robots.txt Update**: Mengubah konfigurasi `robots.txt` untuk melarang pengindeksan halaman Workspace oleh mesin pencari.
- **Pricing Page Relocation**: Memindahkan halaman harga `/pricing` eai ke `/pricing` landing page dan memperbarui tautan internal di seluruh aplikasi.

## [0.34.0] - 2026-06-21

### Added
- **MIT License**: Menambahkan berkas lisensi MIT di `eai-backend/LICENSE`.
- **EAI Backend README**: Menambahkan panduan inisialisasi, konfigurasi, dan eksekusi skrip di `eai-backend/README.md`.
- **Gitignore**: Menambahkan `.gitignore` konfigurasi standard Node.js/TypeScript di `eai-backend`.

### Changed
- **Penyelarasan Legalitas & NIB/PSE**: Menyertakan status registrasi Nomor Induk Berusaha (NIB) dan pendaftaran Penyelenggara Sistem Elektronik (PSE) Kominfo RI pada dokumen syarat layanan (`terms/page.tsx`) dan kebijakan privasi (`privacy/page.tsx`) untuk perlindungan hukum resmi di Indonesia.
- **Pembaruan Daftar Pemroses Data Pribadi**: Memperbarui daftar pihak ketiga di kebijakan privasi untuk mencakup arsitektur terdistribusi Envoyou secara akurat: Biznet Gio (VPS Blog), DigitalOcean (VPS EAI), Supabase & Neon (Database), Cloudflare (DNS/Keamanan), Clerk (Autentikasi), Google Gemini API (Penyedia AI tunggal - menonaktifkan Groq), dan Midtrans (Gateway pembayaran tunggal - menonaktifkan DOKU).
- **Klausul Transfer Data Lintas Batas**: Menambahkan kebijakan transfer data internasional (*Cross-Border Data Transfer*) pada kebijakan privasi sesuai regulasi UU PDP No. 27/2022 dan GDPR Pasal 6.
- **Pembaruan Konfigurasi Identitas Legal**: Mengubah nilai variabel `LEGAL_OPERATOR_NAME` menjadi `"Envoyou"` dan `LEGAL_REGISTERED_ADDRESS` menjadi `"Banyuwangi, Jawa Timur, Indonesia"` pada berkas `.env` dan `.env.example`.
- **Pemisahan Monolit EAI**: Memisahkan repo monolit EAI menjadi dua bagian terpisah secara fungsional: Next.js Frontend (`ai-editorial-system`) dan Express.js Backend (`eai-backend`).
- **Dynamic API Proxying**: Mengubah `src/proxy.ts` pada frontend untuk mem-proxy rute `/api/*` secara dinamis ke VPS Backend dengan menyisipkan token Clerk JWT dalam header Authorization Bearer.
- **Pemisahan Environment Variables**: Mengurangi tumpukan variabel lingkungan di frontend dengan membatasi `.env`, `.env.example`, dan `.env.local` hanya pada kebutuhan rendering & Clerk client, serta memindahkan seluruh variabel rahasia (Database Neon, payment gateway API keys, Edge Config write tokens, API keys Gemini/Groq, Zoho Desk) ke backend `.env`.
- **Decoupled Workspace State**: Mengubah `getWorkspaceState` di `src/lib/user-workspace.ts` frontend untuk menggunakan fetch server-side ke VPS API `/api/workspace/state` alih-alih query langsung ke database.
- **Billing History Fetch**: Mengubah `BillingSettingsPage` di `src/app/settings/billing/page.tsx` untuk mengambil riwayat pembayaran dari backend `/api/payments/recent`.

### Removed
- **Unused DB Footprint on Frontend**: Menghapus modul database `src/lib/db.ts`, model Prisma `prisma/`, prisma config `prisma.config.ts`, serta dependensi database (`@neondatabase/serverless`, `@prisma/adapter-neon`, `@prisma/client`, `pg`) dari `package.json` frontend.
- **Next.js Local API Routes**: Menghapus folder `src/app/api` dari frontend karena seluruh endpoint telah dimigrasikan ke Express.js backend.

## [0.33.0] - 2026-06-18

### Added
- Menambahkan halaman pengaturan akun (Account Settings) baru di `src/app/settings/account`.
- Menambahkan menu pintasan **Validation Report** pada *sidebar Dashboard*, yang dibatasi (*conditional rendering*) hanya untuk pengguna dengan akses *Owner/SuperAdmin*.

### Changed
- Pembaruan desain UI secara menyeluruh ke gaya _seamless_ dan tanpa batas (_borderless_) yang lebih premium, di mana warna Header, Tab Bar, dan Status Bar menyatu dengan latar belakang (_background_).
- Mengubah tampilan efek _hover_ pada Tab Bar dan tab opsi dokumen (Preview, Markdown, Changes) menjadi lebih membulat (_rounded_). Indikator tab aktif juga diubah menggunakan gaya _underline_ yang minimalis.
- Menyederhanakan elemen teks (seperti kata dan karakter) di Status Bar dengan menghapus balok latar belakang (_badge background_).
- Warna latar belakang Workspace Sidebar sekarang mengikuti status buka-tutup (menyesuaikan warna _background_ utama saat ditutup, warna spesifik saat dibuka).
- Menghaluskan efek _hover_ pada tombol "SEO Metadata" di panel Feedback.

### Removed
- Menghapus komponen `ActivityBar.tsx` untuk lebih menyederhanakan navigasi di lingkungan Editor.
- Menghilangkan menu *switch* AI Provider dari antarmuka Status Bar UI. Editor akan secara otomatis dan tanpa gangguan (senyap) menggunakan "Gemini" pada setiap panggilan *backend API*.

### Fixed
- Memperbaiki masalah *layouting* ganda (*double sidebar*) pada halaman *Validation* dengan mengatur `DashboardLayoutShell` untuk melakukan *bypass layout* secara spesifik pada *route* `/dashboard/validation`.
- Membersihkan dan memperbaiki berbagai *Lint Warnings* dan *TypeScript compilation errors* di berbagai komponen inti, termasuk optimalisasi *imports*, pembersihan fungsi tak terpakai, serta kepatuhan terhadap aturan *React Hooks*.

## [0.32.0] - 2026-06-15

### Changed
- Mengganti flag eksperimental yang belum digunakan dengan kontrol operasional EAI untuk maintenance, pemrosesan AI, export CMS, billing checkout, demo, signup, dan pricing melalui Vercel Edge Config.
- Menjadikan Edge Config sebagai otoritas runtime untuk route publik dan operasi sensitif, dengan `NEXT_PUBLIC_*` tetap digunakan sebagai fallback saat koneksi Edge Config tidak tersedia.
- Menambahkan halaman status EAI yang branded untuk maintenance serta fitur signup/pricing yang sengaja dinonaktifkan, dengan akses support dan jalur pemulihan khusus system owner.

### Fixed
- Menghubungkan panel **System Feature Flags** ke perilaku aplikasi sebenarnya: maintenance dan AI kill switch kini menghentikan proses editorial, billing flag menghentikan checkout baru tanpa mematikan webhook pembayaran, dan CMS flag menghentikan export.
- Membatasi dashboard dan server action hanya pada key feature flag yang dikenal serta memfilter item Edge Config non-boolean agar tidak muncul sebagai toggle sistem.
- Memperbaiki update Edge Config milik Vercel Team dengan meneruskan `VERCEL_TEAM_ID` atau system env `VERCEL_ORG_ID`, serta menampilkan diagnosis token, scope team, dan Edge Config ID tanpa mengubah kegagalan konfigurasi menjadi error 500 generik.
- Mengganti layar global **Internal Server Error** bawaan dengan recovery screen profesional dan meneruskan pesan operasional API ke editor saat AI processing atau layanan terkait dinonaktifkan.
- Mencegah halaman maintenance ikut gagal ketika Edge Config lambat dengan melewati pembacaan flag pada route status/support/owner recovery dan membatasi pembacaan middleware menjadi satu detik dengan fallback aman.
- Memperbaiki `TypeError: immutable` pada redirect feature flag dengan memakai `NextResponse.redirect`, sehingga Clerk dapat menambahkan header autentikasi sebelum halaman maintenance atau unavailable dikirim ke browser.
- Menyembunyikan shortcut **Try demo mode**, link Pricing, dan CTA signup pada halaman autentikasi berdasarkan nilai Edge Config terbaru, bukan nilai `NEXT_PUBLIC_*` yang tertanam saat build.

## [0.31.2] - 2026-06-15

### Fixed
- Memperbaiki integrasi Sentry pada Next.js 16 dengan memindahkan inisialisasi browser ke `instrumentation-client.ts`, mendaftarkan runtime server dan edge melalui `instrumentation.ts`, serta menangkap error global App Router.
- Memperbaiki tombol **Test Error Capture** agar memverifikasi SDK browser, menunggu pengiriman event, dan menampilkan Sentry Event ID atau status kegagalan alih-alih selalu melaporkan sukses berdasarkan keberadaan DSN.
- Mengaktifkan konfigurasi autentikasi upload source map melalui `SENTRY_AUTH_TOKEN` agar stack trace production dapat dipetakan dengan benar saat deployment Vercel.

## [0.31.1] - 2026-06-15

### Added
- support and changelog links to navigation in login page.

## [0.31.0] - 2026-06-15

### Added
- Menambahkan onboarding dua fase: user wajib membuat atau memilih Clerk Organization terlebih dahulu, kemudian mengisi Publication Identity, editorial standards, dan opsi CMS tanpa membuat workspace lokal kedua.
- Menambahkan layar pemilihan/pembuatan workspace Clerk pada `/onboarding` serta mengubah organisasi Clerk menjadi sumber identitas permanen untuk `name`, `slug`, dan `clerkOrganizationId`.
- Menambahkan isolasi onboarding draft berdasarkan `organizationId` agar progres dan kredensial CMS tidak terbawa ketika user berpindah organisasi.
- Menambahkan alokasi trial workspace yang idempoten: 10 kredit gratis diberikan kepada organisasi Clerk yang dibuat oleh user eligible, bukan kepada setiap anggota atau setiap organisasi yang dipilih.
- Menambahkan metadata `Organization.createdByUserId` untuk membedakan creator workspace dari anggota undangan dan mencegah penumpukan trial melalui banyak membership.
- Menambahkan runbook [Production Database Migrations](./docs/PRODUCTION_DATABASE_MIGRATIONS.md) untuk mencatat migrasi staging yang belum diterapkan di production serta urutan verifikasi sebelum deploy.
- Menambahkan sistem *Feature Flags* terpusat berbasis Vercel Edge Config dengan antarmuka *Dashboard* Super Admin (`/settings/system/feature-flags`) untuk mengubah fitur secara instan (*0ms latency*) ke seluruh *tenant*.
- Menambahkan integrasi pemantauan kerusakan dan performa (Telemetry & Logs) menggunakan SDK Sentry (`@sentry/nextjs`), lengkap dengan panel "Mission Control" (`/settings/system/telemetry`) untuk mengecek status DSN dan melakukan simulasi *error*.
- Memigrasikan Dashboard Analitik yang monolitik menjadi *Nested Routes* (`/dashboard/overview`, `/dashboard/performance`, `/dashboard/trends`, `/dashboard/productivity`) menggunakan pola komposisi *Layout* dan disematkan transisi mulus *Framer Motion*.
- Menambahkan proteksi lapis tiga (*3-Tier Access Control*) yang membedakan otoritas *Super Admin* (melalui `OWNER_USER_IDS`), *Tenant Admin*, dan Anggota pada rute `/settings/system/*`, `/settings/workspace/*`, dan `/settings/publication/*`.
- Menambahkan halaman `/settings` khusus pengguna terautentikasi dengan navigasi workspace yang konsisten, pengaturan profil dan tema, pemilihan organisasi aktif, ringkasan paket/kredit, preferensi auto-save dan bahasa output, serta default kategori, tipe artikel, audiens, dan panjang artikel.
- Menambahkan `WorkspacePageShell` responsif sebagai fondasi halaman internal dengan activity bar, sidebar yang dapat diciutkan, backdrop mobile, status footer, dan navigasi ke Editor, Dashboard, Publication Settings, serta Settings.
- Menambahkan sinkronisasi preferensi tema melalui local storage dan event browser agar perubahan light/dark/system tetap konsisten antara editor, activity bar, dan halaman Settings.

### Changed
- Memindahkan alokasi trial dari webhook `user.created` ke resolusi workspace creator. Ledger trial user lama akan dipindahkan secara aman ke ledger organisasi aktif, sedangkan anggota undangan tidak membawa trial tambahan.
- Mengubah aksi skip onboarding menjadi **Use defaults** yang hanya membuat profil editorial default pada Clerk Organization aktif dan tidak lagi membuat organisasi personal lokal.
- Mengunci API onboarding, aktivasi, dan pengujian CMS agar hanya berjalan ketika request memiliki Clerk Organization aktif yang sesuai.
- Menjadikan nama dan slug organisasi pada payload onboarding sebagai data canonical dari Clerk; nilai draft dari browser tidak dapat menimpa identitas workspace.
- Merelokasi halaman admin bawaan lama (`/admin/billing` dll.) ke dalam struktur pengaturan sistem (`/settings/system/tenants`) dan menghapus keseluruhan rute `/admin` demi kebersihan kode.
- Mendesain ulang hierarki UI panel pengaturan (*Settings*) agar menyerupai estetika bersih gaya *Linear* dengan meminimalisir garis batas luar dan menajamkan fokus panel.
- Mendesain ulang workspace editor menjadi antarmuka SaaS yang lebih rapat dan konsisten: radius, border, panel header, activity bar, tab bar, status bar, tombol, segmented control, sidebar history, drafting assistant, editorial review, dan refined draft kini memakai hierarki visual yang sama.
- Memindahkan pengaturan lengkap dari dropdown activity bar ke halaman Settings; tombol Settings kini membuka route khusus, sedangkan Demo Mode tetap diarahkan untuk masuk terlebih dahulu.
- Menyederhanakan wording dan tata letak Editor, Feedback Panel, Final Draft Panel, History Sidebar, revision controls, SEO metadata, dan drafting assistant agar lebih mudah dipahami author/editor serta lebih responsif pada layar kecil.
- Meningkatkan aksesibilitas workspace dengan label form dan tombol yang lebih lengkap, elemen backdrop berbentuk button, state tab/section yang eksplisit, pengelolaan fokus pada modal shortcut, dukungan reduced motion, dan penyimpanan preferensi tema yang konsisten.
- Memperbarui aturan prompt Final Quality Gate agar `flags` hanya berisi label risiko nyata dan wajib berupa array kosong ketika tidak ada risiko.

### Fixed
- Mengamankan callback publikasi blog ke `/api/analytics/webhook` dengan validasi `X-EAI-Secret`, memakai shared secret yang sama dengan jalur ekspor draft EAI ke blog.
- Memperbaiki user baru yang tidak melihat 10 kredit gratis setelah login karena webhook sebelumnya menulis kredit ke ledger `userId`, sementara workspace membaca dan memotong saldo berdasarkan `organizationId`.
- Mencegah race antara Clerk webhook dan lazy organization sync yang sebelumnya dapat memicu unique constraint saat keduanya membuat record organisasi lokal secara bersamaan.
- Mencegah draft onboarding dan secret CMS organisasi sebelumnya digunakan setelah user mengganti Clerk Organization.
- Memfilter respons model seperti `All clear`, `No risks found`, `Tidak ada risiko`, `none`, dan `n/a` agar tidak tampil sebagai critical flag atau menurunkan readiness artikel yang sebenarnya siap.
- Memperbaiki dropdown Select yang sebelumnya tetap tertinggal pada posisi viewport saat halaman atau container digulir; menu kini menutup atau mengikuti anchor dengan benar.
- Memperbaiki tombol tiga titik pada Refined Draft agar menu download dapat dibuka selama refined draft tersedia tanpa bergantung pada kelengkapan metadata SEO untuk ekspor CMS.
- Mengganti posisi manual menu download Refined Draft dengan anchored popover sehingga menu tampil dekat dan sejajar dengan tombol tiga titik serta tetap benar saat panel berubah ukuran atau digulir.

## [0.30.0] - 2026-06-14

### Added
- Menambahkan halaman internal `/admin/billing` untuk owner/super-admin dengan pencarian email atau organisasi, saldo dan paket workspace, riwayat transaksi, serta adjustment kredit manual.
- Menambahkan ledger `manual_adjustment` yang tenant-safe dengan idempotency key, konfirmasi eksplisit, distribusi debit per bucket, dan audit terstruktur untuk pelaku, waktu, target organisasi, alasan, serta referensi tiket.
- Mengintegrasikan validasi read-only Zoho Desk pada adjustment kredit: admin memverifikasi tiket, melihat customer/subject/status, dan backend memvalidasi ulang tiket sebelum menyimpan Zoho ticket ID, nomor, serta URL pada audit ledger.
- Menambahkan halaman publik `/support` yang membuat tiket Zoho Desk secara server-side, mengembalikan nomor tiket kepada customer, serta melindungi endpoint dengan validasi, honeypot, batas ukuran, dan rate limit dasar.

## [0.29.2] - 2026-06-14

### Fixed
- Memperbaiki refinement report agar rasio aspek seperti `9:16` dan singkatan teknis `CTR` tidak salah ditandai sebagai fakta atau entitas baru.
- Memisahkan URL domain internal yang tidak cocok katalog sebagai **Internal Link Review**, bukan **External URL Review**.
- Menambahkan pilihan editor untuk memverifikasi, mengonfirmasi, atau menghapus/menetralkan temuan report, lalu menyimpan keputusan dan readiness ke history agar status ekspor tetap konsisten setelah reload.
- Memuat ulang saldo kredit saat pengguna mengganti Clerk Organization dan menampilkan nama workspace sumber saldo agar angka dari organisasi sebelumnya tidak tertinggal di Settings.
- Menghentikan active organization Clerk dari menimpa relasi default organization pengguna pada setiap request.
- Memperjelas alasan tombol Export to CMS terkunci, termasuk ketika artikel masih berupa Fast Preview atau belum lolos quality gate Publish Ready.

## [0.29.1] - 2026-06-14

### fixed
- update heading from "Pricing & Tokenomics" to "Plans & Credits"

## [0.29.0] - 2026-06-14

### Added
- **Visible payment confirmation status**:
  - Menambahkan order ID pada callback checkout dan banner pricing yang melakukan polling status order setelah pengguna kembali dari DOKU.
  - Menambahkan endpoint tenant-safe `/api/payments/status` agar pengguna dapat melihat status pending, paid, gagal, jumlah kredit, dan order ID tanpa akses ke order tenant lain.
  - Menambahkan log terstruktur saat notification payment diterima dan selesai diproses untuk observability admin melalui Vercel Runtime Logs.
  - Menambahkan reconciliation melalui DOKU Check Status API setelah 60 detik agar order dapat dikonfirmasi dan kredit dialokasikan meskipun HTTP Notification tidak tiba.
- **Phase A legal product foundation**:
  - Menambahkan halaman publik `/legal/terms`, `/legal/privacy`, dan `/legal/refund` dengan tanggal berlaku serta identitas operator berbasis environment.
  - Menambahkan dialog konfirmasi sebelum checkout yang menjelaskan pembayaran prepaid, manual renewal, kondisi refund, dan tautan dokumen legal.
  - Menambahkan konfigurasi `LEGAL_*` untuk nama operator, alamat terdaftar, serta kontak support, legal, dan privacy.
  - Menyelaraskan kontak publik dengan mailbox aktif: `info@envoyou.com` untuk legal/administratif dan `support@envoyou.com` untuk support serta permintaan privasi.
- **Payment transparency before checkout**:
  - Menampilkan harga USD, nominal final IDR, kurs konversi, jumlah dan masa aktif kredit, status pajak, serta manual renewal sebelum order dibuat.
  - Menambahkan konfigurasi `PAYMENT_USD_TO_IDR_RATE` dan `PAYMENT_TAX_LABEL`; backend checkout dan UI memakai sumber konfigurasi yang sama.
  - Menolak checkout dengan quote lama apabila nominal berubah sebelum order dibuat, sehingga pengguna harus meninjau ulang harga terbaru.
  - Memperbarui kurs referensi checkout menjadi IDR 17.779,30 per USD dan mempertahankan presisi desimal sampai nominal order dibulatkan ke rupiah terdekat.
- **Product rollout feature flags**:
  - Menambahkan flag publik terpusat untuk demo, signup, pricing, dan billing dengan konfigurasi awal demo/signup/pricing aktif serta billing nonaktif.
  - Saat billing nonaktif, tombol pembelian menampilkan **Coming Soon** dan API checkout mengembalikan `503`, sementara webhook tetap aktif untuk order lama.
  - Middleware dan guest API menegakkan flag demo, signup, dan pricing agar pembatasan tidak hanya berlaku pada UI.
- **Payment gateway adapters dengan DOKU sebagai default**:
  - Menambahkan kontrak payment provider bersama untuk checkout, verifikasi notification, dan normalisasi status transaksi.
  - Menambahkan integrasi DOKU Checkout dengan HMAC-SHA256 request/notification signature serta hosted payment URL.
  - Mempertahankan Midtrans Snap sebagai provider cadangan yang dapat diaktifkan melalui `PAYMENT_PROVIDER=midtrans`.
  - Menambahkan field `provider` pada `PaymentOrder`, migrasi database, template environment, dan checklist production DOKU.
  - Menambahkan test kontrak DOKU Sandbox untuk payload hosted checkout, redirect response, signature notification, status sukses/gagal, dan penolakan notification yang diubah.
  - Menolak kredensial contoh DOKU sebelum request checkout dikirim agar deployment yang belum dikonfigurasi gagal dengan pesan yang jelas.
- **Production-ready Midtrans checkout foundation**:
  - Menambahkan ledger `PaymentOrder` untuk menyimpan order pending sebelum transaksi Snap dibuat, sehingga webhook tidak lagi mempercayai plan, nominal, atau target akun dari `order_id`.
  - Menambahkan verifikasi status transaksi langsung ke Midtrans Status API sebelum kredit dialokasikan.
  - Menambahkan migrasi database dan panduan go-live Midtrans/Vercel di `docs/MIDTRANS_PRODUCTION.md`.
- **Premium Clean SaaS Auth Page Redesign**:
  - Mendesain ulang halaman masuk (`/login`) dan daftar (`/signup`) melalui komponen bersama `AuthPageShell` menjadi layout split-screen yang clean dan premium (deep ink `#070b14`).
  - Panel kiri (brand) menampilkan logo EAI, eyebrow + headline + deskripsi, daftar 4 keunggulan produk (Research & draft, brand alignment, fact-checking, one-click publish) dengan ikon Lucide, dan footer keamanan + versi dinamis dari `package.json`.
  - Panel kanan (form) menggunakan tata letak dua kolom pada layar lebar (`xl`) — kolom intro + kartu "Try demo mode" di kiri, form Clerk (maks. 380px) di kanan — sehingga form tidak memanjang ke bawah dan memanfaatkan ruang horizontal; otomatis menumpuk satu kolom pada layar kecil.
  - Menyelaraskan seluruh aksen ke satu warna brand utama (Envoyou Blue / `primary`) dengan tipografi sans yang konsisten.


- **Sybil Trial Abuse Prevention**:
  - Ditambahkan sistem proteksi pencegahan exploit trial gratis dengan mendeteksi pendaftaran ganda menggunakan Gmail alias (`+` dan `.`) dan email disposable di tingkat Clerk webhook (`user.created`).
  - Dibuat helper normalisasi email pintar di `email-utils.ts` yang membersihkan alias Gmail dan menolak domain disposable email.
  - Implementasi query database teroptimasi dengan prefix 3 huruf pertama dan domain email untuk mendeteksi kesamaan data tanpa membebani performa database.
  - Test suite unit & integrasi untuk pencegahan Sybil (`test-sybil-prevention.mjs`) dan target script NPM (`npm run test:sybil`).
- **Interactive Pricing Funnel & Comparison Table**:
  - Halaman pricing (`/pricing`) disusun ulang dengan urutan: Hero ➡️ Pricing Cards ➡️ Additional Credits ➡️ Compare Plans Table ➡️ FAQ Accordion ➡️ Final CTA.
  - Struktur pricing dilindungi dengan anchor prices ($10 Starter, $19 Pro, $79 Team) di kedua opsi billing bulanan/tahunan, serta visualisasi khusus untuk paket Pro dengan Envoyou Blue brand.
  - Bagian Additional Credits seharga $8 untuk 50 kredit ("Unused credits never expire").
  - Bagian FAQ Accordion interaktif berisi 7 tanya-jawab seputar sisa kredit, transfer, rollover, dan onboarding.
  - Banner Final CTA untuk mengarahkan registrasi trial dengan 10 kredit gratis.
- **Active Plan Indicator on Pricing**:
  - `PricingGrid` kini memanfaatkan data `workspace` untuk menormalisasi langganan aktif ke tier dasar (mengabaikan prefix `org:` dan suffix `_yearly`).
  - Kartu plan yang sedang dimiliki user ditandai badge "Current", dan tombol checkout-nya berubah menjadi state "Current Plan" non-clickable (lewat prop `current` baru di `PricingCheckoutButton`).

### Changed
- Menautkan Terms, Privacy Notice, dan Refund Policy dari halaman auth dan pricing serta membuka seluruh route `/legal/*` tanpa login.
- Checkout organisasi kini memakai ID workspace lokal dan hanya dapat dimulai oleh admin workspace.
- Simulator pembayaran hanya tersedia pada development dengan flag dan secret eksplisit; production tidak lagi fallback diam-diam ke simulator.
- Paket tahunan kini aktif selama 12 bulan dan memberikan alokasi kredit prepaid 12 bulan di muka. Auto-renew recurring belum diaktifkan.
- **Demo dan mode editorial dipisahkan lebih tegas**:
  - Guest/demo selalu diproses sebagai `fast` preview di server, sedangkan pilihan Publish Ready dari UI dipetakan ke analisis `deep`.
  - Refine dan targeted fix kini mempertahankan mode analisis yang dipilih agar Fast Preview tidak secara tidak sengaja menjalankan pipeline Publish Ready.
  - Copy dan download hasil dikunci selama Demo Mode; download baru tersedia setelah artikel menjalani Publish Ready.
- **CMS export dan onboarding diperketat**:
  - Kapabilitas export CMS kini hanya aktif untuk workspace Envoyou internal atau tenant dengan koneksi CMS aktif dan berstatus `verified`.
  - Endpoint export memverifikasi metadata analisis tersimpan dan hanya menerima artikel Publish Ready dengan quality gate `ready` serta status editor `refined`.
  - Aktivasi onboarding memverifikasi ulang koneksi CMS menggunakan kredensial terenkripsi sebelum workspace diaktifkan.
  - Hanya admin Clerk Organization yang dapat mengubah onboarding workspace atau menguji koneksi CMS.
- **English UI and operational messages**:
  - Menyeragamkan label credit balance, deskripsi paket, pesan checkout/Midtrans, payment simulator, insufficient credits, quality gate warning, dan deskripsi ledger billing ke bahasa Inggris.
  - Pesan error API draft dan outline kini diteruskan ke UI agar kegagalan server tampil lebih spesifik kepada pengguna.
- Memperbarui `docs/future-roadmap.md` berdasarkan implementasi aktual, termasuk status parsial CMS, profil editorial tenant, workspace sumber, serta pricing dan alokasi kredit yang berlaku.
- Membagi roadmap **Legal dan Compliance untuk Paid SaaS** berdasarkan traksi pelanggan: Phase A untuk 1–10 pelanggan pertama, Phase B untuk validasi 10–50 pelanggan, Phase C untuk pertumbuhan 50–200 pelanggan, dan Phase D ketika kebutuhan kontrak enterprise muncul.
- Checkout dan webhook kini memilih adapter berdasarkan provider order; pergantian DOKU/Midtrans dilakukan melalui environment tanpa mengubah ledger subscription atau kredit.
- **Premium Clean Pricing Page Refresh** (tetap adaptif light/dark):
  - Menyatukan tipografi heading ke sans (menghapus `font-serif`) agar konsisten dengan halaman auth.
  - Menyeragamkan aksen seluruh checkmark dan elemen ke satu warna brand (`primary`), menggantikan campuran emerald + biru.
  - Menghapus animasi `animate-pulse` pada ikon balance & top-up, serta mengurangi `backdrop-blur`, gradien, dan shadow berlebih.
  - Mengganti blok "Additional Credits" bergradien gelap menjadi panel adaptif yang menyatu, menyamakan radius kartu (`rounded-2xl`), dan melebarkan kontainer (`max-w-4xl` ➡️ `max-w-5xl`) agar kartu lebih bernapas.

### Fixed
- Mengarahkan pengunjung yang mencoba checkout tanpa sesi ke halaman login lalu kembali ke pricing, alih-alih hanya menampilkan pesan `Unauthorized`.
- Memperbaiki Clerk `protect-rewrite` yang mengubah respons `/api/checkout` tanpa sesi menjadi halaman HTML 404; endpoint kini selalu mengembalikan error JSON dari handler dan UI menangani respons non-JSON tanpa syntax error.
- Memperbaiki respons `404` saat pengguna demo menjalankan **Generate with AI** dengan mendaftarkan `/api/draft` sebagai public route yang tetap menerapkan batas kuota demo di dalam endpoint.
- Memperbaiki inisialisasi `ReadableStream` pada AI Draft agar pekerjaan async berjalan setelah stream tersedia, sehingga respons NDJSON dapat mulai dikirim tanpa menunggu seluruh proses generation selesai.
- Memperbaiki kondisi tombol export yang sebelumnya masih dapat tersedia untuk hasil selain readiness `ready`; UI dan API kini sama-sama menegakkan syarat Publish Ready.

## [0.28.0] - 2026-06-13

### Added
- **Dashboard Separation (Tenant vs Owner)**: Memisahkan dashboard analitik menjadi dua tampilan terpisah berdasarkan peran dan tujuan:
  - **Dashboard Tenant (`/dashboard`)**: Menampilkan metrik operasional editorial untuk admin tenant tanpa data investasi/internal.
  - **Dashboard Owner/Internal (`/dashboard/validation`)**: Halaman khusus owner EAI (internal) untuk meninjau laporan validasi kualitas produk (*investor KPIs*), telemetry detail, serta toggle Demo Mode.
  - **Owner Auth Guard**: Memproteksi rute `/dashboard/validation` dan `/api/analytics/validation` melalui pengecekan `OWNER_USER_IDS` di environment.
- **Tenant Analytics Features Upgrade**: Menambahkan 5 fitur analitik baru pada dashboard tenant (`/dashboard`):
  - **Per-user breakdown**: Menyediakan tabel produktivitas dan penilaian coaching editor ("Editor Productivity & Coaching") lengkap dengan status otomatis (*Top Performer*, *Coaching Suggested*, *Active*).
  - **Time-to-publish**: Menghitung rata-rata waktu pemrosesan artikel dari draf pertama hingga diterbitkan/diekspor (`exported`).
  - **Revision count per article**: Melacak rata-rata frekuensi iterasi analisis per artikel.
  - **Category/topic breakdown**: Menampilkan kartu distribusi kategori tulisan ("Category Distribution") disertai visualisasi *progress bar* yang elegan.
  - **Weekly/monthly comparison**: Menambahkan indikator perbandingan performa MoM (Month-over-Month) dengan badge tren naik/turun (▲ / ▼) pada Summary Cards (Total Reviews, Ready Rate, Total Flags).
- **CSV Export Upgrade**: Memperluas fitur ekspor laporan ke CSV untuk menyertakan data rincian kontribusi editor, penyebaran kategori tulisan, metrik perbandingan performa, serta rata-rata revisi dan waktu terbit.
- **Date Range Selector for Analytics**: Menambahkan kontrol interaktif berupa dropdown pilihan rentang waktu (7 Hari, 30 Hari, 90 Hari, Bulan Ini, Bulan Lalu, All Time) dan input rentang tanggal kustom (*custom date range*) di dashboard.

### Changed
- **Cohesive Brand Visuals**: Menyelaraskan seluruh warna ikon analitik (*highlights* kartu ringkasan, ikon judul panel analitik, dan *progress bar* kategori) ke warna brand utama Envoyou (`primary` / indigo) untuk menyajikan antarmuka visual yang konsisten dan premium.
- **Query-level Date Filtering & Combined Period**: Mengubah pengambilan log analitik agar memfilter tanggal langsung di query Prisma database berdasarkan rentang waktu terpilih beserta rentang perbandingannya.
- **Database Query Select Optimization**: Mengoptimalkan seleksi kolom Prisma dengan mengecualikan kolom `content` draf artikel yang berukuran besar, sehingga menghemat bandwidth database dan meminimalkan penggunaan memori server.
- **Dynamic Period Comparison**: Menghitung tren persentase performa operasional (total review, ready rate, total flags) secara dinamis membandingkan rentang waktu terpilih dengan periode waktu sebelumnya.

### Fixed
- **ResponsiveContainer Size Warning**: Mengatasi warning ukuran grafik Recharts (`width(-1)` dan `height(-1)`) dengan menetapkan tinggi numerik piksel secara langsung pada elemen pembungkus dan menyematkan prop `debounce={50}`.

## [0.27.1] - 2026-06-12

### Changed
- **Model Pricing Update:** Memperbarui daftar harga default model Gemini bawaan untuk menyelaraskan dengan Paid Tier standar dari Google Gemini API ($1.50 input / $9.00 output per 1M token untuk Gemini 3.5 Flash, dan $0.25 input / $1.50 output untuk Gemini 3.1 Flash-Lite).
- **Public API Stats Enhancement:** Memperluas endpoint `/api/public-stats` agar mengembalikan biaya rata-rata AI per artikel dalam mata uang USD (`avgAiCostPerArticle`), versi pricing aktif (`pricingVersion`), draf terproses per bulan (`draftsThisMonth`), rata-rata waktu pemrosesan (`avgProcessTimeMins`), serta draf selesai dipoles (`finishedDrafts`).

### Fixed
- **API Cost Per Refined Calculation:** Memperbaiki kalkulasi rata-rata pengeluaran API per artikel yang sebelumnya membagi total biaya dengan seluruh telemetry logs (termasuk draf pengecekan biasa), kini dibagi berdasarkan jumlah draf yang benar-benar berhasil dipoles (`editorStatus: refined / exported`).
- **Refinement Log Status:** Memastikan database log dari run iterasi perbaikan (`role: refine`) disimpan dengan status `editorStatus: 'refined'` alih-alih default `'draft'`, agar terhitung secara akurat dalam dashboard analitik dan widget riwayat workspace.

## [0.27.0] - 2026-06-11

### Added
- Endpoint Publik Terproteksi: Membuat rute API baru di `/api/stats/public` yang mengembalikan data agregat total draf (totalDrafts), rasio kesiapan (readyRate), dan status uptime.
- Token Pengaman: Rute ini dilindungi menggunakan header x-api-key dengan token rahasia PUBLIC_STATS_TOKEN.

## [0.26.1] - 2026-06-10

### Fixed
- Memperbaiki tombol "Write Manually" di panel editor yang tidak berfungsi karena penetapan spasi tunggal `" "` untuk beralih mode bertabrakan dengan evaluasi trim kosong `!value.trim()` pada welcome screen. Sistem kini menggunakan state `isWritingManually` yang lebih eksplisit untuk melacak pilihan penulisan manual dan me-reset state ini secara otomatis saat draf dikosongkan/dibersihkan secara eksplisit.

## [0.26.0] - 2026-06-10

### Added
- Menambahkan fitur **AI Drafting Assistant** terintegrasi ke dalam Editor workspace, memungkinkan pengguna (Author & Editor) membuat draf artikel kasar (*rough draft*) langsung di dalam EAI dari deskripsi topik, outline opsional, dan catatan referensi.
- Membuat API endpoint baru `/api/draft` yang mendukung *streaming* respons draf menggunakan protokol Server-Sent Events / NDJSON, lengkap dengan mock mode lokal dan pembatasan Guest Mode.
- Mengintegrasikan form asistensi draf pada antarmuka `Editor` dengan visualisasi status sinkronisasi metadata secara real-time dan transisi otomatis ke mode penulisan manual.
- Menyimpan log riwayat pembuatan draf ke Neon PostgreSQL dengan penanda khusus `role = "draft_generation"`.
- Menambahkan **Interactive Outline Builder** yang mendukung streaming outline terstruktur (H2/H3 dan poin-poin utama) langsung ke kolom input draf sebelum menulis draf penuh, serta dicatat dengan `role = "outline_generation"`.
- Menambahkan **URL Reference Scraper** pada endpoint `/api/scrape` untuk mengekstrak paragraf dan judul bersih dari URL rujukan secara asinkron tanpa boilerplate navigasi/footer, lengkap dengan penanganan kegagalan baywall/Cloudflare secara aman.
- Menyediakan mode baru **Press Release** yang memodifikasi instruksi Gemini untuk secara aktif mengikis bahasa pemasaran (*marketing hype*), kata kunci kosong, dan bias promosi dari pengumuman korporat menjadi draf berita yang objektif.
- Mengoptimalkan UI/UX asisten draf dengan menyembunyikan input yang tidak relevan secara dinamis berdasarkan tab mode aktif (From Topic, From Outline, References, Press Release) dan menyanitasi parameter kiriman untuk menghindari tabrakan masukan.
- Mendokumentasikan rancangan konseptual **Workspace NotebookLM-Style & Deep Research Agent** di masa mendatang pada peta jalan proyek (`docs/future-roadmap.md` Fase 4).

### Changed
- Memperbarui peta jalan masa depan (`docs/future-roadmap.md`) dengan menandai beberapa fitur jangka pendek-menengah yang telah diimplementasikan sebagai selesai (optimalisasi latensi lewat streaming draf, asisten *Fact-Checker*, dan sinkronisasi akun pengguna berbasis database).

### Fixed
- Melokalkan pesan evaluasi, saran perbaikan, dan ringkasan pada pemeriksaan kualitas deterministik lokal (`final-quality.ts`) ke Bahasa Inggris secara dinamis ketika pengaturan `Output Language` bernilai `en` (atau otomatis terdeteksi `en` pada mode `follow_draft`), guna mencegah laporan evaluasi yang tercampur bahasanya.

## [0.25.1] - 2026-06-10

### Added
- Menambahkan indikator visual batas panjang karakter (character count hint) secara dinamis pada berbagai field input form di Onboarding Wizard dan Editorial Control Room (seperti brand name, positioning, audience, custom instructions, base URL, connection name, dll.).

### Changed
- Meningkatkan batas karakter untuk field `positioning` dan `audience` pada profil editorial dan skema onboarding dari 300 karakter (`singleLineString`) menjadi 1000 karakter (`multiLineString`) guna mendukung masukan multi-baris yang lebih fleksibel.

### Fixed
- Menangani error unique constraint pada database Prisma dengan menghapus record user lama (orphaned Clerk user) yang memiliki email sama tetapi ID berbeda sebelum membuat record baru.
- Memperbaiki format respons error validasi onboarding PUT & POST agar menyertakan detail error Zod (`parsed.error.issues`) alih-alih bentuk flattened, serta menambahkan log error detail ke console backend untuk mempermudah debugging.

## [0.25.0] - 2026-06-10

### Added
- Menambahkan Demo Mode (Guest Mode) yang memungkinkan pengguna mencoba editor dan fitur refine article secara langsung tanpa perlu masuk/login terlebih dahulu.
- Membatasi kuota demo maksimal 2 kali refinement menggunakan kombinasi client-side `localStorage` dan server-side HTTP-Only cookie `eai_demo_count`.
- Mengunci fitur premium (Dashboard, Publication Settings, Export ke CMS) dengan pesan peringatan berbahasa Inggris dan ajakan untuk Sign Up/Sign In.
- Bypass pencatatan log analisis ke database (`prisma.analysisLog.create`) untuk sesi guest guna menghindari polusi database dan kesalahan foreign key constraint.
- Menambahkan tombol **Try Demo Mode (No Login)** di bagian bawah form login dan signup pada `AuthPageShell` untuk mempermudah akses langsung ke workspace demo.
- Menambahkan status **History Locked** di sidebar riwayat untuk menyembunyikan log dan menonaktifkan fetch API saat Demo Mode aktif, guna menghindari pemanggilan request 401.
- Mendaftarkan endpoint `/api/workspace/config` sebagai public route di Clerk middleware agar client yang belum terautentikasi dapat menerima respons 401 dan beralih ke Demo Mode secara benar.
- Mengalihkan penambahan kategori/tipe artikel baru (`handleAddNewCategoryOrType`) ke pembaruan state lokal secara langsung jika Demo Mode aktif, mencegah error `401 Unauthorized` saat mencoba menyimpan preferensi workspace tanpa login.

### Fixed
- Mencegah false positive `Unsupported Quantitative Claim` dan `Unsupported Entity Detail` ketika angka (seperti tahun `2026`) atau entitas berada di dalam URL tautan internal/eksternal yang disisipkan oleh sistem dengan melakukan pembersihan (stripping) URL sebelum memindai draf.
- Mengenali dan memproses rasio portofolio seperti `60/40` sebagai satu kesatuan token angka tunggal (bukan angka terpisah `60` dan `40`), serta memperluas normalisasi spasi rasio (seperti `60 / 40`) agar setara.


## [0.24.0] - 2026-06-10

### Changed
- Memecah runtime AI dari `api/analyze/route.ts` ke modul `src/lib/ai`: provider/model configuration, input-boundary context, unified Gemini/Groq review, Final Quality Gate, SEO generation, dan targeted fix kini memiliki boundary tersendiri.
- Menyatukan streaming review, incremental JSON parsing, fallback mode, telemetry, dan schema validation Gemini/Groq agar kedua provider tidak lagi memiliki implementasi paralel yang mudah menyimpang.
- Menambahkan regression suite `npm run test:ai-runtime` untuk model routing, sampling Gemini 3, token budget, input-boundary, dan fallback prompt.

## [0.23.1] - 2026-06-09

### Fixed
- Mencegah false positive `Unsupported Quantitative Claim` ketika nominal yang sama di draft sumber dan draft final hanya memiliki tanda baca penutup berbeda, seperti `Rp147.900,` dan `Rp147.900.`.
- Mengenali dash setelah angka berunit dan kepanjangan akronim dengan kata ber-hyphen, sehingga format seperti `100%—` serta `Insurance-Linked Securities/ILS` tidak lagi dianggap sebagai fakta atau entitas baru.
- Menyamakan jalur targeted fix dengan pipeline utama: tenant prompt dan input-boundary guardrail kini diterapkan, data artikel dipisahkan dari system instruction, sampling Gemini 3 memakai default SDK, serta thinking dan output-token limit dikonfigurasi eksplisit.
- Mengaktifkan `ThinkingLevel.MINIMAL` dan output-token budget aman pada retry review Gemini agar token reasoning tidak menghabiskan jatah respons dan memotong structured JSON sebelum selesai.

### Changed
- Menaikkan `PROMPT_VERSION` ke `1.10.0` dan menghapus serialisasi penuh tenant profile yang sebelumnya mengulang konfigurasi yang sudah tertanam dalam stage prompt.

## [0.23.0] - 2026-06-09

### Changed
- Menetapkan Gemini sebagai provider default di backend, state awal editor, status bar, dan template environment; Groq tetap tersedia sebagai provider alternatif yang dapat dipilih.
- Menyederhanakan model routing Gemini menjadi hanya `gemini-3.5-flash` dan `gemini-3.1-flash-lite`; role `fact-checker` serta skrip factual guardrail tidak lagi memakai `gemini-2.5-pro`.
- Memigrasikan konfigurasi Gemini 3.x dari legacy `thinkingBudget: 0` ke `ThinkingLevel.MINIMAL` untuk quality gate, refine, rewrite, dan SEO, serta memakai `ThinkingLevel.MEDIUM` pada skrip factual guardrail.
- Menghapus harga `gemini-2.5-pro` dari tabel telemetry bawaan dan menjadikan `.env.example` sebagai template yang dilacak Git.
- Memperbarui diagram AI Evaluation Workflow pada README agar dimulai dari alur workspace aktual: login, tempel draf, pilih kategori/tipe artikel dan mode, klik `Refine Draft`, lalu review, rewrite, quality gate, serta SEO kondisional.

## [0.22.2] - 2026-06-09

### Added
- Menambahkan fondasi Clerk Organizations untuk mode B2B multi-tenant: organization Clerk disinkronkan ke tenant lokal EAI, onboarding dapat melengkapi active organization, dan Settings Menu kini menyediakan `OrganizationSwitcher`.
- Menambahkan structured output Gemini yang diturunkan dari schema Zod serta regression suite `npm run test:prompts` untuk kontrak prompt, quality gate, verdict per role, dan fallback SEO.
- Menambahkan model `Organization`, `EditorialProfile`, dan `EditorialProfileVersion` dengan pola create-new-version-on-edit serta proteksi database terhadap update/hard delete versi lama.
- Menambahkan prompt composer berbasis profil tenant, core guardrails platform yang tidak dapat dioverride, dan fallback profil Envoyou v1.
- Menyimpan profile version, core guardrail version, dan prompt configuration hash pada setiap `AnalysisLog`.
- Menambahkan regression suite `npm run test:profiles` untuk menjamin prompt Envoyou v1 tetap identik dan konfigurasi tenant terisolasi.
- Menambahkan halaman admin `Editorial Control Room` untuk mengelola identitas editorial, kategori, tone, struktur artikel, source policy, SEO, domain internal link, dan riwayat versi immutable.
- Menambahkan API admin-only untuk membaca profil organisasi aktif dan membuat versi konfigurasi baru tanpa memutasi versi sebelumnya.
- Menambahkan kontrak `CmsAdapter` serta adapter `envoyou-rest-v1` untuk katalog internal link dan export draft melalui boundary yang sama.
- Menambahkan regression suite `npm run test:cms` untuk kontrak katalog, payload export, autentikasi adapter, dan isolasi profil tanpa adapter.
- Menambahkan onboarding wizard lima langkah untuk organization, editorial identity, editorial rules, CMS connection, dan aktivasi workspace.
- Menambahkan `OnboardingDraft` agar progres dapat disimpan sebelum profile v1 dibuat, serta `CmsConnection` dengan credential terenkripsi AES-256-GCM.
- Menambahkan adapter eksternal `eai-rest-v1`, test connection read-only, aktivasi workspace atomic, dan regression suite `npm run test:onboarding`.
- Menambahkan regression suite `npm run test:json-stream` untuk parser JSON streaming, termasuk kasus partial feedback object, escaped newline, wrapped JSON, raw newline di string, dan trailing comma.
- Menambahkan normalizer Final Quality Gate response agar `summary` dan `changes` yang terlalu panjang dipotong secara deterministik sebelum validasi schema.
- Menambahkan cleanup final draft untuk artefak escaped Markdown/quote seperti `*\"daily work life\"*` serta koreksi typo aman `12 bawah terakhir` menjadi `12 bulan terakhir`.

### Changed
- Merapikan tampilan login/signup menjadi layout auth dua panel yang lebih bersih, konsisten dengan identitas EAI, dan menghilangkan kesan kartu Clerk yang bertumpuk.
- Menghapus dropdown role lokal `writer/editor/admin` dari Settings Menu agar tidak dobel dengan role organization Clerk.
- Memperjelas Settings Menu bahwa dropdown organization adalah workspace Clerk untuk tenant access, bukan nama editorial brand.
- Memperjelas header Editorial Control Room dengan label Workspace, Editorial Profile, Brand, serta mengganti `Profile key` menjadi internal profile key.
- Mengganti copy halaman admin menjadi lebih ramah author/editor: `Publication Settings`, `Publication Identity`, `Writing Standards`, `SEO & Links`, `Settings History`, dan menyamarkan istilah teknis seperti tenant/guardrails/configuration.
- Menyesuaikan onboarding agar active Clerk Organization dipakai sebagai workspace identity read-only; user hanya melengkapi publication/editorial profile EAI, bukan membuat organisasi kedua.
- Mengubah scoping workspace API utama agar membaca active organization dari session Clerk, menyimpan `organizationId` pada `AnalysisLog`, dan membatasi history/export/analytics berdasarkan tenant aktif.
- Menyelaraskan helper `src/lib` dengan kontrak prompt v1.4: quality gate dibatasi maksimal 5 feedback, 1-click apply menolak klaim faktual sensitif, konfigurasi tenant dinormalisasi lewat Zod, credential CMS divalidasi saat tulis/baca, dan limit katalog CMS dibatasi 1-100.
- Memisahkan editorial brief, instruksi refinement, feedback sebelumnya, dan draft dari system instruction ke user content terstruktur dengan input-boundary guardrail.
- Menggunakan sampling default untuk Gemini 3.x, memperketat kontrak quality gate, dan membuat fallback SEO selalu lolos validasi aplikasi.
- Membuat fallback SEO dan source-fidelity entity allowlist mengikuti profil editorial aktif.
- Membatasi katalog internal link legacy Envoyou agar tidak dipakai oleh profil tenant eksternal sebelum CMS Adapter per-tenant tersedia.
- Memindahkan pemanggilan CMS dari route analyze/export ke resolver adapter tenant-aware dan menyimpan `cmsAdapterKey` pada metadata export.
- Menghentikan assignment otomatis user baru ke organisasi Envoyou; user tanpa workspace completed diarahkan ke onboarding.
- Mengambil pilihan kategori dan tipe artikel pada editor/settings dari editorial profile aktif, serta menambahkan konfigurasi `articleTypes` pada onboarding dan Editorial Control Room.
- Menaikkan `PROMPT_VERSION` hingga `1.9.0` dengan deskripsi JSON schema untuk structured output Gemini, aturan operasional tenant yang lebih eksplisit, source policy per tenant, dan pedoman konteks temporal yang lebih ketat.
- Menyelaraskan prompt editorial utama menjadi English-first untuk kebutuhan audiens global Envoyou, termasuk role prompt, SEO metadata, polish diagnosis, rewrite, quality gate, refinement, fallback instruction, dan dev mock output.
- Mengubah default aplikasi baru menjadi English-first dengan `profile.language: "en"` dan `outputLanguage: "en"`.
- Mengurangi redundancy schema pada prompt Gemini: structured-output Gemini kini mengandalkan `responseJsonSchema`, sementara schema teks tetap dipertahankan untuk Groq dan fallback compatibility.
- Mempersempit schema review Gemini agar tidak lagi mengizinkan field yang tidak diperlukan seperti `polishedDraft` dan `generatedMetadata`.
- Menambahkan `response_format: { type: "json_object" }` pada jalur Groq review/SEO yang menghasilkan JSON.
- Merapikan log internal linking ketika CMS adapter belum dikonfigurasi agar tetap jelas sebagai kondisi non-fatal.

### Fixed
- Memperbaiki kegagalan Analysis/Polish akibat `summary` model melebihi batas 280 karakter dengan normalisasi sebelum Zod parse.
- Memperbaiki kegagalan Final Quality Gate akibat item `changes` model melebihi 180 karakter.
- Memperkuat parser JSON streaming Gemini/Groq agar scalar partial seperti `score`, `verdict`, dan `summary` hanya di-emit ketika value JSON sudah lengkap.
- Memastikan final draft publikasi tidak lagi membawa karakter backslash escape yang merusak estetika artikel.

## [0.22.1] - 2026-06-08

### Fixed
- Memastikan member pada active Clerk Organization tidak bisa mendapat akses admin dari fallback role lokal lama; saat `orgId` Clerk aktif, admin access hanya mengikuti `org:admin`.
- Memperbaiki runtime error Clerk pada halaman auth dengan memindahkan route login/signup ke catch-all `/login/[[...rest]]` dan `/signup/[[...rest]]`.
- Memperbaiki aksi **Add Source** pada Post-Polish Review Loop agar tetap berhasil ketika `targetText` dari quality gate berbeda format, mengandung ellipsis, sudah berubah menjadi Markdown link, atau tidak bisa ditemukan secara inline; sistem kini menambahkan fallback `Verification Notes` dan tetap menandai check sebagai verified.
- Memperbaiki aksi **Fix with EAI** agar endpoint `fix_targeted` tidak lagi tertolak oleh validasi umum `Text is required`, termasuk ketika payload targeted fix dikenali dari `targetText` + instruksi.
- Mencegah warning `Remaining checks` dobel untuk klaim verifikasi yang sama dengan dedupe berbasis target klaim ternormalisasi, tanpa menghapus warning berbeda yang valid pada kalimat yang sama.
- Memastikan `targetText` klaim faktual sensitif mengambil kalimat asli dari draft final, bukan snippet terpotong, sehingga aksi review loop bisa menemukan konteks yang benar.
- Memastikan Final Quality Gate menilai draft publikasi yang sama dengan panel **Draft Final**, bukan draft internal beranotasi, agar feedback tidak lagi meminta user menghapus marker internal seperti `[Citation recommended]`.

### Changed
- Menambahkan tampilan **Flagged claim** pada item verifikasi agar editor tahu klaim persis yang dimaksud oleh warning high-risk/needs-citation.
- Merapikan kartu **Source verified** di Refined Report: URL panjang kini ditampilkan sebagai domain + detail path yang responsif, dengan tombol copy dan open source.
- Memperluas tombol **Add Source** untuk semua feedback yang memiliki `verificationStatus`, bukan hanya kategori `Source Verification` dan `Source Fidelity`.

## [0.22.0] - 2026-06-08

### Added
- Menambahkan **Configurable Source Fidelity Allowlist** per tenant profile dengan arsitektur 3 layer:
  - **Semantic Equivalence**: Normalisasi otomatis ekuivalensi (misal `24/7` ↔ `24 jam penuh`) — sudah ada sebelumnya.
  - **Context-Aware Classifier**: Istilah yang ada di allowlist hanya dilewatkan jika konteks kalimatnya advisory (misal `coba evaluasi selama 7 hari`); tetap ditandai jika konteksnya klaim faktual (misal `terbukti meningkat dalam 7 hari`).
  - **Tenant Allowlist**: Properti `allowedEditorialTerms` pada `EditorialProfileConfig` dengan struktur `{ value, type, scope, categories }` mendukung tipe `abbreviation`, `framework`, `duration`, dan `brand_term`.
- Menginisialisasi default profil Envoyou dengan daftar singkatan umum dan durasi bawaan (`HRD`, `CEO`, `AI`, `24/7`, `24 jam`, dll).
- Menambahkan section **Source Fidelity Allowlist** pada halaman Editorial Control Room (`/admin/editorial-profile`) untuk mengelola daftar allowlist secara visual.
- Menyinkronkan properti `allowedEditorialTerms` pada onboarding draft schema agar progres tersimpan.
- Menambahkan 4 test case baru untuk allowlist pada regression suite `npm run test:quality`.

## [0.21.12] - 2026-06-08

### Fixed
- Menyelesaikan masalah false positive warning pada Final Quality Gate:
  - Mengabaikan deteksi novel entity untuk singkatan/akronim generik korporasi/industri/teknologi seperti `HRD`, `HR`, `CEO`, `CTO`, `AI`, `IT`, `UI`, `UX`, `PDB`, `GDP`, `AGI`, `LLM`, dll.
  - Memperluas pencocokan orientasi kalender/temporal agar mendukung kata kunci awal `memasuki` (misalnya: `Memasuki paruh pertama 2026`).

## [0.21.11] - 2026-06-08

### Added
- Menambahkan Post-Polish Review Loop pada Quality Gate dengan aksi interaktif penuh untuk menyelesaikan warning/check:
  - **Accept Addition** untuk menerima tambahan framework secara sadar (menandai `Accepted as Editorial Choice`).
  - **Remove Addition** untuk menghapus tambahan framework/angka/fakta baru dengan model AI tertarget (`mode: 'fix_targeted'`).
  - **Add Source** untuk memasukkan URL sumber rujukan inline Markdown link `[fakta](url)` secara otomatis ke draf dan menandai statusnya `Verified`.
  - **Mark Verified** untuk menyetujui klaim rujukan langsung tanpa tautan (menandai `Source Verified`).
  - **Fix with EAI** untuk memperbaiki kalimat bermasalah secara langsung via instruksi kustom AI.
- Menambahkan auto-population properti `targetText` dengan kalimat lengkap yang memuat warning pada check `Source Verification` dan `Source Fidelity` agar aksi review loop langsung beroperasi pada konteks kalimat yang tepat.
- Menghitung ulang status kesiapan (`readiness`) draf secara dinamis di frontend ketika seluruh check diselesaikan/diterima oleh editor.

## [0.21.10] - 2026-06-07

### Added
- Menambahkan pencocokan semantik untuk ekspresi `24/7` agar setara dengan `24 jam` (serta variasi spasi `24 / 7` dan parafrase `24 jam penuh`), sehingga tidak memicu warning atau fail sebagai angka baru.
- Menurunkan kesiapan draf dari `blocked` menjadi `needs_review` pada Final Quality Gate jika tidak terdapat kesalahan kategori kritis (`fail`) melainkan hanya peringatan rujukan/sumber (`warning`).

## [0.21.9] - 2026-06-07

### Fixed
- Memperbaiki masalah di mana Article Type default bawaan Envoyou tercampur dengan pilihan kustom user baru pada panel Editor setelah menyelesaikan onboarding dengan menginisialisasi `articleTypes` pada draf onboarding sebagai array kosong (`[]`).

## [0.21.8] - 2026-06-07

### Changed
- Mengubah urutan prioritas judul fallback draft artikel di sidebar menu agar kombinasi tipe artikel dan kategori yang aktif (`type · category`) ditampilkan terlebih dahulu sebelum ringkasan artikel (`summary`).

## [0.21.7] - 2026-06-07

### Changed
- Menerjemahkan sisa teks antarmuka berbahasa Indonesia ke bahasa Inggris pada tooltips `ActivityBar` dan placeholders/deskripsi `Editor` & `FinalDraftPanel`.
- Menghilangkan bagian "Default Metadata" dan pengaturan "Strictness" dari Settings Menu agar tidak tumpang tindih dengan konfigurasi Editorial Control Room yang lebih sentral.
- Memetakan ketegasan review AI (`strictness` metadata) secara otomatis berdasarkan konfigurasi `sourcePolicy` ('strict' | 'standard') dari profil editorial aktif.

## [0.21.6] - 2026-06-07

### Added
- Menyediakan antarmuka berupa daftar checklist checkbox untuk Kategori Artikel (dikelompokkan berdasarkan pilar) dan Tipe Artikel (lengkap dengan penjelasan bahasa Inggris) di Onboarding Wizard dan Editorial Control Room (halaman admin profil) untuk mempermudah konfigurasi workspace.

## [0.21.5] - 2026-06-07

### Added
- Mengubah dropdown kategori dan tipe artikel menjadi input teks autocomplete (menggunakan datalist) untuk pengguna workspace personal. Kategori dan tipe baru yang diketik oleh pengguna akan otomatis tersimpan ke profil editorial mereka saat input kehilangan fokus (onBlur).

## [0.21.4] - 2026-06-07

### Added
- Menambahkan opsi "Set up later" (skip onboarding) pada Onboarding Wizard. Opsi ini secara otomatis membuatkan workspace/organisasi uji coba (sandbox) personal bernama `[User Name]'s Workspace` dengan profil editorial bawaan (`DEFAULT_ONBOARDING_DATA.editorialProfile`) menggunakan transaksi basis data Prisma yang aman dan atomik.

## [0.21.3] - 2026-06-07

### Changed
- Menerjemahkan seluruh petunjuk validasi, pesan error, nama label, dan teks petunjuk (hints) pada Onboarding Wizard (`OnboardingWizard.tsx`) dan skema profil editorial (`editorial-profile-schema.ts`) dari bahasa Indonesia ke bahasa Inggris agar selaras dengan workspace editor.

## [0.21.2] - 2026-06-07

### Added
- **Penyelarasan UI & Tema Onboarding Wizard**:
  - Menyelaraskan tata letak tajuk (header) onboarding wizard dengan `.ide-titlebar` agar seragam dengan halaman workspace editor.
  - Menambahkan ambient radial glow dan noise texture overlay premium pada latar belakang onboarding wizard.

### Fixed
- **Fungsi Tema Gelap & Terang di Onboarding**:
  - Memperbaiki kegagalan fungsionalitas pengubah tema (toggle theme) dengan mengganti warna latar belakang, batas (*borders*), teks, kartu pilihan, tombol, dan komponen form yang tadinya menggunakan warna gelap statis (*hardcoded*) menjadi variabel CSS adaptif dari sistem desain EAI (`var(--background)`, `var(--border)`, `var(--foreground)`, dll.).
  - Menerapkan kelas UI kustom (`ui-btn`, `ui-control`, `ui-card`, dll.) pada seluruh elemen interaktif wizard agar responsif terhadap tema aktif.

## [0.21.1] - 2026-06-07

### Changed
- Mengganti font sistem utama dari `Instrument Sans` menjadi `Inter` untuk keterbacaan yang lebih jelas.

## [0.21.0] - 2026-06-07

### Added
- **AI Usage Telemetry**:
  - Mencatat token input, output, cached, dan reasoning dari Gemini serta Groq untuk setiap tahap review, rewrite, refine, quality gate, dan SEO.
  - Mencatat durasi tahap dan total proses, retry, fallback, failed call, provider, model, serta versi tabel harga pada metadata audit log.
  - Menambahkan regression suite `npm run test:telemetry`.
- **Editorial Pipeline Loading UI**:
  - Menampilkan tahap proses nyata `Reviewing source`, `Rewriting article`, `Quality and source checks`, `SEO metadata`, dan `Finalizing draft` berdasarkan event stream backend.
  - Menambahkan timer proses, checklist tahap pada feedback sidebar, skeleton dokumen sebelum chunk pertama, serta progress rail selama draft streaming.

### Changed
- **Analytics Accuracy**:
  - Mengganti estimasi biaya statis berdasarkan mode dengan kalkulasi dari token aktual dan tabel harga model yang dapat dikonfigurasi.
  - Mengubah label menjadi `Estimated API cost per output` karena nilai rupiah tetap bergantung pada harga provider dan kurs `AI_COST_USD_TO_IDR`.
  - Menampilkan coverage telemetry agar log lama tanpa usage provider tidak dihitung sebagai data aktual.
  - Menghitung waktu proses dan retry/fallback rate dari telemetry, serta menjadikan Real Mode sebagai tampilan default dashboard.
- **Refine Experience**:
  - Menampilkan artikel segera setelah chunk pertama diterima dan mempertahankan indikator proses tanpa menutupi draft.
  - Menyembunyikan action draft sampai konten mulai tersedia dan menggunakan aksen biru Envoyou secara konsisten.

### Fixed
- Membersihkan seluruh error dan warning ESLint lama pada analytics webhook, dashboard, signup, dan settings menu.
- Memperbaiki ready rate agregat agar menggunakan total verdict berbobot, bukan rata-rata sederhana antarhari.
- Memperketat parsing metadata analytics dan webhook tanpa penggunaan tipe `any`.

## [0.20.0] - 2026-06-06

### Added
- **Final Draft Quality Gate**:
  - Mengganti skor draf mentah pada flow Polish dengan status kesiapan final `ready`, `needs_review`, atau `blocked`.
  - Menampilkan refinement report berisi perubahan utama, remaining checks, flags, dan feedback actionable terhadap refined draft.
  - Menjalankan quality gate ulang setelah iterative refinement serta menyimpan readiness dan daftar perubahan pada metadata audit log.
- **Deterministic Editorial Validation**:
  - Menambahkan pemeriksaan source fidelity untuk angka, rentang angka, URL, entitas, drift kepanjangan akronim, atribusi motif yang tidak didukung sumber, serta fase kalender yang belum tiba.
  - Menambahkan normalisasi tabel ASCII menjadi Markdown GFM dan deteksi tabel Markdown yang rusak.
  - Menambahkan regression suite `npm run test:quality`.

### Changed
- **Publication-Safe Verification Flow**:
  - Memisahkan draft review internal dari publication draft.
  - Marker seperti `[Source verification recommended]` tetap memicu warning pada refinement report, tetapi dihapus dari draft yang ditampilkan, disimpan, dan diekspor ke CMS.
- **Smart Internal Linking**:
  - Menyaring kandidat berdasarkan overlap istilah substantif, kualitas slug, dan keluarga topik agar tautan lintas topik yang lemah tidak diberikan kepada model.
  - Membatasi internal link menjadi maksimal 1–2 tautan yang benar-benar relevan.
- **Analytics & History**:
  - Mengganti metrik skor rata-rata dan verdict Polish dengan ready rate serta breakdown `Ready / Needs Review / Blocked`.
  - Memperbarui dashboard, status bar, feedback panel, dan history sidebar agar menggunakan readiness final.
- **Prompt Guardrails**:
  - Menaikkan `PROMPT_VERSION` ke `1.3.6`.
  - Memperjelas perbedaan orientasi kalender netral dengan klaim tren baru, melarang motif tokoh/organisasi tanpa dukungan sumber, dan memperketat integritas tabel serta internal link.

### Fixed
- Mencegah tabel ASCII dengan border satu segmen lolos ke refined draft.
- Mencegah annotation verifikasi internal bocor ke draft publikasi.
- Mencegah false positive source fidelity pada rentang angka, format persen, angka bercetak tebal, label editorial, dan tautan internal tepercaya.
- Menambahkan retry quality gate sebelum fallback untuk mengurangi hasil review otomatis yang tidak selesai.

## [0.19.1] - 2026-06-06

### Changed
- **Peningkatan Larangan Tabel ASCII**:
  - Menambahkan aturan larangan tabel teks ASCII dan instruksi rendering tabel Markdown GFM (GitHub Flavored Markdown) ke dalam `getIterativeRefinementPrompt` yang berjalan saat editor menekan tombol "Refine" / re-analisis iteratif.
  - Memperkuat instruksi tabel pada `getBaseGuidelines` dan `getPolishedDraftPrompt` untuk mencegah AI membungkus tabel di dalam code block bertipe raw text/ASCII.

## [0.19.0] - 2026-06-05

### Added
- **Multi-user SaaS Clerk Authentication**:
  - Mengintegrasikan `@clerk/nextjs` dan `@clerk/themes` untuk sistem autentikasi multi-user yang SaaS-ready.
  - Menghapus sistem login password lokal dan menggantinya dengan halaman login/signup kustom EAI bergaya radial glow (`/login`, `/signup`).
  - Menambahkan sinkronisasi profil pengguna menggunakan Clerk Webhook (`/api/webhooks/clerk`) ke database PostgreSQL via Prisma.
  - Memisahkan data riwayat artikel (*data isolation*) antar pengguna sehingga setiap user hanya bisa melihat dan mengedit riwayat artikel milik mereka sendiri.
- **Validation Metrics Dashboard (Tab Validation Report)**:
  - Mengimplementasikan tab baru "Validation Report" pada dashboard analisis dengan layout 1 halaman yang ringkas (*report card style*).
  - Menampilkan 4 kategori kartu evaluasi: *Product Usage*, *Output Quality*, *Efficiency Gain*, dan *Commercial Readiness*.
  - Menambahkan progress bar dinamis dan label indikator status pencapaian target (*Met*, *Developing*, *At Risk*).
  - Menghitung estimasi biaya operasional API per output secara dinamis: **Rp950** untuk mode Fast dan **Rp1.850** untuk mode Publish Ready.
  - Menambahkan sakelar **"Demo Mode"** di pojok kanan atas dasbor (disertai lencana "Demo Mode" beranimasi denyut/pulse di sebelah judul dasbor).
  - Saat **Demo Mode ON**, dasbor menampilkan visualisasi data hybrid/mock lengkap (menghubungkan 120+ draf, 8+ WAU, dan chart penuh warna) untuk demonstrasi presentasi skala agensi besar.
  - Saat **Demo Mode OFF**, dasbor murni menyajikan data riil dan kalkulasi asli dari database PostgreSQL/Neon.
  - Menyempurnakan penamaan label evaluasi dasbor agar sesuai alur kerja nyata EAI (di mana sistem AI menilai draf kasar awal pengguna): "Editor acceptance rate" diubah menjadi **"AI system acceptance rate (Accept)"**, "Manual revision rate" menjadi **"AI revision request rate (Revise/Decline)"**, dan "% directly publishable" menjadi **"CMS directly publishable rate"**.
  - **Sistem Webhook CMS & CMS Directly Publishable Rate**:
    - Mengintegrasikan endpoint webhook publik `/api/analytics/webhook` yang menerima callback HTTP POST ketika author mempublikasikan artikel di CMS eksternal.
    - Webhook mencocokkan payload `sourceRef` dengan `AnalysisLog` di Neon PostgreSQL.
    - Menghitung **AI Retention Rate** (tingkat kemiripan kata menggunakan algoritma Levenshtein tingkat kata yang dioptimalkan dengan *single-row buffer* untuk meminimalkan beban komputasi CPU).
    - Menyimpan status publikasi dan tingkat retensi di dalam `metadata` log (misal: "Published with X% AI Retention").
    - Menghitung **CMS Directly Publishable Rate** secara dinamis di dasbor sebagai persentase artikel terpublikasi yang memiliki AI Retention Rate `>= 90%`.
  - Mengubah penamaan kategori grafik keputusan (Verdict Breakdown) dari "Approve" dan "Reject" menjadi **"Accept"** dan **"Decline"** agar selaras dengan terminologi alur kerja EAI.
  - Menambahkan metrik baru **"AI refinement POV match rate"** pada kelompok *Output Quality*. Metrik ini dihitung secara dinamis dengan mengelompokkan riwayat log berdasarkan `sourceRef`. Jika draf hasil refine diekspor langsung ke CMS pada percobaan pertama (hanya ada 1 log di grup `sourceRef`), ini dianggap sesuai dengan POV (Direct Match). Namun, jika pengguna melakukan refine ulang atau analisis ulang (terdapat lebih dari 1 log sebelum ekspor), itu dihitung sebagai draf awal yang belum sepenuhnya memenuhi POV sehingga butuh penyempurnaan lanjutan.
- **Editor Activity Bar Navigation**:
  - Menambahkan ikon tautan dashboard (`LayoutDashboard`) di Activity Bar editor tepat di bawah tombol New Article.
  - Dilengkapi tooltip deskripsi *"Buka Dashboard Analisis & Validasi"* untuk mempermudah navigasi langsung dari ruang kerja editor.
- **Dashboard CSV Export**:
  - Menambahkan tombol **"Download CSV"** di pojok kanan atas dasbor (bersandingan dengan sakelar Demo Mode).
  - Tombol ini mendeteksi tab yang sedang aktif secara dinamis: jika berada di tab *Validation Report*, file CSV yang diunduh berisi laporan metrik lengkap (kategori, nama metrik, nilai saat ini, target, status); jika berada di tab *Technical Charts*, file CSV berisi ringkasan agregat, tren harian skor, breakdown keputusan, dan daftar warning flags teratas.
  - Menggunakan teknik Blob browser modern yang menjamin file diunduh dengan benar di Excel maupun Google Sheets (lengkap dengan *wrapping values* tanda kutip ganda).

### Fixed
- **Dashboard UI & Layout**:
  - Memperbaiki warna tombol tab segmen *Validation Report* dan *Technical Charts* di mode dark yang sebelumnya putih-on-putih (teks putih dengan background putih) karena penggunaan kelas tidak valid `dark:bg-slate-850` menjadi **`dark:bg-slate-800`**.
  - Mengatasi warning dimensi grafik Recharts (`The width(-1) and height(-1) of chart should be greater than 0`) dengan menyematkan kelas `min-w-0` pada kontainer layout dan properti `minWidth={0}` pada `<ResponsiveContainer>` grafik.

---

## [0.18.2] - 2026-06-05

### Changed
- **Prompt Temporal & Rewrite Guardrails**:
  - Menaikkan `PROMPT_VERSION` ke `1.2.2` dengan konteks tanggal editorial berbasis `Asia/Jakarta`.
  - Menambahkan guardrail temporal agar peristiwa aktual pada tahun berjalan tidak salah diperlakukan sebagai proyeksi masa depan.
  - Menambahkan prioritas rewrite eksplisit: integritas fakta, kualitas hook/penutup, kejelasan argumen, lalu kepadatan teks.
  - Memperluas contoh tone lintas kategori dan menambahkan rubrik skor khusus Polish Review.
  - Memperketat output tabel agar memakai Markdown GFM, bukan ASCII table di dalam code block.

### Fixed
- **Analyze Response Validation**:
  - Menormalisasi `summary` output model sebelum validasi schema agar respons dengan ringkasan lebih dari 280 karakter tidak memunculkan error Zod di frontend.

---

## [0.18.1] - 2026-06-03

### Changed
- **Premium UI Enhancements**:
  - Merombak *scrollbar* bawaan sistem menjadi *custom scrollbar* tipis bergaya minimalis (Mac/iOS style) dengan track transparan.
  - Menambahkan lapisan tekstur *ambient noise/grain* tipis (opasitas 2%) di atas efek radial glow background untuk kesan materi premium dan kedalaman ruang.
  - Memperkecil tinggi *padding* item riwayat di dalam History Sidebar agar lebih ringkas (*compact*) dan menampilkan lebih banyak draf.
  - Mengganti komponen *native dropdown select* (pilihan kategori, role, bahasa) pada menu Settings menggunakan komponen *Select* (Radix/Shadcn) kustom agar *dropdown options box* memiliki *border-radius* melengkung (`rounded-lg`) dan tidak lagi terlihat kotak kaku.
  - Memperbaiki tata letak ikon dan teks pada tombol segmen *Appearance* dan *Strictness* di Settings dengan menambahkan `display: flex; align-items: center` serta mereduksi tinggi tombol menjadi bentuk kapsul proporsional (`min-height: 32px`).
  - Menstandarkan penulisan nama-nama label, *placeholder*, dan opsi pada menu Settings ke format *Title Case* yang lebih konsisten secara profesional (misal: "Auto-Save Workspace", "Target Audience").

---

## [0.18.0] - 2026-06-03

### Changed
- **Visual Redesign & Brand Integration**:
  - Mengubah tema warna EAI dari kuning/emas menjadi Biru Brand Envoyou (#0B79C2 / #0066AF) untuk menyelaraskan DNA dengan Admin Blog Envoyou.
  - Menerapkan efek glassmorphism selektif (transparansi & blur) pada panel shell, header, sidebar, dan dialog agar transisi antar aplikasi terasa mulus.
  - Mempertahankan permukaan solid (tanpa glass) pada area kerja utama (Editor draf & Refined Draft panel) untuk menjaga readability teks panjang tetap optimal.
  - Menetapkan Option B (Soft Amber) untuk highlight pencarian feedback teks dan warning marks agar kontras visual tetap terjaga dan tidak rancu dengan warna aksen brand.
  - Mempertahankan font serif (Lora) pada textarea drafting untuk kenyamanan ala "writing studio", sementara tombol, sidebar, dan dashboard menggunakan font sans-serif.
  - Memperbarui halaman login utama dan login dashboard menggunakan ambient radial background glow biru dan visual card premium.
  - Re-theme dashboard analytics (summary cards, chart garis score trend, chart pie verdict, dan chart batang flags) dengan visual modern dan skema warna biru-emerald-amber yang selaras.
  - Mereduksi 50% border visual di seluruh aplikasi untuk menciptakan layout yang lebih bersih, lapang, dan bernafas (premium whitespace). Menghapus shadow outline `0 0 0 1px` pada Editor, Final Draft, dan Feedback Panel.
  - Menghapus dotted background pattern (`dot-grid-bg`) secara global agar workspace terlihat minimalis dan modern.
  - Mendesain ulang header History Sidebar dengan visual logo "EAI" / "Editorial Intelligence" menggunakan radial glow, serta meratakan daftar riwayat draf di bawah "Recent Drafts".
  - Memperbaiki kesalahan sintaksis JSX tag penutup yang tidak sejajar pada `Editor.tsx` sehingga proses kompilasi build Next.js berjalan sukses.
  - Memperbaiki warna background panel draf akhir (`FinalDraftPanel`) menggunakan `var(--card)` agar tidak menyatu dengan background workspace, serta memposisikan ulang stacking context (`relative z-10`) pada tombol instruksi editorial dan tombol apply-all agar terhindar dari block overlay radial glow.
  - Mendesain ulang header utama (`ide-titlebar`) dengan tinggi 76px dan radial glow overlay agar visualnya selaras dengan header panel/sidebar, menaikkan z-index elemen-elemen di dalamnya, serta memperbesar skala logo EAI (`w-11 h-11`), font brand (`text-3xl`), dan tombol-tombol tindakan header agar lebih proporsional dan mudah dibaca.
  - Mendesain ulang bilah status bawah (`ide-statusbar`) dengan tinggi 44px dan font sans-serif agar tidak tampak seperti ekstensi VS Code. Menghapus pemisah titik (`·`) dan menyusun informasi status (word count, char count, verdict, score) ke dalam badge kapsul premium dengan background hover yang lembut, serta mengubah selector AI provider menjadi modern segmented toggle control.
  - Meningkatkan whitespace area navigasi atas dengan memperbesar tinggi tab bar (`ide-tabbar`) menjadi 52px dan mengubah style tab menjadi segmented dashboard navigation switchers berbentuk pill.
  - Menambahkan tombol toggle untuk menampilkan/menyembunyikan kartu statistik draf (Added, Removed, Stable) di bagian panel draf akhir (`FinalDraftPanel`) untuk fleksibilitas area baca yang lebih luas.
  - Mengubah ikon tombol tutup History Sidebar dari `PanelLeftClose` menjadi `PanelLeft` agar simetris dan selaras dengan ikon tombol buka/tutup panel feedback (`PanelRight`).

---

## [0.17.0] - 2026-06-02

### Added
- **Analysis Speed Modes (Fast vs Publish Ready)**:
  - Mengimplementasikan *state* kecepatan rute (`analysisSpeed`) pada antarmuka utama.
  - Mode **Fast Review**: Mematikan pembuatan metadata SEO dan referensi tautan internal demi menghemat *tokens*, mengurangi latensi server, dan optimalisasi biaya operasional.
  - Mode **Publish Ready**: Alur editorial standar penuh dengan ekstraksi SEO dan tautan internal.
  - Penambahan *Tooltip* pada pemilih mode sebagai keterangan informatif UI.
- **Editable History Title**:
  - Memperbarui komponen `HistorySidebar` dengan kemampuan *inline editing* (menggunakan klik ganda / *double-click*) pada judul draf.
  - Penambahan backend endpoint `PATCH /api/history/[id]` untuk menyimpan perubahan judul kustom (*customTitle* di dalam JSON *metadata*) ke dalam *database* PostgreSQL.

### Changed
- **History Sidebar Layout**:
  - Menyusun ulang antarmuka daftar item riwayat menjadi jauh lebih ringkas dan padat.
  - Judul kini dibatasi hanya 1 baris (*line-clamp-1*).
  - Menggeser posisi lencana skor ke ujung kiri dan indikator waktu (*time ago*) ke ujung kanan agar sejajar dengan judul.
  - Menggabungkan elemen meta (*Verdict* dan Kategori) tepat di bawah baris judul.
- **Model Routing Restructuring**:
  - `route.ts` pada endpoint `/api/analyze` telah direfaktorisasi secara signifikan untuk mengakomodasi penggunaan model dinamis (*Lite* vs *Pro/Flash*) berbasis kebutuhan eksekusi.
  - Pencatatan log (*usedModels*) kini merepresentasikan total model aktual yang berkontribusi pada sebuah analisis.

---
## [0.16.0] - 2026-05-31

### Added
- **Application Login Gate**:
  - Menambahkan halaman `/login` untuk mengunci akses aplikasi editor utama sebelum pengguna masuk.
  - Memperluas proteksi Next.js `proxy` dari dashboard saja menjadi aplikasi utama (`/`) dan API internal (`/api/analyze`, `/api/history`, `/api/export`, dan `/api/analytics`).
  - API internal kini mengembalikan `401 Unauthorized` saat sesi tidak valid, bukan membiarkan request tanpa autentikasi.
- **Signed Session Authentication**:
  - Mengganti cookie boolean sederhana menjadi token sesi bertanda tangan HMAC dengan masa berlaku 1 hari.
  - Menambahkan helper `src/lib/dashboard-auth.ts` untuk pembuatan token, validasi token, pembacaan cookie, dan pengecekan password.
  - Menambahkan dukungan opsional `DASHBOARD_AUTH_SECRET`; jika kosong, sistem memakai `DASHBOARD_PASSWORD` sebagai fallback secret.
- **Settings Menu**:
  - Menambahkan menu `Setting` di Activity Bar editor, ditempatkan tepat di atas toggle tema dark/light.
  - Menambahkan Profile User lokal (`display name`, `role`, dan placeholder `UI language`) di section `Account`, lengkap dengan inisial profil di header menu.
  - Mengaktifkan pengaturan Mode tampilan (`Light`, `Dark`, `System`), `Auto-save workspace`, `Output Language`, `Strictness` editorial, dan `Default metadata`.
  - Memindahkan aksi logout ke dalam menu `Setting`.
  - Menggunakan menu `Setting` yang sama di dashboard analytics agar logout tidak tampil sebagai tombol terpisah.

### Changed
- **Auth Scope Naming**: Cookie sesi kini menggunakan nama `eai_auth` dan scope internal `app`, sehingga sesi lama dari implementasi dashboard-only perlu login ulang sekali.
- **Workflow Preferences**: Default metadata dipakai saat membuat draf baru, auto-save kini dapat dimatikan, serta strictness dan output language dikirim ke prompt AI sebagai konteks evaluasi.
- **Documentation**: Memperbarui README, README Indonesia, `.env.example`, catatan arsitektur, dan roadmap agar mencerminkan login aplikasi + dashboard.

## [0.15.0] - 2026-05-28

### Added
- **Fact-Checking Guardrails**:
  - Implementasi deteksi cerdas untuk klaim faktual tanpa sumber (angka sensitif, persentase, statistik).
  - Penambahan `verificationStatus` pada schema *feedback* (`source_backed`, `needs_citation`, `high_risk_factual_claim`).
  - *Feedback Panel* kini mengabaikan *auto-replace* (ditahan manual) untuk data faktual berisiko tinggi.
  - Injeksi otomatis ringkasan peringatan `## Verification Notes` pada draf akhir jika terdapat fakta yang belum diverifikasi.

### Fixed
- **Hardcoded Regex Misfire**: Menghapus `LOCAL_SUPPRESSION_PATTERN` (seperti kata "Indonesia", "Asia Tenggara") yang terlalu agresif dan sebelumnya tidak sengaja menghapus keseluruhan paragraf saat terjadi eksekusi *remove target*.
- **Duplicate Header Prevention**: Menyempurnakan deteksi `ensureTitleAndOpening` yang sebelumnya keliru merender judul ganda jika draf baru AI dibuka menggunakan H2 (`##`).
- **CMS Export Compatibility**: Melarang pembuatan Judul H1 di baris teratas hasil keluaran AI agar tidak memicu duplikasi saat di-*export* ke *Headless CMS*.
- **Lint Cleanups**: Menghapus berbagai deklarasi *unused variables* (`containsEvaluativeFactualLanguage`, `hasTopLevelTitle`, dsb.) pasca-refaktorisasi.

---

## [0.14.0] - 2026-05-28

### Added
- **Refined Draft Side-by-Side Workspace**:
  - Penggabungan tab Analysis dan Final Draft menjadi satu halaman terpadu **"Refined Draft"**.
  - Integrasi panel draf tengah dengan panel kartu saran (*AI Feedback*) di kanan collapsible (`w-[380px]`).
  - Animasi pelipatan panel feedback menggunakan tombol ikon minimalis `PanelRight` di tab bar dengan standard tooltip.
- **Interaktivitas Hubungan Feedback ↔ Teks**:
  - **Hover Highlight**: Mengarahkan kursor (*hover*) pada kartu saran secara instan menyoroti (*highlight*) potongan kata/paragraf perbaikan yang bersesuaian di panel tengah dengan gaya warna emas transparan (`bg-[rgba(201,168,76,0.1)] border-[rgba(201,168,76,0.3)]`).
  - **Click Auto-Scroll**: Mengklik kartu saran secara otomatis menggulung (*auto-scroll*) layar secara halus (*smooth*) ke paragraf/kata yang sedang disorot.
- **Tipografi Premium (Reading Mode)**:
  - Mengubah tampilan preview artikel agar menyerupai halaman Medium/buku fisik daripada IDE pemrograman.
  - Penggunaan font serif premium **Lora** (`var(--font-serif)`), spasi tinggi (`leading-[1.85]`), dan lebar pembacaan optimal 65 karakter (`max-w-2xl mx-auto`).
- **Glosarium Refined Draft**:
  - Mengubah seluruh penyebutan istilah "Final Draft" di antarmuka pengguna menjadi **"Refined Draft"** (status bar, toast, tombol salin, header, dan breadcrumbs).
- **Release Prep**: Updated `CHANGELOG.md` and `package.json` version to **0.14.0**, prepared Git tag.

## [0.13.0] - 2026-05-27

### Added
- **Smart Internal Linking**:
  - Penambahan fungsionalitas untuk mengambil daftar artikel terpublikasi (hingga 50 postingan) dari blog API.
  - Penambahan timeout 2.5 detik menggunakan `AbortController` saat fetch ke blog API agar EAI tetap berjalan normal jika blog API sedang cold start atau down.
  - Memperbarui instruksi prompt `getPolishedDraftPrompt` untuk menyisipkan referensi internal secara natural dengan format link Markdown `https://blog.envoyou.com/posts/slug`.
  - Menerapkan batasan 2–3 link internal dan mengedepankan kelancaran naratif alur artikel (narrative flow) daripada kepadatan kata kunci SEO, menghindari frasa CTA yang kaku (seperti "baca selengkapnya" atau "klik di sini").

## [0.12.1] - 2026-05-27

### Fixed
- **Streaming Parser & Errors**:
  - Perbaikan regex parser di server-side agar mencocokkan karakter terminasi JSON sebelum mem-parsing angka/kata, mencegah nilai parsing prematur pada potongan chunk stream.
  - Penanganan error transmisi client-side yang sekarang di-propagate dengan benar ke catch block utama untuk memicu Toast alert jika server mengalami kendala.

## [0.12.0] - 2026-05-27

### Added
- **Streaming Refinement Pipeline**: Menambahkan pipa streaming NDJSON real-time di rute `/api/analyze`.
  - Server-side incremental parser untuk mem-parsing data evaluasi (score, verdict, summary, feedback) dan mengirimkannya bertahap ke UI client secara aman dan robust.
  - Streaming penulisan ulang draft final (`draft_chunk`) kata-demi-kata secara realtime.
  - Pengetikan realtime pada visual preview dan raw markdown dengan efek kursor berkedip (`▍` / `animate-pulse`).
  - Simulasi streaming interaktif pada Mock Mode lokal menggunakan delayer realistis.
- **Spring Animations & Resizing**: Mengganti tata letak CSS Grid dengan Flexbox dinamis pada panel hasil.
  - Mengintegrasikan Framer Motion `<motion.div>` dengan properti `layout` dan konfigurasi pegas (`stiffness: 180`, `damping: 26`) untuk efek pergeseran dan pelebaran panel yang sangat mulus dan elastis.
  - Menggunakan `<AnimatePresence>` untuk transisi pergantian konten panel expanded ke collapsed sidebar secara visual premium.

## [0.11.0] - 2026-05-27

### Added
- **Motion & Feel Layer**: Integrasi `framer-motion` untuk menghidupkan animasi antarmuka:
  - Animasi tinggi akordeon (slide down/up) pada suguhan feedback perbaikan dan blok SEO metadata di `FeedbackPanel.tsx`.
  - Drawer sidebar seluler dengan efek geser/kemunculan pegas (*spring transition*) dan efek pudar (*fade backdrop*).
  - Animasi penyusutan dan pelebaran lebar (*width collapse*) sidebar pada resolusi desktop agar transisi tata letak terasa mulus.
- **Button Micro-Interactions**: Penambahan efek ketukan fisik (`active:scale-[0.98] transition-all`) di semua tombol utama sistem guna memberikan respons taktil instan.
- **Editor Quick Actions**: Menyediakan tombol aksi cepat **"Copy"** (salin draf mentah) dan **"Clear"** (bersihkan bidang kerja) di dalam header workspace.
- **Informative Inputs**: Contoh nilai masukan langsung pada placeholder target audience dan target length di area metadata artikel.

### Changed
- **Workspace Layout Expansion**: Mengubah Editor agar otomatis mengisi 100% lebar layar penuh secara mulus saat panel feedback/hasil disembunyikan.

---

## [0.10.0] - 2026-05-27

### Added
- **Export API Integration**: Penambahan fungsionalitas ekspor draf final ke sistem eksternal/CMS (berupa *export functionality* dengan *source reference tracking* dan pencatatan log *status*).
- **Export Metadata Extensions**: Menambahkan field `coverImageAltText` pada logika submisi *FinalDraftPanel* dan *Export API*.
- **History UI State untuk Ekspor**: Sidebar riwayat kini menampilkan status ekspor (`exportStatus`) dan menyajikan *feedback* keberhasilan yang dilengkapi dengan tautan langsung ke halaman admin/CMS eksternal.

### Fixed
- **Database Type Safety**: Memperbaiki masalah ketidakcocokan tipe data dengan melakukan *casting* metadata ke `Prisma.InputJsonValue` saat pembaruan *analysis log*.

---

## [0.9.1] - 2026-05-26

### Changed
- **UI Neutral Theme Alignment**: Menyelaraskan seluruh warna komponen aksi (seperti tombol *Refine Draft*, *View Final Result*, ikon *Theme Toggle*, ikon *New Draft* di sidebar, serta garis luar *Editor*) ke mode netral/monokromatik agar lebih konsisten dan elegan antara mode terang maupun gelap, menggantikan aksen warna biru yang sebelumnya dominan.

### Fixed
- **Code Linting Cleanups**: Menyelesaikan peringatan lint terkait iterasi komponen statis pada `FeedbackPanel.tsx` dan menangani *missing dependencies* serta deklarasi tipe data implisit (penghapusan `any` type) pada rute API riwayat (`/api/history`).

---

## [0.9.0] - 2026-05-25

### Added
- **History Sidebar Revamp**: Komponen sidebar kini memiliki fitur *Search* (Pencarian riwayat) dan *Filter* (Berdasarkan status: Approve, Revise, Reject).
- **History Pagination**: Mengubah pemuatan riwayat di sisi klien menjadi metode *Pagination* (20 item per load) dengan antarmuka tombol *Load More*.
- **Smart Grouping & Delete**: Sidebar secara otomatis mengelompokkan riwayat ke dalam Today, Yesterday, This Week, dan Older. Ditambahkan fungsionalitas hapus riwayat melalui API *DELETE* beserta dialog konfirmasi penghapusan.
- **Brand Logo Integration**: Mengintegrasikan logo Envyou AI Editorial (`EAILogo.tsx`) yang bersifat responsif terhadap warna mode terang/gelap (`currentColor`) di samping judul utama.
- **English Localization**: Menerjemahkan dan menyeragamkan semua *toast notifications* dan teks statis sidebar ke dalam Bahasa Inggris.

---

## [0.8.1] - 2026-05-25

### Fixed
- **JSON Sanitization**: Mengatasi crash (Error 502) yang disebabkan oleh *unescaped newlines* di dalam string JSON yang di-generate model pada rute `/api/analyze`.
- **UI Metadata Rendering**: Memperbaiki `FeedbackPanel.tsx` yang sebelumnya belum dirender untuk menampilkan `excerpt`, `metaTitle`, dan `coverImageAltText`.
- **Markdown Styling Integrity**: Mempertajam *prompt* khusus mode *Polish* untuk melarang penggunaan H1 (`#`) di dalam konten artikel dan secara ketat menegakkan gaya *Markdown* yang memiliki hierarki untuk CMS.
- **Prompt Refactoring**: Membersihkan kode *legacy* dan memusatkan instruksi (seperti `1-CLICK APPLY RULE`) menjadi konstanta yang dapat digunakan ulang dan tahan terhadap reference error.

---

## [0.8.0] - 2026-05-25

### Added
- **Single-Flow Polish Pipeline**: Menyederhanakan pengalaman utama menjadi alur `Paste draft -> Polish Article -> Final Draft + SEO Pack`.
- **Final Revised Draft Panel**: Menampilkan hasil polish AI yang siap tempel beserta tombol salin draft.
- **Change Preview Diff**: Menambahkan perbandingan paragraf sumber vs hasil polish untuk membantu review cepat.
- **Response Mode Tracking**: Menambahkan mode `standard`, `compact`, dan `manual_fallback` ke response UI dan metadata log.
- **Chunk-Based Rewrite Engine**: Menulis ulang draft panjang per bagian untuk mengurangi truncation pada Gemini.
- **SEO Pack Stage**: Memisahkan pembuatan metadata SEO ke panggilan model terpisah agar lebih stabil dan hemat biaya.

### Changed
- **Product Direction**: Menggeser produk dari evaluator multi-role yang menonjol ke pengalaman utama `Polish Article` yang lebih sederhana.
- **Prompt Architecture**: Menambahkan guardrails editorial baru untuk menjaga kohesi argumen, mengurangi hiperbola, mencegah repetisi angka, menjaga integritas markdown, dan memperkuat implikasi strategis di penutup.
- **Gemini Orchestration**: Memecah proses menjadi tiga tahap:
  - review ringkas dengan model ringan,
  - rewrite final dengan model yang lebih kuat,
  - SEO metadata generation dengan model ringan.
- **History Hydration**: Riwayat analisis kini memuat ulang `polishedDraft` dan `responseMode` dari metadata log.

### Fixed
- **Repeated/Truncated Output Handling**: Menambahkan fallback dan pemisahan stage untuk mengurangi kasus `MAX_TOKENS`, JSON terpotong, dan output artikel yang berulang.
- **Feedback Layout Overlap**: Memperbaiki panel feedback yang menimpa panel draft final pada viewport sempit atau konten panjang.
- **Lint Cleanups**: Membersihkan error lint React/TypeScript pada route API dan komponen utama.

## [0.7.0] - 2026-05-24

### Added
- **1-Click Apply Suggestion (Operation Based)**: Fitur revolusioner yang menyulap panel *feedback* menjadi asisten penyunting otomatis.
  - Menggunakan struktur pemaksaan skema (*Google Structured Outputs / responseSchema*) untuk stabilitas 100% pada *Gemini backend*.
  - Implementasi tipe operasi cerdas: `replace`, `insert_before`, `insert_after`, dan `manual` untuk mencegah risiko perusakan draf secara tidak disengaja.
  - Antarmuka dinamis (*Before/After* UI) di dalam komponen `FeedbackPanel.tsx` dengan kemampuan merespons logika manipulasi teks secara visual.

---

## [0.6.0] - 2026-05-24

### Added
- **Gemini Role-Based Model Routing**: Transisi *engine* pemroses utama dari Anthropic ke Google Gemini dengan strategi *cost-optimization*:
  - `author` mode ditenagai oleh `gemini-3.1-flash-lite`.
  - `editor` dan `seo` mode ditenagai oleh `gemini-3.5-flash`.
  - `fact-checker` mode ditenagai oleh `gemini-2.5-pro`.
- Kode Anthropic (Claude) tetap dipertahankan sebagai sistem cadangan/opsional (*fallback*) yang dapat dikonfigurasi melalui `.env` (`ACTIVE_AI_PROVIDER`).

---

## [0.5.1] - 2026-05-24

### Changed
- **Workflow Optimization**: Mengubah input `Category` menjadi menu *dropdown* dengan opsi spesifik untuk pilar blog Envoyou (Creator Digital, Data & Insight, Keuangan & Investasi, Teknologi & AI).
- **SEO Metadata Generation**: Menonjolkan fungsi `seo` mode agar otomatis membuat dan menyajikan struktur SEO (Title, Slug, Meta Description, Tags) pada antarmuka *Feedback Panel*.

---

## [0.5.0] - 2026-05-24

### Added
- **Analytics Dashboard**: Dashboard internal di rute `/dashboard` untuk pantauan manajerial. Menampilkan metrik seperti Total Analisis, Rata-rata Skor, dan Total Peringatan.
- **Data Visualizations**: Implementasi grafik menggunakan `recharts` (Tren Skor Harian, Rasio Verdict, dan Top Flags).
- **Dashboard Authentication**: Proteksi rute `/dashboard` dengan *password guard* menggunakan Next.js `proxy` (pengganti `middleware`) dan *cookies*.

---

## [0.4.0] - 2026-05-24

### Added
- **Fact-Checker Role**: Menambahkan peran 'fact-checker' untuk memindai angka, statistik, nama lembaga, dan mendeteksi cacat logika (*logical fallacies*) pada draf artikel.

### Fixed
- **History Sidebar Refresh**: Memperbaiki isu di mana sidebar tidak memuat ulang riwayat terbaru setelah analisis sukses.
- **Error State Sidebar**: Menambahkan status kesalahan antarmuka pada HistorySidebar jika gagal memuat data dari *database*.
- **Prompt Consistency**: Menyelaraskan teks prompt sistem dengan teks kueri kembali ke dalam Bahasa Indonesia.

---

## [0.3.0] - 2026-05-24

### Added
- **SEO Role**: Menambahkan peran baru ('seo') untuk melakukan analisis artikel khusus dari sudut pandang optimasi mesin pencari (SEO).
  - Mengevaluasi *search intent*, kepadatan *keyword*, hierarki konten (H2/H3), dan peluang *internal/external linking*.
  - Terintegrasi penuh ke dalam UI `RoleToggle` dan log `AnalysisLog` PostgreSQL.

---

## [0.2.0] - 2026-05-24

### Added
- **History Sidebar**: Sidebar navigasi riwayat analisis masa lalu dengan dukungan *lazy loading* detail (fetch terpisah). 
- **Dark Mode**: Peningkatan antarmuka melalui tema gelap terintegrasi (`next-themes`).
- **English Localization**: Menerjemahkan komponen utama antarmuka dan *error state* ke dalam Bahasa Inggris.
- **Improved UI/UX**: *Tooltip* untuk tombol *New Draft* dan penyelesaian masalah hidrasi (hydration mismatch) pada komponen `<button>`.

---

## [0.1.0] - 2026-05-24

### Added
- **Core Platform**: Inisiasi proyek Next.js 16.2 (App Router) dengan TypeScript 5 dan React 19.
- **Dual Role Evaluator**:
  - Peran **Author (Co-Pilot)**: Memberikan umpan balik konstruktif mengenai *hook*, keterbacaan, dan struktur draf artikel tanpa opsi penolakan (*reject*).
  - Peran **Editor (Gatekeeper)**: Memindai draf secara objektif dan ketat untuk mendeteksi teks hasil AI (*AI-spam*), klaim tanpa data pendukung, dan kesesuaian gaya bahasa dengan keputusan akhir (`approve`, `revise`, atau `reject`).
- **AI Integration**: Integrasi SDK Anthropic menggunakan model `claude-3-5-sonnet-20241022` dengan sistem *prompts* dinamis berbasis peran dan metadata artikel.
- **Mock Mode**: Dukungan mode pengembangan tanpa API key (*Mock Mode*) untuk simulasi umpan balik tanpa memanggil API eksternal.
- **Data Validation & Type Safety**: Validasi schema output JSON dari AI menggunakan Zod Schema (`FeedbackOutputSchema`).
- **Database & Audit Logging**:
  - Konfigurasi ORM menggunakan Prisma 7.8.
  - Skema PostgreSQL Neon Database dengan tabel `AnalysisLog` untuk menyimpan audit log performa evaluasi.
  - Implementasi penyimpanan otomatis log baik untuk respon sukses maupun kegagalan sistem.
- **Modern Responsive UI**:
  - Konfigurasi styling global menggunakan Tailwind CSS v4.
  - Komponen editor draf (`Editor.tsx`) dengan form input metadata artikel.
  - Komponen toggle animasi peran (`RoleToggle.tsx`).
  - Panel visualisasi hasil analisis (`FeedbackPanel.tsx`) yang menampilkan skor radial, verdict, checklist umpan balik, dan peringatan kritis (*flags*).
  - Sistem animasi mikro terintegrasi menggunakan Framer Motion.
  - Notifikasi *toast* interaktif menggunakan Sonner.
- **Documentation**:
  - Berkas panduan editorial internal (`editorial-guidelines.md`).
  - Berkas panduan instalasi dan penggunaan proyek (`README.md`).
  - Berkas lisensi open-source (`LICENSE`).
