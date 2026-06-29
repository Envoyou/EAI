# Changelog

Semua perubahan penting pada proyek **Envoyou AI Editorial System** akan didokumentasikan di berkas ini.

Format berkas ini didasarkan pada [Keep a Changelog](https://keepachangelog.com/id/1.0.0/) dan proyek ini mematuhi [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
