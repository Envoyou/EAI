import { describe, expect, it } from 'vitest';
import {
  cleanContentLabel,
  extractArticleTitle,
  isOperationalContentLabel,
} from '@/lib/content-labels';

describe('Content Map article labels', () => {
  it('rejects prompts and editorial review status as article titles', () => {
    expect(
      isOperationalContentLabel(
        'Buatkan saya artikel tentang kebiasaan buruk investment pemula'
      )
    ).toBe(true);
    expect(
      cleanContentLabel(
        'The final draft has been generated, but still requires editor review before export.'
      )
    ).toBeNull();
    expect(
      cleanContentLabel(
        'Closing the Financing Gap for Indonesia’s Energy Transition'
      )
    ).toBe(
      'Closing the Financing Gap for Indonesia’s Energy Transition'
    );
  });

  it('extracts a real markdown article title instead of operational copy', () => {
    expect(
      extractArticleTitle(
        '# A Practical Guide to First-Time Investing\n\nArticle body.'
      )
    ).toBe('A Practical Guide to First-Time Investing');
    expect(
      extractArticleTitle(
        'Draft final masih memerlukan review editor sebelum diekspor.'
      )
    ).toBeNull();
  });
});
