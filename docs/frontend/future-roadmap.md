# Peta jalan masa depan

Dokumen ini mencatat fitur yang sudah tersedia, fitur yang baru diterapkan sebagian, dan pengembangan yang masih direncanakan untuk Envoyou AI Editorial System (EAI).

Terakhir diperbarui: 15 Juni 2026.

Status:

- ~~Dicoret~~: sudah diimplementasikan
- **Sebagian diimplementasikan**: fondasi tersedia, tetapi ruang lingkup roadmap belum selesai
- Teks biasa: masih direncanakan

## Fase 1: Stabilisasi dan analitik

Fase ini meningkatkan stabilitas sistem dan membantu tim memantau kualitas serta produktivitas editorial.

1.  ~~**Dashboard analitik tenant dan internal**~~ (Diimplementasikan hingga v0.28.0):
    *   Dashboard tenant menampilkan performa editorial, produktivitas editor, distribusi kategori, revisi, waktu publikasi, dan perbandingan periode.
    *   Dashboard validasi internal menampilkan telemetry produk dan indikator kualitas khusus owner.
    *   Endpoint analitik menerapkan filter workspace, rentang tanggal, dan proteksi owner melalui `OWNER_USER_IDS`.
2.  ~~**Login aplikasi dan proteksi workspace**~~ (Diimplementasikan hingga v0.25.0):
    *   Clerk melindungi editor, dashboard, onboarding, pengaturan publikasi, dan API internal.
    *   Clerk Organizations menyediakan pemisahan tenant, peran anggota, dan pergantian workspace.
    *   Guest Mode tetap membuka demo terbatas tanpa memberi akses ke data workspace atau fitur premium.
3.  **Manajemen Pengaturan API Key**:
    *   Menambahkan panel pengaturan terenkripsi pada UI aplikasi agar administrator dapat memperbarui API key Gemini tanpa perlu mengubah berkas `.env` server secara manual.
4.  ~~**Streaming respons AI dan progress editorial**~~ (Diimplementasikan hingga v0.26.0):
    *   Endpoint analisis dan AI Draft mengirim respons bertahap melalui NDJSON.
    *   UI menampilkan progress review, rewrite, quality gate, SEO, serta potongan draf saat tersedia.
5.  ~~**Administrasi kredit internal**~~ (Diimplementasikan pada Unreleased):
    *   Owner dan super-admin dapat mencari customer berdasarkan email atau organization melalui `/admin/billing`.
    *   Add/deduct credit dicatat sebagai ledger `manual_adjustment` pada organization aktif dengan idempotency key dan konfirmasi eksplisit.
    *   Audit menyimpan pelaku, waktu, target organization, jumlah, alasan, dan referensi tiket tanpa mengubah saldo secara langsung.
    *   Referensi support dapat diverifikasi secara read-only ke Zoho Desk dan disimpan bersama external ticket ID serta URL audit.
6.  **Admin UI AI Provider (Pengaturan Model AI)**:
    *   Membangun halaman Admin UI di sisi frontend (`/settings/system/ai-config`) untuk memungkinkan administrator non-teknis mengganti *AI Provider* dan *Model* secara instan (Gemini, Groq, OpenRouter) tanpa perlu mengakses server VPS.
    *   Memanfaatkan kolom `aiProviderOverride` yang sudah ada di database untuk memberikan kemampuan konfigurasi model spesifik per-penyewa (*Organization*).

## Fase 2: Ekspansi fitur dan peran

Fase ini memperluas evaluasi editorial dan menghubungkan EAI dengan sistem publikasi eksternal.

1.  ~~**SEO Optimizer**~~ (Diimplementasikan hingga v0.24.0):
    *   Mengevaluasi kepadatan kata kunci (*keyword density*) secara natural.
    *   Memberikan saran perbaikan tautan internal (*internal links*) secara otomatis berdasarkan daftar artikel yang sudah dipublikasikan sebelumnya.
    *   Publish Ready menghasilkan SEO pack terstruktur berupa title, slug, meta description, excerpt, dan tags.
