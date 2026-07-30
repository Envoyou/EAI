# Evolusi Prompt (Prompt Evolution)

Dokumen ini mencatat rancangan, riwayat iterasi, kendala teknis, serta solusi rekayasa prompt (*prompt engineering*) yang diterapkan pada Envoyou AI Editorial System.

---

## 1. Versi Saat Ini: v3.3.0 (Strategist Prompt Optimization & Real-Time Thinking)

Prompt utama dikelola secara modular menggunakan **Composable Prompt Component Architecture (PCA)** di `src/lib/ai/prompt-engine/` dan memanfaatkan modul pembangun konteks bersama `src/lib/ai/workspace-context.ts`. Berkas `src/lib/prompts.ts` disederhanakan murni sebagai pembantu utilitas bersama.

### Struktur Utama System Prompt & Asisten Strategis
Prompt yang dikirim ke model kini dibagi ke lima jalur:
1.  **Review Prompt**: ringkas, manual-first, fokus pada 3 masalah/kekuatan utama.
2.  **Rewrite Prompt**: menulis ulang artikel final sebagai plain text, bukan JSON, untuk mengurangi risiko escape dan truncation.
3.  **Final Quality Gate Prompt**: menilai refined draft, merangkum perubahan, dan menghasilkan readiness tanpa skor.
4.  **SEO Prompt**: menghasilkan metadata SEO dalam JSON terpisah.
5.  **Strategist Prompt & Assistant**:
    - `StrategistChatComposer` (Obrolan/Brainstorming)
    - `StrategistBlueprintComposer` (Pembuatan Rencana & Draf Kasar)
    - `DraftFromNotesComposer` (Konversi Catatan Riset ke Artikel)
    - `StrategistFastModeInstructionNode` (Instruksi Fast Mode Modular)

Semua jalur prompt kini telah dimigrasikan untuk menggunakan skema perakitan konteks terpadu (Workspace Context XML) dan penyuntikan instruksi kepatuhan brand dinamis (Agent Instruction).

### Optimasi Gemini 3.x Native Thinking & Caching
Sejak transisi ke model Gemini 3.x, sistem prompt dan penanganan obrolan diperbarui secara radikal:
1.  **Penghapusan CoT Manual**: Petunjuk menulis pemikiran di dalam `<thinking>` tag dihapus karena bertabrakan dengan Gemini 3.x native thinking. Mode native thinking menghasilkan penalaran model dalam event delta `thought_summary` secara terpisah (bukan inline text), sehingga manual `<thinking>` tag dibuang demi efisiensi cache dan latensi.
2.  **Streaming Ringkasan Penalaran**: Request chat produksi mengaktifkan `generation_config.thinking_summaries = "auto"` secara eksplisit. Ringkasan penalaran model (`thought_summary` delta)—bukan raw chain-of-thought—diteruskan secara real-time dari backend ke client dengan SSE event type `thinking`. Grounded chat memakai thinking level medium dan chat tanpa Search memakai level low; UI tetap menyediakan fallback statis ketika provider tidak menghasilkan summary.
3.  **Pemisahan Instruksi Fast Mode & Overrides**: Mengubah instansiasi Fast Mode menjadi node statis (`StrategistFastModeInstructionNode`) agar dapat di-cache secara efisien oleh Gemini, sementara override untuk URL scraper dan dokumen lampiran dipisahkan sebagai data payload dinamis.
4.  **Dynamic Date Injection**: Tanggal hari ini menggunakan `RenderContext.today` dinamis yang disuntikkan saat rendering node, bukan lagi tanggal hardcoded yang merusak grounding spasial waktu model.

Untuk mode `polish`, sistem tidak lagi menonjolkan pemilihan role di UI. Role lama masih ada di kode sebagai fondasi, tetapi alur utama produk telah dipusatkan pada satu tindakan: `Polish Article`.

---

## 2. Tantangan & Solusi Rekayasa Prompt

Dalam masa pengembangan awal, ditemukan beberapa kendala pada respon model AI. Berikut adalah catatan perbaikan yang dilakukan:

