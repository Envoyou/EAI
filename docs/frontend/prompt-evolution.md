# Evolusi Prompt (Prompt Evolution)

Dokumen ini mencatat rancangan, riwayat iterasi, kendala teknis, serta solusi rekayasa prompt (*prompt engineering*) yang diterapkan pada Envoyou AI Editorial System.

---

## 1. Versi Saat Ini: v1.3.6

Prompt utama dikelola secara modular pada berkas `src/lib/prompts.ts`. 

### Struktur Utama System Prompt
Prompt yang dikirim ke model kini dibagi ke empat jalur:
1.  **Review Prompt**: ringkas, manual-first, fokus pada 3 masalah/kekuatan utama.
2.  **Rewrite Prompt**: menulis ulang artikel final sebagai plain text, bukan JSON, untuk mengurangi risiko escape dan truncation.
3.  **Final Quality Gate Prompt**: menilai refined draft, merangkum perubahan, dan menghasilkan readiness tanpa skor.
4.  **SEO Prompt**: menghasilkan metadata SEO dalam JSON terpisah.

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
 
### G. Caching & Stabilitas Rekayasa Prompt Riset & Draf (EAI Chat & Draft)
*   **Kendala**: Struktur instruksi asisten riset dan draft kasar cenderung panjang dan dinamis (misalnya menyertakan target bahasa dinamis, sitasi, dan draft mentah), yang menyebabkan caching model (Gemini Context Caching) tidak optimal karena parameter `system_instruction` berubah per permintaan. Selain itu, instruksi sitasi dan batasan menulis sering tersebar di antara input dan system instruction, membagi perhatian model.
*   **Solusi**: Melakukan konsolidasi total seluruh aturan penulisan dan sitasi ke dalam `system_instruction` yang murni statis tanpa template literal dinamis. Nilai dinamis (seperti outputLanguage) diteruskan sebagai parameter metadata terstruktur dalam kueri `input` (ARTICLE METADATA).


---

## 3. Rencana Pengembangan Prompt Masa Depan

*   **POV per Section**: Meminta setiap H2 menyampaikan satu klaim analitis yang jelas, bukan hanya konteks deskriptif.
*   **Post-Rewrite Cleanup Pass**: Menambahkan pass akhir untuk typo, konsistensi istilah, dan perapian heading.
*   **Source URL Enforcement**: Mendorong daftar sumber akhir memakai URL langsung untuk klaim faktual berisiko tinggi, bukan hanya judul referensi.