2.  ~~**Fact-Checker**~~ (Diimplementasikan hingga v0.24.0):
    *   Memindai klaim data, persentase, statistik, dan nama lembaga dalam draf.
    *   Menandai setiap klaim yang tidak dilengkapi dengan sumber referensi yang jelas.
    *   Final Quality Gate mencegah angka, entitas, URL, atau atribusi motif baru lolos tanpa dukungan sumber.
3.  **Integrasi CMS WordPress, Ghost, dan Contentful** (Sebagian diimplementasikan hingga Unreleased):
    *   EAI sudah memiliki adapter CMS, onboarding koneksi terenkripsi, verifikasi koneksi, dan export artikel Publish Ready sebagai draft.
    *   Plugin atau extension untuk menjalankan evaluasi langsung dari dalam editor CMS masih direncanakan.
    *   Adapter WordPress, Ghost, dan Contentful generik masih perlu dikembangkan di luar adapter REST Envoyou saat ini.

## Fase 3: Kolaborasi dan personalisasi

Fase ini mendukung standar editorial tenant dan kolaborasi tim dalam skala lebih besar.

1.  **Collaborative rich text editor**:
    *   Mengganti area teks editor sederhana dengan editor rich-text kolaboratif (seperti Tiptap atau Slate.js) yang mendukung pemformatan langsung, penyisipan gambar, dan penulisan bersama real-time.
    *   Menampilkan komentar saran AI secara inline langsung pada teks yang bermasalah (mirip fitur komentar di Google Docs).
2.  **Profil nada dan standar editorial tenant** (Sebagian diimplementasikan pada v0.22.2):
    *   Admin tenant sudah dapat mengatur brand, audience, tone, struktur artikel, kategori, format artikel, source policy, aturan SEO, dan domain internal link.
    *   Setiap perubahan membuat versi profil immutable dan setiap hasil analisis menyimpan versi profil yang digunakan.
    *   Beberapa profil aktif untuk subkanal atau rubrik dalam satu organization masih direncanakan.
3.  ~~**Profil user dan organization berbasis akun**~~ (Diimplementasikan hingga v0.22.2):
    *   Clerk menyimpan identitas akun dan keanggotaan organization.
    *   Database EAI menyimpan workspace, peran, paket, kredit, profil editorial, serta riwayat analisis per tenant.
4.  **Pelatihan AI berkelanjutan melalui feedback loop**:
    *   Menambahkan tombol "Setujui / Sangkal Penilaian AI" bagi editor manusia. Data sanggahan ini akan disimpan ke database untuk disajikan sebagai bahan *fine-tuning* prompt sistem masa depan guna meminimalisir kesalahan evaluasi AI (*false positives*).
5.  **Sistem Multi-bahasa (Bilingual Platform)**:
    *   Memantapkan kesiapan platform menjadi aplikasi multi-bahasa (secara bawaan mendukung EN dan ID) menggunakan Translation Management System (TMS) seperti **Tolgee**.
    *   Membangun alur kerja lokalisasi otomatis (*localization pipeline*) agar penambahan teks antarmuka (*UI copy*) baru dapat diterjemahkan secara sinkron dan langsung terintegrasi ke dalam *build* rilis.

## Fase 4: Workspace kreasi berbasis sumber dan deep research

Fase ini mengembangkan AI Drafting Assistant menjadi workspace berbasis sumber dan riset agen.

1.  ~~**Workspace sumber terkelola**~~ (Diimplementasikan sebagai Research Notes Studio):
    *   Menggantikan kolom masukan referensi statis dengan *Research Notes Studio* di panel samping.
    *   Output dari Copilot dapat disimpan secara dinamis sebagai Catatan Riset (*Research Notes*) ke dalam *session storage*.
    *   Semua catatan sumber disajikan di panel samping sebagai dasar referensi penulisan untuk di-sintesis oleh AI Draft Generator.