### A. Masalah Output JSON Terbungkus Markdown
*   **Kendala**: Claude sering kali membungkus output JSON dalam format blok kode markdown (contoh: \`\`\`json ... \`\`\`) meskipun sistem meminta format JSON mentah. Hal ini memicu kegagalan fungsi `JSON.parse()`.
*   **Solusi**: Daripada membuat instruksi prompt menjadi terlalu panjang dan membatasi fleksibilitas AI, sistem di sisi API (`src/app/api/analyze/route.ts`) dimodifikasi untuk membersihkan blok kode markdown secara otomatis sebelum di-parse:
    ```typescript
    let jsonString = responseContent;
    if (jsonString.includes('```json')) {
      jsonString = jsonString.split('```json')[1].split('```')[0].trim();
    } else if (jsonString.includes('```')) {
      jsonString = jsonString.split('```')[1].split('```')[0].trim();
    }
    ```

### B. Bias Penilaian (Score Skewness / "AI Laziness")
*   **Kendala**: AI cenderung memberikan skor yang aman di kisaran 80–90 untuk hampir semua draf, dan jarang memberikan skor sangat rendah meskipun draf tersebut sangat berkualitas rendah atau menggunakan frasa generik AI.
*   **Solusi**: Memperkenalkan **Indikator Wajib FAIL** di dalam rubrik penilaian prompt:
    *   *Penalti otomatis skor di bawah 50* jika draf mengandung pembuka klise seperti *"Dalam era..."* atau *"Di tengah perkembangan..."*.
    *   *Penalti otomatis* jika terdeteksi lebih dari 3 kalimat pasif berturut-turut.
    *   *Penalti otomatis* jika artikel menggunakan struktur generik esai sekolah (Pengertian → Manfaat → Kesimpulan).
    Aturan keras ini memaksa Claude menjadi penilai yang objektif dan konsisten.

### C. Truncation pada Artikel Panjang
*   **Kendala**: Structured output panjang sering terpotong (`MAX_TOKENS`) ketika model diminta memberi feedback, rewrite penuh, dan SEO sekaligus.
*   **Solusi**:
    *   Memecah pipeline menjadi beberapa panggilan model.
    *   Memindahkan rewrite final ke output plain text.
    *   Membagi rewrite menjadi beberapa chunk berdasarkan heading/paragraf.

### D. Guardrails Editorial untuk Rewrite
*   **Kendala**: Saat diminta membuat tulisan lebih tajam, model cenderung melakukan *over-correction*: hiperbolis, loncat topik, atau mengulang statistik di jarak dekat.
*   **Solusi**: Versi prompt `v1.1.0+` menambahkan guardrails seperti:
    *   **Single Throughline**: setiap section wajib memperkuat satu tesis utama.
    *   **Anti-Sensationalism**: menghindari frasa hiperbolis yang merusak kredibilitas.
    *   **Zero Nearby Repetition**: angka/fakta tidak boleh diulang dalam 3 paragraf tanpa konteks baru.
    *   **Strategic Implication Conclusion**: penutup harus berisi implikasi strategis, bukan ringkasan generik.
    *   **Strict Markdown Integrity**: tabel markdown harus aman untuk rendering frontend.

### E. Temporal Awareness dan Stabilitas Polish
*   **Kendala**: Model dapat salah membaca peristiwa tahun berjalan sebagai proyeksi masa depan, terutama saat klaim menyebut tahun yang lebih baru dari pengetahuan model atau memakai angka pendanaan/valuasi yang sangat besar.
*   **Solusi**: Versi prompt `v1.2.2` menambahkan:
    *   **Konteks tanggal editorial** berbasis `Asia/Jakarta`.
    *   **Klasifikasi temporal** untuk historical event, current event, ongoing development, dan future projection.
    *   **Larangan framing retrospektif penuh** untuk tahun berjalan, kecuali konteks memang merujuk seluruh tahun.
    *   **Prioritas rewrite eksplisit** agar target ringkas 80-90% tidak mengorbankan integritas fakta atau kejelasan argumen.
    *   **Rubrik skor Polish Review** untuk mengurangi inkonsistensi skor antar-run.
    *   **Guardrail factual refinement** agar mode iterative refinement tidak mengubah angka, entitas, tanggal, valuasi, atau klaim faktual saat hanya diminta memperbaiki gaya/struktur.

### F. Final Quality Gate dan Deterministic Guardrails
*   **Kendala**: Skor pada draf mentah kurang berguna untuk flow Polish karena bahan awal memang belum memenuhi POV Envoyou. Model juga dapat menghasilkan false positive source fidelity, tabel ASCII, internal link lintas topik, marker verifikasi internal, atau atribusi motif yang tidak didukung sumber.
*   **Solusi**: Versi prompt `v1.3.x` dan pipeline final-quality menambahkan:
    *   Status `ready`, `needs_review`, dan `blocked` terhadap refined draft.
    *   Refinement report yang menjelaskan perubahan berhasil dan remaining checks tanpa skor.
    *   Pemeriksaan deterministik angka/rentang, URL, entitas, drift akronim, motif, fase kalender, dan format tabel.
    *   Pemisahan quality-gate draft dari publication draft agar marker verifikasi tetap diaudit tetapi tidak masuk CMS.
    *   Seleksi internal link berdasarkan overlap substantif dan keluarga topik.
    *   Retry quality gate satu kali sebelum fallback.
    *   Kontrak mode-aware: Fast mengaudit body saja, sedangkan Publish Ready mengaudit body tanpa H1 bersama Publication Package yang sudah dibuat sebelumnya.
    *   Status package `not_generated/current/stale` membatalkan export jika body berubah setelah metadata dibuat.
    *   Rekonsiliasi daftar perubahan mencegah visual unsupported dipuji sekaligus ditandai sebagai risiko.

#### Evolusi Konvergensi Final Draft (2026-07-25)
*   **Kendala**: Quality Check mandiri sebelumnya dapat mengevaluasi ulang draft tanpa membawa keputusan editor, research notes, atau verifikasi sumber dari iterasi sebelumnya. Warning yang sudah ditangani dapat muncul kembali, sementara batas daftar feedback membuat temuan lain baru terlihat pada iterasi berikutnya. Akibatnya, pengguna berisiko terjebak dalam loop `needs_review` hingga temuan `blocked` muncul belakangan.
*   **Solusi pipeline**:
    *   Menyimpan keputusan warning yang diterima, diterapkan, atau diverifikasi dalam `metadata._system.resolvedQualityFindings`, lalu merekonsiliasikannya hanya jika kategori dan target temuan tetap cocok. Temuan `fail` tidak pernah diredam oleh ledger.
    *   Mengirim research notes tersimpan dan URL sumber eksternal persis yang telah diverifikasi ke Quality Gate berikutnya. Kepercayaan URL tidak diperluas menjadi kepercayaan otomatis terhadap klaim lain.
    *   Memvalidasi hasil Targeted Fix terhadap draft awal dan research notes. Jika kandidat memperkenalkan angka, entitas, atau URL baru, model menerima satu retry korektif; hasil yang tetap tidak aman ditolak.
    *   Memprioritaskan gabungan temuan model dan deterministik hingga 12 item agar masalah penting terlihat dalam satu siklus, lalu menurunkan readiness secara konsisten (`fail` → `blocked`, warning/flag → `needs_review`, tanpa temuan → `ready`).
    *   Menyediakan konfirmasi eksplisit untuk mempertahankan metadata publikasi stale yang masih relevan. Konfirmasi berlaku pada body aktif, tidak mengubah metadata, tidak melewati Quality Gate, dan dibatalkan oleh perubahan body berikutnya.
    *   Memisahkan keputusan `isAccepted` yang tidak mengubah body dari `isApplied` untuk rewrite/remove. Perubahan body tetap menunggu Quality Check, menggunakan hasil persist backend sebagai sumber readiness/status package, dan ditampilkan sebagai pending recheck alih-alih acceptance final.
 
### G. Caching & Stabilitas Rekayasa Prompt Riset & Draf (EAI Chat & Draft)
*   **Kendala**: Struktur instruksi asisten riset dan draft kasar cenderung panjang dan dinamis (misalnya menyertakan target bahasa dinamis, sitasi, dan draft mentah), yang menyebabkan caching model (Gemini Context Caching) tidak optimal karena parameter `system_instruction` berubah per permintaan. Selain itu, instruksi sitasi dan batasan menulis sering tersebar di antara input dan system instruction, membagi perhatian model.
*   **Solusi**: Melakukan konsolidasi total seluruh aturan penulisan dan sitasi ke dalam `system_instruction` yang murni statis tanpa template literal dinamis. Nilai dinamis (seperti outputLanguage) diteruskan sebagai parameter metadata terstruktur dalam kueri `input` (ARTICLE METADATA).

### H. Dynamic Fast Mode & Document Mode Override (EAI Chat Copilot)
*   **Kendala**: Ketika pengguna mengunggah dokumen (seperti berkas CSV, TXT, atau PDF) dan mengajukan pertanyaan pada chat strategis (Fast Mode), batasan bawaan Fast Mode (membatasi panjang output menjadi 2-4 kalimat/paragraf, memaksa aturan "ONE focused insight") membuat AI menjadi tidak fleksibel. Model cenderung melewatkan analisis komparatif kuantitatif, menolak menyajikan data dalam bentuk tabel/poin, dan rentan meluncurkan Google Search eksternal yang mengabaikan berkas lokal.
*   **Solusi**: Memperkenalkan sistem **Dynamic Override Instruction** berbasis pendeteksian lampiran berkas (`hasAttachments`). Jika berkas terlampir terdeteksi, backend secara dinamis menambahkan blok instruksi khusus `<document_mode_override>` di akhir `system_instruction`:
    1.  **Prioritas Analisis Lokal**: Menginstruksikan AI untuk memprioritaskan teks di dalam `<attached_file>` dan membatasi Google Search hanya jika diminta secara eksplisit oleh user.
    2.  **Pelonggaran Batasan Struktur**: Mengubah kueri apa pun dengan berkas terlampir menjadi *Research Request*, secara instan melonggarkan batasan panjang output agar model leluasa menghasilkan tabel Markdown, klasifikasi tema, dan daftar poin terperinci.
    3.  **Grounding Kuantitatif Eksplisit**: Mewajibkan penyebutan data numerik secara presisi (seperti jumlah views, unique visitors, judul lengkap artikel) alih-alih generalisasi kategori.
    4.  **Saran Pertanyaan Lanjutan Kontekstual**: Memaksa generator saran (`[SUGGESTIONS: ...]`) untuk merumuskan pertanyaan lanjutan yang merujuk balik ke anomali, perbandingan metrik, atau tren data berkas tersebut.
*   **Implikasi Caching**: Pendekatan ini membagi *cache space* Fast Mode menjadi dua ember (*cache buckets*) yang sangat stabil dan predictable (permintaan biasa tanpa berkas vs permintaan dengan berkas), memberikan rasio optimal antara efisiensi Gemini Context Caching dengan presisi analisis model.

### I. Jejak Penalaran Chain-of-Thought (CoT) & Optimasi Prefix Caching (v2.1.0)
*   **Kendala**:
    1.  Model evaluasi (Reviewer dan Quality Gate) langsung menghasilkan keputusan status/kelayakan dalam format JSON tanpa ruang beranalisis kritis terlebih dahulu. Ini menyebabkan terjadinya *false positives* (meloloskan draf bermasalah).
    2.  Instruksi bahasa (`Language Policy`) dan tingkat ketat (`strictness`) disisipkan secara dinamis di awal template prompt, merusak efisiensi *prefix caching* (Gemini/Claude) karena prompt selalu dianggap berubah dari awal kueri.
*   **Solusi**:
    1.  Menyisipkan properti `"thinking"` pada skema respons JSON (Zod dan prompt string). Model diwajibkan menulis jejak pemikiran logisnya terlebih dahulu sebelum mengisi verdict status.
    2.  Menata ulang template prompt dengan memindahkan properti dinamis ke bagian paling akhir di bawah blok `=== DYNAMIC CONSTRAINTS ===`, mempertahankan kerangka instruksi statis yang panjang di awal agar cache model terisi penuh dan menekan konsumsi token input.
    3.  Melengkapi panduan aturan modifikasi teks 1-klik dengan contoh few-shot JSON konkret untuk operasi `replace` dan `insert_after`.

### J. Refaktorisasi Konteks Workspace Modular & Batasan Input (v2.2.0)
*   **Kendala**: Sebelumnya, detail konfigurasi tenant (nama brand, positioning, audiens, nada bahasa, kategori) diubah menjadi string mentah secara terburu-buru di masing-masing endpoint AI (Chat, SEO, Quality Gate, Targeted Fix). Hal ini memicu duplikasi kode format prompt, tidak konsistennya pembatasan input, dan ketidakmampuan model membedakan data workspace dari instruksi sistem (potensi *prompt injection*).
*   **Solusi**: Memperkenalkan arsitektur penyusunan payload berbasis **Object-First** dan enkapsulasi XML terstruktur menggunakan helper terpusat `src/lib/ai/workspace-context.ts`:
    1.  **Pemisahan Data vs Aturan**: Mengelompokkan data status workspace saat ini ke dalam blok XML `<workspace_context>` dan aturan kepatuhan brand/perilaku agen ke dalam `<agent_instruction>`.
    2.  **Dynamic Agent Instruction Fallback**: Jika profil tenant belum dikonfigurasi (`Not Configured`), helper secara otomatis menyuntikkan instruksi fallback agar AI beroperasi dalam mode netral/jurnalisme umum. Jika profil telah terisi (`Loaded`), helper menyuntikkan instruksi kepatuhan nada brand secara eksplisit ke system prompt model.
    3.  **Penerapan Seragam**: Pipeline SEO Optimizer, Fact-Checker (Quality Gate), Targeted Fix, dan Chat Strategist diubah untuk mengonsumsi helper terpusat ini. Hal ini menjamin konsistensi nada brand di seluruh gerbang AI dengan efisiensi token input yang tinggi.

### K. Pembersihan Model yang Sudah Ditinggalkan (v2.3.0)
*   **Kendala**: Referensi ke model `gemini-2.5-flash` (nama alias lama) dan `gemini-2.0-flash-lite` (model yang dihentikan) masih tersebar di `.env.example`, `health.ts`, dan `test_grounding_sync.js`. Referensi ini menimbulkan kebingungan bagi developer baru dan berpotensi memicu error di health check jika model dihapus oleh Google.
*   **Solusi**: Seluruh referensi model usang diganti dengan nama resmi terkini:
    *   `gemini-2.5-flash` → `gemini-2.5-flash-preview-05-20` (production default)
    *   `gemini-2.0-flash-lite` → dihapus dari semua titik konfigurasi
    *   Audit codebase dilakukan menyeluruh untuk memastikan tidak ada string model lama yang tersisa.

### L. Standarisasi `ThinkingLevel.LOW` di Semua Tahap Evaluasi (v2.3.0)
*   **Kendala**: `ThinkingLevel` yang berbeda-beda di setiap stage evaluasi (Review, Quality Gate, Quick Draft, Targeted Fix) membuat konsumsi token tidak terprediksi. Beberapa stage menggunakan *default* (yang mungkin `MEDIUM` atau lebih tinggi), menambah latensi tanpa peningkatan kualitas yang terukur untuk tugas evaluasi berstruktur.
*   **Solusi**: Semua stage yang menghasilkan output JSON terstruktur (bukan plain-text kreatif) distandarkan ke `ThinkingLevel.LOW`:
    *   `review-stage.ts`: `ThinkingLevel.LOW`
    *   `quality-gate-stage.ts`: `ThinkingLevel.LOW`
    *   `strategist/quick-draft.ts`: `ThinkingLevel.LOW`
    *   `targeted-fix-stage.ts`: `ThinkingLevel.LOW`
*   **Dasar Keputusan**: Latensi tambahan 100–500ms untuk TTFT masih sangat aman di bawah heartbeat SSE 5.000ms. *Trade-off* penghematan token ini sangat sepadan untuk meningkatkan throughput pipeline secara keseluruhan.

### M. H1 Format Contract & Konsolidasi Konfigurasi Provider (v2.3.0)
*   **Kendala 1 (H1 Duplikat)**: Rewrite stage menerima draf yang masih mengandung heading H1 di awal konten. Karena frontend sudah merender judul artikel secara terpisah dari body Tiptap, H1 yang tersisa di dalam body menghasilkan judul duplikat di artikel publik.
*   **Solusi 1**: Membuat fungsi `stripLeadingH1` di `src/lib/text-utils.ts`. Fungsi ini mendeteksi dan menghapus heading Markdown `# ...` pertama dari draf sebelum konten diteruskan ke rewrite stage.
*   **Evolusi Kontrak**: H1 draft mentah dipertahankan sebagai `workingTitle`; body final selalu tanpa H1. Publish Ready memakai `PublicationPackage.title` sebagai H1 halaman CMS, dan Quality Gate dilarang menyisipkan judul ke body. Kebijakan visual terpusat juga menjadikan prosa sebagai default serta mewajibkan seluruh node diagram, kolom tabel, metrik, dan relasi didukung sumber.
*   **Kendala 2 (Parameter `temperature` Mati)**: Panggilan native Gemini menggunakan fungsi `getGeminiSamplingConfig` yang mengembalikan objek `{ temperature, topP, topK }`. Namun, parameter `temperature` diabaikan sepenuhnya oleh Gemini ketika `thinkingConfig` aktif.
*   **Solusi 2**: Memperkenalkan helper eksplisit `getNativeGeminiConfig(thinkingLevel)` (tanpa parameter temperature) dan menandai helper lama sebagai `@deprecated`.

### N. Structured Outputs dan Proteksi Fallback Strategist (v2.4.0)
*   **Kendala**: Asisten Chat Strategist sebelumnya menggunakan pencarian teks manual (`<output_format>`) untuk menghasilkan draf dan saran dalam format JSON. Tanpa validasi skema di tingkat API, model rentan menghasilkan format JSON yang rusak atau terpotong, memicu kegagalan parse JSON di backend.
*   **Solusi**:
    1.  Menerapkan **Structured Outputs** pada pemanggilan API `gemini.interactions.create` dengan menyertakan konfigurasi `response_format` yang mendefinisikan `strategistPlanSchema`. Hal ini menjamin keluaran model selalu valid secara sintaksis JSON dan mematuhi skema terstruktur.
    2.  Membangun sistem perlindungan ganda: jika pemanggilan API dengan skema gagal, sistem melakukan *retry* otomatis tanpa pembatasan skema. Hasil retry tetap dinormalisasi dan seluruh field plan wajib lengkap; payload parsial tidak lagi diisi dengan placeholder semu.

### O. Refaktorisasi Konstanta Bersama & Pembersihan Batasan Panjang (v2.4.0)
*   **Kendala**:
    1.  Terdapat banyak instruksi yang diulang-ulang di `prompts.ts` (seperti larangan tabel ASCII, penguncian verifikasi data, dan larangan pembuka klise AI). Selain itu, terdapat aturan kuantitatif pemangkasan panjang artikel (target 80-90%) yang bertentangan dengan kebutuhan fleksibilitas pengguna platform.
*   **Solusi**:
    1.  Mengekstrak instruksi tabel GFM (`GFM_TABLE_RULE`) dan verifikasi lock (`VERIFICATION_LOCK_RULE`) menjadi konstanta global bersama untuk membersihkan redundansi di seluruh template prompt.
    2.  Menghapus aturan pembatasan kuantitatif panjang artikel (target *80-90%*) dan memfokuskan rewriting priority nomor 4 murni pada aspek **kepadatan kalimat (density)** daripada pengurangan jumlah kata secara kaku.
    3.  Menambahkan padanan terjemahan Bahasa Indonesia untuk contoh *tone* benar/salah pada `getToneGuidance` guna membantu pemodelan *tone* yang konsisten saat model menghasilkan konten berbahasa Indonesia.

### P. Refaktorisasi Prompt Statis untuk Optimalisasi Cache & Penalaran Terstruktur (v2.5.0)
*   **Kendala**:
    1.  Penyisipan instruksi bahasa (`Language Policy`), tingkat ketat (`strictness`), dan tanggal editorial hari ini (`currentEditorialDate`) secara dinamis di dalam `system_instruction` merusak efisiensi *caching* (Gemini Context Caching) karena instruksi sistem berubah per kueri.
    2.  Model pemoles draf (`getPolishedDraftPrompt`) cenderung menggunakan klise pembuka AI dan gaya penulisan yang terlalu generik tanpa contoh nyata (Telling vs Showing).
    3.  Model evaluasi kualitas (Review dan Quality Gate) rentan menghasilkan keputusan yang tidak konsisten atau terburu-buru (*false positive*) tanpa analisis bertahap yang mendalam.
*   **Solusi**:
    1.  **Statisasi Templat System Prompt**: Seluruh templat prompt di `prompts.ts` dikonversi menjadi statis. Semua data dinamis (bahasa, tanggal hari ini, strictness) dipindahkan ke objek `articleContext` di dalam user payload JSON. Konteks tanggal hari ini (`currentEditorialDate`) dihitung di backend (`prompt-context.ts`) dan disisipkan secara dinamis ke user content. Hal ini menjamin efisiensi caching system instruction 100% sempurna.
    2.  **Demonstrasi Few-Shot & Penalaran**: Menambahkan blok `=== REWRITE DEMONSTRATION ===` ke prompt pemoles draf. Menyediakan contoh draf mentah dengan klise AI ("In today's rapidly evolving digital era..."), langkah-langkah penalaran perbaikan model, dan hasil pemolesan akhir yang tajam.
    3.  **Mandatory Chain-of-Thought (CoT)**: Mewajibkan model evaluasi menulis langkah penalaran logis terstruktur di field `"thinking"` pada JSON response sebelum menyimpulkan status kelayakan.

### Q. Composable Prompt Component Architecture & Caching Tree (v3.3.0)
*   **Kendala**: Meskipun template prompt di `prompts.ts` telah distatiskan pada v2.5.0, berkas tersebut berukuran sangat besar (ribuan baris) dan sulit dirawat. Lebih jauh lagi, logika perakitan prompt dinamis (seperti pembatasan strictness, penguncian verifikasi data [[VERIFICATION_LOCK]], dan tone brand tenant) dicampur-campur secara manual di berbagai file stage route. Hal ini rentan terhadap kesalahan sintaksis, duplikasi kode, dan menyulitkan optimalisasi Gemini prompt caching secara konsisten.
*   **Solusi**:
    1.  **Penerapan Composable PCA (Prompt Component Architecture)**: Memperkenalkan arsitektur penyusunan prompt berbasis Abstract Syntax Tree (AST) di bawah `src/lib/ai/prompt-engine/`.
    2.  **Pemisahan Core & Tenant Nodes**: Memecah aturan prompt menjadi komponen-komponen kecil berupa node independen. `Core Nodes` (statis platform seperti misi editorial, aturan markdown, verifikasi data, kebijakan bahasa, batasan strictness, skema format keluaran) dipisahkan dari `Tenant Nodes` (dinamis tenant seperti positioning brand, tone calibration).
    3.  **Implementasi Stage Composers**: Membuat komposer khusus per tahapan stage (`SeoPromptComposer`, `ReviewPromptComposer`, `RewritePromptComposer`, `RefinementPromptComposer`, `QualityGatePromptComposer`, `StrategistPromptComposer`) yang menggunakan `CompositePromptNode` untuk mengelola pohon AST tersebut.
    4.  **Optimalisasi Gemini Prompt Caching**: `CompositePromptNode` secara otomatis merender seluruh node statis (Core) di bagian awal prompt dan menempatkan context/dynamic nodes di bagian akhir untuk memaksimalkan efisiensi context caching Gemini secara konsisten.
    5.  **Depresiasi Prompts Monolitik**: Berkas `prompts.ts` disederhanakan secara total, hanya menyisakan variabel sistem, timezone, dan pembantu penanggalan. Seluruh logika template prompt dikelola secara granular pada masing-masing AST node dan komposer.

### R. Optimasi PCA Lanjutan & Few-Shot Gaps (v3.3.1)
*   **Kendala**:
    1.  Meskipun model Gemini 3.x native thinking (`thinkingConfig` dengan `thought_summary` delta) sudah diaktifkan di backend untuk asisten evaluasi, model Reviewer dan Quality Gate masih diwajibkan menulis analisis CoT secara manual pada field `"thinking"` di skema JSON keluaran. Hal ini memicu duplikasi penalaran, pemborosan token output, dan memperlambat latensi respon.
    2.  Tahapan SEO Metadata dan Quality Gate Audit tidak memiliki visualisasi contoh input-output (*few-shot demonstrations*) konkret, sehingga model rentan menyimpang dari format/verdict ideal pada data marginal.
*   **Solusi**:
    1.  **Penghapusan CoT Manual pada JSON Schema**: Properti `"thinking"` dihapus dari deskripsi dan Zod schema di `packages/shared/src/schema.ts` serta dari instruksi sistem pada `ReviewRoleNode` dan `QualityGateRoleNode`. Provider-native thinking tetap digunakan secara internal bila tersedia, tetapi tidak diminta atau disimpan sebagai bagian dari JSON editorial.
    2.  **Few-Shot Demonstrations Baru**:
        *   Menambahkan `SeoExamplesNode` ke dalam `SeoPromptComposer` untuk memberikan visualisasi target output metadata SEO.
        *   Menambahkan `QualityGateExamplesNode` ke dalam `QualityGatePromptComposer` untuk melatih model membedakan draf ready vs needs_review secara presisi.
        *   Menambahkan contoh kognitif modular ke dalam `DraftFromNotesConstraintsNode` di `core/strategist.ts` guna memandu konversi draf dari blueprint tanpa meta-commentary.
    3.  **Hasil Dampak**: Latensi pemanggilan model pada tahap Reviewer dan Quality Gate berkurang secara terukur tanpa memengaruhi fungsionalitas dan logika validasi backend.

### S. Kontrak Metadata, Source Boundary, dan Struktur Draft (Unreleased)
*   **Kendala**: Batas metadata aktif tenant (misalnya meta title 60 karakter dan meta description 155 karakter) hanya diterapkan sesudah generation melalui `.slice()`. Model melihat batas schema umum yang lebih besar, sehingga kata dan kalimat dapat terpotong. Mode Fast juga masih berpotensi menambah detail dari model memory, dan keluaran rewrite dapat memakai H3 sebagai heading pertama.
*   **Solusi**:
    1.  Menambahkan `SeoLengthContractNode` dinamis yang mengirim batas tenant aktual dan mewajibkan frasa/kalimat lengkap sebelum model mengembalikan JSON.
    2.  Mengganti hard slicing dengan pemotongan batas kata/kalimat serta pemeriksaan deterministik untuk akhiran metadata menggantung sebelum status Publish Ready ditetapkan.
    3.  Menambahkan `FastSourceFidelityNode` yang melarang contoh, entitas, metrik, tanggal, relasi, dan detail teknis baru di luar sumber pada mode Fast.
    4.  Memperjelas kebijakan visual: prosa tetap default, koleksi singkat memakai list/tabel, dan Mermaid hanya untuk relasi yang benar-benar memerlukan diagram serta didukung sumber.
    5.  Menormalisasi hierarki Markdown di luar fenced code sehingga heading body pertama selalu H2 dan loncatan level dipromosikan secara aman.
    6.  Memvalidasi payload Strategist secara penuh serta mengekstrak bagian Draft ketika model mengembalikan Blueprint komposit.

### T. Persona Rewrite Multi-Tenant dan Workspace Context (v2.6.0)
*   **Kendala**:
    1.  `EditorialMissionNode`, `RewriteRoleNode`, `RewritePrioritiesNode`, dan `RefinementRoleNode` diberi status core/statis tetapi masih merender brand, positioning, tone, atau audience tenant.
    2.  Persona rewrite universal memaksakan gaya premium, audiens profesional, hook berbasis urgensi, dan penutup strategic projection meskipun tenant memiliki primary goal dokumentasi atau knowledge base.
    3.  Rewrite utama dan iterative refinement belum memakai kontrak `<workspace_context>` serta `<agent_instruction>` yang sudah digunakan SEO, Quality Gate, dan Targeted Fix.
*   **Solusi**:
    1.  Menjadikan mission dan role core netral terhadap tenant serta memindahkan seluruh identitas, tone, audience, primary goal, bahasa default, struktur, dan custom instruction ke node dinamis.
    2.  Mengganti few-shot Envoyou-centric dengan pasangan input-output netral yang menunjukkan penghapusan klise sekaligus mempertahankan fakta tanpa meminta reasoning manual.
    3.  Menetapkan Editorial Profile sebagai default dan `articleContext.targetAudience` non-null sebagai override eksplisit hanya untuk artikel aktif.
    4.  Menyertakan workspace context, agent instruction, serta ringkasan research notes pada system/user contract kedua jalur rewrite.
    5.  Menambahkan regresi yang membuktikan static prefix identik untuk dua tenant berbeda dan tidak memuat brand, audience, atau positioning tenant.

### T. Kontrak Actionability Feedback Final Quality Gate (Unreleased)
*   **Kendala**: Schema Final Quality Gate sebelumnya mengizinkan `suggestion`,
    `targetText`, dan `replacementText` semuanya kosong. Output tersebut tetap
    valid secara struktur, tetapi Editorial Preview tidak dapat menawarkan
    Apply, Rewrite with EAI, Copy Suggestion, ataupun keputusan editorial.
*   **Solusi**:
    1.  Menjadikan `suggestion` wajib pada response contract Final Quality Gate
        dan menormalisasi output provider lama/tidak lengkap dengan langkah
        review manual yang aman.
    2.  Memperjelas prompt agar setiap warning/failure menyatakan next action
        serta menyertakan kutipan `targetText` yang persis untuk masalah
        struktural bila memungkinkan.
    3.  Menambahkan jalur refinement Final Draft terbatas untuk temuan tanpa
        target teks. Jalur ini menggunakan message, suggestion, dan reason
        finding, menjaga bagian lain, lalu tetap melewati Quality Gate tanpa
        mengulang Full Analyze.
    4.  Membatasi acceptance generik hanya pada warning non-faktual; temuan
        source-risk dan failure blocking tetap memerlukan revisi atau verifikasi.

### U. Lifecycle Cancel dan Single-Flight Workspace (Unreleased)
*   **Kendala**: Tombol Cancel sebelumnya bergantung pada
    `analysis.status === "loading"`. Event awal seperti score atau readiness
    mengubah status menjadi `success` sebelum rewrite, Quality Gate, dan SEO
    selesai, sehingga Cancel menghilang ketika request masih aktif. Analyze
    ulang juga mengosongkan hasil lama sebelum memiliki hasil pengganti.
*   **Solusi**:
    1.  Menjadikan ownership AbortController sebagai sumber kebenaran lifecycle
        request dan mempertahankan Cancel sampai cleanup terminal selesai.
    2.  Menambahkan guard single-flight sinkron agar Analyze, Refine, targeted
        fix, Quality Check, SEO, Prepare, dan Draft from Notes tidak dapat
        dimulai bersamaan atau dipicu dua kali.
    3.  Menyimpan snapshot hasil lengkap dan source draft sebelum request baru;
        cancel pada Analyze/Refine/Quality Check/SEO memulihkan snapshot tersebut.
    4.  Tidak mengosongkan controller pada event Cancel. Request pemilik
        melepaskannya sendiri di `finally` setelah memverifikasi identity
        controller, sehingga cancel/restart cepat bebas race.
