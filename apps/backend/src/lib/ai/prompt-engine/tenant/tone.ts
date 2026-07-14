import { PromptNode, RenderContext } from '@eai/shared';
import type { EditorialProfileConfig } from '@eai/shared/server';

export class ToneCalibrationNode implements PromptNode {
  id = 'tenant:tone_calibration';
  type = 'tenant' as const;
  isStatic = false; // Dinamis berdasarkan data tenant

  constructor(private config: EditorialProfileConfig) {}

  render(context: RenderContext): string {
    const brandName = this.config.brandName || 'Envoyou';
    const tones = this.config.tone ? this.config.tone.join(', ') : 'professional, modern';
    const audience = this.config.audience || 'general';

    let content: string;

    if (brandName !== 'Envoyou') {
      content = `
TONE DIRECTION FOR ${brandName}:
- Use this tone: ${tones}.
- Write for this audience: ${audience}.
- Follow the tenant's positioning and custom editorial profile instructions.
`.trim();
    } else {
      content = `
CORRECT TONE (${brandName}):

[Technology & AI]
✓ "OpenAI just changed the rules of the game, and most AI startups have not caught up yet." / "OpenAI baru saja mengubah aturan main, dan sebagian besar startup AI belum mampu mengejar."
✓ "The number looks small. The implication does not." / "Angkanya tampak kecil. Implikasinya tidak."
✓ "The question is no longer whether AI will reshape this job, but how quickly the shift becomes visible." / "Pertanyaannya bukan lagi apakah AI akan mengubah pekerjaan ini, melainkan seberapa cepat pergeseran itu mulai terlihat."

[Digital Creator]
✓ "Content monetization is no longer just about audience size. It is about who is watching and how deeply they are engaged." / "Monetisasi konten bukan lagi soal ukuran audiens, melainkan siapa yang menonton dan seberapa dalam mereka terlibat."
✓ "Platforms will keep changing. The creators who last are not always the most viral, but the least dependent on a single channel." / "Platform akan terus berubah. Kreator yang bertahan tidak selalu yang paling viral, melainkan yang paling tidak bergantung pada satu saluran."

[Data & Insight]
✓ "The data is not wrong. The way most people read it almost certainly is." / "Datanya tidak salah. Cara kebanyakan orang membacanya yang hampir pasti keliru."
✓ "The trend is obvious on the surface. The interesting part is the small anomaly nobody is asking about." / "Trennya terlihat jelas di permukaan. Bagian yang menarik justru anomali kecil yang tidak ditanyakan siapa pun."

[Finance & Investment]
✓ "This bull run is not only about fundamentals. It is also about who realizes last that risk has changed shape." / "Bull run ini bukan hanya tentang fundamental. Ini juga tentang siapa yang paling terakhir menyadari bahwa risiko telah berubah bentuk."
✓ "Liquidity can make a market look healthy. It can also hide how fragile the assumptions behind valuation have become." / "Likuiditas bisa membuat pasar tampak sehat. Namun, itu juga menyembunyikan betapa rapuhnya asumsi di balik valuasi."

WRONG TONE (Violates brand tone):
✗ "In today's rapidly evolving digital era, it is important for us to..." / "Dalam era transformasi digital yang semakin pesat ini, penting bagi kita..."
✗ "This article will comprehensively discuss..." / "Artikel ini akan membahas secara komprehensif tentang..."
✗ "There is no denying that artificial intelligence is..." / "Tidak dapat dipungkiri bahwa kecerdasan buatan..."
✗ "In conclusion, we can see that..." / "Sebagai kesimpulan, kita dapat melihat bahwa..."
`.trim();
    }

    if (context.format === 'xml') {
      return `<tone_calibration>\n${content}\n</tone_calibration>`;
    }

    return `## Tone Calibration\n${content}`;
  }
}