2.  ~~**Chatbot interaktif berbasis sumber**~~ (Diimplementasikan sebagai EAI Research Copilot):
    *   Menyediakan panel obrolan terdedikasi (Copilot) di mana penulis dapat berdiskusi, menganalisis data, dan menyusun *blueprint* artikel.
    *   AI memberikan respons dinamis dengan dukungan sitasi gaya Perplexity untuk akurasi data.
3.  ~~**Penyusunan draf kasar langsung ke editor**~~ (Diimplementasikan pada v0.26.0 & terbaru):
    *   AI Drafting Assistant dan *endpoint* `generate-draft-from-notes` membuat draf secara *streaming* langsung di editor utama dari sumber/catatan riset yang dipilih.
4.  ~~**Integrasi deep research agent**~~ (Diimplementasikan melalui Gemini Interactions API):
    *   Menyematkan agen pencarian asinkron berbasis alat Google Search Grounding di dalam mode interaktif Copilot.
    *   Saat di mode *Deep*, Copilot secara independen mencari informasi terbaru di web, memverifikasi klaim, dan mensintesis hasilnya untuk dikumpulkan ke dalam *Research Notes*.

## Fase 5: Legal dan compliance untuk paid SaaS

Roadmap ini mengikuti tingkat validasi bisnis agar beban compliance tumbuh bersama jumlah pelanggan. Dokumen legal final tetap harus ditinjau advokat Indonesia dan aspek pajaknya dikonfirmasi dengan konsultan pajak.

### Phase A — First Paying Customers

**Target:** 1–10 pelanggan pertama.

**Status per 15 Juni 2026:** NIB EAI, PSE dan NPWP perorangan sudah tersedia untuk
operasional awal sebagai usaha perorangan. Registrasi aktivasi merchant Midtrans production masih dalam proses.

**Fokus:**

1.  ~~**NIB**~~ (Selesai pada Juni 2026):
    *   NIB EAI sudah terbit dan bukti resminya disimpan di penyimpanan compliance internal yang tidak masuk Git.
    *   Identitas operator, KBLI, alamat resmi, dan kontak usaha perlu dijaga konsisten pada situs, checkout, invoice, PSE, dan pengajuan payment gateway.
2.  ~~**NPWP**~~ (Selesai untuk operasional awal pada Juni 2026):
    *   NPWP perorangan digunakan selama EAI masih dikelola sebagai usaha perorangan dan identitasnya dijaga konsisten dengan NIB, PSE, invoice, rekening settlement, serta akun merchant Midtrans.
    *   Berdasarkan PP Nomor 20 Tahun 2026, bagian omzet WP Orang Pribadi sampai Rp500 juta per tahun bebas PPh, sedangkan fasilitas PPh Final UMKM 0,5% dapat digunakan oleh WP Orang Pribadi yang memenuhi ketentuan dengan omzet sampai Rp4,8 miliar per tahun tanpa batas waktu.
    *   Tetap melakukan pencatatan omzet dan biaya, menyimpan bukti pembayaran serta invoice, dan melaporkan SPT Tahunan meskipun belum ada PPh yang harus dibayar.
    *   Evaluasi bantuan konsultan pajak ketika bentuk usaha berubah, transaksi menjadi kompleks, terdapat pegawai atau kewajiban pajak lain, atau skala usaha membutuhkan perencanaan pajak khusus.
3.  ~~**PSE Lingkup Privat**~~ (Selesai pada 16 Juni 2026):
    *   Mendaftarkan EAI melalui OSS dan menyimpan bukti registrasi yang dapat diverifikasi.
