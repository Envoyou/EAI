# Pembandingan Model AI (Evaluation Benchmark)

Dokumen ini memuat panduan, kriteria pengujian, dan catatan komparasi performa berbagai model bahasa besar (*Large Language Models* / LLM) yang diuji untuk menjalankan mesin evaluasi Envoyou AI Editorial System.

## Editorial Evaluation Dataset

Benchmark prompt baru menggunakan dataset internal di
`/dashboard/editorial-evaluation`, bukan angka proxy pada Validation Overview.
Dataset ini hanya dapat diakses platform owner dan tetap menyimpan
`organizationId` serta environment pada setiap run agar cohort lintas tenant
tidak kehilangan provenance.

Rantai data forward-captured adalah:

```text
input -> prompt/version -> provider/model -> output -> automated review/score
      -> persisted human or system revision events
```

`EditorialEvaluationRun` adalah snapshot output AI yang immutable.
`EditorialRevisionEvent` merupakan event append-only untuk perubahan body yang
tersimpan. `EditorialEvaluationTransition` menghubungkan lima pasangan evaluasi:

```text
Chat -> Blueprint
Blueprint -> Raw Draft
Raw Draft -> Polished Draft
Feedback -> Polished Draft
Polished Draft -> Manual Final
```

Setiap transisi menyimpan snapshot input/output dan provenance. Perubahan draft
juga memiliki sinyal deterministik jumlah kata, opening, heading, serta sumber
yang ditambah/dihapus. Hasil evaluator manusia atau LLM-as-judge berikutnya
dapat ditulis ke `evaluationResult` tanpa mengubah snapshot sumber.

Record historis yang direkonstruksi dari `AnalysisLog` atau
`ChatMessage` diberi provenance `backfilled_partial`: exact rendered prompt,
model chat lama, dan urutan revisi lama tidak boleh dianggap tersedia.

Capture aktif secara default hanya untuk development, test, staging, dan
preview. Production membutuhkan `EDITORIAL_EVALUATION_CAPTURE=true` secara
eksplisit. Tentukan label deploy melalui
`EDITORIAL_EVALUATION_ENVIRONMENT`; jangan mencampur test/staging dan production
dalam satu cohort evaluasi.

Selain gate environment tersebut, setiap organisasi wajib memberikan opt-in
eksplisit melalui **Settings → Workspace → Privasi data dan evaluasi AI**.
Default database adalah `false`. Tanpa consent, output baru tidak dicapture,
backfill melewati tenant tersebut, dan run yang telah tersimpan tidak dapat
dilihat melalui daftar, detail, atau export dataset. Pencabutan consent tidak
menghapus artikel operasional maupun snapshot lama secara otomatis; snapshot
lama tetap tersimpan untuk audit/retensi tetapi dikeluarkan dari penggunaan
dataset. Mengaktifkan kembali consent dapat membuat snapshot lama kembali
terlihat dan memungkinkan backfill data historis yang memenuhi syarat.

Hanya admin workspace aktif yang dapat mengubah consent. Keputusan menyimpan
timestamp, user actor, dan `AuditLog` atomik agar perubahan izin dapat diaudit.

Backfill dijalankan secara eksplisit dari halaman dataset setelah migrasi.
Backfill tidak dijalankan otomatis oleh SQL migration agar penerapan schema di
production tidak menyalin isi artikel tanpa keputusan operasional terpisah.

Tombol **Ekspor JSONL** pada halaman dataset mengikuti filter environment,
workflow, dan provenance yang sedang aktif. Baris pertama adalah manifest
schema dan filter; setiap baris berikutnya adalah satu `evaluation_run` lengkap
dengan review, revision events, dan transition yang output-nya dimiliki run
tersebut. Export tidak menyertakan `userId` atau `actorUserId`, tetapi tetap
memuat tenant attribution karena dataset hanya tersedia untuk platform owner.

Data mentah dalam dataset digunakan hanya untuk evaluasi internal. Akses owner
tidak menggantikan kewajiban redaction PII/secret, batas retensi, audit akses,
dan consent sebelum capture production diaktifkan.

---

## 1. Kriteria Pengujian (Benchmark Criteria)

Evaluasi model didasarkan pada empat dimensi utama yang krusial untuk alur kerja editorial:

1.  **Pemahaman Nada & Gaya Bahasa (Tone Nuance)**: Kemampuan model membedakan bahasa Indonesia yang bermutu tinggi dengan bahasa Indonesia hasil terjemahan kaku atau tulisan AI umum (*AI-spam*).
2.  **Kepatuhan Format JSON (Format Compliance)**: Tingkat keberhasilan model dalam mengembalikan struktur JSON murni sesuai dengan skema Zod (`FeedbackOutputSchema`) tanpa tambahan teks percakapan.
3.  **Kecepatan Respon (Latency)**: Rata-rata waktu yang dibutuhkan untuk menyelesaikan satu permintaan analisis penuh (draf artikel berukuran 500-1200 kata).
4.  **Akurasi Skor & Deteksi Pelanggaran (Scoring Alignment)**: Kemampuan model mendeteksi pelanggaran kriteria secara konsisten dan memberikan hukuman skor yang adil sesuai instruksi rubrik.

---

## 2. Tabel Perbandingan Performa Model (Model Comparison)

### Arsitektur Provider Saat Ini

EAI menggunakan **Gemini sebagai provider primer** dan **OpenRouter sebagai universal adapter** untuk akses ke model pihak ketiga (Anthropic, OpenAI, Meta, dll.). Provider dipilih melalui variabel lingkungan `ACTIVE_AI_PROVIDER`.

