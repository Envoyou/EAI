/* eslint-disable @typescript-eslint/no-require-imports */
const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const draft = fs.readFileSync('../log/test-draft-artikel/draft-1.md', 'utf8');

const splitDraftIntoRewriteChunks = (text) => {
  const sections = text.split(/(?=^##\s)/m).map((s) => s.trim()).filter(Boolean);
  const REWRITE_CHUNK_MAX_CHARS = 3500;
  const chunks = [];
  let currentChunk = '';

  for (const section of sections) {
    const candidateChunk = currentChunk ? `${currentChunk}\n\n${section}` : section;
    if (candidateChunk.length > REWRITE_CHUNK_MAX_CHARS && currentChunk) {
      chunks.push(currentChunk);
      currentChunk = section;
    } else {
      currentChunk = candidateChunk;
    }
  }
  if (currentChunk) chunks.push(currentChunk);
  return chunks;
};

const chunks = splitDraftIntoRewriteChunks(draft);
const chunk = chunks[0];

const getRewriteOutputTokens = (text) => {
  const estimatedTokens = Math.ceil(text.length / 3.5);
  return Math.min(Math.max(Math.ceil(estimatedTokens * 2.5) + 1000, 2500), 4500);
};

const chunkInstruction = `Kamu adalah seorang Editor In Chief profesional.
===OVERRIDE WAJIB — CHUNK MODE===
Aturan 'output harus berupa artikel utuh' TIDAK BERLAKU di sini. Kamu memproses SATU CHUNK dari pipeline multi-bagian.
- Chunk ini adalah bagian 1 dari ${chunks.length} bagian total artikel.
- INPUT: Hanya ${chunk.length} karakter. OUTPUT: Maksimal sekitar ${Math.ceil(chunk.length * 1.1)} karakter.
- WAJIB: Tulis HANYA versi polished dari teks yang ada di input chunk ini.
- LARANG KERAS: Jangan tulis heading, section, atau konten yang TIDAK ADA di input chunk ini.
- LARANG KERAS: Jangan melengkapi artikel ke bagian yang belum diberikan.
- BERHENTI menulis segera setelah semua konten dalam input chunk ini selesai di-polish.
- Perbaiki judul, opening, dan setup artikel sekuat mungkin. Jika draft belum punya excerpt yang bagus, kamu boleh menambahkan excerpt singkat setelah judul.`;

async function test() {
  console.log(`Chunk 1 size: ${chunk.length} chars. Max tokens: ${getRewriteOutputTokens(chunk)}`);
  try {
    const res = await gemini.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: `Chunk draft asli:\n\n${chunk}`,
      config: {
        systemInstruction: chunkInstruction,
        maxOutputTokens: getRewriteOutputTokens(chunk)
      }
    });
    console.log("Finish Reason:", res.candidates[0].finishReason);
    console.log("Output Length:", res.text.length);
    console.log("Output:", res.text.slice(0, 100) + "...");
  } catch(e) {
    console.error(e);
  }
}
test();