4.  **Terms of Service** (Sebagian diimplementasikan pada v0.29.0):
    *   Membuat halaman `/legal/terms` dengan versi dan tanggal berlaku.
    *   Mencakup akun, organization, paket, kredit, suspend/termination, hak input/output, batas tanggung jawab, penggunaan AI, human review, dan penggunaan terlarang.
    *   Menautkan Terms dari auth, checkout, pricing, dan footer.
    *   Baseline produk dan tautannya sudah tersedia; identitas badan usaha final dan peninjauan penasihat hukum masih diperlukan.
5.  **Privacy Notice** (Sebagian diimplementasikan pada v0.29.0):
    *   Membuat halaman `/legal/privacy` yang menjelaskan data yang dikumpulkan, tujuan pemrosesan, provider yang digunakan, keamanan, retensi dasar, hak pengguna, dan kontak privasi.
    *   Mendokumentasikan aliran data produksi untuk Clerk, Vercel, Neon, provider AI, payment gateway, CMS tenant, logging, analytics, dan email.
    *   Baseline notice sudah tersedia; data inventory final dan peninjauan penasihat hukum masih diperlukan.
6.  **Refund Policy** (Sebagian diimplementasikan pada v0.29.0):
    *   Membuat halaman `/legal/refund` untuk paket prepaid, kredit, add-on, transaksi gagal/duplikat, pembatalan, fraud, dan chargeback.
    *   Menampilkan ringkasan refund sebelum pengguna diarahkan ke payment gateway.
    *   Halaman kebijakan dan konfirmasi sebelum checkout sudah tersedia; keputusan operasional final perlu diselaraskan dengan Midtrans dan penasihat hukum.
7.  ~~**Pricing**~~ (Diimplementasikan pada v0.29.0):
    *   Halaman pricing, paket bulanan/tahunan, add-on kredit, serta penanda paket aktif sudah tersedia.
    *   Harga, mata uang, pajak, masa aktif, dan dampak perubahan paket harus tetap konsisten dengan Terms dan Refund Policy.
    *   Konfirmasi sebelum checkout menampilkan harga USD, nominal IDR final, kurs, status pajak, kredit, masa aktif, dan manual renewal dari konfigurasi server yang sama dengan order.
8.  **Payment Gateway** (Integrasi teknis tersedia; merchant production dalam proses):
    *   Midtrans menjadi provider default dan satu-satunya payment gateway saat ini.
    *   Ledger order, verifikasi webhook, pencocokan provider/nominal, dan alokasi kredit sudah tersedia.
    *   Menyelesaikan verifikasi dan aktivasi merchant Midtrans production dengan identitas usaha yang konsisten terhadap NIB, NPWP, rekening settlement, situs, dan dokumen legal.
    *   Paid checkout dapat ditahan dengan feature flag sampai merchant production siap, tanpa menonaktifkan pricing preview atau webhook order lama.

**Batas fase:** setelah kebutuhan di atas selesai, mulai menerima dan memvalidasi pelanggan pertama. SLA, ISO 27001, dan DPA enterprise tidak dikerjakan pada fase ini.

### Phase B — Validation

**Target:** 10–50 pelanggan.

1.  **Support SOP**:
    *   Menetapkan kanal support serta SOP untuk complaint, refund, payment dispute, account recovery, abuse report, dan takedown hak cipta.
    *   Menyimpan riwayat tiket dan keputusan penting.
2.  **Data export**:
    *   Menyediakan proses bagi pengguna atau admin organization untuk mengekspor data akun, workspace, dan konten yang relevan.
3.  **Account deletion**:
    *   Menyediakan penghapusan akun dan organization dengan verifikasi identitas, masa tenggang, approval admin, serta pengecualian retensi untuk pajak, transaksi, keamanan, atau sengketa.
4.  **Security policy sederhana**:
    *   Mendokumentasikan kontrol akses, encryption, secret management, backup, vulnerability handling, dan secure development yang sudah dijalankan.
5.  **Subprocessor list**:
    *   Menerbitkan daftar vendor yang memproses data pelanggan, tujuan pemrosesan, serta mekanisme pemberitahuan perubahan.