| Dimensi Pengujian | Gemini 3.6 Flash *(Provider Primer)* | Claude 5 Sonnet via OpenRouter | GPT-5.6 via OpenRouter |
| :--- | :--- | :--- | :--- |
| **Pemahaman Nada (Indonesian)** | 🥇 **Sangat Tinggi (9.5/10)**<br>Sangat peka terhadap nuansa bahasa Indonesia, gaya bercerita (*storytelling*), dan dialek lokal. Dioptimalkan via Composable PCA. | 🥈 **Tinggi (9.0/10)**<br>Generasi terbaru Claude secara signifikan lebih baik dalam nuansa Bahasa Indonesia dibanding versi 3.5. | **Tinggi (8.5/10)**<br>GPT-5 generasi lebih baik dalam tata bahasa namun kadang menghasilkan tone formal yang kurang alami untuk konten editorial Indonesia. |
| **Kepatuhan Format JSON** | **Sangat Tinggi (9.5/10)**<br>Native structured output via Gemini SDK; `responseMimeType: 'application/json'` menjamin output valid tanpa pembungkus. | **Tinggi (9.2/10)**<br>Dukungan JSON mode bawaan via OpenRouter. Sesekali terjadi penyertaan penjelasan di luar JSON pada prompt kompleks. | **Sangat Tinggi (9.8/10)**<br>Strict JSON Mode bawaan menjamin output selalu valid tanpa pembungkus. |
| **Kecepatan Respon (Latency)** | **Cepat (1.5 – 3.0 detik)**<br>Flash tier menawarkan latensi terbaik di kelas ini. | **Sedang (3.0 – 5.0 detik)** | **Sedang (2.5 – 4.5 detik)** |
| **Konsistensi Skor** | **Sangat Tinggi (9.5/10)**<br>Penalti skor untuk indikator wajib bekerja secara presisi dengan dukungan `thinkingConfig`. | **Tinggi (9.0/10)**<br>Konsisten dan kritis; lebih tegas dari versi lama dalam menilai draf berkualitas rendah. | **Tinggi (8.5/10)**<br>Konsisten namun kadang terlalu lunak pada draf berisiko sedang. |
| **Rekomendasi Status** | ✅ **Provider Utama (Production)** | 🔄 **Alternatif Premium via OpenRouter** | 🔄 **Alternatif via OpenRouter** |

### Catatan Historis (Benchmark Sebelum v3.0)

> Tabel berikut merupakan catatan evaluasi awal sebelum arsitektur saat ini (Gemini-first + OpenRouter universal adapter) ditetapkan. Disimpan untuk referensi migrasi.

| Dimensi Pengujian | Anthropic Claude 3.5 Sonnet | OpenAI GPT-4o | Llama 3 (70B Instruct) |
| :--- | :--- | :--- | :--- |
| **Pemahaman Nada (Indonesian)** | 🥇 Sangat Tinggi (9.5/10) | 🥈 Tinggi (8.0/10) | 🥉 Sedang (6.5/10) |
| **Kepatuhan Format JSON** | Tinggi (9.0/10) | Sangat Tinggi (9.8/10) | Sedang (7.5/10) |
| **Kecepatan Respon** | Sedang (3.5 – 5.5 detik) | Cepat (2.0 – 3.5 detik) | Sangat Cepat (1.5 – 3.0 detik) |
| **Konsistensi Skor** | Sangat Tinggi (9.0/10) | Tinggi (8.5/10) | Sedang (7.0/10) |
| **Status** | *(Digantikan oleh Gemini + Claude 5 via OpenRouter)* | *(Tersedia via OpenRouter)* | *(Kurang direkomendasikan untuk Bahasa Indonesia premium)* |


---

## 3. Metodologi Pengujian Model Baru (How to Benchmark)

Bagi developer yang ingin menguji model AI baru sebagai alternatif provider (misalnya model Claude terbaru, Llama 4, Mistral, atau DeepSeek via OpenRouter), wajib melakukan uji kelayakan menggunakan 5 variasi draf artikel uji berikut. Model diuji dengan mengatur `ACTIVE_AI_PROVIDER=openrouter` dan `OPENROUTER_MODEL=<nama-model>` di `.env` backend:

1.  **Draf Uji 1 (Premium Human Article)**: Artikel berkualitas tinggi yang ditulis oleh jurnalis profesional Envoyou. Model harus mampu memberikan skor tinggi (>85) dengan verdict `approve` dan minim koreksi.
2.  **Draf Uji 2 (AI-Generated Common Essay)**: Artikel yang sepenuhnya dihasilkan AI mentah dengan pembuka klise *"Di era globalisasi yang serba cepat ini..."* dan struktur Pengertian-Manfaat-Kesimpulan. Model **wajib** memberikan skor <50, memicu minimal 2 indikator kegagalan kritis, dan menandai bendera pelanggaran (*flags*).
3.  **Draf Uji 3 (Opinion Without Data)**: Artikel opini yang menarik tetapi tidak menyajikan satu pun data, statistik, atau referensi pendukung. Model harus mampu mendeteksi ketiadaan data ini dan memberikan status warning pada kategori relevansi kredibilitas.
4.  **Draf Uji 4 (Overly Passive Sentences)**: Artikel dengan tata bahasa Indonesia yang berantakan dan penggunaan kalimat pasif secara berturut-turut. Model harus memberikan umpan balik pada tata bahasa dengan memberikan saran perbaikan (*suggestions*) konkret.
5.  **Draf Uji 5 (Extreme Word Length)**: Draf artikel yang sangat panjang (>15.000 karakter). Model diuji ketahanannya terhadap batas context window dan kemampuannya menyelesaikan ringkasan evaluasi dalam rentang waktu yang wajar.
