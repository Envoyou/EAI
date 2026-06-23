# Pembandingan Model AI (Evaluation Benchmark)

Dokumen ini memuat panduan, kriteria pengujian, dan catatan komparasi performa berbagai model bahasa besar (*Large Language Models* / LLM) yang diuji untuk menjalankan mesin evaluasi Envoyou AI Editorial System.

---

## 1. Kriteria Pengujian (Benchmark Criteria)

Evaluasi model didasarkan pada empat dimensi utama yang krusial untuk alur kerja editorial:

1.  **Pemahaman Nada & Gaya Bahasa (Tone Nuance)**: Kemampuan model membedakan bahasa Indonesia yang bermutu tinggi dengan bahasa Indonesia hasil terjemahan kaku atau tulisan AI umum (*AI-spam*).
2.  **Kepatuhan Format JSON (Format Compliance)**: Tingkat keberhasilan model dalam mengembalikan struktur JSON murni sesuai dengan skema Zod (`FeedbackOutputSchema`) tanpa tambahan teks percakapan.
3.  **Kecepatan Respon (Latency)**: Rata-rata waktu yang dibutuhkan untuk menyelesaikan satu permintaan analisis penuh (draf artikel berukuran 500-1200 kata).
4.  **Akurasi Skor & Deteksi Pelanggaran (Scoring Alignment)**: Kemampuan model mendeteksi pelanggaran kriteria secara konsisten dan memberikan hukuman skor yang adil sesuai instruksi rubrik.

---

## 2. Tabel Perbandingan Performa Model (Model Comparison)

Berikut hasil pengujian internal berdasarkan performa model saat ini:

| Dimensi Pengujian | Anthropic Claude 3.5 Sonnet (Default) | OpenAI GPT-4o | Llama 3 (70B Instruct - Open Weights) |
| :--- | :--- | :--- | :--- |
| **Pemahaman Nada (Indonesian)** | 🥇 **Sangat Tinggi (9.5/10)**<br>Sangat peka terhadap nuansa kalimat pasif, gaya bercerita (*storytelling*), dan dialek lokal. | 🥈 **Tinggi (8.0/10)**<br>Memahami instruksi dengan baik, namun ada kecenderungan menghasilkan tone yang agak kaku. | 🥉 **Sedang (6.5/10)**<br>Sering meleset dalam nuansa lokal Indonesia dan gaya bahasanya terasa seperti hasil terjemahan langsung. |
| **Kepatuhan Format JSON** | **Tinggi (9.0/10)**<br>Kadang menyertakan pembungkus markdown (\`\`\`json), namun struktur data di dalamnya selalu akurat. | **Sangat Tinggi (9.8/10)**<br>Dukungan *Strict JSON Mode* bawaan menjamin output selalu valid tanpa pembungkus. | **Sedang (7.5/10)**<br>Memerlukan instruksi pemaksa ekstra agar tidak mengeluarkan teks deskripsi di luar JSON. |
| **Kecepatan Respon (Latency)** | **Sedang (3.5 – 5.5 detik)** | **Cepat (2.0 – 3.5 detik)** | **Sangat Cepat (1.5 – 3.0 detik)** (tergantung infrastruktur hosting) |
| **Konsistensi Skor** | **Sangat Tinggi (9.0/10)**<br>Penalti skor untuk indikator wajib gagal bekerja secara presisi. | **Tinggi (8.5/10)**<br>Konsisten, namun kadang terlalu lunak dalam memberikan penilaian draf buruk. | **Sedang (7.0/10)**<br>Skor sering melompat jauh untuk draf yang serupa. |
| **Rekomendasi Status** | **Sangat Direkomendasikan** | **Alternatif Utama** | **Kurang Direkomendasikan** (untuk bahasa Indonesia premium) |

---

## 3. Metodologi Pengujian Model Baru (How to Benchmark)

Bagi developer yang ingin mencoba mengintegrasikan model AI baru (seperti DeepSeek, Gemini, atau model lokal), wajib melakukan uji kelayakan menggunakan 5 variasi draf artikel uji berikut:

1.  **Draf Uji 1 (Premium Human Article)**: Artikel berkualitas tinggi yang ditulis oleh jurnalis profesional Envoyou. Model harus mampu memberikan skor tinggi (>85) dengan verdict `approve` dan minim koreksi.
2.  **Draf Uji 2 (AI-Generated Common Essay)**: Artikel yang sepenuhnya dihasilkan AI mentah dengan pembuka klise *"Di era globalisasi yang serba cepat ini..."* dan struktur Pengertian-Manfaat-Kesimpulan. Model **wajib** memberikan skor <50, memicu minimal 2 indikator kegagalan kritis, dan menandai bendera pelanggaran (*flags*).
3.  **Draf Uji 3 (Opinion Without Data)**: Artikel opini yang menarik tetapi tidak menyajikan satu pun data, statistik, atau referensi pendukung. Model harus mampu mendeteksi ketiadaan data ini dan memberikan status warning pada kategori relevansi kredibilitas.
4.  **Draf Uji 4 (Overly Passive Sentences)**: Artikel dengan tata bahasa Indonesia yang berantakan dan penggunaan kalimat pasif secara berturut-turut. Model harus memberikan umpan balik pada tata bahasa dengan memberikan saran perbaikan (*suggestions*) konkret.
5.  **Draf Uji 5 (Extreme Word Length)**: Draf artikel yang sangat panjang (>15.000 karakter). Model diuji ketahanannya terhadap batas context window dan kemampuannya menyelesaikan ringkasan evaluasi dalam rentang waktu yang wajar.