### Phase C — Growth

**Target:** 50–200 pelanggan.

1.  **Incident response**:
    *   Menetapkan klasifikasi insiden, PIC, escalation path, investigasi, komunikasi pelanggan, pelaporan kebocoran data, dan latihan insiden berkala.
2.  **Retention automation**:
    *   Menentukan jadwal retensi per kategori data dan membuat scheduled job untuk penghapusan atau anonimisasi.
    *   Menyelaraskan expiry backup agar data yang telah dihapus tidak dipulihkan secara permanen.
3.  **Vendor governance**:
    *   Membuat vendor register, risk rating, owner, jadwal review, lokasi pemrosesan, penggunaan data, dan exit plan.
4.  **Audit evidence**:
    *   Menyimpan bukti approval kebijakan, access review, backup test, incident exercise, vulnerability remediation, consent, dan vendor review.

### Phase D — Enterprise

**Target:** perusahaan mulai meminta kontrak dan komitmen layanan khusus.

1.  **Master Service Agreement (MSA)**:
    *   Menyiapkan kontrak induk dan Order Form untuk kebutuhan komersial pelanggan enterprise.
2.  **Data Processing Agreement (DPA)**:
    *   Menetapkan peran pemrosesan data, instruksi pelanggan, subprocessors, bantuan hak subjek data, transfer data, retensi, dan penghapusan.
3.  **Service Level Agreement (SLA)**:
    *   Menentukan availability, maintenance window, severity, support hours, response target, service credit, pengecualian, dan metode pengukuran.
4.  **Security Addendum**:
    *   Mendokumentasikan kontrol keamanan kontraktual, audit rights, incident notification, business continuity, dan tanggung jawab bersama.
5.  **Status Page**:
    *   Mengaktifkan uptime monitoring, status layanan publik, incident history, dan post-incident review sebelum SLA dijanjikan.
6.  **ISO 27001 preparation**:
    *   Melakukan gap assessment, menetapkan scope ISMS, risk register, control owner, kebijakan, dan program evidence berdasarkan permintaan pasar enterprise.

## ~~Pricing dan kredit artikel~~

Pricing v1 dan ledger kredit sudah diimplementasikan hingga Unreleased. Midtrans menjadi provider checkout tunggal, dan setiap webhook mencocokkan provider, order, serta nominal sebelum mengalokasikan kredit.

### Konsep kredit

* **1 kredit**: satu artikel diproses melalui **Refine Draft**
* **Trial**: creator workspace baru menerima 10 kredit pada Clerk Organization
  setelah melewati pemeriksaan kelayakan; anggota undangan tidak membuat
  alokasi trial tambahan
* **Add-on**: 50 kredit seharga $8 dan tidak kedaluwarsa

### Paket bulanan

| Plan | Harga | Kuota Kredit / Bulan | Biaya per Artikel | Cocok Untuk |
|---|---|---|---|---|
| **Starter** | **$10** / bulan | **50 Kredit** | $0.20 | Penulis mandiri / Blogger pemula |
| **Pro** | **$19** / bulan | **100 Kredit** | $0.19 | Professional editor / Blogger aktif |
| **Team** | **$79** / bulan | **300 Kredit** | $0.263 | Publikasi besar / Agensi / Tim kolaboratif |

### Paket tahunan

Paket tahunan memberikan alokasi kredit prepaid untuk 12 bulan. Auto-renew recurring belum diaktifkan.

| Plan | Harga Tahunan | Ekuivalen Bulanan | Total Kredit / Tahun | Diskon |
|---|---|---|---|---|
| **Starter Yearly** | **$96** / tahun | $8.00 / bulan | **600 Kredit** | **20%** |
| **Pro Yearly** | **$182** / tahun | $15.17 / bulan | **1.200 Kredit** | **20%** |
| **Team Yearly** | **$758** / tahun | $63.17 / bulan | **3.600 Kredit** | **20%** |
